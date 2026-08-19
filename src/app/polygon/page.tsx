import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { getLiveVaults } from "@/lib/data";
import { getPolygonVenues } from "@/lib/polygon-yield";
import { PolygonHubBody } from "@/components/polygon-hub-body";
import "../_styles/asset-hub.css";
import "../_styles/report.css";
import "../_styles/polygon-hub.css";

const NETWORK_DISPLAY = "Polygon";
const URL = `${SITE_URL}/polygon`;

export async function generateMetadata(): Promise<Metadata> {
  const [vaults, venues] = await Promise.all([getLiveVaults(), Promise.resolve(getPolygonVenues())]);
  const harvestCount = vaults.filter((v) => v.chain === "Polygon").length;
  const externalCount = venues.length;
  const title = `Best ${NETWORK_DISPLAY} Yields: ${externalCount} Third-Party Venues + Harvest | ${SITE_NAME}`;
  // Written to be used rather than replaced. Google was ignoring the old
  // description and stitching its own snippet out of the body instead, which
  // is what a description does when it describes the page's construction
  // ("compare N third-party venues against M Harvest-operated strategies")
  // rather than what a searcher gets. The stitched version opened on the
  // cohort's floor rate and then broke mid-word, because a snippet assembled
  // from two fragments is cut to fit rather than written to read.
  //
  // No live rate goes in here: the page refreshes hourly and a stale figure in
  // a snippet is worse than no figure.
  const description = `Find where Polygon yields come from: ${externalCount} third-party lending and tokenized-fund venues plus ${harvestCount} Harvest ${harvestCount === 1 ? "strategy" : "strategies"}, grouped by asset. Every rate is read from the venue's own contract state, refreshed regularly.`;
  return {
    title,
    description,
    openGraph: { title, description, url: URL, siteName: SITE_NAME, type: "website" },
    alternates: { canonical: URL },
  };
}

export default async function PolygonNetworkPage() {
  return <PolygonHubBody />;
}
