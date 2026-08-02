// Dedicated body for /usdc.
//
// Every other asset hub renders through asset-hub-body.tsx. This one does not,
// for two reasons. First, /eth, /btc and /usdt are the control group this
// rebuild is measured against, so a shared component would make a structural
// effect indistinguishable from a sitewide one. Second, the page needs a
// seven-column top-ten table, and .hub-table's grid in globals.css is a
// six-column layout with three breakpoints that hide columns by nth-child
// index, shared with eight other call sites.
//
// /polygon set the precedent (polygon-hub-body.tsx) for a hub that outgrew the
// shared body.
import Link from "next/link";
import { getLiveVaults, getAllSparklines, loadHistoryFile } from "@/lib/data";
import { AssetIcon, ChainIcon } from "@/components/token-icons";
import { formatAPY, formatTVL } from "@/lib/format";
import { SITE_URL } from "@/lib/constants";
import { assetHubH1, assetHubCrumbs } from "@/lib/seo";
import { breadcrumbSchema, itemListSchema, faqPageSchema } from "@/lib/jsonld";
import { HubTable } from "@/components/hub-table";
import { HomeCrumb } from "@/components/home-crumb";
import { RankingDataNote } from "@/components/ranking-data-note";
import type { YieldVault } from "@/lib/types";
import {
  buildUsdcCohort,
  answerSentence,
  keyFindings,
  venueLines,
  networkBlock,
  protocolBlock,
  venueOf,
  listOf,
  plural,
  apy,
  tvl,
  type UsdcCohort,
} from "@/lib/usdc-hub";

const HUB_URL = `${SITE_URL}/usdc`;

// Venue families named in prose, in the order they are listed. Only the ones
// present in the current cohort produce a line, so a build where a family
// drops out loses its bullet rather than printing a stale rate.
const VENUE_FAMILIES = ["Aave", "Compound V3", "Morpho", "Fluid", "Euler"];

