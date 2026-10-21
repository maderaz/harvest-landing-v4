// Dedicated body for /eth.
//
// /eth used to render through the shared asset-hub-body.tsx: a ranking table,
// a stat strip and a few paragraphs of definitions, no answer anywhere in the
// prose and no FAQ markup. Search Console says the page is already being
// surfaced for full-sentence questions, most of them scoped to a network:
//
//   where can i earn yield on eth on base?               pos 2.4
//   which protocols pay the highest eth yield on an l2?  pos 3.0
//   which eth yield options on base are the safest?      pos 4.8
//   what can i do with wrapped eth on base to earn yield? pos 5.3
//   what are the best options for eth yield with cheap gas? pos 4.0
//
// and earning almost no clicks from them, because the page had no sentence an
// answer engine could lift. This body is built around those questions: each
// one gets a section whose heading reads like the query and whose first
// sentence is the answer, with the figure, the scope and the date in it.
//
// Same house style and the same shared pieces as /usdc (Block shell, HubTable,
// calculator, schema helpers), so the two long-form hubs read as one site.
import Link from "next/link";
import { getLiveVaults, getAllSparklines, loadHistoryFile } from "@/lib/data";
import { AssetIcon, ChainIcon } from "@/components/token-icons";
import { SITE_URL } from "@/lib/constants";
import { assetHubH1, assetHubCrumbs } from "@/lib/seo";
import {
  breadcrumbSchema,
  itemListSchema,
  faqPageSchema,
  reportDatasetSchema,
} from "@/lib/jsonld";
import { HubTable } from "@/components/hub-table";
import { HomeCrumb } from "@/components/home-crumb";
import { RankingDataNote } from "@/components/ranking-data-note";
import { UsdcCalculator, type CalcProduct } from "@/components/usdc-calculator";
import { EthLoopFigure } from "@/components/eth-loop-figure";
import { harvestAppUrl } from "@/lib/harvest-app";
import {
  proseName,
  listOf,
  plural,
  apy,
  apyFloorLabel,
  tvl,
} from "@/lib/usdc-hub";
import {
  buildEthCohort,
  byStrategyType,
  networkPicks,
  evidenceRows,
  trackedLabel,
  strategyTypeOf,
  tokenOf,
  isL2,
  ETH_NETWORKS,
  STRATEGY_LABEL,
  type EthCohort,
  type EthNetworkPicks,
  type EthTypeRow,
} from "@/lib/eth-hub";

const HUB_URL = `${SITE_URL}/eth`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "WETH Autopilot", without the "(Base)" the cohort appends for tables. */
type FaqSpot = "top" | "network" | "types" | "safety" | "calc" | "staking" | "risk";
interface Faq {
  q: string;
  at: FaqSpot;
  a: string;
}

/** Stable anchor for a question, so the index at the foot can link to it. */
const qid = (q: string) =>
  "q-" +
  q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

// Bold the figures in a generated sentence. Rates, dollar sizes and counts of
// strategies are what a skimming reader's eye is hunting for, so they carry
// the weight; the words around them stay regular. Wrapping in <strong> leaves
// the extracted text identical, so nothing an answer engine lifts changes.
const FIGURE =
  /(\$[\d.,]+[KMB]?|\d+(?:\.\d+)?%(?: APY)?|\b\d+ of (?:the )?\d+\b|\b\d+ (?:ETH |WETH )?strateg(?:y|ies)\b)/g;
function Em({ text }: { text: string }) {
  const parts = text.split(FIGURE);
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
    </>
  );
}

/**
 * The questions a reader tends to have at this point in the page, answered in
 * place. Same <details> pattern as the FAQ on /usdc, so every answer is in the
 * HTML whether or not it is open, and the FAQPage schema still lists them all.
 */
function Ask({ items }: { items: Faq[] }) {
  if (!items.length) return null;
  return (
    <aside className="eh-ask" aria-label="Questions on this section">
      <p className="eh-ask-h">Questions readers ask here</p>
      <div className="uh-faq">
        {items.map((f, i) => (
          <details className="uh-faq-item" key={f.q} id={qid(f.q)} open={i === 0}>
            <summary className="uh-faq-q">
              <span>{f.q}</span>
              <Chevron />
            </summary>
            <p className="uh-faq-a">
              <Em text={f.a} />
            </p>
          </details>
        ))}
      </div>
    </aside>
  );
}

const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

const bare = (v: { productName: string }) => v.productName.replace(/\s*\([^)]*\)$/, "");

function Block({
  id,
  eyebrow,
  title,
  lead,
  asOf,
  asOfIso,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  asOf?: string;
  asOfIso?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="uh-block" aria-labelledby={id} data-asof={asOfIso}>
      <p className="rp-eyebrow" data-dateline={asOf ? "" : undefined}>
        {eyebrow}
        {asOf && (
          <>
            <span className="uh-eyebrow-sep" aria-hidden="true"> · </span>
            <span className="uh-eyebrow-date">{asOf}</span>
          </>
        )}
      </p>
      <h2 id={id}>{title}</h2>
      {lead && (
        <p className="uh-lead">
          <Em text={lead} />
        </p>
      )}
      {children}
    </section>
  );
}

