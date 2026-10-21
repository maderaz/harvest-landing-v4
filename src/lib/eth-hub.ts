import type { YieldVault } from "./types";
import type { FullVaultHistory } from "./data";
import {
  buildUsdcCohort,
  venueOf,
  type UsdcCohort,
} from "./usdc-hub";

// Single source for every figure on /eth.
//
// The cohort itself (sorting, the liquidity floor, medians, the TVL-weighted
// rate, per-venue and per-network rollups, 30-day stability) is the same
// arithmetic /usdc runs, so it is reused rather than copied: buildUsdcCohort is
// asset-agnostic despite its name, and two hubs disagreeing about what "the
// median" means would be worse than one shared definition.
//
// What /eth adds is what its queries ask for and /usdc's never did. Search
// Console shows the questions arriving as full sentences scoped to a network:
// "where can I earn yield on ETH on Base", "which protocols pay the highest ETH
// yield on an L2", "which ETH yield options on Base are the safest". So the
// page needs per-network picks, a strategy-type breakdown, and a way to talk
// about "safest" that is measured rather than scored.

export type EthCohort = UsdcCohort;

/** Networks the page answers for by name, in the order a reader meets them. */
export const ETH_NETWORKS = ["Base", "Arbitrum", "Ethereum"] as const;

/** Rollups. Ethereum mainnet is the one network here that is not an L2. */
const L2S = new Set(["Base", "Arbitrum"]);
export const isL2 = (chain: string): boolean => L2S.has(chain);

export function buildEthCohort(
  ethVaults: YieldVault[],
  history: Record<string, FullVaultHistory> | null,
): EthCohort {
  return buildUsdcCohort(ethNamed(ethVaults), history);
}

// Names a reader can tell apart.
//
// Two different products on Base are both called "ETH Lend" (one on Arcadia,
// one on ExtraFi), and a parser reading both rows merges them into one. Where
// a name repeats on the same network, the protocol goes in front of it. And
// "ETH Base ETH Lending Optimizer" says ETH twice, so the leading token is
// dropped when the rest of the name already carries it.
function ethNamed(vaults: YieldVault[]): YieldVault[] {
  const key = (v: YieldVault) => `${v.chain}|${v.productName}`;
  const seen = new Map<string, number>();
  for (const v of vaults) seen.set(key(v), (seen.get(key(v)) ?? 0) + 1);
  return vaults.map((v) => {
    let name = v.productName;
    if ((seen.get(key(v)) ?? 0) > 1) name = `${venueOf(v)} ${name}`;
    const rest = name.replace(/^ETH\s+/, "");
    if (rest !== name && /\bETH\b/.test(rest)) name = rest;
    return name === v.productName ? v : { ...v, productName: name };
  });
}

// ---- strategy types -------------------------------------------------------
//
// Four shapes cover every row. They are told apart by how many contracts sit
// between the ETH and the borrower, which is the property a reader comparing
// "safe" against "high" actually needs:
//
//   money market   ETH lent straight into one pooled market (Aave, Compound,
//                  Fluid, Dolomite...). One protocol, one rate curve.
//   curated vault  ETH spread by a curator across several isolated markets on
//                  Morpho or Euler. The curator's parameter set is a layer.
//   allocator      A contract that moves ETH between venues as rates change
//                  (Autopilot, the IPOR lending optimizer). One more layer,
//                  bought for the right to chase the best rate.
//   looping        ETH supplied, borrowed against and resupplied to multiply
//                  the spread. Leverage is the layer, and it brings a
//                  liquidation path the others do not have.

export type EthStrategyType = "money-market" | "curated" | "allocator" | "looping";

export const STRATEGY_LABEL: Record<EthStrategyType, string> = {
  "money-market": "Money markets",
  curated: "Curated lending vaults",
  allocator: "Allocators",
  looping: "Leveraged looping",
};

export function strategyTypeOf(v: YieldVault): EthStrategyType {
  const name = v.productName.toLowerCase();
  const venue = venueOf(v).toLowerCase();
  if (name.includes("looping")) return "looping";
  if (v.vaultType === "Autopilot" || name.includes("optimizer") || venue.startsWith("ipor")) {
    return "allocator";
  }
  if (venue.startsWith("morpho") || venue.startsWith("euler")) return "curated";
  return "money-market";
}

