// Every figure and every editorial table on /crypto-casinos, in one place.
//
// Same reason lib/usdc-hub.ts exists: a number that appears in the hero, a
// table, a bullet and an FAQ answer has four chances to disagree with itself
// if four files compute it. Nothing downstream recomputes.

import { capOf, parseBonus, turnoverUsd, type Casino } from "@/lib/crypto-casinos";

export const money = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
    : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/* ---- counting in prose ------------------------------------------------ */

const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

/**
 * A count spelled out, for prose.
 *
 * The ranking length used to be the size of the wordmark map, read at module
 * scope. It is a property of the data now that membership also needs a link,
 * so every caller passes the number it actually rendered.
 */
export const spellOut = (n: number, cap = false) => {
  const w = WORDS[n] ?? String(n);
  return cap ? w.charAt(0).toUpperCase() + w.slice(1) : w;
};

/* ---- the blocks above the table -------------------------------------- */

/** The lead under the H1. The count is derived, so it cannot go stale. */
export const LEAD = (ranked: number) =>
  `We’ve compared the advertised offers from ${ranked} crypto casinos to help you narrow down your options. Browse welcome bonuses, cashback, and rakeback side by side, then take a closer look at the offers that interest you. Our selected casino reviews explain the key terms, and the wagering calculator helps you work out how much play a bonus requires before you commit to a deposit.`;

/** The byline strip under the lead. */
export const BYLINE = (ranked: number) => `${ranked} casinos compared`;

/** What to do with the table, said once, directly above it. */
export const RANKING_INTRO =
  "Start with the offer, then check how it works: the deposit required to qualify, the games that count toward wagering, and the conditions for withdrawal. Expand an offer for the details, or select Play now to visit the casino.";

/** Said once above the fold, and again at the foot of the page. */
export const DISCLOSURE_SHORT =
  "We may earn a commission when you register through a Play Now link. No casino has paid for its position.";

/** The one thing a reader needs before the table, not after it. */
export const LEGAL_SHORT =
  "18+. Country restrictions apply, and most listed casinos exclude US players.";

/**
 * What the leave-site modal says on this page.
 *
 * The site's default warning is about contracts, rates and security, which is
 * the right warning for a DeFi venue and the wrong one here. A reader leaving
 * for a casino needs the three facts that actually apply: the house wins over
 * time, the operator holds the balance, and this link is commercial.
 */
export const LEAVE_SITE_BODY = (name: string) =>
  `${name} is a third-party gambling site. Harvest does not run it, hold your balance or process your withdrawal, and every game there has a house edge, so the expected result of continued play is a loss. This link is commercial and may pay us. Check the law where you live and read the bonus terms before you deposit.`;

/**
 * The Harvest section, which starts after the withdrawal has landed.
 *
 * Not a second pass at the bonus terms. Everything above this point is about
 * money still inside a casino account; this is about money that has already
 * left one, which is the only moment any of it applies.
 */
export const HARVEST_INTRO = [
  "Once your casino withdrawal reaches your wallet, you can explore other ways to use those funds. If you’re interested in earning yield on stablecoins, Harvest helps you compare USDC and USDT strategies across DeFi, with rates, networks and strategy details in one place.",
  "You can explore how each strategy earns its yield, how its rate has changed over time and what to expect when depositing or withdrawing. That gives you a fuller picture when deciding where to put your funds.",
];

/** What the table is a selection of. The floor is a criterion, not a badge. */
export const HARVEST_SELECTION = (floor: string) =>
  `The selection below highlights USDC strategies tracked by Harvest, each holding at least ${floor} in total deposits.`;

/** What the APY column is, said at the column and not in a footnote. */
export const APY_NOTE =
  "Annualized yield based on the latest 24 hours of data. Rates change over time.";

/** The one risk paragraph, beneath the table. */
export const HARVEST_RISK =
  "Explore the full comparison to see more strategies and their recent rate history. DeFi strategies carry smart-contract, liquidity and stablecoin risks, including the possibility of losing deposited funds. Our risk framework explains what to consider when comparing them.";

