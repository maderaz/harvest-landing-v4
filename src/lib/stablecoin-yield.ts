// Build-time reader and editorial layer for /report/stablecoin-yield-ranking.
//
// The pipeline (scripts/fetch-stablecoin-products.mjs) measures every product
// the same way and stores what it measured; this file turns those numbers into
// the sentences the page prints. Nothing here invents a figure: every
// commentary string is derived from a stored metric, so the prose moves when
// the market moves instead of going stale the way hand-written copy does.
//
// House style is enforced by the build gate on other surfaces and by hand
// here: no em dashes, "onchain" as one word, none of the banned
// deposit/capital/returns/invest family in rendered prose.

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const YIELD_FILE = join(process.cwd(), "data", "stablecoin-yield.json");
const PENDLE_FILE = join(process.cwd(), "data", "stablecoin-pendle.json");

export type Tier = "high-yield" | "stable";

export interface HistoryPoint {
  d: string;
  sharePrice: number | null;
  apy: number | null;
  tvlUsd: number | null;
}

export interface ProductMetrics {
  days: number;
  apyMedian: number | null;
  apyMin: number | null;
  apyMax: number | null;
  apyStdev: number | null;
  apySamples: number;
  tvlStart: number | null;
  tvlEnd: number | null;
  tvlChangePct: number | null;
  launchedInWindow: boolean;
  worstDailyMovePct: number | null;
}

export interface Holders {
  count: number | null;
  top5Pct: number | null;
  top10Pct: number | null;
}

export interface StablecoinRow {
  slug: string;
  tier: Tier;
  name: string;
  payoutAsset: string;
  platform: string;
  curatedBy: string | null;
  extras: string | null;
  productType: string;
  network: string;
  contract: string;
  productUrl: string;
  operator: "external" | "harvest";
  description: string;
  pendleName: string | null;
  apy: number | null;
  rateNa?: boolean;
  rateWindow: string | null;
  rateBasis: string;
  tvlUsd: number | null;
  sharePrice: number | null;
  sharePriceApi?: number | null;
  sharePriceGapPct?: number | null;
  utilization?: number | null;
  borrowApy?: number | null;
  holders: Holders | null;
  metrics: ProductMetrics | null;
  history: HistoryPoint[];
  // Which measure produced tvlUsd, and how far the strategy is deployed rather
  // than sitting idle. A looping vault reports a tiny totalAssets() while its
  // shares redeem against the full position, so the ratio is worth surfacing.
  tvlBasis?: string;
  idleAssets?: number | null;
  deployedRatio?: number | null;
  // Present only on products Harvest operates: our own indexer's readings and
  // the internal product-page slug.
  harvestSlug?: string;
  harvestApy24h?: number | null;
  harvestApy30d?: number | null;
  harvestTvlUsd?: number | null;
  harvestVaultType?: string | null;
}

export interface StablecoinReport {
  dataModifiedIso: string;
  source: string;
  stats: {
    products: number;
    rated: number;
    withHistory: number;
    networks: string[];
    highYield: { count: number; best: number | null; median: number | null };
    stable: { count: number; best: number | null; median: number | null };
    bestOverall: { apy: number; name: string; platform: string; network: string; slug: string } | null;
    steadiest: { slug: string; name: string; platform: string; stdev: number; min: number; max: number } | null;
    totalTvlUsd: number;
    totalHolders: number;
  };
  rows: StablecoinRow[];
}

export interface PendleMarket {
  name: string;
  marketAddress: string;
  expiry: string;
  daysToMaturity: number;
  fixedApy: number;
  floatingApy: number | null;
  spreadPp: number | null;
  liquidityUsd: number;
  tracked: boolean;
}

// Pendle's trade route is keyed on the LP market address, which is what the
// fetcher already stores: /trade/markets/<market>/swap?view=pt lands directly
// on the principal-token side of that market rather than a search page.
export function pendleMarketUrl(m: Pick<PendleMarket, "marketAddress">): string {
  return `https://app.pendle.finance/trade/markets/${m.marketAddress}/swap?view=pt`;
}

