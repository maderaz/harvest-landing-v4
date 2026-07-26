#!/usr/bin/env node
// Builds data/stablecoin-pendle.json: the fixed-rate side of the stablecoin
// market, for the yield-trading section of /report/stablecoin-yield-ranking.
//
// Why this belongs on the page: two products the report already ranks as spot
// holdings (Sky's sUSDS and Ethena's sUSDe) also trade as Pendle principal
// tokens, so the same page can show what a holder earns floating today and
// what the market will pay to lock that rate to a maturity. Those two numbers
// come from independent sources and disagreeing is informative, not a bug: a
// fixed rate above the floating one means the market expects rates to fall.
//
// Pendle's own vocabulary, kept rather than renamed:
//   impliedApy    the fixed rate a PT buyer locks to maturity
//   aggregatedApy the underlying asset's current floating yield
//
// Usage: NODE_USE_ENV_PROXY=1 node scripts/fetch-stablecoin-pendle.mjs

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sameIgnoringStamps } from "./lib/snapshot-stamp.mjs";

const ROOT = process.cwd();
const OUT_FILE = join(ROOT, "data", "stablecoin-pendle.json");
const REGISTRY = join(ROOT, "data", "stablecoin-products.json");
const ENDPOINT = "https://api-v2.pendle.finance/core/v1/1/markets/active";

const MIN_LIQUIDITY_USD = 1_000_000;
const STABLE_HINT = /(USD|DAI|GHO|FRAX|PYUSD|USDE|USDS|SUSD|RLUSD|CRVUSD)/i;
// Non-USD "USD-looking" tickers that would otherwise pass the hint above.
const NOT_STABLE = /(EUR|JPY|GBP|CHF|BRL|TRY|XAU|BTC|ETH)/i;

const round = (v, dp = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp);

const main = async () => {
  let doc = null;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(ENDPOINT, { signal: AbortSignal.timeout(30_000), headers: { accept: "application/json" } });
      if (r.ok) {
        doc = await r.json();
        break;
      }
      console.error(`[pendle] HTTP ${r.status}`);
    } catch (e) {
      console.error(`[pendle] ${e.message ?? e}`);
    }
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
  if (!doc?.markets?.length) {
    console.error("[pendle] no markets returned; keeping existing snapshot.");
    process.exit(0);
  }

  // Products in the report that also trade on Pendle, matched on the ticker
  // the registry declares rather than by fuzzy name matching.
  let tracked = new Set();
  try {
    const reg = JSON.parse(readFileSync(REGISTRY, "utf-8"));
    tracked = new Set((reg.products ?? []).map((p) => p.pendleName).filter(Boolean));
  } catch {
    /* registry optional */
  }

  const rows = doc.markets
    .filter((m) => {
      const n = String(m.name ?? "");
      if (!STABLE_HINT.test(n) || NOT_STABLE.test(n)) return false;
      return (m.details?.liquidity ?? 0) >= MIN_LIQUIDITY_USD;
    })
    .map((m) => {
      const d = m.details ?? {};
      const daysToMaturity = Math.round((Date.parse(m.expiry) - Date.now()) / 86_400_000);
      const implied = d.impliedApy != null ? d.impliedApy * 100 : null;
      const floating = d.aggregatedApy != null ? d.aggregatedApy * 100 : null;
      return {
        name: m.name,
        marketAddress: m.address,
        expiry: m.expiry,
        daysToMaturity,
        fixedApy: round(implied),
        floatingApy: round(floating),
        // Positive: locking pays more than holding, i.e. the market expects the
        // floating rate to fall before maturity.
        spreadPp: implied != null && floating != null ? round(implied - floating) : null,
        liquidityUsd: Math.round(d.liquidity ?? 0),
        tracked: tracked.has(m.name),
      };
    })
    .filter((r) => r.fixedApy != null && r.daysToMaturity > 0)
    .sort((a, b) => b.fixedApy - a.fixedApy);

  if (!rows.length) {
    console.error("[pendle] nothing survived filtering; keeping existing snapshot.");
    process.exit(0);
  }

  const fixed = rows.map((r) => r.fixedApy).sort((a, b) => a - b);
  const out = {
    generatedAt: new Date().toISOString(),
    source: "Pendle API (api-v2.pendle.finance), Ethereum active markets",
    stats: {
      markets: rows.length,
      bestFixed: rows[0].fixedApy,
      bestFixedName: rows[0].name,
      medianFixed: round(fixed[Math.floor(fixed.length / 2)]),
      totalLiquidityUsd: rows.reduce((s, r) => s + r.liquidityUsd, 0),
      trackedOverlap: rows.filter((r) => r.tracked).map((r) => r.name),
    },
    markets: rows,
  };

  let prev = null;
  try {
    if (existsSync(OUT_FILE)) prev = JSON.parse(readFileSync(OUT_FILE, "utf-8"));
  } catch {
    prev = null;
  }
  if (prev && prev.generatedAt != null && sameIgnoringStamps(prev, out, ["generatedAt"])) {
    console.log("[pendle] no material change; leaving data/stablecoin-pendle.json untouched.");
    return;
  }

  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf-8");
  console.log(
    `[pendle] wrote ${rows.length} markets, best fixed ${out.stats.bestFixed}% (${out.stats.bestFixedName}), overlap with ranked products: ${out.stats.trackedOverlap.join(", ") || "none"}`,
  );
};

main().catch((e) => {
  console.error("[pendle] fatal:", e);
  process.exit(0);
});
