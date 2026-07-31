// Historical TVL for the XRP report's landscape chart, read from chain state
// at archive blocks.
//
// WHY: the landscape chart's daily line used to come from DeFiLlama's
// /protocol/upshift endpoint, which was both the last aggregator call in the
// pipeline and the reason the chart covered one venue out of nine. Base and
// Flare are archive nodes, so the same reads the hourly fetcher makes at head
// also answer at a block from 90 days ago. That turns "history accumulates
// forward from the switch" into a real series available on day one.
//
// This module answers one question per call: what was this venue's TVL in USD
// at this block. It deliberately does NOT compute historical APY. Rates need
// swap-log windows and reward-speed reads that cost an order of magnitude more
// requests, and the chart only plots capital.

import {
  ethCall,
  callUint,
  toBig,
  word,
  encAddr,
  call,
  SEL,
  blockNumber,
  blockTimestamp,
  blockAtTimestamp,
  CHAINS,
} from "./onchain.mjs";
import { readCompound, chainlink, xrpUsdAt, BASE_FEEDS } from "./xrp-onchain-adapters.mjs";

export const dstr = (unixSec) => new Date(unixSec * 1000).toISOString().slice(0, 10);
const midnightTs = (dayStr) => Math.floor(Date.parse(`${dayStr}T00:00:00Z`) / 1000);

// ---- day -> block ---------------------------------------------------------

// Timestamps are near-linear in block number, so interpolating between a
// bracketing pair converges in a handful of probes where bisection needs ~23.
// A daily series does not care about landing on the exact block, so the search
// stops once it is within `tolSec` of midnight.
async function interpolateBlock(chain, target, lo, hi, tolSec) {
  for (let i = 0; i < 20 && hi.block - lo.block > 1; i++) {
    const spanTs = hi.ts - lo.ts;
    let frac = spanTs > 0 ? (target - lo.ts) / spanTs : 0.5;
    frac = Math.min(0.98, Math.max(0.02, frac));
    let mid = lo.block + Math.round(frac * (hi.block - lo.block));
    if (mid <= lo.block) mid = lo.block + 1;
    if (mid >= hi.block) mid = hi.block - 1;
    const t = await blockTimestamp(chain, mid);
    if (t == null) break;
    if (t <= target) {
      lo = { block: mid, ts: t };
      // Only a probe at or below the target can end the search. Returning on a
      // probe that overshot would hand back whatever `lo` still held, which on
      // the first iteration is the far end of the bracket.
      if (target - t <= tolSec) return lo;
    } else {
      hi = { block: mid, ts: t };
    }
  }
  return lo;
}

// UTC midnight -> block, for the last `days` days ending at `endTs`, as a Map
// keyed by YYYY-MM-DD. Resolved newest to oldest so each lookup inherits the
// previous day's block as its upper bracket, which keeps the interpolation
// window one day wide.
export async function dayBlockMap(chain, days, endTs, { tolSec = 60 } = {}) {
  const head = await blockNumber(chain);
  const headTs = await blockTimestamp(chain, head);
  const oldestTarget = midnightTs(dstr(endTs - days * 86400));

  // One full search for the far end gives the lower bracket for everything.
  const oldestBlock = await blockAtTimestamp(chain, oldestTarget);
  const oldestTs = await blockTimestamp(chain, oldestBlock);

  const out = new Map();
  let upper = { block: head, ts: headTs };
  const lower = { block: oldestBlock, ts: oldestTs };

  for (let i = 0; i <= days; i++) {
    const day = dstr(endTs - i * 86400);
    const target = midnightTs(day);
    if (target > headTs) continue;
    if (target <= oldestTs) {
      out.set(day, oldestBlock);
      continue;
    }
    let hit = await interpolateBlock(chain, target, { ...lower }, { ...upper }, tolSec);
    // Interpolation assumes timestamps are near-linear in block number. A chain
    // halt breaks that, so a point that landed far from midnight falls back to
    // the exact bisection rather than being written as if it were that day.
    if (target - hit.ts > 900) {
      const b = await blockAtTimestamp(chain, target);
      hit = { block: b, ts: (await blockTimestamp(chain, b)) ?? target };
    }
    out.set(day, hit.block);
    upper = hit;
  }
  return out;
}

// ---- TVL at a block -------------------------------------------------------

// A contract that did not exist yet answers with empty returndata rather than
// reverting on some nodes, which decodes as 0. Both cases mean "not deployed",
// and the caller drops the day rather than plotting a zero.
const NOT_YET = null;

async function uintOrNull(chain, to, data, block) {
  try {
    const raw = await ethCall(chain, to, data, block);
    if (!raw || raw === "0x") return NOT_YET;
    const v = toBig(raw);
    return v === 0n ? NOT_YET : v;
  } catch {
    return NOT_YET;
  }
}