// Table 1. Ten rows, sorted by 24-hour APY, rendered server-side with no
// client boundary. A real readable 30d figure sits beside the 24h one because
// a sparkline is not extractable, and every number on this page has to exist
// as text somewhere.
function TopTen({ rows }: { rows: YieldVault[] }) {
  if (rows.length === 0) {
    return <div className="uni-hub-empty">No USDC strategies indexed yet.</div>;
  }
  return (
    // data-nosnippet for the same reason every ranking table on the site
    // carries it: Google was lifting mashed cell text into the SERP snippet
    // over the meta description. On this page the prose above is the snippet
    // surface, which is the whole point of the rebuild.
    <div className="hub-table-wrap uh-top10" data-nosnippet="">
      <div className="hub-table" role="table" aria-label="Top 10 USDC yields by 24-hour APY">
        <div className="hub-thead" role="row">
          <span className="hub-th hub-th-rank">#</span>
          <span className="hub-th">Vault</span>
          <span className="hub-th hub-th-num">24h APY</span>
          <span className="hub-th hub-th-num">30d APY</span>
          <span className="hub-th">Strategy</span>
          <span className="hub-th">Network</span>
          <span className="hub-th hub-th-num">TVL</span>
        </div>
        <div className="hub-tbody" role="rowgroup">
          {rows.map((v, i) => (
            <Link key={v.id} href={`/${v.slug}`} className="hub-row" role="row">
              <span className="hub-cell hub-rank">{i + 1}</span>
              <span className="hub-cell hub-vault">
                <AssetIcon asset={v.asset} size={26} />
                <span className="hub-vault-name">{v.productName}</span>
              </span>
              <span className="hub-cell hub-num hub-apy">{formatAPY(v.apy24h)}</span>
              <span className="hub-cell hub-num uh-apy30">{formatAPY(v.apy30d)}</span>
              <span className="hub-cell uh-cell-text">{venueOf(v)}</span>
              <span className="hub-cell uh-cell-net">
                <ChainIcon chain={v.chain} size={16} />
                <span>{v.chain}</span>
              </span>
              <span className="hub-cell hub-num">{formatTVL(v.tvl)}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// One section: eyebrow, H2, then prose. The atomic opening sentence of each
// block is passed as `lead` so it renders in its own paragraph and can be
// lifted whole.
function Block({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="uh-block" aria-labelledby={id}>
      <p className="uh-eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      {lead && <p className="uh-lead">{lead}</p>}
      {children}
    </section>
  );
}

function buildFaqs(c: UsdcCohort): { q: string; a: string }[] {
  if (!c.best) return [];
  const onTen = (rate: number) => Math.round((10_000 * rate) / 100).toLocaleString("en-US");
  const smallCount = c.count - c.fundedCount;

  return [
    {
      q: "What is the best USDC yield right now?",
      a:
        `The highest 24-hour APY on a strategy holding at least ${tvl(c.fundedFloor)} was ` +
        `${apy(c.best.apy24h)} on ${c.best.productName} as of ${c.asOf}, across the ${c.count} ` +
        `USDC strategies Harvest tracks. Smaller vaults in the index can print higher figures on ` +
        `very little liquidity, so the ranking table shows TVL beside every rate.`,
    },
    {
      q: "What is the current USDC interest rate?",
      a:
        `The median USDC interest rate across the ${c.count} strategies in this index was ` +
        `${apy(c.medianApy)} as of ${c.asOf}, within a range of ${apy(c.minApy)} to ` +
        `${apy(c.maxApy)}. A money-market interest rate such as Aave or Compound tracks what ` +
        `borrowers pay for USDC liquidity, which is why it usually sits nearer the middle of ` +
        `that range than the top.`,
    },
    {
      q: "Is USDC staking the same as lending?",
      a:
        `USDC cannot be staked in the proof-of-stake sense, because USDC is not a network token ` +
        `and has no validator set. What is commonly called USDC staking is either lending, where ` +
        `borrowers pay interest, or a vault position, where a strategy earns yield and compounds ` +
        `it. Both of those are what this page ranks.`,
    },
    {
      q: "Does USDC earn interest by itself?",
      a:
        `USDC has no native yield. Circle holds the reserves backing USDC and pays nothing to ` +
        `holders, so a USDC balance sitting in a wallet earns zero. Every rate on this page comes ` +
        `from lending USDC to a borrower or supplying it to a strategy that does.`,
    },
    {
      q: "How do you earn interest on USDC safely?",
      a:
        `Safety here is a question of what a given rate depends on. A rate from a large lending ` +
        `market with a long onchain history sits on different ground from a rate on a young vault ` +
        `whose yield leans on reward emissions that can stop. The tiers and the exclusions are ` +
        `set out on the risk framework page.`,
    },
    {
      q: "How much can you earn on 10,000 USDC?",
      a:
        `At the median rate of ${apy(c.medianApy)} as of ${c.asOf}, a 10,000 USDC position would ` +
        `earn about $${onTen(c.medianApy)} over a year before fees and before any rate change. At ` +
        `the top rate of ${apy(c.best.apy24h)} as of ${c.asOf}, among strategies holding at least ` +
        `${tvl(c.fundedFloor)}, the same position would earn about $${onTen(c.best.apy24h)}. ` +
        `Rates move daily, so neither figure is a forecast.`,
    },
    {
      q: "What is a good APY for USDC?",
      a:
        `The useful reference point is the median of whatever cohort you are comparing against. ` +
        `Across the ${c.count} USDC strategies on this page the median was ${apy(c.medianApy)} ` +
        `as of ${c.asOf}, and half the index sat below it. A rate above the median is usually ` +
        `paying for something, most often reward emissions that can stop, a contract with a ` +
        `shorter track record, or a pool small enough that its rate has not been tested by size.`,
    },
    {
      q: "Where does USDC yield come from?",
      a:
        `USDC lending yield is the interest borrowers pay when USDC is supplied to a money market ` +
        `such as Aave or Compound. Autocompounding strategies add a contract that harvests reward ` +
        `emissions and puts them back into the position, which is why their published rate blends ` +
        `two sources. A smaller group runs delta-neutral, pairing a USDC position against a short ` +
        `leg to capture funding rather than borrower demand.`,
    },
    {
      q: "Is USDC yield safe?",
      a:
        `No USDC yield is risk-free. Every strategy ranked here carries smart-contract exposure ` +
        `on the vault and on the protocol underneath it, oracle exposure on the price feeds those ` +
        `contracts trust, and depeg exposure on USDC itself in tail scenarios. Size is a further ` +
        `signal: ${smallCount} of the ${c.count} strategies tracked held under ` +
        `${tvl(c.fundedFloor)} as of ${c.asOf}, so their published rates have not been tested by ` +
        `much liquidity.`,
    },
    {
      q: "Can you lose money holding USDC?",
      a:
        `Yes. USDC is fully reserved by Circle and has held its dollar peg in normal conditions, ` +
        `though it traded as low as $0.87 in March 2023 when part of the reserve sat at Silicon ` +
        `Valley Bank. Holding USDC inside a yield strategy adds that strategy's contract exposure ` +
        `on top of the peg question.`,
    },
    {
      q: "Why is USDC yield variable?",
      a:
        `Lending APY follows borrower demand and utilisation. Reward APY follows incentive ` +
        `programs that switch on and off. Both move daily, which is why this page carries a ` +
        `24-hour rate and a 30-day mean side by side.`,
    },
    {
      q: "Do these numbers include rewards?",
      a:
        `Yes, when the underlying protocol bakes them into the rate it reports. The vault detail ` +
        `page splits the figure into base and rewards wherever the upstream publishes that ` +
        `breakdown.`,
    },
    {
      q: "Are there USDC yield strategies not listed here?",
      a:
        `Many. The page is the set Harvest has indexed and verified against its framework, not a ` +
        `census of the USDC market. Adding venues is an ongoing job and the inclusion rules live ` +
        `on the methodology page.`,
    },
  ].filter((f) => f.a);
}

export async function UsdcHubBody() {
  const [allVaults, sparklines] = await Promise.all([getLiveVaults(), getAllSparklines()]);
  const history = loadHistoryFile();
  const c = buildUsdcCohort(
    allVaults.filter((v) => v.asset === "USDC"),
    history,
  );

  const crumbs = assetHubCrumbs("USDC");
  const faqs = buildFaqs(c);
  const findings = keyFindings(c);
  const venues = venueLines(c, VENUE_FAMILIES);
  const visibleChains = [...new Set(allVaults.map((v) => v.chain))].sort();
  const topVenues = c.byVenue.slice(0, 3);

  if (!c.best) {
    return (
      <div className="uni-hub-test">
        <h1 className="uni-hub-h1">{assetHubH1("USDC")}</h1>
        <p className="uni-hub-sub">USDC yield strategies are populating, check back shortly.</p>
      </div>
    );
  }

  // Every figure below reads from `c`. Nothing recomputes a rate locally, so
  // the hero sentence, the bullets, both tables, the FAQ and the ItemList
  // cannot disagree with one another.
  const [n1, n2] = c.byNetwork;

  return (
    <div className="uni-hub-test uh-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema(crumbs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            ...itemListSchema(c.all, HUB_URL),
            name: `USDC yield strategies ranked by 24-hour APY`,
            numberOfItems: c.count,
            dateModified: c.asOfIso,
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema(faqs)) }}
      />

      <nav className="uni-hub-crumbs" aria-label="Breadcrumb">
        <HomeCrumb />
        <span className="uni-hub-crumbs-sep" aria-hidden="true">›</span>
        <span className="uni-hub-crumbs-current">USDC Ranking</span>
      </nav>

      {/* Hero. The answer sentence and the four findings sit above the first
          table so that the opening retrieval chunk of the document carries the
          heading, the answer and four liftable facts. That ordering is the
          single change this rebuild exists to make.

          A <div> rather than the <header> the shared hub body uses. Boilerplate
          classifiers drop <header> as chrome, and this repo's own atomicity gate
          strips it before linting, so the page's primary claim would have sat in
          the one element most likely to be discarded before extraction. */}
      <div className="uni-hub-hero uh-hero">
        <div className="uni-hub-hero-headline">
          <span className="uni-hub-hero-icon" aria-hidden="true">
            <AssetIcon asset="USDC" size={54} priority />
          </span>
          <div>
            <h1 className="uni-hub-h1">{assetHubH1("USDC")}</h1>
            <p className="uh-answer">{answerSentence(c)}</p>
          </div>
        </div>

        <div className="uni-hub-stats" role="group" aria-label="USDC index headline stats">
          <div className="uni-hub-stat">
            <div
              className="uni-hub-stat-label"
              data-tooltip={`Highest 24-hour APY among indexed USDC strategies holding at least ${tvl(c.fundedFloor)}, as of ${c.asOf}. The full ranking below is unfiltered.`}
            >
              Best APY
            </div>
            <div className="uni-hub-stat-value">{apy(c.best.apy24h)}</div>
          </div>
          <div className="uni-hub-stat">
            <div
              className="uni-hub-stat-label"
              data-tooltip={`Median 24-hour APY across the indexed USDC strategies as of ${c.asOf}.`}
            >
              Median APY
            </div>
            <div className="uni-hub-stat-value">{apy(c.medianApy)}</div>
          </div>
        </div>
      </div>

      <section className="uh-findings-wrap" aria-label="Key findings">
        <ul className="uh-findings">
          {findings.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>

      <Block
        id="top-ten"
        eyebrow="Live ranking"
        title="Top 10 USDC yields by 24-hour APY"
        lead={
          `The ten highest-paying USDC strategies in this index ran from ` +
          `${apy(c.top10[c.top10.length - 1].apy24h)} to ${apy(c.maxApy)} as of ${c.asOf}, across ` +
          `${listOf([...new Set(c.top10.map((v) => v.chain))])}.`
        }
      >
        <TopTen rows={c.top10} />
        <p className="uh-note">
          {`Sorted on the 24-hour rate with no floor applied, so the TVL column matters: a rate at ` +
            `the top of this table can sit on a few hundred dollars. The headline figure above uses ` +
            `a ${tvl(c.fundedFloor)} floor for that reason, and ${c.fundedCount} of the ${c.count} ` +
            `strategies cleared it as of ${c.asOf}.`}
        </p>
      </Block>

      <Block
        id="yield-source"
        eyebrow="Mechanism"
        title="Where USDC yield comes from"
        lead="USDC lending yield is the interest borrowers pay when USDC is supplied to a money market such as Aave or Compound."
      >
        <p>
          Autocompounding strategies do the same thing and add a contract that harvests the reward
          emissions on top, which is why their published rate blends two sources and moves more
          than a plain lending rate does. A smaller group runs delta-neutral, pairing a USDC
          position against a short leg so the yield comes from funding rather than from borrower
          demand. Each pattern buys either a higher or a smoother rate by adding smart-contract
          surface, and the vault page for any row spells out which contracts a position touches.
        </p>
      </Block>

      <Block
        id="venue-rates"
        eyebrow="By venue"
        title="USDC interest rates by venue"
        lead={
          `Among the venues in Harvest's USDC index, ${listOf(
            topVenues.map(
              (v) =>
                `${v.venue} paid a median of ${apy(v.medianApy)} across ${v.count} ` +
                `${plural(v.count, "market", "markets")}`,
            ),
          )} as of ${c.asOf}.`
        }
      >
        <ul className="uh-venues">
          {venues.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>
          Money-market rates track borrower demand directly, so they cluster together and move
          slowly. Curated vault rates blend that same borrower demand with reward emissions and
          with whatever market parameters the curator has set, which is what opens the spread
          between the bottom and the top of the list above.
        </p>
      </Block>

      <Block
        id="staking-rates"
        eyebrow="Rates"
        title="Best USDC staking rates right now"
        lead={
          `The best USDC rate on a strategy holding at least ${tvl(c.fundedFloor)} was ` +
          `${apy(c.best.apy24h)} on ${c.best.productName} as of ${c.asOf}, against a median of ` +
          `${apy(c.medianApy)} across all ${c.count} strategies tracked here.`
        }
      >
        <p>
          What gets searched for as a USDC staking rate is one of the two things ranked on this
          page: an interest rate paid by borrowers in a lending market, or the yield a vault
          strategy collects and compounds on a USDC position. Neither one is staking in the
          protocol sense. The table above sorts on the 24-hour figure, and the 30-day column beside
          it shows whether that figure is where the strategy has been sitting or a spike on the day.
        </p>
      </Block>

      <Block
        id="yield-vs-rewards"
        eyebrow="Definitions"
        title="How USDC yield and staking rewards differ"
        lead="Staking rewards are newly issued network tokens paid to validators for securing a chain, and USDC yield is interest paid by a borrower or a strategy for the use of dollars."
      >
        <p>
          The distinction matters for what the number is exposed to. A staking reward is
          denominated in the network token, so its dollar value moves with that token's price. A
          USDC rate is denominated in dollars already, so the headline figure is what the position
          earns in dollar terms before fees. Some strategies on this page do pay part of their
          yield in a reward token, and where the upstream protocol publishes that split the vault
          page shows it separately from the base rate.
        </p>
      </Block>

      <Block
        id="by-network"
        eyebrow="Distribution"
        title="Where the yield lives, by network"
        lead={
          `USDC yield in this index sat on ${c.chainCount} networks as of ${c.asOf}, led by ` +
          `${n1.chain} with ${n1.count} ${plural(n1.count, "strategy", "strategies")}` +
          (n2 ? ` and ${n2.chain} with ${n2.count}` : "") +
          `.`
        }
      >
        <p>{`Full breakdown as of ${c.asOf}: ${networkBlock(c)}.`}</p>
        <p>
          USDC liquidity concentrates on Ethereum and on the rollups with the deepest stablecoin
          markets, which is where the larger strategies sit. Networks come and go from this list as
          products ship and retire. Any network pill at the foot of the page cuts the same ranking
          down to one chain.
        </p>
      </Block>

      <Block
        id="protocol-families"
        eyebrow="Venues"
        title="Protocol families on the leaderboard"
        lead={`The largest venue families in this index as of ${c.asOf} were ${protocolBlock(c)}.`}
      >
        <p>
          Most rows are either a single-asset money market such as Aave or Morpho, or an
          autocompounder wrapping one of those markets. A smaller slice is real-world-asset credit
          and structured strategies. Curated Morpho vaults are named for their curator rather than
          for the protocol, so a row reading Gauntlet or Steakhouse is a Morpho market whose
          parameters that curator sets.
        </p>
      </Block>

      <Block
        id="reading-columns"
        eyebrow="How to read this"
        title="How to read the columns"
        lead="The 24-hour APY on this page is the most recent daily rate annualised, and the 30-day APY is the trailing mean of the daily readings across the last month."
      >
        <p>
          {`A gap between the two columns is the useful signal: a 24-hour figure above the 30-day mean ` +
            `means the strategy is paying more than it has been, and one below it means the opposite. ` +
            `TVL is the dollar value of USDC held in the vault contract, and the ${c.count} strategies ` +
            `on this page held ${tvl(c.totalTvl)} between them as of ${c.asOf}. Higher TVL usually ` +
            `means a strategy has been live longer and absorbed more without breaking. Lower TVL is ` +
            `either young, niche, or paying too little for the risk it carries.`}
        </p>
      </Block>

      <Block
        id="risk-surfaces"
        eyebrow="Risk"
        title="Risk surfaces on every USDC strategy"
        lead="Every rate on this page is compensation for a specific set of exposures, and the four that apply to all of them are contract, oracle, peg and governance risk."
      >
        <p>
          Smart-contract risk sits on the vault and on the protocol underneath it. Oracle risk sits
          on the price feeds those contracts trust. Depeg risk sits on USDC itself in tail
          scenarios. Governance risk sits on every parameter an operator can change after a
          position is open. The tiers, and what falls outside them, are on the{" "}
          <Link href="/risk-framework">risk framework page</Link>.
        </p>
      </Block>

      <Block
        id="faq"
        eyebrow="Questions"
        title="USDC yield questions, answered"
      >
        <dl className="uni-hub-faq uh-faq">
          {faqs.map((f) => (
            <div key={f.q}>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
      </Block>

      <Block
        id="full-index"
        eyebrow="Full index"
        title={`Full USDC index: all ${c.count} strategies`}
        lead={
          `All ${c.count} USDC strategies tracked here are listed below, sorted by 24-hour APY as ` +
          `of ${c.asOf}. The network and protocol filters narrow rows that are already in the page.`
        }
      >
        <HubTable vaults={c.all} sparklines={sparklines} scopeLabel="USDC strategies" />
      </Block>

      <Block
        id="scope"
        eyebrow="Scope"
        title="What this page is, and what it is not"
        lead="This page is a curated index of USDC yield strategies, not a census of the USDC yield market."
      >
        <p>
          Strategies are added as they are vetted and integrated, and dropped when the upstream
          product retires or fails the risk framework. Every comparison here is a comparison within
          that set, and the rules behind the set are on the{" "}
          <Link href="/methodology">methodology page</Link>. Plenty of USDC yield exists outside
          it.
        </p>
      </Block>

      <section className="uni-hub-cta-row">
        <p className="uni-hub-cta-meta">
          Comparing against venues we do not operate? The{" "}
          <Link href="/report/stablecoin-yield-ranking">stablecoin rate comparison</Link> measures
          the leading products across the market from their own onchain share-price history.
        </p>
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
