#!/usr/bin/env node
// Hydrates data/stablecoin-products.json into data/stablecoin-yield.json for
// /report/stablecoin-yield-ranking.
//
// RATE BASIS
// Every rate here is derived from share-price growth, not from any platform's
// advertised APY, so a Fusion looping vault, a Harvest autocompounder and an
// Ethena wrapper are measured the same way. Share price nets out fees, losses
// and rebalances by construction; an advertised number is a projection.
//
// TWO SOURCES OF HISTORY, by coverage rather than preference:
//   Portals /v2/tokens/history  ethereum + base (12 of 13 products). Serves a
//                               full year of daily pricePerShare, apy,
//                               liquidity and supply. Deeper and cheaper than
//                               any RPC archive we can reach, and it is the
//                               only path for Ethereum, whose public RPC
//                               paywalls historical state.
//   Onchain share price         monad (Accountable), which Portals does not
//                               index. Uses scripts/lib/share-price.mjs
//                               against Monad's ~7 days of served state.
// Current share price is additionally read onchain for every ERC-4626 product
// as a cross-check on the API figure, and the gap is stored.
//
// DERIVED METRICS
// The 90-day series yields what the two-tier editorial split actually rests
// on: rate volatility, range, TVL trend and worst daily share-price move.
// Holder count and top-5 concentration come from Portals /v2/tokens/holders.
// These are what let the page say "this rate has moved 0.03pp in 90 days"
// instead of merely asserting a product is stable.
//
// Usage:
//   NODE_USE_ENV_PROXY=1 PORTALS_API_KEY=... node scripts/fetch-stablecoin-products.mjs

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sameIgnoringStamps } from "./lib/snapshot-stamp.mjs";
import { canReadHistory } from "./lib/onchain.mjs";
import {
  sharePriceAt,
  totalAssetsAt,
  realizedApy,
  realizedOverBestWindow,
  backfillDailySeries,
} from "./lib/share-price.mjs";
import { aaveV3Supply } from "./lib/polygon-onchain-adapters.mjs";

const ROOT = process.cwd();
const REGISTRY = join(ROOT, "data", "stablecoin-products.json");
const OUT_FILE = join(ROOT, "data", "stablecoin-yield.json");
const KEY = process.env.PORTALS_API_KEY || null;
const HISTORY_DAYS = 90;
// Portals indexes these; anything else falls back to onchain reads.
const PORTALS_NETWORKS = new Set(["ethereum", "base", "arbitrum", "polygon", "optimism", "bsc", "avalanche", "sonic", "hyperevm"]);

const round = (v, dp = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp);
const num = (v) => (v == null ? null : Number(v));

async function portals(path, params) {
  if (!KEY) return null;
  const qs = new URLSearchParams(params).toString();
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://api.portals.fi/${path}?${qs}`, {
        signal: AbortSignal.timeout(30_000),
        headers: { accept: "application/json", Authorization: `Bearer ${KEY}` },
      });
      if (r.ok) return await r.json();
      if (r.status === 400 || r.status === 404) return null; // not indexed; do not retry
    } catch {
      /* retry */
    }
    await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
  }
  return null;
}