function Chevron() {
  return (
    <svg
      className="uh-faq-chev"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

const SINGULAR: Record<string, string> = {
  allocator: "allocator",
  curated: "curated lending vault",
  "money-market": "money market",
  looping: "leveraged loop",
};

const PLURAL: Record<string, string> = {
  allocator: "allocators",
  curated: "curated lending vaults",
  "money-market": "money markets",
  looping: "leveraged loops",
};

const TYPE_BLURB: Record<string, string> = {
  allocator:
    "A contract moves the ETH between lending venues as their rates change, so the position follows the best available rate without anyone rebalancing it by hand.",
  curated:
    "A curator such as Gauntlet, Steakhouse or Clearstar spreads the ETH across several isolated lending markets on Morpho or Euler and sets the risk limits for each one.",
  "money-market":
    "The ETH is lent straight into one pooled market such as Aave, Compound or Fluid, where borrowers pay a rate set by how much of the pool is in use.",
  looping:
    "The strategy supplies ETH, borrows ETH against it and supplies the borrowed ETH again, multiplying the gap between the supply and borrow rates.",
};

/** Network answer sentence, also the lead of that network's card. */
function networkSentence(n: EthNetworkPicks, c: EthCohort): string {
  const [first, second] = n.picks;
  if (!first) {
    return n.bestRaw
      ? `No ETH strategy on ${n.chain} held ${tvl(c.fundedFloor)} or more as of ${c.asOf}; the ` +
          `highest rate there was ${apy(n.bestRaw.apy24h)} on ${bare(n.bestRaw)}, which ` +
          `held ${tvl(n.bestRaw.tvl)}.`
      : "";
  }
  return (
    `The best ETH yield on ${n.chain} was ${apy(first.apy24h)} APY on ${bare(first)} as of ` +
    `${c.asOf}` +
    (second ? `, followed by ${bare(second)} at ${apy(second.apy24h)}` : "") +
    `, among ${n.chain} strategies holding at least ${tvl(c.fundedFloor)}.`
  );
}

function buildFaqs(
  c: EthCohort,
  nets: EthNetworkPicks[],
  types: EthTypeRow[],
): Faq[] {
  if (!c.best) return [];
  const base = nets.find((n) => n.chain === "Base");
  const l2Best = c.funded.find((v) => isL2(v.chain)) ?? null;
  const mainnetBest = c.funded.find((v) => v.chain === "Ethereum") ?? null;
  const onOne = (rate: number) => (rate / 100).toFixed(4);
  const onTen = (rate: number) => ((10 * rate) / 100).toFixed(3);
  const allocator = types.find((t) => t.type === "allocator");
  const wethRows = c.all.filter((v) => tokenOf(v) === "WETH");
  const smallCount = c.count - c.fundedCount;
  const baseLargest = c.funded
    .filter((v) => v.chain === "Base")
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 3);

  const list: Faq[] = [
    {
      q: "What is the best ETH yield right now?",
      at: "top",
      a:
        `${apy(c.best.apy24h)} APY, paid in ETH by ${proseName(c.best)}, as of ${c.asOf}. That is ` +
        `the highest 24-hour rate among the ${c.count} ETH strategies tracked here once a ` +
        `${tvl(c.fundedFloor)} liquidity floor is applied. The floor matters on ETH more than ` +
        `on most assets: ${smallCount} of the ${c.count} strategies held less than that, and ` +
        `a small vault can print a high rate that nobody is earning at size.`,
    },
    {
      q: "Where can I earn yield on ETH on Base?",
      at: "network",
      a: base?.picks.length
        ? `${networkSentence(base, c)} Base carried ${base.count} of the ${c.count} ETH ` +
          `strategies tracked here as of ${c.asOf}, more than any other network, and Base ` +
          `transactions cost a few cents.`
        : "",
    },
    {
      q: "Which protocols pay the highest ETH yield on an L2?",
      at: "network",
      a: l2Best
        ? `Among strategies holding at least ${tvl(c.fundedFloor)} as of ${c.asOf}, the highest ` +
          `ETH rate on a layer 2 was ${apy(l2Best.apy24h)} on ${proseName(l2Best)}, ` +
          `${article(SINGULAR[strategyTypeOf(l2Best)])} ${SINGULAR[strategyTypeOf(l2Best)]}. ` +
          (mainnetBest
            ? `The best funded rate on Ethereum mainnet was ${apy(mainnetBest.apy24h)} on ` +
              `${proseName(mainnetBest)}, so on these readings the L2 paid more as well as ` +
              `costing less to use.`
            : `No funded ETH strategy on Ethereum mainnet was tracked on that date.`)
        : "",
    },
    {
      q: "What can I do with wrapped ETH (WETH) on Base to earn yield?",
      at: "types",
      a:
        `WETH is ETH wrapped one-to-one into an ERC-20 token so that lending contracts can hold ` +
        `it, and every ETH strategy on Base takes it. As of ${c.asOf} there were four ways to put ` +
        `it to work in this index: lend it into a pooled market such as Aave or Compound, hand ` +
        `it to a curated Morpho or Euler vault, let an allocator such as Autopilot move it ` +
        `between venues, or loop it with leverage. ${wethRows.length} of the ${c.count} ` +
        `strategies here are labelled WETH and the rest ETH, which is the same asset under a ` +
        `different label.`,
    },
    {
      q: "Which ETH yield options on Base are the safest to use?",
      at: "safety",
      a:
        `Every ETH yield carries risk, so instead of a safety score this page lists four ` +
        `measurements: how much ETH a strategy holds, how long it has been ` +
        `tracked, how far its rate moved over 30 days, and how many contract layers it adds. ` +
        (baseLargest.length
          ? `On size, the largest ETH strategies on Base as of ${c.asOf} were ` +
            `${listOf(baseLargest.map((v) => `${proseName(v)} (${tvl(v.tvl)})`))}. `
          : "") +
        `The fewest-layer option is a plain money market, and the safety section lists every ` +
        `funded strategy with all four readings.`,
    },
    {
      q: "What are the best options for ETH yield with cheap gas?",
      at: "network",
      a:
        `Base and Arbitrum, the two layer 2 networks in this index, settle transactions for ` +
        `cents, while a busy Ethereum mainnet can cost dollars, which matters most on ` +
        `a small position where gas would eat a year of yield. ` +
        (l2Best
          ? `The best funded ETH rate on a layer 2 was ${apy(l2Best.apy24h)} on ` +
            `${proseName(l2Best)} as of ${c.asOf}.`
          : ""),
    },
    {
      q: "What are the best ETH vaults for passive income?",
      at: "types",
      a: allocator?.bestFunded
        ? `Allocators and autocompounders need nothing done after entry: they harvest and ` +
          `compound on their own schedule. The best funded allocator was ` +
          `${proseName(allocator.bestFunded)} at ${apy(allocator.bestFunded.apy24h)} APY as of ` +
          `${c.asOf}, holding ${tvl(allocator.bestFunded.tvl)}. Every strategy on this page ` +
          `autocompounds, so the rate shown already includes compounding.`
        : "",
    },
    {
      q: "Which DeFi vaults pay the best yield on WETH?",
      at: "types",
      a: (() => {
        const w = wethRows.filter((v) => v.tvl >= c.fundedFloor);
        const top = w[0] ?? wethRows[0];
        if (!top) return "";
        return (
          `Among the ${wethRows.length} strategies labelled WETH in this index, the highest rate ` +
          `was ${apy(wethRows[0].apy24h)} on ${proseName(wethRows[0])}` +
          (w[0] && w[0].slug !== wethRows[0].slug
            ? `, and the highest on a strategy holding at least ${tvl(c.fundedFloor)} was ` +
              `${apy(w[0].apy24h)} on ${proseName(w[0])}`
            : "") +
          `, as of ${c.asOf}. The ETH-labelled strategies take the same asset, so the full ` +
          `ranking above is the complete answer.`
        );
      })(),
    },
    {
      q: "Can I earn a higher yield on ETH than regular staking?",
      at: "staking",
      a:
        `Staking pays validators newly issued ETH plus transaction fees, and this index does not ` +
        `measure it. What it does measure is the lending side: as of ${c.asOf}, strategies holding ` +
        `at least ${tvl(c.fundedFloor)} paid ${apyFloorLabel(c.fundedMinApy)} to ` +
        `${apy(c.fundedMaxApy)}. ` +
        (c.bestRaw && strategyTypeOf(c.bestRaw) === "looping"
          ? `The highest rate in the table, ${apy(c.bestRaw.apy24h)} on ${proseName(c.bestRaw)}, ` +
            `came from leveraged looping, which adds a liquidation risk staking does not carry.`
          : `Rates above that range usually come from leverage or reward emissions, and both add ` +
            `a risk staking does not carry.`),
    },
    {
      q: "Can I earn yield on ETH without lockups or a withdrawal queue?",
      at: "staking",
      a:
        `Yes. None of the ${c.count} strategies here is a validator ` +
        `position, so none waits in Ethereum's validator exit queue. A lending position can be ` +
        `withdrawn whenever the market underneath has unborrowed ETH to pay it out, which is ` +
        `nearly always and not guaranteed. When a market is fully borrowed, suppliers wait until ` +
        `borrowers repay or the rate pulls new supply in.`,
    },
    {
      q: "How much can I earn on 1 ETH or 10 ETH?",
      at: "calc",
      a:
        `At the top funded rate of ${apy(c.best.apy24h)} as of ${c.asOf}, 1 ETH would earn about ` +
        `${onOne(c.best.apy24h)} ETH over a year and 10 ETH about ${onTen(c.best.apy24h)} ETH, ` +
        `before any rate change. At the median of ${apy(c.medianApy)}, 10 ETH would earn about ` +
        `${onTen(c.medianApy)} ETH. The yield is paid in ETH, so its dollar value moves with ` +
        `the ETH price.`,
    },
    {
      q: "Is the APY paid in ETH or in dollars?",
      at: "calc",
      a:
        `In ETH. Every rate on this page is earned on an ETH balance and paid in ETH, so a 3% ` +
        `APY means the ETH balance grows by about 3% over a year. Whether that is worth more or ` +
        `less in dollars depends on the ETH price, which the rate says nothing about.`,
    },
    {
      q: "Where does ETH yield come from?",
      at: "staking",
      a:
        `Mostly from borrowers. Traders borrow ETH to sell it short or to loop staked-ETH ` +
        `positions, and the interest they pay is what an ETH lender earns. Allocators and curated ` +
        `vaults route the same interest through a strategy, and some rates add a reward token ` +
        `that the strategy harvests and sells back into ETH.`,
    },
    {
      q: "Is ETH yield safe?",
      at: "risk",
      a:
        `Every strategy here carries smart-contract risk on the vault ` +
        `and on the protocol under it, oracle risk on the price feeds those contracts trust, and ` +
        `liquidity risk when a market runs fully borrowed. Strategies that accept staked or ` +
        `restaked ETH as collateral add the risk that those tokens trade below ETH, which ` +
        `happened to rsETH in April 2026. As of ${c.asOf}, ${smallCount} of the ${c.count} ` +
        `strategies held under ${tvl(c.fundedFloor)}, so their rates have not been tested by ` +
        `much liquidity.`,
    },
  ];
  return list.filter((f) => f.a);
}

export async function EthHubBody() {
  const [allVaults, sparklines] = await Promise.all([getLiveVaults(), getAllSparklines()]);
  const history = loadHistoryFile();
  const c = buildEthCohort(
    allVaults.filter((v) => v.asset === "ETH"),
    history,
  );

  if (!c.best) {
    return (
      <div className="uni-hub-test">
        <h1 className="uni-hub-h1">{assetHubH1("ETH")}</h1>
        <p className="uni-hub-sub">ETH yield strategies are populating, check back shortly.</p>
      </div>
    );
  }

  const crumbs = assetHubCrumbs("ETH");
  const nets = ETH_NETWORKS.map((ch) => networkPicks(c, ch)).filter((n) => n.count > 0);
  const types = byStrategyType(c);
  const evidence = evidenceRows(c, history);
  const faqs = buildFaqs(c, nets, types);
  const asks = (at: FaqSpot) => faqs.filter((f) => f.at === at);
  const base = nets.find((n) => n.chain === "Base");
  const l2Count = c.all.filter((v) => isL2(v.chain)).length;
  const fundedL2 = c.funded.filter((v) => isL2(v.chain)).length;
  const visibleChains = [...c.chains].sort();
  const [n1, n2] = c.byNetwork;

  const calcProducts: CalcProduct[] = c.all.map((v) => ({
    slug: v.slug,
    name: v.productName,
    apy: v.apy24h,
    chain: v.chain,
    appUrl: harvestAppUrl(v.chain, v.contractAddress),
  }));

  // The questions the page answers, as a jump list under the hero. A reader
  // arriving from an AI answer usually came with one of these in mind.
  const jumps: { href: string; label: string }[] = [
    { href: "#by-network", label: "ETH yield on Base" },
    { href: "#by-network", label: "Base vs Arbitrum vs mainnet" },
    { href: "#strategy-types", label: "What to do with WETH" },
    { href: "#safest", label: "Safest options" },
    { href: "#vs-staking", label: "Yield vs staking" },
    { href: "#calculator", label: "Earnings calculator" },
    { href: "#faq", label: "All questions" },
  ];

  const findings = [
    `The ${c.count} ETH strategies tracked here held ${tvl(c.totalTvl)} between them across ` +
      `${c.chainCount} ${plural(c.chainCount, "network", "networks")}, and ${c.fundedCount} ` +
      `of them held at least ${tvl(c.fundedFloor)}.`,
    `The median ETH rate across all ${c.count} strategies was ${apy(c.medianApy)}, and the ` +
      `average weighted by TVL was ${apy(c.tvlWeightedApy)}.`,
    `${l2Count} of the ${c.count} ETH strategies ran on a layer 2 network, Base or Arbitrum, ` +
      `including ${fundedL2} of the ${c.fundedCount} that held at least ${tvl(c.fundedFloor)}.`,
    ...(n1
      ? [
          `${n1.chain} carried more ETH strategies than any other network tracked, ${n1.count} ` +
            `of ${c.count}, holding ${tvl(n1.tvl)}` +
            (n2 ? `, against ${n2.count} on ${n2.chain} holding ${tvl(n2.tvl)}` : "") +
            `.`,
        ]
      : []),
  ];

  return (
    <div className="uni-hub-test uh-page eh-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema(crumbs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            ...itemListSchema(c.all, HUB_URL),
            name: "ETH yield strategies ranked by 24-hour APY",
            numberOfItems: c.count,
            dateModified: c.asOfIso,
          }),
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
            reportDatasetSchema({
              name: "ETH yield strategies tracked by Harvest",
              description:
                `Live 24-hour APY, 30-day mean APY and tracked value for the ${c.count} ETH and ` +
                `WETH yield strategies Harvest indexes across ${c.chainCount} networks, measured ` +
                `from first-party vault contract readings and refreshed hourly.`,
              url: HUB_URL,
              dateModified: c.asOfIso,
              temporalCoverage: c.asOfIso,
              keywords: ["ETH", "WETH", "Ethereum", "yield", "APY", "Base", "Arbitrum", "DeFi"],
              sources: [`${SITE_URL}/methodology`],
              distribution: [{ format: "application/json", url: `${SITE_URL}/data/index.json` }],
            }),
          ),
        }}
      />

      <nav className="uni-hub-crumbs" aria-label="Breadcrumb">
        <HomeCrumb />
        <span className="uni-hub-crumbs-sep" aria-hidden="true">›</span>
        <span className="uni-hub-crumbs-current">ETH Ranking</span>
      </nav>

      <div className="uni-hub-hero uh-hero">
        <div className="uh-titlerow">
          <span className="uni-hub-hero-icon" aria-hidden="true">
            <AssetIcon asset="ETH" size={44} priority />
          </span>
          <h1 className="uni-hub-h1">{assetHubH1("ETH")}</h1>
        </div>
        <p className="uh-answer">
          <Em text={`The best ETH yield in Harvest's index is ${apy(c.best.apy24h)} APY, paid in ETH by ` +
            `${proseName(c.best, true)}, as of ${c.asOf}. That is the highest rate among ` +
            `strategies holding at least ${tvl(c.fundedFloor)}, against a median of ` +
            `${apy(c.medianApy)} across all ${c.count} ETH strategies tracked on ` +
            `${c.chainCount} ${plural(c.chainCount, "network", "networks")}.`} />
        </p>
        <p className="uh-updated" data-dateline="">
          Rates last recorded {c.asOf}, and refreshed hourly.
        </p>
        {/* A <nav>, since it is navigation: the labels are link text, not
            claims, and the atomicity gate strips <nav> like any other chrome. */}
        <nav aria-label="Jump to an answer">
          <ul className="eh-jumps">
            {jumps.map((j) => (
              <li key={j.label}>
                <a href={j.href}>{j.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <section className="uh-summary" aria-labelledby="summary" data-asof={c.asOfIso}>
        <h2 className="uh-summary-h" id="summary">
          Summary
        </h2>
        <p className="uh-summary-date" data-dateline="">
          Every figure below was recorded {c.asOf}.
        </p>
        <ul className="uh-findings">
          {findings.map((f) => (
            <li key={f}>
              <Em text={f} />
            </li>
          ))}
        </ul>
      </section>

      <Block
        id="top-ten"
        eyebrow="Live ranking"
        title="Top 10 ETH yields by 24-hour APY"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          `The ten highest-paying ETH strategies in this index ran from ` +
          `${apy(c.top10[c.top10.length - 1].apy24h)} to ${apy(c.maxApy)}, across ` +
          `${listOf([...new Set(c.top10.map((v) => v.chain))])}.`
        }
      >
        <HubTable vaults={c.top10} sparklines={sparklines} scopeLabel="ETH strategies" openLinks />
        <p className="uh-note">
          {`Sorted on the 24-hour rate with no floor applied, so a row near the top can sit on a ` +
            `few hundred dollars of ETH. The headline figure uses a ${tvl(c.fundedFloor)} floor ` +
            `for that reason, and ${c.fundedCount} of the ${c.count} strategies cleared it.`}
        </p>
        <Ask items={asks("top")} />
      </Block>

      <Block
        id="by-network"
        eyebrow="By network"
        title="Where to earn ETH yield on Base, Arbitrum and Ethereum"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={base ? networkSentence(base, c) : undefined}
      >
        <div className="eh-nets">
          {nets.map((n) => (
            <article className="eh-net" key={n.chain} aria-labelledby={`net-${n.chain}`}>
              <header className="eh-net-head">
                <ChainIcon chain={n.chain} size={22} />
                <h3 id={`net-${n.chain}`}>{`ETH yield on ${n.chain}`}</h3>
                <span className="eh-net-tag">{isL2(n.chain) ? "Layer 2" : "Mainnet"}</span>
              </header>
              <p className="eh-net-meta">
                {`${n.count} ${plural(n.count, "strategy", "strategies")}, ${tvl(n.tvl)} tracked`}
              </p>
              {n.picks.length ? (
                // ARIA list roles rather than <ol>/<li>: each pick is a
                // name, a rate and a size, a data row rather than a sentence,
                // and the bullet-fragment rule rightly reserves <li> for prose.
                <div className="eh-picks" role="list">
                  {n.picks.map((v) => (
                    <div role="listitem" className="eh-pick" key={v.slug}>
                      <Link href={`/${v.slug}`} className="eh-pick-name">
                        {v.productName.replace(/\s*\([^)]*\)$/, "")}
                      </Link>
                      <span className="eh-pick-apy">{apy(v.apy24h)}</span>
                      <span className="eh-pick-sub">
                        {`${cap(SINGULAR[strategyTypeOf(v)])} · ${tvl(v.tvl)}`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="eh-net-empty">{networkSentence(n, c)}</p>
              )}
              <Link className="eh-net-more" href={`/${n.chain.toLowerCase()}`}>
                {`All ${n.chain} strategies`}
                <span aria-hidden="true"> →</span>
              </Link>
            </article>
          ))}
        </div>
        <p>
          <strong>Gas decides more than the rate on a small position.</strong>{" "}
          {`Base and Arbitrum settle a transaction for cents, while Ethereum mainnet can cost ` +
            `several dollars when it is busy. On a position of a few ETH, that difference decides ` +
            `whether entering and leaving is worth it at all.`}
        </p>
        <p>
          <Em
            text={
              `Of the ${c.count} ETH strategies tracked, ${l2Count} run on a layer 2. Each card ` +
              `links to its network page, which cuts the full ranking down to that chain.`
            }
          />
        </p>
        <Ask items={asks("network")} />
      </Block>

      <Block
        id="strategy-types"
        eyebrow="Strategy types"
        title="What you can do with ETH or WETH to earn yield"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          `ETH in this index earns yield in four ways, by lending it into a pooled market, ` +
          `handing it to a curated vault, letting an allocator move it, or looping it with ` +
          `leverage, and as of ${c.asOf} the index held ` +
          `${listOf(types.map((t) => `${t.count} ${t.count === 1 ? SINGULAR[t.type] : PLURAL[t.type]}`))}.`
        }
      >
        <div className="eh-types">
          {types.map((t) => (
            <article className="eh-type" key={t.type} aria-labelledby={`type-${t.type}`}>
              <h3 id={`type-${t.type}`}>{t.label}</h3>
              <p className="eh-type-blurb">{TYPE_BLURB[t.type]}</p>
              <dl className="eh-type-stats">
                <div>
                  <dt>Strategies</dt>
                  <dd>{t.count}</dd>
                </div>
                <div>
                  <dt>Median APY</dt>
                  <dd>{apy(t.medianApy)}</dd>
                </div>
                <div>
                  <dt>Tracked value</dt>
                  <dd>{tvl(t.tvl)}</dd>
                </div>
              </dl>
              {t.bestFunded ? (
                <p className="eh-type-best">
                  {`Best funded: `}
                  <Link href={`/${t.bestFunded.slug}`}>{proseName(t.bestFunded)}</Link>
                  {` at ${apy(t.bestFunded.apy24h)}.`}
                </p>
              ) : (
                <p className="eh-type-best">
                  {`No ${SINGULAR[t.type]} held ${tvl(c.fundedFloor)} or more.`}
                </p>
              )}
            </article>
          ))}
        </div>
        <p>
          <strong>WETH and ETH are the same asset in every row.</strong>{" "}
          {`Wrapped ETH is ETH locked one-to-one in a contract that issues an ERC-20 token, ` +
            `because lending contracts can hold ERC-20 tokens and cannot hold native ETH. It ` +
            `unwraps back to ETH at any time, and on Base every strategy takes it, so wrapping is ` +
            `the first step and a single transaction.`}
        </p>
        <p>
          <strong>A money market has the fewest layers, and every step up adds one.</strong> A
          money market is one protocol and one rate curve. A curated vault adds the curator&rsquo;s choice of markets. An allocator
          adds a contract that moves the position between venues.
        </p>
        <p>
          <strong>Looping adds leverage</strong>, the only one of the four with a liquidation
          path. Building the loop costs fees, so it charges an entry cost the app shows before a
          position opens.
        </p>
        <EthLoopFigure />
        <Ask items={asks("types")} />
      </Block>

      <Block
        id="safest"
        eyebrow="Safety evidence"
        title="Which ETH yield options are the safest?"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          `Four measurements help judge the risk of an ETH strategy: how much it holds, how long ` +
          `it has been tracked, how steady its rate has been and what kind of strategy it is, and ` +
          `the table lists all four for the ${c.fundedCount} ETH strategies holding at least ` +
          `${tvl(c.fundedFloor)}.`
        }
      >
        <div className="eh-evidence-wrap" data-nosnippet="">
          <table className="eh-evidence">
            <thead>
              <tr>
                <th scope="col">Strategy</th>
                <th scope="col">Type</th>
                <th scope="col">Tracked value</th>
                <th scope="col">Tracked for</th>
                <th scope="col">30-day swing</th>
                <th scope="col">24h APY</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((r) => (
                <tr key={r.vault.slug}>
                  <th scope="row">
                    <Link href={`/${r.vault.slug}`}>{r.vault.productName}</Link>
                  </th>
                  <td>{cap(SINGULAR[r.type])}</td>
                  <td>{tvl(r.vault.tvl)}</td>
                  <td>{r.trackedDays ? trackedLabel(r.trackedDays) : "–"}</td>
                  <td>{r.stdev == null ? "–" : `±${r.stdev.toFixed(2)} pts`}</td>
                  <td>{apy(r.vault.apy24h)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {evidence[0] ? (
          <p>
            {`The largest funded ETH strategy was ${proseName(evidence[0].vault)}, holding ` +
              `${tvl(evidence[0].vault.tvl)} and tracked for ` +
              `${trackedLabel(evidence[0].trackedDays)}. A strategy that size has had its rate ` +
              `tested by real withdrawals, and it is also a larger target for attackers.`}
          </p>
        ) : null}
        <dl className="eh-defs">
          <dt>Tracked for</dt>
          <dd>
            Counts the days of readings held for the strategy. The protocol underneath is usually
            older.
          </dd>
          <dt>30-day swing</dt>
          <dd>
            Measures the standard deviation of the daily rate. Under one point means the rate held
            steady all month; several points means the headline figure is a spike.
          </dd>
          <dt>Type</dt>
          <dd>
            Shows how many contracts sit between the ETH and the borrower. A plain money market
            has the fewest, and the{" "}
            <Link href="/risk-framework">risk framework page</Link> covers every exposure.
          </dd>
        </dl>
        <Ask items={asks("safety")} />
      </Block>

      <Block
        id="calculator"
        eyebrow="Calculator"
        title="ETH yield calculator"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          `Pick an amount of ETH and any of the ${c.count} tracked ETH strategies, and the ` +
          `calculator works out a year of earnings in ETH from the rate on record.`
        }
      >
        <UsdcCalculator products={calcProducts} asOf={c.asOf} asset="ETH" defaultAmount={1} />
        <Ask items={asks("calc")} />
      </Block>

      <Block
        id="vs-staking"
        eyebrow="Mechanism"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        title="ETH yield versus ETH staking"
        lead="ETH staking pays validators newly issued ETH for securing Ethereum, while the ETH yield ranked on this page is interest paid by borrowers of ETH, which is a different source with a different set of risks."
      >
        <p>
          A staked position earns from the protocol itself: new ETH issued to validators plus the
          fees and tips they collect. Getting out goes through Ethereum&rsquo;s validator exit
          queue, which can take days when many validators leave at once. Liquid staking tokens
          such as stETH skip the wait by letting the position trade, at whatever price the market
          offers that day.
        </p>
        <p>
          A lending position earns from borrowers. People borrow ETH to sell it short, to pay for
          a leveraged staking position, or to fund a trade, and the rate they pay rises when ETH
          is in demand and falls when it is not.{" "}
          <strong>Nothing here is staked, so nothing waits in the exit queue.</strong> A withdrawal waits only if the market underneath has lent out all of its ETH,
          which happens rarely and briefly, and the rate climbs until supply returns.
        </p>
        <p>
          The two sources move independently, so a lending rate can sit above or below the
          staking rate on any given day. When the lending rate is higher, it is usually because
          leveraged traders are paying up for ETH, and that demand can disappear quickly.
        </p>
        <Ask items={asks("staking")} />
      </Block>

      <Block
        id="rate-stability"
        eyebrow="Stability"
        title="How steady ETH rates have been"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          c.stability.measuredCount
            ? `Across the ${c.stability.measuredCount} ETH strategies with a month of readings ` +
              `behind them, ${c.stability.steadyCount} moved by less than a percentage point over ` +
              `the 30 days to ${c.asOf}.`
            : undefined
        }
      >
        {c.stability.steadiest && c.stability.mostVolatile ? (
          <p>
            {`Among strategies holding at least ${tvl(c.fundedFloor)}, the steadiest over the ` +
              `trailing 30 days was ${c.stability.steadiest.name}, with a standard deviation of ` +
              `${c.stability.steadiest.stdev.toFixed(2)} points around a mean of ` +
              `${apy(c.stability.steadiest.mean)}. The widest was ${c.stability.mostVolatile.name}, ` +
              `which ranged from ${apyFloorLabel(c.stability.mostVolatile.min)} to ` +
              `${apy(c.stability.mostVolatile.max)} over the same window.`}
          </p>
        ) : null}
        <p>
          ETH lending rates swing harder than stablecoin rates because ETH borrowing demand is
          tied to market direction: when traders want to short ETH or lever up staked ETH, they
          borrow at once, and the rate jumps. A steady rate is the more useful property for a
          position meant to sit, and the 30-day column in the table shows it at a glance.
        </p>
      </Block>

      <Block
        id="by-venue"
        eyebrow="By venue"
        title="ETH yield by protocol"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          `Among the venues in this ETH index, ${listOf(
            c.byVenue
              .slice(0, 3)
              .map(
                (v) =>
                  `${v.venue} paid a median of ${apy(v.medianApy)} across ${v.count} ` +
                  `${plural(v.count, "strategy", "strategies")}`,
              ),
          )}.`
        }
      >
        <ul className="uh-venues">
          {c.byVenue.map((v) => (
            <li key={v.venue}>
              {v.count === 1
                ? `${v.venue} ETH paid ${apy(v.medianApy)} on ${listOf(v.chains)} and held ${tvl(v.tvl)}.`
                : `${v.venue} ETH paid a median of ${apy(v.medianApy)} across ${v.count} ` +
                  `strategies on ${listOf(v.chains)}, holding ${tvl(v.tvl)}` +
                  (v.minApy.toFixed(2) === v.maxApy.toFixed(2)
                    ? "."
                    : `, within ${apyFloorLabel(v.minApy)} to ${apy(v.maxApy)}.`)}
            </li>
          ))}
        </ul>
        <p>
          Pooled markets such as <Link href="/aave">Aave</Link> and Compound set one rate for
          every lender from one utilisation curve, so their ETH rates sit close together and move
          slowly. Isolated markets on <Link href="/morpho">Morpho</Link> and Euler price each
          collateral separately, which spreads rates wider and keeps a bad collateral asset
          contained to the market that accepted it.
        </p>
      </Block>

      <Block
        id="risk-surfaces"
        eyebrow="Risk"
        title="Risks on every ETH yield strategy"
        lead="Every ETH rate on this page pays for a specific set of exposures, and six of them apply across the index: contract, layered contract, staked-ETH collateral, leverage, oracle and liquidity risk."
      >
        <ul className="uh-risks">
          <li>
            <strong>Smart-contract risk</strong> sits on the vault and on the protocol under it,
            for as long as a position stays open. Euler, a venue in this index, lost{" "}
            <a
              href="https://cointelegraph.com/news/defi-sees-its-biggest-hack-in-2023-as-euler-loses-197m-finance-redefined"
              target="_blank"
              rel="noopener noreferrer"
            >
              $197 million in March 2023
            </a>{" "}
            through a function added while fixing an earlier bug.
          </li>
          <li>
            <strong>Layered contract risk</strong> grows with each wrapper. A curated vault or an
            allocator passes ETH through more contracts than a plain money market, and one rate
            pays for all of them at once.
          </li>
          <li>
            <strong>Staked-ETH collateral risk</strong> applies to ETH lending in particular. Much of
            the ETH borrowed on these markets is borrowed against staked or restaked ETH, and if
            that collateral trades below ETH faster than liquidations can keep up, lenders take
            the loss. The{" "}
            <a
              href="https://www.coindesk.com/markets/2026/04/20/defi-tvl-drops-more-than-usd13-billion-in-two-days-following-kelp-dao-hack"
              target="_blank"
              rel="noopener noreferrer"
            >
              KelpDAO exploit of April 18, 2026
            </a>{" "}
            minted rsETH with nothing behind it, which was then posted as collateral on Aave to
            borrow real assets, leaving bad debt estimated in April 2026 at roughly $200M to
            $246M.
          </li>
          <li>
            <strong>Leverage risk</strong> applies to looping alone. A loop earns the gap between
            the supply and borrow rates several times over, and when the borrow rate rises above
            the supply rate the same multiplier works against the position until it is unwound.
          </li>
          <li>
            <strong>Oracle risk</strong> sits on the price feeds that decide when a borrower gets
            liquidated. A feed that lags or is manipulated lets a loan go under water before the
            liquidation that should have protected the lender fires.
          </li>
          <li>
            <strong>Liquidity risk</strong> usually shows up first. A market keeps only
            its unborrowed ETH available to withdraw, so when borrowing spikes toward the limit the
            exit narrows for every supplier at once, until borrowers repay or the rising rate
            pulls new supply in.
          </li>
        </ul>
        <p>
          Bridge, operator and governance risk, along with the tiers and exclusions, are on the{" "}
          <Link href="/risk-framework">risk framework page</Link>. The vault page for any row names
          the contracts a position touches.
        </p>
        <Ask items={asks("risk")} />
      </Block>

      {/* The questions are answered in the sections they belong to, where a
          reader meets them. This is the index: one list a reader can scan, each
          link opening its answer in place. A <nav>, because it is navigation and
          the answers already sit in the page once. */}
      <section className="uh-block eh-qindex" aria-labelledby="faq">
        <p className="rp-eyebrow">Questions</p>
        <h2 id="faq">Every ETH yield question on this page</h2>
        <nav aria-label="Questions answered on this page">
          <ol className="eh-qlist">
            {faqs.map((f) => (
              <li key={f.q}>
                <a href={`#${qid(f.q)}`}>{f.q}</a>
              </li>
            ))}
          </ol>
        </nav>
        {/* Opens the <details> a question link points at; without it the page
            scrolls to a closed answer. Plain script, no client bundle. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){function o(){var h=location.hash.slice(1);if(!h)return;" +
              "var d=document.getElementById(h);if(d&&d.tagName==='DETAILS')d.open=true;}" +
              "addEventListener('hashchange',o);o();})();",
          }}
        />
      </section>

      <Block
        id="full-index"
        eyebrow="Full index"
        title={`Full ETH index: all ${c.count} strategies`}
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          `All ${c.count} ETH strategies tracked here are listed below, sorted by 24-hour APY. ` +
          `The network and protocol filters narrow rows already on the page.`
        }
      >
        <HubTable vaults={c.all} sparklines={sparklines} scopeLabel="ETH strategies" />
      </Block>

      <Block
        id="scope"
        eyebrow="Scope"
        title="Which strategies this ranking includes"
        lead="The ranking covers the ETH yield strategies Harvest has vetted and integrated, which is a subset of the places ETH can earn yield."
      >
        <p>
          Strategies are added as they are vetted and integrated, and dropped when the product
          behind them retires or fails the risk framework. Solo staking, liquid staking tokens
          held on their own and centralised exchange products are outside it. The inclusion rules
          are on the <Link href="/methodology">methodology page</Link>.
        </p>
      </Block>

      <section className="uni-hub-cta-row">
        <p className="uni-hub-cta-meta">
          Looking for a specific chain? Network ranking pages cut the same data by network.
        </p>
        <div className="uni-hub-cta-links">
          {visibleChains.slice(0, 6).map((chain) => (
            <Link key={chain} href={`/${chain.toLowerCase()}`} className="uni-hub-cta-pill">
              <ChainIcon chain={chain} size={14} />
              {chain}
            </Link>
          ))}
        </div>
      </section>

      <RankingDataNote />
    </div>
  );
}
