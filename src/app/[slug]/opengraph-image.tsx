// Per-product OG image. Renders the canonical display name +
// 24h APY + TVL + chain so a shared link in social / chat surfaces
// the actual product card, not a generic icon fallback.
//
// Next.js reuses the page's generateStaticParams() automatically,
// so this route emits one PNG per indexed product at build time.

import { getAllSlugs, getVaultBySlug } from "@/lib/data";
import { formatAPY, formatTVL } from "@/lib/format";
import { getCanonicalDisplayName } from "@/lib/lp-pair";
import { ogImageResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";

export const dynamic = "force-static";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Harvest product preview";

export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export default async function ProductOg({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const vault = await getVaultBySlug(slug);
  if (!vault) {
    return ogImageResponse({
      headline: "Strategy not found",
      sub: "This product is no longer indexed by Harvest.",
    });
  }

  const displayName = getCanonicalDisplayName(vault);
  const stats: { label: string; value: string; accent?: boolean }[] = [];
  if (vault.apy24h > 0) {
    stats.push({ label: "24h APY", value: formatAPY(vault.apy24h), accent: true });
  }
  if (vault.tvl > 0) {
    stats.push({ label: "TVL", value: formatTVL(vault.tvl) });
  }
  stats.push({ label: "Network", value: vault.chain });

  return ogImageResponse({
    brand: `Harvest / ${vault.asset}`,
    eyebrow: vault.vaultType ?? "Vault",
    headline: displayName,
    sub: `${vault.asset} yield strategy on ${vault.chain}, indexed by Harvest with live APY, TVL and 30-day performance history.`,
    stats,
  });
}
