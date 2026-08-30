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

/* ---- how many venues the ranking holds ------------------------------- */

/**
 * The ranking length, and the number in the title.
 *
 * It is the size of the wordmark set in lib/casino-logos, because a venue
 * without a logo is not listed. Adding a file there moves this and the H1,
 * the table and the TOC follow it.
 */
export const RANK_COUNT = Object.keys(CASINO_LOGOS).length;

/** "TOP19", as the title, the H1 and the nav all say it. */
export const RANK_LABEL = `TOP${RANK_COUNT}`;

const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

/** The count spelled out, for prose. Falls back to digits past twenty. */
export const rankWord = (n: number = RANK_COUNT) => WORDS[n] ?? String(n);

/* ---- derived from the venue data ------------------------------------- */

export interface TurnoverRow {
  slug: string;
  name: string;
  cap: number;
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

export const FAQS: { q: string; a: string }[] = [
  { q: "What is a crypto casino?", a: "An online casino that takes wagers in cryptocurrency, not in bank-processed money. Balances are funded by an onchain transfer and withdrawals are paid back to a wallet address. The games are the same ones a currency casino runs; what changes is the payment rail, and with it the speed of a withdrawal and how much identity checking sits in front of it." },
  { q: "Are crypto casinos legal?", a: "Crypto casino legality depends on where you live, not on the payment method. Online gambling is licensed in some jurisdictions, restricted to state operators in others, and prohibited in several. Most crypto casinos hold an offshore licence and block a list of countries at sign-up. Check the law where you live before you play, and check that list before you register." },
  { q: "Are crypto casinos legal in the United States?", a: "No federal law stops a player from using one. Seven states run regulated online casinos, and none of those operators takes cryptocurrency, so crypto play means an offshore site outside state regulation. Washington State criminalises taking part in online gambling. Enforcement elsewhere has focused on operators and not on players, and that is a pattern, not a protection." },
  { q: "What does provably fair mean?", a: "A scheme where the casino commits to a hashed server seed before a round, combines it with a seed you control, and publishes both afterwards so the outcome can be recomputed. It proves the result was not changed after the bet was placed. It does not remove the house edge, and it says nothing about whether the operator will pay a withdrawal." },
  { q: "Which crypto casinos do not require KYC?", a: "Some venues take no identity documents at sign-up and ask only above a withdrawal threshold; others ask for nothing at all. The policy is the operator's choice and it changes without notice, which is why each row here records the threshold and the date the terms were read. A venue advertising no KYC can still request documents on a large withdrawal." },
  { q: "Why does a bonus with a high wagering requirement cost money?", a: "A playthrough requirement obliges a multiple of the bonus to be wagered before any of it can be withdrawn, and every one of those wagers meets the game's house edge, so the turnover has an expected cost. A 200% bonus at 60x playthrough can be worth less than a 50% bonus at 20x once that cost is priced, which is what the calculator on this page works out." },
  { q: "What is a good wagering requirement?", a: "Twenty times or under is generous and clearable. Thirty-five to forty is the industry norm. Sixty and above asks for turnover that will usually cost more than the bonus is worth, and the offers advertising the largest headline figures are the ones most likely to sit up there." },
  { q: "How fast are crypto casino withdrawals?", a: "Faster than bank rails when nothing is flagged, because payment is an onchain transfer, not a card refund. The variable is not the chain but the operator: whether a withdrawal is auto-approved or queued for manual review, and at what size that review starts." },
  { q: "Which coin should I use?", a: "A stablecoin if the balance will sit for a while, because USDT and USDC hold their value between the deposit and the withdrawal. Litecoin, XRP, TRON or Solana if you move money often, because they settle in minutes for cents. Bitcoin is accepted everywhere and is the slowest and priciest of the common options." },
  { q: "What happens if I send crypto on the wrong network?", a: "The funds are usually gone. USDT exists as a separate token on Ethereum, Tron, BSC, Solana and Polygon, and sending the Ethereum version to a Tron address puts it somewhere neither you nor the casino can reach. Check the network on both sides before confirming, every time." },
  { q: "Can I win real money at a crypto casino?", a: "Yes, and the expected result of continued play is still a loss, because every game carries a house edge. Wins are paid to your wallet in the coin you played with." },
  { q: "Do I pay tax on crypto gambling winnings?", a: "That depends on your country, and in the United States gambling winnings are taxable income whatever they are paid in. Disposing of the coin afterwards can be a second taxable event. Ask an accountant who knows your jurisdiction." },
  { q: "Are crypto casinos safe?", a: "The blockchain part is sound: transfers settle and cannot be reversed by a third party. The operator is where the risk sits. An offshore licence carries far less consumer protection than a state regulator, there is no deposit protection, and an irreversible transfer is irreversible in both directions." },
  { q: "What is RTP?", a: "Return to player, the share of total stakes a game pays back over a very long run. A 96% slot keeps four cents of every dollar wagered on average. Provably fair originals often publish 98% or better, which is why bonus terms tend to bar them." },
];

/* ---- the venue at number one ----------------------------------------- */

export interface VenueReview {
  slug: string;
  operator: string;
  /** Standing under the badge row, one line. */
  standfirst: string;
  /** Body paragraphs, in order. */
  blurb: string[];
  facts: { label: string; value: string }[];
  /** Where each claim above came from, linked under the card. */
  sources: { label: string; url: string }[];
}

/**
 * Casino Crypto, reviewed.
 *
 * It is first in the ranking on the size of its advertised bonus and nothing
 * else, and a page that puts a venue at the top without saying anything about
 * it is doing what every competing list does. Everything below is public
 * record, read on 30 August 2026. Nobody here has played there, and the
 * review does not pretend otherwise: withdrawal speed and provably fair stay
 * unchecked on the row for that reason.
 */
export const CASINO_CRYPTO_REVIEW: VenueReview = {
  slug: "casino-crypto",
  operator: "BMGruppe Ltd",
  standfirst:
    "First on this page because its advertised welcome bonus is the largest. That is a fact about the advertising.",
  blurb: [
    "The headline is 350% up to 35,000 USDT with 777 free spins. Read the offer and it is a ladder, not a match: the percentage and the cap are running totals across the first six deposits. The published legs put 100% up to 15,000 USDT at 40x playthrough on the second deposit, up to 200 free spins on the third, 100% up to 10,000 USDT at 35x on the fourth, and up to 377 free spins at 30x on the fifth. Reaching the number on the banner means depositing six times and clearing a different requirement on each one. Sports betting and mini games do not count toward any of it.",
    "The operator is BMGruppe Ltd, registered in Anjouan under company number 00005056, holding licence ALSI-202510020-F11 from the Government of the Autonomous Island of Anjouan in the Union of Comoros. An Anjouan licence is real and it is also the cheapest and quickest one a gambling operator can buy. It is not Malta and it is not the UK Gambling Commission: there is very little dispute machinery behind it, so a player whose withdrawal is refused has no regulator that will meaningfully act. The word licensed is doing less work here than it looks like it is doing.",
    "The site launched in 2026, so it is months old and not years. Searching AskGamblers and Trustpilot turns up no profile for it and no complaint file, and that reads better than it is: a brand this new has had no time to accumulate one either way. The name itself is a hazard, because the results fill up with crypto-casino.io, Crypto Games.io and Cryptorino instead, and some of those do carry withdrawal complaints. Check the domain character by character before depositing anywhere.",
    "No KYC is the default and it has exceptions, which are written down: verification can be requested on suspected bonus abuse, an anti-money-laundering flag, or a legal request. That is standard wording across the industry. It is also the clause that fires on a large win, so treat no KYC as the usual case and not as a guarantee.",
    "The rest is as advertised and unverified by us. Over 10,000 titles from 96 or more providers, 17 or more coins, BetBack cashback quoted up to 75%, withdrawals described as instant. Published minimum deposits conflict across sources, at $5 in some write-ups and $30 in others, and until the cashier is opened neither figure is worth printing as fact.",
  ],
  facts: [
    { label: "Operator", value: "BMGruppe Ltd, company no. 00005056" },
    { label: "Licence", value: "Anjouan, Union of Comoros, ALSI-202510020-F11" },
    { label: "Live since", value: "2026" },
    { label: "Welcome bonus", value: "350% up to 35,000 USDT and 777 free spins, spread over six deposits" },
    { label: "Wagering", value: "40x on the largest match leg, 30x to 35x on the rest" },
    { label: "Minimum deposit", value: "Sources conflict, $5 or $30. Not confirmed" },
    { label: "KYC", value: "None by default, requested on bonus abuse, AML flags or legal request" },
    { label: "Games", value: "10,000 or more, from 96 or more providers" },
    { label: "Withdrawal speed", value: "Advertised as instant. Not checked" },
    { label: "Provably fair", value: "Not checked" },
  ],
  sources: [
    {
      label: "Cryptopolitan review",
      url: "https://www.cryptopolitan.com/casinocrypto-io-review/",
    },
    {
      label: "Operator terms and conditions",
      url: "https://casinocrypto.io/en/terms-and-conditions",
    },
    {
      label: "AskGamblers complaint search",
      url: "https://www.askgamblers.com/online-casinos/complaints",
    },
  ],
};
