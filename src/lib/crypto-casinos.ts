// /crypto-casinos types, score and bonus maths.
//
// CLAIMS AND VERIFIED FACTS ARE SEPARATE FIELDS, on purpose. What a venue
// advertises ("instant withdrawals", "no KYC") is marketing copy; what it is
// licensed as, and what its terms actually say, is a fact somebody has to go
// and read. Mixing the two would launder the first into the second, and the
// only reason this page exists is that every competing list does exactly
// that.
//
// The score runs on `verified` alone and is null until a venue has been
// checked. No filesystem access here: both client components import this.

export type KycPolicy = "none" | "withdrawal" | "always";
export type WithdrawalSpeed =
  | "instant"
  | "under 1 hour"
  | "1-24 hours"
  | "over 24 hours";

/** Flags parsed from the venue's own bullets. Still claims. */
export interface CasinoClaims {
  noKyc: boolean;
  vpnFriendly: boolean;
  instantWithdrawal: boolean;
  provablyFair: boolean;
  noWagering: boolean;
  rakeback: boolean;
  cashback: boolean;
}

/** Facts read off the venue or its regulator. Null means nobody has looked. */
export interface CasinoVerified {
  licence: { authority: string; number: string | null } | null;
  kyc: KycPolicy | null;
  withdrawal: WithdrawalSpeed | null;
  provablyFair: boolean | null;
  /** Playthrough multiple on the headline bonus. */
  wagering: number | null;
  /**
   * The cap in dollars as the terms state it, where the headline does not.
   * Wild.io advertises "up to 350%" and caps the bonus at $1,000; the parser
   * can only read the headline, so the real figure is recorded here.
   */
  capUsd?: number | null;
  chains: string[] | null;
  games: number | null;
  restricted: string[] | null;
}

export interface Casino {
  slug: string;
  name: string;
  /** Outbound link. Null until supplied; the row renders without a button. */
  url: string | null;
  /** Position in the supplied list. Commercial, and labelled as such. */
  order: number;
  bonusClaim: string | null;
  claims: string[];
  claimed: CasinoClaims;
  verified: CasinoVerified;
  /** As published, in the venue's own unit. Free text because they all differ. */
  minDeposit?: string | null;
  /** The clause from the bonus terms that a reader would want quoted. */
  termsNote?: string | null;
  lastChecked: string | null;
  notes?: string | null;
}

export interface CasinoData {
  generatedAt: string | null;
  casinos: Casino[];
}

const KYC_POINTS: Record<KycPolicy, number> = {
  none: 20,
  withdrawal: 12,
  always: 4,
};

const WITHDRAWAL_POINTS: Record<WithdrawalSpeed, number> = {
  instant: 25,
  "under 1 hour": 20,
  "1-24 hours": 12,
  "over 24 hours": 4,
};

/**
 * The seven facts the score reads. Coverage is shown per row as "n of 7", so a
 * low score reads as work not yet done instead of as a bad venue.
 */
export const CHECK_FIELDS: (keyof CasinoVerified)[] = [
  "licence",
  "kyc",
  "withdrawal",
  "provablyFair",
  "wagering",
  "chains",
  "games",
];

export function checkedCount(c: Casino): number {
  return CHECK_FIELDS.filter((f) => c.verified[f] != null).length;
}

/** Below this the row has too little behind it to carry a number at all. */
export const MIN_CHECKED_TO_SCORE = 3;

export function isVerified(c: Casino): boolean {
  return checkedCount(c) >= MIN_CHECKED_TO_SCORE;
}

/**
 * The published score, out of 100, from verified facts only. Null when the
 * venue has not been checked, so an unchecked row can never be presented as
 * having earned a position.
 *
 * Bonus size is not scored. A headline behind a 60x playthrough is worth less
 * than a small one at 20x, and sorting on the headline is what every
 * competing list does.
 */
export function casinoScore(c: Casino): number | null {
  if (!isVerified(c)) return null;
  const v = c.verified;
  // Absolute, out of 100. An unread field scores nothing, which is why the
  // coverage count sits beside the number wherever it is shown.
  let s = 0;
  if (v.licence) s += v.licence.number ? 25 : 18;
  if (v.kyc) s += KYC_POINTS[v.kyc] ?? 0;
  if (v.withdrawal) s += WITHDRAWAL_POINTS[v.withdrawal] ?? 0;
  if (v.provablyFair) s += 15;
  const wr = v.wagering;
  if (wr == null) s += 7;
  else if (wr <= 20) s += 15;
  else if (wr <= 35) s += 11;
  else if (wr <= 50) s += 6;
  return Math.round(s);
}

export const KYC_LABEL: Record<KycPolicy, string> = {
  none: "No KYC",
  withdrawal: "On withdrawal",
  always: "At sign-up",
};

/** Short labels for the claim chips. */
export const CLAIM_LABELS: { key: keyof CasinoClaims; label: string }[] = [
  { key: "noKyc", label: "No KYC" },
  { key: "vpnFriendly", label: "VPN friendly" },
  { key: "instantWithdrawal", label: "Instant withdrawal" },
  { key: "noWagering", label: "No wagering" },
  { key: "provablyFair", label: "Provably fair" },
  { key: "rakeback", label: "Rakeback" },
  { key: "cashback", label: "Cashback" },
];

