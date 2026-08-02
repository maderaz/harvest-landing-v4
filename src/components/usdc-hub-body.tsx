// Dedicated body for /usdc.
//
// Every other asset hub renders through asset-hub-body.tsx. This one does not:
// /eth, /btc and /usdt are the control group this rebuild is measured against,
// so putting the new structure in the shared body would make a structural
// effect indistinguishable from a sitewide one.
//
// The ranking itself is the shared HubTable, unchanged and identical to every
// other asset page. What differs is everything around it.
//
// /polygon set the precedent (polygon-hub-body.tsx) for a hub that outgrew the
// shared body.
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
import { harvestAppUrl } from "@/lib/harvest-app";
import {
  buildUsdcCohort,
  answerSentence,
  keyFindings,
  venueLines,
  networkBlock,
  protocolBlock,
  venueOf,
  proseName,
  payoutLead,
  stabilityLead,
  tokenBlock,
  listOf,
  plural,
  apy,
  apyFloorLabel,
  tvl,
  type UsdcCohort,
} from "@/lib/usdc-hub";

const HUB_URL = `${SITE_URL}/usdc`;

// Venue families named in prose, in the order they are listed. Only the ones
// present in the current cohort produce a line, so a build where a family
// drops out loses its bullet rather than printing a stale rate.
const VENUE_FAMILIES = ["Aave", "Compound V3", "Morpho", "Fluid", "Euler"];

// Section shell: sentence-case eyebrow, H2, then prose. Deliberately the same
// shape and the same class names the XRP report uses (rp-eyebrow + h2, see
// report/xrp-yield-ranking/page.tsx), so the two long-form pages read as one
// house style rather than two. The atomic opening sentence is passed as `lead`
// so it renders in its own paragraph and can be lifted whole.
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
      <p className="rp-eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      {lead && <p className="uh-lead">{lead}</p>}
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

