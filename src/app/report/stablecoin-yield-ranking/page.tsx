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
import {
  getStablecoinReport,
  getPendleReport,
  tierRows,
  shortAddr,
  stabilitySentence,
  holderSentence,
  flowSentence,
  basisCaveat,
  tierContrast,
  steadiestSentence,
  concentrationSentence,
  pendleSentence,
  type StablecoinRow,
} from "@/lib/stablecoin-yield";
import { readFileSync } from "fs";
import { join } from "path";
import "../../_styles/home.css";
import "../../_styles/report.css";
import "../../_styles/stablecoin-report.css";

// /report/stablecoin-yield-ranking.
//
// Two rankings, not one: the products people chase for rate, and the products
// people use to park liquidity. The split is not an editorial assertion, it is
// measured. Every rate here comes from share-price growth (see
// scripts/fetch-stablecoin-products.mjs), and each row carries the volatility,
// holder concentration and flow figures that justify which table it sits in.
//
// Scope boundary: this page targets stablecoin comparison terms and never the
// single-asset terms the /usdc and /usdt hubs own. It links DOWN to them.

const PAGE_URL = `${SITE_URL}/report/stablecoin-yield-ranking`;
const DATE_PUBLISHED = "2026-07-26";
const TITLE = "Best Stablecoin Yields 2026: USDC, USDT, DAI & USDS Compared";
const H1 = "Best Stablecoin Yields, 2026";

