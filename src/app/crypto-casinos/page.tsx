import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { loadCasinos } from "@/lib/crypto-casinos-data";
import { isVerified } from "@/lib/crypto-casinos";
import { FAQS } from "@/lib/crypto-casinos-copy";
import { CasinosBody } from "@/components/casinos/casinos-body";
import {
  breadcrumbSchema,
  faqPageSchema,
  reportItemListSchema,
} from "@/lib/jsonld";
import "../_styles/home.css";
import "../_styles/report.css";
import "../_styles/crypto-casinos.css";

const PAGE_URL = `${SITE_URL}/crypto-casinos`;
const TITLE = "Crypto Casinos: TOP20 Ranked by Welcome Bonus";
const DESCRIPTION =
  "The 20 largest advertised crypto casino welcome bonuses, ranked by the size of the offer, with the playthrough priced so you can see what each one is actually worth.";

// noindex until at least one venue has been checked AND has a link. A list of
// welcome-bonus copy with nothing verified is the same page as every other
// listicle. The flag clears itself when the first row is real.
export function generateMetadata(): Metadata {
  const ready = loadCasinos().casinos.some((c) => c.url && isVerified(c));
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PAGE_URL },
    robots: ready ? undefined : { index: false, follow: true },
    openGraph: {
      title: TITLE,
      description:
        "The 20 largest advertised crypto casino welcome bonuses, ranked by offer size, with the playthrough priced.",
      url: PAGE_URL,
      siteName: SITE_NAME,
      type: "website",
    },
  };
}

export default function CryptoCasinosPage() {
  const { casinos } = loadCasinos();
  const ranked = casinos.slice(0, 20);

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
        ranked.map((c) => ({ name: c.name, url: c.url ?? `${PAGE_URL}#ranking` })),
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
      <CasinosBody />
    </>
  );
}
