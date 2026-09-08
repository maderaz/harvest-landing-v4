import { statSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { isRanked, loadCasinos } from "@/lib/crypto-casinos-data";
import { FAQS, bonusHeadline } from "@/lib/crypto-casinos-copy";
import { CasinosBody } from "@/components/casinos/casinos-body";
import { getLiveVaults } from "@/lib/data";
import { LOW_LIQUIDITY_TVL_THRESHOLD } from "@/lib/admin-rules";
import {
  articleSchema,
  breadcrumbSchema,
  faqPageSchema,
  reportDatasetSchema,
  reportItemListSchema,
  reportWebPageSchema,
} from "@/lib/jsonld";
import { SITE_AUTHOR } from "@/lib/author";
import "../_styles/home.css";
import "../_styles/report.css";
import "../_styles/crypto-casinos.css";

const PAGE_URL = `${SITE_URL}/best-crypto-casino-bonus`;

/**
 * First publication, fixed.
 *
 * Separate from dateModified on purpose: a page whose two dates always match
 * looks republished rather than maintained, and never builds a history.
 */
const PUBLISHED = "2026-09-08";

/**
 * When the venue data itself last changed, as an ISO date.
 *
 * The file's mtime, not the build clock. Every deploy would otherwise stamp a
 * fresh dateModified and claim a revision nobody made.
 */
function dataModifiedIso(): string {
  try {
    return statSync(join(process.cwd(), "data", "crypto-casinos.json"))
      .mtime.toISOString()
      .slice(0, 10);
  } catch {
    return PUBLISHED;
  }
}

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

// Indexed. The page was held at noindex while a comparison error was
// corrected and while almost none of the sixteen venues carried a documented
// source. Both are addressed: the Wild.io package scope is right, the evidence
// gate fails the build on any figure without a URL and a read date, and the
// route is in sitemap.ts and the llms.txt list beside it.
export function generateMetadata(): Metadata {
  // The count is a property of the data, not a constant: a venue joins the
  // ranking when it has both a wordmark and a link, and the title follows.
  const ranked = loadCasinos().casinos.filter(isRanked);
  // One source for the figure, shared with the social card. See bonusHeadline
  // for why it rounds down to ten thousand.
  const { compact, full, sites } = bonusHeadline(ranked);
  const TITLE = `Best Crypto Casino Bonus 2026: ${compact} Across ${sites} Sites`;
  // Value first, then what the page lets you do with it, then the tool.
  // Inside the width a result actually renders.
  const DESCRIPTION = `${full} in welcome bonuses across ${sites} crypto casinos, ranked by offer size. Compare wagering, deposits and payout terms, then price your own bonus.`;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PAGE_URL },
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
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

  const { compact, full, sites } = bonusHeadline(ranked);
  const TITLE = `Best Crypto Casino Bonus 2026: ${compact} Across ${sites} Sites`;
  const DESCRIPTION = `${full} in welcome bonuses across ${sites} crypto casinos, ranked by offer size. Compare wagering, deposits and payout terms, then price your own bonus.`;
  // The data file's own mtime, not the build clock. A dateModified that moves
  // on every deploy claims a revision nobody made, and an answer engine
  // weighing freshness is entitled to a date that means something.
  const modified = dataModifiedIso();

  const jsonLd: object[] = [
    breadcrumbSchema([
      { name: "Home", url: SITE_URL },
      { name: "Best Crypto Casino Bonus", url: PAGE_URL },
    ]),
    reportWebPageSchema({
      name: TITLE,
      url: PAGE_URL,
      description: DESCRIPTION,
      datePublished: PUBLISHED,
      dateModified: modified,
    }),
    // Named author, site as publisher: the E-E-A-T shape for an editorial page
    // that makes money-adjacent claims about third parties.
    articleSchema({
      title: TITLE,
      description: DESCRIPTION,
      url: PAGE_URL,
      datePublished: PUBLISHED,
      dateModified: modified,
      author: SITE_AUTHOR,
    }),
    // The ranking is a dataset, and it ships as one: every figure with the URL
    // it was read from, downloadable, rather than only an HTML table an agent
    // has to scrape. scripts/build-casino-export.mjs writes both files.
    reportDatasetSchema({
      name: "Crypto casino welcome bonuses, ranked by offer size",
      description:
        "Advertised welcome bonuses, cashback and rakeback at tracked crypto casinos, with the playthrough each attaches, the qualifying deposit, published withdrawal wording, payout coins and lobby categories. Each verified figure carries the operator URL it was read from and the date, or is marked unconfirmed.",
      url: PAGE_URL,
      dateModified: modified,
      numberOfItems: ranked.length,
      keywords: [
        "crypto casino",
        "welcome bonus",
        "wagering requirement",
        "playthrough",
        "no KYC",
        "bitcoin casino",
      ],
      sources: ranked
        .flatMap((c) =>
          Object.values(c.sources ?? {})
            .filter((x): x is { url: string; readOn: string } =>
              typeof x === "object" && x != null && "url" in x,
            )
            .map((x) => x.url),
        )
        .filter((u, i, a) => a.indexOf(u) === i),
      distribution: [
        { format: "application/json", url: `${SITE_URL}/data/crypto-casinos/index.json` },
        { format: "text/csv", url: `${SITE_URL}/data/crypto-casinos/offers.csv` },
      ],
    }),
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
