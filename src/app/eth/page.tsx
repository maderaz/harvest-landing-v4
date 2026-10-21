import type { Metadata } from "next";
import { getLiveVaults, loadHistoryFile } from "@/lib/data";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { formatAPY } from "@/lib/format";
import { buildEthCohort, networkPicks } from "@/lib/eth-hub";
import { EthHubBody } from "@/components/eth-hub-body";
import "../_styles/asset-hub.css";
import "../_styles/usdc-hub.css";
import "../_styles/eth-hub.css";

const ASSET = "ETH" as const;
const URL = `${SITE_URL}/eth`;

export async function generateMetadata(): Promise<Metadata> {
  const vaults = await getLiveVaults();
  const c = buildEthCohort(
    vaults.filter((v) => v.asset === ASSET),
    loadHistoryFile(),
  );

  // The queries reaching this page name a network ("on Base", "on an L2"), so
  // the title carries the networks and keeps the "best ETH yield" head term.
  const title = "Best ETH Yield on Base, Arbitrum & Ethereum: Live APY";

  // The description leads with the answer, the way the page does, so the
  // snippet a reader sees is already the figure they searched for.
  const base = networkPicks(c, "Base").picks[0];
  const description = c.best
    ? `Best ETH yield: ${formatAPY(c.best.apy24h)} APY paid in ETH${
        base ? ` on ${base.chain}` : ""
      }. Compare ${c.count} ETH and WETH strategies on ${c.chainCount} networks by 24-hour ` +
      `APY, TVL and 30-day steadiness, updated hourly.`
    : `Compare ETH and WETH yield strategies by 24-hour APY, TVL and 30-day steadiness, updated hourly.`;

  return {
    title,
    description,
    openGraph: { title, description, url: URL, siteName: SITE_NAME, type: "website" },
    alternates: { canonical: URL },
  };
}

export default async function EthPage() {
  return <EthHubBody />;
}