// Vault families: assets under management, denominated in the underlying.
// Upshift's TokenizedVault and a standard ERC4626 differ only in the selector.
async function vaultAssets(chain, vault, selector, dec, block) {
  const v = await uintOrNull(chain, vault, selector, block);
  return v == null ? NOT_YET : Number(v) / 10 ** dec;
}

// Compound-fork markets: the chart plots supplied capital net of borrows, which
// is the same basis the live pipeline reports as tvlUsd.
async function compoundNet(chain, market, dec, block) {
  try {
    const c = await readCompound({ chain, market, underlyingDec: dec, block });
    if (!Number.isFinite(c.netTok) || c.netTok <= 0) return NOT_YET;
    return c.netTok;
  } catch {
    return NOT_YET;
  }
}

// Concentrated-liquidity pool with two ~XRP-priced legs: both reserves count
// toward TVL at the XRP reference price.
async function sparkdexReservesXrp(chain, pool, dec0, dec1, block) {
  try {
    const res = await ethCall(chain, pool, SEL.getReserves, block);
    if (!res || res === "0x") return NOT_YET;
    const r0 = Number(toBig(word(res, 0))) / 10 ** dec0;
    const r1 = Number(toBig(word(res, 1))) / 10 ** dec1;
    if (!(r0 + r1 > 0)) return NOT_YET;
    return r0 + r1;
  } catch {
    return NOT_YET;
  }
}

// Aerodrome CL pool: cbXRP is priced off the pool's own sqrtPrice against the
// paired asset's Chainlink feed, exactly as the live adapter does, so the
// historical points sit on the same basis as today's.
const sqrtPriceToP1per0 = (sqrtX96, dec0, dec1) => {
  const s = Number(sqrtX96) / 2 ** 96;
  return s * s * 10 ** (dec0 - dec1);
};

async function aerodromeTvlUsd(src, block) {
  const chain = src.chain ?? "base";
  try {
    const bal = async (t) => {
      const raw = await ethCall(chain, t, call(SEL.balanceOf, encAddr(src.pool)), block);
      return raw && raw !== "0x" ? Number(toBig(raw)) : 0;
    };
    const [b0, b1, slot0] = await Promise.all([
      bal(src.token0),
      bal(src.token1),
      ethCall(chain, src.pool, SEL.slot0, block),
    ]);
    if (!slot0 || slot0 === "0x") return NOT_YET;
    const amt0 = b0 / 10 ** src.dec0;
    const amt1 = b1 / 10 ** src.dec1;
    if (!(amt0 + amt1 > 0)) return NOT_YET;
    const pairUsd = await chainlink(chain, BASE_FEEDS[src.pairFeed], block);
    if (!Number.isFinite(pairUsd) || pairUsd <= 0) return NOT_YET;
    const p1per0 = sqrtPriceToP1per0(toBig(word(slot0, 0)), src.dec0, src.dec1);
    if (!Number.isFinite(p1per0) || p1per0 <= 0) return NOT_YET;
    return src.cbxrpIs === "token1"
      ? amt0 * pairUsd + amt1 * (pairUsd / p1per0)
      : amt0 * (pairUsd * p1per0) + amt1 * pairUsd;
  } catch {
    return NOT_YET;
  }
}

// TVL in USD for one venue at one block, or null when the venue did not exist
// yet at that block. `xrp` is the XRP/USD reference for the same calendar day.
export async function tvlAtBlock(src, { block, xrp }) {
  const chain = src.chain ?? (src.protocol === "aerodrome" || src.protocol === "compound-moonwell" ? "base" : "flare");
  const dec = src.underlyingDec ?? 6;

  switch (src.protocol) {
    case "upshift-vault": {
      const a = await vaultAssets(chain, src.vault, SEL.getTotalAssets, dec, block);
      return a == null ? NOT_YET : a * xrp;
    }
    case "mystic-vault":
    case "erc4626": {
      const a = await vaultAssets(chain, src.vault, SEL.totalAssets, dec, block);
      return a == null ? NOT_YET : a * xrp;
    }
    case "compound-kinetic":
    case "compound-moonwell": {
      const n = await compoundNet(chain, src.market, dec, block);
      return n == null ? NOT_YET : n * xrp;
    }
    case "sparkdex-pool": {
      const r = await sparkdexReservesXrp(chain, src.pool, src.dec0 ?? 6, src.dec1 ?? 6, block);
      return r == null ? NOT_YET : r * xrp;
    }
    case "aerodrome":
      return aerodromeTvlUsd(src, block);
    default:
      return NOT_YET;
  }
}

// True when this venue's TVL can be reconstructed from archive state at all.
// Spectra's PT/LP markets are priced through the Spectra API rather than a
// single contract read, so they stay out of the daily line.
export function canBackfillTvl(src) {
  return (
    src?.kind === "onchain" &&
    [
      "upshift-vault",
      "mystic-vault",
      "erc4626",
      "compound-kinetic",
      "compound-moonwell",
      "sparkdex-pool",
      "aerodrome",
    ].includes(src.protocol)
  );
}

export { xrpUsdAt, CHAINS };