export interface EthTypeRow {
  type: EthStrategyType;
  label: string;
  count: number;
  fundedCount: number;
  medianApy: number;
  /** Best rate in the type among strategies clearing the liquidity floor. */
  bestFunded: YieldVault | null;
  tvl: number;
}

function median(asc: number[]): number {
  if (asc.length === 0) return 0;
  const mid = asc.length / 2;
  return asc.length % 2 ? asc[Math.floor(mid)] : (asc[mid - 1] + asc[mid]) / 2;
}

export function byStrategyType(c: EthCohort): EthTypeRow[] {
  const order: EthStrategyType[] = ["allocator", "curated", "money-market", "looping"];
  return order
    .map((type) => {
      const rows = c.all.filter((v) => strategyTypeOf(v) === type);
      const funded = rows.filter((v) => v.tvl >= c.fundedFloor);
      return {
        type,
        label: STRATEGY_LABEL[type],
        count: rows.length,
        fundedCount: funded.length,
        medianApy: median(rows.map((v) => v.apy24h).sort((a, b) => a - b)),
        bestFunded: funded[0] ?? null,
        tvl: rows.reduce((s, v) => s + v.tvl, 0),
      };
    })
    .filter((r) => r.count > 0);
}

// ---- per-network picks ------------------------------------------------------

export interface EthNetworkPicks {
  chain: string;
  count: number;
  tvl: number;
  /** Up to three funded strategies on the network, highest rate first. */
  picks: YieldVault[];
  /** Highest rate on the network with no floor, for context only. */
  bestRaw: YieldVault | null;
}

export function networkPicks(c: EthCohort, chain: string, limit = 3): EthNetworkPicks {
  const rows = c.all.filter((v) => v.chain === chain);
  return {
    chain,
    count: rows.length,
    tvl: rows.reduce((s, v) => s + v.tvl, 0),
    picks: rows.filter((v) => v.tvl >= c.fundedFloor).slice(0, limit),
    bestRaw: rows[0] ?? null,
  };
}

// ---- track record and steadiness ------------------------------------------
//
// "Which option is safest" has no measured answer, and a composite safety score
// would be weights chosen here and published as a rating. What can be measured
// is the evidence a reader would weigh: how much ETH a strategy holds, how long
// Harvest has been reading it, how far its rate moved over the last 30 days,
// and how many contract layers it adds. The page reports those and lets the
// reader do the weighing.

export interface EthEvidenceRow {
  vault: YieldVault;
  type: EthStrategyType;
  /** Days between the first and latest reading Harvest holds. */
  trackedDays: number;
  /** 30-day standard deviation of the daily APY, in points, when measured. */
  stdev: number | null;
}

export function evidenceRows(
  c: EthCohort,
  history: Record<string, FullVaultHistory> | null,
): EthEvidenceRow[] {
  const stdevBySlug = new Map(c.stability.rows.map((r) => [r.slug, r.stdev]));
  return c.funded
    .map((v) => {
      const h = history?.[v.contractAddress] ?? history?.[v.contractAddress.toLowerCase()];
      const ts = [...(h?.apyHistory ?? []), ...(h?.tvlHistory ?? [])].map((p) => p.timestamp);
      const trackedDays = ts.length
        ? Math.floor((Math.max(...ts) - Math.min(...ts)) / 86400)
        : 0;
      return {
        vault: v,
        type: strategyTypeOf(v),
        trackedDays,
        stdev: stdevBySlug.get(v.slug) ?? null,
      };
    })
    .sort((a, b) => b.vault.tvl - a.vault.tvl);
}

/** "3 years and 2 months", "11 months", "26 days". */
export function trackedLabel(days: number): string {
  if (days < 60) return `${days} days`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest
    ? `${years} ${years === 1 ? "year" : "years"} and ${rest} ${rest === 1 ? "month" : "months"}`
    : `${years} ${years === 1 ? "year" : "years"}`;
}

/** WETH, ETH or stETH: the token a row is denominated in, from its name. */
export function tokenOf(v: YieldVault): string {
  return v.productName.split(" ")[0];
}