/**
 * What the advertised welcome bonus is worth, parsed from the venue's own
 * headline. Still a claim: this reads the marketing, it does not check it.
 *
 * The cap is paired with the percentage that introduces it rather than taken
 * as the first figure in the string, because these headlines bundle offers.
 * "$750k World Cup Race + 10% Weekly Cashback + 100% Bonus Up To 1 BTC" has a
 * prize pool, a cashback rate and a welcome bonus in one line, and the first
 * number is the one thing that is not the welcome bonus.
 */
export interface ParsedBonus {
  pct: number | null;
  cap: number | null;
  unit: "USD" | "EUR" | "BTC" | "ETH" | null;
}

const AMOUNT =
  "(?:\\$\\s*)?(\\d[\\d,]*(?:\\.\\d+)?)\\s*(k|K)?\\s*(USDT|USD|EUR|BTC|ETH)?";

type Amount = { cap: number; unit: NonNullable<ParsedBonus["unit"]> };

function readAmount(num: string, k?: string, unit?: string): Amount | null {
  const n = Number(num.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const mult = k ? 1000 : 1;
  const u = (unit ?? "USD").toUpperCase();
  const norm =
    u === "USDT" || u === "USD" ? "USD" : u === "EUR" ? "EUR" : u === "BTC" ? "BTC" : u === "ETH" ? "ETH" : null;
  if (!norm) return null;
  return { cap: n * mult, unit: norm };
}

export function parseBonus(headline: string | null): ParsedBonus {
  const empty: ParsedBonus = { pct: null, cap: null, unit: null };
  if (!headline) return empty;
  const t = headline.replace(/\u00a0/g, " ");

  // Every "N% ... up to <amount>" pair, keeping the one with the largest N:
  // a headline that bundles a 10% cashback with a 100% match is advertising
  // the match as its welcome bonus.
  const paired = new RegExp(
    `(\\d+(?:\\.\\d+)?)\\s*%[^%]{0,60}?up\\s*to\\s*${AMOUNT}`,
    "gi",
  );
  let best: (Amount & { pct: number }) | null = null;
  for (const m of t.matchAll(paired)) {
    const amt = readAmount(m[2], m[3], m[4]);
    if (!amt) continue;
    const pct = Number(m[1]);
    if (!best || pct > best.pct) best = { pct, cap: amt.cap, unit: amt.unit };
  }
  if (best) return { pct: best.pct, cap: best.cap, unit: best.unit };

  // No pair: take the headline percentage and, separately, a standalone
  // amount ("20,000 USDT Welcome Bonus + 15% Cashback").
  //
  // A bare number in one of these headlines is almost never the cap. It is a
  // percentage, a free-spin count or a deposit count, and taking the first one
  // put Wild.io in the ranking at $350 for "Up to 350%", Jack at $100 for
  // "100 Free Spins" and Betgoat at $380. So the fallback only accepts a
  // figure written as money: a dollar sign, a stated currency, a thousands
  // separator or a k suffix. Anything else leaves the cap null and the venue
  // is ordered on its match percentage instead.
  const pctAll = [...t.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  const pct = pctAll.length ? Math.max(...pctAll) : null;
  const stand = new RegExp(`(?:up\\s*to\\s*)?${AMOUNT}\\b`, "gi");
  let amt: Amount | null = null;
  for (const m of t.matchAll(stand)) {
    const looksLikeMoney =
      m[0].includes("$") || m[2] != null || m[3] != null || m[1].includes(",");
    if (!looksLikeMoney) continue;
    amt = readAmount(m[1], m[2], m[3]);
    if (amt) break;
  }
  return { pct, cap: amt?.cap ?? null, unit: amt?.unit ?? null };
}

/**
 * The advertised cap in dollars, for ordering. USDT is treated as a dollar
 * and EUR as close enough to one; both are stated on the page. BTC and ETH
 * need a rate, and there is no price feed behind this page, so they return
 * null and those rows are ordered on their percentage instead rather than on
 * a number nobody checked.
 */
export function bonusUsd(p: ParsedBonus): number | null {
  if (p.cap == null) return null;
  if (p.unit === "USD" || p.unit === "EUR") return p.cap;
  return null;
}

/**
 * What the terms oblige before the bonus can be withdrawn: the cap multiplied
 * by its playthrough. Null unless both are known.
 *
 * This is the figure the competing lists leave out. Two venues advertise
 * $30,000; one asks $1.2M of wagering for it and the other asks $1.8M.
 */
export function turnoverUsd(c: Casino): number | null {
  const cap = capOf(c);
  const wr = c.verified.wagering;
  // Zero is a real answer and the best one on the page: a bonus with no
  // playthrough obliges nothing, so it belongs in the table rather than
  // filtered out of it.
  if (cap == null || wr == null || wr < 0) return null;
  return cap * wr;
}

/** The terms figure where one has been read, and the headline otherwise. */
export function capOf(c: Casino): number | null {
  return c.verified.capUsd ?? bonusUsd(parseBonus(c.bonusClaim));
}

/** Wagering turnover a bonus requires, and what it costs at a given edge. */
export function wageringMath(bonusUsd: number, wagering: number, houseEdgePct: number) {
  const turnover = bonusUsd * wagering;
  const expectedCost = turnover * (houseEdgePct / 100);
  return { turnover, expectedCost, net: bonusUsd - expectedCost };
}
