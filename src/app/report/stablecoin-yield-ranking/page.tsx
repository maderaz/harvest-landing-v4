import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { formatTVL } from "@/lib/format";
import {
  breadcrumbSchema,
  reportWebPageSchema,
  reportItemListSchema,
  reportDatasetSchema,
  faqPageSchema,
  articleSchema,
} from "@/lib/jsonld";
import { SITE_AUTHOR } from "@/lib/author";
import { AssetIcon } from "@/components/token-icons";
import { DiscoverButton } from "@/components/report/discover-button";
import { ReportHubLink } from "@/components/report/report-hub-link";
import { ReportToc } from "@/components/report/report-toc";
import { ReportChart } from "@/components/report/report-chart";
import { HomeHeroPreview } from "@/components/home-hero-preview";
import {
  getStablecoinReport,
  getPendleReport,
  tierRows,
  shortAddr,
  stabilitySentence,
  holderSentence,
  flowSentence,
  basisCaveat,
  steadiestSentence,
  concentrationSentence,
  pendleSentence,
  pendleMarketUrl,
  heroVaultFrom,
  heroSentence,
  liveRateBullets,
  structureSentence,
  deploymentSentence,
  harvestSentence,
  type StablecoinRow,
} from "@/lib/stablecoin-yield";
import { readFileSync } from "fs";
import { join } from "path";
import "../../_styles/home.css";
import "../../_styles/report.css";
import "../../_styles/stablecoin-report.css";

// /report/stablecoin-yield-ranking.
//
// Two rankings, not one: products ranked by measured rate, and products ranked
// by how little that rate moved. The split is not an editorial assertion, it is
// measured. Every rate here comes from share-price growth (see
// scripts/fetch-stablecoin-products.mjs), and each row carries the volatility,
// holder concentration and flow figures that decide which table it sits in.
//
// FRAMING. Nothing on this page tells a reader where to put money. Headings
// describe what was measured ("whose rate moved least"), never what is
// advisable ("most reliable place to park"), and no figure here is presented as
// forward-looking. A measured past rate is a fact; a recommendation is not ours
// to make.
//
// Scope boundary: this page targets stablecoin comparison terms and never the
// single-asset terms the /usdc and /usdt hubs own. It links DOWN to them.

const PAGE_URL = `${SITE_URL}/report/stablecoin-yield-ranking`;
const DATE_PUBLISHED = "2026-07-26";
const TITLE = "Best Stablecoin Yields 2026: APY & Interest Rates Compared";
const H1 = "Best Stablecoin Yields, 2026";

interface Tradfi {
  hysaLowPct: number;
  hysaHighPct: number;
  mmfLowPct: number;
  mmfHighPct: number;
  asOf: string;
}
// Anything time-sensitive about the law lives in config, never in the JSX, and
// renders with explicit as-of language. Legislative status moves faster than a
// static page rebuilds, and a confidently stale claim about regulation is worse
// than no claim. The durable mechanism (an issuer keeps its reserve interest)
// is settled and is written as prose.
interface Regulation {
  asOf: string;
  issuerActName: string;
  issuerActEffect: string;
  pendingActName: string;
  pendingQuestionOpen: boolean;
  pendingQuestion: string;
  sourceUrl: string;
}
function getConfig(): { tradfi: Tradfi; regulation: Regulation } {
  const cfg = JSON.parse(readFileSync(join(process.cwd(), "data", "stablecoin-report-config.json"), "utf-8"));
  return { tradfi: cfg.tradfi as Tradfi, regulation: cfg.regulation as Regulation };
}

