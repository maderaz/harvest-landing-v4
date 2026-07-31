#!/usr/bin/env node
// Builds data/xrp-richlist.json for /xrp-rich-list.
//
// One pass over every AccountRoot object in a single validated ledger,
// streamed into a histogram rather than collected, then written out as tier
// thresholds, a balance ladder the browser can interpolate, decade bands for
// the chart, and the largest 100 accounts.
//
// Pinned to one ledger index for the whole walk. XRPL closes a ledger every
// three to five seconds, so paging across closes would count accounts that
// moved twice and miss others entirely, and the resulting "snapshot" would
// describe no state that ever existed.
//
// Runtime is a few thousand requests against public clusters, so the walk
// checkpoints its marker and its histogram every N pages. A run that dies at
// 80% resumes instead of starting over.
//
// Usage:
//   node scripts/fetch-xrpl-richlist.mjs              full walk
//   node scripts/fetch-xrpl-richlist.mjs --resume     continue from checkpoint
//   node scripts/fetch-xrpl-richlist.mjs --max-pages=20 --dry   smoke test

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  validatedLedger,
  walkAccounts,
  decodeDomain,
  dropsToXrp,
  xrplRpc,
  BASE_RESERVE_XRP,
} from "./lib/xrpl.mjs";
import { Distribution, BUCKETS_PER_DECADE } from "./lib/richlist-distribution.mjs";
import { freezeStampIfUnchanged } from "./lib/snapshot-stamp.mjs";

const ROOT = process.cwd();
const OUT_FILE = join(ROOT, "data", "xrp-richlist.json");
const YIELD_FILE = join(ROOT, "data", "xrp-yield.json");
const CKPT_FILE = join(ROOT, ".cache", "xrpl-richlist-checkpoint.json");

const argVal = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const RESUME = process.argv.includes("--resume");
// Re-runs only the top-account enrichment against the snapshot already on
// disk. The walk is the expensive part and the enrichment is 100 calls, so
// iterating on the column should not cost eleven minutes.
const ENRICH_ONLY = process.argv.includes("--enrich-only");
const DRY = process.argv.includes("--dry");
const MAX_PAGES = Number(argVal("max-pages", Infinity));
const CKPT_EVERY = Number(argVal("checkpoint-every", 20));
const TOP_N = Number(argVal("top", 100));

// ---------------------------------------------------------------- checkpoint

function saveCheckpoint(state) {
  mkdirSync(dirname(CKPT_FILE), { recursive: true });
  writeFileSync(
    CKPT_FILE,
    JSON.stringify({
      ledgerIndex: state.ledgerIndex,
      closeIso: state.closeIso,
      marker: state.marker,
      pages: state.pages,
      total: state.dist.total,
      sumXrp: state.dist.sumXrp,
      counts: Array.from(state.dist.counts),
      exact: [...state.dist.exact],
      top: state.dist.topAccounts(),
    }),
  );
}

function loadCheckpoint(dist) {
  if (!existsSync(CKPT_FILE)) return null;
  const c = JSON.parse(readFileSync(CKPT_FILE, "utf-8"));
  dist.counts = Float64Array.from(c.counts);
  dist.total = c.total;
  dist.sumXrp = c.sumXrp;
  dist.exact = new Map(c.exact);
  dist.top = c.top.map((t) => ({ ...t }));
  return c;
}

// ---------------------------------------------------------------------- walk

if (ENRICH_ONLY) {
  const cur = JSON.parse(readFileSync(OUT_FILE, "utf-8"));
  const enriched = await enrichTop(cur.ledgerIndex, cur.top);
  cur.top = enriched;
  cur.topLabelled = enriched.filter((t) => t.domain).length;
  cur.topWithEscrow = enriched.filter((t) => t.escrows > 0).length;
  writeFileSync(OUT_FILE, JSON.stringify(cur, null, 2) + "\n");
  console.error(
    `[richlist] enriched ${enriched.length} top accounts: ${cur.topLabelled} with a domain, ${cur.topWithEscrow} holding escrow`,
  );
  process.exit(0);
}

const dist = new Distribution({ topN: TOP_N });

let ledgerIndex;
let closeIso;
let totalSupplyDrops = null;
let startMarker = null;
let pagesDone = 0;

