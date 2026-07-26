// Build-time reader for the /polygon mixed ranking. Mirrors the
// readFileSync-at-build pattern in src/lib/data.ts. The venues themselves
// (which ones exist, their display copy, their source config) live in
// data/polygon-venues.json; their live rate/TVL is hydrated on top by
// scripts/fetch-polygon-yield.mjs into data/polygon-yield.json. If the
// pipeline hasn't run yet (fresh checkout), we fall back to the registry
// with every row marked rateNa so the page still builds.

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const VENUES_FILE = join(process.cwd(), "data", "polygon-venues.json");
const YIELD_FILE = join(process.cwd(), "data", "polygon-yield.json");

export interface PolygonVenue {
  id: string;
  venueSlug: string;
  chain: string;
  asset: string;
  assetGroup: string;
  detail: string | null;
  symbol: string;
  platform: string;
  platformUrl: string;
  entity: string | null;
  category: string | null;
  productType: string | null;
  operator: "external";
  exposure: "single" | "multi";
  accessNote: string | null;
  editorialNote: string | null;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  // Realized trailing-30d yield, computed from Aave's accrual index rather
  // than averaged spot samples. Null until the daily series spans ~30 days;
  // free Polygon RPCs do not serve archive state, so it cannot be backfilled
  // and matures as the hourly cron runs. Never fall back to an aggregator's
  // 30d figure here: methodology#data-sources states no third-party yield
  // aggregator is the source for any listed rate.
  apyMean30d: number | null;
  borrowApy: number | null;
  utilization: number | null;
  borrowedUsd: number | null;
  rateNa: boolean;
  rateBasis: string;
  source?: string;
  history?: { d: string; apy: number; tvl: number; idx?: number | null }[];
}

function fallbackFromRegistry(): PolygonVenue[] {
  const doc = JSON.parse(readFileSync(VENUES_FILE, "utf-8"));
  return (doc.venues ?? []).map((v: Record<string, unknown>) => ({
    id: v.slug,
    venueSlug: v.slug,
    chain: v.chain,
    asset: v.asset,
    assetGroup: v.assetGroup,
    detail: v.detail ?? null,
    symbol: v.symbol,
    platform: v.platform,
    platformUrl: v.url,
    entity: v.entity ?? null,
    category: v.productType ?? null,
    productType: v.productType ?? null,
    operator: "external",
    exposure: v.exposure ?? "single",
    accessNote: v.accessNote ?? null,
    editorialNote: v.editorialNote ?? null,
    tvlUsd: 0,
    apy: null,
    apyBase: null,
    apyMean30d: null,
    borrowApy: null,
    utilization: null,
    borrowedUsd: null,
    rateNa: true,
    rateBasis: "na",
  }));
}

export function getPolygonVenues(): PolygonVenue[] {
  if (!existsSync(YIELD_FILE)) return fallbackFromRegistry();
  try {
    const doc = JSON.parse(readFileSync(YIELD_FILE, "utf-8"));
    const rows = doc.venues;
    return Array.isArray(rows) && rows.length ? rows : fallbackFromRegistry();
  } catch {
    return fallbackFromRegistry();
  }
}

export function getPolygonVenueCount(): number {
  try {
    const doc = JSON.parse(readFileSync(VENUES_FILE, "utf-8"));
    return Array.isArray(doc.venues) ? doc.venues.length : 0;
  } catch {
    return 0;
  }
}

export interface PolygonAssetGroup {
  assetGroup: string;
  venues: PolygonVenue[];
  bestApy: number;
  totalTvlUsd: number;
}

// Groups ordered by best (max) APY across the group's rated rows, so the
// section order itself reflects "where the best rate lives," matching the
// ranking's own sort logic rather than an arbitrary asset list order.
export function groupPolygonVenuesByAsset(venues: PolygonVenue[]): PolygonAssetGroup[] {
  const byGroup = new Map<string, PolygonVenue[]>();
  for (const v of venues) {
    const list = byGroup.get(v.assetGroup) ?? [];
    list.push(v);
    byGroup.set(v.assetGroup, list);
  }
  const groups: PolygonAssetGroup[] = [...byGroup.entries()].map(([assetGroup, rows]) => {
    const sorted = [...rows].sort((a, b) => (b.apy ?? -Infinity) - (a.apy ?? -Infinity));
    return {
      assetGroup,
      venues: sorted,
      bestApy: sorted.reduce((m, v) => (v.apy != null && v.apy > m ? v.apy : m), 0),
      totalTvlUsd: sorted.reduce((s, v) => s + (v.tvlUsd || 0), 0),
    };
  });
  return groups.sort((a, b) => b.bestApy - a.bestApy);
}

