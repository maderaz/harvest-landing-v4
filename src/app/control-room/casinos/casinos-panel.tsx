"use client";

// Control Room > Crypto Casinos.
//
// One surface for /crypto-casinos, because its two halves are only worth
// reading together. The traffic half comes from frontpage_visits scoped to
// that path; the click half comes from report_outbound_clicks scoped to the
// same source_page. A landing that never reaches a Play Now button and a Play
// Now button nobody lands in front of look identical on either table alone.
//
// The third half is not analytics at all. Sixteen ranked venues carry an
// outbound link and only some of those links are attributed, so every click on
// the rest is traffic sent away for nothing. That figure is the point of this
// page and it sits at the top of it.
//
// Events, as everywhere else in the control room: "open" is a Play Now click
// that raised the leave-site prompt, "confirm" is the "I understand" that
// followed through. Only confirms left the site.

import { useEffect, useMemo, useState } from "react";
import { supabaseSelectAll } from "@/lib/supabase";
import { isBotRow } from "@/lib/bots";
import { CountryFlag } from "@/components/admin/country-flag";
import { FilterHint } from "@/components/admin/filter-hint";
import {
  TimeframeSelector,
  resolveDays,
  type Timeframe,
} from "@/components/admin/timeframe-selector";
import "../../_styles/asset-hub.css";

export const PAGE_PATH = "/best-crypto-casino-bonus";

export interface CasinoLink {
  slug: string;
  name: string;
  rank: number;
  url: string;
  host: string;
  /** What the data says the deal is. */
  deal: "affiliate" | "plain";
  /** The deal's actual state, for the three ways a link can be unattributed. */
  stage: DealStage;
  /** The affiliate network, or what the application is waiting on. */
  dealNote: string | null;
  /** What the URL itself carries. Disagreement with `deal` is a finding. */
  tokenInUrl: boolean;
  offer: string | null;
}

interface Visit {
  created_at: string;
  session_id: string | null;
  source: string | null;
  referrer: string | null;
  country: string | null;
  city: string | null;
  device_type: string | null;
  is_entry_page: boolean | null;
  is_bot: boolean | null;
  user_agent: string | null;
  page_path: string | null;
  screen_width: number | null;
  screen_height: number | null;
  viewport_width: number | null;
  viewport_height: number | null;
}

/** One row of casino_calculator_events. See lib/casino-tracking. */
interface CalcEvent {
  created_at: string;
  session_id: string | null;
  event: string | null;
  venue: string | null;
  country: string | null;
  device_type: string | null;
  user_agent: string | null;
  is_bot: boolean | null;
}

interface Click {
  id: string;
  created_at: string;
  session_id: string;
  event: string | null;
  platform: string | null;
  venue_ref: string | null;
  rank: number | null;
  target_url: string | null;
  source: string | null;
  country: string | null;
  city: string | null;
  device_type: string | null;
  user_agent: string | null;
  is_bot: boolean | null;
}

const VISIT_COLS =
  "created_at,session_id,source,referrer,country,city,device_type,is_entry_page,is_bot,user_agent,page_path,screen_width,screen_height,viewport_width,viewport_height";
const CLICK_COLS =
  "id,created_at,session_id,event,platform,venue_ref,rank,target_url,source,country,city,device_type,user_agent,is_bot";

const CALC_COLS =
  "created_at,session_id,event,venue,country,device_type,user_agent,is_bot";

const RECENT_LIMIT = 150;

/** How the venue_ref on a click describes where it came from. */
const PLACEMENT: Record<string, string> = {
  "crypto-casinos-row-affiliate": "Ranking row, attributed link",
  "crypto-casinos-row-plain": "Ranking row, plain domain",
  "crypto-casinos-review": "Lucky Rollers review",
};

export type DealStage = "live" | "in-progress" | "stuck" | "none";

const STAGE_LABEL: Record<DealStage, string> = {
  live: "Live",
  "in-progress": "In progress",
  stuck: "Stuck",
  none: "No programme",
};

type DealFilter = "all" | "affiliate" | "plain";

const DEAL_OPTIONS: { value: DealFilter; label: string }[] = [
  { value: "all", label: "All links" },
  { value: "affiliate", label: "Attributed" },
  { value: "plain", label: "Plain domain" },
];

