import { Asset } from "./types";

export const ASSET_COLORS: Record<Asset, string> = {
  USDC: "bg-blue-500",
  USDT: "bg-emerald-500",
  ETH: "bg-indigo-500",
  BTC: "bg-orange-500",
  EURC: "bg-blue-400",
};

export const SITE_NAME = "Harvest";
// 140-160 char floor per Google's recommended description length.
// Mentions the four anchor assets + the daily-refresh cadence so the
// snippet that appears in search results carries the value prop on
// its own line without needing the title for context.
export const SITE_DESCRIPTION =
  "Compare every DeFi yield strategy we track, across Ethereum, Base, Arbitrum and more. Live APY for USDC, USDT, ETH and Bitcoin, refreshed daily.";
export const SITE_URL = "https://harvest.finance";

// Base URL used for metadataBase (so og:image / twitter:image
// absolute URLs resolve to a domain the scraper can actually fetch).
// Resolution order at build time:
//   1. NEXT_PUBLIC_SITE_URL    - explicit override
//   2. VERCEL_PROJECT_PRODUCTION_URL - the project's stable production
//      domain (currently harvest-flame.vercel.app; auto-updates to
//      harvest.finance once that's the production domain)
//   3. SITE_URL                - the eventual canonical domain
// Canonical links + sitemap + JSON-LD keep using SITE_URL; only the
// OG/Twitter image base follows the live deploy so previews work on
// the staging domain before the harvest.finance cutover.
export const OG_BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : SITE_URL)
).replace(/\/$/, "");
