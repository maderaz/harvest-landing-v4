// /crypto-casinos data: types, loader and the published ranking score.
//
// Types, the score and the bonus maths. No filesystem access: both client
// components import this. The reader lives in crypto-casinos-data.ts.
//
// Entries are hand-supplied facts (data/crypto-casinos.json), not a feed.
// Every field is something the venue publishes; nothing is inferred, and a
// row that cannot be verified is left out rather than guessed. Each entry
// carries its own lastChecked date because these terms change without notice.

export type KycPolicy = "none" | "withdrawal" | "always";
export type WithdrawalSpeed =
  | "instant"
  | "under 1 hour"
  | "1-24 hours"
  | "over 24 hours";

export interface CasinoBonus {
  headline: string;
  type: "deposit match" | "no deposit" | "rakeback" | "cashback" | "free spins";
  /** Playthrough multiple. null when the venue does not publish one. */
  wagering: number | null;
  maxBonusUsd: number | null;
}

export interface Casino {
  slug: string;
  name: string;
  url: string;
  established: number | null;
  licence: { authority: string; number: string | null } | null;
  chains: string[];
  kyc: KycPolicy;
  kycNote?: string | null;
  withdrawal: { median: WithdrawalSpeed; note?: string | null };
  provablyFair: boolean;
  bonus: CasinoBonus | null;
  rakeback: string | null;
  games: number | null;
  liveDealer: boolean;
  sportsbook: boolean;
  restricted: string[];
  notes: string | null;
  lastChecked: string;
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
 * The published score, out of 100. Printed on the page in full so a reader
 * can recompute any row.
 *
 * It deliberately does not reward bonus size. A large headline bonus behind a
 * 60x playthrough is worth less than a small one at 20x, and every competing
 * ranking sorts on the headline.
 */
export function casinoScore(c: Casino): number {
  let s = 0;
  if (c.licence) s += c.licence.number ? 25 : 18;
  s += KYC_POINTS[c.kyc] ?? 0;
  s += WITHDRAWAL_POINTS[c.withdrawal.median] ?? 0;
  if (c.provablyFair) s += 15;
  const wr = c.bonus?.wagering ?? null;
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

/** Wagering turnover a bonus requires, and what it costs at a given edge. */
export function wageringMath(bonusUsd: number, wagering: number, houseEdgePct: number) {
  const turnover = bonusUsd * wagering;
  const expectedCost = turnover * (houseEdgePct / 100);
  return { turnover, expectedCost, net: bonusUsd - expectedCost };
}
