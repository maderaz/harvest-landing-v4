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
import { getAllSlugs, getVaultBySlug } from "@/lib/data";
import { formatAPY, formatTVL, stripChainSuffix } from "@/lib/format";
import { getCanonicalDisplayName } from "@/lib/lp-pair";
import {
  ogProductCard,
  loadOgFonts,
  OG_SIZE,
  OG_CONTENT_TYPE,
} from "@/lib/og-template";

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

// chain -> icon file. Mirrors CHAIN_ICONS in token-icons.tsx.
const CHAIN_ICON_FILE: Record<string, string> = {
  Base: "base.png",
  Ethereum: "mainnet.png",
  Arbitrum: "arbitrum.png",
  Polygon: "polygon.svg",
  zkSync: "zksync.svg",
  HyperEVM: "hyperevm.svg",
};

function loadIconDataUri(file: string | undefined): string | null {
  if (!file) return null;
  try {
    const buf = readFileSync(join(process.cwd(), "src", "assets", "icons", file));
    const mime = file.endsWith(".svg") ? "image/svg+xml" : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function loadAssetIcon(asset: string): string | null {
  return loadIconDataUri(
    ASSET_ICON_FILE[asset] ?? ASSET_ICON_FILE[asset.toUpperCase()],
  );
}

function loadChainIcon(chain: string): string | null {
  return loadIconDataUri(CHAIN_ICON_FILE[chain]);
}

// Small deterministic hash of a string -> integer seed. Drives the
// synthetic share-price growth line so each product card's curve
// varies slightly without being random per build.
function seedFrom(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 233280;
  return h;
}

export default async function ProductOg({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const fonts = await loadOgFonts();
  const vault = await getVaultBySlug(slug);
  if (!vault) {
    return ogProductCard(
      {
        title: "Strategy not found",
        byline: "No longer indexed by Harvest",
        iconFallback: "?",
        metricValue: "—",
        tvlValue: "—",
        seed: 1,
      },
      fonts,
    );
  }

  return ogProductCard(
    {
      title: getCanonicalDisplayName(vault),
      byline: `${vault.chain} · ${stripChainSuffix(vault.category, vault.chain) || "Harvest"} · ${vault.vaultType ?? "Vault"}`,
      iconDataUri: loadAssetIcon(vault.asset),
      iconFallback: vault.asset,
      bylineIconDataUri: loadChainIcon(vault.chain),
      metricValue: vault.apy24h > 0 ? formatAPY(vault.apy24h) : "—",
      metricLabel: "Perf.",
      tvlValue: vault.tvl > 0 ? formatTVL(vault.tvl) : "—",
      seed: seedFrom(slug),
    },
    fonts,
  );
}
