// Per-product OG image. Renders a card that mirrors the hero /
// studio 1:1 preview - Harvest wordmark on the left, a white product
// card filled with real vault data (asset icon, name, byline, big
// 24h APY number, a gold sparkline-bar chart, TVL + chain chips) on
// the right. Classic 1200x630 social ratio.
//
// Next.js reuses the page's generateStaticParams() automatically, so
// this route emits one PNG per indexed product at build time.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAllSlugs, getVaultBySlug, getAllSparklines } from "@/lib/data";
import { formatAPY, formatTVL } from "@/lib/format";
import { getCanonicalDisplayName } from "@/lib/lp-pair";
import { stripChainSuffix } from "@/lib/format";
import { ogProductCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";

export const dynamic = "force-static";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Harvest product preview";

export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

// asset symbol -> icon file in src/assets/icons. Mirrors the
// ASSET_ICONS map in token-icons.tsx. Read from disk + base64-inlined
// because Satori (next/og) can't resolve next/image imports or fetch
// relative URLs during a static export build.
const ASSET_ICON_FILE: Record<string, string> = {
  USDC: "USDC.png",
  USDT: "USDT.png",
  USDT0: "USDT.png",
  ETH: "ETH.png",
  WETH: "ETH.png",
  BTC: "WBTC.png",
  WBTC: "WBTC.png",
  cbBTC: "cbBTC.png",
  EURC: "EURC.png",
};

function loadAssetIcon(asset: string): string | null {
  const file = ASSET_ICON_FILE[asset] ?? ASSET_ICON_FILE[asset.toUpperCase()];
  if (!file) return null;
  try {
    const buf = readFileSync(join(process.cwd(), "src", "assets", "icons", file));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// Downsample an APY sparkline (up to 30 points) to ~14 normalized
// bar heights (0-100). Min-max scaled so the trend fills the plot;
// flat series fall back to a mid-height bar so the chart never reads
// as empty.
function toBars(sparkline: number[] | undefined, count = 14): number[] {
  if (!sparkline || sparkline.length < 2) return [];
  const step = sparkline.length / count;
  const sampled: number[] = [];
  for (let i = 0; i < count; i++) {
    sampled.push(sparkline[Math.min(sparkline.length - 1, Math.floor(i * step))]);
  }
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const span = max - min;
  if (span <= 0) return sampled.map(() => 55);
  return sampled.map((v) => 18 + ((v - min) / span) * 82);
}

export default async function ProductOg({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const vault = await getVaultBySlug(slug);
  if (!vault) {
    return ogProductCard({
      productName: "Strategy not found",
      asset: "USDC",
      chain: "Ethereum",
      protocol: "Harvest",
      vaultType: "Vault",
      apyValue: "—",
      apyLabel: "24h APY",
      tvlValue: "—",
      bars: [],
    });
  }

  const sparklines = await getAllSparklines();
  const sparkline =
    sparklines[vault.contractAddress] ??
    sparklines[vault.contractAddress.toLowerCase()];

  return ogProductCard({
    productName: getCanonicalDisplayName(vault),
    asset: vault.asset,
    chain: vault.chain,
    protocol: stripChainSuffix(vault.category, vault.chain) || "Harvest",
    vaultType: vault.vaultType ?? "Vault",
    apyValue: vault.apy24h > 0 ? formatAPY(vault.apy24h) : "—",
    apyLabel: "24h APY",
    tvlValue: vault.tvl > 0 ? formatTVL(vault.tvl) : "—",
    bars: toBars(sparkline),
    assetIconDataUri: loadAssetIcon(vault.asset),
  });
}