/** Printed directly above the ranking. */
export const SORT_RULE =
  "Offers with dollar caps appear first, highest to lowest. Crypto-denominated offers are followed by an advertised match percentage, with percentage-only rewards at the end. Offer descriptions and feature labels reflect each operator’s published claims.";

/* ---- the wagering section and the calculator -------------------------- */

/** Above the turnover table. */
export const WAGERING_INTRO = [
  "When you’re comparing welcome bonuses, it helps to look at the wagering requirement alongside the amount on offer. A $100 bonus with a 40x requirement on bonus funds means placing $4,000 in qualifying bets before you can withdraw the bonus and eligible winnings.",
  "The table below puts the listed bonus amounts alongside their wagering requirements, so you can see how the figures add up. Your own requirement will depend on the bonus you receive and the terms attached to it.",
];

/** Below the turnover table, and the handover to the calculator. */
export const WAGERING_AFTER = [
  "The wagering total adds up your qualifying bets throughout play. The same funds can contribute to several bets, while wins and losses change your available balance along the way. Each offer also has its own rules about which games count and how long you have to complete the requirement.",
  "For a closer look at the numbers, try the calculator below. You can enter a bonus amount and explore how wagering requirements, game contribution, and house edge affect the estimated cost of playing it through.",
];

/** Above the calculator. */
export const CALC_INTRO =
  "Choose a casino offer or enter your own bonus amount to see how the wagering adds up. The calculator shows the total betting volume required and estimates the cost to complete it based on the game assumptions below. Try different amounts and settings to get a clearer picture of the offer you’re considering.";

/** The one explanatory note under the calculator. */
export const CALC_NOTE =
  "The estimate combines total wagering with the assumed house edge and game contribution, assuming you complete the full requirement. Your actual results will vary, and each casino’s bonus terms determine which games qualify.";

/**
 * Offers advertised as a running total across several deposits.
 *
 * A calculator preset has to say which stage its figure is, otherwise the
 * arithmetic silently answers a question nobody asked: Wild.io's $1,000 is one
 * deposit's ceiling inside a three-deposit package, and BC.Game's $4,000 is
 * the package total across four.
 */
export const BONUS_STAGES: Record<string, string> = {
  "wild-io": "first deposit stage of a three-deposit package",
  "bc-game": "advertised total across four match bonuses",
};

/* ---- what each row says ----------------------------------------------- */

export type OfferKind = "welcome" | "cashback" | "rakeback";

export const OFFER_FILTERS: { key: OfferKind | "all"; label: string }[] = [
  { key: "all", label: "All offers" },
  { key: "welcome", label: "Welcome bonuses" },
  { key: "cashback", label: "Cashback" },
  { key: "rakeback", label: "Rakeback" },
];

/**
 * The offer, restated once per venue.
 *
 * Every line here is a restatement of the operator's own headline and nothing
 * more: what the offer is, the one figure worth pulling out, and what else the
 * banner includes. The figure appears in `headline` and never again in
 * `support`, so a row prints it once.
 *
 * `kinds` is editorial classification of that headline, not a claim about the
 * venue. A cashback rate and a rakeback rate are different products from a
 * deposit match and must not inherit its wording.
 */
export interface OfferCopy {
  kinds: OfferKind[];
  summary: string;
  headline: string;
  support: string | null;
}

