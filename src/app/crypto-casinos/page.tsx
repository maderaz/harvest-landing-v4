import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { isRanked, loadCasinos } from "@/lib/crypto-casinos-data";
import { FAQS, rankLabel } from "@/lib/crypto-casinos-copy";
import { CasinosBody } from "@/components/casinos/casinos-body";
import { getLiveVaults, loadHistoryFile } from "@/lib/data";
import { buildUsdcCohort } from "@/lib/usdc-hub";
import { formatAPY } from "@/lib/format";
import {
  breadcrumbSchema,
  faqPageSchema,
  reportItemListSchema,
} from "@/lib/jsonld";
import "../_styles/home.css";
import "../_styles/report.css";
import "../_styles/crypto-casinos.css";

const PAGE_URL = `${SITE_URL}/crypto-casinos`;

/**
 * The current top USDC rate, for the one paragraph on this page that points at
 * what Harvest actually does. A link to a hub is a call to action; a number is
 * a reason to follow it. Null when the feed is unreadable, and the sentence
 * drops the figure rather than inventing one.
 */
async function bestUsdcApy(): Promise<string | null> {
  try {
    const vaults = await getLiveVaults();
    const c = buildUsdcCohort(
      vaults.filter((v) => v.asset === "USDC"),
      loadHistoryFile(),
    );
    return c.best ? formatAPY(c.best.apy24h) : null;
  } catch {
    return null;
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
// /crypto-casinos to sitemap.ts and to the llms.txt list in
// scripts/build-seo-static.mjs in the same commit.
export function generateMetadata(): Metadata {
  // The count is a property of the data, not a constant: a venue joins the
  // ranking when it has both a wordmark and a link, and the title follows.
  const n = loadCasinos().casinos.filter(isRanked).length;
  const TITLE = `Crypto Casinos: ${rankLabel(n)} Ranked by Welcome Bonus`;
  const DESCRIPTION = `The ${n} largest advertised crypto casino welcome bonuses, ranked by the size of the offer, with the playthrough priced so you can see what each one is actually worth.`;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PAGE_URL },
    robots: { index: false, follow: true },
    openGraph: {
      title: TITLE,
      description: `The ${n} largest advertised crypto casino welcome bonuses, ranked by offer size, with the playthrough priced.`,
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
      <CasinosBody usdcBest={await bestUsdcApy()} />
    </>
  );
}