interface Tradfi {
  hysaLowPct: number;
  hysaHighPct: number;
  mmfLowPct: number;
  mmfHighPct: number;
  asOf: string;
}
function getTradfi(): Tradfi {
  const cfg = JSON.parse(readFileSync(join(process.cwd(), "data", "stablecoin-report-config.json"), "utf-8"));
  return cfg.tradfi as Tradfi;
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
                  <span className="rp-rank-detail">
                    {r.platform}
                    {r.curatedBy ? ` · curated by ${r.curatedBy}` : ""}
                    {r.extras ? ` · ${r.extras}` : ""}
                  </span>
                  <span className="rp-rank-sub sc-contract" title={r.contract}>
                    {shortAddr(r.contract)}
                  </span>
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
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductNotes({ rows }: { rows: StablecoinRow[] }) {
  const notes = rows
    .map((r) => ({ r, stability: stabilitySentence(r), flow: flowSentence(r), holders: holderSentence(r), caveat: basisCaveat(r) }))
    .filter((n) => n.stability || n.flow || n.holders || n.caveat);
  if (!notes.length) return null;
  return (
    <div className="sc-notes">
      {notes.map(({ r, stability, flow, holders, caveat }) => (
        <article className="sc-note" key={r.slug}>
          <h4 className="sc-note-title">
            <AssetIcon asset={r.payoutAsset} size={18} />
            {r.name}
            <span className="sc-note-plat">{r.platform}</span>
          </h4>
          {stability ? <p>{stability}</p> : null}
          {flow ? <p>{flow}</p> : null}
          {holders ? <p>{holders}</p> : null}
          {caveat ? <p className="sc-note-caveat">{caveat}</p> : null}
        </article>
      ))}
    </div>
  );
}

export default async function StablecoinReportPage() {
  const report = getStablecoinReport();
  const pendle = getPendleReport();
  const tradfi = getTradfi();

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
  const updated = fmtDate(report.dataModifiedIso);
  const charted = report.rows
    .filter((r) => r.history.filter((h) => h.apy != null).length >= 14)
    .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
    .slice(0, 6);

  const best = stats.bestOverall;
  const bestRow = report.rows.find((r) => r.slug === best?.slug) ?? null;
  // The measurement window travels inside the lead sentence, not in a footnote:
  // the top of the table is sometimes a short-window figure, and an engine
  // excerpting this paragraph must carry that caveat with it.
  const bestWindow = bestRow?.rateWindow && /^\d+d$/.test(bestRow.rateWindow)
    ? ` measured over ${bestRow.rateWindow.replace("d", " days")}`
    : "";
  const lead =
    `As of ${updated}, the highest measured stablecoin rate among the ${stats.products} products tracked here is ` +
    `${pct(best?.apy ?? null)} on ${best?.name ?? "n/a"} at ${best?.platform ?? "n/a"} (${best?.network ?? "n/a"})${bestWindow}, ` +
    `against a ${pct(stats.stable.median)} median across the products people actually use to park liquidity. ` +
    `Every rate on this page is measured from onchain share-price growth over a stated window, not taken from a ` +
    `platform's advertised figure, so the two tables below can be read against each other.`;

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
      a: `${best?.name ?? "The leader"} at ${best?.platform ?? "n/a"} on ${best?.network ?? "n/a"}, at ${pct(best?.apy ?? null)} measured over its stated window. That figure sits at the top of a leveraged, higher-variance table, which is a different question from where to park liquidity safely.`,
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

  const tocItems = [
    { id: "high-yield-ranking", label: "Highest paying" },
    { id: "high-yield-notes", label: "What drives them", level: 1 },
    { id: "stable-ranking", label: "Steadiest places to park" },
    { id: "stable-notes", label: "Holders and stability", level: 1 },
    ...(charted.length ? [{ id: "rate-history", label: "Rate history" }] : []),
    ...(pendle?.markets?.length ? [{ id: "fixed-rate", label: "Fixed-rate trading" }] : []),
    { id: "savings-comparison", label: "Versus savings" },
    { id: "yield-sources", label: "Where yield comes from" },
    { id: "earn-interest", label: "How to earn interest" },
    { id: "risk-section", label: "Risks" },
    { id: "how-we-measure", label: "How we measure" },
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
            name: "Highest paying stablecoin products",
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            ...reportItemListSchema(stableItems, `${PAGE_URL}#stable-ranking`),
            name: "Most stable stablecoin products for parking liquidity",
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
              <h2 id="high-yield-ranking">Highest paying stablecoin opportunities right now</h2>
              <p className="rp-lead">
                {tierContrast(report) ??
                  `The ${high.length} products below pay the most of anything tracked here.`}
              </p>
              <RankTable rows={high} label="Highest paying stablecoin products" />
              <p className="rp-lead rp-trade-sublead">
                A rate at the top of this table is compensation for something: leverage that amplifies losses as
                readily as gains, a named counterparty rather than collateral, or a strategy that takes the other
                side of trader profit. The notes below say which, per product.
              </p>
            </section>

            <section className="uni-home-content" aria-labelledby="high-yield-notes">
              <p className="rp-eyebrow">Conditions</p>
              <h2 id="high-yield-notes">What is actually driving these rates</h2>
              <ProductNotes rows={high} />
            </section>

            <section className="uni-home-content" aria-labelledby="stable-ranking">
              <p className="rp-eyebrow">Park liquidity</p>
              <h2 id="stable-ranking">Most stable and reliable places to park stablecoins</h2>
              <p className="rp-lead">
                {steadiestSentence(report) ??
                  "These are the products people hold when the priority is getting the money back, not maximizing the rate."}{" "}
                The holder column is the other half of that story: these are the products the market has actually
                chosen, at {stats.totalHolders.toLocaleString("en-US")} wallets across everything tracked here.
              </p>
              <RankTable rows={stable} showHolders label="Steadiest stablecoin products" />
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
                    </div>
                    <div className="hub-tbody" role="rowgroup">
                      {pendleShown.map((m) => (
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
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="rp-lead rp-trade-sublead">
                  A fixed rate above the floating one means the market expects rates to fall before maturity, and is
                  willing to pay for certainty. Below it, the opposite. Locking removes the upside as well as the
                  downside, and the principal token has to be held to maturity or sold at whatever the market pays.
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
              <div className="rp-article">
                <p>
                  <strong>Lending.</strong> Suppliers put stablecoins into a market, borrowers post collateral and pay
                  interest, and the spread flows back. The rate follows utilization, so an idle pool pays close to
                  nothing whatever its size.
                </p>
                <p>
                  <strong>Leveraged looping.</strong> A vault borrows against yield-bearing collateral and redeploys,
                  multiplying a thin spread into a headline rate. It multiplies the downside identically: when the
                  spread inverts, losses arrive at the same leverage factor.
                </p>
                <p>
                  <strong>Undercollateralized credit.</strong> A named firm borrows against its reputation and balance
                  sheet rather than posted collateral. The rate is higher because recovery depends on the borrower,
                  not on liquidating something.
                </p>
                <p>
                  <strong>Protocol revenue.</strong> Savings rates distribute fees the protocol already earns. No
                  borrower sits opposite an individual holder, which is why these rates are the steadiest here and
                  why they move by governance rather than by market.
                </p>
                <p>
                  <strong>Taking the other side.</strong> A counterparty vault earns trading fees by standing opposite
                  every trade on a venue, which pays well until traders win.
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
                <p>
                  <strong>Supply it to a lending market.</strong> The simplest route: the coin
                  is lent to borrowers who post collateral, and the interest they pay flows
                  back. The rate floats with how much of the pool is borrowed. Both tables
                  above contain lending markets, and they are the most transparent products
                  here because the mechanism is visible onchain.
                </p>
                <p>
                  <strong>Hold a yield-bearing wrapper.</strong> Products such as the ones in
                  the steady table convert the coin into a token that appreciates against it,
                  so interest accrues without any further action and without a claim to
                  manage. This is the closest thing to a savings-account experience onchain,
                  and it is where the steadiest rates in this report sit, currently a{" "}
                  {pct(stats.stable.median)} median.
                </p>
                <p>
                  <strong>Lock a fixed rate.</strong> Yield-trading markets let a holder fix a
                  rate to a maturity date instead of floating with the market
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

            <section className="uni-home-content" aria-labelledby="risk-section">
              <p className="rp-eyebrow">Risk</p>
              <h2 id="risk-section">Risks of earning yield on stablecoins</h2>
              <div className="rp-article">
                <p>
                  Every row carries smart-contract risk on the venue, oracle risk on the prices its contracts trust,
                  and depeg risk on the stablecoin itself. Looped products add liquidation and unwind risk, credit
                  markets add counterparty risk, curated vaults add curator risk, and savings rates add governance
                  risk. None of it is insured. This page ranks by measured rate and does not score these per product;
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
              </div>
            </section>

            <section className="uni-home-content" aria-labelledby="harvest-block">
              <p className="rp-eyebrow">Harvest</p>
              <h2 id="harvest-block">Doing this through Harvest</h2>
              <div className="rp-article">
                <p>
                  Harvest operates two of the products above, measured on the same basis as everything else and badged
                  as ours. If one ranks below a competitor today, that is the table working correctly. The full
                  lineups live on the{" "}
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
