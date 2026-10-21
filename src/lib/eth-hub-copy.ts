// The words on /eth, as data.
//
// /eth and /eth.md say the same things: the answer under the H1, the summary
// findings, the per-network sentences, every FAQ answer, the staking
// reference and the risk list. They are built here, without JSX, so the HTML
// body and the agent Markdown page render one set of sentences from one
// cohort and cannot drift apart.
import { getLiveVaults, loadHistoryFile } from "./data";
import {
  proseName,
  listOf,
  plural,
  apy,
  apyFloorLabel,
  tvl,
} from "./usdc-hub";
import {
  buildEthCohort,
  byStrategyType,
  networkPicks,
  evidenceRows,
  strategyTypeOf,
  tokenOf,
  isL2,
  fundedMedian,
  ethVenues,
  loadStakingReference,
  ETH_NETWORKS,
  type EthCohort,
  type EthNetworkPicks,
  type EthTypeRow,
  type EthEvidenceRow,
  type StakingReference,
  type EthVenue,
} from "./eth-hub";

// Harvest's fee on these strategies, read from every ETH strategy contract
// (profitSharingNumerator + platformFeeNumerator over feeDenominator 10000)
// on October 21, 2026: 700 + 300 on Base and Arbitrum, 1000 + 500 on
// Ethereum. Every rate on the page is already net of it.
export const HARVEST_FEE_TEXT = "10% on Base and Arbitrum and 15% on Ethereum mainnet";

/** Rows holding less than this are called dust where the median is qualified. */
export const DUST_TVL = 1_000;

/** Daily-compounded equivalent of an APR, both in percent. */
export const aprToApy = (apr: number) => ((1 + apr / 100 / 365) ** 365 - 1) * 100;

export type FaqSpot = "top" | "network" | "types" | "safety" | "calc" | "staking" | "risk";
export interface Faq {
  q: string;
  at: FaqSpot;
  a: string;
}

export const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

export const bare = (v: { productName: string }) => v.productName.replace(/\s*\([^)]*\)$/, "");

export const SINGULAR: Record<string, string> = {
  allocator: "allocator",
  curated: "curated lending vault",
  "money-market": "money market",
  looping: "leveraged loop",
};

export const PLURAL: Record<string, string> = {
  allocator: "allocators",
  curated: "curated lending vaults",
  "money-market": "money markets",
  looping: "leveraged loops",
};

