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

/** A venue is scoreable once the four load-bearing facts have been read. */
export function isVerified(c: Casino): boolean {
  const v = c.verified;
  return (
    v.kyc != null &&
    v.withdrawal != null &&
    v.provablyFair != null &&
    (v.licence !== undefined)
  );
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

/** Wagering turnover a bonus requires, and what it costs at a given edge. */
export function wageringMath(bonusUsd: number, wagering: number, houseEdgePct: number) {
  const turnover = bonusUsd * wagering;
  const expectedCost = turnover * (houseEdgePct / 100);
  return { turnover, expectedCost, net: bonusUsd - expectedCost };
}
