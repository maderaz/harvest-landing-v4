import type { Metadata } from "next";
import { isRanked, loadCasinos } from "@/lib/crypto-casinos-data";
import { hasLogo } from "@/lib/casino-logos";
import { OFFERS } from "@/lib/crypto-casinos-copy";
import { CasinosPanel, type CasinoLink } from "./casinos-panel";

export const metadata: Metadata = {
  title: "Crypto Casinos · Control Room",
  robots: { index: false, follow: false },
};

/** The registrable host, for the "is this a plain domain" column. */
function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Whether the outbound URL carries anything that could attribute the click.
 *
 * dealStatus is the editorial answer and this is the mechanical one. They
 * should agree, and the panel prints both so the day they stop agreeing is
 * visible: a link marked live whose URL is a bare domain earns nothing, and a
 * link still marked pending that has picked up a token is being paid for
 * without the row saying so.
 */
function looksAttributed(url: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    // A query string, as betplay.io?ref=... and crypto.games?i=... carry, or
    // any path past the root, as bc.game/i-98z2hfixlk-n and the wildpartners
    // host carry. Every pending link on this page is a bare domain with
    // neither, which is exactly what makes it worth nothing.
    return u.search.length > 1 || u.pathname.replace(/\/+$/, "") !== "";
  } catch {
    return false;
  }
}

export default function CasinosControlRoomPage() {
  const all = loadCasinos().casinos;
  // The same ranking the public page renders, in the same order, so a rank in
  // the click data lines up with a row here.
  const ranked = all.filter(isRanked);

  /*
   * Signed deals the page does not carry.
   *
   * isRanked wants a wordmark and a link. A venue with a live affiliate URL
   * and no committed wordmark is therefore invisible to every surface here,
   * which is the one case where counting only ranked rows under-reports the
   * business: those links can be paid for and are earning nothing, not
   * because a deal is missing but because a PNG is.
   */
  const offPage: CasinoLink[] = all
    .filter((c) => c.dealStatus === "live" && !isRanked(c) && c.url)
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      rank: 0,
      url: c.url as string,
      host: hostOf(c.url),
      deal: "affiliate" as const,
      stage: "live" as const,
      dealNote: c.dealNote ?? null,
      tokenInUrl: looksAttributed(c.url),
      offer: null,
      reason: hasLogo(c.slug) ? "no link on file" : "no wordmark committed",
    }));
  const links: CasinoLink[] = ranked.map((c, i) => ({
    slug: c.slug,
    name: c.name,
    rank: i + 1,
    url: c.url ?? "",
    host: hostOf(c.url),
    deal: c.dealStatus === "live" ? "affiliate" : "plain",
    // Three ways to not be attributed, and they need different work: an
    // application moving, one that has stopped, or a venue with no programme.
    stage:
      c.dealStatus === "live"
        ? "live"
        : c.dealStatus === "stuck"
          ? "stuck"
          : c.dealStatus === "none"
            ? "none"
            : "in-progress",
    dealNote: c.dealNote ?? null,
    tokenInUrl: looksAttributed(c.url),
    offer: OFFERS[c.slug]?.headline ?? null,
  }));
  return <CasinosPanel links={links} offPage={offPage} />;
}
