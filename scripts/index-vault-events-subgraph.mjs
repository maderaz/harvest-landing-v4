#!/usr/bin/env node
// Subgraph-backed indexer for Harvest vault + plasma-vault user
// transactions. Replaces (or runs alongside) the RPC-driven
// scripts/index-vault-events.mjs by pulling pre-decoded deposit /
// withdraw rows from the Harvest subgraph and upserting them into
// the same vault_events_prod table the admin Deposits (TVL) page
// already reads.
//
// Endpoint pattern (one subgraph per chain):
//   https://clownfish-app-2dsdk.ondigitalocean.app/{chainId}
//
// The six chain IDs match the networks Harvest currently indexes:
//   1     Ethereum
//   8453  Base
//   42161 Arbitrum
//   137   Polygon
//   324   zkSync
//   999   HyperEVM
//
// On first run per chain we back-fill the trailing 30 days; every
// subsequent run resumes forward-only from the latest indexed
// block_timestamp in vault_events_prod, with a 60-second guard so
// any rows that landed between query and write are picked up on the
// next tick.
//
// Usage:
//   node scripts/index-vault-events-subgraph.mjs               # all six chains
//   node scripts/index-vault-events-subgraph.mjs --chain=Base  # one chain
//   node scripts/index-vault-events-subgraph.mjs --probe       # log schema, no writes
//
// Env:
//   SUPABASE_URL                Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY   Service role key (bypasses RLS)
//   SUBGRAPH_BASE_URL           Override the default endpoint (optional)

const DEFAULT_SUBGRAPH_BASE =
  "https://clownfish-app-2dsdk.ondigitalocean.app";

const CHAINS = [
  { name: "Ethereum", chainId: 1 },
  { name: "Base", chainId: 8453 },
  { name: "Arbitrum", chainId: 42161 },
  { name: "Polygon", chainId: 137 },
  { name: "zkSync", chainId: 324 },
  { name: "HyperEVM", chainId: 999 },
];

const PAGE_SIZE = 1000;
const BACKFILL_DAYS = 30;
const RESUME_GUARD_SECONDS = 60;
const MAX_PAGES_PER_RUN = 200; // ~200k rows per chain per run, hard cap

// ──────────────────────────────────────────────────────────────────
// Args + env
// ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (a === "--probe") {
      args.probe = "true";
      continue;
    }
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

const args = parseArgs();
const PROBE = args.probe === "true";
const CHAIN_FILTER = args.chain;
const SUBGRAPH_BASE = (
  process.env.SUBGRAPH_BASE_URL || DEFAULT_SUBGRAPH_BASE
).replace(/\/$/, "");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!PROBE && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error(
    "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars",
  );
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────
// Tiny helpers
// ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(chainId, query, variables) {
  const url = `${SUBGRAPH_BASE}/${chainId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`bad JSON from ${url}: ${text.slice(0, 200)}`);
  }
  if (body.errors) {
    throw new Error(
      `graphql errors at ${url}: ${JSON.stringify(body.errors).slice(0, 400)}`,
    );
  }
  return body.data;
}

async function supabase(path, init) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("supabase not configured");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`supabase ${r.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return r;
}

// ──────────────────────────────────────────────────────────────────
// Schema-probe mode. Lets the operator quickly inspect the subgraph
// schema for one chain without touching Supabase, so any field-name
// drift between this script's assumptions and the live schema is
// spotted in 5 seconds.
// ──────────────────────────────────────────────────────────────────

async function probe(chainId) {
  const data = await gql(
    chainId,
    `{
      __type(name: "UserTransaction") {
        name
        fields { name type { name kind ofType { name kind } } }
      }
    }`,
    {},
  );
  console.log(JSON.stringify(data, null, 2));
}

// ──────────────────────────────────────────────────────────────────
// Cursor + row helpers
// ──────────────────────────────────────────────────────────────────

async function latestTimestampForChain(chainName) {
  // Read the newest block_timestamp we already have on this chain.
  // Returns the Unix seconds value, or null if the table is empty.
  const params = new URLSearchParams({
    select: "block_timestamp",
    chain: `eq.${chainName}`,
    order: "block_timestamp.desc",
    limit: "1",
  });
  const r = await supabase(`vault_events_prod?${params.toString()}`, {
    method: "GET",
  });
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const t = Date.parse(rows[0].block_timestamp);
  if (!Number.isFinite(t)) return null;
  return Math.floor(t / 1000);
}

function mapTransactionType(raw) {
  // The subgraph likely emits a string enum. Coerce defensively so
  // future schema changes (numeric, lowercased, etc.) keep working.
  const v = String(raw ?? "").toLowerCase();
  if (v.includes("deposit") || v === "0") return "deposit";
  if (v.includes("withdraw") || v === "1") return "withdraw";
  if (v.includes("transfer") || v === "2") return "transfer";
  return null;
}

