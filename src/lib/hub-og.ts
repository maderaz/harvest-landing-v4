// Shared builders for asset-hub and network-hub OG images. Each thin
// opengraph-image.tsx route calls one of these and passes the result
// straight to ogProductCard, so the money + network cards reuse the
// exact product-card template (Harvest wordmark left, data card
// right) - just keyed on the asset ticker / network name and the
// highest live APY in that cohort instead of a single product.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getLiveVaults } from "./data";
import { formatAPY, formatTVL } from "./format";
import type { ProductCardOg } from "./og-template";

// asset / chain -> icon file. Mirrors the maps in token-icons.tsx +
// the product OG route. Read from disk and base64-inlined because
// Satori can't resolve next/image during a static export build.
const ASSET_ICON_FILE: Record<string, string> = {
  USDC: "USDC.png",
  USDT: "USDT.png",
  ETH: "ETH.png",
  BTC: "WBTC.png",
  EURC: "EURC.png",
};
const CHAIN_ICON_FILE: Record<string, string> = {
  Base: "base.png",
  Ethereum: "mainnet.png",
  Arbitrum: "arbitrum.png",
  Polygon: "polygon.svg",
  zkSync: "zksync.svg",
  HyperEVM: "hyperevm.svg",
};

function loadIcon(file: string | undefined): string | null {
  if (!file) return null;
  try {
    const buf = readFileSync(join(process.cwd(), "src", "assets", "icons", file));
    const mime = file.endsWith(".svg") ? "image/svg+xml" : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function seedFrom(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 233280;
  return h;
}

export async function buildAssetHubOgPayload(
  asset: string,
): Promise<ProductCardOg> {
  const vaults = await getLiveVaults();
  const cohort = vaults.filter((v) => v.asset === asset);
  const totalTvl = cohort.reduce((s, v) => s + v.tvl, 0);
  const topApy = cohort.reduce((m, v) => (v.apy24h > m ? v.apy24h : m), 0);
  return {
    title: asset,
    byline: `${cohort.length} ${asset} ${cohort.length === 1 ? "strategy" : "strategies"} we track`,
    iconDataUri: loadIcon(ASSET_ICON_FILE[asset] ?? ASSET_ICON_FILE[asset.toUpperCase()]),
    iconFallback: asset,
    metricValue: topApy > 0 ? formatAPY(topApy) : "—",
    metricLabel: "Top Perf.",
    tvlValue: totalTvl > 0 ? formatTVL(totalTvl) : "—",
    seed: seedFrom(asset),
  };
}

export async function buildNetworkHubOgPayload(
  chain: string,
  networkDisplay: string,
): Promise<ProductCardOg> {
  const vaults = await getLiveVaults();
  const cohort = vaults.filter((v) => v.chain === chain);
  const totalTvl = cohort.reduce((s, v) => s + v.tvl, 0);
  const topApy = cohort.reduce((m, v) => (v.apy24h > m ? v.apy24h : m), 0);
  return {
    title: networkDisplay,
    byline: `${cohort.length} ${cohort.length === 1 ? "strategy" : "strategies"} we track`,
    iconDataUri: loadIcon(CHAIN_ICON_FILE[chain]),
    iconFallback: networkDisplay,
    metricValue: topApy > 0 ? formatAPY(topApy) : "—",
    metricLabel: "Top Perf.",
    tvlValue: totalTvl > 0 ? formatTVL(totalTvl) : "—",
    seed: seedFrom(chain),
  };
}