const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${v.toFixed(2)}%`);
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export async function generateMetadata(): Promise<Metadata> {
  const r = getStablecoinReport();
  const n = r?.stats.products ?? 0;
  const networks = r?.stats.networks.length ?? 3;
  // "interest" earns its place here rather than being a synonym sprinkle: the
  // interest phrasing carries its own search demand (earn interest on
  // stablecoins sits at KD 1) and the page previously used only yield and rate.
  const description = `Earn interest on stablecoins: ${n} products compared across ${networks} networks, split into the highest paying and the steadiest. Every rate measured from onchain share-price growth, with holder counts, rate volatility and a downloadable CC-BY dataset.`;
  return {
    title: { absolute: `${TITLE} | ${SITE_NAME}` },
    description,
    openGraph: { title: TITLE, description, url: PAGE_URL, siteName: SITE_NAME, type: "article" },
    alternates: { canonical: PAGE_URL },
  };
}

function Crumbs() {
  return (
    <nav className="rp-crumbs" aria-label="Breadcrumb">
      <Link href="/">{SITE_NAME}</Link>
      <span className="sep">/</span>
      <span>Stablecoin Yield Ranking</span>
    </nav>
  );
}

// The ranking rows carry rank, product, rate and size, and nothing else.
// Curator, contract address, mechanism and measurement caveats used to sit in
// three stacked lines under every name, which made a scanning table unscannable.
// They now live in the per-product section beneath each table, the way the XRP
// report handles the same problem.
function RankTable({ rows, showHolders, label }: { rows: StablecoinRow[]; showHolders?: boolean; label: string }) {
  if (!rows.length) return <div className="hub-empty">No products in this table right now.</div>;
  return (
    <div className={`hub-table-wrap rp-rank sc-rank${showHolders ? " sc-rank-holders" : ""}`} data-nosnippet="">
      <div className="hub-table" role="table" aria-label={label}>
        <div className="hub-thead" role="row">
          <span className="hub-th hub-th-rank">#</span>
          <span className="hub-th">Product</span>
          <span className="hub-th hub-th-num">Rate</span>
          <span className="hub-th hub-th-num">Window</span>
          <span className="hub-th">Network</span>
          {showHolders ? <span className="hub-th hub-th-num">Holders</span> : <span className="hub-th">Type</span>}
          <span className="hub-th hub-th-num">TVL</span>
          <span className="hub-th hub-th-right" />
        </div>
        <div className="hub-tbody" role="rowgroup">
          {rows.map((r, i) => (
            <div className="hub-row" role="row" key={r.slug}>
              <span className="hub-cell hub-rank">{i + 1}</span>
              <span className="hub-cell hub-vault">
                <AssetIcon asset={r.payoutAsset} size={24} />
                <span className="rp-rank-nameblock">
                  <span className="hub-vault-name">
                    {r.name}{" "}
                    {r.operator === "harvest" ? <span className="sc-badge-harvest">Harvest</span> : null}
                  </span>
                  <span className="rp-rank-detail">{r.platform}</span>
                </span>
              </span>
              <span className="hub-cell hub-num hub-apy" title={r.rateBasis}>
                {r.apy == null ? "n/a" : pct(r.apy)}
              </span>
              <span className="hub-cell hub-num sc-window" title={r.rateBasis}>
                {r.rateWindow ?? "-"}
              </span>
              <span className="hub-cell rp-cell-text">{r.network}</span>
              {showHolders ? (
                <span
                  className="hub-cell hub-num"
                  title={
                    r.holders?.top5Pct != null
                      ? `Top 5 wallets hold ${r.holders.top5Pct.toFixed(1)}% of supply`
                      : "Holder distribution unavailable"
                  }
                >
                  {r.holders?.count != null ? r.holders.count.toLocaleString("en-US") : "-"}
                </span>
              ) : (
                <span className="hub-cell rp-cell-text">
                  <span className="rp-type">{r.productType}</span>
                </span>
              )}
              <span className="hub-cell hub-num">{r.tvlUsd ? formatTVL(r.tvlUsd) : "n/a"}</span>
              <span className="hub-cell rp-cell-action">
                {r.harvestSlug ? (
                  <Link className="rp-discover" href={`/${r.harvestSlug}`}>
                    <span className="rp-discover-label">Details</span>
                    <span className="rp-discover-arrow" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none">
                        <path
                          d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </Link>
                ) : (
                  <DiscoverButton
                    href={r.productUrl}
                    platform={r.platform}
                    label="Open"
                    source={`stablecoin:${r.slug}`}
                    product={r.name}
                    chain={r.network}
                    rank={i + 1}
                    icon={<AssetIcon asset={r.payoutAsset} size={20} />}
                  />
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// One card per product, in the same order as the table above it. This is where
// the depth lives: what the thing is, how the rate behaved, where the value
// figure came from, who holds it, and what the measurement cannot tell you.
function ProductNotes({ rows }: { rows: StablecoinRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="sc-notes">
      {rows.map((r, i) => {
        const stability = stabilitySentence(r);
        const flow = flowSentence(r);
        const holders = holderSentence(r);
        const caveat = basisCaveat(r);
        const deployment = deploymentSentence(r);
        const harvest = harvestSentence(r);
        return (
          <article className="sc-note" key={r.slug} id={`note-${r.slug}`}>
            {/* The separators are load-bearing for the heading's TEXT, not its
                layout: without them the accessible name and the outline both
                read "1aHYPER Looping VaultMonad". A whitespace-only sequence
                between flex items is not rendered as an anonymous flex item,
                so the card looks exactly the same. */}
            <h3 className="sc-note-title">
              <span className="sc-note-rank">{i + 1}.</span>{" "}
              <AssetIcon asset={r.payoutAsset} size={18} />{" "}
              {r.name}{" "}
              {r.operator === "harvest" ? <span className="sc-badge-harvest">Harvest</span> : null}{" "}
              <span className="sc-note-plat">{r.network}</span>
            </h3>
            <p className="sc-note-struct">{structureSentence(r)}</p>
            <p className="sc-note-figures">
              <span>
                <strong>{r.apy == null ? "n/a" : pct(r.apy)}</strong> {r.rateWindow ?? "current"}
              </span>
              <span>
                <strong>{r.tvlUsd ? formatTVL(r.tvlUsd) : "n/a"}</strong> value
              </span>
              {r.holders?.count != null ? (
                <span>
                  <strong>{r.holders.count.toLocaleString("en-US")}</strong> holders
                </span>
              ) : null}
            </p>
            {harvest ? <p>{harvest}</p> : null}
            {stability ? <p>{stability}</p> : null}
            {deployment ? <p>{deployment}</p> : null}
            {flow ? <p>{flow}</p> : null}
            {holders ? <p>{holders}</p> : null}
            {caveat ? <p className="sc-note-caveat">{caveat}</p> : null}
            <p className="sc-note-foot">
              <span className="sc-contract" title={r.contract}>
                {shortAddr(r.contract)}
              </span>
              {r.harvestSlug ? (
                <Link href={`/${r.harvestSlug}`} className="sc-note-link">
                  Full history and risk profile
                </Link>
              ) : null}
            </p>
          </article>
        );
      })}
    </div>
  );
}

export default async function StablecoinReportPage() {
  const report = getStablecoinReport();
  const pendle = getPendleReport();
  const { tradfi, regulation } = getConfig();

  if (!report) {
    return (
      <div className="uni-home-test rp-page">
        <Crumbs />
        <main className="uni-home-shell">
          <section className="uni-home-content">
            <h1 className="uni-home-h1">{H1}</h1>
            <p className="rp-lead">The ranking dataset has not been generated in this build. It refreshes hourly.</p>
          </section>
        </main>
      </div>
    );
  }

  const { stats } = report;
  const high = tierRows(report, "high-yield");
  const stable = tierRows(report, "stable");
  const harvestRows = report.rows.filter((r) => r.operator === "harvest");
  const updated = fmtDate(report.dataModifiedIso);
  const charted = report.rows
    .filter((r) => r.history.filter((h) => h.apy != null).length >= 14)
    .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
    .slice(0, 6);

  const best = stats.bestOverall;
  const bestRow = report.rows.find((r) => r.slug === best?.slug) ?? null;
  // The measurement window travels inside the lead sentence, not in a footnote:
  // the top of the table is sometimes a short-window figure, and an engine
  // excerpting this sentence must carry that caveat with it. heroSentence names
  // the leader the way a reader would say it: what it pays in, what it is, who
  // runs it, where. The supporting numbers moved into the bullets below, so the
  // hero stays one claim long instead of a paragraph.
  const lead = bestRow
    ? heroSentence(bestRow)
    : `Every rate on this page is measured from onchain share-price growth over a stated window, not taken from a platform's advertised figure.`;
  const heroVault = bestRow ? heroVaultFrom(bestRow) : null;
  const heroWindowLabel =
    bestRow?.rateWindow && /^\d+d$/.test(bestRow.rateWindow)
      ? `${bestRow.rateWindow.replace("d", "-day")} measured rate`
      : "Measured rate";

  // Questions are matched to the strings that actually appear in the live
  // People Also Ask block for this category, rather than paraphrases of them.
  // Every rate-dependent answer is computed, so they stay true between builds.
  const faqs = [
    {
      q: "Which stablecoin pays interest?",
      a: `Most of the major ones do, but never by simply holding them in a wallet: the issuer keeps the reserve interest. Interest reaches a holder either by supplying the coin to a lending market, or by holding a yield-bearing wrapper that appreciates in value. Of the ${stats.products} products measured here, the steadiest payers are the wrapped forms in the second table, currently around a ${pct(stats.stable.median)} median.`,
    },
    {
      q: "Which stablecoin product pays the most right now?",
      a: `${best?.name ?? "The leader"} at ${best?.platform ?? "n/a"} on ${best?.network ?? "n/a"}, at ${pct(best?.apy ?? null)} measured over its stated window. That figure sits at the top of a leveraged, higher-variance table, which is a different measurement from the rate-stability table below it.`,
    },
    {
      q: "Which stablecoin yield is the most stable?",
      a: steadiestSentence(report) ?? "Stability is measured here as the standard deviation of the rate over the tracked window.",
    },
    {
      q: "Do you earn yield on stablecoin?",
      a: "Not by holding one. A stablecoin in a wallet pays nothing, because the issuer keeps the interest earned on the reserves backing it. Yield starts when the coin is supplied somewhere that lends it out or routes it into a strategy, which is what every product on this page does, at very different risk levels.",
    },
    {
      q: "Do stablecoins pay interest?",
      a: `The coin itself does not. ${regulation.issuerActName === "GENIUS Act" ? "US law" : regulation.issuerActName} ${regulation.issuerActEffect}, and even without that rule the reserve interest is how issuers make money. Interest reaches a holder only through a venue: a lending market, a yield-bearing wrapper, or a fixed-rate market. All ${stats.products} products measured here are one of those three.`,
    },
    {
      q: "Which stablecoins are yield bearing?",
      a: `A yield-bearing stablecoin is a wrapper whose redemption value rises rather than a coin whose balance grows. The tokens in the steady table here are the main examples, currently a ${pct(stats.stable.median)} median measured from their own share-price growth. The plain payment coins, USDC and USDT, are not yield bearing by design: their whole promise is redeeming one for one, which is why they are the coins these wrappers are built on top of.`,
    },
    {
      q: "Why is USDC interest so high?",
      a: `Two separate reasons, and only one is about USDC. First, the rate is not paid by USDC at all, it is paid by whatever venue the coin was supplied to, so "USDC interest" is really the borrow demand or strategy revenue at that venue. Second, USDC is the settlement coin most North American capital recognizes and is willing to hold, so venues competing for that capital quote in it and pay up for it, which pulls USDC rates above what the same strategy pays in a less recognized coin. ${bestRow?.payoutAsset === "USDC" ? `The highest rate measured here, ${pct(best?.apy ?? null)}, is USDC-paying for exactly that reason.` : ""} A high rate is a measure of what someone will pay to borrow, never a property of the coin.`,
    },
    {
      q: "What is the return rate for stablecoins?",
      a: `There is no single figure, which is the reason this page exists. Measured over their stated windows, the ${stats.stable.count} steadiest products here sit at a ${pct(stats.stable.median)} median while the ${stats.highYield.count} higher-paying ones sit at ${pct(stats.highYield.median)}, and the top of that second table reaches ${pct(stats.bestOverall?.apy ?? null)}. The spread between those numbers is risk, not opportunity, and every one of them is a measurement of the past rather than a rate anyone is promising.`,
    },
    {
      q: "How to earn passive income with stablecoins?",
      a: `Three routes, in rising order of complexity. Supply to a lending market and take the floating rate. Hold a yield-bearing wrapper such as the ones in the steady table, which appreciate against the underlying without any action. Or lock a fixed rate to a maturity through a yield-trading market${pendle ? `, currently up to ${pct(pendle.stats.bestFixed)}` : ""}. None of it is passive in the sense of being risk-free: the rates here are compensation for smart-contract, counterparty and depeg risk.`,
    },
    {
      q: "Is a stablecoin yield the same as a high yield savings account?",
      a: `No. A savings account is a bank deposit with FDIC insurance up to the legal limit. Everything here is an uninsured onchain position, and the stablecoin itself can trade away from a dollar. Top savings accounts advertise roughly ${tradfi.hysaLowPct}% to ${tradfi.hysaHighPct}% as of ${tradfi.asOf}, against a ${pct(stats.stable.median)} median in the steady table here.`,
    },
    {
      q: "Why do these rates change?",
      a: "Most float with borrower demand or protocol revenue and can move block to block. The window column states how long each rate was measured over, and the notes under each table give the range it actually moved through.",
    },
    {
      q: "What is share price and why measure it?",
      a: "For a vault, share price is what one share redeems for. It rises as yield accrues and it already nets out fees, losses and rebalances, so growth in share price is what a holder actually earned. An advertised APY is a projection; this is a measurement.",
    },
    {
      q: "What happens if a stablecoin depegs?",
      a: "The yield stops mattering next to the principal. A stablecoin at 95 cents has cost more than a year of typical rates. That risk sits with the issuer and its reserves, separately from the venue risk each row carries.",
    },
    {
      q: "What does holder concentration tell me?",
      a: concentrationSentence(report) ?? "It shows how much of a product sits in a few wallets, which decides how much a single exit can move it.",
    },
    {
      q: "Can I lock in a fixed stablecoin rate?",
      a: pendle
        ? `Yes, through fixed-rate markets. ${pendle.stats.markets} stablecoin maturities currently trade, the best at ${pct(pendle.stats.bestFixed)} on ${pendle.stats.bestFixedName}, and two products ranked above also trade as principal tokens. Locking means giving up the upside if rates rise.`
        : "Fixed-rate markets exist for some of these products, letting a holder lock a rate to a maturity instead of floating.",
    },
    {
      q: "Do I pay tax on stablecoin yield?",
      a: "In most jurisdictions yield is taxable income at receipt, and moving between stablecoins can itself be a disposal. Treatment varies by country and this page is not tax advice; the dataset export includes timestamps that make record keeping easier.",
    },
  ];

  // The TOC is also the anchor surface Google draws SERP sitelinks from, so the
  // H3s are listed rather than only their parent H2s: a competitor at DR 54
  // ranking below us for this term pulls three sitelinks straight from its own
  // section anchors. Every H2 on the page appears here, including harvest-block,
  // which had been silently missing.
  const tocItems = [
    { id: "high-yield-ranking", label: "Highest yield now" },
    { id: "high-yield-notes", label: "What drives them", level: 1 },
    { id: "stable-ranking", label: "Steadiest rates" },
    { id: "stable-notes", label: "Holders and stability", level: 1 },
    ...(charted.length ? [{ id: "rate-history", label: "Rate history" }] : []),
    ...(pendle?.markets?.length ? [{ id: "fixed-rate", label: "Fixed-rate trading" }] : []),
    { id: "savings-comparison", label: "Versus savings" },
    { id: "yield-sources", label: "Where yield comes from" },
    { id: "leveraged-looping", label: "Leveraged looping", level: 1 },
    { id: "delta-neutral", label: "Delta-neutral and basis", level: 1 },
    { id: "tokenized-treasuries", label: "Tokenized treasuries", level: 1 },
    { id: "earn-interest", label: "How to earn interest" },
    { id: "yield-bearing-stablecoins", label: "Yield-bearing stablecoins", level: 1 },
    { id: "lock-a-fixed-rate", label: "Locking a fixed rate", level: 1 },
    { id: "issuer-interest", label: "Why issuers pay nothing" },
    { id: "risk-section", label: "Risks" },
    { id: "stablecoin-depeg", label: "Depeg risk", level: 1 },
    { id: "how-we-measure", label: "How we measure" },
    { id: "harvest-block", label: "Through Harvest" },
    { id: "faq", label: "FAQ" },
    { id: "dataset", label: "Dataset" },
  ];

  // Two named lists rather than one flat one: the tier is the most useful thing
  // an answer engine can carry alongside a product, and a single merged list
  // throws it away. Both point outward at the venue, per the report convention.
  const highItems = high.map((r) => ({ name: `${r.name} (${r.platform})`, url: r.productUrl }));
  const stableItems = stable.map((r) => ({ name: `${r.name} (${r.platform})`, url: r.productUrl }));

  // ISO 8601 interval across the measured series, for Dataset.temporalCoverage.
  const allDays = report.rows.flatMap((r) => r.history.map((h) => h.d)).filter(Boolean).sort();
  const temporalCoverage = allDays.length ? `${allDays[0]}/${allDays[allDays.length - 1]}` : undefined;

  // Markets that also appear in the tables above lead this list regardless of
  // where they rank on fixed rate. They are the reason the section exists: a
  // pure top-N-by-rate cut buries them (sUSDS and sUSDe sit 16th and 18th) and
  // the comparison the prose makes would have nothing to point at.
  const pendleShown = pendle
    ? [
        ...pendle.markets.filter((m) => m.tracked),
        ...pendle.markets.filter((m) => !m.tracked).slice(0, 8),
      ]
    : [];

  return (
    <div className="uni-home-test rp-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema([{ name: "Home", url: SITE_URL }, { name: "Stablecoin Yield Ranking" }])),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            ...reportWebPageSchema({
              name: TITLE,
              url: PAGE_URL,
              description: `${stats.products} stablecoin products compared, split into the highest paying and the steadiest.`,
              dateModified: report.dataModifiedIso,
            }),
            speakable: { "@type": "SpeakableSpecification", cssSelector: [".sc-lead"] },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            ...reportItemListSchema(highItems, `${PAGE_URL}#high-yield-ranking`),
            name: "Highest stablecoin yields by measured rate",
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            ...reportItemListSchema(stableItems, `${PAGE_URL}#stable-ranking`),
            name: "Stablecoin products ranked by measured rate stability",
          }),
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema(faqs)) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            articleSchema({
              title: TITLE,
              description: `Stablecoin rates across ${stats.products} products, measured from onchain share-price growth.`,
              url: PAGE_URL,
              datePublished: DATE_PUBLISHED,
              dateModified: report.dataModifiedIso,
              author: SITE_AUTHOR,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            reportDatasetSchema({
              name: "Stablecoin yield ranking dataset",
              description: `Measured rate, rate volatility, holder distribution, tracked value and daily share-price history for ${stats.products} stablecoin products across ${stats.networks.length} networks.`,
              url: PAGE_URL,
              dateModified: report.dataModifiedIso,
              numberOfItems: stats.products,
              temporalCoverage,
              keywords: ["stablecoin", "USDC", "USDT", "DAI", "USDS", "yield", "interest", "APY", "share price", "DeFi"],
              sources: ["https://portals.fi", "https://api-v2.pendle.finance", "https://ethereum.org", "https://base.org", "https://monad.xyz"],
              distribution: [
                { format: "application/json", url: `${SITE_URL}/data/stablecoin-yield/index.json` },
                { format: "text/csv", url: `${SITE_URL}/data/stablecoin-yield/rates.csv` },
              ],
            }),
          ),
        }}
      />

      <Crumbs />

      <section className="uni-home-hero rp-hero">
        {heroVault && (
          <HomeHeroPreview
            vault={heroVault}
            headlineValueOverride={pct(bestRow?.apy ?? null)}
            headlineLabelOverride={heroWindowLabel}
            apyTabLabel="Rate"
          />
        )}
        <div className="uni-home-hero-inner">
          <h1 className="uni-home-h1">{H1}</h1>
          <p className="uni-home-sub sc-lead">{lead}</p>
          <p className="rp-updated">Last updated {updated}</p>
          <a href="#high-yield-ranking" className="uni-home-cta-primary">
            See the ranking
            <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      <main className="uni-home-shell">
        <div className="rp-doc">
          <div className="rp-doc-main">
            <section className="uni-home-content" aria-labelledby="high-yield-ranking">
              <p className="rp-eyebrow">Live rates</p>
              <h2 id="high-yield-ranking">Highest stablecoin yield right now, by measured rate</h2>
              {/* Findings first, one claim per line. Each bullet is a complete,
                  self-contained statement so an answer engine can lift any one
                  of them without needing the sentence before it. */}
              <ul className="sc-bullets">
                {liveRateBullets(report, pendle?.stats.bestFixed ?? null).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
              <RankTable rows={high} label="Highest stablecoin yields by measured rate" />
              <p className="rp-lead rp-trade-sublead">
                A rate at the top of this table is compensation for something: leverage that amplifies losses as
                readily as gains, a named counterparty rather than collateral, or a strategy that takes the other
                side of trader profit. The section below says which, per product.
              </p>
            </section>

            <section className="uni-home-content" aria-labelledby="high-yield-notes">
              <p className="rp-eyebrow">Conditions</p>
              <h2 id="high-yield-notes">What is actually driving these rates</h2>
              <ProductNotes rows={high} />
            </section>

            <section className="uni-home-content" aria-labelledby="stable-ranking">
              <p className="rp-eyebrow">Rate stability</p>
              <h2 id="stable-ranking">Steadiest stablecoin interest rates, by measured volatility</h2>
              <p className="rp-lead">
                {steadiestSentence(report) ??
                  "This table ranks by how little the measured rate moved over the window, not by rate."}{" "}
                A low standard deviation describes what a rate did over the window measured. It is not a forecast, and
                it says nothing about the smart-contract, counterparty or depeg risk each product carries. The holder
                column sits alongside it as a second observation: {stats.totalHolders.toLocaleString("en-US")} wallets
                across everything tracked here.
              </p>
              <RankTable rows={stable} showHolders label="Stablecoin products by measured rate stability" />
            </section>

            <section className="uni-home-content" aria-labelledby="stable-notes">
              <p className="rp-eyebrow">Distribution</p>
              <h2 id="stable-notes">Holder base and rate stability, product by product</h2>
              <p className="rp-lead">{concentrationSentence(report) ?? ""}</p>
              <ProductNotes rows={stable} />
            </section>

            {charted.length > 0 && (
              <section className="uni-home-content" aria-labelledby="rate-history">
                <p className="rp-eyebrow">History</p>
                <h2 id="rate-history">How these stablecoin rates moved over 90 days</h2>
                <p className="rp-lead">
                  Daily rate history for the products with enough measured points to draw. A flat line is a product
                  doing what the steady table claims; a jagged one is a product whose headline figure is a snapshot
                  rather than a promise.
                </p>
                <div className="rp-charts">
                  {charted.map((r) => (
                    <ReportChart
                      key={r.slug}
                      history={r.history.filter((h) => h.apy != null).slice(-90).map((h) => ({ d: h.d, apy: h.apy as number }))}
                      title={r.name}
                      subtitle={r.platform}
                      tvlLabel={r.tvlUsd ? `${formatTVL(r.tvlUsd)} tracked` : undefined}
                      nowValue={r.apy}
                      nowLabel={r.rateWindow ?? "current"}
                    />
                  ))}
                </div>
              </section>
            )}

            {pendle?.markets?.length ? (
              <section className="uni-home-content" aria-labelledby="fixed-rate">
                <p className="rp-eyebrow">Fixed rate</p>
                <h2 id="fixed-rate">Locking a fixed stablecoin rate with yield trading</h2>
                <p className="rp-lead">{pendleSentence(report, pendle)}</p>
                <div className="hub-table-wrap rp-rank sc-pendle" data-nosnippet="">
                  <div className="hub-table" role="table" aria-label="Fixed-rate stablecoin markets">
                    <div className="hub-thead" role="row">
                      <span className="hub-th">Market</span>
                      <span className="hub-th hub-th-num">Fixed</span>
                      <span className="hub-th hub-th-num">Floating</span>
                      <span className="hub-th hub-th-num">Spread</span>
                      <span className="hub-th hub-th-num">Matures</span>
                      <span className="hub-th hub-th-num">Liquidity</span>
                      <span className="hub-th hub-th-right" />
                    </div>
                    <div className="hub-tbody" role="rowgroup">
                      {pendleShown.map((m, i) => (
                        <div className="hub-row" role="row" key={m.marketAddress}>
                          <span className="hub-cell rp-cell-text">
                            {m.name}
                            {m.tracked ? <span className="sc-badge-tracked">ranked above</span> : null}
                          </span>
                          <span className="hub-cell hub-num hub-apy">{pct(m.fixedApy)}</span>
                          <span className="hub-cell hub-num">{m.floatingApy != null ? pct(m.floatingApy) : "-"}</span>
                          <span className="hub-cell hub-num">
                            {m.spreadPp != null ? `${m.spreadPp > 0 ? "+" : ""}${m.spreadPp.toFixed(2)}pp` : "-"}
                          </span>
                          <span className="hub-cell hub-num">{m.daysToMaturity}d</span>
                          <span className="hub-cell hub-num">{formatTVL(m.liquidityUsd)}</span>
                          <span className="hub-cell rp-cell-action">
                            <DiscoverButton
                              href={pendleMarketUrl(m)}
                              platform="Pendle"
                              label="PT"
                              source={`stablecoin-pendle:${m.marketAddress}`}
                              product={`${m.name} principal token`}
                              chain="Ethereum"
                              rank={i + 1}
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="rp-lead rp-trade-sublead">
                  A fixed rate above the floating one means the market expects rates to fall before maturity, and is
                  willing to pay for certainty. Below it, the opposite. Locking removes the upside as well as the
                  downside, and the principal token has to be held to maturity or sold at whatever the market pays.
                  The PT link on each row opens the principal-token side of that market on Pendle: the address it
                  routes on is the market&apos;s own LP contract, which is the identifier Pendle keys its trade pages to.
                </p>
              </section>
            ) : null}

            <section className="uni-home-content" aria-labelledby="savings-comparison">
              <p className="rp-eyebrow">Context</p>
              <h2 id="savings-comparison">Stablecoin rates versus a high-yield savings account</h2>
              <dl className="sc-compare">
                <div>
                  <dt>High-yield savings</dt>
                  <dd>
                    {tradfi.hysaLowPct}% to {tradfi.hysaHighPct}%
                    <span className="sc-compare-sub">Top advertised US accounts, as of {tradfi.asOf}. FDIC-insured bank deposits.</span>
                  </dd>
                </div>
                <div>
                  <dt>Money market funds</dt>
                  <dd>
                    {tradfi.mmfLowPct}% to {tradfi.mmfHighPct}%
                    <span className="sc-compare-sub">Typical 7-day yields, as of {tradfi.asOf}. Regulated funds, not insured deposits.</span>
                  </dd>
                </div>
                <div>
                  <dt>Steady stablecoin median</dt>
                  <dd>
                    {pct(stats.stable.median)}
                    <span className="sc-compare-sub">
                      Across {stats.stable.count} products, measured as of {updated}. Uninsured onchain positions.
                    </span>
                  </dd>
                </div>
              </dl>
              <div className="rp-article">
                <p>
                  These are not the same product wearing different clothes. A savings account is a bank liability
                  with federal insurance behind it; nothing on this page carries FDIC or SIPC protection of any kind.
                  A money market fund is a regulated security with a board and a prospectus; a vault is a smart
                  contract whose rules are its code. The stablecoin adds a third layer, because its peg depends on an
                  issuer&apos;s reserves and can slip in exactly the moments liquidity matters most.
                </p>
                <p>
                  When the steady median sits inside the savings range, the honest reading is that the extra risk is
                  not being paid for that month. These figures update with the data rather than with what would make
                  the category look good.
                </p>
              </div>
            </section>

            <section className="uni-home-content" aria-labelledby="yield-sources">
              <p className="rp-eyebrow">Mechanics</p>
              <h2 id="yield-sources">How stablecoin yield is actually generated</h2>
              <p className="rp-lead">
                Six mechanisms account for every rate in both tables. Which one a product uses decides how its rate
                behaves and what has to go wrong for the money not to come back, so the mechanism matters more than
                the number beside it.
              </p>
              <div className="rp-article">
                <h3 id="lending-markets">Lending markets and the borrow rate</h3>
                <p>
                  Suppliers put stablecoins into a market, borrowers post collateral and pay interest, and the spread
                  flows back. The supply rate is the borrow rate multiplied by utilization, less the reserve factor,
                  which is why an idle pool pays close to nothing whatever its size and why the same market can pay
                  2% one week and 9% the next without anything having changed but demand.
                </p>

                <h3 id="leveraged-looping">Leveraged looping</h3>
                <p>
                  A vault borrows against yield-bearing collateral and redeploys the proceeds into the same position,
                  repeating until the spread between what it earns and what it pays is multiplied several times over.
                  It multiplies the downside identically: when the spread inverts, losses arrive at the same factor,
                  and a collateral price move can force an unwind at the worst moment.
                </p>

                <h3 id="delta-neutral">Delta-neutral strategies and the basis trade</h3>
                <p>
                  A delta-neutral position holds an asset and shorts the same amount of it, so the price exposure
                  cancels and what remains is the funding paid between the two legs. The classic version is the basis
                  trade: hold spot, short the perpetual, collect funding while it is positive. It pays well in a
                  market that is long and leveraged, pays nothing when funding flattens, and pays negatively when the
                  market flips short. Nothing about it is stable except the dollar denomination.
                </p>

                <h3 id="undercollateralized-credit">Undercollateralized credit</h3>
                <p>
                  A named firm borrows against its reputation and balance sheet rather than posted collateral. The
                  rate is higher because there is nothing to liquidate: recovery depends on the borrower paying, and
                  on whatever the loan documents allow if it does not.
                </p>

                <h3 id="protocol-revenue">Protocol revenue and savings rates</h3>
                <p>
                  Savings rates distribute fees the protocol already earns. No borrower sits opposite an individual
                  holder, which is why these rates are the steadiest measured here and why they move by governance
                  vote rather than by market. The tradeoff is that a vote can move them at any time, in either
                  direction, with no market signal beforehand.
                </p>

                <h3 id="tokenized-treasuries">Tokenized treasuries and real-world assets</h3>
                <p>
                  Tokenized money-market and treasury funds, and private-credit protocols such as Centrifuge, pass
                  through the yield of assets held off chain. The rate tracks short-term rates rather than crypto
                  demand, which makes it the least correlated source here, but the token is a claim on an
                  off-chain structure and inherits that structure&apos;s transfer restrictions and settlement times.
                  None of the products ranked above are of this type; it is included because it is where a growing
                  share of stablecoin yield now originates.
                </p>

                <h3 id="taking-the-other-side">Taking the other side of the trade</h3>
                <p>
                  A counterparty vault earns trading fees by standing opposite every trade on a venue. It pays well
                  until traders win, at which point the vault pays them out of its own value.
                </p>
              </div>
            </section>

            <section className="uni-home-content" aria-labelledby="earn-interest">
              <p className="rp-eyebrow">Getting started</p>
              <h2 id="earn-interest">How to earn interest on stablecoins</h2>
              <div className="rp-article">
                <p>
                  A stablecoin sitting in a wallet pays nothing. The issuer holds the reserves
                  behind it and keeps the interest those reserves earn, which is most of how
                  the large issuers make money. Interest reaches a holder only once the coin is
                  put somewhere that puts it to work, and there are three ways to do that.
                </p>
                <h3 id="supply-to-a-lending-market">Supply it to a lending market</h3>
                <p>
                  The simplest route: the coin is lent to borrowers who post collateral, and the
                  interest they pay flows back. The rate floats with how much of the pool is
                  borrowed. Both tables above contain lending markets, and they are the most
                  transparent products here because the mechanism is visible onchain. Curated
                  markets such as those built on Morpho sit a layer above this, where a curator
                  picks which collateral the money is lent against.
                </p>

                <h3 id="yield-bearing-stablecoins">Hold a yield-bearing stablecoin</h3>
                <p>
                  Yield-bearing stablecoins convert the coin into a token that appreciates
                  against it, so interest accrues without any further action and without a
                  claim to manage. This is the closest thing to a savings-account experience
                  onchain, and it is where the steadiest rates in this report sit, currently a{" "}
                  {pct(stats.stable.median)} median. The coin in your wallet does not change
                  number; what changes is what each unit redeems for.
                </p>

                <h3 id="lock-a-fixed-rate">Lock a fixed rate to a maturity</h3>
                <p>
                  Yield-trading markets let a holder fix a rate to a maturity date instead of
                  floating with the market
                  {pendle ? `, currently up to ${pct(pendle.stats.bestFixed)} across ${pendle.stats.markets} stablecoin maturities` : ""}.
                  That removes the upside as well as the downside, and the position has to be
                  held to maturity or sold at whatever the market pays for it.
                </p>
                <p>
                  None of the three is passive in the sense of being free of risk. Each rate on
                  this page is compensation for smart-contract risk, for counterparty or
                  curator risk, and for the possibility that the stablecoin itself slips from
                  a dollar. The section below sets out what that means in practice.
                </p>
              </div>
            </section>

            {/* Why the yield has to come from somewhere else. The mechanism is
                settled and stated as prose; every time-sensitive claim renders
                from data/stablecoin-report-config.json with an as-of date. */}
            <section className="uni-home-content" aria-labelledby="issuer-interest">
              <p className="rp-eyebrow">Regulation</p>
              <h2 id="issuer-interest">Why a stablecoin issuer will not pay you interest</h2>
              <div className="rp-article">
                <p>
                  A stablecoin is backed by reserves, and those reserves earn the short-term rate like any other
                  cash. The holder of the coin sees none of it. That is not an oversight, it is the business: reserve
                  interest is how the large issuers make most of their money, and paying it out would remove the
                  reason to issue a coin at all.
                </p>
                <p>
                  In the United States it is also the law. The {regulation.issuerActName}{" "}
                  {regulation.issuerActEffect}. A dollar of USDC is a claim on a dollar, not a claim on what that
                  dollar earns. This is the single fact that explains the whole page: every rate in both tables above
                  exists because the coin was moved somewhere that puts it to work, and each of those places charges
                  for the privilege in risk.
                </p>
                {regulation.pendingQuestionOpen ? (
                  <p>
                    As of {regulation.asOf} the open question is {regulation.pendingQuestion}, which is what the
                    debate around the {regulation.pendingActName} turns on. A restriction written broadly would reach
                    the centralized platforms that advertise a stablecoin rate to retail customers. It would not
                    reach the products measured here, because none of them is an issuer or a custodian paying a rate
                    on someone else&apos;s balance: they are contracts a holder supplies directly, and the yield is
                    borrower interest or protocol revenue rather than passed-through reserve income.
                  </p>
                ) : null}
                <p>
                  Legislative status changes faster than this page rebuilds, so the dated statements above are
                  maintained by hand and carry their as-of month. None of this is legal advice, and the primary
                  sources are at <a href={regulation.sourceUrl}>congress.gov</a>.
                </p>
              </div>
            </section>

            <section className="uni-home-content" aria-labelledby="risk-section">
              <p className="rp-eyebrow">Risk</p>
              <h2 id="risk-section">Risks of earning yield on stablecoins</h2>
              <div className="rp-article">
                <h3 id="smart-contract-risk">Smart-contract and oracle risk</h3>
                <p>
                  Every row carries smart-contract risk on the venue and oracle risk on the prices its contracts
                  trust. A vault&apos;s rules are its code, and a mispriced oracle can liquidate a healthy position or
                  fail to liquidate an unhealthy one. Neither risk is visible in an APY figure, and neither is
                  insured.
                </p>

                <h3 id="stablecoin-depeg">Depeg risk on the coin itself</h3>
                <p>
                  A stablecoin depeg costs more than the yield it was earning. A coin at 95 cents has wiped out more
                  than a year of typical rates in a single move, and depegs happen precisely when liquidity is worst,
                  so exiting at the quoted price is not a given. This risk sits with the issuer and its reserves, and
                  it is separate from whatever venue the coin was supplied to.
                </p>

                <h3 id="strategy-specific-risk">Risks each mechanism adds on top</h3>
                <p>
                  Looped products add liquidation and unwind risk, credit markets add counterparty risk, curated
                  vaults add curator risk, delta-neutral strategies add funding and exchange risk, and savings rates
                  add governance risk. This page ranks by measured rate and does not score these per product;
                  the categories are documented in the <Link href="/risk-framework">risk framework</Link>.
                </p>
              </div>
            </section>

            <section className="uni-home-content" aria-labelledby="how-we-measure">
              <p className="rp-eyebrow">Method</p>
              <h2 id="how-we-measure">How we measure these stablecoin rates</h2>
              <div className="rp-article">
                <p>
                  For every vault-shaped product the rate is share-price growth: what one share redeems for today
                  against what it redeemed for at the start of the window, annualized over the actual elapsed time.
                  Share price already nets out fees, losses and rebalances, so it measures what a holder earned rather
                  than what a platform advertises. Current share price is read onchain for every such product.
                </p>
                <p>
                  Daily history comes from the Portals API for the products it indexes, which covers Ethereum and
                  Base and reaches back a year. Monad is not indexed there, so that product is read directly onchain
                  against roughly nine days of state the public node serves, and its row is labelled with the shorter
                  window rather than presented as a 30-day figure. The Aave row is a lending market with no share
                  price, so it shows the current supply rate read from the Pool contract. The Wildcat row is a fixed
                  lender APR published by the market itself, labelled fixed, and excluded from stability comparisons
                  because a rate that cannot move is steady by definition rather than by behaviour.
                </p>
                <p>
                  Rate volatility is the standard deviation of the daily rate over the window. Readings of exactly
                  zero are treated as missing days rather than as a zero rate, since counting them would make a steady
                  product look erratic. Growth in tracked value is suppressed where a product launched inside the
                  window, because a ratio from a standing start describes nothing. Holder counts and concentration
                  come from Portals. EUR-denominated stablecoins are excluded: this compares USD stablecoins against
                  USD savings rates.
                </p>
                <p>
                  What this page is not: every figure here describes what a product did over a window that has already
                  happened. Nothing on it is a forecast, an endorsement, or advice about what anyone should do with
                  money, including the products Harvest runs. A rate that held steady for 90 days can change in the
                  next block, and a product at the top of either table can lose principal outright. See the{" "}
                  <Link href="/disclosures">disclosures</Link>.
                </p>
              </div>
            </section>

            <section className="uni-home-content" aria-labelledby="harvest-block">
              <p className="rp-eyebrow">Harvest</p>
              <h2 id="harvest-block">Doing this through Harvest</h2>
              <div className="rp-article">
                <p>
                  {harvestRows.length === 1
                    ? "Harvest operates one of the products above"
                    : `Harvest operates ${harvestRows.length} of the products above`}
                  , measured on the same basis as everything else and badged as ours. Each row links through to its
                  own page here, where our hourly readings and the full daily history live. If one ranks below a
                  competitor today, that is the table working correctly. The full lineups live on the{" "}
                  <ReportHubLink href="/usdc" hub="usdc">
                    USDC page
                  </ReportHubLink>{" "}
                  and the{" "}
                  <ReportHubLink href="/usdt" hub="usdt">
                    USDT page
                  </ReportHubLink>
                  .
                </p>
              </div>
            </section>

            <section className="uni-home-content" aria-labelledby="faq">
              <p className="rp-eyebrow">FAQ</p>
              <h2 id="faq">Stablecoin yield questions, answered</h2>
              <div className="rp-faq">
                {faqs.map((f, i) => (
                  <details className="rp-faq-item" key={i} open={i === 0}>
                    <summary className="rp-faq-q">
                      <span>{f.q}</span>
                      <span className="rp-faq-mark" aria-hidden="true" />
                    </summary>
                    <p className="rp-faq-a">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>

            <section className="uni-home-content" aria-labelledby="dataset">
              <p className="rp-eyebrow">Data</p>
              <h2 id="dataset">Download the stablecoin yield dataset</h2>
              <div className="rp-article">
                <p>
                  Every figure on this page is downloadable:{" "}
                  <a href="/data/stablecoin-yield/index.json">JSON</a> and{" "}
                  <a href="/data/stablecoin-yield/rates.csv">CSV</a>, including contract addresses, measured rates,
                  the window each was measured over, rate volatility, holder distribution and the daily share-price
                  series. Licensed CC-BY-4.0; attribution to {SITE_NAME} ({SITE_URL}). Written by {SITE_AUTHOR.name}.
                </p>
              </div>
            </section>
          </div>

          <aside className="rp-doc-aside" aria-label="In this report">
            <ReportToc items={tocItems} />
          </aside>
        </div>
      </main>
    </div>
  );
}
