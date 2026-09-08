// Usage of the bonus calculator on /best-crypto-casino-bonus.
//
// Its own table, `casino_calculator_events`, for the same reason
// richlist_calculator_events is separate from the funnels: a tool being used
// is not a visit and not an outbound click, and folding it into either would
// move a number somebody reads for a different question.
//
// Two events, which is the whole funnel worth having here:
//
//   "view"       the calculator rendered, once per page load
//   "calculate"  the reader pressed the button
//
// The third step, leaving for the casino, is already recorded: the Play Now
// button inside the result is an OutboundLink, and its venue_ref says the
// click came from the calculator. Emitting it twice would let the two counts
// drift.
//
// WHAT IS NOT RECORDED: the amount typed. A budget is a fact about a person's
// money, and a column of them beside a session id and a timestamp is a
// different kind of data from "somebody used the calculator". The venue slug
// goes in, because which offers people price is a question about the ranking.
//
// SCHEMA NOTE. The table has to exist before any of this lands. The SQL is
// supabase/casino_calculator_events.sql, kept as a file so it can be run
// as-is; it also sets the row-level security every other analytics table
// here uses, anon inserts and authenticated reads.
//
// Until the table exists the insert fails silently and the control room
// section says so by name, which is how the other trackers behave.

import { supabaseInsert } from "@/lib/supabase";
import {
  deriveSource,
  parseUserAgent,
  readCachedGeo,
  fetchGeo,
  getSessionId,
  getConsent,
} from "@/lib/analytics";

export interface CasinoCalculatorEvent {
  event: "view" | "calculate";
  /** The offer selected when the event fired. */
  venue: string | null;
}

export function trackCasinoCalculator(e: CasinoCalculatorEvent): void {
  try {
    if (typeof window === "undefined") return;
    if (window.location.pathname.startsWith("/control-room")) return;
    if (getConsent() !== "accepted") return;

    // Synchronous read, then warm the cache for the next event. Awaiting a geo
    // lookup here would put a network round trip in front of a button press.
    const geo = readCachedGeo();
    void fetchGeo();
    const ua = parseUserAgent(navigator.userAgent);

    void supabaseInsert("casino_calculator_events", {
      session_id: getSessionId(),
      event: e.event,
      venue: e.venue,
      source_page: window.location.pathname,
      source: deriveSource(document.referrer || ""),
      country: geo.country ?? null,
      city: geo.city ?? null,
      device_type: ua.device_type,
      os: ua.os,
      browser: ua.browser,
      user_agent: navigator.userAgent,
      is_bot: ua.is_bot,
    });
  } catch {
    // analytics is best-effort; never break the calculator.
  }
}
