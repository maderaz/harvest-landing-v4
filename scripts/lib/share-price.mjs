// Chain-agnostic ERC-4626 share-price reader and realized-rate math.
//
// WHY SHARE PRICE
// Share price is the honest number. It already nets out every fee, loss and
// rebalance: nothing can inflate it. An APY from a platform's own API is a
// forward-looking projection; the share-price-derived rate is what the vault
// actually earned. This module produces the latter, so a Fusion vault, a
// Harvest autocompounder and an Ethena wrapper can be compared on one basis.
//
// THE TWO-DECIMALS RULE (the pitfall that silently scales results)
// Ask convertToAssets for 10^shareDecimals (one whole share), but divide the
// RESULT by 10^underlyingDecimals. They are frequently different: IPOR Fusion
// vaults expose 8-decimal shares over 6-decimal USDC, so conflating the two
// reports a 1.128 share price as 0.011. Verified against both Fusion vaults on
// Ethereum while building this.
//
// Fallbacks are deliberate, not defensive noise: some vaults in scope expose
// underlying() instead of asset() (Harvest's own), and some revert on
// totalAssets() while answering convertToAssets() fine.

import { ethCall, blockNumber, blockAtTimestamp, canReadHistory } from "./onchain.mjs";

const SEL = {
  decimals: "0x313ce567",
  asset: "0x38d52e0f",
  underlying: "0x6f307dc3", // Harvest-style vaults
  totalAssets: "0x01e1d114",
  totalSupply: "0x18160ddd",
  convertToAssets: "0x07a2d13a",
};

const toBig = (hex) => (hex && hex !== "0x" ? BigInt(hex) : 0n);
const word = (hex, i) => "0x" + hex.slice(2).slice(i * 64, i * 64 + 64);

// Sanity band from the reference implementation: a bad read or a pre-deploy
// block otherwise poisons an entire window.
const MIN_SANE_PPS = 0.1;
const MAX_SANE_PPS = 100;
// Never annualize a window shorter than this. Tiny denominators explode the
// exponent: an hour of intra-day noise annualizes into a five-figure APY.
const MIN_SPAN_SECONDS = 12 * 3600;

async function tryCall(chain, to, data, block = "latest") {
  try {
    return await ethCall(chain, to, data, block);
  } catch {
    return null;
  }
}

// Resolve the immutable facts once per vault: share decimals, underlying token
// and its decimals. Cache these in the registry; token decimals never change.
export async function resolveVaultShape(chain, vault) {
  const dRaw = await tryCall(chain, vault, SEL.decimals);
  if (!dRaw) throw new Error(`${vault}: decimals() unreadable`);
  const shareDecimals = Number(toBig(dRaw));

  let assetRaw = await tryCall(chain, vault, SEL.asset);
  let via = "asset()";
  if (!assetRaw) {
    assetRaw = await tryCall(chain, vault, SEL.underlying);
    via = "underlying()";
  }
  if (!assetRaw) throw new Error(`${vault}: neither asset() nor underlying() readable`);
  const underlying = "0x" + assetRaw.slice(-40);

  const udRaw = await tryCall(chain, underlying, SEL.decimals);
  const underlyingDecimals = udRaw ? Number(toBig(udRaw)) : shareDecimals;

  return { shareDecimals, underlying, underlyingDecimals, assetVia: via };
}

// Share price in underlying units. Returns null on revert (e.g. a block before
// deployment) rather than coercing to 0, so callers can skip the point instead
// of charting a cliff that never happened.
export async function sharePriceAt(chain, vault, shape, block = "latest") {
  const { shareDecimals, underlyingDecimals } = shape;
  const oneShare = (10n ** BigInt(shareDecimals)).toString(16).padStart(64, "0");
  const raw = await tryCall(chain, vault, SEL.convertToAssets + oneShare, block);
  if (!raw) return null;
  const pps = Number(toBig(word(raw, 0))) / 10 ** underlyingDecimals;
  if (!Number.isFinite(pps) || pps < MIN_SANE_PPS || pps > MAX_SANE_PPS) return null;
  return pps;
}

