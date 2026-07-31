#!/usr/bin/env node
// Landscape TVL aggregator for /report/xrp-yield-ranking.
//
// WHY: the report tracks the whole XRP-denominated DeFi yield landscape, and we
// want one honest "total TVL over time" series showing how that landscape grew.
//
// Every point on the daily line is now the venue's own contract state, read at
// an archive block by scripts/backfill-xrp-tvl-onchain.mjs and stored as
// `history[].tvl` on each pool. This script only aggregates what is already in
// the file, so it needs no network at all.
//
// It used to work differently, and the difference is worth recording. The
// per-pool branch was gated on the row carrying a DeFiLlama pool UUID as its
// `id`. After the migration to onchain sourcing no row had one, so every
// pool-indexed venue silently dropped out and the entire line came from one
// DeFiLlama call (/protocol/upshift). That left the chart covering 48% of
// tracked capital while the Method section claimed no aggregator was used. The
// gate is now "does this row have a daily TVL series", which is the property
// the aggregation actually depends on.
//
// Spectra's PT/LP markets are still excluded from the daily line: they are
// priced through the Spectra API rather than a single contract read, so there
// is no archive block to read them at. Their current TVL is reported as a
// snapshot remainder alongside the line, never blended into it. A Spectra PT
// and its pool share the same liquidity, so the PT rows are dropped from
// totals to avoid counting it twice.
//
// The series is written to data/xrp-yield.json as `landscape` for the page to
// render with no network at build/render time. Runs after fetch-xrp-yield +
// apply-xrp-overrides + backfill-xrp-tvl-onchain.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { freezeStampIfUnchanged } from "./lib/snapshot-stamp.mjs";
import { loadVenues } from "./apply-xrp-overrides.mjs";
import { canBackfillTvl } from "./lib/xrp-tvl-history.mjs";

const ROOT = process.cwd();
const DATA_FILE = join(ROOT, "data", "xrp-yield.json");

const data = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
const pools = Array.isArray(data.pools) ? data.pools : [];

// The basis label comes from the venue registry rather than from the row's
// `source` field, so it says how the points were actually produced even on a
// snapshot written before the row switched to onchain sourcing.
const venueBySlug = new Map(loadVenues().map((v) => [v.slug, v]));
const basisOf = (p) =>
  canBackfillTvl(venueBySlug.get(p.venueSlug)?.source) ? "onchain" : "snapshot";

// A Spectra PT and its pool share the same liquidity, so the PT's TVL mirrors
// the pool's — count it once (via the pool) so totals aren't double-counted.
const tvlCounts = (p) => !String(p.venueSlug || p.id || "").startsWith("spectra-pt-");

// 1) Every row carrying a daily TVL series contributes one series. Keyed by
// venue slug rather than platform: Upshift runs two separate XRP vaults, and
// collapsing them onto the platform name would drop one of them.
const MIN_POINTS = 2;
const venueSeries = [];
const seriesSlugs = new Set();
for (const p of pools) {
  if (!tvlCounts(p)) continue;
  const hist = (p.history || [])
    .filter((h) => h && h.d && Number.isFinite(h.tvl) && h.tvl > 0)
    .map((h) => ({ d: h.d, tvl: h.tvl }));
  if (hist.length < MIN_POINTS) continue;
  venueSeries.push({
    venue: p.venueSlug || p.platform,
    kind: basisOf(p),
    hist,
  });
  seriesSlugs.add(p.venueSlug || p.id);
}

// 2) Snapshot-only remainder: rows with no daily series (the Spectra markets).
// Their current TVL is real and belongs in today's total, but we do NOT
// fabricate a trajectory for it — it is reported as a number beside the line,
// never blended into it.
const remainder = pools
  .filter(
    (p) =>
      tvlCounts(p) &&
      !seriesSlugs.has(p.venueSlug || p.id) &&
      Number.isFinite(p.tvlUsd) &&
      p.tvlUsd > 0,
  )
  .reduce((sum, p) => sum + p.tvlUsd, 0);

if (!venueSeries.length) {
  console.error("[landscape] no venue series; leaving data.landscape untouched.");
  process.exit(0);
}

// Union of all dates; each venue forward-filled from its own inception (it
// contributes 0 before its first indexed day — the landscape did not include it
// yet). The daily line is ONLY the venues with a real XRP-clean series; the
// snapshot remainder is reported alongside, never blended in.
const allDates = [...new Set(venueSeries.flatMap((s) => s.hist.map((h) => h.d)))].sort();
const cursors = venueSeries.map(() => ({ i: 0, last: null }));
const series = allDates.map((d) => {
  let sum = 0;
  venueSeries.forEach((s, k) => {
    const c = cursors[k];
    while (c.i < s.hist.length && s.hist[c.i].d <= d) {
      c.last = s.hist[c.i].tvl;
      c.i++;
    }
    if (c.last != null) sum += c.last;
  });
  return { d, tvl: Math.round(sum) };
});

// Trim the leading near-zero tail so the chart starts where the landscape
// meaningfully exists (>= 1% of current), keeping the ramp visible without a
// long flat run at the axis.
const currentTotal = pools.filter(tvlCounts).reduce((s, p) => s + (p.tvlUsd || 0), 0);
const floor = currentTotal * 0.01;
const startIdx = series.findIndex((p) => p.tvl >= floor);
const trimmed = series.slice(startIdx === -1 ? 0 : startIdx);

const first = trimmed[0];
const peak = trimmed.reduce((m, p) => (p.tvl > m.tvl ? p : m), trimmed[0]);
const last = trimmed[trimmed.length - 1];
const coveragePct = Math.round((last.tvl / currentTotal) * 100);

// Stamp is frozen when the series and coverage are unchanged, so an idle daily
// run leaves the file byte-identical and the report's "Last updated" date does
// not advance on data that did not move. See scripts/lib/snapshot-stamp.mjs.
data.landscape = freezeStampIfUnchanged(data.landscape, {
  generatedAt: new Date().toISOString(),
  note:
    "Daily-indexed XRP-denominated DeFi TVL. Every point on the line is the venue's own contract state read at an archive block on Base or Flare, priced with Flare's FTSOv2 XRP/USD feed at that same block. Each venue enters the line on its first day of onchain history, so the earliest part of the series covers fewer venues than the latest. The line is the measured window rather than all time, and it starts where the backfill starts. Spectra's PT and LP markets are priced through the Spectra API rather than a single contract read, so they are reported as a snapshot alongside the line rather than blended into it. Values are in USD, so a move in the XRP price moves the line even when no capital enters or leaves.",
  coverage: venueSeries.map((s) => ({ venue: s.venue, basis: s.kind, points: s.hist.length })),
  indexedShareOfTotalPct: coveragePct,
  snapshotRemainderUsd: Math.round(remainder),
  currentTotalUsd: Math.round(currentTotal),
  start: { d: first.d, tvl: first.tvl },
  peak: { d: peak.d, tvl: peak.tvl },
  latest: { d: last.d, tvl: last.tvl },
  series: trimmed,
});

writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
console.log(
  `[landscape] ${trimmed.length} days ${first.d}→${last.d} | start $${first.tvl.toLocaleString()} · peak $${peak.tvl.toLocaleString()} (${peak.d}) · latest $${last.tvl.toLocaleString()} (${coveragePct}% of $${Math.round(currentTotal).toLocaleString()} total) | venues: ${venueSeries.map((s) => s.venue).join(", ")} | snapshot remainder $${Math.round(remainder).toLocaleString()}`,
);