function buildFaqs(c: UsdcCohort): { q: string; a: string }[] {
  if (!c.best) return [];
  const onTen = (rate: number) => Math.round((10_000 * rate) / 100).toLocaleString("en-US");
  const smallCount = c.count - c.fundedCount;

  return [
    {
      q: "What is the best USDC yield right now?",
      a:
        `The highest 24-hour APY on a strategy holding at least ${tvl(c.fundedFloor)} was ` +
        `${apy(c.best.apy24h)} on ${proseName(c.best)} as of ${c.asOf}, across the ${c.count} ` +
        `USDC strategies Harvest tracks. Smaller vaults in the index can print higher figures on ` +
        `very little liquidity, so the ranking table shows TVL beside every rate.`,
    },
    {
      q: "What is the current USDC interest rate?",
      a:
        `The median USDC interest rate across the ${c.count} strategies in this index was ` +
        `${apy(c.medianApy)} as of ${c.asOf}, within a range of ${apyFloorLabel(c.minApy)} to ` +
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
      q: "Is the APY paid in USDC or in reward tokens?",
      a:
        `Some pay in dollars and some pay in a token. ${c.payout.inUsdc.length} of the ${c.count} tracked ` +
        `strategies paid their yield in USDC as of ${c.asOf} and ${c.payout.inToken.length} paid ` +
        `it in a reward token such as ${c.payout.tokens[0]?.symbol ?? "MORPHO"}, which is worth ` +
        `whatever it sells for when claimed. Our data records the payout token rather than a ` +
        `split between base interest and emissions, so this page reports what a rate is paid in ` +
        `instead of inventing a decomposition it cannot measure.`,
    },
    {
      q: "How does this compare to Aave and the wider USDC market?",
      a: c.benchmark
        ? `The median here was ${apy(c.medianApy)} across ${c.count} strategies holding ` +
          `${tvl(c.totalTvl)} as of ${c.asOf}, against ${apy(c.benchmark.largestApy)} on ` +
          `${c.benchmark.largestName}, which held ${tvl(c.benchmark.largestTvl)} on the same date. ` +
          `A deeper market usually pays less and absorbs far more, so the top of this ranking is ` +
          `the more useful figure for finding a strategy and the wider market is the more useful ` +
          `one for sizing a large position.`
        : "",
    },
    {
      q: "Is USDC yield safe?",
      a:
        `No USDC yield is risk-free. Every strategy ranked here carries smart-contract exposure ` +
        `on the vault and on the protocol underneath it, oracle exposure on the price feeds those ` +
        `contracts trust, and depeg exposure on USDC itself in tail scenarios. USDC has held its ` +
        `dollar peg in normal conditions, though it traded as low as $0.87 in March 2023 when part ` +
        `of the reserve sat at Silicon Valley Bank. Size is a further signal: ${smallCount} of the ` +
        `${c.count} strategies tracked held under ${tvl(c.fundedFloor)} as of ${c.asOf}, so their ` +
        `published rates have not been tested by much liquidity.`,
    },
    {
      q: "Why is USDC yield variable?",
      a:
        `Lending APY follows borrower demand and utilisation. Reward APY follows incentive ` +
        `programs that switch on and off. Both move daily, which is why this page carries a ` +
        `24-hour rate and a 30-day mean side by side.`,
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
  // The networks this page actually covers, not every network on the site.
  // The rail offers to "cut the same data by network", so listing a chain the
  // cohort excludes points at a ranking with none of these rows in it.
  const visibleChains = [...c.chains].sort();
  const topVenues = c.byVenue.slice(0, 3);

  // Morpho exposure, for the collateral paragraph in the risk section. Both
  // reviews called out that over half the index lends into Morpho and the page
  // never said what backs those markets. Only the direct markets expose their
  // collateral (it is the product name); curated vaults hold a basket the
  // curator sets, which the copy says rather than guessing.
  const morphoCount = c.all.filter((v) => venueOf(v).startsWith("Morpho")).length;
  const morphoMarketCollateral = c.all
    .filter((v) => venueOf(v) === "Morpho Market")
    .map((v) => v.productName.replace(/^USDC\s+/, "").replace(/\s*\(.*\)$/, ""))
    .filter((x, i, a) => a.indexOf(x) === i)
    .sort();


  // Every tracked strategy is selectable, not just the visible top ten: the
  // calculator is a tool, and a reader who scrolled past row 10 to reach it
  // is the one most likely to want a row further down.
  const calcProducts: CalcProduct[] = c.all.map((v) => ({
    slug: v.slug,
    name: v.productName,
    apy: v.apy24h,
    chain: v.chain,
    appUrl: harvestAppUrl(v.chain, v.contractAddress),
  }));

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
      {/* Dataset. The page publishes a real measured dataset and, until now,
          never declared one: the per-vault JSON has been exported to
          public/data/<slug>.json by build-data-json.mjs all along, with
          index.json listing every file, and nothing pointed a crawler at it.
          The report pages have carried this node for a while; the hubs did
          not. numberOfItems is deliberately omitted because the helper renders
          it as "N venues", and these are strategies. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            reportDatasetSchema({
              name: "USDC yield strategies tracked by Harvest",
              description:
                `Live 24-hour APY, 30-day mean APY and tracked value for the ${c.count} USDC ` +
                `yield strategies Harvest indexes across ${c.chainCount} networks, measured from ` +
                `first-party vault contract readings and refreshed hourly. The linked index is ` +
                `machine-readable and lists a per-strategy JSON file for every product tracked ` +
                `on the site, USDC included.`,
              url: HUB_URL,
              dateModified: c.asOfIso,
              keywords: [
                "USDC",
                "stablecoin",
                "yield",
                "APY",
                "TVL",
                "DeFi",
                "lending",
              ],
              sources: [`${SITE_URL}/methodology`],
              distribution: [
                { format: "application/json", url: `${SITE_URL}/data/index.json` },
              ],
            }),
          ),
        }}
      />

      <nav className="uni-hub-crumbs" aria-label="Breadcrumb">
        <HomeCrumb />
        <span className="uni-hub-crumbs-sep" aria-hidden="true">›</span>
        <span className="uni-hub-crumbs-current">USDC Ranking</span>
      </nav>

      {/* Hero: heading, then the answer, and nothing between them.

          The Best APY / Median APY stat tiles used to sit here and are gone on
          purpose. In extracted text they rendered as "Best APY 11.23% Median
          APY 4.34%" ahead of the answer sentence: bare label-value pairs with
          no subject, no scope and no date, which is the exact shape this page
          exists to stop publishing. Their scope and date lived in a
          data-tooltip attribute, which no text extractor reads. They were also
          invisible to the atomicity gate, whose blocks() matches only
          p/li/dd/summary, so they were the one place on the page exempt from
          the undated-figure rule. Both figures already appear, scoped and
          dated, in the sentence below, so nothing was lost by deleting them.

          A <div> rather than the <header> the shared hub body uses.
          Boilerplate classifiers drop <header> as chrome, and this repo's own
          atomicity gate strips it before linting, so the page's primary claim
          would have sat in the one element most likely to be discarded before
          extraction. */}
      <div className="uni-hub-hero uh-hero">
        <div className="uh-titlerow">
          <span className="uni-hub-hero-icon" aria-hidden="true">
            <AssetIcon asset="USDC" size={44} priority />
          </span>
          <h1 className="uni-hub-h1">{assetHubH1("USDC")}</h1>
        </div>

        <p className="uh-answer">{answerSentence(c)}</p>
        {/* The footer and the meta description both claim hourly updates and
            the page body never showed a timestamp, so the claim had nothing
            substantiating it above the fold. Reads from the newest observation
            in the cohort, the same value that drives dateModified in the
            schema, so the visible stamp and the machine-readable one cannot
            disagree. */}
        <p className="uh-updated">Rates last recorded {c.asOf}, and refreshed hourly.</p>
      </div>

      <section className="uh-summary" aria-labelledby="summary">
        <h2 className="uh-summary-h" id="summary">
          Summary
        </h2>
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
        <HubTable vaults={c.top10} sparklines={sparklines} scopeLabel="USDC strategies" openLinks />
        <p className="uh-note">
          {`Sorted on the 24-hour rate with no floor applied: a rate at the top of this table can ` +
            `sit on a few hundred dollars of liquidity. The headline figure above uses a ` +
            `${tvl(c.fundedFloor)} floor for that reason, and ${c.fundedCount} of the ${c.count} ` +
            `strategies cleared it as of ${c.asOf}. Open any row for its TVL and history.`}
        </p>
      </Block>

      <Block
        id="calculator"
        eyebrow="Calculator"
        title="USDC Earnings Calculator"
        lead={
          `Pick an amount and any of the ${c.count} tracked USDC strategies, and the calculator ` +
          `below works out a year of earnings from the rate recorded as of ${c.asOf}.`
        }
      >
        <UsdcCalculator products={calcProducts} asOf={c.asOf} />
      </Block>

      <Block
        id="yield-source"
        eyebrow="Mechanism"
        title="Where USDC yield comes from"
        lead="USDC lending yield is the interest borrowers pay when USDC is supplied to a money market such as Aave or Compound."
      >
        <p>
          Someone is on the other side of every rate here, and on a money market that someone is a
          borrower posting collateral worth more than the loan. Most of them are taking leverage:
          borrowing dollars against ETH or BTC to hold a larger position than they could pay for
          outright. That demand rises and falls with the market, which is why a supply rate is
          cyclical rather than fixed, and why a double-digit rate on a lending market usually means
          leverage is expensive at that moment rather than that the venue is generous.
        </p>
        <p>
          Because the loan is over-collateralised, the lender is protected by liquidation rather
          than by the borrower&rsquo;s promise. If the collateral falls far enough, a liquidator
          repays the loan and takes the collateral at a discount. The rate compensates for the
          possibility that this fails to happen fast enough, which is where bad debt comes from and
          why what backs a market matters as much as who runs it.
        </p>
        <p>
          Autocompounding strategies sit one layer above that. A contract harvests the reward
          emissions, sells them, and puts the proceeds back into the position on a schedule, which
          is why their published rate moves more than a plain supply rate and why part of it
          depends on the price of a token rather than on interest. A smaller group runs
          delta-neutral, holding USDC against a short leg so the yield comes from funding rather
          than from borrower demand. A few rows are real-world-asset credit, where the yield
          traces back to short-dated government paper rather than to anyone onchain, and those
          rates move with policy rather than with crypto leverage.
        </p>
        <p>
          Every one of those patterns buys either a higher or a steadier rate by adding
          smart-contract surface, and the vault page for any row spells out which contracts a
          position touches.
        </p>
      </Block>

      <Block
        id="paid-in"
        eyebrow="Composition"
        title="What these rates are actually paid in"
        lead={payoutLead(c)}
      >
        <p>
          {`A rate paid in USDC is already dollars. A rate paid in a reward token is worth whatever ` +
            `that token sells for on the day it is claimed, which is a different proposition at the ` +
            `same headline number. The reward tokens behind this index as of ${c.asOf} were ` +
            `${tokenBlock(c)} strategies. Median rates were close: ${apy(c.payout.usdcMedian)} for ` +
            `the dollar-paying group and ${apy(c.payout.tokenMedian)} for the token-paying one as of ` +
            `${c.asOf}, so the emission is rarely what makes a strategy pay more.`}
        </p>
        <p>
          Our data records the token a strategy pays in, not a split between base interest and
          emissions. Where a published rate blends the two, the upstream feed reports one figure
          and this page reports that figure rather than inventing a decomposition it cannot
          measure. One consequence is worth knowing: an autocompounder that harvests a reward
          token and swaps it to USDC is recorded as paying in USDC, correctly, because dollars are
          what reach the position.
        </p>
      </Block>

      <Block
        id="rate-stability"
        eyebrow="Stability"
        title="How steady each rate has been"
        lead={stabilityLead(c)}
      >
        {c.stability.mostVolatile && c.stability.steadiest ? (
          <p>
            {`Among the strategies holding at least ${tvl(c.fundedFloor)}, the steadiest over the 30 ` +
              `days to ${c.asOf} was ${c.stability.steadiest.name}, which held a standard deviation of ` +
              `${c.stability.steadiest.stdev.toFixed(2)} points around a mean of ` +
              `${apy(c.stability.steadiest.mean)}. The widest was ${c.stability.mostVolatile.name}, ` +
              `which ranged from ${apy(c.stability.mostVolatile.min)} to ` +
              `${apy(c.stability.mostVolatile.max)} over the same 30 days to ${c.asOf}, a standard ` +
              `deviation of ${c.stability.mostVolatile.stdev.toFixed(2)} points.`}
          </p>
        ) : null}
        <p>
          Deviation is the figure that tells you whether a headline rate is a rate or a spike. A
          strategy paying more than its own monthly mean on the day you read it has usually just
          received an emission or seen a jump in borrowing, and neither lasts. A strategy whose
          deviation is a fraction of a point has been paying roughly the same thing all month,
          which is the more useful property if the position is meant to sit. Standard deviation
          describes what a rate did over the window measured. It is not a forecast, and it says
          nothing about the contract, oracle or peg exposures set out below.
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
          `${apy(c.best.apy24h)} on ${proseName(c.best)} as of ${c.asOf}, against a median of ` +
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
          position is open.
        </p>
        <p>
          {`Contract risk is rarely one contract. A position in a curated vault passes through the ` +
            `vault itself, the curator's parameter set, the underlying market it lends into, and the ` +
            `collateral backing that market. Four surfaces, any one of which can fail on its own, ` +
            `and the published rate compensates for all of them at once. Rows carrying the fewest ` +
            `layers are the plain money markets, where the position lends directly.`}
        </p>
        <p>
          {`What backs a market matters as much as who runs it. ${morphoCount} of the ${c.count} ` +
            `strategies tracked here as of ${c.asOf} lend into Morpho, where USDC is supplied ` +
            `against a specific collateral asset rather than into a general pool. Where this page ` +
            `tracks a market directly, the collateral is in the row name: ` +
            `${listOf(morphoMarketCollateral)} on Base. Where it tracks a curated vault, the ` +
            `collateral is a basket the curator selects and can change, so the exposure moves with ` +
            `their decisions rather than staying fixed at the point a position opens.`}
        </p>
        <p>
          Curators are not interchangeable. A row reading Gauntlet, Steakhouse or Clearstar names
          the firm setting the loan-to-value ratios, the oracle choices and the collateral list for
          that vault, not the protocol underneath, and two vaults on the same protocol can carry
          very different exposure because two different firms set them up. Liquidity, bridge,
          operator and economic risk each get their own treatment, alongside the tiers and the
          exclusions, on the <Link href="/risk-framework">risk framework page</Link>.
        </p>
      </Block>

      <Block
        id="faq"
        eyebrow="Questions"
        title="USDC yield questions, answered"
      >
        {/* <details> rather than an accordion component, and every answer stays
            in the raw HTML whether or not it is open. The spec's "nothing behind
            a click" rule is about rows that do not exist until JavaScript runs;
            this hides nothing from a parser. Same pattern as /xrp-rich-list. */}
        <div className="uh-faq">
          {faqs.map((f, i) => (
            <details className="uh-faq-item" name="uh-faq" key={f.q} open={i === 0}>
              <summary className="uh-faq-q">
                <span>{f.q}</span>
                <Chevron />
              </summary>
              <p className="uh-faq-a">{f.a}</p>
            </details>
          ))}
        </div>
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
        {c.benchmark ? (
          <p>
            {`Scale is part of that scope. The ${c.count} strategies here held ${tvl(c.totalTvl)} ` +
              `between them as of ${c.asOf}, and ${c.fundedCount} cleared ${tvl(c.fundedFloor)}. For ` +
              `comparison, ${c.benchmark.largestName} held ${tvl(c.benchmark.largestTvl)} at ` +
              `${apy(c.benchmark.largestApy)} as of ${c.asOf}, measured the same way in our `}
            <Link href="/report/stablecoin-yield-ranking">stablecoin rate comparison</Link>
            {`. A larger position is usually better served by a deeper market at a lower rate than ` +
              `by the top of this table, and this index is most useful for finding strategies rather ` +
              `than for sizing into them.`}
          </p>
        ) : null}
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