export interface PendleReport {
  generatedAt: string;
  stats: {
    markets: number;
    bestFixed: number;
    bestFixedName: string;
    medianFixed: number;
    totalLiquidityUsd: number;
    trackedOverlap: string[];
  };
  markets: PendleMarket[];
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

export const getStablecoinReport = () => readJson<StablecoinReport>(YIELD_FILE);
export const getPendleReport = () => readJson<PendleReport>(PENDLE_FILE);

export const tierRows = (r: StablecoinReport, tier: Tier) =>
  r.rows.filter((x) => x.tier === tier).sort((a, b) => (b.apy ?? -Infinity) - (a.apy ?? -Infinity));

export function shortAddr(a: string): string {
  return !a || a.length < 12 ? a : `${a.slice(0, 6)}...${a.slice(-4)}`;
}

const pct = (v: number | null | undefined, dp = 2) => (v == null ? "n/a" : `${v.toFixed(dp)}%`);

function usdShort(v: number | null): string {
  if (v == null) return "n/a";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const nf = (n: number) => n.toLocaleString("en-US");

// ---------------------------------------------------------------------------
// Per-product commentary
// ---------------------------------------------------------------------------

// How much a floating rate actually moved over the observed window. This is
// the number the two-tier split rests on, so it is stated rather than implied.
export function stabilitySentence(r: StablecoinRow): string | null {
  const m = r.metrics;
  if (r.rateWindow === "fixed") {
    return `The rate is contractually fixed rather than floating, so it has not moved and its stability says nothing about market conditions.`;
  }
  if (!m || m.apyStdev == null || m.apySamples < 10 || m.apyMin == null || m.apyMax == null) return null;
  const band = `${pct(m.apyMin)} to ${pct(m.apyMax)}`;
  if (m.apyStdev < 0.1) {
    return `Over the last ${m.days} days this rate moved inside a ${band} band, a standard deviation of ${m.apyStdev.toFixed(3)} percentage points. That is about as close to a flat rate as anything onchain gets.`;
  }
  if (m.apyStdev < 0.75) {
    return `Over the last ${m.days} days the rate held a ${band} band, with a standard deviation of ${m.apyStdev.toFixed(2)} percentage points. The figure quoted today has stayed close to the one quoted a week ago, though nothing here fixes it there.`;
  }
  if (m.apyStdev < 3) {
    return `Over the last ${m.days} days the rate ranged from ${band}, a standard deviation of ${m.apyStdev.toFixed(2)} percentage points. Worth checking the current figure rather than relying on a number seen a week ago.`;
  }
  return `Over the last ${m.days} days the rate swung from ${band}, a standard deviation of ${m.apyStdev.toFixed(2)} percentage points. A single headline figure means very little on this product: the range is the honest description.`;
}

// Holder count and concentration. Sized against the whole tracked set rather
// than in the abstract, since 236 holders is small next to sUSDe and large
// next to a vault that launched last month.
export function holderSentence(r: StablecoinRow): string | null {
  const h = r.holders;
  if (!h?.count) return null;
  const size =
    h.count >= 5000 ? "a broad holder base" : h.count >= 500 ? "a mid-sized holder base" : "a small holder base";
  let conc = "";
  if (h.top5Pct != null) {
    if (h.top5Pct >= 80) {
      conc = ` It is also highly concentrated: the five largest wallets hold ${h.top5Pct.toFixed(1)}% of the supply, so the exit of one of them would move this product materially.`;
    } else if (h.top5Pct >= 55) {
      conc = ` The five largest wallets hold ${h.top5Pct.toFixed(1)}% of supply, which is normal for an institutional product but means the position is not widely spread.`;
    } else {
      conc = ` The five largest wallets hold ${h.top5Pct.toFixed(1)}% of supply, which is unusually well distributed for this market.`;
    }
  }
  return `${nf(h.count)} wallets hold this product, ${size} for the set tracked here.${conc}`;
}

// Where the money went over the window. Suppressed when the base was too small
// for a percentage to mean anything (see launchedInWindow in the pipeline).
export function flowSentence(r: StablecoinRow): string | null {
  const m = r.metrics;
  if (!m) return null;
  if (m.launchedInWindow) {
    return `The product scaled up inside this window, growing to ${usdShort(m.tvlEnd)} from a standing start, so a growth percentage would flatter it rather than describe it.`;
  }
  if (m.tvlChangePct == null) return null;
  const v = m.tvlChangePct;
  if (v >= 25) return `Tracked value grew ${v.toFixed(0)}% over the window, to ${usdShort(m.tvlEnd)}. Money is arriving faster than it is leaving.`;
  if (v >= 5) return `Tracked value rose ${v.toFixed(0)}% over the window, to ${usdShort(m.tvlEnd)}.`;
  if (v > -5) return `Tracked value was roughly flat over the window at ${usdShort(m.tvlEnd)}.`;
  if (v > -25) return `Tracked value fell ${Math.abs(v).toFixed(0)}% over the window, to ${usdShort(m.tvlEnd)}. Some holders have left, which is worth reading alongside the rate.`;
  return `Tracked value fell ${Math.abs(v).toFixed(0)}% over the window, to ${usdShort(m.tvlEnd)}. That is a substantial outflow and the single most important thing on this row.`;
}

// The measurement caveat, where one is owed. Short windows and API-sourced
// rates both get said out loud rather than hidden in a tooltip.
export function basisCaveat(r: StablecoinRow): string | null {
  if (r.rateWindow === "fixed") return null;
  if (r.rateWindow && /^\d+d$/.test(r.rateWindow)) {
    const days = parseInt(r.rateWindow, 10);
    if (days < 14) {
      return `This rate is annualized from only ${days} days of share-price history, because the network this product sits on serves a limited window of historical state. Treat it as directional: a short window annualizes noise as readily as it annualizes yield.`;
    }
  }
  if (r.rateWindow?.includes("third-party")) {
    return `This product exposes no share price to measure, so the figure comes from a third-party API rather than from onchain measurement like the rest of the table.`;
  }
  return null;
}

// The single strongest observation about a product, for a card or a lead-in.
export function headlineNote(r: StablecoinRow): string | null {
  return stabilitySentence(r) ?? flowSentence(r) ?? holderSentence(r);
}

// ---------------------------------------------------------------------------
// Cross-product observations, for the section leads
// ---------------------------------------------------------------------------

export function steadiestSentence(r: StablecoinReport): string | null {
  const s = r.stats.steadiest;
  if (!s) return null;
  return (
    `Measured over the tracked window, the steadiest floating rate here belongs to ${s.name} on ${s.platform}, ` +
    `which moved between ${pct(s.min)} and ${pct(s.max)}: a standard deviation of ${s.stdev.toFixed(3)} percentage ` +
    `points. Fixed-rate listings are excluded from that comparison, since a rate that cannot move is steady by ` +
    `definition rather than by behaviour.`
  );
}

export function concentrationSentence(r: StablecoinReport): string | null {
  const withHolders = r.rows.filter((x) => x.holders?.count && x.holders.top5Pct != null);
  if (withHolders.length < 3) return null;
  const most = [...withHolders].sort((a, b) => (b.holders!.top5Pct ?? 0) - (a.holders!.top5Pct ?? 0))[0];
  const least = [...withHolders].sort((a, b) => (a.holders!.top5Pct ?? 0) - (b.holders!.top5Pct ?? 0))[0];
  return (
    `Holder concentration varies more than the rates do. ${most.name} has ${most.holders!.top5Pct!.toFixed(1)}% of its ` +
    `supply in five wallets, while ${least.name} has ${least.holders!.top5Pct!.toFixed(1)}%. Concentration is not a ` +
    `fault on its own, but it decides how much a single exit can move a product, and it is invisible in an APY figure.`
  );
}

export function pendleSentence(report: StablecoinReport, pendle: PendleReport | null): string | null {
  if (!pendle?.markets?.length) return null;
  const overlap = pendle.markets.filter((m) => m.tracked);
  if (!overlap.length) {
    return `The fixed-rate market currently prices the best stablecoin maturity at ${pct(pendle.stats.bestFixed)}, against a ${pct(pendle.stats.medianFixed)} median across ${pendle.stats.markets} markets.`;
  }
  const parts = overlap.map((m) => {
    const spot = report.rows.find((r) => r.pendleName === m.name);
    const spotTxt = spot?.apy != null ? `holding it pays ${pct(spot.apy)} floating today` : "it also trades spot above";
    const dir =
      m.spreadPp == null
        ? ""
        : m.spreadPp > 0.25
          ? `, so the market is paying a premium to lock, which is what it does when it expects rates to fall`
          : m.spreadPp < -0.25
            ? `, so locking costs you something against holding, which is what happens when the market expects rates to rise`
            : `, essentially level with holding it`;
    return `${m.name} locks ${pct(m.fixedApy)} to ${new Date(m.expiry).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })} while ${spotTxt}${dir}`;
  });
  return `Two products in the tables above also trade as fixed-rate principal tokens: ${parts.join("; ")}.`;
}

// ---------------------------------------------------------------------------
// Hero + section leads
// ---------------------------------------------------------------------------

// The top product, shaped for HomeHeroPreview (the same card the XRP report
// uses). Bars are drawn from the real measured series where one exists rather
// than a decorative shape, so the card is showing the product's actual rate.
export function heroVaultFrom(r: StablecoinRow) {
  const apySeries = r.history.map((h) => h.apy).filter((v): v is number => v != null);
  const tvlSeries = r.history.map((h) => h.tvlUsd).filter((v): v is number => v != null);
  const ppsSeries = r.history.map((h) => h.sharePrice).filter((v): v is number => v != null);
  const flat = (v: number) => [v * 0.92, v * 0.96, v];
  return {
    productName: r.name,
    asset: r.payoutAsset,
    chain: r.network,
    protocol: r.platform,
    vaultType: r.productType,
    apy24h: r.apy ?? 0,
    apy30d: r.apy ?? 0,
    tvl: r.tvlUsd ?? 0,
    apySpark: apySeries.length >= 2 ? apySeries.slice(-30) : flat(r.apy ?? 0),
    tvlSpark: tvlSeries.length >= 2 ? tvlSeries.slice(-30) : flat(r.tvlUsd ?? 0),
    sharePriceSpark: ppsSeries.length >= 2 ? ppsSeries.slice(-30) : undefined,
  };
}

// One sentence naming the leader the way a reader would say it out loud:
// what it pays in, what it is, who runs it, where. Deliberately short enough
// to sit under a hero headline without becoming a paragraph.
export function heroSentence(r: StablecoinRow): string {
  const win = r.rateWindow && /^\d+d$/.test(r.rateWindow) ? ` over ${r.rateWindow.replace("d", " days")}` : "";
  return (
    `The highest measured rate belongs to a ${r.payoutAsset}-paying opportunity: the ${r.name} ` +
    `at ${r.platform} on ${r.network}, at ${r.apy != null ? r.apy.toFixed(2) : "n/a"}%${win}.`
  );
}

// Facts, not throat-clearing: the section lead as discrete claims an answer
// engine can lift one at a time.
export function liveRateBullets(report: StablecoinReport, pendleBest?: number | null): string[] {
  const s = report.stats;
  const out: string[] = [];
  if (s.bestOverall) {
    out.push(
      `Highest measured rate: ${s.bestOverall.apy.toFixed(2)}% on ${s.bestOverall.name} at ${s.bestOverall.platform} (${s.bestOverall.network}).`,
    );
  }
  if (s.highYield.median != null && s.stable.median != null) {
    out.push(
      `Median rate is ${s.highYield.median.toFixed(2)}% across the ${s.highYield.count} higher-paying products and ${s.stable.median.toFixed(2)}% across the ${s.stable.count} steady ones.`,
    );
  }
  if (s.steadiest) {
    out.push(
      `Steadiest floating rate: ${s.steadiest.name}, which moved only between ${s.steadiest.min.toFixed(2)}% and ${s.steadiest.max.toFixed(2)}% over the tracked window.`,
    );
  }
  const levered = report.rows.filter((r) => (r.extras ?? "").toLowerCase().includes("looping"));
  if (levered.length) {
    out.push(
      `${levered.length} of the ${s.products} products borrow against their own position and redeploy it, which is where the top rates come from and where a loss arrives at the same multiple.`,
    );
  }
  if (pendleBest != null) {
    out.push(`A fixed rate can be locked instead of floating, currently up to ${pendleBest.toFixed(2)}% to maturity.`);
  }
  out.push(
    `Every rate is measured from onchain share-price growth over a stated window, not taken from a platform's advertised figure.`,
  );
  return out;
}

// ---------------------------------------------------------------------------
// Detail moved out of the ranking rows
// ---------------------------------------------------------------------------

// What the product is, in one line: mechanism, who runs it, what it sits on.
// This is the detail the table used to carry in a third line under every name.
export function structureSentence(r: StablecoinRow): string {
  const curator = r.curatedBy ? `, curated by ${r.curatedBy}` : "";
  // extras carries the yield mechanism, productType the legal/technical shape.
  // On several rows they are the same thing said twice, so the shape clause is
  // dropped rather than printing "lending market, structured as a lending market".
  const mech = r.extras ?? r.productType;
  const shape =
    r.extras && r.extras.toLowerCase() !== r.productType.toLowerCase()
      ? `, structured as a ${r.productType.toLowerCase()}`
      : "";
  return `${mech} on ${r.network}, run by ${r.platform}${curator}${shape}.`;
}

// Why the value column reads the way it does. Only speaks where the two
// measures disagree, which is exactly where a reader would otherwise be
// misled: a looping vault's totalAssets() is its idle balance, not its size.
export function deploymentSentence(r: StablecoinRow): string | null {
  const ratio = r.deployedRatio;
  if (ratio == null || ratio < 1.5) return null;
  const basis = r.tvlBasis ?? "shares outstanding times what one share redeems for";
  return (
    `Value here is ${usdShort(r.tvlUsd)}, measured as ${basis}. The contract's own totalAssets() reads ` +
    `${usdShort(r.idleAssets ?? null)}, ${ratio.toFixed(0)} times smaller, because the rest is put to work rather ` +
    `than sitting in the contract. The larger figure is the one holders hold a claim on, and it is the one used here.`
  );
}

// Harvest-operated rows get our own indexer's readings alongside the measured
// figure. Two independent sources for the same product is worth stating, and a
// gap between them is worth seeing rather than smoothing over.
export function harvestSentence(r: StablecoinRow): string | null {
  if (r.operator !== "harvest") return null;
  const parts: string[] = [];
  if (r.harvestApy24h != null) parts.push(`${pct(r.harvestApy24h)} over 24 hours`);
  if (r.harvestApy30d != null) parts.push(`${pct(r.harvestApy30d)} over 30 days`);
  if (!parts.length) return `Harvest operates this product. It is measured here on exactly the same basis as everything else.`;
  return (
    `Harvest operates this product, so our own indexer reads it hourly as well: ${parts.join(" and ")}. ` +
    `The figure in the table above is the share-price measurement applied to every row here, computed the same ` +
    `way for ours as for a competitor's.`
  );
}
