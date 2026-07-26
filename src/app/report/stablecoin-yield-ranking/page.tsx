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
import {
  getStablecoinReport,
  getMergedStablecoinTable,
  medianApyOf,
  shortAddr,
  type StablecoinRow,
} from "@/lib/stablecoin-yield";
import { readFileSync } from "fs";
import { join } from "path";
import "../../_styles/home.css";
import "../../_styles/report.css";
import "../../_styles/stablecoin-report.css";

// /report/stablecoin-yield-ranking. Built to the 26 July 2026 spec: a
// market-wide comparison of stablecoin rates across the venues the pipeline
// discovers through Portals (top five per leading network by current rate),
// with Harvest's own stablecoin vaults merged into the same table, sorted by
// rate like everything else and badged as ours. Scope boundary from the spec:
// this page targets "best stablecoin yields" comparisons and never the
// single-asset terms the /usdc and /usdt hubs own; it links DOWN to those
// hubs, never competes with them.

const PAGE_URL = `${SITE_URL}/report/stablecoin-yield-ranking`;
const DATE_PUBLISHED = "2026-07-26";
const TITLE = "Best Stablecoin Yields 2026: USDC, USDT, DAI & USDS Compared";
const H1 = "Best Stablecoin Yields, 2026";

interface TradfiConfig {
  hysaLowPct: number;
  hysaHighPct: number;
  mmfLowPct: number;
  mmfHighPct: number;
  asOf: string;
}

function getTradfi(): TradfiConfig {
  const cfg = JSON.parse(
    readFileSync(join(process.cwd(), "data", "stablecoin-report-config.json"), "utf-8"),
  );
  return cfg.tradfi as TradfiConfig;
}

