// Per-venue on-chain adapters for the /polygon ranking. Same contract as
// scripts/lib/xrp-onchain-adapters.mjs: each returns { apy, apyBase, tvlUsd, ... }
// for the pipeline to consume. Values come from public chain state via
// scripts/lib/onchain.mjs; RWA venues without a public rate-reading contract
// (BlackRock BUIDL, Hamilton Lane SCOPE, Apollo ACRED) and Morpho fall back to
// Portals (see fetch-polygon-yield.mjs), never the other way around.

import { ethCall, callUint, toBig, word, encAddr, call, SEL } from "./onchain.mjs";

const RAY = 10n ** 27n;
const SECONDS_PER_YEAR = 31_536_000;

// ---- Aave v3 (Polygon Pool) -----------------------------------------------
//
// getReserveData(address) selector (0x35ea6a75) and the word layout below were
// verified live against the Polygon Pool proxy: word[8] decodes to the exact
// aToken address Portals reports for that reserve, and word[2] (currentLiquidityRate,
// ray-scaled) converted with the plain (non-compounded) formula below matches
// Portals' reported APY on the same reserve within rounding -- the same figure
// Aave's own UI shows as "Supply APY".
// Word layout of the ReserveData tuple, verified live against the Polygon Pool
// proxy (word 8 decodes to the exact aToken address Portals reports for the
// reserve, word 2 converted below matches Aave's own "Supply APY"):
//   1 liquidityIndex   2 currentLiquidityRate   4 currentVariableBorrowRate
//   8 aTokenAddress   10 variableDebtTokenAddress
export async function aaveV3ReserveData({ chain = "polygon", pool, asset, block = "latest" }) {
  const res = await ethCall(chain, pool, call(SEL.getReserveData, encAddr(asset)), block);
  return {
    liquidityIndexRay: toBig(word(res, 1)),
    liquidityRateRay: toBig(word(res, 2)),
    variableBorrowRateRay: toBig(word(res, 4)),
    aToken: "0x" + word(res, 8).slice(-40),
    variableDebtToken: "0x" + word(res, 10).slice(-40),
  };
}

export async function aaveV3Supply({
  chain = "polygon",
  pool,
  asset,
  underlyingDec,
  priceUsd,
  block = "latest",
}) {
  const { liquidityIndexRay, liquidityRateRay, variableBorrowRateRay, aToken, variableDebtToken } =
    await aaveV3ReserveData({ chain, pool, asset, block });
  const apy = (Number(liquidityRateRay) / Number(RAY)) * 100;
  const borrowApy = (Number(variableBorrowRateRay) / Number(RAY)) * 100;
  const [supply, debt] = await Promise.all([
    callUint(chain, aToken, SEL.totalSupply, block),
    callUint(chain, variableDebtToken, SEL.totalSupply, block).catch(() => 0n),
  ]);
  const suppliedTok = Number(supply) / 10 ** underlyingDec;
  const borrowedTok = Number(debt) / 10 ** underlyingDec;
  // Utilization is the single number that explains an Aave supply rate: the
  // rate is paid out of borrower interest, so a pool nobody borrows from pays
  // its suppliers close to nothing regardless of how much sits in it.
  const utilization = suppliedTok > 0 ? (borrowedTok / suppliedTok) * 100 : 0;
  return {
    apy,
    apyBase: apy,
    apyReward: 0,
    borrowApy,
    utilization,
    suppliedTok,
    borrowedTok,
    tvlUsd: Math.round(suppliedTok * priceUsd),
    borrowedUsd: Math.round(borrowedTok * priceUsd),
    // Cumulative accrual index. Stored per day so realized yield between any
    // two stored points is exact arithmetic rather than an average of spot
    // samples. Free Polygon RPCs do not serve archive state (publicnode
    // requires a paid token, Blockscout keeps ~1 day), so a 30-day figure
    // cannot be backfilled today; it becomes available once the daily series
    // spans that long. See computeRealized30d in fetch-polygon-yield.mjs.
    liquidityIndex: Number(liquidityIndexRay) / Number(RAY),
    aToken,
  };
}

// ---- Prices ----------------------------------------------------------------
//
// Aave's rate itself is read straight from the Pool contract (the "spine");
// only USD pricing for non-stable underlyings goes through Portals, which is
// the same role Portals already plays for reward-token pricing in the XRP
// pipeline (never the rate itself, just a USD conversion factor).
export async function portalsTokenPrice(address, apiKey) {
  if (!apiKey) return null;
  const key = `polygon:${address}`;
  try {
    const r = await fetch(
      `https://api.portals.fi/v2/tokens?addresses=${encodeURIComponent(key)}`,
      {
        signal: AbortSignal.timeout(20_000),
        headers: { accept: "application/json", Authorization: `Bearer ${apiKey}` },
      },
    );
    if (!r.ok) return null;
    const doc = await r.json();
    const p = doc?.tokens?.[0]?.price;
    return Number.isFinite(p) ? p : null;
  } catch {
    return null;
  }
}

export { RAY, SECONDS_PER_YEAR };
