#!/usr/bin/env node
// Builds data/stablecoin-yield.json for /report/stablecoin-yield-ranking.
//
// Discovery-driven, config-constrained: for each network in
// data/stablecoin-report-config.json this queries the Portals API across the
// configured platform set, filters to single-asset USD-stablecoin venues above
// the TVL floor, and keeps the top N by current APY. The curation is the
// config (platforms, symbol filters, floors), not a per-pool allowlist, which
// is what the user asked for on this page: "the top 5 performing
// stablecoin-denominated opportunities on each leading network".
//
// Source honesty: external rows are Portals-sourced and say so
// (rateBasis: "current (third-party API)"); Harvest rows are merged at page
// build time from data/vaults.json (our own indexer) and never touch this
// script. No DeFiLlama anywhere in this pipeline or its provenance (the
// build spec's section 6 fix).
//
// Freshness (spec section 6, both fixes):
//   1. Skip the write entirely when nothing but the run stamp changed
//      (sameIgnoringStamps), so the cron's commit guard can actually fire.
//   2. dataModifiedIso is the newest Portals observation timestamp across
//      kept rows (capped at run time), not the pipeline run time.
//
// Usage:
//   NODE_USE_ENV_PROXY=1 PORTALS_API_KEY=... node scripts/fetch-stablecoin-yield.mjs

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sameIgnoringStamps } from "./lib/snapshot-stamp.mjs";

const ROOT = process.cwd();
const CONFIG_FILE = join(ROOT, "data", "stablecoin-report-config.json");
const OUT_FILE = join(ROOT, "data", "stablecoin-yield.json");

const PORTALS_KEY = process.env.PORTALS_API_KEY || null;

const round2 = (v) => Math.round(v * 100) / 100;

async function portalsPage(network, platforms, page) {
  const params = [
    `networks=${network}`,
    ...platforms.map((p) => `platforms=${p}`),
    "minLiquidity=500000",
    "limit=250",
    `page=${page}`,
  ].join("&");
  const url = `https://api.portals.fi/v2/tokens?${params}`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        headers: { accept: "application/json", Authorization: `Bearer ${PORTALS_KEY}` },
      });
      if (r.ok) return await r.json();
      console.error(`[stablecoin-yield] ${network} p${page} -> HTTP ${r.status}`);
    } catch (e) {
      console.error(`[stablecoin-yield] ${network} p${page} -> ${e.message ?? e}`);
    }
    await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
  }
  return null;
}

async function portalsAll(network, platforms) {
  const out = [];
  for (let page = 0; page < 6; page++) {
    const doc = await portalsPage(network, platforms, page);
    if (!doc) break;
    out.push(...(doc.tokens ?? []));
    if (!doc.more) break;
  }
  return out;
}

// Normalize the reader-facing stablecoin ticker out of a receipt-token symbol
// like APOLUSDCN, FUSDT, GTUSDCF, EUSDC-95 or SUSDS. Priority-ordered instead
// of a single alternation: a leftmost-match regex reads "APOLUSDC" as LUSD
// (the L in APOL + USD + C), so the specific tickers must win before the
// short ones are even tried.
// Order is load-bearing twice over: RLUSD before LUSD (RLUSD contains LUSD),
// and USDC/USDT before AUSD (Aave-style receipt symbols AUSDC/AUSDT contain
// AUSD and must not classify as Agora's AUSD).
const STABLE_PRIORITY = [
  "PYUSD", "CRVUSD", "RLUSD", "USDC", "USDT", "USDS", "USDE", "GHO", "DAI", "FRAX", "AUSD", "LUSD", "SUSD", "USDA", "USD0",
];
const STABLE_DISPLAY = { USDE: "USDe", CRVUSD: "crvUSD" };
function stablecoinOf(symbol) {
  const s = String(symbol).toUpperCase();
  for (const t of STABLE_PRIORITY) {
    if (s.includes(t)) return STABLE_DISPLAY[t] ?? t;
  }
  return null;
}

function cleanProductName(name, platformDisplay) {
  let n = String(name ?? "").trim();
  // Portals prefixes most vault names with the platform; the table has its
  // own Venue column, so strip the duplication.
  for (const p of ["Morpho ", "Euler EVK Vault ", "Euler ", "Fluid ", "Aave ", "Compound V3 ", "Spark "]) {
    if (n.startsWith(p)) {
      n = n.slice(p.length);
      break;
    }
  }
  return n || platformDisplay;
}

