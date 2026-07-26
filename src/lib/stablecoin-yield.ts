// Build-time reader for /report/stablecoin-yield-ranking. Same
// readFileSync-at-build pattern as src/lib/polygon-yield.ts: the pipeline
// (scripts/fetch-stablecoin-yield.mjs, hourly cron) writes
// data/stablecoin-yield.json; the page reads it here and merges Harvest's own
// live stablecoin vaults (data/vaults.json via getLiveVaults) into the same
// APY-sorted table at render time, so the two operator types never share a
// pipeline but always share a ranking.

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getLiveVaults } from "./data";

const YIELD_FILE = join(process.cwd(), "data", "stablecoin-yield.json");

export interface StablecoinRow {
  id: string;
  network: string;
  stablecoin: string;
  platform: string;
  product: string;
  venueType: string;
  venueUrl: string | null;
  operator: "external" | "harvest";
  apy: number;
  apy7d: number | null;
  tvlUsd: number;
  contractAddress: string;
  observedAt: string | null;
  rateBasis: string;
  // Harvest rows only: internal product-page slug.
  slug?: string;
}

export interface StablecoinReport {
  dataModifiedIso: string;
  source: string;
  config: { networks: string[]; topPerNetwork: number; minTvlUsd: number };
  stats: {
    venues: number;
    networks: number;
    bestApy: number;
    bestStablecoin: string;
    bestPlatform: string;
    bestNetwork: string;
    medianApy: number;
    totalTvlUsd: number;
    candidates: number;
    perStablecoin: Record<string, { count: number; best: number; median: number }>;
    bestAnywhere: Record<
      string,
      { apy: number; platform: string; product: string; network: string; candidates: number }
    >;
  };
  rows: StablecoinRow[];
}

export function getStablecoinReport(): StablecoinReport | null {
  if (!existsSync(YIELD_FILE)) return null;
  try {
    return JSON.parse(readFileSync(YIELD_FILE, "utf-8")) as StablecoinReport;
  } catch {
    return null;
  }
}

// Harvest's live USD-stablecoin vaults, shaped like table rows and held to
// the SAME selection discipline as the external side: report networks only,
// top N per network by rate. Without that cap the merged table becomes ~65
// Harvest rows around 20 external ones, which is precisely the "product
// catalog with external garnish" the build spec forbids this page to be.
// EURC is excluded on purpose: it is EUR-denominated and this report compares
// USD stablecoins against USD savings rates (stated in How-we-measure).
export async function getHarvestStablecoinRows(
  networks: string[],
  topPerNetwork: number,
): Promise<StablecoinRow[]> {
  const vaults = await getLiveVaults();
  const rows = vaults
    .filter((v) => v.asset === "USDC" || v.asset === "USDT")
    .filter((v) => networks.includes(v.chain))
    .map((v) => ({
      id: `harvest:${v.slug}`,
      network: v.chain,
      stablecoin: v.asset,
      platform: "Harvest",
      product: v.productName,
      venueType: "Autocompounding vault",
      venueUrl: null,
      operator: "harvest" as const,
      apy: Math.round(v.apy24h * 100) / 100,
      apy7d: null,
      tvlUsd: Math.round(v.tvl),
      contractAddress: v.contractAddress,
      observedAt: null,
      rateBasis: "current (Harvest indexer)",
      slug: v.slug,
    }))
    .filter((r) => r.apy >= 0.01); // same display floor as everywhere else

  const byNetwork = new Map<string, StablecoinRow[]>();
  for (const r of rows) {
    const list = byNetwork.get(r.network) ?? [];
    list.push(r);
    byNetwork.set(r.network, list);
  }
  return [...byNetwork.values()].flatMap((list) =>
    list.sort((a, b) => b.apy - a.apy).slice(0, topPerNetwork),
  );
}

// The merged, APY-descending market table. No pinning, no operator-aware
// secondary sort (build spec 4.2): if a Harvest row ranks below Aave that
// day, it renders below Aave.
export async function getMergedStablecoinTable(
  report: StablecoinReport,
): Promise<StablecoinRow[]> {
  const harvest = await getHarvestStablecoinRows(
    report.config.networks,
    report.config.topPerNetwork,
  );
  return [...report.rows, ...harvest].sort((a, b) => b.apy - a.apy);
}

// Median across the exact rows the table renders, so the lead's count and
// median describe the same population (the site's consistency rule: every
// prose figure derives from the same source as the table cell).
export function medianApyOf(rows: StablecoinRow[]): number {
  const apys = rows.map((r) => r.apy).sort((a, b) => a - b);
  return Math.round(apys[Math.floor(apys.length / 2)] * 100) / 100;
}

export function shortAddr(a: string): string {
  if (!a || !a.startsWith("0x") || a.length < 12) return a;
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}