export const OFFERS: Record<string, OfferCopy> = {
  "lucky-rollers": {
    kinds: ["welcome", "cashback"],
    summary: "Deposit match with spins and a free bet",
    headline: "Up to 30,000 USDT",
    support: "100% match, 100 free spins and one free bet",
  },
  "betpanda-io": {
    kinds: ["welcome", "cashback"],
    summary: "Deposit match capped in bitcoin, with weekly cashback",
    headline: "Up to 1 BTC",
    support: "100% match, 10% weekly cashback and a $750k race",
  },
  "coin-casino": {
    kinds: ["welcome"],
    summary: "200% deposit match",
    headline: "Up to $30,000",
    support: "The bonus scales with the qualifying deposit",
  },
  "hyper-lucky": {
    kinds: ["cashback"],
    summary: "Daily cashback with free spins",
    headline: "20% daily cashback",
    support: "Advertised up to $10,000, with 100 free spins",
  },
  casinopunkz: {
    kinds: ["welcome", "cashback"],
    summary: "Welcome bonus with cashback",
    headline: "Up to 20,000 USDT",
    support: "Advertised alongside 15% cashback",
  },
  thrill: {
    kinds: ["rakeback", "cashback"],
    summary: "Rakeback and cashback, with no deposit match advertised",
    headline: "Up to 70% rakeback",
    support: "Advertised alongside 10% cashback",
  },
  "bc-game": {
    kinds: ["welcome"],
    summary: "Welcome package across four deposits",
    headline: "Up to $4,000",
    support: "Four match bonuses and 400 free spins",
  },
  "wild-io": {
    kinds: ["welcome", "cashback"],
    summary: "Welcome package across three deposits",
    headline: "Up to $1,000 per deposit",
    support: "350% across the first three deposits, with 200 free spins",
  },
  cybet: {
    kinds: ["welcome"],
    summary: "Deposit match with free spins",
    headline: "Up to $1,000",
    support: "100% match and 50 free spins",
  },
  "betplay-io": {
    kinds: ["welcome", "cashback", "rakeback"],
    summary: "Deposit match in USDT",
    headline: "Up to 5,000 USDT",
    support: "100% match",
  },
  "lucky-block": {
    kinds: ["welcome"],
    summary: "200% deposit match with free spins",
    headline: "Up to $25,000",
    support: "200% match and 50 free spins",
  },
  betninja: {
    kinds: ["welcome"],
    summary: "Deposit match with free spins",
    headline: "Up to $2,500",
    support: "100% match and 100 free spins",
  },
  betfury: {
    kinds: ["welcome"],
    summary: "Deposit match with free spins",
    headline: "Up to $10,500",
    support: "590% advertised match and 225 free spins",
  },
  "7bit-casino": {
    kinds: ["welcome", "cashback"],
    summary: "Welcome bonus with free spins",
    headline: "Up to $5,400",
    support: "325% advertised match and 250 free spins",
  },
  "golden-panda": {
    kinds: ["welcome"],
    summary: "200% welcome package with free spins",
    headline: "Up to $5,000",
    support: "200% match and 50 free spins",
  },
  "wsm-casino": {
    kinds: ["welcome", "cashback"],
    summary: "200% deposit match with free spins",
    headline: "Up to $25,000",
    support: "200% match and 50 free spins",
  },
};

/**
 * A material unresolved issue a review actually found, said once in the row.
 *
 * Not generated from an empty field. The rows used to carry an automatic
 * "Operator not identified" chip wherever a licence was unread, which put the
 * same badge on fourteen of sixteen rows and turned a finding into wallpaper.
 */
const ROW_NOTES: Record<string, string> = {
  "lucky-rollers": "Operator and licence details remain unverified.",
};

/**
 * The one operator fact worth carrying in the row.
 *
 * Named where the terms name a company, unverified where a review looked and
 * found none. Both are findings; neither is generated from an empty field.
 */
export function rowNote(c: Casino): string | null {
  if (ROW_NOTES[c.slug]) return ROW_NOTES[c.slug];
  return c.operator ? `Operated by ${c.operator}.` : null;
}

/** The two or three facts printed beside the offer, in ordinary text. */
export function keyDetails(c: Casino): string[] {
  const out: string[] = [];
  const wr = c.verified.wagering;
  if (wr === 0) out.push("No wagering requirement");
  else if (wr != null) out.push(`${wr}× wagering`);
  if (c.minDeposit) out.push(`${c.minDeposit} minimum deposit`);
  if (out.length < 3 && c.verified.withdrawal) {
    out.push(`Published payout window: ${c.verified.withdrawal}`);
  }
  // An empty cell in a four-column row reads as a broken page. One plain
  // sentence, said where a reader is looking for the terms.
  if (out.length === 0) return ["Wagering and deposit terms not yet read"];
  return out.slice(0, 3);
}

