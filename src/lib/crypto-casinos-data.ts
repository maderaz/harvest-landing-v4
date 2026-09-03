// Server-only reader for data/crypto-casinos.json. Split from
// lib/crypto-casinos so the client components can import the types and the
// score without pulling node:fs into the browser bundle.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { hasLogo } from "@/lib/casino-logos";
import { capOf, parseBonus, type Casino, type CasinoData } from "@/lib/crypto-casinos";

/**
 * Whether a venue appears in the ranking.
 *
 * Two halves. A wordmark, because a column of logos with one row of bare text
 * reads as a mistake. And a link, because the loudest control on the page is
 * Play now, and a ranked row that cannot be acted on is a dead end wearing a
 * position it did not earn.
 *
 * Both are recoverable: a venue returns the day its missing half arrives.
 */
export function isRanked(c: Casino): boolean {
  return hasLogo(c.slug) && Boolean(c.url);
}

export function loadCasinos(): CasinoData {
  try {
    const f = join(process.cwd(), "data", "crypto-casinos.json");
    if (!existsSync(f)) return { generatedAt: null, casinos: [] };
    const d = JSON.parse(readFileSync(f, "utf-8")) as CasinoData;
    const casinos = (Array.isArray(d.casinos) ? d.casinos : []).filter(
      (c: Casino) => c && c.slug && c.name,
    );
    // Ordered by the size of the advertised welcome bonus, which is what the
    // page says it is ordered by. Dollar-capped offers first, largest cap
    // down; then offers whose cap is in BTC or ETH or is not stated at all,
    // by match percentage, because converting a crypto cap needs a rate this
    // page has no feed for. Supplied order breaks any remaining tie.
    //
    // capOf, not the parsed headline, so a cap read off the terms decides the
    // position the same way it decides the printed figure. Wild.io advertises
    // a percentage and caps at $1,000 in its terms; sorting on the headline
    // put it fifteen places below where its own terms put it.
    casinos.sort((a, b) => {
      const ua = capOf(a);
      const ub = capOf(b);
      if (ua != null && ub != null) return ub - ua || a.order - b.order;
      if (ua != null) return -1;
      if (ub != null) return 1;
      const pa = parseBonus(a.bonusClaim).pct ?? -1;
      const pb = parseBonus(b.bonusClaim).pct ?? -1;
      return pb - pa || a.order - b.order;
    });
    return { generatedAt: d.generatedAt ?? null, casinos };
  } catch {
    return { generatedAt: null, casinos: [] };
  }
}
