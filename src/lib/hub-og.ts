// Shared builders for asset-hub and network-hub OG images. Each
// thin opengraph-image.tsx route just calls the relevant function;
// the hub cohort lookup + count math lives here so the per-route
// files stay one-liners.

import { getLiveVaults } from "./data";
import { formatTVL } from "./format";

export interface AssetHubOgPayload {
  brand: string;
  eyebrow: string;
  headline: string;
  sub: string;
  stats: { label: string; value: string; accent?: boolean }[];
}

export async function buildAssetHubOgPayload(
  asset: string,
): Promise<AssetHubOgPayload> {
  const vaults = await getLiveVaults();
  const cohort = vaults.filter((v) => v.asset === asset);
  const totalTvl = cohort.reduce((s, v) => s + v.tvl, 0);
  const topApy = cohort.reduce((m, v) => (v.apy24h > m ? v.apy24h : m), 0);
  return {
    brand: `Harvest / ${asset}`,
    eyebrow: `${asset} yields`,
    headline: `Best ${asset} yields, ranked by APY.`,
    sub: `Compare every ${asset} strategy Harvest indexes across Ethereum, Base, Arbitrum and more. Live APY, TVL and 30-day history, refreshed daily.`,
    stats: [
      { label: "Strategies", value: cohort.length.toString() },
      ...(topApy > 0
        ? [{ label: "Top APY", value: `${topApy.toFixed(2)}%`, accent: true }]
        : []),
      ...(totalTvl > 0
        ? [{ label: "Total TVL", value: formatTVL(totalTvl) }]
        : []),
    ],
  };
}

export async function buildNetworkHubOgPayload(
  chain: string,
  networkDisplay: string,
): Promise<AssetHubOgPayload> {
  const vaults = await getLiveVaults();
  const cohort = vaults.filter((v) => v.chain === chain);
  const totalTvl = cohort.reduce((s, v) => s + v.tvl, 0);
  const topApy = cohort.reduce((m, v) => (v.apy24h > m ? v.apy24h : m), 0);
  return {
    brand: `Harvest / ${networkDisplay}`,
    eyebrow: `${networkDisplay} yields`,
    headline: `Best yields on ${networkDisplay}, ranked by APY.`,
    sub: `Compare every yield strategy Harvest indexes on ${networkDisplay}. Live APY, TVL and 30-day performance history, refreshed daily.`,
    stats: [
      { label: "Strategies", value: cohort.length.toString() },
      ...(topApy > 0
        ? [{ label: "Top APY", value: `${topApy.toFixed(2)}%`, accent: true }]
        : []),
      ...(totalTvl > 0
        ? [{ label: "Total TVL", value: formatTVL(totalTvl) }]
        : []),
    ],
  };
}
