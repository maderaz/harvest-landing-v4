// Calculator tracking, kept as its own channel.
//
// TWO CALCULATORS, THREE SURFACES, ONE TABLE. The percentile calculator on
// /xrp-rich-list, and the XRP staking calculator on /report/xrp-yield-ranking
// and again behind the switch on /xrp-rich-list. Same events, same columns,
// and every row records `source_page`, so the control room tells them apart
// by scoping on it rather than by reading three tables.
//
// On the staking calculator `tier` carries the selected product's venue slug
// rather than a percentile band. A tool embedded off its own page overrides
// `source_page`; see `sourcePage` below.
//
// Its own table, not a column on an existing one: `outbound_clicks` is the
// visit -> app funnel and `report_outbound_clicks` is the report -> venue
// funnel, and a calculator interaction is neither.
//
// Four events:
//   - "switch"  flipped the calculator switch on /xrp-rich-list
//   - "start"   pressed calculate with an amount typed
//   - "result"  an answer was shown
//   - "cta"     clicked the box under the result
//
// start -> result is the completion rate, result -> cta the click-through,
// and switch -> start says whether a flip leads anywhere. A visitor who
// flips and leaves produces nothing else at all, which is why the flip needs
// its own event.
//
// THE BALANCE IS NEVER SENT. The lookup runs in the browser against a
// build-time ladder. What lands is the percentile band, which describes an
// audience rather than a person.
//
// SCHEMA. Create before deploying, or PostgREST rejects every insert and the
// events are silently lost.
//
// The policies are not optional. This project writes with the publishable key
// (the `anon` role, INSERT-only) and reads in the control room with a
// logged-in admin's JWT (`authenticated`) — see the note in lib/supabase.ts.
// Leaving RLS off would make every row world-readable with the key that ships
// in the page; enabling it without policies fails every insert, which looks
// exactly like no traffic. Both halves below.
//
//   create table public.richlist_calculator_events (
//     id           bigint generated always as identity primary key,
//     created_at   timestamptz not null default now(),
//     session_id   text,
//     event        text not null,
//     tier         text,
//     cta          text,
//     target_url   text,
//     source_page  text,
//     source       text,
//     country      text,
//     city         text,
//     device_type  text,
//     os           text,
//     browser      text,
//     user_agent   text,
//     is_bot       boolean
//   );
//
//   alter table public.richlist_calculator_events enable row level security;
//
//   create policy "anon inserts calculator events"
//     on public.richlist_calculator_events
//     for insert to anon with check (true);
//
//   create policy "authenticated reads calculator events"
//     on public.richlist_calculator_events
//     for select to authenticated using (true);
//
//   create index on public.richlist_calculator_events (created_at desc);
//   create index on public.richlist_calculator_events (event);
//
// Best-effort and consent-gated, exactly like the other two trackers: it never
// blocks the interaction, no-ops on /control-room, and no-ops until the table
// exists.

import { supabaseInsert } from "@/lib/supabase";
import {
  deriveSource,
  parseUserAgent,
  readCachedGeo,
  fetchGeo,
  getSessionId,
  getConsent,
} from "@/lib/analytics";

/**
 * Which onward click a "cta" event was.
 *
 * `top-accounts` is retired: it was the second button under a result, sending
 * the reader back up the same page to the table they had already scrolled
 * past, and it went when the two buttons became one box. The value stays in
 * the union because rows carrying it are already in the table and the control
 * room still has to name them.
 *
 * `earn-on-xrp` is the surviving one. The box that replaced the buttons points
 * at the same `#bridge` anchor the old button did, so it keeps the same value
 * and the click-through series does not restart.
 *
 * `see-ranking` belongs to the staking calculator on the XRP yield report: the
 * link from a result down to the ranking table. It is a different page and a
 * different destination, so it gets its own value rather than borrowing one.
 */
export type CalculatorCta = "top-accounts" | "earn-on-xrp" | "see-ranking";

export interface RichListCalculatorEvent {
  event: "switch" | "start" | "result" | "cta";
  /**
   * What the answer was: a percentile band on the rich list calculator, the
   * product's venue slug on the staking calculator, and on "switch" the tool
   * switched TO, so a flip and a flip back are separable.
   */
  tier?: string | null;
  /** Which onward click. Only on "cta". */
  cta?: CalculatorCta | null;
  targetUrl?: string | null;
  /**
   * `source_page` override for a tool embedded off its own page. The staking
   * calculator behind the switch on /xrp-rich-list reports
   * "/xrp-rich-list#staking-calculator" so its events stay out of the rich
   * list calculator's completion rate.
   */
  sourcePage?: string;
}

/**
 * The percentile band a result gets recorded as. Bands, not the percentage:
 * "top 0.8431%" with a timestamp and a session id describes one wallet.
 */
export function calculatorTier(topPct: number): string {
  if (!Number.isFinite(topPct)) return "unknown";
  if (topPct <= 0.1) return "top 0.1%";
  if (topPct <= 1) return "top 1%";
  if (topPct <= 5) return "top 5%";
  if (topPct <= 10) return "top 10%";
  if (topPct <= 25) return "top 25%";
  if (topPct <= 50) return "top 50%";
  return "bottom 50%";
}

export function trackCalculator(e: RichListCalculatorEvent): void {
  try {
    if (typeof window === "undefined") return;
    if (window.location.pathname.startsWith("/control-room")) return;
    if (getConsent() !== "accepted") return;

    // Synchronous read, then warm the cache for the next event. Awaiting a geo
    // lookup here would put a network round trip in front of a button press.
    const geo = readCachedGeo();
    void fetchGeo();
    const ua = parseUserAgent(navigator.userAgent);

    void supabaseInsert("richlist_calculator_events", {
      session_id: getSessionId(),
      event: e.event,
      tier: e.tier ?? null,
      cta: e.cta ?? null,
      target_url: e.targetUrl ?? null,
      source_page: e.sourcePage ?? window.location.pathname,
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