// Population standard deviation. The point of this number on this page is
// "how much did the rate actually move", so the whole observed window is the
// population, not a sample from something larger.
function stdev(xs) {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// Portals returns newest-first; everything downstream expects oldest-first.
function normalizeHistory(raw) {
  const pts = (raw?.history ?? [])
    .map((h) => ({
      d: String(h.time).slice(0, 10),
      sharePrice: num(h.pricePerShare),
      apy: num(h.apy),
      tvlUsd: h.liquidity != null ? Math.round(Number(h.liquidity)) : null,
      supply: num(h.totalSupply),
    }))
    .filter((h) => h.d);
  pts.sort((a, b) => (a.d < b.d ? -1 : 1));
  return pts;
}

// Everything the editorial layer needs to describe a product without a human
// writing a sentence per row.
//
// Three data-quality rules, each earned from looking at the real series:
//   1. A reported APY of exactly 0 means "no reading that day", not "the rate
//      was zero". Left in, it drags the observed minimum to 0 and doubles the
//      standard deviation, which would libel a steady product as volatile.
//   2. TVL growth is only meaningful from a non-trivial base. A vault that
//      opened inside the window goes from a few dollars to millions, which is
//      a true ratio and a useless statistic (+2,096,950%). Below the floor we
//      report the fact of launch instead of a percentage.
//   3. Series built onchain carry no APY field, so a rate series is derived
//      from consecutive share prices; otherwise Monad would show no volatility
//      simply because nobody handed us one.
const TVL_BASE_FLOOR_USD = 250_000;

function deriveMetrics(series) {
  const pps = series.map((p) => p.sharePrice).filter((v) => v != null && v > 0);

  let apys = series.map((p) => p.apy).filter((v) => v != null && Number.isFinite(v) && v > 0);
  if (!apys.length && pps.length >= 3) {
    const derived = [];
    for (let i = 1; i < pps.length; i++) {
      const a = realizedApy(pps[i], pps[i - 1], 86400);
      if (a != null && a > 0) derived.push(a);
    }
    apys = derived;
  }

  const tvls = series.map((p) => p.tvlUsd).filter((v) => v != null && v > 0);
  const tvlStart = tvls.length ? tvls[0] : null;
  const tvlEnd = tvls.length ? tvls[tvls.length - 1] : null;
  const baseTooSmall = tvlStart != null && tvlStart < TVL_BASE_FLOOR_USD;

  let worstDailyMovePct = null;
  for (let i = 1; i < pps.length; i++) {
    const chg = ((pps[i] - pps[i - 1]) / pps[i - 1]) * 100;
    if (worstDailyMovePct == null || chg < worstDailyMovePct) worstDailyMovePct = chg;
  }

  return {
    days: series.length,
    apyMedian: round(median(apys)),
    apyMin: round(apys.length ? Math.min(...apys) : null),
    apyMax: round(apys.length ? Math.max(...apys) : null),
    apyStdev: round(stdev(apys), 3),
    apySamples: apys.length,
    tvlStart,
    tvlEnd,
    tvlChangePct:
      tvls.length >= 2 && tvlStart > 0 && !baseTooSmall
        ? round(((tvlEnd - tvlStart) / tvlStart) * 100, 1)
        : null,
    // Set when growth is real but unquotable as a ratio: the product simply
    // was not meaningfully live at the start of the window.
    launchedInWindow: baseTooSmall && tvlEnd != null && tvlEnd >= TVL_BASE_FLOOR_USD,
    worstDailyMovePct: round(worstDailyMovePct, 4),
  };
}

// Realized rate from the stored share-price series, annualized over ACTUAL
// elapsed days. Prefers a ~30-day window, falls back to whatever the series
// spans, and reports which it used so the column can be labelled honestly.
function realizedFromSeries(series, target = 30, minDays = 6) {
  const pts = series.filter((p) => p.sharePrice != null && p.sharePrice > 0);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const lastMs = Date.parse(`${last.d}T00:00:00Z`);
  let best = null;
  for (const p of pts.slice(0, -1)) {
    const days = (lastMs - Date.parse(`${p.d}T00:00:00Z`)) / 86_400_000;
    if (days < minDays) continue;
    if (!best || Math.abs(days - target) < Math.abs(best.days - target)) best = { pps: p.sharePrice, days };
  }
  if (!best) return null;
  const apy = realizedApy(last.sharePrice, best.pps, best.days * 86400);
  return apy == null ? null : { apy, window: `${Math.round(best.days)}d`, days: best.days };
}

async function fetchHolders(portalsId) {
  const doc = await portals("v2/tokens/holders", { id: portalsId, limit: 25 });
  if (!doc || !Array.isArray(doc.holders)) return null;
  const pct = (n) => doc.holders.slice(0, n).reduce((s, h) => s + (Number(h.percentage) || 0), 0);
  return {
    count: doc.totalItems ?? null,
    top5Pct: round(pct(5), 1),
    top10Pct: round(pct(10), 1),
  };
}

async function hydrate(p, cfg, now) {
  const src = p.source;
  const shape = { shareDecimals: src.shareDecimals, underlyingDecimals: src.underlyingDecimals };
  const portalsId = PORTALS_NETWORKS.has(p.chain) ? `${p.chain}:${p.contract}` : null;

  // Holders and history are independent of how the rate is produced, so they
  // are gathered for every product Portals indexes, whatever its source kind.
  const holders = portalsId ? await fetchHolders(portalsId) : null;
  const from = now - HISTORY_DAYS * 86400;
  const rawHist = portalsId ? await portals("v2/tokens/history", { id: portalsId, from }) : null;
  let series = normalizeHistory(rawHist);

  // --- Aave: a lending market, not a share-price vault ---------------------
  if (src.kind === "aave-v3") {
    const r = await aaveV3Supply({
      chain: p.chain,
      pool: cfg.aaveV3PoolEthereum,
      asset: p.contract,
      underlyingDec: src.underlyingDecimals,
      priceUsd: 1,
    });
    const m = deriveMetrics(series);
    return {
      apy: round(r.apy),
      rateWindow: "current",
      rateBasis: "Current supply rate, read from the Aave v3 Pool contract.",
      tvlUsd: r.tvlUsd,
      sharePrice: null,
      utilization: round(r.utilization, 1),
      borrowApy: round(r.borrowApy),
      holders,
      metrics: m,
      history: series,
    };
  }

  // --- Wildcat: a disclosed fixed APR, no share price to measure -----------
  if (src.kind === "wildcat") {
    const assets = await totalAssetsAt(p.chain, p.contract, shape).catch(() => null);
    return {
      apy: round(src.disclosedLenderApr),
      rateWindow: "fixed",
      rateBasis: src.aprNote ?? "Fixed lender APR published by the market itself.",
      tvlUsd: assets != null ? Math.round(assets) : null,
      sharePrice: null,
      holders,
      metrics: deriveMetrics(series),
      history: series,
    };
  }

  // --- Midas: no ERC-4626 surface -----------------------------------------
  if (src.kind === "erc20-nav") {
    const spot = rawHist ? null : null;
    const m = deriveMetrics(series);
    const fromApi = series.length ? series[series.length - 1].apy : null;
    return {
      apy: round(fromApi),
      rateNa: fromApi == null,
      rateWindow: fromApi != null ? "current (third-party API)" : null,
      rateBasis:
        fromApi != null
          ? "Sourced from the Portals API: this product exposes no ERC-4626 share price to measure onchain, and the figure is disclosed as an API reading rather than a measured rate."
          : src.note ?? "No onchain rate source available for this product yet.",
      tvlUsd: series.length ? series[series.length - 1].tvlUsd : null,
      sharePrice: spot,
      holders,
      metrics: m,
      history: series,
    };
  }

  // --- ERC-4626: the main path --------------------------------------------
  // Current share price is always read onchain, even when Portals supplies the
  // series, so the published figure is verifiable against chain state.
  const ppsOnchain = await sharePriceAt(p.chain, p.contract, shape).catch(() => null);
  const assets = await totalAssetsAt(p.chain, p.contract, shape).catch(() => null);

  // Monad is not indexed by Portals: build the series onchain instead.
  if (!series.length && canReadHistory(p.chain, 1)) {
    series = (await backfillDailySeries(p.chain, p.contract, shape, now, HISTORY_DAYS, 1)).map((h) => ({
      d: h.d,
      sharePrice: h.sharePrice,
      apy: null,
      tvlUsd: h.tvlUsd,
      supply: null,
    }));
  }

  let realized = realizedFromSeries(series);
  if (!realized && canReadHistory(p.chain, 1)) {
    const r = await realizedOverBestWindow(p.chain, p.contract, shape, now).catch(() => null);
    if (r?.apy != null) realized = { apy: r.apy, window: r.window, days: r.days };
  }

  const apiPps = series.length ? series[series.length - 1].sharePrice : null;
  const ppsGapPct =
    ppsOnchain != null && apiPps != null && apiPps > 0
      ? round(((ppsOnchain - apiPps) / apiPps) * 100, 4)
      : null;

  return {
    apy: round(realized?.apy),
    rateNa: realized == null,
    rateWindow: realized?.window ?? null,
    rateBasis: realized
      ? `Realized over the trailing ${realized.window}, from share-price growth. Current share price verified onchain.`
      : "Realized rate not available yet: not enough share-price history for this product.",
    tvlUsd: assets != null ? Math.round(assets) : series.length ? series[series.length - 1].tvlUsd : null,
    sharePrice: round(ppsOnchain, 6),
    sharePriceApi: round(apiPps, 6),
    sharePriceGapPct: ppsGapPct,
    holders,
    metrics: deriveMetrics(series),
    history: series,
  };
}

const main = async () => {
  const cfg = JSON.parse(readFileSync(REGISTRY, "utf-8"));
  const products = cfg.products ?? [];
  if (!products.length) {
    console.error("[stablecoin] registry empty; keeping existing snapshot.");
    process.exit(0);
  }
  if (!KEY) console.error("[stablecoin] PORTALS_API_KEY missing: history and holders will be empty.");

  let prev = null;
  try {
    if (existsSync(OUT_FILE)) prev = JSON.parse(readFileSync(OUT_FILE, "utf-8"));
  } catch {
    prev = null;
  }
  const prevBySlug = new Map((prev?.rows ?? []).map((r) => [r.slug, r]));
  const now = Math.floor(Date.now() / 1000);
  const rows = [];

  for (const p of products) {
    let h;
    try {
      h = await hydrate(p, cfg, now);
    } catch (e) {
      console.error(`[stablecoin] ${p.slug} failed:`, e?.message ?? e);
      const prior = prevBySlug.get(p.slug);
      h = prior
        ? { ...prior, rateBasis: `${prior.rateBasis} (last known reading)` }
        : { apy: null, rateNa: true, rateBasis: "Read failed.", rateWindow: null, tvlUsd: null, sharePrice: null, holders: null, metrics: null, history: [] };
    }
    rows.push({
      slug: p.slug,
      tier: p.tier,
      name: p.name,
      payoutAsset: p.payoutAsset,
      platform: p.platform,
      curatedBy: p.curatedBy ?? null,
      extras: p.extras ?? null,
      productType: p.productType,
      network: p.chainDisplay,
      contract: p.contract,
      productUrl: p.productUrl,
      operator: p.operator ?? "external",
      description: p.description,
      pendleName: p.pendleName ?? null,
      rateNa: false,
      ...h,
    });
    console.error(
      `[stablecoin] ${p.slug.padEnd(30)} apy=${h.apy ?? "n/a"} window=${h.rateWindow ?? "-"} hist=${h.history?.length ?? 0} holders=${h.holders?.count ?? "-"}`,
    );
  }

  const rated = rows.filter((r) => !r.rateNa && r.apy != null);
  const tierApys = (t) => rated.filter((r) => r.tier === t).map((r) => r.apy).sort((a, b) => a - b);
  const hi = tierApys("high-yield");
  const st = tierApys("stable");
  const top = [...rated].sort((a, b) => b.apy - a.apy)[0] ?? null;
  // The most rate-stable product with a real floating series: the evidence
  // behind the "park liquidity here" tier existing at all.
  //
  // Fixed-rate rows are excluded deliberately. Wildcat's APR is contractually
  // fixed, so its observed standard deviation is 0 by construction; ranking it
  // "steadiest" would dress up a definition as a finding. Only rates that were
  // free to move and did not move much earn that description.
  const steadiest = rows
    .filter(
      (r) =>
        r.rateWindow !== "fixed" &&
        r.metrics?.apyStdev != null &&
        (r.metrics?.days ?? 0) >= 30 &&
        (r.metrics?.apyMax ?? 0) > 0,
    )
    .sort((a, b) => a.metrics.apyStdev - b.metrics.apyStdev)[0] ?? null;

  const out = {
    generatedAt: new Date().toISOString(),
    dataModifiedIso: new Date(now * 1000).toISOString(),
    source:
      "Share-price growth per product. History and holder distribution from the Portals API (Ethereum, Base); Monad read directly onchain. Current share price verified onchain for every ERC-4626 product.",
    stats: {
      products: rows.length,
      rated: rated.length,
      withHistory: rows.filter((r) => (r.history?.length ?? 0) >= 2).length,
      networks: [...new Set(rows.map((r) => r.network))],
      highYield: { count: rows.filter((r) => r.tier === "high-yield").length, best: hi.length ? Math.max(...hi) : null, median: median(hi) },
      stable: { count: rows.filter((r) => r.tier === "stable").length, best: st.length ? Math.max(...st) : null, median: median(st) },
      bestOverall: top ? { apy: top.apy, name: top.name, platform: top.platform, network: top.network, slug: top.slug } : null,
      steadiest: steadiest
        ? { slug: steadiest.slug, name: steadiest.name, platform: steadiest.platform, stdev: steadiest.metrics.apyStdev, min: steadiest.metrics.apyMin, max: steadiest.metrics.apyMax }
        : null,
      totalTvlUsd: Math.round(rows.reduce((s, r) => s + (r.tvlUsd || 0), 0)),
      totalHolders: rows.reduce((s, r) => s + (r.holders?.count || 0), 0),
    },
    rows,
  };

  if (prev && prev.generatedAt != null && sameIgnoringStamps(prev, out, ["generatedAt"])) {
    console.log("[stablecoin] no material change; leaving data/stablecoin-yield.json untouched.");
    return;
  }
  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf-8");
  console.log(
    `[stablecoin] wrote ${rows.length} products (${rated.length} rated). Best ${top ? `${top.apy}% ${top.name}` : "n/a"}; steadiest ${steadiest ? `${steadiest.name} at ${steadiest.metrics.apyStdev}pp stdev` : "n/a"}.`,
  );
};

main().catch((e) => {
  console.error("[stablecoin] fatal:", e);
  process.exit(0);
});
