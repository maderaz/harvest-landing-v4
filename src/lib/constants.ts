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
