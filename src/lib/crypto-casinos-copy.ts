// Every figure and every editorial table on /crypto-casinos, in one place.
//
// Same reason lib/usdc-hub.ts exists: a number that appears in the hero, a
// table, a bullet and an FAQ answer has four chances to disagree with itself
// if four files compute it. Nothing downstream recomputes.

import { CASINO_LOGOS } from "@/lib/casino-logos";
import { capOf, turnoverUsd, type Casino } from "@/lib/crypto-casinos";

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

/** "TOP16", as the title, the H1 and the nav all say it. */
export const rankLabel = (n: number) => `TOP${n}`;

/* ---- the blocks above the table -------------------------------------- */

/**
 * The four sentences under the H1.
 *
 * The H1 catches the query and the lead takes the responsibility off it: the
 * sort is a fact about advertising, and the number that matters is two
 * sections down. Both counts are derived, so neither can go stale when a
 * wordmark or a set of terms arrives.
 */
export function leadSentences(ranked: number, priced: number): string {
  const n = spellOut(ranked, true);
  const p = spellOut(priced, true);
  return `${n} welcome bonuses, largest advertised figure first. A cap is not cash: playthrough turns it into an obligation. ${p} of these venues publish both numbers, so the calculator below prices the wager. Checked cells come off the venue's own terms, and dashes mean we have not read them yet.`;
}

/** Said once above the fold, and again at the foot of the page. */
export const DISCLOSURE_SHORT =
  "Harvest may earn a commission if you register through a link on this page. That payment does not change the sort order. Rows are ordered by advertised bonus size, by the rule above the table.";

/** The one thing a US reader needs before the table, not after it. */
export const LEGAL_SHORT =
  "Most venues on this list do not accept players in the United States. Checking the law where you live is yours. An Anjouan or Curacao licence is not a US or UK licence.";

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

/** Printed directly above the ranking. */
export const SORT_RULE =
  "Sort key: advertised bonus cap, dollars first. BTC-capped and uncapped offers sit below. A higher row is a larger headline, not a better venue.";

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

