export function formatTVL(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

// Dust floor, not just exact zero. A share-price delta that has not moved
// yields a rate like 4e-13, which is arithmetically positive but renders
// "0.00%" - a table cell that asserts "this pays zero" when what we
// actually know is "there is no measurable rate here". Anything below
// 0.005 (i.e. rounds to under 0.01%) collapses to the same "-" placeholder
// zero already used. 0.005 is the same dust cutoff autopilot-sections.ts
// and vault-commentary.tsx use to suppress dust APY prose, so the table
// and the prose agree on what counts as no-signal.
export const APY_DUST_FLOOR = 0.005;

export function formatAPY(value: number): string {
  if (!(value >= APY_DUST_FLOOR)) return "-";
  return `${value.toFixed(2)}%`;
}

// Prose variant. "-" is a table placeholder and reads as broken mid-sentence
// ("APYs run from - to 1.84%"), so in running text a dust rate is spelled out
// as the bound it actually is. Use this anywhere the value lands inside a
// sentence rather than in a stat cell; cohort minimums are the common case,
// since one dust vault drags the floor of an otherwise healthy cohort.
export function formatAPYProse(value: number): string {
  if (!(value >= APY_DUST_FLOOR)) return "under 0.01%";
  return `${value.toFixed(2)}%`;
}

const KNOWN_CHAINS = ["Ethereum", "Polygon", "Arbitrum", "Base", "zkSync", "HyperEVM"];

export function stripChainSuffix(category: string, chain?: string): string {
  if (!category) return category;
  const targets = chain ? [chain, ...KNOWN_CHAINS] : KNOWN_CHAINS;
  for (const c of targets) {
    const suffix = ` - ${c}`;
    if (category.endsWith(suffix)) return category.slice(0, -suffix.length);
  }
  return category;
}