// ---------------------------------------------------------------------------
// Market-condition commentary
//
// Aave pays suppliers out of borrower interest, so utilization is not a
// footnote on the rate -- it IS the rate's explanation. A pool holding $55M
// that almost nobody borrows from pays close to nothing, and saying so is more
// useful than restating the APY in prose. Everything below is derived from
// values this pipeline already reads onchain (utilization, borrow rate,
// supplied and borrowed amounts), so the commentary moves when the market
// moves instead of going stale like hand-written copy.
//
// House style applies: no em dashes, "onchain" not "on-chain", and none of the
// banned words the build gate enforces (no "deposit", "capital", "returns",
// "invest" family) -- these strings are rendered prose and are linted.

export type UtilizationBand = "idle" | "light" | "balanced" | "tight";

export function utilizationBand(u: number | null): UtilizationBand | null {
  if (u == null || !Number.isFinite(u)) return null;
  if (u < 10) return "idle";
  if (u < 35) return "light";
  if (u < 70) return "balanced";
  return "tight";
}

const BAND_LABEL: Record<UtilizationBand, string> = {
  idle: "Almost no borrowing",
  light: "Light borrowing",
  balanced: "Steady borrowing",
  tight: "Heavy borrowing",
};

export function utilizationLabel(u: number | null): string | null {
  const b = utilizationBand(u);
  return b ? BAND_LABEL[b] : null;
}

const pctStr = (v: number, dp = 1) => `${v.toFixed(dp)}%`;

function usdShort(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// One paragraph explaining why this venue's rate is what it is, right now.
export function conditionsCommentary(v: PolygonVenue): string | null {
  const { utilization: u, apy, borrowApy, tvlUsd, borrowedUsd, asset } = v;
  if (u == null || apy == null) return null;
  const band = utilizationBand(u);
  const idle = tvlUsd - (borrowedUsd ?? 0);
  const rate = `${apy.toFixed(2)}%`;
  const borrow = borrowApy != null ? `${borrowApy.toFixed(2)}%` : null;

  const spread =
    borrowApy != null && borrowApy > 0
      ? ` Borrowers pay ${borrow} against that, and the gap between the two sides is what the protocol keeps plus what the unborrowed share dilutes away.`
      : "";

  if (band === "idle") {
    return (
      `Only ${pctStr(u)} of the ${asset} supplied here is currently borrowed. That single number is the ` +
      `whole explanation for the ${rate} supply rate: Aave pays suppliers out of borrower interest, and with ` +
      `roughly ${usdShort(idle)} sitting unborrowed there is very little interest to divide.${spread} ` +
      `Size is not the constraint here, demand is.`
    );
  }
  if (band === "light") {
    return (
      `About ${pctStr(u)} of the ${asset} supplied here is borrowed, which puts this market in the lower part ` +
      `of Aave's rate curve and keeps the supply rate near ${rate}.${spread} The rate moves with borrower ` +
      `demand rather than with how much is supplied, so it can climb quickly if borrowing picks up, and it ` +
      `falls just as fast when fresh supply arrives faster than demand for it.`
    );
  }
  if (band === "balanced") {
    return (
      `Roughly ${pctStr(u)} of the ${asset} supplied here is borrowed. That is squarely in the range Aave's ` +
      `rate curve is tuned for, which is why the supply rate sits at ${rate} rather than at either extreme.` +
      `${spread} Around ${usdShort(idle)} remains unborrowed, so withdrawals are not competing for a thin ` +
      `buffer at present.`
    );
  }
  return (
    `Around ${pctStr(u)} of the ${asset} supplied here is borrowed, past the kink where Aave's rate curve ` +
    `steepens. That is why the supply rate reaches ${rate}, the highest band this market pays.${spread} ` +
    `The trade-off is the other side of the same number: only about ${usdShort(idle)} is unborrowed, so this ` +
    `market is more sensitive to a large withdrawal than a lightly used one, and the rate is the market ` +
    `paying for exactly that.`
  );
}

// Short, factual sub-line for a table row or a card. Distinct from the
// paragraph above: this has to survive being read on its own.
export function conditionsSummary(v: PolygonVenue): string | null {
  const { utilization: u, borrowApy } = v;
  if (u == null) return null;
  const label = utilizationLabel(u);
  const borrow = borrowApy != null ? `, borrow ${borrowApy.toFixed(2)}%` : "";
  return `${label}: ${pctStr(u)} utilized${borrow}`;
}

// How the trailing figure should be described. The pipeline cannot backfill a
// 30-day number (no archive RPC), so the honest states are "we have it" and
// "it is still accumulating", never a silently substituted spot value.
export function trailingRateNote(v: PolygonVenue): string {
  if (v.apyMean30d != null) {
    return (
      `The 30-day figure is realized, not projected: it is computed from Aave's own accrual index, so it ` +
      `reflects what a supplier actually earned over the window rather than an average of daily snapshots.`
    );
  }
  return (
    `A 30-day figure is not shown yet. It is computed from Aave's accrual index across our own stored daily ` +
    `readings, and those readings only started accumulating recently. Public Polygon nodes do not serve the ` +
    `historical contract state needed to fill it in retroactively, and we do not substitute a third-party ` +
    `aggregator's number in its place.`
  );
}