export const BONUS_TYPES: { type: string; how: string; typical: string }[] = [
  { type: "Welcome match", how: "Multiplies your first deposit by a set percentage, up to a cap.", typical: "100% to 500%, capped anywhere from $1,000 to 1 BTC" },
  { type: "Reload", how: "A smaller match on later deposits, usually on a set day.", typical: "25% to 100%" },
  { type: "Free spins", how: "Fixed-stake spins on named slots. Winnings usually carry their own playthrough.", typical: "50 to 500 spins" },
  { type: "Cashback", how: "Returns a share of net losses over a day or a week. Sometimes paid with no playthrough, which makes it the most useful offer on this list.", typical: "5% to 25%" },
  { type: "Rakeback", how: "Returns a share of everything you wager, win or lose.", typical: "0.1% to 70%" },
  { type: "VIP tier", how: "Faster withdrawals, higher limits, a named account manager.", typical: "Invitation or wagering volume" },
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

export const CRYPTO_VS_FIAT: { k: string; crypto: string; fiat: string }[] = [
  { k: "Payout time", crypto: "Minutes, once the venue approves it", fiat: "Two to five working days" },
  { k: "Fees", crypto: "Network fee only, often under a dollar", fiat: "Card and transfer fees" },
  { k: "Identity checks", crypto: "Often none at sign-up, common above a withdrawal threshold", fiat: "Full verification before the first payout" },
  { k: "Bonus size", crypto: "Larger headline offers, higher playthrough", fiat: "Smaller offers, terms capped by the regulator" },
  { k: "Game count", crypto: "Five to ten thousand, sourced globally", fiat: "Hundreds, limited by the licence" },
  { k: "Provably fair", crypto: "Standard on originals", fiat: "Not offered" },
  { k: "If it goes wrong", crypto: "The operator, and no one above it", fiat: "A regulator with a complaints process" },
  { k: "Balance risk", crypto: "The coin can move while you play", fiat: "Held in a stable currency" },
];

export const SCAM_SIGNALS: { name: string; body: string }[] = [
  { name: "No licence on the page", body: "A legitimate operator prints its authority and licence number in the footer. If nothing is named, or the number does not appear on the regulator's own register, walk." },
  { name: "Terms that stay vague", body: "Payout policy, verification triggers and maximum withdrawals should be written down and findable. Vagueness here is what a venue leans on when it declines to pay." },
  { name: "No provably fair games", body: "A crypto-first venue with no verifiable originals and no explanation of how to check a seed has skipped the one thing that separates it from an ordinary casino." },
  { name: "A thin list of coins", body: "Two or three coins and a single network suggests a venue that has not built its own payments, and is renting someone else's." },
  { name: "Withdrawal complaints in public", body: "This community is loud and fast. Search the venue name alongside the word withdrawal and read what comes back before depositing, not after." },
];

export const RG_TOOLS: { name: string; body: string }[] = [
  { name: "Deposit and loss limits", body: "Caps what can go in, or what can be lost, over a day, a week or a month." },
  { name: "Wager limits", body: "Caps total stakes over a period, which bites sooner than a loss limit does." },
  { name: "Reality checks", body: "A pop-up showing how long the session has run and what it has cost so far." },
  { name: "Time-outs", body: "Locks the account for a day up to several weeks. Everything stays where it is." },
  { name: "Self-exclusion", body: "A long or permanent block that cannot be lifted early. The one tool built to survive a change of mind." },
];

export const WALLET_STEPS: { title: string; body: string }[] = [
  { title: "Pick a wallet", body: "Trust Wallet, MetaMask and Exodus all work. Check it supports the coin and the chain the venue wants before you go further." },
  { title: "Install it from the source", body: "The official site or the app store, never a link in a chat. Fake wallet apps are the cheapest way to lose a balance." },
  { title: "Write the recovery phrase down", body: "On paper, offline. It is the only route back into the wallet, and anyone who reads it owns the funds." },
  { title: "Fund it", body: "Buy on an exchange and send it across. Exchanges verify identity even when the casino does not." },
];

export const DEPOSIT_STEPS: { title: string; body: string }[] = [
  { title: "Open the cashier", body: "Pick the coin and the amount." },
  { title: "Pick the network", body: "Match it to your wallet exactly. This is the step that loses money." },
  { title: "Copy the address", body: "Copy it, never type it, and scan the QR code where one is offered." },
  { title: "Paste it into your wallet", body: "Check the first four and last four characters against the original." },
  { title: "Check the fee", body: "The network fee comes out of the transfer. Make sure what lands still clears the bonus minimum." },
  { title: "Wait for confirmations", body: "Seconds to a few minutes on most chains. Bitcoin takes longer when the mempool is full." },
];

// Ordered by what a reader arrives with, not by topic. The last two of the
// first eight are not optional under this headline: a page that ranks
// third-party venues and takes a commission has to answer both in its own
// words, and the FAQPage schema carries them into the result.
export const FAQS: { q: string; a: string }[] = [
  { q: "What is a crypto casino?", a: "An online casino that takes wagers in cryptocurrency, not in bank-processed money. Balances are funded by an onchain transfer and withdrawals are paid back to a wallet address. The games are the same ones a currency casino runs; what changes is the payment rail, and with it the speed of a withdrawal and how much identity checking sits in front of it." },
  { q: "Are crypto casinos legal?", a: "Crypto casino legality depends on where you live, not on the payment method. Online gambling is licensed in some jurisdictions, restricted to state operators in others, and prohibited in several. Most crypto casinos hold an offshore licence and block a list of countries at sign-up. Check the law where you live before you play, and check that list before you register." },
  { q: "Are crypto casinos legal in the United States?", a: "No federal law stops a player from using one. Seven states run regulated online casinos, and none of those operators takes cryptocurrency, so crypto play means an offshore site outside state regulation. Washington State criminalises taking part in online gambling. Enforcement elsewhere has focused on operators and not on players, and that is a pattern, not a protection." },
  { q: "Why does a bonus with a high wagering requirement cost money?", a: "A playthrough requirement obliges a multiple of the bonus to be wagered before any of it can be withdrawn, and every one of those wagers meets the game's house edge, so the turnover has an expected cost. A 200% bonus at 60x playthrough can be worth less than a 50% bonus at 20x once that cost is priced, which is what the calculator on this page works out." },
  { q: "Which coin should I use?", a: "A stablecoin if the balance will sit for a while, because USDT and USDC hold their value between the deposit and the withdrawal. Litecoin, XRP, TRON or Solana if you move money often, because they settle in minutes for cents. Bitcoin is accepted everywhere and is the slowest and priciest of the common options." },
  { q: "Which crypto casinos do not require KYC?", a: "Some venues take no identity documents at sign-up and ask only above a withdrawal threshold; others ask for nothing at all. The policy is the operator's choice and it changes without notice, which is why each row here records the threshold and the date the terms were read. A venue advertising no KYC can still request documents on a large withdrawal." },
  { q: "How is this page ranked?", a: "By advertised welcome-bonus size, dollar caps first. That is a rule about advertising and not about which venue is safer or cheaper to clear. The Evidence column is separate: it counts how much of a venue we have read off its own terms, and it never moves a row. Venues without a wordmark are not listed at all." },
  { q: "Does Harvest get paid?", a: "Yes, potentially. Harvest may earn a commission if you register through a link on this page. That payment does not change the sort order, which is fixed to the advertised bonus size by the rule printed above the table, and it does not change the Evidence column, which counts terms we have read. No venue has paid for a position here." },
  { q: "What is a good wagering requirement?", a: "Twenty times or under is generous and clearable. Thirty-five to forty is the industry norm. Sixty and above asks for turnover that will usually cost more than the bonus is worth, and the offers advertising the largest headline figures are the ones most likely to sit up there." },
  { q: "What does provably fair mean?", a: "A scheme where the casino commits to a hashed server seed before a round, combines it with a seed you control, and publishes both afterwards so the outcome can be recomputed. It proves the result was not changed after the bet was placed. It does not remove the house edge, and it says nothing about whether the operator will pay a withdrawal." },
  { q: "How fast are crypto casino withdrawals?", a: "Faster than bank rails when nothing is flagged, because payment is an onchain transfer, not a card refund. The variable is not the chain but the operator: whether a withdrawal is auto-approved or queued for manual review, and at what size that review starts." },
  { q: "What happens if I send crypto on the wrong network?", a: "The funds are usually gone. USDT exists as a separate token on Ethereum, Tron, BSC, Solana and Polygon, and sending the Ethereum version to a Tron address puts it somewhere neither you nor the casino can reach. Check the network on both sides before confirming, every time." },
  { q: "Can I win real money at a crypto casino?", a: "Yes, and the expected result of continued play is still a loss, because every game carries a house edge. Wins are paid to your wallet in the coin you played with." },
  { q: "Do I pay tax on crypto gambling winnings?", a: "That depends on your country, and in the United States gambling winnings are taxable income whatever they are paid in. Disposing of the coin afterwards can be a second taxable event. Ask an accountant who knows your jurisdiction." },
  { q: "Are crypto casinos safe?", a: "The blockchain part is sound: transfers settle and cannot be reversed by a third party. The operator is where the risk sits. An offshore licence carries far less consumer protection than a state regulator, there is no deposit protection, and an irreversible transfer is irreversible in both directions." },
  { q: "What is RTP?", a: "Return to player, the share of total stakes a game pays back over a very long run. A 96% slot keeps four cents of every dollar wagered on average. Provably fair originals often publish 98% or better, which is why bonus terms tend to bar them." },
];


/* ---- the two venues at the top, reviewed ----------------------------- */

export interface VenueReview {
  slug: string;
  /** Sits under the venue name in the card head. */
  operator: string;
  /** One line under the badges, before the first subhead. */
  standfirst: string;
  /**
   * Blocks under their own h3.
   *
   * The headings are the questions people type, worded the way they type
   * them. A reader who wants one answer can find it without reading the
   * other three, which is the whole difference between this and the wall of
   * paragraphs it replaces.
   */
  sections: { h: string; body: string }[];
  /** The caveats, as labelled bullets. Rendered through NamedList. */
  keepInMind: { name: string; body: string }[];
  /**
   * The strip at the top of the card, before any of the selling.
   *
   * {CHECKED} is replaced at render with the live coverage count, so a card
   * can never claim more or less reading than the row beside it.
   */
  caveat: string;
  facts: { label: string; value: string }[];
  sources: { label: string; url: string }[];
}

/**
 * The facts grid for a review card.
 *
 * Static rows come off the review; the turnover row is computed from the
 * venue record so it cannot disagree with the turnover table further down
 * the page. A venue with no single playthrough figure gets no turnover row
 * instead of a made-up one.
 */
export function reviewFacts(
  review: VenueReview,
  casino: Casino | undefined,
): { label: string; value: string }[] {
  const rows = [...review.facts];
  const t = casino ? turnoverUsd(casino) : null;
  if (t != null) {
    rows.push({ label: "Turnover on the full cap", value: money(t) });
  }
  return rows;
}

/**
 * Lucky Rollers, first by advertised bonus.
 *
 * The clearest published terms on this page sitting behind an operator
 * nobody can name. The precise-looking complaint statistics circulating for
 * this brand come from an affiliate site and trace to no primary source, so
 * they are not printed here.
 */
export const LUCKY_ROLLERS_REVIEW: VenueReview = {
  slug: "lucky-rollers",
  operator: "Operator not published",
  standfirst:
    "First by advertised bonus, and the highest evidence score on the page.",
  caveat:
    "{CHECKED} fields checked, and the offer itself is the best documented here. What is missing is the operator: no company and no licence number, so there is nobody to complain to. Provably fair is unread.",
  sections: [
    {
      h: "Is Lucky Rollers legit?",
      body: "We cannot tell you who runs it. No operating company and no licence number turn up anywhere we can check, so there is no regulator to appeal to and no company to name in a complaint. The odd part is that the terms themselves are unusually plain, so the missing operator looks less like sloppiness and more like a choice.",
    },
    {
      h: "The biggest bonus for newcomers",
      body: "100% up to 30,000 USDT, 100 free spins and a free bet. The 30,000 is a ceiling reached across deposits and not one match, and the playthrough is 40x. Cleared against the full cap that is $1.2M of wagering, the figure in the table below, and the reason a large headline is not the same thing as a good offer.",
    },
    {
      h: "What the terms actually say",
      body: "Thirteen coins in and out, around 6,000 titles, 5 USDT to open, payouts described as instant, no identity documents at standard withdrawal levels. Weekly cashback lands on a Monday with no playthrough attached, which is rarer than it sounds. This is the most we have been able to read off any venue on the page.",
    },
  ],
  keepInMind: [
    {
      name: "Jurisdiction",
      body: "Unknown. Searching turns up an affiliate site quoting a licence number, an operating company and complaint statistics to one decimal place, none of which trace to a primary source. Treat precise numbers with no source as marketing.",
    },
    { name: "Freshness", body: "No launch date published, so there is no way to weigh how long the payout record runs." },
    {
      name: "Reputation",
      body: "No complaint file we could find under this name, and the name collides with LuckyRolls, Lucky Casino and Lucky Creek, so most of what a search returns is about somebody else.",
    },
    {
      name: "The no-KYC promise",
      body: "Advertised at standard withdrawal levels, and the same caveat applies as everywhere: it is the usual case, not a guarantee.",
    },
  ],
  facts: [
    { label: "Operator", value: "Not published" },
    { label: "Licence", value: "Not published" },
    { label: "Live since", value: "Not published" },
    { label: "Welcome bonus", value: "100% up to 30,000 USDT, 100 free spins and a free bet" },
    { label: "Wagering", value: "40x" },
    { label: "Minimum deposit", value: "5 USDT" },
    { label: "Coins", value: "13, including BTC, ETH, USDT, USDC, XRP and SOL" },
    { label: "Games", value: "Around 6,000" },
    { label: "Withdrawal speed", value: "Instant, per its own terms. Not checked" },
    { label: "Provably fair", value: "Not checked" },
  ],
  sources: [
    { label: "Venue terms and conditions", url: "https://luckyrollers.io/terms-and-conditions" },
    { label: "AskGamblers complaint search", url: "https://www.askgamblers.com/online-casinos/complaints" },
  ],
};

export const VENUE_REVIEWS: VenueReview[] = [LUCKY_ROLLERS_REVIEW];