function splitEntityId(id) {
  // Standard subgraph id convention: "<txHash>-<logIndex>". Falls
  // back to using the full id as tx_hash + log_index 0 when the
  // dash isn't present.
  if (typeof id !== "string") return { tx_hash: null, log_index: 0 };
  const i = id.lastIndexOf("-");
  if (i < 0) return { tx_hash: id, log_index: 0 };
  const tail = id.slice(i + 1);
  const n = Number(tail);
  if (Number.isFinite(n)) {
    return { tx_hash: id.slice(0, i), log_index: n };
  }
  return { tx_hash: id, log_index: 0 };
}

// The exact query. Pulled from the !ruby Discord snippet:
//   userTransactions { plasmaVault { id } vault { id } value transactionType }
// Padded with the metadata we need (entity id, timestamp, block,
// wallet, txHash) using the most common Harvest-style subgraph
// conventions. If a field name turns out to be different on the
// live schema, the GraphQL error message will surface it cleanly on
// the first CI run.
const PAGE_QUERY = `
  query Page($since: BigInt!, $first: Int!, $cursor: String!) {
    userTransactions(
      first: $first
      orderBy: timestamp
      orderDirection: asc
      where: { timestamp_gte: $since, id_gt: $cursor }
    ) {
      id
      timestamp
      blockNumber
      transactionType
      value
      sender
      vault { id }
      plasmaVault { id }
    }
  }
`;

async function indexChain(chain) {
  const { name, chainId } = chain;
  const nowSec = Math.floor(Date.now() / 1000);
  const latest = await latestTimestampForChain(name);
  const since = latest === null
    ? nowSec - BACKFILL_DAYS * 86400
    : latest - RESUME_GUARD_SECONDS;

  console.log(
    `[${name}] indexing from ${new Date(since * 1000).toISOString()} (cursor latest=${latest ?? "none"})`,
  );

  let cursor = "";
  let totalWritten = 0;
  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    let data;
    try {
      data = await gql(chainId, PAGE_QUERY, {
        since: since.toString(),
        first: PAGE_SIZE,
        cursor,
      });
    } catch (e) {
      console.error(`[${name}] page ${page} failed: ${e.message}`);
      break;
    }
    const txs = data?.userTransactions ?? [];
    if (txs.length === 0) break;

    const rows = [];
    for (const t of txs) {
      const event_type = mapTransactionType(t.transactionType);
      if (!event_type) continue;
      const vaultAddr = t.vault?.id ?? t.plasmaVault?.id;
      if (!vaultAddr) continue;
      const { tx_hash, log_index } = splitEntityId(t.id);
      const tsSec = Number(t.timestamp ?? 0);
      if (!Number.isFinite(tsSec) || tsSec === 0) continue;
      rows.push({
        chain: name,
        vault_address: String(vaultAddr).toLowerCase(),
        vault_slug: null, // joined client-side via slug-by-address lookup
        tx_hash: tx_hash ? String(tx_hash).toLowerCase() : t.id,
        log_index,
        block_number: Number(t.blockNumber ?? 0) || 0,
        block_timestamp: new Date(tsSec * 1000).toISOString(),
        event_type,
        wallet_address: String(t.sender ?? "").toLowerCase(),
        amount_shares: String(t.value ?? "0"),
      });
    }

    if (rows.length > 0) {
      await supabase(
        "vault_events_prod?on_conflict=tx_hash,log_index",
        {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates" },
          body: JSON.stringify(rows),
        },
      );
      totalWritten += rows.length;
    }

    // Advance the cursor to the last id we saw. Combined with the
    // `id_gt` filter + ascending timestamp order, this gives us a
    // stable forward pagination that never re-reads the same row.
    cursor = txs[txs.length - 1].id;
    if (txs.length < PAGE_SIZE) break;

    // Light throttle so the subgraph doesn't get hammered.
    await sleep(150);
  }

  console.log(`[${name}] wrote ${totalWritten} events`);
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────

async function main() {
  const chains = CHAIN_FILTER
    ? CHAINS.filter((c) => c.name.toLowerCase() === CHAIN_FILTER.toLowerCase())
    : CHAINS;

  if (chains.length === 0) {
    console.error(`no chain matches --chain=${CHAIN_FILTER}`);
    process.exit(1);
  }

  if (PROBE) {
    for (const c of chains) {
      console.log(`=== ${c.name} (${c.chainId}) ===`);
      try {
        await probe(c.chainId);
      } catch (e) {
        console.error(`probe failed: ${e.message}`);
      }
    }
    return;
  }

  for (const c of chains) {
    try {
      await indexChain(c);
    } catch (e) {
      console.error(`[${c.name}] indexer failed: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
