// Homepage OG image. Generated once at build time and emitted as a
// static PNG that Next.js wires into <head> automatically via the
// app-router opengraph-image convention.

import { ogImageResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";

export const dynamic = "force-static";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Harvest - Compare the best DeFi yields across networks";

export default function HomeOg() {
  return ogImageResponse({
    eyebrow: "Onchain yield index",
    headline: "Best DeFi yields, compared side by side.",
    sub: "USDC, USDT, ETH and Bitcoin strategies across Ethereum, Base, Arbitrum and more. Live APY, TVL and 30-day history, refreshed daily.",
  });
}
