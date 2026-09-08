import { statSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { isRanked, loadCasinos } from "@/lib/crypto-casinos-data";
import { FAQS, bonusTotalUsd } from "@/lib/crypto-casinos-copy";
import { CasinosBody } from "@/components/casinos/casinos-body";
import { getLiveVaults } from "@/lib/data";
import { LOW_LIQUIDITY_TVL_THRESHOLD } from "@/lib/admin-rules";
import {
  breadcrumbSchema,
  faqPageSchema,
  reportItemListSchema,
} from "@/lib/jsonld";
import "../_styles/home.css";
import "../_styles/report.css";
import "../_styles/crypto-casinos.css";

const PAGE_URL = `${SITE_URL}/best-crypto-casino-bonus`;

/**
 * The USDC strategies behind the Harvest section, read at build time.
 *
 * USDC alone, because the sentence above the table describes a USDC selection
 * and the two have to agree. Two filters beyond that: the site's own
 * low-liquidity floor, since the raw top of this list is a rate on a few
 * hundred dollars of deposits and publishing that as an opportunity would be
 * the overclaim this page spends its length arguing against, and the zkSync
 * exclusion documented in usdc-hub.
 *
 * Returns empty when the feed is unreadable, and the section renders without a
 * table instead of inventing one.
 */
export interface HarvestRow {
  slug: string;
  asset: string;
  name: string;
  chain: string;
  apy: number;
  tvl: number;
}

async function harvestStables(): Promise<HarvestRow[]> {
  try {
    const vaults = await getLiveVaults();
    return vaults
      .filter(
        (v) =>
          v.asset === "USDC" &&
          v.tvl >= LOW_LIQUIDITY_TVL_THRESHOLD &&
          v.chain !== "zkSync",
      )
      .sort((a, b) => b.apy24h - a.apy24h)
      .slice(0, 6)
      .map((v) => ({
        slug: v.slug,
        asset: v.asset,
        // productName leads with the asset, and the row prints that in its own
        // column, so "USDC Alpha Prime V2" and not "USDC USDC Alpha Prime V2".
        name: v.productName.replace(new RegExp(`^${v.asset}\\s+`), ""),
        chain: v.chain,
        apy: v.apy24h,
        tvl: v.tvl,
      }));
  } catch {
    return [];
  }
}

/** When the vault feed was last written, for the line under the table. */
function dataUpdatedAt(): string {
  try {
    const mtime = statSync(join(process.cwd(), "data", "vaults.json")).mtime;
    return mtime.toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  } catch {
    return "";
  }
}

// Held at noindex on purpose.
//
// The reason is quality, not commerce. This page carried a comparison error
// until it was corrected: it presented Wild.io's percentage and its dollar cap
// as a contradiction when they describe different things, and its evidence
// column showed a composite score that read as a rating of the venue. Both are
// fixed, and the page stays out of the index until the fixes have been
// reviewed and more than two of the sixteen venues carry a documented source.
//
// The affiliate links being plain domains today is a business reason to wait,
// and it is a weaker one. Lift this by deleting the robots line, and add
// /best-crypto-casino-bonus to sitemap.ts and to the llms.txt list in
// scripts/build-seo-static.mjs in the same commit.
export function generateMetadata(): Metadata {
  // The count is a property of the data, not a constant: a venue joins the
  // ranking when it has both a wordmark and a link, and the title follows.
  const ranked = loadCasinos().casinos.filter(isRanked);
  const n = ranked.length;
  // Rounded down to a thousand, off the same sum the first summary bullet
  // prints. A title and a description that disagree with the page about its
  // own headline number is the defect this page has been corrected for twice.
  const k = `$${Math.floor(bonusTotalUsd(ranked) / 1000)}K+`;
  const TITLE = `Best Crypto Casino Bonus 2026: ${k} Across ${n} Sites`;
  const DESCRIPTION = `${k.replace("K+", ",000+")} in combined welcome bonuses across ${n} tracked crypto casinos, ranked by offer size. Wagering, KYC and withdrawal terms where published. Compare all ${n}.`;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PAGE_URL },
    robots: { index: false, follow: true },
    openGraph: {
      title: TITLE,
      description: `${k.replace("K+", ",000+")} in combined welcome bonuses across ${n} tracked crypto casinos, ranked by offer size.`,
      url: PAGE_URL,
      siteName: SITE_NAME,
      type: "website",
    },
  };
}

export default async function CryptoCasinosPage() {
  const { casinos } = loadCasinos();
  // Same membership rule the table uses. See lib/casino-logos.
  const ranked = casinos.filter(isRanked);

  const jsonLd: object[] = [
    breadcrumbSchema([
      { name: "Home", url: SITE_URL },
      { name: "Crypto Casinos", url: PAGE_URL },
    ]),
    faqPageSchema(FAQS),
  ];
  // Plain name+url ListItems. These are third-party venues and not products
  // this site provides, which is the distinction reportItemListSchema exists
  // for. Rows without a link carry the page's own anchor.
  if (ranked.length > 0) {
    jsonLd.push(
      reportItemListSchema(
        // Our own anchors, never the outbound URL. The list describes rows
        // on this page, and a sponsored destination does not belong in
        // structured data.
        ranked.map((c) => ({ name: c.name, url: `${PAGE_URL}#${c.slug}` })),
        PAGE_URL,
      ),
    );
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CasinosBody harvest={await harvestStables()} dataUpdated={dataUpdatedAt()} />
    </>
  );
}
