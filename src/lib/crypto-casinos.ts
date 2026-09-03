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
export type ComplaintRecord =
  | "none-found"
  | "clean"
  | "withdrawal-pattern";

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
  /**
   * The cap the playthrough actually applies to, when it is not the headline
   * cap. A ladder offer advertises a running total across several deposits
   * while its playthrough applies to one leg, so multiplying the headline
   * would invent a turnover figure nobody is ever asked for.
   */
  wageringBasisUsd?: number | null;
  /**
   * What a search of the public complaint boards turned up.
   *
   * null is "not searched" and is a different claim from "searched, nothing
   * there". A new brand with no file is not a clean record, which is why
   * none-found scores nothing rather than scoring well.
   */
  complaints?: ComplaintRecord | null;
  chains: string[] | null;
  games: number | null;
  restricted: string[] | null;
}

export interface Casino {
  slug: string;
  name: string;
  /** Outbound link. Null until supplied; the row renders without a button. */
  url: string | null;
  /**
   * Whether the link above carries our affiliate token yet.
   *
   * "live" means the deal is signed and the URL is the attributed one, which
   * is why the outbound helper must pass it through untouched. "pending"
   * means it is the venue's plain domain while the deal is being set up, and
   * the row will be swapped when the real link arrives.
   */
  dealStatus?: "live" | "pending" | null;
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

/**
 * Evidence first, quality second.
 *
 * The base pays for a fact having been read off the venue's own terms. The
 * modifier then adjusts on what that fact says, and only ever on a field that
 * was actually read, so an unknown can never earn a point. The old formula
 * gave +7 for an unknown playthrough, which is how a venue with three fields
 * read outscored one with four.
 */
const EVIDENCE_POINTS = {
  wagering: 20,
  licenceWithNumber: 15,
  withdrawal: 15,
  kyc: 10,
  chains: 10,
  provablyFair: 10,
  complaints: 10,
} as const;

const WITHDRAWAL_MOD: Record<WithdrawalSpeed, number> = {
  instant: 5,
  "under 1 hour": 0,
  "1-24 hours": 0,
  "over 24 hours": -5,
};

const COMPLAINT_MOD: Record<ComplaintRecord, number> = {
  clean: 0,
  "none-found": 0,
  "withdrawal-pattern": -20,
};

/**
 * The facts the score reads. Coverage is shown per row as "n of 8", so a low
 * score reads as work not yet done instead of as a bad venue.
 */
export const CHECK_FIELDS: (keyof CasinoVerified)[] = [
  "licence",
  "kyc",
  "withdrawal",
  "provablyFair",
  "wagering",
  "chains",
  "games",
  "complaints",
];

export const CHECK_TOTAL = CHECK_FIELDS.length;

export function checkedCount(c: Casino): number {
  return CHECK_FIELDS.filter((f) => c.verified[f] != null).length;
}

/** Below this the row has too little behind it to carry a number at all. */
export const MIN_CHECKED_TO_SCORE = 3;

export function isVerified(c: Casino): boolean {
  return checkedCount(c) >= MIN_CHECKED_TO_SCORE;
}

/**
 * The evidence score, and what it is not.
 *
 * It measures how much of a venue we have actually read, then nudges on what
 * those readings say. It is not a rating of the venue and it never moves a
 * row: the table sorts on the advertised bonus, which is a fact about the
 * advertising. Null below MIN_CHECKED_TO_SCORE, so a row with almost nothing
 * behind it shows a dash instead of a number it has not earned.
 *
 * Bonus size is not scored at all. A large headline behind a 60x playthrough
 * is worth less than a small one at 20x.
 */
export function casinoScore(c: Casino): number | null {
  if (!isVerified(c)) return null;
  const v = c.verified;
  let s = 0;

  // Base: one payment per fact read.
  if (v.wagering != null) s += EVIDENCE_POINTS.wagering;
  if (v.licence?.number) s += EVIDENCE_POINTS.licenceWithNumber;
  if (v.withdrawal) s += EVIDENCE_POINTS.withdrawal;
  if (v.kyc) s += EVIDENCE_POINTS.kyc;
  if (v.chains?.length) s += EVIDENCE_POINTS.chains;
  if (v.provablyFair != null) s += EVIDENCE_POINTS.provablyFair;
  if (v.complaints) s += EVIDENCE_POINTS.complaints;

  // Modifier: only on fields that were read.
  const wr = v.wagering;
  if (wr != null) {
    if (wr <= 20) s += 10;
    else if (wr <= 40) s += 5;
    else if (wr > 50) s -= 5;
  }
  if (v.withdrawal) s += WITHDRAWAL_MOD[v.withdrawal] ?? 0;
  if (v.complaints) s += COMPLAINT_MOD[v.complaints] ?? 0;

  // Clamped to a hundred. The parts can add to 105, and a score out of 105
  // is a number that invites a question the column cannot answer.
  return Math.min(100, Math.max(0, Math.round(s)));
}

/** What the column is out of, for the sentence above the table. */
export const EVIDENCE_MAX = 100;

export const COMPLAINT_LABEL: Record<ComplaintRecord, string> = {
  "none-found": "Searched, no file found",
  clean: "File read, nothing outstanding",
  "withdrawal-pattern": "Withdrawal complaints on record",
};

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
  const wr = c.verified.wagering;
  // Zero is a real answer and the best one on the page: a bonus with no
  // playthrough obliges nothing, so it belongs in the table rather than
  // filtered out of it.
  if (wr == null || wr < 0) return null;
  // The basis, where the playthrough applies to something smaller than the
  // headline cap. Otherwise the cap itself.
  const base = c.verified.wageringBasisUsd ?? capOf(c);
  if (base == null) return null;
  return base * wr;
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