export const TYPE_BLURB: Record<string, string> = {
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
export function networkSentence(n: EthNetworkPicks, c: EthCohort): string {
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

/** The staking reference in one clause: rate, how it was measured, and when. */
export function stakingClause(s: StakingReference): string {
  return (
    `Lido's stETH paid ${s.aprAverage.toFixed(2)}% APR (about ${aprToApy(s.aprAverage).toFixed(2)}% ` +
    `APY with daily compounding), the average of its last ${s.reportCount} daily oracle reports ` +
    `to ${s.asOf}, read from the stETH contract on Ethereum and net of Lido's fee`
  );
}

/** "all 5" or "3 of the 5": how many of a set, without "5 of the 5". */
const countOf = (n: number, total: number) => (n === total ? `all ${total}` : `${n} of the ${total}`);

/** Funded strategies paying more than the staking reference, highest first. */
export const aboveStaking = (c: EthCohort, s: StakingReference) =>
  c.funded.filter((v) => v.apy24h > aprToApy(s.aprAverage));

// Yes or no first, then the reference it was judged against. Without a
// current reading the page says it does not measure staking and stops there:
// a remembered "about 3%" would be exactly the undated figure this answer
// exists to replace.
export function stakingAnswer(c: EthCohort, s: StakingReference | null): string {
  const loopNote =
    c.bestRaw && strategyTypeOf(c.bestRaw) === "looping"
      ? ` The highest rate in the table, ${apy(c.bestRaw.apy24h)} on ${proseName(c.bestRaw)}, ` +
        `came from leveraged looping, which adds a liquidation risk staking does not carry.`
      : "";
  if (!s) {
    return (
      `This index does not hold a current staking rate to compare against, so it cannot say. ` +
      `What it measures is the lending side: as of ${c.asOf}, strategies holding at least ` +
      `${tvl(c.fundedFloor)} paid ${apyFloorLabel(c.fundedMinApy)} to ${apy(c.fundedMaxApy)}.` +
      loopNote
    );
  }
  const above = aboveStaking(c, s);
  const ref = `The reference: ${stakingClause(s)}. It sits outside the ranking, which excludes liquid staking tokens.`;
  if (above.length === 0) {
    return (
      `Not on ${c.asOf}. No ETH strategy holding at least ${tvl(c.fundedFloor)} paid more than ` +
      `staking: the best was ${apy(c.funded[0]?.apy24h ?? 0)} on ` +
      `${c.funded[0] ? proseName(c.funded[0]) : "none"}. ${ref}` +
      loopNote
    );
  }
  return (
    `Yes, on ${countOf(above.length, c.fundedCount)} ETH strategies holding at least ` +
    `${tvl(c.fundedFloor)}, on their 24-hour rates as of ${c.asOf}, led by ${listOf(
      above.slice(0, 3).map((v) => `${proseName(v)} at ${apy(v.apy24h)}`),
    )}.` +
    (c.fundedCount > above.length
      ? ` The other ${c.fundedCount - above.length} paid less than staking.`
      : "") +
    ` ${ref}` +
    loopNote
  );
}

export function buildFaqs(
  c: EthCohort,
  nets: EthNetworkPicks[],
  types: EthTypeRow[],
  evidence: EthEvidenceRow[],
  staking: StakingReference | null,
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
  const baseSafest = evidence
    .filter((r) => r.vault.chain === "Base")
    .slice(0, 2);

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
        (baseSafest.length
          ? `By size, track record and rate steadiness, the strongest ETH options on Base as of ` +
            `${c.asOf} were ` +
            `${listOf(
              baseSafest.map(
                (r) =>
                  `${bare(r.vault)} (${tvl(r.vault.tvl)}` +
                  (r.stdev != null ? `, ±${r.stdev.toFixed(2)} pts over 30 days` : "") +
                  `)`,
              ),
            )}. `
          : "") +
        `No ETH yield is free of risk, so these are measurements rather than a safety score, ` +
        `and the safety section lists every ` +
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
      a: stakingAnswer(c, staking),
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
// ---- by protocol -------------------------------------------------------------

export function venueLead(venues: EthVenue[]): string {
  return `Among the vaults in this ETH index, grouped by the protocol they lend into, ${listOf(
    venues
      .filter((v) => !v.loop)
      .slice(0, 3)
      .map(
        (v) =>
          `the ${v.venue} ${plural(v.count, "vault", "vaults")} paid a median of ` +
          `${apy(v.medianApy)} across ${v.count}`,
      ),
  )}.`;
}

export function venueLine(v: EthVenue): string {
  if (v.loop) {
    return (
      `The leveraged ${v.venue} ${plural(v.count, "loop", "loops")}, ` +
      `${listOf(v.rows.map((r) => proseName(r)))}, held ${tvl(v.tvl)} and paid ` +
      `${apy(v.medianApy)}. ${v.count === 1 ? "It is" : "They are"} counted apart ` +
      `from plain ${v.venue} lending, since the rate comes from borrowing against ` +
      `the position.`
    );
  }
  if (v.count === 1) {
    return `The ${v.venue} ETH vault held ${tvl(v.tvl)} on ${listOf(v.chains)} and paid ${apy(v.medianApy)}.`;
  }
  return (
    `The ${v.count} ${v.venue} ETH vaults held ${tvl(v.tvl)} on ${listOf(v.chains)} ` +
    `and paid a median of ${apy(v.medianApy)}` +
    (v.minApy.toFixed(2) === v.maxApy.toFixed(2)
      ? "."
      : `, within ${apyFloorLabel(v.minApy)} to ${apy(v.maxApy)}.`)
  );
}

// ---- risks -------------------------------------------------------------------

/** A risk line: its name, then text runs with any source link in place. */
export interface EthRisk {
  title: string;
  parts: (string | { text: string; href: string })[];
}

export const ETH_RISKS_LEAD =
  "Every ETH rate on this page pays for a specific set of exposures, and six of them apply across the index: contract, layered contract, staked-ETH collateral, leverage, oracle and liquidity risk.";

export const ETH_RISKS: EthRisk[] = [
  {
    title: "Smart-contract risk",
    parts: [
      " sits on the vault and on the protocol under it, for as long as a position stays open. Euler, a venue in this index, lost ",
      {
        text: "$197 million in March 2023",
        href: "https://cointelegraph.com/news/defi-sees-its-biggest-hack-in-2023-as-euler-loses-197m-finance-redefined",
      },
      " through a function added while fixing an earlier bug.",
    ],
  },
  {
    title: "Layered contract risk",
    parts: [
      " grows with each wrapper. A curated vault or an allocator passes ETH through more contracts than a plain money market, and one rate pays for all of them at once.",
    ],
  },
  {
    title: "Staked-ETH collateral risk",
    parts: [
      " applies to ETH lending in particular. Much of the ETH borrowed on these markets is borrowed against staked or restaked ETH, and if that collateral trades below ETH faster than liquidations can keep up, lenders take the loss. The ",
      {
        text: "KelpDAO exploit of April 18, 2026",
        href: "https://www.coindesk.com/markets/2026/04/20/defi-tvl-drops-more-than-usd13-billion-in-two-days-following-kelp-dao-hack",
      },
      " minted rsETH with nothing behind it, which was then posted as collateral on Aave to borrow real assets, leaving bad debt estimated in April 2026 at roughly $200M to $246M.",
    ],
  },
  {
    title: "Leverage risk",
    parts: [
      " applies to looping alone. A loop earns the gap between the supply and borrow rates several times over, and when the borrow rate rises above the supply rate the same multiplier works against the position until it is unwound.",
    ],
  },
  {
    title: "Oracle risk",
    parts: [
      " sits on the price feeds that decide when a borrower gets liquidated. A feed that lags or is manipulated lets a loan go under water before the liquidation that should have protected the lender fires.",
    ],
  },
  {
    title: "Liquidity risk",
    parts: [
      " usually shows up first. A market keeps only its unborrowed ETH available to withdraw, so when borrowing spikes toward the limit the exit narrows for every supplier at once, until borrowers repay or the rising rate pulls new supply in.",
    ],
  },
];

export const STAKING_LEAD =
  "ETH staking pays validators newly issued ETH for securing Ethereum, while the ETH yield ranked on this page is interest paid by borrowers of ETH, which is a different source with a different set of risks.";

/** The staking reference paragraph's sentence, before its source link. */
export function stakingReferenceText(c: EthCohort, s: StakingReference): string {
  return (
    `${stakingClause(s)}. On the ${c.asOf} readings, ` +
    `${countOf(aboveStaking(c, s).length, c.fundedCount)} ETH strategies holding ` +
    `at least ${tvl(c.fundedFloor)} paid more than that. stETH is a liquid staking ` +
    `token and is not ranked on this page; the figure is here only to answer the ` +
    `comparison.`
  );
}

export const stakingSourceUrl = (s: StakingReference) =>
  `https://etherscan.io/address/${s.contract}#events`;

// ---- the page model ----------------------------------------------------------

export async function ethPageModel() {
  const history = loadHistoryFile();
  const c = buildEthCohort(
    (await getLiveVaults()).filter((v) => v.asset === "ETH"),
    history,
  );
  if (!c.best) return null;
  const best = c.best;
  const nets = ETH_NETWORKS.map((ch) => networkPicks(c, ch)).filter((n) => n.count > 0);
  const types = byStrategyType(c);
  const evidence = evidenceRows(c, history);
  const staking = loadStakingReference();
  const faqs = buildFaqs(c, nets, types, evidence, staking);
  const venues = ethVenues(c);
  const fMedian = fundedMedian(c);
  const dustCount = c.all.filter((v) => v.tvl < DUST_TVL).length;
  const l2Count = c.all.filter((v) => isL2(v.chain)).length;
  const fundedL2 = c.funded.filter((v) => isL2(v.chain)).length;
  const [n1, n2] = c.byNetwork;

  const answer =
    `The best ETH yield in Harvest's index is ${apy(best.apy24h)} APY, paid in ETH by ` +
    `${proseName(best, true)}, as of ${c.asOf}, among ETH lending and vault ` +
    `strategies holding at least ${tvl(c.fundedFloor)}. ` +
    (c.bestRaw && c.bestRaw.slug !== best.slug
      ? `The highest raw rate on that date, ${apy(c.bestRaw.apy24h)} on ` +
        `${proseName(c.bestRaw)}, ` +
        `belongs to a ${SINGULAR[strategyTypeOf(c.bestRaw)]} holding ` +
        `${tvl(c.bestRaw.tvl)}. `
      : "") +
    `The median was ${apy(fMedian)} across the ${c.fundedCount} strategies holding at ` +
    `least ${tvl(c.fundedFloor)}, and ${apy(c.medianApy)} across all ${c.count}, ` +
    `${dustCount} of which held under ${tvl(DUST_TVL)}.`;

  const findings = [
    `The ${c.count} ETH strategies tracked here held ${tvl(c.totalTvl)} between them across ` +
      `${c.chainCount} ${plural(c.chainCount, "network", "networks")}, and ${c.fundedCount} ` +
      `of them held at least ${tvl(c.fundedFloor)}.`,
    `The median ETH rate was ${apy(fMedian)} across the ${c.fundedCount} strategies holding at ` +
      `least ${tvl(c.fundedFloor)}, and ${apy(c.medianApy)} across all ${c.count}, of which ` +
      `${dustCount} held under ${tvl(DUST_TVL)}. The average weighted by TVL was ` +
      `${apy(c.tvlWeightedApy)}.`,
    ...(staking
      ? [
          `For reference outside the ranking, ${stakingClause(staking)}; ` +
            `${countOf(aboveStaking(c, staking).length, c.fundedCount)} funded strategies paid ` +
            `more than that on their 24-hour rates.`,
        ]
      : []),
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

  return {
    c,
    best,
    history,
    nets,
    types,
    evidence,
    staking,
    faqs,
    venues,
    fMedian,
    dustCount,
    l2Count,
    fundedL2,
    answer,
    findings,
  };
}

export type EthPageModel = NonNullable<Awaited<ReturnType<typeof ethPageModel>>>;
