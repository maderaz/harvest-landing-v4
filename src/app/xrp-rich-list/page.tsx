import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { SITE_AUTHOR } from "@/lib/author";
import { AssetIcon } from "@/components/token-icons";
import richListHeader from "@/assets/icons/XRP Rich List Header.png";
import { breadcrumbSchema, faqPageSchema, reportDatasetSchema } from "@/lib/jsonld";
import { PercentileCalculator } from "@/components/richlist/percentile-calculator";
import { TopAccountsTable } from "@/components/richlist/top-accounts-table";
import {
  DistributionChart,
  DistributionTable,
} from "@/components/richlist/distribution-chart";
import {
  loadRichList,
  tierOf,
  xrpAmount,
  count,
  pctLabel,
  utcDate,
  utcStamp,
} from "@/lib/xrp-richlist";
import "../_styles/home.css";
import "../_styles/report.css";
import "../_styles/rich-list.css";

// /xrp-rich-list: a live XRP Ledger holder distribution tool.
//
// A tool, not an article, and that is the load-bearing decision. On this SERP
// the two results that earn traffic are both live tools; the DR 74 and DR 76
// articles above them collect nothing. So the page leads with a calculator and
// a threshold table, and the prose exists to explain them rather than to carry
// the page.
//
// Scope boundary: /report/xrp-yield-ranking owns the yield vocabulary. Nothing
// in the title, H1, meta description or any H2 here competes with it. Yield
// appears in exactly two places, one column of the threshold table and the
// bridge block, both of which link down to the report.

const PAGE_URL = `${SITE_URL}/xrp-rich-list`;

// Locked by the build spec. No live figures: threshold values move with the
// distribution and a title that disagrees with the page after a rebuild is
// worse than a title with no number. Percentage tier names are fixed labels
// and are safe. No year anywhere in metadata, so nothing goes stale in January.
const TITLE = "XRP Rich List: Top Holders and Your Rank";
const DESCRIPTION =
  "Live XRP rich list calculator and holder distribution. See the current top 1%, 10% and 25% thresholds and find where your balance ranks. Updated hourly.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ${SITE_NAME}` },
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    url: PAGE_URL,
    title: TITLE,
    description: DESCRIPTION,
    siteName: SITE_NAME,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

function Crumbs() {
  return (
    <nav className="rp-crumbs" aria-label="Breadcrumb">
      <Link href="/">{SITE_NAME}</Link>
      <span className="sep">/</span>
      <span>XRP Rich List</span>
    </nav>
  );
}