// Total assets in underlying units. Falls back to totalSupply x sharePrice for
// vaults whose totalAssets() reverts (Harvest's Arcadia vault does this).
export async function totalAssetsAt(chain, vault, shape, block = "latest") {
  const raw = await tryCall(chain, vault, SEL.totalAssets, block);
  if (raw) return Number(toBig(word(raw, 0))) / 10 ** shape.underlyingDecimals;
  const supplyRaw = await tryCall(chain, vault, SEL.totalSupply, block);
  const pps = await sharePriceAt(chain, vault, shape, block);
  if (!supplyRaw || pps == null) return null;
  return (Number(toBig(word(supplyRaw, 0))) / 10 ** shape.shareDecimals) * pps;
}

// Compound-annualize a share-price ratio over ACTUAL elapsed seconds. Never
// annualize by point count. A falling share price is not clamped: a sustained
// negative is a real signal worth surfacing, not an error to hide.
export function realizedApy(ppsNow, ppsPast, elapsedSeconds) {
  if (ppsNow == null || ppsPast == null) return null;
  if (!(ppsPast > 0) || !(elapsedSeconds >= MIN_SPAN_SECONDS)) return null;
  const ratio = ppsNow / ppsPast;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const years = elapsedSeconds / 31_536_000;
  const apy = (Math.pow(ratio, 1 / years) - 1) * 100;
  return Number.isFinite(apy) ? apy : null;
}

// Realized rate over the deepest window this chain can actually serve.
// Returns { apy, window, days } with window one of "30d" | "7d" | null, so the
// page can label each row with the basis it really used instead of implying a
// uniform 30 days it does not have.
export async function realizedOverBestWindow(chain, vault, shape, now) {
  const nowBlock = await blockNumber(chain);
  const ppsNow = await sharePriceAt(chain, vault, shape, nowBlock);
  if (ppsNow == null) return { apy: null, window: null, days: null, ppsNow: null };

  for (const days of [30, 7]) {
    if (!canReadHistory(chain, days)) continue;
    try {
      const pastBlock = await blockAtTimestamp(chain, now - days * 86400);
      const ppsPast = await sharePriceAt(chain, vault, shape, pastBlock);
      const apy = realizedApy(ppsNow, ppsPast, days * 86400);
      if (apy != null) return { apy, window: `${days}d`, days, ppsNow, ppsPast };
    } catch {
      /* try the shorter window */
    }
  }
  return { apy: null, window: null, days: null, ppsNow };
}

// Daily {d, sharePrice, assets, tvlUsd} series by walking historical blocks.
// Stores `assets` separately from `tvlUsd` so history can be re-priced later
// without re-reading the chain. Only call where canReadHistory allows it.
export async function backfillDailySeries(chain, vault, shape, now, days, priceUsd = 1) {
  const out = [];
  for (let i = days; i >= 0; i--) {
    if (!canReadHistory(chain, i)) continue;
    const ts = now - i * 86400;
    let block;
    try {
      block = await blockAtTimestamp(chain, ts);
    } catch {
      continue;
    }
    const pps = await sharePriceAt(chain, vault, shape, block);
    if (pps == null) continue;
    const assets = await totalAssetsAt(chain, vault, shape, block);
    out.push({
      d: new Date(ts * 1000).toISOString().slice(0, 10),
      sharePrice: Math.round(pps * 1e6) / 1e6,
      assets: assets != null ? Math.round(assets) : null,
      tvlUsd: assets != null ? Math.round(assets * priceUsd) : null,
    });
  }
  return out;
}

// Realized rate implied by a stored daily series, used once a chain without
// archive access has accumulated enough points to speak. Picks the point
// closest to `targetDays` back inside the tolerance band.
export function realizedFromSeries(series, targetDays = 30, minDays = 6) {
  if (!Array.isArray(series) || series.length < 2) return null;
  const last = series[series.length - 1];
  if (!last?.sharePrice) return null;
  const lastMs = Date.parse(`${last.d}T00:00:00Z`);
  let best = null;
  for (const p of series.slice(0, -1)) {
    if (!p?.sharePrice) continue;
    const days = (lastMs - Date.parse(`${p.d}T00:00:00Z`)) / 86_400_000;
    if (days < minDays) continue;
    if (!best || Math.abs(days - targetDays) < Math.abs(best.days - targetDays)) {
      best = { pps: p.sharePrice, days };
    }
  }
  if (!best) return null;
  const apy = realizedApy(last.sharePrice, best.pps, best.days * 86400);
  return apy == null ? null : { apy, window: `${Math.round(best.days)}d`, days: best.days };
}

export { MIN_SPAN_SECONDS, MIN_SANE_PPS, MAX_SANE_PPS };
