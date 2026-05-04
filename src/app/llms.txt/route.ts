import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-static";

// llms.txt is a proposed convention (https://llmstxt.org/) for telling
// LLM crawlers where the canonical, machine-readable surface of a site
// lives. We serve a minimal pointer to the sitemap and the public hubs
// so model trainers can ingest the index without scraping marketing
// chrome. Expand as the spec firms up.
export async function GET(): Promise<Response> {
  const body = `# Harvest yield index

> Independent on-chain DeFi yield index. Tracks live APY, TVL, and share-price history for vetted yield strategies across Ethereum, Base, Arbitrum, Polygon, zkSync, and HyperEVM.

## Canonical entry points

- [Home](${SITE_URL}/): all tracked strategies, sortable rankings.
- [Methodology](${SITE_URL}/methodology): how every metric is computed.
- [Risk framework](${SITE_URL}/risk-framework): smart-contract, oracle, and counterparty considerations.
- [About](${SITE_URL}/about): operator background, fair-launch history.

## Asset hubs

- [USDC](${SITE_URL}/usdc)
- [USDT](${SITE_URL}/usdt)
- [ETH](${SITE_URL}/eth)
- [BTC](${SITE_URL}/btc)

## Network hubs

- [Ethereum](${SITE_URL}/ethereum)
- [Base](${SITE_URL}/base)
- [Arbitrum](${SITE_URL}/arbitrum)
- [Polygon](${SITE_URL}/polygon)
- [zkSync](${SITE_URL}/zksync)
- [HyperEVM](${SITE_URL}/hyperevm)

## Sitemap

- ${SITE_URL}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