export default function XrpRichListPage() {
  const data = loadRichList();

  if (!data) {
    return (
      <div className="uni-home-test rp-page rl-page">
        <Crumbs />
        <section className="uni-home-hero">
          <div className="uni-home-hero-inner">
            <h1 className="uni-home-h1">XRP Rich List</h1>
          <p className="rp-lead">
            The XRP Ledger snapshot behind this page is being rebuilt. Live
            figures return once the next ledger walk completes.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const snap = data.ledgerCloseIso;
  const snapDate = utcDate(snap);
  const snapStamp = utcStamp(snap);
  // Derived from the snapshot, never hardcoded, so the current-year cluster is
  // covered with no annual maintenance and it rolls over on 1 January, which
  // is exactly when the demand rolls.
  const year = new Date(snap).getUTCFullYear();

  // pctLabel drops the decimals above 10% because the tier table reads better
  // in whole numbers there. The concentration breakdown cannot: 35.65 and 36
  // are the difference between a figure a reader can check against the table
  // and one they cannot.
  const share2 = (v: number) => `${v.toFixed(2)}%`;

  const t1 = tierOf(data, 1);
  const t10 = tierOf(data, 10);
  const t50 = tierOf(data, 50);

  const yc = data.yieldComparison;
  // Two counts of different kinds of object, so the ratio is presented as a
  // comparison rather than as a share. See the pipeline comment: an XRPL
  // account and a Flare or Base address holding a wrapped-XRP receipt token
  // are not the same thing, and one person can be several of either.
  const yieldRatioPct = yc ? (yc.receiptTokenHolders / data.accounts) * 100 : null;

  // Labels come from data/xrpl-account-labels.json, each carrying the evidence
  // it rests on. Separately, `domain` is what the account publishes about
  // itself onchain, which is the strongest evidence tier and currently empty
  // across the whole top 100.
  const labelled = data.top.filter((t) => t.label);
  const selfDeclared = data.top.filter((t) => t.domain);
  // The evidence line used to sit under every name in the table, which set the
  // height of forty-nine of the hundred rows. Every current attribution comes
  // from the same provider, so it is disclosed once here instead. If the
  // registry ever mixes providers this falls back to the generic wording.
  const attributions = new Set(
    labelled.map((t) => t.label?.attribution).filter((a): a is string => !!a),
  );
  const attribution = attributions.size === 1 ? [...attributions][0] : null;

  // Needs two distinct observation days before a movement sentence means
  // anything. One walk compared against itself reports no change and reads as
  // a stalled page.
  const hist =
    data.thresholdHistory && data.thresholdHistory.length >= 2
      ? data.thresholdHistory
      : null;
  const histFirst = hist?.[0] ?? null;

  const faqs = [
    {
      q: "Is there an XRP rich list?",
      a: `Yes. The XRP Ledger is public, so every account balance can be read directly from it. This page reads all ${count(data.accounts)} funded accounts from ledger ${count(data.ledgerIndex)}, closed ${snapStamp}, and ranks them.`,
    },
    {
      q: "How many XRP do you need to be in the top 1%?",
      a: t1
        ? `A balance of ${xrpAmount(t1.minXrp)} XRP put an account in the top 1% of funded XRP Ledger accounts as of ${snapDate}. That tier held ${pctLabel(t1.pctOfXrp)} of all XRP in funded accounts as of ${snapDate}.`
        : "",
    },
    {
      q: "How many XRP holders have 10,000 or more?",
      a: `${count(data.exactCounts["10000"] ?? 0)} funded XRP Ledger accounts held at least 10,000 XRP as of ${snapDate}, out of ${count(data.accounts)} funded accounts in total.`,
    },
    {
      q: "How many people own 20,000 XRP?",
      a: `${count(data.exactCounts["20000"] ?? 0)} funded XRP Ledger accounts held at least 20,000 XRP as of ${snapDate}. Accounts are not people: one person can control several accounts, and one account can hold balances for many people.`,
    },
    {
      q: "How many XRP Ledger accounts are there?",
      a: `${count(data.accounts)} accounts were funded on the XRP Ledger as of ${snapDate}. An account cannot exist on the ledger without meeting the base reserve, which validators lowered to 1 XRP in December 2024, so every account in that count holds a balance.`,
    },
    {
      q: "Who owns the most XRP?",
      a: data.top[0]
        ? `The largest single XRP Ledger account held ${xrpAmount(data.top[0].xrp)} XRP as of ${snapDate}, which is ${pctLabel(data.top[0].pctOfSupply)} of the XRP in funded accounts. Large accounts are usually exchange or custodian wallets holding balances for many customers rather than one owner, and this page names an account only against evidence it can show beside the name.`
        : "",
    },
    {
      q: "Is XRP ownership concentrated?",
      a: t1 && t50
        ? `The top 1% of funded XRP Ledger accounts held ${pctLabel(t1.pctOfXrp)} of the XRP in those accounts as of ${snapDate}. The top 50% held ${pctLabel(t50.pctOfXrp)} as of ${snapDate}, which means the lower half of accounts together held the remainder.`
        : "",
    },
    {
      q: "How is the XRP rich list calculated?",
      a: `Every AccountRoot object in one validated XRP Ledger is read over public JSON-RPC, and the balances are aggregated as they stream. Ledger ${count(data.ledgerIndex)} was used for the figures on this page, closed ${snapStamp}. Tier thresholds on the ${snapDate} snapshot carry a resolution of ${data.method.thresholdRelativeErrorPct}%, and the counts quoted at round balances are exact rather than interpolated.`,
    },
    {
      q: "Does holding more XRP change what a balance can do onchain?",
      a: `A larger balance does not change the rules of the ledger, and the XRP Ledger has no native staking and pays no protocol reward for holding. Rates on wrapped and staked XRP are tracked separately in the XRP yield ranking.`,
    },
    {
      q: "Can I see my own wallet's rank?",
      a: `Enter a balance in the calculator on this page and it returns the position that balance holds among all ${count(data.accounts)} funded accounts as of ${snapDate}. The page never asks for a wallet address, and the calculation runs in the browser rather than on a server.`,
    },
  ].filter((f) => f.a);

  const crumbs = [
    { name: "Home", url: SITE_URL },
    { name: "XRP Rich List", url: PAGE_URL },
  ];

  return (
    <div className="uni-home-test rp-page rl-page">
      <Crumbs />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema(crumbs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema(faqs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            reportDatasetSchema({
              name: "XRP Ledger holder distribution dataset",
              description: `Balance distribution across all ${count(data.accounts)} funded XRP Ledger accounts, with tier thresholds, decade bands and the largest 100 accounts, read from ledger ${count(data.ledgerIndex)}.`,
              url: PAGE_URL,
              // The newest observation, which is the ledger close, not the
              // pipeline run. A build that changed nothing must not advance it.
              dateModified: snap,
              numberOfItems: data.accounts,
              keywords: ["XRP", "XRPL", "rich list", "holder distribution", "wallet balances"],
              // The ledger itself. There is no aggregator in the path and
              // nothing here credits one.
              sources: ["https://xrpl.org"],
              distribution: [
                { format: "application/json", url: `${SITE_URL}/data/xrp-rich-list/index.json` },
                { format: "text/csv", url: `${SITE_URL}/data/xrp-rich-list/distribution.csv` },
              ],
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "XRP rich list calculator",
            url: `${PAGE_URL}#calculator`,
            applicationCategory: "FinanceApplication",
            operatingSystem: "Any",
            browserRequirements: "Requires JavaScript for the balance lookup",
            description:
              "Enter an XRP balance and see its percentile against every funded XRP Ledger account. No wallet connection and no address.",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            author: { "@type": "Organization", name: SITE_AUTHOR.name, url: SITE_AUTHOR.url },
          }),
        }}
      />

      {/* ---------------------------------------------------------- hero
          Laid out as an article rather than as a hero: headline, dateline,
          featured image, then a summary. That shape is what the pages winning
          this SERP use, and it puts the three facts a reader came for above
          the fold without making them read a paragraph to reach them. */}
      <section className="rl-intro">
        <h1 className="uni-home-h1 rl-h1">XRP Rich List &amp; Calculator</h1>
        <p className="rl-updated">
          <span className="rl-live-dot" aria-hidden="true" />
          Updated {snapStamp}
        </p>

        {/* Featured image. Static import, so Next emits the intrinsic size and
            the slot reserves its own height before the file loads. `priority`
            because it is the largest element above the fold and is what LCP
            measures on this page.

            Empty alt on purpose. The image is decorative: it repeats the
            headline in pixels and shows faces the page never names, and every
            claim on this page lives in the summary underneath it. An alt that
            described the faces would be asserting identities the ranking
            itself refuses to assert without evidence. */}
        <Image
          src={richListHeader}
          alt=""
          className="rl-figure"
          sizes="100vw"
          priority
        />

        <h2 className="rl-summary-h">Summary</h2>
        <ul className="rl-keyfind">
          {data.concentration?.largestIndividual ? (
            <li>
              The largest holding attributed to an individual rather than to a
              company or a trading venue was{" "}
              <strong>
                {count(data.concentration.largestIndividual.xrp)} XRP
              </strong>{" "}
              as of {snapDate}
              {data.xrpUsd ? (
                <>
                  , worth about{" "}
                  <strong>
                    $
                    {count(
                      data.concentration.largestIndividual.xrp * data.xrpUsd,
                    )}
                  </strong>{" "}
                  at {data.xrpUsd.toFixed(4)} US dollars per XRP on that date
                </>
              ) : null}
              .
            </li>
          ) : null}
          <li>
            <strong>{count(data.accounts)}</strong> XRP addresses were funded on
            the XRP Ledger as of {snapDate}, controlling{" "}
            {xrpAmount(data.xrpHeld)} XRP between them.
          </li>
          {t1 ? (
            <li>
              To sit in the top 1% of XRP holders an account needed at least{" "}
              <strong>{xrpAmount(t1.minXrp)} XRP</strong> as of {snapDate}.
            </li>
          ) : null}
        </ul>
      </section>

      {/* The calculator gets its own band rather than a corner of the hero.
          It is the reason a large part of this page's traffic arrives, and a
          form squeezed beside five bullet points reads as a sidebar widget
          rather than as the tool the page is. */}
      <section className="uni-home-hero rl-calc-band" aria-labelledby="calculator-title">
        <div className="uni-home-hero-inner rl-calc-grid">
          <div className="rl-calc-pitch">
            <h2 id="calculator-title" className="uni-home-h1 rl-calc-title">
              <AssetIcon asset="XRP" size={44} decorative />
              <span>
                The XRP
                <br />
                Rich List Calculator
              </span>
            </h2>
            <p className="rl-calc-pitch-sub">
              Type a balance and see the position it holds among every funded
              account on the XRP Ledger as of {snapDate}. Most people place
              higher than they expect, because as of {snapDate}{" "}
              {pctLabel(
                data.bands
                  .filter((b) => b.max != null && b.max <= 1_000)
                  .reduce((a, b) => a + b.pctOfAccounts, 0),
              )}{" "}
              of funded accounts held under 1,000 XRP on that date.
            </p>
            <ul className="rl-calc-points">
              <li>No wallet connection and no address, ever.</li>
              <li>Runs in your browser, so nothing you type leaves it.</li>
              <li>
                Measured against all {count(data.accounts)} funded accounts as of{" "}
                {snapDate}.
              </li>
            </ul>
          </div>
          <PercentileCalculator
            ladder={data.ladder}
            accounts={data.accounts}
            snapshotDate={snapDate}
          />
        </div>
      </section>

      <section className="uni-home-content rl-jump" aria-labelledby="jump">
        <h2 id="jump" className="rl-sr">On this page</h2>
        <nav className="rp-toc" aria-label="On this page">
          <span className="rp-toc-label">On this page</span>
          <a href="#calculator">Calculator</a>
          <a href="#thresholds">Thresholds</a>
          <a href="#what-it-shows">What it shows</a>
          {yc ? <a href="#working-vs-idle">Working or idle</a> : null}
          <a href="#top-accounts">Top 100</a>
          <a href="#faq">Questions</a>
          <a href="#methodology">Method</a>
        </nav>
      </section>

      {/* Three artifacts, three sections. A table, then a chart, then a
          second table stacked under one heading gave the reader no way to tell
          which caption belonged to which, and nowhere to breathe. Each now
          carries its own lead in and its own note underneath. */}

      {/* -------------------------------------------------- thresholds */}
      <section className="uni-home-content rl-section" aria-labelledby="thresholds">
        <p className="rp-eyebrow">Distribution</p>
        <h2 id="thresholds">XRP rich list {year}: current thresholds</h2>
        <p className="rp-lead">
          {t1 && t10 && t50
            ? `The minimum to sit in the top 1% of funded XRP Ledger accounts was ${xrpAmount(t1.minXrp)} XRP as of ${snapDate}, against ${xrpAmount(t10.minXrp)} XRP for the top 10% and ${xrpAmount(t50.minXrp)} XRP for the top 50%.`
            : ""}
        </p>
        <p className="rl-section-intro">
          A tier threshold is the smallest amount of XRP that placed an account
          in that percentage of all {count(data.accounts)} funded accounts as of{" "}
          {snapDate}. An account is measured on what it controls, which is its
          spendable balance plus anything it holds in onchain escrow.
        </p>

        <div className="rl-dtable-wrap" data-nosnippet="">
          <table className="rl-dtable rl-tiers">
            <caption className="rl-dtable-cap">
              XRP rich list thresholds by percentage tier, as of {snapDate}
            </caption>
            <thead>
              <tr>
                <th scope="col">Percentage tier</th>
                <th scope="col">Minimum XRP controlled</th>
                <th scope="col">Accounts at or above</th>
                <th scope="col">Share of XRP held</th>
              </tr>
            </thead>
            <tbody>
              {data.tiers.map((t) => (
                <tr key={t.pct}>
                  <th scope="row">Top {t.pct}%</th>
                  <td className="rl-num" data-label="Minimum XRP">{xrpAmount(t.minXrp)}</td>
                  <td className="rl-num" data-label="Accounts at or above">{count(t.accounts)}</td>
                  <td className="rl-num" data-label="Share of XRP">{pctLabel(t.pctOfXrp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="rl-note">
          Thresholds are read from a histogram of every account balance, which
          bounds each figure at {data.method.thresholdRelativeErrorPct}% as of{" "}
          {snapDate}. Shares of XRP are measured against all XRP in funded
          accounts, escrowed and spendable together.
        </p>
      </section>

      {/* ------------------------------------------------------- chart */}
      <section className="uni-home-content rl-section" aria-labelledby="chart">
        <p className="rp-eyebrow">Shape of the ledger</p>
        <h2 id="chart">How XRP is spread across wallets</h2>
        <p className="rp-lead">
          Most funded XRP Ledger accounts hold very little.{" "}
          {pctLabel(
            data.bands
              .filter((b) => b.max != null && b.max <= 1_000)
              .reduce((a, b) => a + b.pctOfAccounts, 0),
          )}{" "}
          of them held under 1,000 XRP as of {snapDate}.
        </p>
        <p className="rl-section-intro">
          Every bar below is one balance band, and its height and the number
          above it are how many accounts held an amount inside that band as of{" "}
          {snapDate}. The smaller figure under each band is that band&rsquo;s
          share of all funded accounts on the same date.
        </p>

        <div className="rl-chart-scroll">
          <DistributionChart
            bands={data.bands}
            snapshotDate={snapDate}
            totalAccounts={data.accounts}
          />
        </div>

        <p className="rl-note">
          Bar heights use a square-root scale as of {snapDate}, so a band holding
          a few hundred accounts stays visible beside one holding three million.
          Reading heights against each other therefore understates the gap
          between them; the printed counts are the exact figures.
        </p>
      </section>

      {/* -------------------------------------------------- band table */}
      <section className="uni-home-content rl-section" aria-labelledby="bands">
        <p className="rp-eyebrow">Band by band</p>
        <h2 id="bands">Wallets and XRP held, by balance band</h2>
        <p className="rp-lead">
          The largest band by account count and the largest by XRP held are not
          the same band, and the table below is where that separation is visible
          as of {snapDate}.
        </p>
        <p className="rl-section-intro">
          Every one of the {count(data.accounts)} funded accounts sits in exactly
          one band as of {snapDate}. The last two columns are the XRP those
          accounts controlled and what share of all XRP that came to, on the
          same date.
        </p>

        <DistributionTable bands={data.bands} snapshotDate={snapDate} />

        <p className="rl-note">
          Bands are decade-wide and read as at least the lower bound and below
          the upper one. Amounts count escrowed XRP alongside spendable
          balances, measured as of {snapDate}.
        </p>
      </section>

      {/* ------------------------------------------------ what it shows */}
      <section className="uni-home-content rl-section" aria-labelledby="what-it-shows">
        <p className="rp-eyebrow">Reading the numbers</p>
        <h2 id="what-it-shows">What the XRP balance distribution shows</h2>
        <div className="rp-article">
          <p>
            {t1
              ? `The top 1% of funded XRP Ledger accounts held ${pctLabel(t1.pctOfXrp)} of the XRP controlled across funded accounts as of ${snapDate}.`
              : ""}{" "}
            {t50
              ? `The top 50% held ${pctLabel(t50.pctOfXrp)} as of ${snapDate}, which leaves the smaller half of accounts holding the rest.`
              : ""}{" "}
            {data.escrowedXrp
              ? `Those shares count escrowed XRP alongside spendable balances, and ${xrpAmount(data.escrowedXrp)} XRP of the total was locked in escrow as of ${snapDate}.`
              : ""}
          </p>
          <p>
            Concentration at the top of this list is not the same as
            concentration of ownership. The largest accounts on the XRP Ledger
            are mostly exchange and custodian wallets, and a single one of them
            can hold balances for millions of customers, which is why this page
            names an account only against evidence it can show beside the name.
          </p>
          <p>
            Most funded accounts hold very little. {" "}
            {data.bands.filter((b) => b.max != null && b.max <= 1000).reduce((s, b) => s + b.pctOfAccounts, 0) > 0
              ? `Accounts holding under 1,000 XRP made up ${pctLabel(
                  data.bands
                    .filter((b) => b.max != null && b.max <= 1_000)
                    .reduce((s, b) => s + b.pctOfAccounts, 0),
                )} of all funded accounts as of ${snapDate}, and together they held ${pctLabel(
                  data.bands
                    .filter((b) => b.max != null && b.max <= 1_000)
                    .reduce((s, b) => s + b.pctOfXrp, 0),
                )} of the XRP in funded accounts.`
              : ""}{" "}
            That shape is why most people who check a balance against this list
            place higher than they expect.
          </p>

          {/* Threshold movement. Nobody else on this SERP shows it, and it is
              the reason to come back next month. Renders only once the daily
              walk has accumulated a second observation, so the first snapshot
              after launch does not print a comparison against itself. */}
          {hist && histFirst && t10 ? (
            <p>
              The top 10% threshold has moved from{" "}
              <strong>{xrpAmount(histFirst.tiers["10"])} XRP</strong> on{" "}
              {utcDate(`${histFirst.d}T00:00:00Z`)} to{" "}
              <strong>{xrpAmount(t10.minXrp)} XRP</strong> as of {snapDate}.
              {histFirst.tiers["1"] && t1 ? (
                <>
                  {" "}
                  The top 1% threshold has moved from{" "}
                  <strong>{xrpAmount(histFirst.tiers["1"])} XRP</strong> on{" "}
                  {utcDate(`${histFirst.d}T00:00:00Z`)} to{" "}
                  <strong>{xrpAmount(t1.minXrp)} XRP</strong> as of {snapDate}.
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </section>

      {/* --------------------------------------------- working vs idle */}
      {yc && yieldRatioPct != null ? (
        <section className="uni-home-content rl-section" aria-labelledby="working-vs-idle">
          <p className="rp-eyebrow">Comparison</p>
          <h2 id="working-vs-idle">How much XRP is working rather than sitting idle</h2>
          <div className="rp-article">
            <p className="rp-lead">
              {count(data.accounts)} accounts were funded on the XRP Ledger as of{" "}
              {snapDate}. Across the wrapped and staked XRP products tracked in
              the XRP yield ranking, {count(yc.receiptTokenHolders)} addresses
              held a position as of {utcDate(yc.asOf ?? snap)}, a figure equal to{" "}
              {pctLabel(yieldRatioPct)} of that XRPL account count.
            </p>
            <p>
              The two figures count different objects and the comparison is a
              ratio rather than a share. An XRP Ledger account is an entry in
              the ledger&rsquo;s own state. A tracked position is an address on
              Flare or Base holding a receipt token for wrapped or staked XRP,
              counted once per product, so a person holding two products appears
              twice. Both readings push the same way: the number of XRP holders
              with a balance doing anything at all is small next to the number
              of accounts that simply hold.
            </p>
            <p>
              The XRP Ledger pays no protocol reward for holding a balance, and
              it has no validator staking, so a balance that sits on the ledger
              earns nothing by design rather than by neglect.{" "}
              <Link href="/report/xrp-yield-ranking">
                The XRP yield ranking
              </Link>{" "}
              tracks where XRP-denominated rates actually come from.
            </p>
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------- concentration */}
      {data.concentration ? (
        <section className="uni-home-content rl-section" aria-labelledby="concentration">
          <p className="rp-eyebrow">Concentration</p>
          <h2 id="concentration">What the largest 100 accounts hold</h2>
          <p className="rp-lead">
            The 100 largest XRP Ledger accounts controlled{" "}
            {share2(data.concentration.top100PctOfXrp)} of all XRP as of{" "}
            {snapDate}, and{" "}
            {share2(data.concentration.exExchangePctOfXrp)} once known exchange
            wallets are set aside.
          </p>
          <p className="rl-section-intro">
            An exchange wallet is thousands of customer balances pooled into one
            account, so counting it as concentration reads the ledger wrong. The
            second figure is the closer answer to how few hands hold XRP, and it
            is still only as complete as the {data.concentration.labelledAccounts}{" "}
            accounts named in this list as of {snapDate}.
          </p>

          {data.concentration.ripplePctOfXrp != null ? (
            <p className="rl-section-intro">
              The headline share is also mostly one entity. Ripple itself
              controlled {data.concentration.rippleAccounts} of these accounts as
              of {snapDate}, holding{" "}
              <strong>{share2(data.concentration.ripplePctOfXrp)}</strong> of all
              XRP in funded accounts on that date, which is more than half of
              everything the top 100 held. Most of it cannot move:{" "}
              {xrpAmount(data.concentration.rippleEscrowedXrp ?? 0)} XRP of that
              position sat in onchain escrow as of {snapDate}, released against a
              published schedule rather than sitting as a spendable balance.
            </p>
          ) : null}

          <div className="rl-stats">
            <div className="rl-stat">
              <span className="rl-stat-num">{share2(data.concentration.top100PctOfXrp)}</span>
              <span className="rl-stat-lab">
                of all XRP held by the top 100 accounts, {snapDate}
              </span>
            </div>
            <div className="rl-stat">
              <span className="rl-stat-num">
                {share2(data.concentration.exExchangePctOfXrp)}
              </span>
              <span className="rl-stat-lab">
                held once the {data.concentration.exchangeAccounts} known exchange
                wallets are excluded, {snapDate}
              </span>
            </div>
            <div className="rl-stat">
              <span className="rl-stat-num">
                {xrpAmount(data.concentration.exchangeXrp)}
              </span>
              <span className="rl-stat-lab">
                XRP sitting in those exchange wallets, {snapDate}
              </span>
            </div>
          </div>

          {data.concentration.residualPctOfXrp != null ? (
            <>
              <div className="rl-breakdown" role="table" aria-label={`The top 100 XRP Ledger accounts split by who holds them, ${snapDate}`}>
                <div className="rl-breakdown-head" role="row">
                  <span role="columnheader">Group</span>
                  <span role="columnheader" className="rl-rank-n">Accounts</span>
                  <span role="columnheader" className="rl-rank-n">XRP</span>
                  <span role="columnheader" className="rl-rank-n">Share of all XRP</span>
                </div>
                {[
                  {
                    k: "ripple",
                    name: "Ripple-controlled",
                    n: data.concentration.rippleAccounts ?? 0,
                    x: data.concentration.rippleXrp ?? 0,
                    p: data.concentration.ripplePctOfXrp ?? 0,
                  },
                  {
                    k: "exchange",
                    name: "Known exchanges",
                    n: data.concentration.exchangeAccounts,
                    x: data.concentration.exchangeXrp,
                    p:
                      data.concentration.top100PctOfXrp -
                      data.concentration.exExchangePctOfXrp,
                  },
                  {
                    k: "founder",
                    name: "Ripple founders",
                    n: data.concentration.founderAccounts ?? 0,
                    x: data.concentration.founderXrp ?? 0,
                    p: data.concentration.founderPctOfXrp ?? 0,
                  },
                  {
                    k: "residual",
                    name: "Unnamed accounts",
                    n: data.concentration.residualAccounts ?? 0,
                    x: data.concentration.residualXrp ?? 0,
                    p: data.concentration.residualPctOfXrp ?? 0,
                  },
                ].map((g) => (
                  <div className="rl-breakdown-row" role="row" key={g.k}>
                    <span role="cell">{g.name}</span>
                    <span role="cell" className="rl-rank-n">{g.n}</span>
                    <span role="cell" className="rl-rank-n">{xrpAmount(g.x)}</span>
                    <span role="cell" className="rl-rank-n">{share2(g.p)}</span>
                  </div>
                ))}
              </div>
              <p className="rl-section-intro">
                Set every named group aside and{" "}
                {data.concentration.residualAccounts} accounts are left, holding{" "}
                <strong>{share2(data.concentration.residualPctOfXrp)}</strong> of
                all XRP as of {snapDate}. Those are the positions this page cannot
                attribute to anyone as of that date, and they are the part of the
                ranking where a reader learns something a headline share does not
                tell them. Each group can be filtered out of the ranking below, so
                the remainder reads on its own.
              </p>
              <p className="rl-section-intro">
                One more distinction worth keeping. The{" "}
                {data.concentration.founderAccounts} founder accounts are personal
                balances attributed to people who co-founded Ripple, holding{" "}
                {share2(data.concentration.founderPctOfXrp ?? 0)} of all XRP as of{" "}
                {snapDate}. They are counted apart from the company because the
                company does not control them, and a total that merges the two
                overstates what Ripple holds by that margin.
              </p>
            </>
          ) : null}

          {data.concentration.largestIndividual ? (
            <p className="rl-highlight">
              The largest holding attributed to a person rather than to a company
              or a trading venue was{" "}
              <strong>
                {count(data.concentration.largestIndividual.xrp)} XRP
              </strong>
              {data.xrpUsd ? (
                <>
                  , worth about{" "}
                  <strong>
                    ${count(data.concentration.largestIndividual.xrp * data.xrpUsd)}
                  </strong>{" "}
                  at {data.xrpUsd.toFixed(4)} US dollars per XRP
                </>
              ) : null}{" "}
              as of {snapDate}, at rank{" "}
              {data.concentration.largestIndividual.rank} in the list below.
              That account is attributed to{" "}
              {data.concentration.largestIndividual.name} by{" "}
              {data.concentration.largestIndividual.attribution ?? "a third party"}{" "}
              rather than by this page.
            </p>
          ) : null}

          <p className="rl-note">{data.concentration.basis}</p>
        </section>
      ) : null}

      {/* ------------------------------------------------ top accounts */}
      <section className="uni-home-content rl-section" aria-labelledby="top-accounts">
        <p className="rp-eyebrow">Largest accounts</p>
        <h2 id="top-accounts">Top 100 XRP wallets</h2>
        <p className="rp-lead">
          The 100 largest funded XRP Ledger accounts as of {snapDate}, read from
          ledger {count(data.ledgerIndex)} and ranked on the XRP each one
          controls.
        </p>
        <p className="rl-section-intro">
          {labelled.length > 0
            ? `${labelled.length} of the 100 carry a name as of ${snapDate}.`
            : `None of the 100 is named as of ${snapDate}.`}{" "}
          {selfDeclared.length === 0
            ? "Not one of them publishes a domain onchain, which is the only identity an account can declare about itself, so no name here rests on that."
            : `${selfDeclared.length} publish a domain onchain, which is the strongest evidence available.`}{" "}
          Naming an account from how it transacts would be a guess, so this page
          names an account only against a source it can show. An account is
          ranked on its spendable balance plus anything it holds in onchain
          escrow, which is why an account with a few hundred XRP spendable can
          sit near the top.
        </p>

        <TopAccountsTable
          rows={data.top}
          snapshotDate={snapDate}
          xrpUsd={data.xrpUsd ?? null}
        />

        <p className="rl-note">
          {data.xrpUsd ? (
            <>
              Dollar values use {data.xrpUsd.toFixed(4)} US dollars per XRP as of{" "}
              {snapDate}, read from {data.xrpUsdSource}. They move with the price
              and the XRP amounts beside them do not.{" "}
            </>
          ) : null}
          Share of supply is measured against all XRP in funded accounts as of{" "}
          {snapDate}, and the escrow column is the part of each balance locked
          onchain on that date rather than a figure on top of it.{" "}
          {attribution
            ? `Every name in the table is attributed by ${attribution} rather than established by this page, and each one links to that provider's record in the dataset export below.`
            : "Every name in the table is a third-party attribution rather than a finding of this page."}{" "}
          Addresses are shortened in the middle so the column keeps one width;
          the full address is in the dataset export and appears on hover.
        </p>
      </section>

      {/* -------------------------------------------------------- FAQ */}
      <section className="uni-home-content rl-section" aria-labelledby="faq">
        <p className="rp-eyebrow">Questions</p>
        <h2 id="faq">XRP rich list questions</h2>
        <div className="rp-faq">
          {faqs.map((f, i) => (
            <details className="rp-faq-item" key={f.q} open={i === 0}>
              <summary className="rp-faq-q">
                <span>{f.q}</span>
                <span className="rp-faq-mark" aria-hidden="true" />
              </summary>
              <p className="rp-faq-a">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------- bridge */}
      <section className="uni-home-content rl-section" aria-labelledby="bridge">
        <div className="rl-bridge">
          <h2 id="bridge">Where an XRP balance can go to work</h2>
          <p>
            The XRP Ledger itself pays nothing for holding, so every rate on
            XRP-denominated capital comes from somewhere else: a wrapped form of
            XRP supplied to a lending market, a vault, a fixed-rate product or a
            liquidity pool, mostly on Flare and Base. The XRP yield ranking
            tracks those venues and reads every rate from the venue&rsquo;s own
            contracts.
          </p>
          <Link className="rl-bridge-cta" href="/report/xrp-yield-ranking">
            See the XRP yield ranking
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------- methodology */}
      <section className="uni-home-content rl-section" aria-labelledby="methodology">
        <p className="rp-eyebrow">Method</p>
        <h2 id="methodology">How this XRP rich list is built</h2>
        <dl className="rp-methodology-dl rl-method">
          <dt>Source</dt>
          <dd>
            Every AccountRoot object in one validated XRP Ledger, read over
            public JSON-RPC from XRP Ledger nodes. Ledger{" "}
            {count(data.ledgerIndex)} closed {snapStamp} and is the single
            source for every figure on this page. No explorer rich list and no
            third-party dataset is used.
          </dd>
          <dt>Why one ledger</dt>
          <dd>
            The XRP Ledger closes a new version every three to five seconds. The
            walk is pinned to one ledger index so the snapshot describes a state
            that actually existed, rather than mixing accounts read seconds
            apart.
          </dd>
          <dt>What counts as a funded account</dt>
          <dd>{data.method.fundedAccountDefinition}</dd>
          <dt>What each account is ranked on</dt>
          <dd>
            The XRP an account controls, which is its spendable balance plus
            anything it has locked in onchain escrow. The two are separate on the
            ledger: escrowed drops leave the account&rsquo;s balance and sit in an
            Escrow object until their release date. Ranking on balance alone
            would put the six largest XRP positions on the network outside this
            list, since each of those accounts holds a few hundred XRP spendable
            against billions locked.
          </dd>
          <dt>How percentiles are computed</dt>
          <dd>
            Balances are aggregated into a log-spaced histogram as they stream,
            at {count(data.method.bucketsPerDecade)} buckets per decade, which
            bounds the error on any tier threshold shown for {snapDate} at{" "}
            {data.method.thresholdRelativeErrorPct}%. Counts quoted at round
            balances as of {snapDate}, such as the number of accounts holding at
            least 10,000 XRP, are counted exactly rather than read off the
            histogram.
          </dd>
          <dt>How the walk is checked</dt>
          <dd>
            {data.supplyReconciliation ? (
              <>
                Spendable balances and escrowed XRP, both read at ledger{" "}
                {count(data.ledgerIndex)}, came to{" "}
                {count(data.supplyReconciliation.walkedXrp)} XRP against the
                ledger&rsquo;s own total supply of{" "}
                {count(data.supplyReconciliation.ledgerTotalCoinsXrp)} XRP as of{" "}
                {snapDate}, a difference of{" "}
                {count(Math.abs(data.supplyReconciliation.differenceXrp))} XRP,
                or {data.supplyReconciliation.differencePct}% of supply. That
                remainder sits in ledger objects which also hold XRP outside an
                account balance, chiefly payment channels, and it is reported
                rather than distributed across accounts it cannot be attributed
                to. The check earns its place by size: a walk that missed pages
                would show a gap of billions rather than of thousands, which is
                how a truncated escrow pass was caught during development.
              </>
            ) : (
              "Spendable balances and escrowed XRP are read at the same ledger index and summed against the ledger's own total supply. Every XRP that exists sits in an account or in an escrow, so a truncated walk shows up as a gap of billions."
            )}
          </dd>
          <dt>Labels</dt>
          <dd>
            An account is named only against evidence the page can show: a
            domain the account publishes onchain, an operator whose domain lists
            the address under the XRP Ledger&rsquo;s own standard, an address the
            operator published officially, or an attribution by a named data
            provider. Which one applies is printed next to every name. Identity
            is never inferred from how an account transacts, and the build
            rejects a label that cannot state its source.
          </dd>
          <dt>Known limitations</dt>
          <dd>
            An account is not a person. Exchanges and custodians hold balances
            for many customers in a small number of accounts, and one person can
            control many accounts, so this distribution describes accounts
            rather than owners. Balances held off the XRP Ledger, including XRP
            wrapped onto other networks, are outside it.
          </dd>
        </dl>
        <p className="rp-source-note">
          Published by {SITE_AUTHOR.name}. Figures on this page are informational
          research, not financial advice.
        </p>
      </section>
    </div>
  );
}