const main = async () => {
  if (!PORTALS_KEY) {
    console.error("[stablecoin-yield] PORTALS_API_KEY missing; keeping existing snapshot.");
    process.exit(0);
  }
  const cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  const stableRe = new RegExp(cfg.stableMatch, "i");
  const nonUsdRe = new RegExp(cfg.nonUsdExclude, "i");

  let prev = null;
  try {
    if (existsSync(OUT_FILE)) prev = JSON.parse(readFileSync(OUT_FILE, "utf-8"));
  } catch {
    prev = null;
  }

  const rows = [];
  // Best rate seen per stablecoin across ALL filtered candidates, not just
  // the top-5 cut. The by-stablecoin prose needs this: a coin like USDS can
  // be genuinely tracked (Sky Savings Rate) without clearing any network's
  // top five, and the honest sentence is its real current rate, not silence.
  const allCandidates = [];
  let newestObs = 0;
  for (const net of cfg.networks) {
    const tokens = await portalsAll(net, cfg.platforms);
    const kept = tokens
      .filter((t) => {
        const sym = String(t.symbol ?? "");
        if (sym.includes("/")) return false; // LP pairs are out of scope
        if (!stableRe.test(sym)) return false;
        if (nonUsdRe.test(sym)) return false;
        const apy = Number(t.metrics?.apy);
        if (!Number.isFinite(apy)) return false;
        if (apy < cfg.minDisplayedApy) return false; // same display floor as /polygon
        if (apy > cfg.maxSaneApy) return false; // junk/incentive-glitch guard
        if ((t.liquidity ?? 0) < cfg.minTvlUsd) return false;
        return true;
      })
      .map((t) => {
        const plat = t.platform;
        const stable0 = stablecoinOf(t.symbol);
        // Per-network ticker correctness (spec 4.3): USDT is USDT0 on the
        // networks where the migration has happened.
        const stable =
          stable0 === "USDT" && cfg.usdtTickerPerNetwork[net] ? cfg.usdtTickerPerNetwork[net] : stable0;
        const upd = Date.parse(t.updatedAt ?? "") || 0;
        if (upd > newestObs) newestObs = upd;
        return {
          id: `${net}:${t.address}`,
          network: cfg.networkDisplay[net] ?? net,
          stablecoin: stable,
          platform: cfg.platformDisplay[plat] ?? plat,
          product: cleanProductName(t.name, cfg.platformDisplay[plat] ?? plat),
          venueType: cfg.venueType[plat] ?? "Lending venue",
          venueUrl: cfg.platformUrl[plat] ?? null,
          operator: "external",
          apy: round2(Number(t.metrics.apy)),
          apy7d: Number.isFinite(Number(t.metrics?.apy7d)) ? round2(Number(t.metrics.apy7d)) : null,
          tvlUsd: Math.round(t.liquidity ?? 0),
          contractAddress: t.address,
          observedAt: t.updatedAt ?? null,
          rateBasis: "current (third-party API)",
        };
      })
      .sort((a, b) => b.apy - a.apy);
    allCandidates.push(...kept);
    const top = kept.slice(0, cfg.topPerNetwork);
    console.error(
      `[stablecoin-yield] ${net}: ${tokens.length} fetched -> ${kept.length} candidates -> kept top ${top.length}`,
    );
    rows.push(...top);
  }

  if (!rows.length) {
    console.error("[stablecoin-yield] zero rows survived filtering; keeping existing snapshot.");
    process.exit(0);
  }

  rows.sort((a, b) => b.apy - a.apy);
  const apys = rows.map((r) => r.apy).sort((a, b) => a - b);
  const median = apys[Math.floor(apys.length / 2)];
  const perStable = {};
  for (const r of rows) {
    (perStable[r.stablecoin] ??= []).push(r.apy);
  }
  const perStablecoin = Object.fromEntries(
    Object.entries(perStable).map(([k, v]) => [
      k,
      { count: v.length, best: round2(Math.max(...v)), median: round2([...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]) },
    ]),
  );

  // Best venue per stablecoin across the whole filtered candidate pool.
  const bestAnywhere = {};
  for (const c of allCandidates) {
    const cur = bestAnywhere[c.stablecoin];
    if (!cur || c.apy > cur.apy) {
      bestAnywhere[c.stablecoin] = {
        apy: c.apy,
        platform: c.platform,
        product: c.product,
        network: c.network,
        candidates: 0,
      };
    }
  }
  for (const c of allCandidates) bestAnywhere[c.stablecoin].candidates++;

  // Spec section 6 freshness fix #2: the citable date is the newest
  // observation, never the run time (capped at run time for sanity).
  const dataModifiedIso = new Date(Math.min(newestObs || Date.now(), Date.now())).toISOString();

  const out = {
    generatedAt: new Date().toISOString(),
    dataModifiedIso,
    source: "Portals API venue discovery across Aave v3, Compound v3, Morpho, Fluid, Spark, Sky and Euler",
    config: {
      networks: cfg.networks.map((n) => cfg.networkDisplay[n] ?? n),
      topPerNetwork: cfg.topPerNetwork,
      minTvlUsd: cfg.minTvlUsd,
    },
    stats: {
      venues: rows.length,
      networks: cfg.networks.length,
      bestApy: rows[0].apy,
      bestStablecoin: rows[0].stablecoin,
      bestPlatform: rows[0].platform,
      bestNetwork: rows[0].network,
      medianApy: round2(median),
      totalTvlUsd: Math.round(rows.reduce((s, r) => s + r.tvlUsd, 0)),
      candidates: allCandidates.length,
      perStablecoin,
      bestAnywhere,
    },
    rows,
  };

  // Spec section 6 freshness fix #1: unchanged data writes nothing, so the
  // cron's commit-if-changed guard actually fires. Both run stamps ignored;
  // dataModifiedIso is data-derived so it participates in the comparison.
  if (prev && prev.generatedAt != null && sameIgnoringStamps(prev, out, ["generatedAt"])) {
    console.log("[stablecoin-yield] no material change; leaving data/stablecoin-yield.json untouched.");
    return;
  }

  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf-8");
  console.log(
    `[stablecoin-yield] wrote ${rows.length} venues across ${cfg.networks.length} networks, best ${out.stats.bestApy}% (${out.stats.bestStablecoin} at ${out.stats.bestPlatform} on ${out.stats.bestNetwork}), median ${out.stats.medianApy}% -> data/stablecoin-yield.json`,
  );
};

main().catch((e) => {
  console.error("[stablecoin-yield] fatal:", e);
  process.exit(0);
});
