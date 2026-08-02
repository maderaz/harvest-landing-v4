import type { YieldVault } from "./types";
import type { FullVaultHistory } from "./data";
import { formatAPY, formatTVL, stripChainSuffix } from "./format";
import { freshness } from "./freshness";
import { LOW_LIQUIDITY_TVL_THRESHOLD } from "./admin-rules";

// Single source for every figure on /usdc.
//
// The rebuild's whole premise is that the page states its answer in prose
// before the table, so the same rate now appears in the hero sentence, a key
// finding, table 1, a venue bullet, an FAQ answer and the ItemList. Six
// renderings of one number is six chances to disagree, and a page whose own
// hero contradicts its own table is worth less than one that never made the
// claim. Everything below is computed once here and read from everywhere
// else; no consumer recomputes.

export interface UsdcNetwork {
  chain: string;
  count: number;
  bestApy: number;
  tvl: number;
}

export interface UsdcVenue {
  /** "Aave", "Morpho", "Compound V3" - the venue half of vault.category. */
  venue: string;
  count: number;
  minApy: number;
  maxApy: number;
  medianApy: number;
  tvl: number;
  chains: string[];
}

export interface UsdcCohort {
  /** Vaults sorted by 24h APY desc, productName already disambiguated. */
  all: YieldVault[];
  top10: YieldVault[];
  count: number;
  chains: string[];
  chainCount: number;
  /** Newest observation across the cohort's history, as an ISO string. */
  asOfIso: string;
  /** "July 31, 2026" - house format, UTC. */
  asOf: string;
  /**
   * Highest-paying strategy that clears the low-liquidity floor. Every
   * "the highest USDC yield was X" claim on the page reads from here, never
   * from the raw top of the table. See fundedFloor.
   */
  best: YieldVault | null;
  /** Raw top of the ranking, floor ignored. Used only alongside its own TVL. */
  bestRaw: YieldVault | null;
  funded: YieldVault[];
  fundedCount: number;
  fundedFloor: number;
  fundedMinApy: number;
  fundedMaxApy: number;
  minApy: number;
  maxApy: number;
  medianApy: number;
  meanApy: number;
  /** Mean weighted by TVL. Named for the column, since "capital" is banned. */
  tvlWeightedApy: number;
  totalTvl: number;
  byNetwork: UsdcNetwork[];
  byVenue: UsdcVenue[];
}