let _regionNames: Intl.DisplayNames | null = null;
function countryName(code: string | null): string {
  const iso = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return iso || "Unknown";
  try {
    if (!_regionNames) _regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    return _regionNames.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

const DAY_MS = 86_400_000;
const num = (n: number) => n.toLocaleString("en-US");

export function CasinosPanel({ links }: { links: CasinoLink[] }) {
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [clicks, setClicks] = useState<Click[] | null>(null);
  const [calc, setCalc] = useState<CalcEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const [deal, setDeal] = useState<DealFilter>("all");
  const [showBots, setShowBots] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Both scoped to this page in PostgREST, so the panel never pulls the
        // whole site's analytics to filter it in the browser.
        const [v, c, k] = await Promise.all([
          supabaseSelectAll<Visit>(
            "frontpage_visits",
            `select=${VISIT_COLS}&page_path=eq.${PAGE_PATH}&order=created_at.asc`,
          ),
          supabaseSelectAll<Click>(
            "report_outbound_clicks",
            `select=${CLICK_COLS}&source_page=eq.${PAGE_PATH}&order=created_at.desc`,
          ),
          supabaseSelectAll<CalcEvent>(
            "casino_calculator_events",
            `select=${CALC_COLS}&source_page=eq.${PAGE_PATH}&order=created_at.desc`,
          ),
        ]);
        if (cancelled) return;
        setVisits(v);
        setClicks(c);
        setCalc(k);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dealBySlug = useMemo(() => {
    const m = new Map<string, CasinoLink>();
    for (const l of links) m.set(l.name.toLowerCase(), l);
    return m;
  }, [links]);

  // The window every section reads. Resolved off the oldest row so "all" is a
  // real span and not a guess.
  const oldestMs = useMemo(() => {
    const times = [
      ...(visits ?? []).map((v) => new Date(v.created_at).getTime()),
      ...(clicks ?? []).map((c) => new Date(c.created_at).getTime()),
    ].filter(Number.isFinite);
    return times.length ? Math.min(...times) : null;
  }, [visits, clicks]);
  const days = resolveDays(timeframe, oldestMs);
  const cutoff = Date.now() - days * DAY_MS;

  const inWindow = (iso: string) => new Date(iso).getTime() >= cutoff;

  const scopedVisits = useMemo(
    () =>
      (visits ?? []).filter(
        (v) => inWindow(v.created_at) && (showBots || !isBotRow(v)),
      ),
    [visits, showBots, cutoff],
  );

  const scopedClicks = useMemo(() => {
    const rows = (clicks ?? []).filter(
      (c) => inWindow(c.created_at) && (showBots || !isBotRow(c)),
    );
    if (deal === "all") return rows;
    return rows.filter((c) => dealOf(c, dealBySlug) === deal);
  }, [clicks, showBots, cutoff, deal, dealBySlug]);

  const stats = useMemo(() => {
    const landings = new Set(
      scopedVisits.map((v) => v.session_id).filter(Boolean) as string[],
    );
    const opens = scopedClicks.filter((c) => c.event === "open").length;
    const confirms = scopedClicks.filter((c) => c.event === "confirm").length;
    const clickedSessions = new Set(
      scopedClicks
        .filter((c) => c.event === "confirm")
        .map((c) => c.session_id)
        .filter(Boolean),
    );
    return {
      views: scopedVisits.length,
      landings: landings.size,
      opens,
      confirms,
      clickedSessions: clickedSessions.size,
      // Of the sessions that landed on the page, how many left for a venue.
      // Both halves come from the same window, so the rate is comparable
      // across timeframes.
      ctr:
        landings.size > 0
          ? Math.round((clickedSessions.size / landings.size) * 1000) / 10
          : null,
    };
  }, [scopedVisits, scopedClicks]);

  const scopedCalc = useMemo(
    () =>
      (calc ?? []).filter(
        (e) => inWindow(e.created_at) && (showBots || !isBotRow(e)),
      ),
    [calc, showBots, cutoff],
  );

  const loading = visits === null || clicks === null;

  return (
    <div className="uni-hub-test">
      <header className="uni-hub-hero aq-hero-slim aq-hero-fullwidth">
        <div className="uni-hub-hero-headline">
          <div style={{ width: "100%" }}>
            <h1 className="uni-hub-h1">Crypto Casinos</h1>
            <p className="uni-hub-sub aq-sub-full">
              Everything happening on <code>{PAGE_PATH}</code>: who lands on it,
              which venue links they open, and how much of that traffic goes to
              a link that can pay us. An &ldquo;Opened&rdquo; raised the
              leave-site prompt; a &ldquo;Qualified lead&rdquo; confirmed it and
              actually left. Bots excluded by default.
            </p>
          </div>
        </div>
      </header>

      <div className="lf-filterbar" style={{ marginBottom: 20 }}>
        <span className="lf-filter-grp">
          <div className="aq-timeframe" role="tablist" aria-label="Link type">
            {DEAL_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="tab"
                aria-selected={deal === o.value}
                className={`aq-timeframe-tab${deal === o.value ? " active" : ""}`}
                onClick={() => setDeal(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <FilterHint label="About the link filter">
            <strong>Attributed</strong> links carry an affiliate token, so a
            click on one can be paid for. <strong>Plain domain</strong> links
            are the venue&rsquo;s bare address while the deal is being set up,
            and a click on one earns nothing. The filter narrows the chart, the
            breakdowns and the click table; the coverage card below always shows
            both, because the gap between them is the number worth watching.
          </FilterHint>
        </span>

        <button
          type="button"
          className={`aq-timeframe-tab${showBots ? " active" : ""}`}
          onClick={() => setShowBots((b) => !b)}
        >
          {showBots ? "Bots included" : "Bots excluded"}
        </button>

        <TimeframeSelector value={timeframe} onChange={setTimeframe} />

        <span className="uni-hub-section-meta">
          {num(scopedVisits.length)} views · {num(scopedClicks.length)} clicks ·
          trailing {days} days
        </span>
      </div>

      <div
        className="uni-hub-stats"
        role="group"
        aria-label="Crypto casinos summary"
        style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", marginBottom: 32 }}
      >
        <Stat label="Page views" value={loading ? undefined : stats.views} />
        <Stat label="Sessions landed" value={loading ? undefined : stats.landings} />
        <Stat label="Opened" value={loading ? undefined : stats.opens} />
        <Stat label="Qualified leads" value={loading ? undefined : stats.confirms} />
        <Stat
          label="Session click-through"
          value={loading ? undefined : (stats.ctr ?? undefined)}
          suffix="%"
        />
      </div>

      {error && (
        <div className="uni-hub-empty" style={{ color: "#b91c1c" }}>
          Could not load casino analytics: {error}
        </div>
      )}

      {loading && !error && <div className="uni-hub-empty">Loading…</div>}

      {!loading && (
        <>
          <CoverageSection
            links={links}
            clicks={(clicks ?? []).filter(
              (c) => inWindow(c.created_at) && (showBots || !isBotRow(c)),
            )}
            days={days}
          />
          <TrafficChart
            visits={scopedVisits}
            clicks={scopedClicks}
            days={days}
            timeframe={timeframe}
            onTimeframe={setTimeframe}
          />
          <CalculatorSection
            events={scopedCalc}
            links={links}
            clicks={(clicks ?? []).filter(
              (c) => inWindow(c.created_at) && (showBots || !isBotRow(c)),
            )}
            landings={stats.landings}
            days={days}
          />
          <VenueSection links={links} clicks={scopedClicks} dealFilter={deal} />
          <PlacementSection clicks={scopedClicks} />
          <AudienceSection visits={scopedVisits} clicks={scopedClicks} />
          <RecentSection clicks={scopedClicks} dealBySlug={dealBySlug} />
        </>
      )}
    </div>
  );
}

/**
 * Which side of the deal a click belongs to.
 *
 * The venue_ref recorded at click time is preferred, because it says what the
 * link was when the visitor pressed it. The current data is the fallback for
 * rows tracked before that split existed.
 */
function dealOf(c: Click, bySlug: Map<string, CasinoLink>): "affiliate" | "plain" {
  if (c.venue_ref === "crypto-casinos-row-affiliate") return "affiliate";
  if (c.venue_ref === "crypto-casinos-row-plain") return "plain";
  return bySlug.get((c.platform ?? "").toLowerCase())?.deal ?? "plain";
}

function Stat({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number | undefined;
  suffix?: string;
}) {
  return (
    <div className="uni-hub-stat">
      <div className="uni-hub-stat-label">{label}</div>
      <div className="uni-hub-stat-value">
        {value === undefined ? "—" : `${num(value)}${suffix}`}
      </div>
    </div>
  );
}

/* ---- the coverage summary --------------------------------------------- */

/**
 * The one section that answers a question analytics cannot.
 *
 * Which of the sixteen outbound links can be paid for, which cannot, and what
 * the plain ones cost in the window. The second figure is the whole argument
 * for closing the remaining deals, so it is a sentence and not a cell.
 */
function CoverageSection({
  links,
  clicks,
  days,
}: {
  links: CasinoLink[];
  clicks: Click[];
  days: number;
}) {
  const affiliate = links.filter((l) => l.deal === "affiliate");
  const plain = links.filter((l) => l.deal === "plain");

  // Rows where the editorial flag and the URL disagree. Either direction is
  // worth a look, and neither is visible anywhere else.
  const mismatched = links.filter((l) => (l.deal === "affiliate") !== l.tokenInUrl);

  const confirms = clicks.filter((c) => c.event === "confirm");
  const lost = confirms.filter((c) => c.venue_ref === "crypto-casinos-row-plain").length;
  const earned = confirms.filter(
    (c) => c.venue_ref === "crypto-casinos-row-affiliate",
  ).length;
  const share =
    confirms.length > 0 ? Math.round((earned / confirms.length) * 100) : null;

  return (
    <section className="uni-hub-section" style={{ marginTop: 0 }}>
      <header className="uni-hub-section-head">
        <h2 className="uni-hub-section-title">Link coverage</h2>
        <span className="uni-hub-section-meta">
          which Play Now links can be paid for
        </span>
      </header>

      <div className="aq-chart-card">
        <div className="cr-cas-cov">
          <CovStat
            value={`${affiliate.length} of ${links.length}`}
            label="links carry an affiliate token"
            tone="good"
          />
          <CovStat
            value={String(plain.length)}
            label={
              plain.length === 0
                ? "still point at a plain domain"
                : `still point at a plain domain: ${stageBreakdown(plain)}`
            }
            tone={plain.length > 0 ? "warn" : "good"}
          />
          <CovStat
            value={share == null ? "—" : `${share}%`}
            label={`of click-throughs went to an attributed link, last ${days} days`}
            tone={share != null && share < 50 ? "warn" : "good"}
          />
        </div>

        <p className="cr-cas-note">
          {lost === 0 ? (
            <>
              No click-throughs went to a plain domain in this window. Every
              visitor who left for a venue left through a link that can be
              attributed.
            </>
          ) : (
            <>
              <strong>{num(lost)}</strong> click-through
              {lost === 1 ? "" : "s"} in the last {days} days went to a venue
              whose deal is still pending, against <strong>{num(earned)}</strong>{" "}
              that went to an attributed link. Those {num(lost)} are traffic
              already sent and not paid for.
            </>
          )}
        </p>

        {mismatched.length > 0 && (
          <p className="cr-cas-note cr-cas-warn">
            {mismatched.length} link{mismatched.length === 1 ? "" : "s"} where
            the recorded deal status and the URL disagree:{" "}
            {mismatched
              .map(
                (l) =>
                  `${l.name} (marked ${l.deal === "affiliate" ? "live" : "pending"}, URL ${l.tokenInUrl ? "carries a token" : "is a bare domain"})`,
              )
              .join("; ")}
            . Either the deal closed and the row was not updated, or the row
            says it closed and the link earns nothing.
          </p>
        )}

        <div className="cr-cas-lists">
          <LinkList
            title={`Attributed (${affiliate.length})`}
            links={affiliate}
            empty="No deal is live yet."
          />
          <div>
            <h3 className="cr-cas-listh">Plain domain ({plain.length})</h3>
            {plain.length === 0 ? (
              <p className="cr-cas-note">Every link is attributed.</p>
            ) : (
              (["in-progress", "stuck", "none"] as DealStage[])
                .map((st) => ({ st, rows: plain.filter((l) => l.stage === st) }))
                .filter((g) => g.rows.length > 0)
                .map((g) => (
                  <div key={g.st} className="cr-cas-stage">
                    <h4 className="cr-cas-stageh">
                      {STAGE_LABEL[g.st]} ({g.rows.length})
                    </h4>
                    <ul className="cr-cas-list">
                      {g.rows.map((l) => (
                        <li key={l.slug}>
                          <span className="cr-cas-rank">#{l.rank}</span>
                          <span className="cr-cas-name">{l.name}</span>
                          {l.dealNote && (
                            <span className="cr-cas-dealnote">{l.dealNote}</span>
                          )}
                          <a
                            className="cr-cas-host"
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            title={l.url}
                          >
                            {l.host}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** "8 in progress, 2 stuck, 1 with no programme". */
function stageBreakdown(links: CasinoLink[]): string {
  const parts: string[] = [];
  const n = (st: DealStage) => links.filter((l) => l.stage === st).length;
  if (n("in-progress")) parts.push(`${n("in-progress")} in progress`);
  if (n("stuck")) parts.push(`${n("stuck")} stuck`);
  if (n("none")) parts.push(`${n("none")} with no programme`);
  return parts.join(", ");
}

function CovStat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: "good" | "warn";
}) {
  return (
    <div className="cr-cas-covstat">
      <div className={`cr-cas-covnum${tone === "warn" ? " is-warn" : ""}`}>
        {value}
      </div>
      <div className="cr-cas-covlabel">{label}</div>
    </div>
  );
}

function LinkList({
  title,
  links,
  empty,
}: {
  title: string;
  links: CasinoLink[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="cr-cas-listh">{title}</h3>
      {links.length === 0 ? (
        <p className="cr-cas-note">{empty}</p>
      ) : (
        <ul className="cr-cas-list">
          {links.map((l) => (
            <li key={l.slug}>
              <span className="cr-cas-rank">#{l.rank}</span>
              <span className="cr-cas-name">{l.name}</span>
              <a
                className="cr-cas-host"
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                title={l.url}
              >
                {l.host}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---- the chart --------------------------------------------------------- */

/**
 * Landings and click-throughs on one axis.
 *
 * Two series in one column rather than two charts: the question is what share
 * of a day's traffic left for a venue, and two charts side by side make that a
 * comparison the reader has to do by eye across a gap.
 */
function TrafficChart({
  visits,
  clicks,
  days,
  timeframe,
  onTimeframe,
}: {
  visits: Visit[];
  clicks: Click[];
  days: number;
  timeframe: Timeframe;
  onTimeframe: (t: Timeframe) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const bins = useMemo(() => {
    const out = Array.from({ length: days }, (_, i) => ({
      daysAgo: days - 1 - i,
      views: 0,
      opens: 0,
      confirms: 0,
    }));
    const put = (iso: string, key: "views" | "opens" | "confirms") => {
      const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
      if (d >= 0 && d < days) out[days - 1 - d][key]++;
    };
    for (const v of visits) put(v.created_at, "views");
    for (const c of clicks) {
      if (c.event === "open") put(c.created_at, "opens");
      else if (c.event === "confirm") put(c.created_at, "confirms");
    }
    return out;
  }, [visits, clicks, days]);

  const max = Math.max(1, ...bins.map((b) => Math.max(b.views, b.confirms)));
  const totals = bins.reduce(
    (a, b) => ({
      views: a.views + b.views,
      opens: a.opens + b.opens,
      confirms: a.confirms + b.confirms,
    }),
    { views: 0, opens: 0, confirms: 0 },
  );
  const shown = hovered != null ? bins[hovered] : null;

  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <div className="aq-section-head-left">
          <h2 className="uni-hub-section-title">
            Views and click-throughs, last {days} days
          </h2>
          <span className="uni-hub-section-meta">
            {num(totals.opens)} opened · {num(totals.confirms)} qualified
          </span>
        </div>
        <TimeframeSelector value={timeframe} onChange={onTimeframe} />
      </header>

      <div className="aq-chart-card">
        <div className="aq-chart-bignum">
          {num(shown ? shown.views : totals.views)}
        </div>
        <div className="aq-chart-bignum-label">
          {shown
            ? `page views ${labelForDaysAgo(shown.daysAgo)}, ${num(shown.confirms)} click-through${shown.confirms === 1 ? "" : "s"}`
            : `page views across the trailing ${days} days`}
        </div>

        <div className="cr-cas-legend">
          <span className="cr-cas-key cr-cas-key-views" /> Page views
          <span className="cr-cas-key cr-cas-key-clicks" /> Click-throughs
        </div>

        <div className="aq-chart">
          <div className="aq-chart-bars">
            {bins.map((b, i) => (
              <div
                key={i}
                className="aq-bar-col cr-cas-col"
                title={`${b.views} view${b.views === 1 ? "" : "s"}, ${b.confirms} click-through${b.confirms === 1 ? "" : "s"} (${labelForDaysAgo(b.daysAgo)})`}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <div
                  className="aq-bar cr-cas-bar-views"
                  style={{ height: `${pct(b.views, max)}%` }}
                />
                <div
                  className="aq-bar cr-cas-bar-clicks"
                  style={{ height: `${pct(b.confirms, max)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="aq-chart-axis">
            <span>{days}d ago</span>
            <span>{Math.floor(days / 2)}d ago</span>
            <span>today</span>
          </div>
        </div>
      </div>
    </section>
  );
}

const pct = (v: number, max: number) => Math.max((v / max) * 100, v > 0 ? 4 : 0);

function labelForDaysAgo(d: number): string {
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

/* ---- breakdowns -------------------------------------------------------- */

interface Bar {
  key: string;
  label: string;
  note?: string;
  stage?: DealStage;
  opens: number;
  confirms: number;
  total: number;
}

function BreakdownBars({ rows }: { rows: Bar[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="cr-cas-bars">
      {rows.map((r) => (
        <div key={r.key} className="cr-cas-barrow">
          <div className="cr-cas-barhead">
            <span className="cr-cas-barlabel">
              {r.label}
              {r.stage && (
                <span
                  className={`cr-cas-chip${r.stage !== "live" ? " is-plain" : ""}`}
                >
                  {r.stage === "live" ? "Attributed" : STAGE_LABEL[r.stage]}
                </span>
              )}
              {r.note && <span className="cr-cas-barnote">{r.note}</span>}
            </span>
            <span className="cr-cas-barcounts">
              {num(r.opens)} opened ·{" "}
              <span className="cr-cas-qual">{num(r.confirms)} qualified</span>
            </span>
          </div>
          <div className="cr-cas-bartrack">
            <div
              className={`cr-cas-barfill${r.stage && r.stage !== "live" ? " is-plain" : ""}`}
              style={{ width: `${pct(r.total, max)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}


/* ---- the calculator ---------------------------------------------------- */

/**
 * How many people use the bonus calculator, and which offers they price.
 *
 * Three steps, from three sources that already exist: the calculator's own
 * view and calculate events, and the Play Now clicks whose venue_ref says they
 * came from inside its result. The amount a reader types is never recorded, so
 * there is no distribution of budgets here and there will not be one.
 */
function CalculatorSection({
  events,
  links,
  clicks,
  landings,
  days,
}: {
  events: CalcEvent[];
  links: CasinoLink[];
  clicks: Click[];
  landings: number;
  days: number;
}) {
  const nameBySlug = useMemo(() => {
    const m = new Map<string, CasinoLink>();
    for (const l of links) m.set(l.slug, l);
    return m;
  }, [links]);

  const stats = useMemo(() => {
    const sess = (pred: (e: CalcEvent) => boolean) =>
      new Set(events.filter(pred).map((e) => e.session_id).filter(Boolean)).size;
    const saw = sess((e) => e.event === "view");
    const used = sess((e) => e.event === "calculate");
    const calculates = events.filter((e) => e.event === "calculate").length;
    const left = new Set(
      clicks
        .filter(
          (c) =>
            c.event === "confirm" &&
            (c.venue_ref === "crypto-casinos-calc-affiliate" ||
              c.venue_ref === "crypto-casinos-calc-plain"),
        )
        .map((c) => c.session_id)
        .filter(Boolean),
    ).size;
    return {
      saw,
      used,
      calculates,
      left,
      // Of the sessions that scrolled the calculator into existence, how many
      // pressed the button.
      useRate: saw > 0 ? Math.round((used / saw) * 1000) / 10 : null,
      // And of those, how many went on to the casino from inside the result.
      ctaRate: used > 0 ? Math.round((left / used) * 1000) / 10 : null,
      // Repeat presses per session that used it: a reader comparing offers.
      perUser: used > 0 ? Math.round((calculates / used) * 10) / 10 : null,
      reach: landings > 0 ? Math.round((saw / landings) * 1000) / 10 : null,
    };
  }, [events, clicks, landings]);

  const venues = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) {
      if (e.event !== "calculate" || !e.venue) continue;
      m.set(e.venue, (m.get(e.venue) ?? 0) + 1);
    }
    const max = Math.max(1, ...m.values());
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([slug, n]) => ({
        slug,
        label: nameBySlug.get(slug)?.name ?? slug,
        stage: nameBySlug.get(slug)?.stage,
        n,
        pct: (n / max) * 100,
      }));
  }, [events, nameBySlug]);

  const empty = events.length === 0;

  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <h2 className="uni-hub-section-title">Bonus calculator</h2>
        <span className="uni-hub-section-meta">
          how many people use it, and what they price
        </span>
      </header>

      <div className="aq-chart-card">
        {empty ? (
          <div className="uni-hub-empty">
            No calculator events captured yet. Rows land here once a visitor
            accepts the cookie banner and the calculator renders. If this stays
            empty after real use, confirm the casino_calculator_events table
            exists in Supabase; the SQL is supabase/casino_calculator_events.sql.
          </div>
        ) : (
          <>
            <div className="cr-cas-cov cr-cas-cov4">
              <CovStat
                value={num(stats.saw)}
                label={`sessions reached the calculator${stats.reach != null ? `, ${stats.reach}% of everyone who landed` : ""}`}
                tone="good"
              />
              <CovStat
                value={num(stats.used)}
                label={`pressed Calculate${stats.useRate != null ? `, ${stats.useRate}% of those who saw it` : ""}`}
                tone="good"
              />
              <CovStat
                value={stats.perUser == null ? "0" : `${stats.perUser}×`}
                label="calculations per session that used it"
                tone="good"
              />
              <CovStat
                value={num(stats.left)}
                label={`went through to a casino from the result${stats.ctaRate != null ? `, ${stats.ctaRate}%` : ""}`}
                tone={stats.left === 0 ? "warn" : "good"}
              />
            </div>

            <p className="cr-cas-note">
              Counted over the last {days} days. The budget a reader types is
              not recorded and no column here holds one.
            </p>

            {venues.length > 0 && (
              <div className="cr-cas-lists" style={{ gridTemplateColumns: "1fr" }}>
                <div>
                  <h3 className="cr-cas-listh">Offers priced</h3>
                  <div className="cr-cas-bars">
                    {venues.map((v) => (
                      <div key={v.slug} className="cr-cas-barrow">
                        <div className="cr-cas-barhead">
                          <span className="cr-cas-barlabel">
                            {v.label}
                            {v.stage && (
                              <span
                                className={`cr-cas-chip${v.stage !== "live" ? " is-plain" : ""}`}
                              >
                                {v.stage === "live"
                                  ? "Attributed"
                                  : STAGE_LABEL[v.stage]}
                              </span>
                            )}
                          </span>
                          <span className="cr-cas-barcounts">
                            {num(v.n)} calculation{v.n === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="cr-cas-bartrack">
                          <div
                            className={`cr-cas-barfill${v.stage && v.stage !== "live" ? " is-plain" : ""}`}
                            style={{ width: `${Math.max(v.pct, 4)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** Every ranked venue, whether it took a click or not. */
function VenueSection({
  links,
  clicks,
  dealFilter,
}: {
  links: CasinoLink[];
  clicks: Click[];
  dealFilter: DealFilter;
}) {
  const rows = useMemo(() => {
    const byName = new Map<string, Bar>();
    for (const l of links) {
      if (dealFilter !== "all" && l.deal !== dealFilter) continue;
      byName.set(l.name.toLowerCase(), {
        key: l.slug,
        label: l.name,
        note: `#${l.rank}${l.offer ? ` · ${l.offer}` : ""}`,
        stage: l.stage,
        opens: 0,
        confirms: 0,
        total: 0,
      });
    }
    for (const c of clicks) {
      const row = byName.get((c.platform ?? "").toLowerCase());
      if (!row) continue;
      if (c.event === "open") row.opens++;
      else if (c.event === "confirm") row.confirms++;
      row.total++;
    }
    return Array.from(byName.values()).sort(
      (a, b) => b.confirms - a.confirms || b.total - a.total || a.label.localeCompare(b.label),
    );
  }, [links, clicks, dealFilter]);

  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <h2 className="uni-hub-section-title">Clicks by venue</h2>
        <span className="uni-hub-section-meta">
          every ranked link, including the ones nobody clicked
        </span>
      </header>
      <div className="aq-chart-card">
        {rows.length === 0 ? (
          <div className="uni-hub-empty">No venues match this filter.</div>
        ) : (
          <BreakdownBars rows={rows} />
        )}
      </div>
    </section>
  );
}

/** Where on the page the click came from. */
function PlacementSection({ clicks }: { clicks: Click[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, Bar>();
    for (const c of clicks) {
      const ref = c.venue_ref ?? "unknown";
      const row = m.get(ref) ?? {
        key: ref,
        label: PLACEMENT[ref] ?? ref,
        opens: 0,
        confirms: 0,
        total: 0,
      };
      if (c.event === "open") row.opens++;
      else if (c.event === "confirm") row.confirms++;
      row.total++;
      m.set(ref, row);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [clicks]);

  const ranks = useMemo(() => {
    const m = new Map<number, Bar>();
    for (const c of clicks) {
      if (c.rank == null) continue;
      const row = m.get(c.rank) ?? {
        key: String(c.rank),
        label: `#${c.rank}`,
        opens: 0,
        confirms: 0,
        total: 0,
      };
      if (c.event === "open") row.opens++;
      else if (c.event === "confirm") row.confirms++;
      row.total++;
      m.set(c.rank, row);
    }
    return Array.from(m.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, r]) => r);
  }, [clicks]);

  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <h2 className="uni-hub-section-title">Placement and position</h2>
        <span className="uni-hub-section-meta">
          where on the page the click happened
        </span>
      </header>
      <div className="cr-cas-two">
        <div className="aq-chart-card">
          <h3 className="cr-cas-listh">By placement</h3>
          {rows.length === 0 ? (
            <div className="uni-hub-empty">No clicks captured yet.</div>
          ) : (
            <BreakdownBars rows={rows} />
          )}
        </div>
        <div className="aq-chart-card">
          <h3 className="cr-cas-listh">By ranking position</h3>
          {ranks.length === 0 ? (
            <div className="uni-hub-empty">No ranked-position clicks yet.</div>
          ) : (
            <BreakdownBars rows={ranks} />
          )}
        </div>
      </div>
    </section>
  );
}

/** Who lands, by country, referral source and device. */
function AudienceSection({ visits, clicks }: { visits: Visit[]; clicks: Click[] }) {
  const build = (
    key: (v: Visit) => string | null,
    clickKey: (c: Click) => string | null,
    label: (k: string) => string,
  ) => {
    const m = new Map<string, { k: string; landings: number; confirms: number }>();
    for (const v of visits) {
      const k = (key(v) ?? "").trim();
      if (!k) continue;
      const row = m.get(k) ?? { k, landings: 0, confirms: 0 };
      row.landings++;
      m.set(k, row);
    }
    for (const c of clicks) {
      if (c.event !== "confirm") continue;
      const k = (clickKey(c) ?? "").trim();
      if (!k) continue;
      const row = m.get(k) ?? { k, landings: 0, confirms: 0 };
      row.confirms++;
      m.set(k, row);
    }
    return Array.from(m.values())
      .sort((a, b) => b.landings - a.landings || b.confirms - a.confirms)
      .slice(0, 10)
      .map((r) => ({ ...r, label: label(r.k) }));
  };

  const countries = useMemo(
    () =>
      build(
        (v) => v.country,
        (c) => c.country,
        (k) => countryName(k),
      ),
    [visits, clicks],
  );
  const sources = useMemo(
    () =>
      build(
        (v) => v.source,
        (c) => c.source,
        (k) => k,
      ),
    [visits, clicks],
  );
  const devices = useMemo(
    () =>
      build(
        (v) => v.device_type,
        (c) => c.device_type,
        (k) => k,
      ),
    [visits, clicks],
  );

  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <h2 className="uni-hub-section-title">Who lands here</h2>
        <span className="uni-hub-section-meta">
          page views, and the click-throughs each group produced
        </span>
      </header>
      <div className="cr-cas-three">
        <AudienceCard title="Country" rows={countries} flags />
        <AudienceCard title="Source" rows={sources} />
        <AudienceCard title="Device" rows={devices} />
      </div>
    </section>
  );
}

function AudienceCard({
  title,
  rows,
  flags = false,
}: {
  title: string;
  rows: { k: string; label: string; landings: number; confirms: number }[];
  flags?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.landings));
  return (
    <div className="aq-chart-card">
      <h3 className="cr-cas-listh">{title}</h3>
      {rows.length === 0 ? (
        <div className="uni-hub-empty">Nothing recorded yet.</div>
      ) : (
        <div className="cr-cas-bars">
          {rows.map((r) => (
            <div key={r.k} className="cr-cas-barrow">
              <div className="cr-cas-barhead">
                <span className="cr-cas-barlabel">
                  {flags && <CountryFlag country={r.k} />}
                  {r.label}
                </span>
                <span className="cr-cas-barcounts">
                  {num(r.landings)} views ·{" "}
                  <span className="cr-cas-qual">{num(r.confirms)}</span>
                </span>
              </div>
              <div className="cr-cas-bartrack">
                <div
                  className="cr-cas-barfill"
                  style={{ width: `${pct(r.landings, max)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- the click log ----------------------------------------------------- */

const TABLE_COLS =
  "140px minmax(150px, 1.4fr) 110px 110px 60px 110px 100px 100px 100px";

function RecentSection({
  clicks,
  dealBySlug,
}: {
  clicks: Click[];
  dealBySlug: Map<string, CasinoLink>;
}) {
  const rows = clicks.slice(0, RECENT_LIMIT);
  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <h2 className="uni-hub-section-title">Recent clicks</h2>
        <span className="uni-hub-section-meta">
          {clicks.length > rows.length
            ? `showing latest ${num(rows.length)} of ${num(clicks.length)}`
            : `showing latest ${num(rows.length)}`}
        </span>
      </header>

      {rows.length === 0 ? (
        <div className="uni-hub-empty">
          No casino clicks captured yet. Once a visitor accepts the cookie
          banner and presses Play Now on {PAGE_PATH}, rows land here.
        </div>
      ) : (
        <div className="hub-table-wrap aq-recent-wrap">
          <div className="hub-table aq-clicks-table aq-recent-table">
            <div className="hub-thead" style={{ gridTemplateColumns: TABLE_COLS }}>
              <span className="hub-th">Time</span>
              <span className="hub-th">Venue</span>
              <span className="hub-th">Link</span>
              <span className="hub-th">Event</span>
              <span className="hub-th">Pos</span>
              <span className="hub-th">Source</span>
              <span className="hub-th">Country</span>
              <span className="hub-th">Device</span>
              <span className="hub-th">Session</span>
            </div>
            {rows.map((c) => {
              const d = dealOf(c, dealBySlug);
              return (
                <div
                  key={c.id}
                  className="hub-row"
                  style={{ gridTemplateColumns: TABLE_COLS }}
                >
                  <span className="hub-cell aq-cell-time">
                    {formatTime(c.created_at)}
                  </span>
                  <span className="hub-cell aq-cell-vault">
                    {c.target_url ? (
                      <a
                        href={c.target_url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="aq-vault-link"
                        title={c.target_url}
                      >
                        {c.platform ?? "Unknown"}
                      </a>
                    ) : (
                      (c.platform ?? "Unknown")
                    )}
                  </span>
                  <span className="hub-cell">
                    <span className={`cr-cas-chip${d === "plain" ? " is-plain" : ""}`}>
                      {d === "affiliate" ? "Attributed" : "Plain"}
                    </span>
                  </span>
                  <span className="hub-cell">
                    <EventChip event={c.event} />
                  </span>
                  <span className="hub-cell aq-cell-text">
                    {c.rank != null ? `#${c.rank}` : "—"}
                  </span>
                  <span className="hub-cell aq-cell-text">{c.source ?? "—"}</span>
                  <span className="hub-cell">
                    <CountryFlag country={c.country} />
                  </span>
                  <span className="hub-cell aq-cell-text">
                    {c.device_type ?? "—"}
                  </span>
                  <span className="hub-cell aq-cell-session">
                    {(c.session_id || "").slice(0, 8)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function EventChip({ event }: { event: string | null }) {
  const confirm = event === "confirm";
  return (
    <span className={`cr-cas-event${confirm ? " is-qual" : ""}`}>
      {confirm ? "Qualified" : event === "open" ? "Opened" : (event ?? "—")}
    </span>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}