/** Which of the four filters a row belongs to. */
export function offerKinds(c: Casino): OfferKind[] {
  const known = OFFERS[c.slug];
  if (known) return known.kinds;
  const kinds: OfferKind[] = [];
  if (capOf(c) != null) kinds.push("welcome");
  if (c.claimed.cashback) kinds.push("cashback");
  if (c.claimed.rakeback) kinds.push("rakeback");
  return kinds;
}

/* ---- derived from the venue data ------------------------------------- */

export interface TurnoverRow {
  slug: string;
  name: string;
  /** The advertised headline cap, as the ranking prints it. */
  cap: number;
  /**
   * What the playthrough actually multiplies. Equal to cap for every venue
   * whose offer is a single match, and smaller where the headline is a
   * running total across deposits.
   */
  basis: number;
  wagering: number;
  turnover: number;
  minDeposit: string | null;
  note: string | null;
  /** True where the figure the row is ranked on is a cashback or rakeback
   *  rate. It belongs in the turnover table and not in a deposit-bonus
   *  preset, because there is no deposit match to model. */
  cashback: boolean;
}

/**
 * Whether the cap this row is ranked on came out of a cashback or rakeback
 * clause rather than a deposit match.
 *
 * Tested on the segment of the headline the cap was read from, not the whole
 * string: these headlines bundle offers, and Casino Punkz advertises a
 * 20,000 USDT welcome bonus alongside a 15% cashback in one line.
 */
function cashbackHeadline(c: Casino): boolean {
  const claim = c.bonusClaim;
  // A cap read off the terms did not come from the banner at all.
  if (!claim || c.verified.capUsd != null) return false;
  const cap = parseBonus(claim).cap;
  if (cap == null) return false;
  const forms = [cap.toLocaleString("en-US"), String(cap), `${cap / 1000}k`];
  const seg = claim.split("+").find((s) => forms.some((f) => s.includes(f)));
  return seg != null && /\b(cash\s?back|rake\s?back)\b/i.test(seg);
}

/** Venues where both halves of the sum are known. Sorted by what they ask. */
export function turnoverRows(casinos: Casino[]): TurnoverRow[] {
  return casinos
    .map((c) => {
      const cap = capOf(c);
      const t = turnoverUsd(c);
      const wr = c.verified.wagering;
      if (cap == null || t == null || wr == null) return null;
      return {
        slug: c.slug,
        name: c.name,
        cap,
        basis: c.verified.wageringBasisUsd ?? cap,
        wagering: wr,
        turnover: t,
        minDeposit: c.minDeposit ?? null,
        note: c.termsNote ?? null,
        cashback: cashbackHeadline(c),
      };
    })
    .filter((r): r is TurnoverRow => r != null)
    .sort((a, b) => a.turnover - b.turnover);
}

/** Venues with enough read off them to compare side by side. */
export function compareRows(casinos: Casino[]) {
  return casinos
    .filter((c) => c.verified.chains?.length && c.verified.withdrawal)
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      bonus: c.bonusClaim ?? "None",
      wagering: c.verified.wagering,
      coins: c.verified.chains as string[],
      minDeposit: c.minDeposit ?? null,
      withdrawal: c.verified.withdrawal as string,
      games: c.verified.games,
    }));
}

/* ---- editorial tables -------------------------------------------------- */