// True median. The shared asset-hub body takes sortedApys[floor(len / 2)],
// which on an even-length cohort returns the upper-middle element rather than
// the midpoint of the two middle ones. With 54 rows that is the 28th value
// presented as "the median". Corrected here rather than there so /eth, /btc
// and /usdt stay byte-identical: they are the control group this rebuild is
// measured against.
function median(sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 0;
  const mid = sortedAsc.length / 2;
  return sortedAsc.length % 2
    ? sortedAsc[Math.floor(mid)]
    : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

// Spec section 4: 51 of the 54 rows resolve to only 36 distinct names, with
// "USDC Aave" appearing four times and "USDC Autopilot" three, separated in
// the rendered table by a network icon alone. A parser reading four identical
// names against four different rates cannot tell them apart, and neither can
// a reader on a screen narrow enough to have dropped the network column.
//
// Applied unconditionally rather than only on collision, so every name in
// both tables and in the ItemList carries its network. getDisambiguatedDisplayName
// in lp-pair.ts does the collision-only variant for product-page FAQ copy;
// this page wants the invariant.
export function usdcDisplayName(vault: YieldVault): string {
  return `${vault.productName} (${vault.chain})`;
}

export function venueOf(vault: YieldVault): string {
  return stripChainSuffix(vault.category, vault.chain) || "Other";
}

// Which row is allowed to be called "the highest USDC yield".
//
// The raw top of this ranking is routinely a vault holding a few hundred
// dollars: on 2 August 2026 it was USDC Aave on zkSync paying 42.55% against
// $352, with 31 of 55 rows under $100. Putting that figure in the page's
// first sentence hands an answer engine a number no reader can act on, and it
// is the first thing a visitor comparing against the table would call wrong.
//
// LOW_LIQUIDITY_TVL_THRESHOLD is the operator's existing floor for exactly
// this judgement, documented in admin-rules.ts as the point below which a
// thin pool "can't read as an unqualified best pick". Reused rather than
// duplicated so the page and the admin panel cannot disagree.
//
// It scopes the superlative only. Nothing is hidden: every row still renders
// in both tables with its own TVL beside it, and the page states the floor in
// the sentence that applies it rather than filtering silently.
const FUNDED_FLOOR = LOW_LIQUIDITY_TVL_THRESHOLD;

// Networks this ranking does not cover.
//
// zkSync is legacy dust. Across the whole index it holds $1,027 spread over 11
// vaults, and its entire USDC presence is one Aave market holding $352. That
// single row sorted first at 42.55% and became the top of the ranking, the
// network breakdown's "top APY" for zkSync, and the outer bound of the venue
// range for Aave: one dead $352 position shaping three separate claims on the
// page.
//
// Excluded here rather than in data/hidden.json because that file is
// sitewide and would move /eth, /btc and /usdt, which are the control group
// for measuring this rebuild. Revisit as a sitewide hide once the measurement
// window closes.
const EXCLUDED_CHAINS = new Set(["zkSync"]);

// A rate below a hundredth of a percent formats as "0.00%", which asserts a
// measured zero for what is really no measurable rate. Same dust cutoff the
// prose generators elsewhere use.
export function apyFloorLabel(v: number): string {
  return v > 0 && v < 0.005 ? "under 0.01%" : formatAPY(v);
}

const utcLongDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export function buildUsdcCohort(
  usdcVaults: YieldVault[],
  history: Record<string, FullVaultHistory> | null,
): UsdcCohort {
  const all = usdcVaults
    .filter((v) => !EXCLUDED_CHAINS.has(v.chain))
    .map((v) => ({ ...v, productName: usdcDisplayName(v) }))
    .sort((a, b) => b.apy24h - a.apy24h);

  const apysAsc = all.map((v) => v.apy24h).sort((a, b) => a - b);
  const totalTvl = all.reduce((s, v) => s + v.tvl, 0);

  // dateModified must be the newest reading we actually hold, never the build
  // clock: the site rebuilds hourly whether or not the upstream feed moved, and
  // stamping a build time onto unchanged data is a freshness claim we cannot
  // support. freshness() already defines freshestTs as "the honest as-of
  // reference" for exactly this reason.
  let newestTs = 0;
  if (history) {
    for (const v of usdcVaults) {
      const h = history[v.contractAddress] ?? history[v.contractAddress.toLowerCase()];
      if (!h) continue;
      const ts = freshness(h).freshestTs;
      if (ts > newestTs) newestTs = ts;
    }
  }
  const asOfIso = new Date((newestTs || Math.floor(Date.now() / 1000)) * 1000).toISOString();

  const byNetwork = Object.values(
    all.reduce<Record<string, UsdcNetwork>>((acc, v) => {
      const cur = acc[v.chain] ?? { chain: v.chain, count: 0, bestApy: 0, tvl: 0 };
      cur.count += 1;
      cur.tvl += v.tvl;
      if (v.apy24h > cur.bestApy) cur.bestApy = v.apy24h;
      acc[v.chain] = cur;
      return acc;
    }, {}),
  ).sort((a, b) => b.count - a.count || b.bestApy - a.bestApy);

  const venueGroups = all.reduce<Record<string, YieldVault[]>>((acc, v) => {
    const k = venueOf(v);
    (acc[k] ??= []).push(v);
    return acc;
  }, {});

  const byVenue: UsdcVenue[] = Object.entries(venueGroups)
    .map(([venue, rows]) => {
      const asc = rows.map((r) => r.apy24h).sort((a, b) => a - b);
      return {
        venue,
        count: rows.length,
        minApy: asc[0],
        maxApy: asc[asc.length - 1],
        medianApy: median(asc),
        tvl: rows.reduce((s, r) => s + r.tvl, 0),
        chains: [...new Set(rows.map((r) => r.chain))],
      };
    })
    .sort((a, b) => b.count - a.count || b.medianApy - a.medianApy);

  const funded = all.filter((v) => v.tvl >= FUNDED_FLOOR);
  const fundedApysAsc = funded.map((v) => v.apy24h).sort((a, b) => a - b);

  return {
    all,
    top10: all.slice(0, 10),
    count: all.length,
    chains: byNetwork.map((n) => n.chain),
    chainCount: byNetwork.length,
    asOfIso,
    asOf: utcLongDate(asOfIso),
    best: funded[0] ?? all[0] ?? null,
    bestRaw: all[0] ?? null,
    funded,
    fundedCount: funded.length,
    fundedFloor: FUNDED_FLOOR,
    fundedMinApy: fundedApysAsc[0] ?? 0,
    fundedMaxApy: fundedApysAsc[fundedApysAsc.length - 1] ?? 0,
    minApy: apysAsc[0] ?? 0,
    maxApy: apysAsc[apysAsc.length - 1] ?? 0,
    medianApy: median(apysAsc),
    meanApy: all.length ? apysAsc.reduce((s, v) => s + v, 0) / all.length : 0,
    tvlWeightedApy: totalTvl > 0 ? all.reduce((s, v) => s + v.apy24h * v.tvl, 0) / totalTvl : 0,
    totalTvl,
    byNetwork,
    byVenue,
  };
}

// ---- prose helpers --------------------------------------------------------
// Every sentence below leads with its scope clause and closes with a date,
// per spec section 3.3: answer engines lift partial sentences, so a figure
// whose grammatical subject is "USDC yield" rather than "the strategies
// Harvest tracks" gets quoted as a market-wide claim we never made.

export const apy = (v: number): string => formatAPY(v);
export const tvl = (v: number): string => formatTVL(v);

/** Oxford-free list join: "Base, Ethereum and Arbitrum". */
export function listOf(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export const plural = (n: number, one: string, many: string): string =>
  n === 1 ? one : many;

export function answerSentence(c: UsdcCohort): string {
  if (!c.best) return "";
  return (
    `Across the ${c.count} USDC strategies Harvest tracks on ${c.chainCount} ` +
    `${plural(c.chainCount, "network", "networks")}, the highest 24-hour APY on a strategy ` +
    `holding at least ${tvl(c.fundedFloor)} was ${apy(c.best.apy24h)} on ${c.best.productName} ` +
    `as of ${c.asOf}, against a median of ${apy(c.medianApy)} across the whole index.`
  );
}

export function keyFindings(c: UsdcCohort): string[] {
  if (!c.best || !c.bestRaw) return [];
  const [first, second] = c.byNetwork;
  // "USDC 40 Acres (Base), a 40 Acres strategy" is the shape to avoid: many
  // product names already carry their venue, so the clause only earns its place
  // when it adds one.
  const bestVenue = venueOf(c.best);
  const venueClause = c.best.productName.includes(bestVenue) ? " " : `, a ${bestVenue} strategy, `;
  const out = [
    `The highest USDC yield in Harvest's index on a strategy holding at least ` +
      `${tvl(c.fundedFloor)} was ${apy(c.best.apy24h)} on ${c.best.productName}` +
      `${venueClause}as of ${c.asOf}.`,
    `The median USDC rate across all ${c.count} tracked strategies was ` +
      `${apy(c.medianApy)} as of ${c.asOf}, and the average weighted by TVL was ` +
      `${apy(c.tvlWeightedApy)}.`,
  ];
  // The spread claim is made over the funded cohort. When the raw top of the
  // ranking is a different, thinner vault it gets named with its size in the
  // same breath, because the two figures otherwise look like a contradiction
  // to anyone reading the table underneath. When the two coincide the clause
  // is dropped rather than restating the first bullet.
  const rawDiffers = c.bestRaw.slug !== c.best.slug;
  out.push(
    `Rates on the ${c.fundedCount} strategies holding at least ${tvl(c.fundedFloor)} ran from ` +
      `${apy(c.fundedMinApy)} to ${apy(c.fundedMaxApy)} as of ${c.asOf}` +
      (rawDiffers
        ? `, while the highest rate anywhere in the index was ${apy(c.bestRaw.apy24h)} on ` +
          `${c.bestRaw.productName}, which held ${tvl(c.bestRaw.tvl)}.`
        : `, across ${listOf([...new Set(c.funded.map((v) => v.chain))])}.`),
  );
  if (first) {
    out.push(
      `${first.chain} carried more USDC strategies than any other network Harvest tracks, ` +
        `${first.count} of ${c.count} as of ${c.asOf}, holding ${tvl(first.tvl)}` +
        (second
          ? `, against ${second.count} on ${second.chain} holding ${tvl(second.tvl)}`
          : "") +
        `.`,
    );
  }
  return out;
}

/**
 * One dated sentence per venue family, for the block that answers the
 * venue-qualified half of the keyword set (spec section 6.1: 1,870 of 4,390
 * US searches name a protocol). Only families actually present in the cohort
 * produce a line, so a build where a venue drops out silently loses its
 * bullet instead of printing a stale rate.
 */
export function venueLines(c: UsdcCohort, families: string[]): string[] {
  return families
    .map((name) => c.byVenue.find((v) => v.venue === name))
    .filter((v): v is UsdcVenue => Boolean(v))
    .map((v) => {
      // Median first, range second. The median is the figure worth quoting,
      // and leading with a range hands an answer engine the top of it.
      const where = `on ${listOf(v.chains)}`;
      if (v.count === 1) {
        return `${v.venue} USDC paid ${apy(v.medianApy)} ${where} as of ${c.asOf}.`;
      }
      const head =
        `${v.venue} USDC paid a median of ${apy(v.medianApy)} across ${v.count} markets ` +
        `${where} as of ${c.asOf}`;
      if (v.minApy.toFixed(2) === v.maxApy.toFixed(2)) return `${head}.`;
      return `${head}, within a range of ${apyFloorLabel(v.minApy)} to ${apy(v.maxApy)}.`;
    });
}

/** "Base (19 strategies, top APY 11.24%), Ethereum (17, top 10.17%)" */
export function networkBlock(c: UsdcCohort): string {
  return listOf(
    c.byNetwork.map(
      (n) =>
        `${n.chain} (${n.count} ${plural(n.count, "strategy", "strategies")}, ` +
        `top APY ${apy(n.bestApy)})`,
    ),
  );
}

export function protocolBlock(c: UsdcCohort, limit = 5): string {
  return listOf(c.byVenue.slice(0, limit).map((v) => `${v.venue} (${v.count})`));
}
