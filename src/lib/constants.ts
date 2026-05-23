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

// Base URL used for metadataBase, so og:image / twitter:image
// ABSOLUTE urls resolve to a domain the social scraper can actually
// fetch. Until the harvest.finance cutover the project lives on the
// Vercel staging domain, so that's the default here - otherwise the
// emitted og:image would point at harvest.finance (which doesn't
// serve this build yet) and Telegram / X / etc. show no preview.
//
// At cutover: set NEXT_PUBLIC_SITE_URL=https://harvest.finance in
// the Vercel env (it takes priority), or flip the default below.
// Canonical links + sitemap + JSON-LD keep using SITE_URL.
export const OG_BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://harvest-flame.vercel.app"
).replace(/\/$/, "");
