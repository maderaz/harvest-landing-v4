#!/usr/bin/env node
// Backfill daily TVL for every onchain-sourced XRP venue by reading contract
// state at archive blocks, and write it into data/xrp-yield.json's per-pool
// `history[].tvl`.
//
// WHY: build-xrp-landscape.mjs plots a daily line from those points. Before
// this, the only venue with a usable series was Upshift, and it came from
// DeFiLlama's /protocol endpoint rather than from chain state, so the chart
// covered 48% of tracked capital and the pipeline still had an aggregator in
// it. Base and Flare both answer eth_call at 90-day-old blocks (verified), so
// the series can be reconstructed instead of waited for.
//
// Idempotent. Existing points are kept unless --overwrite is passed; days the
// venue did not exist for are skipped rather than written as zero.
//
// Usage:
//   node scripts/backfill-xrp-tvl-onchain.mjs [--days=90] [--overwrite] [--only=slug,slug]

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadVenues } from "./apply-xrp-overrides.mjs";
import { dayBlockMap, tvlAtBlock, canBackfillTvl, xrpUsdAt, dstr } from "./lib/xrp-tvl-history.mjs";

const ROOT = process.cwd();
const DATA_FILE = join(ROOT, "data", "xrp-yield.json");

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const DAYS = Number(arg("days", 90));
const OVERWRITE = process.argv.includes("--overwrite");
const ONLY = arg("only", null)?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

const NOW = Math.floor(Date.now() / 1000);

// Run a list of thunks with a bounded number in flight. Public RPCs tolerate a
// handful of concurrent reads; opening 90 at once gets the run rate-limited and
// is slower end to end.
async function pooled(thunks, width = 6) {
  const out = new Array(thunks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, thunks.length) }, async () => {
      while (next < thunks.length) {
        const i = next++;
        out[i] = await thunks[i]();
      }
    }),
  );
  return out;
}

const data = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
const pools = Array.isArray(data.pools) ? data.pools : [];
const venues = await loadVenues();
const bySlug = new Map(venues.map((v) => [v.slug, v]));

const targets = pools.filter((p) => {
  const v = bySlug.get(p.venueSlug);
  if (!v || !canBackfillTvl(v.source)) return false;
  return !ONLY || ONLY.includes(p.venueSlug);
});

if (!targets.length) {
  console.error("[tvl-backfill] nothing to backfill.");
  process.exit(0);
}

const chainsNeeded = new Set(
  targets.map((p) => {
    const s = bySlug.get(p.venueSlug).source;
    return s.chain ?? (["aerodrome", "compound-moonwell"].includes(s.protocol) ? "base" : "flare");
  }),
);

console.error(
  `[tvl-backfill] ${targets.length} venues, ${DAYS} days, chains: ${[...chainsNeeded].join(", ")}`,
);

// 1) Day -> block per chain. Resolved once and shared across every venue on
// that chain, which is most of the request budget.
const blockMaps = new Map();
for (const chain of chainsNeeded) {
  const t0 = Date.now();
  blockMaps.set(chain, await dayBlockMap(chain, DAYS, NOW));
  console.error(
    `[tvl-backfill] ${chain}: ${blockMaps.get(chain).size} day blocks in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}

// 2) XRP/USD per day, read from Flare's FTSOv2 at that day's block. One
// reference price is applied to every XRP-denominated leg on both chains, the
// same way the live pipeline does it, so historical and current points sit on
// the same basis.
const flareBlocks = blockMaps.get("flare") ?? (await dayBlockMap("flare", DAYS, NOW));
const days = [...flareBlocks.keys()].sort();
const xrpByDay = new Map();
{
  const t0 = Date.now();
  const prices = await pooled(
    days.map((d) => async () => {
      try {
        const p = await xrpUsdAt(flareBlocks.get(d));
        return Number.isFinite(p) && p > 0.05 && p < 100 ? p : null;
      } catch {
        return null;
      }
    }),
  );
  days.forEach((d, i) => prices[i] != null && xrpByDay.set(d, prices[i]));
  console.error(
    `[tvl-backfill] XRP/USD: ${xrpByDay.size}/${days.length} days in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}

// Carry the nearest known price forward so one flaky oracle read does not punch
// a hole in every venue's series on that day.
let carried = null;
for (const d of days) {
  if (xrpByDay.has(d)) carried = xrpByDay.get(d);
  else if (carried != null) xrpByDay.set(d, carried);
}

// 3) Per venue, per day.
let totalWritten = 0;
for (const p of targets) {
  const src = bySlug.get(p.venueSlug).source;
  const chain = src.chain ?? (["aerodrome", "compound-moonwell"].includes(src.protocol) ? "base" : "flare");
  const bm = blockMaps.get(chain);
  const hist = Array.isArray(p.history) ? p.history : [];
  const byDay = new Map(hist.map((h) => [h.d, { ...h }]));

  const t0 = Date.now();
  const results = await pooled(
    days.map((d) => async () => {
      const existing = byDay.get(d);
      if (!OVERWRITE && existing && Number.isFinite(existing.tvl)) return { d, skip: true };
      const block = bm.get(d);
      const xrp = xrpByDay.get(d);
      if (block == null || xrp == null) return { d, tvl: null };
      const tvl = await tvlAtBlock(src, { block, xrp });
      return { d, tvl: Number.isFinite(tvl) && tvl > 0 ? Math.round(tvl) : null };
    }),
  );

  let written = 0;
  for (const r of results) {
    if (r.skip || r.tvl == null) continue;
    const row = byDay.get(r.d) ?? { d: r.d, apy: null };
    row.tvl = r.tvl;
    byDay.set(r.d, row);
    written++;
  }
  p.history = [...byDay.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
  totalWritten += written;

  const withTvl = p.history.filter((h) => Number.isFinite(h.tvl));
  console.error(
    `[tvl-backfill] ${p.venueSlug.padEnd(24)} +${String(written).padStart(3)} pts ` +
      `(${withTvl.length} total, ${withTvl[0]?.d ?? "-"} -> ${withTvl[withTvl.length - 1]?.d ?? "-"}) ` +
      `${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}

if (!totalWritten) {
  console.error("[tvl-backfill] no new points; file untouched.");
  process.exit(0);
}

writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
console.error(`[tvl-backfill] wrote ${totalWritten} points -> ${DATA_FILE}`);