const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${v.toFixed(2)}%`);

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const report = getStablecoinReport();
  const n = report?.stats.venues ?? 0;
  const m = report?.stats.networks ?? 4;
  const description = `The top stablecoin rates compared side by side: ${n} lending markets, curated vaults and savings rates across ${m} networks, refreshed hourly, with a downloadable CC-BY dataset. Rates shown are current supply-side figures, not promotions.`;
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

function RankTable({ rows }: { rows: StablecoinRow[] }) {
  return (
    <div className="hub-table-wrap rp-rank sc-rank" data-nosnippet="">
      <div className="hub-table" role="table" aria-label="Stablecoin yield ranking">
        <div className="hub-thead" role="row">
          <span className="hub-th hub-th-rank">#</span>
          <span className="hub-th">Product</span>
          <span className="hub-th hub-th-num">Rate</span>
          <span className="hub-th hub-th-num">7d</span>
          <span className="hub-th">Network</span>
          <span className="hub-th">Type</span>
          <span className="hub-th hub-th-num">TVL</span>
          <span className="hub-th hub-th-right" />
        </div>
        <div className="hub-tbody" role="rowgroup">
          {rows.map((r, i) => (
            <div className="hub-row" role="row" key={r.id}>
              <span className="hub-cell hub-rank">{i + 1}</span>
              <span className="hub-cell hub-vault">
                <AssetIcon asset={r.stablecoin.replace(".e", "").replace("0", "")} size={24} />
                <span className="rp-rank-nameblock">
                  <span className="hub-vault-name">
                    {r.stablecoin} · {r.platform}{" "}
                    {r.operator === "harvest" ? (
                      <span className="sc-badge-harvest">Harvest</span>
                    ) : null}
                  </span>
                  <span className="rp-rank-detail">{r.product}</span>
                  <span className="rp-rank-sub sc-contract" title={r.contractAddress}>
                    {shortAddr(r.contractAddress)}
                    {r.observedAt ? ` · as of ${new Date(r.observedAt).toISOString().slice(0, 16).replace("T", " ")}Z` : ""}
                  </span>
                </span>
              </span>
              <span className="hub-cell hub-num hub-apy" title={r.rateBasis}>
                {pct(r.apy)}
              </span>
              <span className="hub-cell hub-num" title="Average over the trailing 7 days, where the source reports one">
                {r.apy7d != null ? pct(r.apy7d) : "-"}
              </span>
              <span className="hub-cell rp-cell-text">{r.network}</span>
              <span className="hub-cell rp-cell-text">
                <span className="rp-type">{r.venueType}</span>
              </span>
              <span className="hub-cell hub-num">{r.tvlUsd > 0 ? formatTVL(r.tvlUsd) : "n/a"}</span>
              <span className="hub-cell rp-cell-action">
                {r.operator === "harvest" && r.slug ? (
                  <Link href={`/${r.slug}`} className="rp-discover">
                    <span className="rp-discover-label">View</span>
                  </Link>
                ) : r.venueUrl ? (
                  <DiscoverButton
                    href={r.venueUrl}
                    platform={r.platform}
                    label="Open"
                    source={`stablecoin:${r.id}`}
                    product={`${r.stablecoin} · ${r.product}`}
                    chain={r.network}
                    rank={i + 1}
                    icon={<AssetIcon asset={r.stablecoin.replace(".e", "").replace("0", "")} size={20} />}
                  />
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function StablecoinReportPage() {
  const report = getStablecoinReport();
  const tradfi = getTradfi();

  if (!report) {
    // Fresh checkout before the pipeline's first run: render an honest stub
    // rather than a fabricated table. The cron populates this within an hour.
    return (
      <div className="uni-home-test rp-page">
        <Crumbs />
        <main className="uni-home-shell">
          <section className="uni-home-content">
            <h1 className="uni-home-h1">{H1}</h1>
            <p className="rp-lead">
              The stablecoin ranking dataset has not been generated in this build.
              It refreshes hourly; check back shortly.
            </p>
          </section>
        </main>
      </div>
    );
  }

  const rows = await getMergedStablecoinTable(report);
  const { stats } = report;
  const updated = fmtDate(report.dataModifiedIso);
  const harvestCount = rows.filter((r) => r.operator === "harvest").length;
  // Median over the exact rows rendered below, not the external-only pipeline
  // stat, so the lead's count and median describe the same population.
  const medianAll = medianApyOf(rows);

  // Live driver sentence for the lead: derived from the same data as the
  // table, never hand-written numbers (spec section 7).
  const topTen = rows.slice(0, 10);
  const curatedShare = topTen.filter((r) => r.venueType === "Curated vault").length;
  const driverSentence =
    curatedShare >= 5
      ? `Curated vault mandates are setting the top of the range this month, while core lending markets cluster near the median.`
      : `Core lending markets are setting the top of the range this month, with curated vaults close behind.`;

  const lead =
    `As of ${updated}, the highest stablecoin rate among the ${rows.length} venues this report tracks ` +
    `across ${stats.networks} networks is ${pct(stats.bestApy)} on ${stats.bestStablecoin} at ` +
    `${stats.bestPlatform} on ${stats.bestNetwork}. The median across all tracked stablecoin venues is ` +
    `${pct(medianAll)}. ${driverSentence}`;

  const bestUsdc = stats.bestAnywhere["USDC"];
  const bestUsdt = stats.bestAnywhere["USDT"] ?? stats.bestAnywhere["USDT0"];
  const bestDai = stats.bestAnywhere["DAI"];
  const bestUsds = stats.bestAnywhere["USDS"];

  const faqs = [
    {
      q: "Do you earn yield on USDC?",
      a: `Yes, by supplying it to a venue that lends it out or routes it into a strategy. USDC held in a plain wallet earns nothing; the issuer keeps the reserve interest. Among the venues this report tracks, the best current USDC rate is ${bestUsdc ? pct(bestUsdc.apy) + " at " + bestUsdc.platform + " on " + bestUsdc.network : "shown in the table above"}.`,
    },
    {
      q: "Which stablecoin has the best yield right now?",
      a: `As of ${updated}, ${stats.bestStablecoin} at ${stats.bestPlatform} on ${stats.bestNetwork} pays ${pct(stats.bestApy)}, the highest rate among the ${rows.length} venues tracked here. Rankings move with borrower demand, so the leader changes; the table above reflects the most recent refresh.`,
    },
    {
      q: "Why is USDC interest so high?",
      a: "Because borrower demand for dollars onchain is real: traders borrow stablecoins for leverage, market makers for inventory, and protocols pay for liquidity. The rate a supplier sees is borrower interest flowing through, which is also why it moves so much more than a bank rate.",
    },
    {
      q: "Is USDC a high yield savings account?",
      a: `No. A savings account is a bank deposit with FDIC insurance up to the legal limit; USDC in a lending venue is an uninsured position in a smart contract, and the stablecoin itself can trade away from $1. The comparison section on this page sets the current numbers side by side: top savings accounts advertise roughly ${tradfi.hysaLowPct}% to ${tradfi.hysaHighPct}% as of ${tradfi.asOf}, against a ${pct(medianAll)} median across the venues tracked here, and the gap is compensation for those risks, not free money.`,
    },
    {
      q: "How are stablecoin yields generated?",
      a: "Mostly from lending: suppliers put stablecoins into a market, borrowers pay interest against collateral, and the spread flows back to suppliers. Curated vaults route the same mechanism across several markets under a mandate. Savings rates like Sky's distribute protocol revenue. Some venues add token incentives on top; those ease off when the program ends.",
    },
    {
      q: "What happens if a stablecoin depegs?",
      a: "The yield becomes irrelevant next to the principal. A stablecoin trading at 95 cents has cost more than a year of typical rates. Depeg risk sits with the issuer and its reserves, entirely separate from the venue risk this page ranks, and it is the reason a rate on one stablecoin is not directly comparable to a rate on another without asking who stands behind each peg.",
    },
    {
      q: "Are these yields fixed or variable?",
      a: `Variable, all ${rows.length} of them. Every rate in this report floats with utilization or protocol revenue and can change block to block. None of the tracked venues promises a fixed rate, and any figure here describes the moment it was read, not a term.`,
    },
    {
      q: "What is the difference between lending and LP yield?",
      a: "Lending yield is interest: one asset supplied, borrowers pay for it, no exposure to a second token. LP yield is trading fees plus incentives for holding two assets in a pool, which adds price exposure between the pair. This report tracks single-asset stablecoin venues only; LP positions answer a different question.",
    },
    {
      q: "Do I pay tax on stablecoin yield?",
      a: "In most jurisdictions yield is taxable income at receipt, and moving between stablecoins can itself be a taxable disposal. Treatment varies by country and this page is not tax advice; the dataset export below includes timestamps that make record-keeping easier.",
    },
    {
      q: "What is the minimum to start?",
      a: "The venues tracked here have no account minimums; the practical floor is network transaction fees. On low-fee networks that makes small positions viable, while on Ethereum mainnet fees argue for larger sizes. Nothing on this page is a recommendation to start at any size.",
    },
  ];

  const itemListItems = rows.map((r) =>
    r.operator === "harvest" && r.slug
      ? { name: `${r.stablecoin} · ${r.product} (Harvest)`, url: `${SITE_URL}/${r.slug}` }
      : { name: `${r.stablecoin} · ${r.product} at ${r.platform}`, url: r.venueUrl ?? PAGE_URL },
  );

  const byCoin: { key: string; label: string; hub: string | null; best: typeof bestUsdc }[] = [
    { key: "USDC", label: "USDC", hub: "usdc", best: bestUsdc },
    { key: "USDT", label: "USDT and USDT0", hub: "usdt", best: bestUsdt },
    { key: "DAI", label: "DAI", hub: null, best: bestDai },
    { key: "USDS", label: "USDS and the Sky Savings Rate", hub: null, best: bestUsds },
  ];

  return (
    <div className="uni-home-test rp-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: "Home", url: SITE_URL },
              { name: "Stablecoin Yield Ranking" },
            ]),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            ...reportWebPageSchema({
              name: TITLE,
              url: PAGE_URL,
              description: `The top stablecoin rates across ${stats.networks} networks compared side by side, refreshed hourly.`,
              dateModified: report.dataModifiedIso,
            }),
            speakable: { "@type": "SpeakableSpecification", cssSelector: [".sc-lead"] },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(reportItemListSchema(itemListItems, PAGE_URL)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema(faqs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            articleSchema({
              title: TITLE,
              description: `Stablecoin rates across ${rows.length} venues on ${stats.networks} networks, ranked by current rate and refreshed hourly.`,
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
              description: `Current rate, 7-day rate, TVL, venue type, contract address and observation timestamp for ${rows.length} stablecoin venues across ${stats.networks} networks, refreshed hourly. External venue rates via the Portals API; Harvest vault figures from Harvest's own indexer.`,
              url: PAGE_URL,
              dateModified: report.dataModifiedIso,
              numberOfItems: rows.length,
              keywords: ["stablecoin", "USDC", "USDT", "DAI", "USDS", "yield", "APY", "lending", "DeFi"],
              sources: [
                "https://portals.fi",
                "https://aave.com",
                "https://morpho.org",
                "https://compound.finance",
                "https://fluid.io",
                "https://spark.fi",
                "https://sky.money",
                "https://euler.finance",
              ],
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
          <p className="uni-home-sub">
            The top stablecoin rates across {stats.networks} networks, compared side by
            side: core lending markets, curated vaults and savings rates, plus
            Harvest&apos;s own strategies in the same table, sorted by rate like
            everything else.
          </p>
          <p className="rp-updated">Last updated {updated}</p>
          <a href="#market-ranking" className="uni-home-cta-primary">
            See the ranking
            <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      <main className="uni-home-shell">
        <div className="rp-doc">
          <div className="rp-doc-main">
            <section className="uni-home-content" aria-labelledby="overview">
              <p className="rp-eyebrow">Report</p>
              <h2 id="overview">The answer first</h2>
              <p className="rp-lead sc-lead">{lead}</p>
              <div className="rp-article">
                <p>
                  This page compares stablecoins against each other: which coin, at
                  which venue, on which network, pays what, right now. For depth on a
                  single coin across the whole market, the asset pages go further; this
                  one exists for the comparison.
                </p>
              </div>
              <nav className="rp-toc" aria-label="On this page">
                <span className="rp-toc-label">On this page</span>
                <a href="#market-ranking">The ranking</a>
                <a href="#by-stablecoin">By stablecoin</a>
                <a href="#savings-comparison">Versus a savings account</a>
                <a href="#yield-sources">Where the yield comes from</a>
                <a href="#risk-section">Risks</a>
                <a href="#how-we-measure">How we measure</a>
                <a href="#faq">FAQ</a>
                <a href="#dataset">Dataset</a>
              </nav>
            </section>

            <section className="uni-home-content" aria-labelledby="market-ranking">
              <p className="rp-eyebrow">Live rates</p>
              <h2 id="market-ranking">The market ranking</h2>
              <p className="rp-lead">
                The top {report.config.topPerNetwork} venues by current rate on each of{" "}
                {stats.networks} networks, discovered across Aave v3, Compound v3,
                Morpho, Fluid, Spark, Sky and Euler, plus {harvestCount} Harvest{" "}
                {harvestCount === 1 ? "strategy" : "strategies"} in the same sort.
                Rows marked <span className="sc-badge-harvest">Harvest</span> are ours;
                nothing pins them above a better rate elsewhere. Venues below{" "}
                {formatTVL(report.config.minTvlUsd)} in tracked value are excluded.
              </p>
              <RankTable rows={rows} />
              <p className="rp-lead rp-trade-sublead">
                A high rate is not a recommendation. The top of this table is usually a
                curated vault running a concentrated mandate, and the rate is
                compensation for exactly that concentration. The venue type column is a
                factual category, not a risk score.
              </p>
            </section>

            <section className="uni-home-content" aria-labelledby="by-stablecoin">
              <p className="rp-eyebrow">By coin</p>
              <h2 id="by-stablecoin">The same market, coin by coin</h2>
              {byCoin.map((c) => (
                <div className="sc-bycoin" key={c.key}>
                  <h3>
                    <AssetIcon asset={c.key === "USDS" ? "DAI" : c.key} size={20} />
                    {c.label}
                  </h3>
                  <p>
                    {c.best ? (
                      <>
                        Best tracked rate right now: <strong>{pct(c.best.apy)}</strong> at{" "}
                        {c.best.platform} on {c.best.network} ({c.best.product}), out of{" "}
                        {c.best.candidates} qualifying{" "}
                        {c.best.candidates === 1 ? "venue" : "venues"}.
                      </>
                    ) : (
                      <>No venue for this coin currently clears the tracking floor.</>
                    )}{" "}
                    {c.hub ? (
                      <>
                        The full market view for this coin, including every strategy we
                        track for it, lives on the{" "}
                        <ReportHubLink href={`/${c.hub}`} hub={c.hub}>
                          {c.key} page
                        </ReportHubLink>
                        .
                      </>
                    ) : null}
                  </p>
                </div>
              ))}
            </section>

            <section className="uni-home-content" aria-labelledby="savings-comparison">
              <p className="rp-eyebrow">Context</p>
              <h2 id="savings-comparison">Versus a savings account</h2>
              <dl className="sc-compare">
                <div>
                  <dt>High-yield savings</dt>
                  <dd>
                    {tradfi.hysaLowPct}% to {tradfi.hysaHighPct}%
                    <span className="sc-compare-sub">
                      Top advertised US accounts, as of {tradfi.asOf}. FDIC-insured bank
                      deposits.
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Money market funds</dt>
                  <dd>
                    {tradfi.mmfLowPct}% to {tradfi.mmfHighPct}%
                    <span className="sc-compare-sub">
                      Typical 7-day yields, as of {tradfi.asOf}. Regulated funds, not
                      insured deposits.
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Tracked stablecoin median</dt>
                  <dd>
                    {pct(medianAll)}
                    <span className="sc-compare-sub">
                      Across {rows.length} venues, as of {updated}. Uninsured
                      smart-contract positions.
                    </span>
                  </dd>
                </div>
              </dl>
              <div className="rp-article">
                <p>
                  These are not the same product wearing different clothes. A savings
                  account is a bank liability with federal insurance behind it; nothing
                  on this page carries FDIC or SIPC protection of any kind. A money
                  market fund is a regulated security with a board, a prospectus and
                  daily liquidity requirements; a lending venue is a smart contract
                  whose rules are its code. The stablecoin itself is a third layer:
                  its peg depends on an issuer&apos;s reserves, and it can trade away
                  from a dollar in exactly the moments liquidity matters most.
                </p>
                <p>
                  What the onchain venues pay for accepting those differences is the
                  spread visible above, and some months it is thin or absent. When the
                  tracked median sits inside the savings-account range, the honest
                  reading is that the extra risk is not being paid for that month. The
                  numbers above update with the data, not with what would make the
                  category look good.
                </p>
              </div>
            </section>

            <section className="uni-home-content" aria-labelledby="yield-sources">
              <p className="rp-eyebrow">Mechanics</p>
              <h2 id="yield-sources">Where the yield comes from</h2>
              <div className="rp-article">
                <p>
                  <strong>Core lending markets</strong> (Aave, Compound, Fluid, Spark)
                  pay suppliers out of borrower interest. Utilization sets the rate: a
                  market where most of the supplied coin is borrowed pays well, one
                  where it sits idle pays close to nothing, whatever its size.
                </p>
                <p>
                  <strong>Curated vaults</strong> (Morpho, Euler) route the same lending
                  mechanism across several markets under a named curator&apos;s mandate.
                  The top of this report&apos;s table is usually one of these, and the
                  premium over core markets is the price of a concentrated allocation
                  and an extra layer of contract.
                </p>
                <p>
                  <strong>Savings rates</strong> (Sky&apos;s SSR) distribute protocol
                  revenue to holders of a wrapper token. No borrower on the other side
                  of the position, but the rate is set by governance and moves with it.
                </p>
                <p>
                  <strong>Incentives</strong> sit on top of any of these: reward tokens
                  paid to attract liquidity. Where a venue&apos;s rate leans on
                  incentives it tends to decay once the program winds down, which is a
                  reason the 7-day column exists.
                </p>
              </div>
            </section>

            <section className="uni-home-content" aria-labelledby="risk-section">
              <p className="rp-eyebrow">Risk</p>
              <h2 id="risk-section">What can go wrong</h2>
              <div className="rp-article">
                <p>
                  Every row in the table carries smart-contract risk on the venue,
                  oracle risk on the prices its contracts trust, and depeg risk on the
                  stablecoin itself. Curated vaults add curator risk; savings rates add
                  governance risk. None of it is insured. This page ranks venues by
                  rate and deliberately does not score these risks per venue; the
                  categories and what we leave out are documented in the{" "}
                  <Link href="/risk-framework">risk framework</Link>.
                </p>
              </div>
            </section>

            <section className="uni-home-content" aria-labelledby="how-we-measure">
              <p className="rp-eyebrow">Method</p>
              <h2 id="how-we-measure">How we measure</h2>
              <div className="rp-article">
                <p>
                  External venue rows are discovered through the Portals API: on each
                  refresh, every venue across Aave v3, Compound v3, Morpho, Fluid,
                  Spark, Sky and Euler on the tracked networks is filtered to
                  single-asset USD-stablecoin positions above{" "}
                  {formatTVL(report.config.minTvlUsd)}, and the top{" "}
                  {report.config.topPerNetwork} per network by current rate are kept.
                  Those rates are the venue&apos;s current supply-side figures as
                  reported by that API, and each row carries its own observation
                  timestamp. Harvest rows come from our own indexer reading our own
                  vault contracts, the same source every product page on this site
                  uses. No yield aggregator&apos;s numbers appear anywhere on this
                  page.
                </p>
                <p>
                  Ticker naming follows each network: USDT positions on Polygon render
                  as USDT0 because that is what the migrated token is called there.
                  EUR-denominated stablecoins are excluded; this report compares USD
                  stablecoins against USD savings rates. Venues whose rate would
                  display as 0.00% are excluded, the same display floor used across
                  this site. The date at the top of this page is the newest
                  observation in the dataset, not the time the page was built.
                </p>
              </div>
            </section>

            <section className="uni-home-content" aria-labelledby="harvest-block">
              <p className="rp-eyebrow">Harvest</p>
              <h2 id="harvest-block">Doing this through Harvest</h2>
              <div className="rp-article">
                <p>
                  Harvest operates autocompounding stablecoin strategies that appear in
                  the table above under their real rates, badged as ours. If one of
                  them ranks below Aave today, that is the table working as designed.
                  The full stablecoin lineups live on the{" "}
                  <ReportHubLink href="/usdc" hub="usdc">
                    USDC page
                  </ReportHubLink>{" "}
                  and the{" "}
                  <ReportHubLink href="/usdt" hub="usdt">
                    USDT page
                  </ReportHubLink>
                  , where every strategy links through to the app.
                </p>
              </div>
            </section>

            <section className="uni-home-content" aria-labelledby="faq">
              <p className="rp-eyebrow">Questions</p>
              <h2 id="faq">FAQ</h2>
              <dl className="uni-hub-faq">
                {faqs.map((f, i) => (
                  <div key={i}>
                    <dt>{f.q}</dt>
                    <dd>{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="uni-home-content" aria-labelledby="dataset">
              <p className="rp-eyebrow">Data</p>
              <h2 id="dataset">Dataset</h2>
              <div className="rp-article">
                <p>
                  The full table is downloadable:{" "}
                  <a href="/data/stablecoin-yield/index.json">JSON</a> and{" "}
                  <a href="/data/stablecoin-yield/rates.csv">CSV</a>, including contract
                  addresses and per-row observation timestamps. Licensed CC-BY-4.0;
                  attribution to {SITE_NAME} ({SITE_URL}). Written by {SITE_AUTHOR.name}.
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