const resumed = RESUME ? loadCheckpoint(dist) : null;
if (resumed) {
  ledgerIndex = resumed.ledgerIndex;
  closeIso = resumed.closeIso;
  startMarker = resumed.marker;
  pagesDone = resumed.pages;
  console.error(
    `[richlist] resuming ledger ${ledgerIndex} at page ${pagesDone}, ${resumed.total.toLocaleString()} accounts so far`,
  );
} else {
  const l = await validatedLedger();
  ledgerIndex = l.ledgerIndex;
  closeIso = l.closeIso;
  totalSupplyDrops = l.totalDrops;
  console.error(`[richlist] ledger ${ledgerIndex} closed ${closeIso}`);
}

const t0 = Date.now();
const result = await walkAccounts({
  ledgerIndex,
  startMarker,
  maxPages: MAX_PAGES,
  onPage: (accounts) => {
    for (const a of accounts) {
      const d = a.Balance;
      if (d == null) continue;
      dist.add(dropsToXrp(d), {
        address: a.Account,
        // Self-declared and onchain. Anything absent stays unlabelled rather
        // than being guessed at from transaction behaviour.
        domain: decodeDomain(a.Domain),
      });
    }
  },
  onProgress: ({ pages, seen, marker }) => {
    const n = pagesDone + pages;
    if (n % 5 === 0) {
      const rate = dist.total / ((Date.now() - t0) / 1000);
      console.error(
        `[richlist] page ${n}, ${dist.total.toLocaleString()} accounts, ${Math.round(rate).toLocaleString()}/s`,
      );
    }
    if (n % CKPT_EVERY === 0) {
      saveCheckpoint({ ledgerIndex, closeIso, marker, pages: n, dist });
    }
  },
});

pagesDone += result.pages;

if (!result.done) {
  saveCheckpoint({ ledgerIndex, closeIso, marker: result.marker, pages: pagesDone, dist });
  console.error(
    `[richlist] stopped after ${pagesDone} pages with a marker outstanding; rerun with --resume`,
  );
  if (!DRY) process.exit(0);
}

// ---------------------------------------------------------------- enrichment

// What the top accounts publish about themselves, checked against the ledger.
//
// The build spec expects the labels to be the whole point of the top-100 table,
// on the reasoning that an explorer shows addresses and we would show
// "Binance cold wallet". Contact with the data says otherwise: not one of the
// hundred largest accounts sets a Domain, which is the only identity field an
// account can publish about itself onchain. Naming them anyway would mean
// inferring identity from transaction behaviour, which the same spec forbids
// and which the XRP community would falsify within the hour.
//
// So the column reports what the ledger actually says. A Domain when there is
// one, and the account's escrow position when it holds one, which is a fact
// about its onchain state rather than a claim about who owns it. That
// distinction is the difference between a table that is useful and one that is
// wrong in public.
async function enrichTop(ledgerIdx, list) {
  const out = [];
  for (const t of list) {
    let escrows = 0;
    let escrowedDrops = 0n;
    let marker = null;
    let pages = 0;
    try {
      do {
        const r = await xrplRpc("account_objects", {
          account: t.address,
          ledger_index: ledgerIdx,
          type: "escrow",
          limit: 400,
          ...(marker ? { marker } : {}),
        });
        for (const o of r.account_objects ?? []) {
          if (o.LedgerEntryType !== "Escrow") continue;
          escrows++;
          if (typeof o.Amount === "string") escrowedDrops += BigInt(o.Amount);
        }
        marker = r.marker ?? null;
        pages++;
        // Ripple's escrow accounts hold hundreds of objects. Cap the paging so
        // one unusual account cannot stall the whole enrichment pass.
      } while (marker && pages < 12);
    } catch {
      // An account that will not answer keeps its row and loses the column,
      // which is better than dropping it out of the ranking.
    }
    out.push({
      ...t,
      escrows,
      escrowedXrp: escrows ? Math.round(Number(escrowedDrops) / 1e6) : 0,
    });
  }
  return out;
}

// ------------------------------------------------------------- reconciliation

