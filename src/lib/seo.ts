import { YieldVault } from "./types";
import { SITE_NAME, SITE_URL } from "./constants";
import { getSubAsset, getSubAssetFamilyName, isUmbrellaAsset } from "./sub-asset";
import { stripChainSuffix } from "./format";
import { getCanonicalDisplayName } from "./lp-pair";

const MAX_TITLE_CHARS = 58;

// Returns the DeFi protocol name (e.g. "Morpho", "Aerodrome") from the category
// field, which is more meaningful than protocol.name ("Harvest Finance").
export function getProtocolLabel(vault: YieldVault): string {
  return stripChainSuffix(vault.category, vault.chain);
}

function clampTitle(full: string): string {
  if (full.length <= MAX_TITLE_CHARS) return full;
  return full.replace(/ \| Harvest$/, "");
}

// Build-time freshness stamp ("May 2026"). Because the site is a static
// export rebuilt by the vault-data cron roughly hourly, this is always
// the current month at deploy time - the Google-endorsed freshness
// signal, and genuinely accurate rather than cosmetic.
function currentMonthYear(): string {
  return new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
}

// "ETH Aerodrome" style lead: ticker + product name, without doubling
// the asset when the product name already carries it (e.g. "USDC Aave"
// stays "USDC Aave", not "USDC USDC Aave").
function tickerProduct(vault: YieldVault): string {
  const subAsset = getSubAsset(vault);
  const name = vault.productName.trim();
  const lower = name.toLowerCase();
  if (
    lower.includes(subAsset.toLowerCase()) ||
    lower.includes(vault.asset.toLowerCase())
  ) {
    return name;
  }
  return `${subAsset} ${name}`;
}

// Direction word for the yield, derived from the live 24h rate against
// the 30-day average (the same comparison the product page makes). A
// >5% band counts as a move; smaller is "holding steady". Returns a
// leading-comma fragment, or "" when there's no live rate to judge.
function apyTrendPhrase(apy24h: number, apy30d: number): string {
  if (apy24h <= 0 || apy30d <= 0) return "";
  const diff = (apy24h - apy30d) / apy30d;
  if (diff > 0.05) return ", trending up";
  if (diff < -0.05) return ", trending down";
  return ", holding steady";
}

// ─── Asset hub ────────────────────────────────────────────────────────────────

// Returns the bare descriptive title (no "| Harvest") — the root layout
// template "%s | Harvest" appends the brand suffix automatically.
export function assetHubTitle(asset: string): string {
  const label = isUmbrellaAsset(asset) ? getSubAssetFamilyName(asset) : asset;
  return `Best ${label} Yield: Top APY Ranking & Sources`;
}

export function assetHubH1(asset: string): string {
  const label = isUmbrellaAsset(asset) ? getSubAssetFamilyName(asset) : asset;
  return `Best ${label} Yield`;
}

export function assetHubDescription(
  asset: string,
  count: number,
  subAssets?: string[],
): string {
  // Target 140-160 chars so Google's snippet doesn't truncate. The
  // count + asset family carries the on-page promise; the second
  // sentence adds network reach so the description doesn't read as
  // identical across asset hubs.
  const familyName = isUmbrellaAsset(asset)
    ? getSubAssetFamilyName(asset)
    : asset;
  if (subAssets && subAssets.length > 1) {
    const listed =
      subAssets.length === 2
        ? subAssets.join(" and ")
        : subAssets.slice(0, -1).join(", ") +
          " and " +
          subAssets[subAssets.length - 1];
    return `Compare ${count}+ ${familyName} yield strategies across ${listed} on Ethereum, Base, Arbitrum and more. Live APY, TVL and 30-day history, updated hourly.`;
  }
  return `Compare ${count}+ ${asset} yield strategies across DeFi on Ethereum, Base, Arbitrum and other major networks. Live APY, TVL and 30-day history, updated hourly.`;
}

// ─── Network hub ──────────────────────────────────────────────────────────────

// Bare title without "| Harvest" — layout template appends brand.
export function networkHubTitle(networkDisplay: string): string {
  return `Best ${networkDisplay} Yields: APY & TVL Ranking`;
}

export function networkHubH1(networkDisplay: string): string {
  return `Best ${networkDisplay} Yields`;
}

export function networkHubDescription(
  networkDisplay: string,
  count: number,
): string {
  // 140-160 char floor. Reads as both a stat and an editorial promise
  // (apples-to-apples ranking) so the snippet stands on its own.
  return `Compare ${count}+ DeFi yield strategies on ${networkDisplay} side by side. Live APY, TVL and 30-day performance history for every product Harvest indexes, refreshed daily.`;
}

// ─── Product page ─────────────────────────────────────────────────────────────

// Pull the disambiguator slot ("vault name") from the productName,
// stripping any leading asset and protocol mentions so it never reads
// as "cbBTC Aave on Aave: cbBTC Aave Yield" (the redundant tokens
// problem). Returns the cleaned distinct portion of the name, or an
// empty string when no distinct portion remains after stripping.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function vaultDisambiguator(vault: YieldVault): string {
  const subAsset = getSubAsset(vault);
  const protocol = getProtocolLabel(vault);
  let name = vault.productName.trim();

  // Strip the asset symbol when it appears at the start (e.g.
  // "cbBTC Aave" -> "Aave"). Tolerates leading/trailing whitespace.
  name = name.replace(new RegExp(`^${escapeRegex(subAsset)}\\b\\s*`, "i"), "");

  // Strip every standalone occurrence of the protocol name so
  // "cbBTC Aave Plus" -> "Plus" rather than "Aave Plus" once the
  // title prefix already says "on Aave".
  name = name.replace(new RegExp(`\\b${escapeRegex(protocol)}\\b\\s*`, "gi"), "");

  // Drop common filler tokens that don't actually disambiguate.
  name = name.replace(/^v\d+\s*/i, "").trim();
  name = name.replace(/\s+/g, " ").trim();
  return name;
}