export const COINS: {
  name: string;
  sym: string;
  fee: string;
  toWallet: string;
  volatility: "Low" | "Medium" | "High";
  note: string;
}[] = [
  { name: "Bitcoin", sym: "BTC", fee: "$1 to $10", toWallet: "10 to 60 min", volatility: "High", note: "Accepted everywhere. The slowest and priciest of the common options when the network is busy." },
  { name: "Ethereum", sym: "ETH", fee: "$0.50 to $20", toWallet: "5 to 20 min", volatility: "High", note: "Widely accepted. Fees move with congestion, so a small withdrawal can cost a noticeable share of itself." },
  { name: "Litecoin", sym: "LTC", fee: "about $0.10", toWallet: "5 to 30 min", volatility: "Medium", note: "Cheap and quick. A common pick for players moving money in and out often." },
  { name: "Bitcoin Cash", sym: "BCH", fee: "$0.01 to $0.10", toWallet: "10 to 60 min", volatility: "High", note: "Larger blocks keep fees low. Support is thinner than BTC." },
  { name: "Tether", sym: "USDT", fee: "$0.01 to $20", toWallet: "1 to 30 min", volatility: "Low", note: "Pegged to the dollar, so a balance holds its value between the deposit and the withdrawal. Fees depend entirely on the chain you send it over." },
  { name: "TRON", sym: "TRX", fee: "about $0.10", toWallet: "1 to 5 min", volatility: "Medium", note: "Fast and cheap. Often the default chain for USDT at these venues." },
  { name: "XRP", sym: "XRP", fee: "under $0.10", toWallet: "1 to 5 min", volatility: "Medium", note: "Settles in seconds for a fraction of a cent." },
  { name: "Solana", sym: "SOL", fee: "under $0.10", toWallet: "1 to 5 min", volatility: "High", note: "Quick and cheap, and the price moves as much as the majors." },
  { name: "Dogecoin", sym: "DOGE", fee: "about $0.10", toWallet: "5 to 30 min", volatility: "High", note: "Cheap transfers. Popular for small stakes." },
];

export const NETWORKS: { coin: string; chains: string }[] = [
  { coin: "Bitcoin", chains: "Bitcoin, Lightning" },
  { coin: "Ethereum", chains: "Ethereum, Arbitrum, Optimism, Base" },
  { coin: "Tether (USDT)", chains: "ERC20 (Ethereum), TRC20 (Tron), BEP20 (BSC), SPL (Solana), Polygon" },
  { coin: "USD Coin (USDC)", chains: "Ethereum, Solana, Base, Polygon, Arbitrum, Optimism" },
];


export const BONUS_TERMS: { name: string; body: string }[] = [
  { name: "Playthrough", body: "How many times the bonus, and often the deposit with it, has to be wagered before any of it can be withdrawn. Twenty times is generous. Sixty times and above means the offer is closer to a marketing number than to money." },
  { name: "Minimum deposit", body: "The smallest deposit that triggers the offer. Usually $5 to $20, and a small deposit still has to clear the full playthrough." },
  { name: "Maximum bet", body: "A cap on the stake per spin or per hand while bonus funds are live. Going over it voids the bonus, and the venues enforce this strictly." },
  { name: "Game contribution", body: "Slots usually count 100% toward the playthrough. Live tables and roulette often count 20%, so a 40x bonus is really 200x of blackjack. This is the term that quietly decides whether an offer is clearable." },
  { name: "Excluded games", body: "Crash, Mines, Dice and the other provably fair originals are usually barred from bonus play, because their low house edge makes the playthrough too cheap to clear." },
  { name: "Time limit", body: "Seven to thirty days to finish the playthrough. Whatever is left when the clock runs out goes, along with anything won from it." },
  { name: "Maximum withdrawal", body: "A ceiling on what a bonus can pay out. Welcome offers often have none. No-deposit offers almost always do." },
];


export const SCAM_SIGNALS: { name: string; body: string }[] = [
  { name: "No licence on the page", body: "A legitimate operator prints its authority and licence number in the footer. If nothing is named, or the number does not appear on the regulator's own register, walk." },
  { name: "Terms that stay vague", body: "Payout policy, verification triggers and maximum withdrawals should be written down and findable. Vagueness here is what a venue leans on when it declines to pay." },
  { name: "No provably fair games", body: "A crypto-first venue with no verifiable originals and no explanation of how to check a seed has skipped the one thing that separates it from an ordinary casino." },
  { name: "Withdrawal complaints in public", body: "This community is loud and fast. Search the venue name alongside the word withdrawal and read what comes back before depositing, not after." },
];