// The build spec asks for one comparison nobody else on this SERP can make:
// how many XRP holders actually earn a yield. The two populations are NOT the
// same kind of thing and the wording has to survive that. An XRPL AccountRoot
// is an account on the XRP Ledger. A yield-product holder is an address on
// Flare or Base holding a wrapped or staked XRP receipt token. One person can
// be both, or several of either. So the numbers are reported as two scoped
// counts and a ratio between them, never as a subset claim.
function yieldHolders() {
  if (!existsSync(YIELD_FILE)) return null;
  try {
    const y = JSON.parse(readFileSync(YIELD_FILE, "utf-8"));
    const rows = (y.pools ?? []).filter((p) => p.holders?.count > 0);
    if (!rows.length) return null;
    const asOf = rows
      .map((p) => p.holders.asOf)
      .filter(Boolean)
      .sort()
      .pop();
    return {
      // A sum of per-product holder counts. An address holding two products is
      // counted twice, which makes this an upper bound on distinct holders and
      // therefore a conservative input to "how few earn anything".
      receiptTokenHolders: rows.reduce((s, p) => s + p.holders.count, 0),
      products: rows.length,
      asOf: asOf ?? null,
      basis: "sum of per-product receipt-token holder counts on Flare and Base, not deduplicated across products",
    };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------- assemble

const tiers = dist.tiers();
const ladder = dist.ladder({ perDecade: 40 });
const bands = dist.bands();
const top = await enrichTop(
  ledgerIndex,
  dist.topAccounts().map((t) => ({
    rank: t.rank,
    address: t.address,
    xrp: t.xrp,
    pctOfSupply: dist.sumXrp ? Math.round((t.xrp / dist.sumXrp) * 1e6) / 1e4 : 0,
    domain: t.domain ?? null,
  })),
);

const labelled = top.filter((t) => t.domain).length;
const withEscrow = top.filter((t) => t.escrows > 0).length;

const payload = {
  generatedAt: new Date().toISOString(),
  source: "xrpl-ledger-walk",
  ledgerIndex,
  ledgerCloseIso: closeIso,
  method: {
    description:
      "One pass over every AccountRoot object in a single validated XRP Ledger, read from public XRPL nodes over JSON-RPC. Balances are aggregated into a log-spaced histogram as they stream, so no third-party rich list or explorer dataset is involved.",
    bucketsPerDecade: BUCKETS_PER_DECADE,
    // The number the methodology section quotes, derived rather than asserted.
    thresholdRelativeErrorPct: Math.round((10 ** (1 / BUCKETS_PER_DECADE) - 1) * 1e6) / 1e4,
    fundedAccountDefinition: `Every AccountRoot in the ledger. An XRP Ledger account cannot exist without meeting the base reserve, which validators lowered to ${BASE_RESERVE_XRP} XRP in December 2024, so the count of AccountRoot objects is the count of funded accounts.`,
    labelPolicy:
      "Top accounts are labelled only from the AccountRoot Domain field, which the account holder sets on itself onchain. Accounts with no Domain are shown unlabelled. No identity is inferred from transaction behaviour.",
  },
  accounts: dist.total,
  xrpHeld: Math.round(dist.sumXrp),
  totalSupplyXrp: totalSupplyDrops != null ? Math.round(Number(totalSupplyDrops) / 1e6) : null,
  tiers,
  exactCounts: dist.exactCounts(),
  bands,
  ladder,
  top,
  topLabelled: labelled,
  topWithEscrow: withEscrow,
  yieldComparison: yieldHolders(),
};

// Threshold history. Nobody on this SERP shows how the top 10% cutoff has
// moved, and it is the reason to come back to the page next month, which is
// worth more than any single visit. One row per UTC day, the last walk of the
// day winning, capped so the snapshot cannot grow without limit.
{
  const prevHist = existsSync(OUT_FILE)
    ? (JSON.parse(readFileSync(OUT_FILE, "utf-8")).thresholdHistory ?? [])
    : [];
  const day = payload.ledgerCloseIso.slice(0, 10);
  const row = {
    d: day,
    accounts: payload.accounts,
    xrpHeld: payload.xrpHeld,
    tiers: Object.fromEntries(tiers.map((t) => [String(t.pct), t.minXrp])),
  };
  payload.thresholdHistory = [...prevHist.filter((h) => h.d !== day), row]
    .sort((a, b) => (a.d < b.d ? -1 : 1))
    .slice(-400);
}

if (DRY) {
  console.error(
    `[richlist] DRY: ${dist.total.toLocaleString()} accounts over ${pagesDone} pages, ` +
      `top1% ${tiers.find((t) => t.pct === 1)?.minXrp} XRP, ladder ${ladder.length} pts, ${labelled}/${top.length} labelled`,
  );
  process.exit(0);
}

// Freeze the stamp when nothing moved, the same guard the XRP report uses, so
// an idle rerun leaves the file byte-identical and the page's "Updated" line
// does not advance on data that did not change.
const prev = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, "utf-8")) : null;
const out = freezeStampIfUnchanged(prev, payload);

writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n");
console.error(
  `[richlist] ${dist.total.toLocaleString()} funded accounts, ` +
    `${Math.round(dist.sumXrp).toLocaleString()} XRP, ledger ${ledgerIndex} -> ${OUT_FILE}`,
);