// Build the asset|protocol|chain key used for product-title slot-3
// uniqueness. Lower-cased so casing differences in the source data
// don't fragment the count.
export function comboKey(vault: YieldVault): string {
  return `${vault.asset.toLowerCase()}|${getProtocolLabel(vault).toLowerCase()}|${vault.chain.toLowerCase()}`;
}

// Returns the FULL title including "| Harvest" (or without if over
// 58 chars). The disambiguator slot is dropped only when
// asset+protocol+network is already unique across the index — pass
// isUniqueCombo=true in that case. When the slot is dropped, the
// title appends "Stats" so two-word strategies still produce a
// distinct, descriptive title.
export function productPageTitle(
  vault: YieldVault,
  isUniqueCombo: boolean = false,
): string {
  const subAsset = getSubAsset(vault);
  const protocol = getProtocolLabel(vault);
  const disambig = vaultDisambiguator(vault);

  // Slot 3 stays unless: (a) combo is unique AND (b) there's no
  // distinct vault name to surface. If the disambiguator is empty,
  // we have no slot 3 to render anyway.
  const dropSlot3 = !disambig || isUniqueCombo;

  const core = dropSlot3
    ? `${subAsset} on ${protocol}: Yield, APY & TVL Stats`
    : `${subAsset} on ${protocol}: ${disambig} Yield, APY & TVL`;

  // Freshness stamp last, before the brand suffix. APY stays out of the
  // title on purpose (it is what Google caches between crawls and is the
  // most volatile field); the month/year is always true and signals an
  // actively-maintained page. Only keep the stamp when the core still
  // fits the SERP width with it - for long disambiguated titles the
  // keyword-complete core matters more than the month, so we drop the
  // stamp rather than let it truncate.
  const stamped = `${core} - ${currentMonthYear()}`;
  const finalCore = stamped.length <= MAX_TITLE_CHARS ? stamped : core;
  return clampTitle(`${finalCore} | ${SITE_NAME}`);
}

export function productPageH1(vault: YieldVault): string {
  return vault.productName;
}

export function productPageDescription(
  vault: YieldVault,
  trackedDays: number,
): string {
  const subAsset = getSubAsset(vault);
  const protocol = getProtocolLabel(vault);
  const network = vault.chain;
  const lead = `${tickerProduct(vault)} on ${protocol} (${network})`;
  const monthYear = currentMonthYear();

  // Lead with the live number whenever the 30-day rate is positive.
  // apy30d is the exact figure rendered in the page's "30-day" stat, so
  // the snippet stays aligned with what the visitor lands on (Google's
  // YMYL bar), and the 30-day window barely moves between hourly builds,
  // so a cached SERP snippet does not drift from the live page. Instead
  // of a TVL dollar figure (volatile, and a bare number reads as noise
  // in a snippet) we describe the rate's direction in words. The closing
  // sentence signals the population is what we track, not the market.
  if (vault.apy30d > 0) {
    const trend = apyTrendPhrase(vault.apy24h, vault.apy30d);
    return `${lead}: ${vault.apy30d.toFixed(1)}% 30-day APY${trend}, as of ${monthYear}. Among the ${subAsset} yield strategies we track on ${network}. Live APY, TVL & risk.`;
  }

  // No usable rate to state: stay honest, lean on freshness + scope and
  // surface tracking longevity when we have it, rather than printing a
  // 0% APY the page would contradict.
  const longevity =
    trackedDays >= 30 ? ` tracked for ${trackedDays}+ days,` : "";
  return `${lead}: one of the ${subAsset} yield strategies we track on ${network},${longevity} with live APY, TVL, performance history & risk benchmarks. Updated ${monthYear}.`;
}

// ─── Breadcrumb data helpers ──────────────────────────────────────────────────

export interface Crumb {
  name: string;
  url?: string;
}

// Breadcrumb labels follow a single rule globally:
//   Home > {Ticker} Ranking > {Product name (only on product pages)}
// Where Ticker is the asset symbol (BTC / ETH / USDC / USDT) for
// asset hubs, and the network display name (Ethereum / Base / etc.)
// for network hubs. The visible breadcrumbs emit a home icon for the
// first crumb in the renderer; the schema keeps "Home" as the name
// so structured data stays accessible to crawlers.
export function productPageCrumbs(vault: YieldVault): Crumb[] {
  const ticker = isUmbrellaAsset(vault.asset)
    ? vault.asset.toUpperCase()
    : vault.asset;
  const hubPath = `${SITE_URL}/${vault.asset.toLowerCase()}`;
  return [
    { name: "Home", url: SITE_URL },
    { name: `${ticker} Ranking`, url: hubPath },
    { name: getCanonicalDisplayName(vault) },
  ];
}

export function assetHubCrumbs(asset: string): Crumb[] {
  const ticker = isUmbrellaAsset(asset) ? asset.toUpperCase() : asset;
  return [
    { name: "Home", url: SITE_URL },
    { name: `${ticker} Ranking` },
  ];
}

export function networkHubCrumbs(networkDisplay: string): Crumb[] {
  return [
    { name: "Home", url: SITE_URL },
    { name: `${networkDisplay} Ranking` },
  ];
}
