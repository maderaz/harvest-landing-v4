// XRP Ledger JSON-RPC client for the rich list pipeline.
//
// WHY a ledger walk rather than an explorer's rich-list endpoint: the same
// reason scripts/lib/onchain.mjs exists for Base and Flare. An explorer's
// distribution is that explorer's dataset, with its own terms and its own
// refresh cadence, and the build spec is explicit that the figures circulating
// on this SERP must not be carried over. A full pass over the ledger's
// AccountRoot objects is nobody's proprietary dataset, and the snapshot time is
// ours to state.
//
// XRPL differs from the EVM chains already wired here in ways that shape this
// file. There are no contracts to call: account balances live directly in the
// ledger's state tree, and `ledger_data` walks that tree a page at a time
// behind an opaque `marker`. There is no batching and no way to ask for one
// field, so the whole AccountRoot comes back and the caller discards what it
// does not need. At roughly 8.5 million funded accounts the walk is a few
// thousand requests, which is why every part of this is built to be resumed
// rather than restarted.

// Public XRPL nodes, tried in order, all speaking JSON-RPC over 443.
//
// The documented JSON-RPC port for Ripple's own servers is 51234, and every
// example on the web uses it, but they answer on 443 as well. That matters
// here: a corporate or sandboxed egress policy allowlists hosts and commonly
// refuses non-standard ports, and 51234 is exactly the port that gets refused.
// Verified against all three with a server_info call before this list was set.
//
// xrpl.ws leads because it fronts Clio, the read-optimised server, and this
// pipeline is nothing but bulk reads. s1 and s2 are Ripple's own full-history
// nodes and serve as independent failover rather than as a second door into
// the same infrastructure.
export const XRPL_ENDPOINTS = [
  "https://xrpl.ws/",
  "https://s1.ripple.com/",
  "https://s2.ripple.com/",
];

export const DROPS_PER_XRP = 1_000_000;

// Every AccountRoot in the ledger is by definition funded: an account cannot
// exist without meeting the base reserve, which validators lowered from 10 XRP
// to 1 XRP in December 2024. So "funded account" needs no balance filter, and
// the count of AccountRoot objects IS the funded account count. Recorded here
// because the page states that definition and it has to match the code.
export const BASE_RESERVE_XRP = 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One JSON-RPC call, failing over across endpoints and backing off on each.
 *
 * Public XRPL nodes answer HTTP 503 with a `{"result":{"error":"..."}}` body
 * rather than a transport error when they shed load, so both shapes are
 * treated as retryable. A `marker`-bearing walk must never silently skip a
 * page, so this throws rather than returning partial data.
 */
export async function xrplRpc(method, params = {}, { tries = 4, timeoutMs = 180_000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    const url = XRPL_ENDPOINTS[attempt % XRPL_ENDPOINTS.length];
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method, params: [params] }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const res = j?.result;
      if (!res) throw new Error("no result");
      if (res.error) throw new Error(`${res.error}: ${res.error_message ?? ""}`.trim());
      if (res.status === "error") throw new Error(res.error_message ?? "rpc error");
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(400 * 2 ** attempt);
    }
  }
  throw lastErr ?? new Error(`xrpl ${method} failed`);
}

/** The newest ledger the cluster considers validated, with its close time. */
export async function validatedLedger() {
  const res = await xrplRpc("ledger", { ledger_index: "validated", accounts: false, transactions: false });
  const l = res.ledger ?? {};
  // close_time is seconds since the Ripple epoch (2000-01-01T00:00:00Z), not
  // the Unix epoch. Getting this wrong dates every snapshot 30 years early.
  const rippleEpoch = Date.UTC(2000, 0, 1) / 1000;
  const closeUnix = Number(l.close_time) + rippleEpoch;
  return {
    ledgerIndex: Number(res.ledger_index ?? l.ledger_index),
    closeIso: new Date(closeUnix * 1000).toISOString(),
    totalDrops: l.total_coins != null ? BigInt(l.total_coins) : null,
  };
}

/**
 * Walk every AccountRoot in one ledger, handing each page to `onPage`.
 *
 * Pinned to a single `ledger_index` so the walk is a consistent snapshot: the
 * ledger closes every three to five seconds, and paging across closes would
 * double-count accounts that moved and miss others entirely.
 *
 * `onPage(entries, state)` is called with the raw AccountRoot objects. Nothing
 * is accumulated here, because 8.5 million accounts held as objects is
 * gigabytes and the caller only needs a few numbers from each.
 *
 * Returns the final marker (null when the walk completed), so an interrupted
 * run can be resumed from a checkpoint instead of starting over.
 */
export async function walkAccounts({
  ledgerIndex,
  onPage,
  // Measured against the live cluster: `limit` bounds the ledger entries the
  // server SCANS, not the AccountRoots it returns, and roughly 42% of the
  // state tree is AccountRoot. A page of 200,000 comes back with ~85,000
  // accounts in about 8 seconds. Throughput is flat from 100,000 upward at
  // ~11,000 accounts a second, so the only thing a bigger page buys is fewer
  // round trips, and it costs response size: 500,000 is a ~70MB JSON body.
  // At 2048, the documented non-admin default, the same walk needs 11,600
  // pages instead of 100.
  limit = 200_000,
  startMarker = null,
  maxPages = Infinity,
  onProgress = null,
}) {
  let marker = startMarker;
  let pages = 0;
  let seen = 0;

  for (;;) {
    const params = {
      ledger_index: ledgerIndex,
      type: "account",
      limit,
      ...(marker ? { marker } : {}),
    };
    const res = await xrplRpc("ledger_data", params);
    const entries = Array.isArray(res.state) ? res.state : [];

    // The type filter is applied server-side, but a page can still come back
    // empty when the filtered slice of the tree held nothing. That is not the
    // end of the walk; only a missing marker is.
    const accounts = entries.filter((e) => e.LedgerEntryType === "AccountRoot");
    if (accounts.length) {
      await onPage(accounts);
      seen += accounts.length;
    }

    pages++;
    marker = res.marker ?? null;
    if (onProgress) onProgress({ pages, seen, marker });
    if (!marker) return { marker: null, pages, seen, done: true };
    if (pages >= maxPages) return { marker, pages, seen, done: false };
  }
}

/**
 * AccountRoot.Domain is hex-encoded ASCII that the account holder set on
 * itself. It is the only identity signal that is both onchain and
 * self-declared, which is exactly the standard the build spec sets for
 * labelling: publicly confirmed, never inferred from behaviour.
 */
export function decodeDomain(hex) {
  if (!hex || typeof hex !== "string") return null;
  const clean = hex.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2) return null;
  let out = "";
  for (let i = 0; i < clean.length; i += 2) {
    const c = parseInt(clean.slice(i, i + 2), 16);
    // Printable ASCII only. A domain with control bytes in it is not a domain.
    if (c < 0x20 || c > 0x7e) return null;
    out += String.fromCharCode(c);
  }
  const trimmed = out.trim().toLowerCase();
  return trimmed.length >= 3 && trimmed.length <= 120 ? trimmed : null;
}

export const dropsToXrp = (drops) => Number(BigInt(drops)) / DROPS_PER_XRP;