export const RG_TOOLS: { name: string; body: string }[] = [
  { name: "Deposit and loss limits", body: "Caps what can go in, or what can be lost, over a day, a week or a month." },
  { name: "Wager limits", body: "Caps total stakes over a period, which bites sooner than a loss limit does." },
  { name: "Reality checks", body: "A pop-up showing how long the session has run and what it has cost so far." },
  { name: "Time-outs", body: "Locks the account for a day up to several weeks. Everything stays where it is." },
  { name: "Self-exclusion", body: "A long or permanent block that cannot be lifted early. The one tool built to survive a change of mind." },
];



// Ordered by what a reader arrives with, not by topic. The last two of the
// first eight are not optional under this headline: a page that ranks
// third-party venues and takes a commission has to answer both in its own
// words, and the FAQPage schema carries them into the result.
// Eight, and every one of them answers something the page does not already
// have a heading for. The list ran to sixteen, half of it restating an H2.
export const FAQS: { q: string; a: string }[] = [
  { q: "What is a crypto casino?", a: "An online casino that takes wagers in cryptocurrency, not in bank-processed money. Balances are funded by an onchain transfer and withdrawals are paid back to a wallet address. The games are the same ones a currency casino runs; what changes is the payment rail, and with it the speed of a withdrawal and how much identity checking sits in front of it." },
  { q: "Are crypto casinos legal?", a: "Crypto casino legality depends on where you live, not on the payment method. Online gambling is licensed in some jurisdictions, restricted to state operators in others, and prohibited in several. Most crypto casinos hold an offshore licence and block a list of countries at sign-up. Check the law where you live before you play, and check that list before you register." },
  { q: "Why does a bonus with a high wagering requirement cost money?", a: "A playthrough requirement obliges a multiple of the bonus to be wagered before any of it can be withdrawn, and every one of those wagers meets the game's house edge, so the turnover has an expected cost. A 200% bonus at 60x playthrough can be worth less than a 50% bonus at 20x once that cost is priced, which is what the calculator on this page works out." },
  { q: "Which crypto casinos do not require KYC?", a: "Some venues take no identity documents at sign-up and ask only above a withdrawal threshold; others ask for nothing at all. The policy is the operator's choice and it changes without notice, which is why each row here records the threshold and the date the terms were read. A venue advertising no KYC can still request documents on a large withdrawal." },
  { q: "What happens if I send crypto on the wrong network?", a: "The funds are usually gone. USDT exists as a separate token on Ethereum, Tron, BSC, Solana and Polygon, and sending the Ethereum version to a Tron address puts it somewhere neither you nor the casino can reach. Check the network on both sides before confirming, every time." },
  { q: "How is this page ranked?", a: "By advertised welcome-bonus size, dollar caps first. That is a rule about advertising and not about which venue is safer or cheaper to clear. The Evidence column is separate: it counts how much of a venue we have read off its own terms, and it never moves a row. Venues without a wordmark are not listed at all." },
  { q: "Does Harvest get paid?", a: "Yes, potentially. Harvest may earn a commission if you register through a link on this page. That payment does not change the sort order, which is fixed to the advertised bonus size by the rule printed above the table, and it does not change the Evidence column, which counts terms we have read. No venue has paid for a position here." },
  { q: "What is a good wagering requirement?", a: "The multiplier alone does not settle it. What matters alongside it is whether the playthrough applies to the bonus or to the deposit plus the bonus, which games count and at what rate, and how long you have. A 20x requirement on a base that includes your deposit, clearable only on slots, can oblige more turnover than a 40x on the bonus alone." },
];


/* ---- the reviews ------------------------------------------------------ */

/**
 * One venue, reviewed.
 *
 * The shape is deliberately not a template with slots for research
 * completeness. Every attraction named has to come out of a published feature,
 * the scope of the reading is stated once at the foot, and a material unknown
 * is carried in the editorial verdict rather than sprinkled through the prose
 * as hedging. Empty fields are not rendered; they are not written.
 */
