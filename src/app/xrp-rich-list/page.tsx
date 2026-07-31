import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { SITE_AUTHOR } from "@/lib/author";
import { breadcrumbSchema, faqPageSchema, reportDatasetSchema } from "@/lib/jsonld";
import { PercentileCalculator } from "@/components/richlist/percentile-calculator";
import {
  DistributionChart,
  DistributionTable,
} from "@/components/richlist/distribution-chart";
import {
  loadRichList,
  tierOf,
  xrpAmount,
  count,
  countProse,
  pctLabel,
  utcDate,
  utcStamp,
  evidenceLabel,
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

export default function XrpRichListPage() {
  const data = loadRichList();

  if (!data) {
    return (
      <main className="uni-home">
        <section className="uni-home-content">
          <h1>XRP Rich List</h1>
          <p className="rp-lead">
            The XRP Ledger snapshot behind this page is being rebuilt. Live
            figures return once the next ledger walk completes.
          </p>
        </section>
      </main>
    );
  }

  const snap = data.ledgerCloseIso;
  const snapDate = utcDate(snap);
  const snapStamp = utcStamp(snap);
  // Derived from the snapshot, never hardcoded, so the current-year cluster is
  // covered with no annual maintenance and it rolls over on 1 January, which
  // is exactly when the demand rolls.
  const year = new Date(snap).getUTCFullYear();

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
  const withEscrow = data.top.filter((t) => (t.escrows ?? 0) > 0);

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
    <main className="uni-home rl-page">
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

      {/* ---------------------------------------------------------- hero */}
      <section className="uni-home-hero rl-hero">
        <div className="rl-hero-main">
          <h1>XRP Rich List</h1>
          <p className="rl-hero-sub">
            Enter your balance. See where you stand among the{" "}
            {countProse(data.accounts)} XRP Ledger accounts funded as of{" "}
            {snapDate}.
          </p>
          <p className="rl-updated">
            <span className="rl-live-dot" aria-hidden="true" />
            Updated {snapStamp}
          </p>

          <ul className="rl-keyfind">
            {t10 ? (
              <li>
                The top 10% of funded XRP Ledger accounts held at least{" "}
                <strong>{xrpAmount(t10.minXrp)} XRP</strong> as of {snapDate}.
              </li>
            ) : null}
            {t1 ? (
              <li>
                The top 1% threshold stood at{" "}
                <strong>{xrpAmount(t1.minXrp)} XRP</strong> as of {snapDate}.
              </li>
            ) : null}
            <li>
              <strong>{count(data.accounts)}</strong> XRP Ledger accounts were
              funded as of {snapDate}, holding{" "}
              {xrpAmount(data.xrpHeld)} XRP between them.
            </li>
            {yc && yieldRatioPct != null ? (
              <li>
                Against those {countProse(data.accounts)} funded accounts,{" "}
                <strong>{count(yc.receiptTokenHolders)}</strong> addresses held
                a wrapped or staked XRP product onchain as of {utcDate(yc.asOf ?? snap)},
                a figure equal to {pctLabel(yieldRatioPct)} of the XRPL account
                count.
              </li>
            ) : null}
          </ul>
        </div>

        <div className="rl-hero-aside">
          <PercentileCalculator
            ladder={data.ladder}
            accounts={data.accounts}
            snapshotDate={snapDate}
          />
        </div>
      </section>

      {/* -------------------------------------------------- thresholds */}
      <section className="uni-home-content" aria-labelledby="thresholds">
        <p className="rp-eyebrow">Distribution</p>
        <h2 id="thresholds">XRP rich list {year}: current thresholds</h2>
        <p className="rp-lead">
          {t1 && t10 && t50
            ? `The minimum balance for the top 1% of funded XRP Ledger accounts was ${xrpAmount(t1.minXrp)} XRP as of ${snapDate}, against ${xrpAmount(t10.minXrp)} XRP for the top 10% and ${xrpAmount(t50.minXrp)} XRP for the top 50%.`
            : ""}{" "}
          Each threshold below is the smallest balance that placed an account in
          that percentage of all {count(data.accounts)} funded accounts as of{" "}
          {snapDate}.
        </p>

        <div className="rl-dtable-wrap" data-nosnippet="">
          <table className="rl-dtable rl-tiers">
            <caption className="rl-dtable-cap">
              XRP rich list thresholds by percentage tier, as of {snapDate}
            </caption>
            <thead>
              <tr>
                <th scope="col">Percentage tier</th>
                <th scope="col">Minimum XRP balance</th>
                <th scope="col">Accounts at or above</th>
                <th scope="col">Share of XRP held</th>
              </tr>
            </thead>
            <tbody>
              {data.tiers.map((t) => (
                <tr key={t.pct}>
                  <th scope="row">Top {t.pct}%</th>
                  <td className="rl-num">{xrpAmount(t.minXrp)}</td>
                  <td className="rl-num">{count(t.accounts)}</td>
                  <td className="rl-num">{pctLabel(t.pctOfXrp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DistributionChart
          bands={data.bands}
          snapshotDate={snapDate}
          totalAccounts={data.accounts}
        />
        <DistributionTable bands={data.bands} snapshotDate={snapDate} />
      </section>

      {/* ------------------------------------------------ what it shows */}
      <section className="uni-home-content" aria-labelledby="what-it-shows">
        <p className="rp-eyebrow">Reading the numbers</p>
        <h2 id="what-it-shows">What the XRP balance distribution shows</h2>
        <div className="rp-article">
          <p>
            {t1
              ? `The top 1% of funded XRP Ledger accounts held ${pctLabel(t1.pctOfXrp)} of the XRP sitting in funded accounts as of ${snapDate}.`
              : ""}{" "}
            {t50
              ? `The top 50% held ${pctLabel(t50.pctOfXrp)} as of ${snapDate}, which leaves the smaller half of accounts holding the rest.`
              : ""}
          </p>
          <p>
            Concentration at the top of this list is not the same as
            concentration of ownership. The largest accounts on the XRP Ledger
            are mostly exchange and custodian wallets, and a single one of them
            can hold balances for millions of customers, which is why this page
            labels an account only when that account publishes a domain onchain.
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
        <section className="uni-home-content" aria-labelledby="working-vs-idle">
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

      {/* ------------------------------------------------ top accounts */}
      <section className="uni-home-content" aria-labelledby="top-accounts">
        <p className="rp-eyebrow">Largest accounts</p>
        <h2 id="top-accounts">Top 100 XRP wallets</h2>
        <p className="rp-lead">
          The 100 largest funded XRP Ledger accounts as of {snapDate}, read from
          ledger {count(data.ledgerIndex)}.{" "}
          {labelled.length > 0
            ? `${labelled.length} of the 100 are named as of ${snapDate}, each against evidence shown beside the name.`
            : `None of the 100 is named as of ${snapDate}.`}{" "}
          {selfDeclared.length === 0
            ? "Not one of them publishes a domain onchain, which is the only identity an account can declare about itself, so no name here rests on that."
            : `${selfDeclared.length} publish a domain onchain, which is the strongest evidence available.`}{" "}
          Large accounts are usually exchange or custodian wallets. Naming one
          from how it transacts would be a guess, so this page names an account
          only against a source it can show.
        </p>
        {withEscrow.length ? (
          <p className="rp-lead">
            {withEscrow.length} of the 100 largest accounts held XRP in onchain
            escrow as of {snapDate}, locking{" "}
            {xrpAmount(withEscrow.reduce((s, t) => s + (t.escrowedXrp ?? 0), 0))}{" "}
            XRP on top of their spendable balances. Escrowed XRP is time-locked
            by the ledger itself and cannot be moved before its release date.
          </p>
        ) : null}
        <div className="rl-dtable-wrap rl-scroll" data-nosnippet="">
          <table className="rl-dtable rl-top">
            <caption className="rl-dtable-cap">
              Largest 100 XRP Ledger accounts by balance, as of {snapDate}
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Account</th>
                <th scope="col">Onchain notes</th>
                <th scope="col">XRP balance</th>
                <th scope="col">Share of XRP</th>
              </tr>
            </thead>
            <tbody>
              {data.top.map((t) => (
                <tr key={t.address}>
                  <th scope="row">{t.rank}</th>
                  <td className="rl-addr">{t.address}</td>
                  <td>
                    {t.label ? (
                      <span className="rl-label">
                        <strong>{t.label.name}</strong>
                        <span className="rl-evidence">
                          {t.label.evidenceUrl ? (
                            <a
                              href={t.label.evidenceUrl}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                            >
                              {evidenceLabel(t.label)}
                            </a>
                          ) : (
                            evidenceLabel(t.label)
                          )}
                        </span>
                      </span>
                    ) : t.domain ? (
                      <span className="rl-label">
                        <strong>{t.domain}</strong>
                        <span className="rl-evidence">published by the account onchain</span>
                      </span>
                    ) : t.escrows ? (
                      <span className="rl-note">
                        {t.escrows} escrow{t.escrows === 1 ? "" : "s"} locking{" "}
                        {xrpAmount(t.escrowedXrp ?? 0)} XRP
                      </span>
                    ) : (
                      <span className="rl-dim">nothing published</span>
                    )}
                  </td>
                  <td className="rl-num">{count(t.xrp)}</td>
                  <td className="rl-num">{pctLabel(t.pctOfSupply)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* -------------------------------------------------------- FAQ */}
      <section className="uni-home-content" aria-labelledby="faq">
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
      <section className="uni-home-content" aria-labelledby="bridge">
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
      <section className="uni-home-content" aria-labelledby="methodology">
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
    </main>
  );
}