export interface VenueReview {
  slug: string;
  /** The H2. Names the venue and what the review actually covers. */
  title: string;
  /** One paragraph, before the numbers. */
  intro: string;
  /** The published offer, as a two-column table. */
  features: { label: string; value: string }[];
  sections: { h: string; body: string[] }[];
  /** The venue's own terms page, linked beside the outbound button. */
  termsUrl: string;
  /** Said once, at the foot, in a full sentence. */
  scope: (readOn: string) => string;
}

/**
 * Lucky Rollers, first by advertised bonus.
 *
 * The clearest published terms on this page sitting behind an operator nobody
 * can name. The precise-looking complaint statistics circulating for this
 * brand come from an affiliate site and trace to no primary source, so they
 * are not printed here.
 */
export const LUCKY_ROLLERS_REVIEW: VenueReview = {
  slug: "lucky-rollers",
  title: "Lucky Rollers review: welcome bonus, cashback and crypto payments",
  intro:
    "Lucky Rollers combines a deposit-match welcome bonus with free spins, a free bet and weekly cashback. That gives you a few different parts of the offer to compare, especially if you’re interested in recurring rewards alongside the initial deposit bonus. We’ve looked at the published terms to explain how the package fits together.",
  features: [
    {
      label: "Welcome bonus",
      value:
        "100% match up to 30,000 USDT, plus 100 free spins and a free bet",
    },
    { label: "Bonus wagering", value: "40×" },
    { label: "Minimum deposit", value: "5 USDT" },
    {
      label: "Crypto payments",
      value: "13 currencies, including BTC, ETH, USDT, USDC, XRP and SOL",
    },
    {
      label: "Weekly cashback",
      value: "Paid on Mondays, with no additional wagering requirement",
    },
  ],
  sections: [
    {
      h: "How the welcome bonus works",
      body: [
        "The 100% match means the bonus follows the size of your qualifying deposit, up to the advertised limit. When comparing this offer, start with the amount you expect to receive: the minimum deposit gives you an entry point, while reaching the headline cap requires a much larger deposit.",
        "The next detail to consider is the 40× wagering requirement. For example, a 100 USDT bonus under a bonus-only 40× requirement would involve 4,000 USDT in qualifying bets. The applicable terms should establish whether wagering covers the bonus alone or the deposit as well, which games contribute and the deadline for completion.",
      ],
    },
    {
      h: "What the weekly cashback adds",
      body: [
        "Weekly cashback is a separate part of the offer worth examining. According to the published promotion information, it is paid on Mondays without an additional wagering requirement attached to the credited cashback.",
        "To judge its value, look at the qualifying activity, the cashback percentage and any payout cap. These details determine how much the reward could amount to for your own play.",
      ],
    },
    {
      h: "Crypto payments and withdrawals",
      body: [
        "Lucky Rollers lists 13 supported cryptocurrencies, giving you several payment options to compare. Before transferring funds, check that the cashier supports both your chosen asset and the network you intend to use.",
        "The operator advertises instant withdrawals and document-free withdrawals at standard levels. Review the verification conditions for your intended withdrawal amount, as those conditions matter when assessing how the advertised payout process would apply to you.",
      ],
    },
    {
      h: "Our view",
      body: [
        "Weekly cashback is the part of this offer we would examine alongside the welcome package. Its published terms describe a reward without additional wagering, while the deposit bonus carries a 40× requirement.",
        "Our assessment also has an important outstanding point: we could not establish the operating company or licence from the terms and promotion pages reviewed. We would want those details confirmed before including Lucky Rollers among Harvest’s recommended casinos.",
      ],
    },
  ],
  termsUrl: "https://luckyrollers.io/terms-and-conditions",
  scope: (readOn) =>
    `Review scope: Published terms and promotion information dated ${readOn}. This review covers the advertised offer; hands-on gameplay and withdrawal testing are outside its scope.`,
};

export const VENUE_REVIEWS: VenueReview[] = [LUCKY_ROLLERS_REVIEW];
