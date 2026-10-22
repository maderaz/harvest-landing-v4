"use client";

// Control Room > Reports > Calculators.
//
// The two numbers the /xrp-rich-list build spec asked for before launch and
// which nobody could see until this page existed:
//
//   completion rate   start -> result. How many people who press the button
//                     stay long enough to be shown a rank.
//   click-through     result -> cta. Whether a rank actually moves anyone
//                     into the XRP yield report, which is the whole question
//                     of whether the calculator earns its place.
//
// Rows come from richlist_calculator_events (see lib/richlist-tracking.ts),
// kept out of both outbound_clicks and report_outbound_clicks so the
// acquisition funnel and the report funnel stay clean.
//
// The balance a visitor types is never recorded. What lands is the percentile
// band the result fell into, which is why the tier breakdown below reads as
// "top 1%" rather than as an amount.

import { useEffect, useMemo, useState } from "react";
import { supabaseSelectAll } from "@/lib/supabase";
import {
  TimeframeSelector,
  resolveDays,
  eventTimeMs,
  type Timeframe,
} from "@/components/admin/timeframe-selector";
import { CountryFlag } from "@/components/admin/country-flag";
import { MultiSelect, type MultiOption } from "@/components/admin/multi-select";
import { FilterHint } from "@/components/admin/filter-hint";
import "../../_styles/asset-hub.css";

interface CalcEvent {
  id: string;
  created_at: string;
  session_id: string;
  event: string | null;
  tier: string | null;
  cta: string | null;
  target_url: string | null;
  source_page: string | null;
  source: string | null;
  country: string | null;
  city: string | null;
  device_type: string | null;
}

// Ceiling on rows pulled for one calculator, paged 1,000 at a time. High
// enough that it is not reached in normal use, and when it is the page says
// so rather than quietly showing a shorter history than the data holds.
const ROWS_FETCH_LIMIT = 100_000;
const ROWS_DISPLAY_LIMIT = 200;

// Percentile bands in the order the calculator can produce them, so the
// breakdown reads top-down rather than in whatever order the rows arrived.
const TIER_ORDER = [
  "top 0.1%",
  "top 1%",
  "top 5%",
  "top 10%",
  "top 25%",
  "top 50%",
  "bottom 50%",
  "unknown",
];

// Column tracks for the three tables on this page.
//
// These were real <table> elements carrying className="uni-hub-table", which
// looked right and did nothing: that class is the CSS-grid pattern for divs
// (hub-thead / hub-row / hub-cell on a fixed eight-column track) and has no
// <th>/<td> rules at all. The tables therefore rendered with browser defaults
// and no padding, so headers ran into each other and "bottom 50%8" read as one
// token. Same div-grid markup as every other control-room table now.
const ERA_COLS = "minmax(200px, 1.6fr) 130px 130px";
const TIER_COLS = "minmax(140px, 1.4fr) 120px 120px";
const EVENT_COLS =
  "190px 92px minmax(130px, 1fr) 110px minmax(150px, 1fr) 100px";

// Rows of the era comparison, transposed so the long labels run down the side.
const ERA_ROWS: {
  label: string;
  of: (s: { results: number; converted: number; ctr: number | null; earn: number; top: number }) => string;
}[] = [
  { label: "Sessions shown a rank", of: (s) => s.results.toLocaleString("en-US") },
  { label: "Sessions that clicked", of: (s) => s.converted.toLocaleString("en-US") },
  { label: "Click-through", of: (s) => (s.ctr == null ? "—" : `${s.ctr}%`) },
  { label: "Clicks into the yield report", of: (s) => s.earn.toLocaleString("en-US") },
  { label: "Clicks into the ranking", of: (s) => s.top.toLocaleString("en-US") },
];

// The three calculator surfaces writing into richlist_calculator_events, and
// the source_page each one reports. A row whose source_page matches none of
// them is a page that has not been added here yet, and it simply does not
// appear.
type ToolKey = "rich-list" | "staking-report" | "staking-richlist";

// ONE PATH PER TAB. The staking calculator renders in two places, read by
// different audiences; summed, a strong surface hides a weak one. `kind`
// picks which funnel the tiles describe, `switched` marks the surface that
// sits behind a switch and so has a stage before its first calculation.
const TOOLS: {
  key: ToolKey;
  label: string;
  path: string;
  kind: "rank" | "staking";
  switched?: boolean;
  blurb: string;
}[] = [
  {
    key: "rich-list",
    label: "Rich list",
    path: "/xrp-rich-list",
    kind: "rank",
    blurb:
      "the percentile calculator on /xrp-rich-list. \u201CStarted\u201D is a Start check press with a balance typed; \u201CResults shown\u201D is a rank rendered, and the gap between them is people leaving during the check.",
  },
  {
    key: "staking-report",
    label: "Staking \u00B7 report",
    path: "/report/xrp-yield-ranking",
    kind: "staking",
    blurb:
      "the XRP staking calculator on its own page, /report/xrp-yield-ranking. \u201CStarted\u201D and \u201CResults shown\u201D both fire on a Calculate press, so their gap measures nothing here; the number that matters is the onward click into the ranking.",
  },
  {
    key: "staking-richlist",
    label: "Staking \u00B7 rich list",
    path: "/xrp-rich-list#staking-calculator",
    kind: "staking",
    switched: true,
    blurb:
      "the same XRP staking calculator behind the switch on /xrp-rich-list, counted entirely apart from the copy on the yield report. A visitor has to flip the switch to see it at all, so the flip is the first stage of its funnel and the share of flips that reach a calculation is what says whether the switch earns its place.",
  },
];

let _regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  const iso = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return iso || "Unknown";
  try {
    if (!_regionNames) _regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    return _regionNames.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

export default function CalculatorAnalyticsPage() {
  const [rows, setRows] = useState<CalcEvent[] | null>(null);
  const [tool, setTool] = useState<ToolKey>("rich-list");
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const [countries, setCountries] = useState<string[]>([]);

  // Scoped in the query and paged. Filtering client-side after a blind
  // "newest 5000" meant one tool's volume pushed the other's history off the
  // end, and a 30-day chart showed four.
  const tap = TOOLS.find((t) => t.key === tool)!;
  const tapPath = tap.path;
  useEffect(() => {
    let alive = true;
    setRows(null);
    void (async () => {
      const data = await supabaseSelectAll<CalcEvent>(
        "richlist_calculator_events",
        // Encoded, because one of the three paths carries a "#" and an
        // unescaped fragment marker would truncate the query string.
        `select=*&source_page=eq.${encodeURIComponent(tapPath)}&order=created_at.desc`,
        1000,
        ROWS_FETCH_LIMIT,
      );
      if (alive) setRows(data);
    })();
    return () => {
      alive = false;
    };
  }, [tapPath]);

  // The window in days, resolved once. The chart bins against exactly the span
  // the filters scope to, so a bar cannot sit outside the numbers above it.
  const days = useMemo(() => {
    const oldestMs =
      rows && rows.length ? eventTimeMs(rows[rows.length - 1].created_at) : null;
    return resolveDays(timeframe, Number.isFinite(oldestMs as number) ? oldestMs : null);
  }, [rows, timeframe]);

  // Timeframe first, then country, so the country counts in the picker
  // describe the window the operator is actually looking at.
  const scoped = useMemo(() => {
    if (!rows) return null;
    if (timeframe === "all") return rows;
    // "all" is handled above, so the oldest row only matters as the span
    // resolveDays falls back to; rows arrive newest-first.
    const oldestRaw = rows.length ? eventTimeMs(rows[rows.length - 1].created_at) : null;
    const oldestMs = Number.isFinite(oldestRaw as number) ? oldestRaw : null;
    const cut = Date.now() - resolveDays(timeframe, oldestMs) * 86_400_000;
    return rows.filter((r) => eventTimeMs(r.created_at) >= cut);
  }, [rows, timeframe]);

  const countryOptions = useMemo<MultiOption[]>(() => {
    if (!scoped) return [];
    const counts = new Map<string, number>();
    for (const r of scoped) {
      const c = (r.country ?? "").trim().toUpperCase();
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: countryName(value), count }));
  }, [scoped]);

  const filtered = useMemo(() => {
    if (!scoped) return null;
    if (!countries.length) return scoped;
    const want = new Set(countries);
    return scoped.filter((r) => want.has((r.country ?? "").trim().toUpperCase()));
  }, [scoped, countries]);

  const stats = useMemo(() => {
    if (!filtered) return null;
    const starts = filtered.filter((r) => r.event === "start").length;
    const results = filtered.filter((r) => r.event === "result").length;
    const ctas = filtered.filter((r) => r.event === "cta");
    // Each tool has its own surviving CTA value: earn-on-xrp on the rich list,
    // see-ranking on the staking calculator. Counting the literal rather than
    // the tool would show the staking view a permanent zero.
    const toReport = ctas.filter((r) =>
      tap.kind === "staking" ? r.cta === "see-ranking" : r.cta === "earn-on-xrp",
    ).length;
    const toRanking = ctas.filter((r) => r.cta === "top-accounts").length;

    // Sessions, not events: a visitor toggling back and forth is one person
    // considering one thing, and a per-event rate scores that as demand.
    const flipSessions = new Set(
      filtered
        .filter((r) => r.event === "switch" && r.tier === "to-staking")
        .map((r) => r.session_id),
    );
    const resultSessions = new Set(
      filtered.filter((r) => r.event === "result").map((r) => r.session_id),
    );
    let flipsUsed = 0;
    for (const s of flipSessions) if (resultSessions.has(s)) flipsUsed++;
    const flipsBack = new Set(
      filtered
        .filter((r) => r.event === "switch" && r.tier === "to-rich-list")
        .map((r) => r.session_id),
    ).size;

    return {
      starts,
      results,
      // start -> result. Anything under 100% is people leaving during the
      // three-second check, which is the one number that argues for making it
      // shorter.
      completion: starts > 0 ? Math.round((results / starts) * 100) : null,
      ctas: ctas.length,
      toReport,
      toRanking,
      // The spec's second number: does a rank move anyone into the report.
      reportCtr: results > 0 ? Math.round((toReport / results) * 100) : null,
      sessions: new Set(filtered.map((r) => r.session_id)).size,
      flips: flipSessions.size,
      flipsUsed,
      flipsBack,
      flipUse: flipSessions.size > 0
        ? Math.round((flipsUsed / flipSessions.size) * 100)
        : null,
    };
  }, [filtered, tap.kind]);

  const tiers = useMemo(() => {
    if (!filtered) return [];
    const counts = new Map<string, number>();
    for (const r of filtered) {
      if (r.event !== "result" || !r.tier) continue;
      counts.set(r.tier, (counts.get(r.tier) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    // The rich list records a percentile band and reads best top-down in that
    // order. The staking calculator records the selected product's venue slug,
    // which has no natural order, so it falls back to volume.
    const known = TIER_ORDER.filter((t) => counts.has(t));
    const keys = known.length
      ? known
      : [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
    return keys.map((t) => ({
      tier: t,
      n: counts.get(t) ?? 0,
      pct: total > 0 ? Math.round(((counts.get(t) ?? 0) / total) * 100) : 0,
    }));
  }, [filtered]);

  const recent = useMemo(
    () => (filtered ? filtered.slice(0, ROWS_DISPLAY_LIMIT) : []),
    [filtered],
  );

  // Before/after the two buttons became one box.
  //
  // Deliberately computed over EVERY fetched row rather than over the selected
  // timeframe: this compares one deploy against another, and a 7-day window
  // would quietly empty the older era and leave a comparison table with one
  // side blank.
  //
  // The boundary is inferred, not configured. The retired button only ever
  // existed before the change, so the last click it recorded is the last
  // moment the page definitely still had two buttons. That is a lower bound:
  // if nobody pressed it in its final days, those days are counted as
  // one-box. The alternative is a hardcoded deploy timestamp, which would be
  // wrong on any deployment that shipped on a different day, and this table
  // is read on more than one.
  const eras = useMemo(() => {
    // Only the rich-list calculator ever had two buttons, so the comparison
    // is meaningless against any other tool's rows.
    if (tool !== "rich-list") return null;
    if (!rows || !rows.length) return null;
    const ms = (r: CalcEvent) => eventTimeMs(r.created_at);
    const lastDual = rows
      .filter((r) => r.event === "cta" && r.cta === "top-accounts")
      .reduce((m, r) => Math.max(m, ms(r)), 0);
    if (!lastDual) return null;

    const side = (list: CalcEvent[]) => {
      const resultSessions = new Set(
        list.filter((r) => r.event === "result").map((r) => r.session_id),
      );
      const ctas = list.filter((r) => r.event === "cta");
      const clickSessions = new Set(
        ctas.filter((r) => resultSessions.has(r.session_id)).map((r) => r.session_id),
      );
      return {
        results: resultSessions.size,
        clicks: ctas.length,
        earn: ctas.filter((r) => r.cta === "earn-on-xrp").length,
        top: ctas.filter((r) => r.cta === "top-accounts").length,
        converted: clickSessions.size,
        // Share of the people who were shown a rank that went on to click.
        // Sessions, not raw clicks: with two buttons one visitor could press
        // both, and a per-click rate would score that as two conversions.
        ctr: resultSessions.size
          ? Math.round((clickSessions.size / resultSessions.size) * 100)
          : null,
      };
    };

    return {
      boundary: new Date(lastDual),
      before: side(rows.filter((r) => ms(r) <= lastDual)),
      after: side(rows.filter((r) => ms(r) > lastDual)),
    };
  }, [rows, tool]);

  return (
    <div className="uni-hub-test">
      <header className="uni-hub-hero aq-hero-slim aq-hero-fullwidth">
        <div className="uni-hub-hero-headline">
          <div style={{ width: "100%" }}>
            <h1 className="uni-hub-h1">Calculators</h1>
            <p className="uni-hub-sub aq-sub-full">
              Interactions with {tap.blurb} The amount a visitor types is never
              recorded, which is why results are grouped by the answer shown
              rather than by the number entered. Three calculator surfaces
              write to one table and are told apart by source_page, one path
              each; the tabs below switch between them and every figure on this
              page follows the selection, so no surface is ever counted inside
              another.
            </p>
          </div>
        </div>
      </header>

      {/* .lf-filterbar, the house control row. The aq-filterbar this used to
          name has no rule anywhere, so the row had no gap and no wrapping. */}
      <div className="lf-filterbar" style={{ marginBottom: 14 }}>
        <div className="aq-timeframe" role="tablist" aria-label="Calculator">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tool === t.key}
              className={`aq-timeframe-tab${tool === t.key ? " active" : ""}`}
              onClick={() => setTool(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <TimeframeSelector value={timeframe} onChange={setTimeframe} />
        <MultiSelect
          values={countries}
          onChange={setCountries}
          options={countryOptions}
          allLabel="All countries"
          ariaLabel="Filter by country"
          unit="countries"
        />
        <FilterHint>
          Events are consent-gated and best-effort: a visitor who declined
          analytics is absent entirely, so treat these as a floor rather than
          as a census.
        </FilterHint>
      </div>

      {/* Coverage, said out loud. Every number below is drawn from the rows
          named here, so if a chart looks short this line is what tells you
          whether the data is missing or merely not loaded. */}
      <p className="uni-hub-sub" style={{ margin: "0 0 26px", fontSize: 13 }}>
        {rows === null
          ? "Loading events…"
          : rows.length === 0
            ? `No events stored for ${tap.path} yet.`
            : `${rows.length.toLocaleString("en-US")} events stored for ${tap.path}, back to ${new Date(
                eventTimeMs(rows[rows.length - 1].created_at),
              ).toLocaleDateString("en-GB")}${
                rows.length >= ROWS_FETCH_LIMIT
                  ? ". That is the fetch ceiling, so older events exist and are not shown"
                  : ""
              }.`}
      </p>

      <div
        className="uni-hub-stats"
        role="group"
        aria-label="Calculator summary"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 32 }}
      >
        {tap.switched ? (
          <>
            {/* Starts one stage earlier: nobody sees this calculator without
                flipping the switch. */}
            <Stat label="Sessions that flipped to it" value={stats?.flips} />
            <Stat label="Calculations" value={stats?.results} />
            <Stat
              label="Flips that reached a result"
              value={stats?.flipUse ?? undefined}
              suffix="%"
            />
            <Stat label="Onward clicks" value={stats?.toReport} />
          </>
        ) : tap.kind === "staking" ? (
          <>
            {/* Start and result fire on the same press here, so the pair of
                tiles and the rate between them would be one number shown
                three times. */}
            <Stat label="Calculations" value={stats?.results} />
            <Stat label="Unique sessions" value={stats?.sessions} />
            <Stat label="Onward clicks" value={stats?.toReport} />
            <Stat
              label="Click-through from a result"
              value={stats?.reportCtr ?? undefined}
              suffix="%"
            />
          </>
        ) : (
          <>
            <Stat label="Started" value={stats?.starts} />
            <Stat label="Results shown" value={stats?.results} />
            <Stat label="Completion rate" value={stats?.completion ?? undefined} suffix="%" />
            <Stat label="Unique sessions" value={stats?.sessions} />
          </>
        )}
      </div>

      {tool === "rich-list" ? (
      <div
        className="uni-hub-stats"
        role="group"
        aria-label="Onward clicks"
        style={{
          // The retired button's tile is not rendered as a permanent zero.
          // It appears only while the selected timeframe still contains rows
          // from before the two buttons became one box, and the row reflows
          // from three columns to two when it does not.
          gridTemplateColumns: `repeat(${stats?.toRanking ? 3 : 2}, minmax(0, 1fr))`,
          marginBottom: 32,
        }}
      >
        <Stat label="Onward clicks" value={stats?.toReport} />
        {stats?.toRanking ? (
          <Stat label="Into the ranking (retired)" value={stats.toRanking} />
        ) : null}
        <Stat
          label="Click-through from a result"
          value={stats?.reportCtr ?? undefined}
          suffix="%"
        />
      </div>
      ) : null}

      {tap.switched ? (
        <div
          className="uni-hub-stats"
          role="group"
          aria-label="Switch behaviour"
          style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginBottom: 32 }}
        >
          <Stat label="Unique sessions" value={stats?.sessions} />
          {/* Not a failure on its own; read it against the tile to its
              left. */}
          <Stat label="Flipped back to the rank" value={stats?.flipsBack} />
          <Stat
            label="Click-through from a result"
            value={stats?.reportCtr ?? undefined}
            suffix="%"
          />
        </div>
      ) : null}

      {filtered && filtered.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <ChartSection
            events={filtered}
            days={days}
            stages={tap.switched ? [FLIP_STAGE, ...STAGES] : STAGES}
          />
        </div>
      )}

      {eras && (
        <section className="aq-chart-card" style={{ marginBottom: 32 }}>
          <div className="aq-chart-bignum-label" style={{ marginBottom: 6 }}>
            Onward clicks, two buttons against one box
          </div>
          <p className="uni-hub-sub" style={{ marginBottom: 18, maxWidth: 780 }}>
            Every fetched row, ignoring the timeframe filter above, because this
            compares one deploy against another and a short window would empty
            the older side. The split is inferred from the data rather than
            configured: the retired second button existed only before the
            change, so its last recorded click,{" "}
            {eras.boundary.toLocaleString("en-GB")}, is the last moment the page
            definitely still had two buttons. Click-through counts sessions that
            were shown a rank and then clicked, not raw clicks, because with two
            buttons one visitor could press both.
          </p>
          {/* Transposed: metric down the side, layout across the top.
              Laid out the other way this was six columns whose headers were
              each longer than the figure underneath, so every label wrapped or
              collided. Two eras and five metrics read better as five short
              rows than as two very wide ones, and it stops being a table that
              needs a scrollbar to say ten numbers. */}
          {/* Capped rather than full-bleed. Three short columns stretched
              across a 1900px card put half a metre of empty space between a
              label and its figure, which is the thing the eye has to travel. */}
          <div className="hub-table-wrap">
            <div className="hub-table" style={{ minWidth: 520, maxWidth: 640 }}>
              <div className="hub-thead" style={{ gridTemplateColumns: ERA_COLS }}>
                <span className="hub-th">Measure</span>
                <span className="hub-th hub-th-right">Two buttons</span>
                <span className="hub-th hub-th-right">One box</span>
              </div>
              {ERA_ROWS.map((row) => (
                <div
                  key={row.label}
                  className="hub-row"
                  style={{ gridTemplateColumns: ERA_COLS }}
                >
                  <span className="hub-cell">{row.label}</span>
                  <span className="hub-cell hub-num">{row.of(eras.before)}</span>
                  <span className="hub-cell hub-num">{row.of(eras.after)}</span>
                </div>
              ))}
            </div>
          </div>
          {eras.after.results < 30 && (
            <p className="uni-hub-sub" style={{ marginTop: 14, maxWidth: 780 }}>
              The one-box side has {eras.after.results.toLocaleString("en-US")}{" "}
              {eras.after.results === 1 ? "session" : "sessions"} behind it so
              far. Read the difference as a direction, not as a result, until
              that number is into the hundreds.
            </p>
          )}
        </section>
      )}

      {tiers.length > 0 && (
        <section className="aq-chart-card" style={{ marginBottom: 32 }}>
          <div className="aq-chart-bignum-label" style={{ marginBottom: 14 }}>
            {tap.kind === "staking"
              ? "Which product visitors picked"
              : "Where visitors land, by percentile band"}
          </div>
          <div className="hub-table-wrap">
            <div className="hub-table" style={{ minWidth: 440, maxWidth: 560 }}>
              <div className="hub-thead" style={{ gridTemplateColumns: TIER_COLS }}>
                <span className="hub-th">
                  {tap.kind === "staking" ? "Product" : "Band"}
                </span>
                <span className="hub-th hub-th-right">Results</span>
                <span className="hub-th hub-th-right">Share</span>
              </div>
              {tiers.map((t) => (
                <div
                  key={t.tier}
                  className="hub-row"
                  style={{ gridTemplateColumns: TIER_COLS }}
                >
                  <span className="hub-cell">{t.tier}</span>
                  <span className="hub-cell hub-num">
                    {t.n.toLocaleString("en-US")}
                  </span>
                  <span className="hub-cell hub-num">{t.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="aq-chart-card">
        <div className="aq-chart-bignum-label" style={{ marginBottom: 12 }}>
          Recent events
          {filtered && filtered.length > ROWS_DISPLAY_LIMIT
            ? ` (newest ${ROWS_DISPLAY_LIMIT} of ${filtered.length.toLocaleString("en-US")})`
            : ""}
        </div>
        {rows === null ? (
          <p className="uni-hub-sub">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="uni-hub-sub">
            No events yet. If the calculator is live and this stays empty, check
            that the <code>richlist_calculator_events</code> table exists: the
            insert fails silently without it, by design, so the page can never
            break the calculator.
          </p>
        ) : (
          <div className="hub-table-wrap aq-recent-wrap">
            {/* .aq-recent-table's 1180px floor is sized for the nine-column
                clicks table and was pushing Device out of this six-column
                one. Its own floor instead. */}
            <div className="hub-table aq-recent-table" style={{ minWidth: 820 }}>
              <div className="hub-thead" style={{ gridTemplateColumns: EVENT_COLS }}>
                <span className="hub-th">When</span>
                <span className="hub-th">Event</span>
                <span className="hub-th">Band / target</span>
                <span className="hub-th">Source</span>
                <span className="hub-th">Country</span>
                <span className="hub-th">Device</span>
              </div>
              {recent.map((r) => (
                <div
                  key={r.id}
                  className="hub-row"
                  style={{ gridTemplateColumns: EVENT_COLS }}
                >
                  <span className="hub-cell aq-cell-time">
                    {new Date(eventTimeMs(r.created_at)).toLocaleString("en-GB")}
                  </span>
                  <span className="hub-cell">{r.event ?? "—"}</span>
                  <span className="hub-cell">{r.tier ?? r.cta ?? "—"}</span>
                  <span className="hub-cell">{r.source ?? "—"}</span>
                  {/* Flag then country name. CountryFlag's ISO code is
                      hidden here (.aq-calc-country in asset-hub.css) so the
                      cell does not read "US United States". */}
                  <span className="hub-cell aq-calc-country">
                    <CountryFlag country={r.country} />
                    {r.country ? countryName(r.country) : null}
                  </span>
                  <span className="hub-cell">{r.device_type ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// Funnel stages in the order they happen, with fixed colours so a stage keeps
// its colour when a timeframe contains none of it. "Flipped" is passed only
// to the surface that has a switch; elsewhere it would be a legend entry that
// can never fire.
const FLIP_STAGE = { key: "switch", label: "Flipped to it", color: "#B07AA1" } as const;
const STAGES = [
  { key: "start", label: "Started", color: "#4E79A7" },
  { key: "result", label: "Result shown", color: "#59A14F" },
  { key: "cta", label: "Onward click", color: "#F28E2B" },
] as const;

type Stage = { key: string; label: string; color: string };

function labelForDaysAgo(d: number): string {
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

/**
 * Calculator events per day, the same bar chart the SEO summary draws.
 *
 * "All" counts every event, which reads as raw usage. "Breakdown" stacks the
 * three stages, which is where the funnel becomes visible: a day whose bar is
 * mostly the Started colour is a day people gave up during the check, and a
 * bar with no Onward click segment is a day nobody left the page.
 */
function ChartSection({
  events,
  days,
  stages,
}: {
  events: CalcEvent[];
  days: number;
  stages: readonly Stage[];
}) {
  const [mode, setMode] = useState<"all" | "breakdown">("breakdown");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const visible = stages.filter((s) => mode === "all" || !hidden.has(s.key));

  const bins = useMemo(() => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const out: { daysAgo: number; byStage: Record<string, number> }[] = [];
    for (let i = 0; i < days; i++) out.push({ daysAgo: days - 1 - i, byStage: {} });
    for (const e of events) {
      const t = eventTimeMs(e.created_at);
      if (!Number.isFinite(t)) continue;
      // Clamped, not dropped. A row a few seconds newer than this render's
      // clock is still a row that happened, and silently discarding it is how
      // a chart ends up contradicting the tiles above it.
      const daysAgo = Math.max(0, Math.floor((now - t) / dayMs));
      if (daysAgo >= days) continue;
      const k = e.event ?? "unknown";
      const bin = out[days - 1 - daysAgo];
      bin.byStage[k] = (bin.byStage[k] || 0) + 1;
    }
    return out;
  }, [events, days]);

  const countOf = (b: (typeof bins)[number]) =>
    visible.reduce((s, st) => s + (b.byStage[st.key] || 0), 0);

  const counts = bins.map(countOf);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((s, v) => s + v, 0);
  const latest = counts[counts.length - 1] ?? 0;

  const hoveredBin = hoverIdx != null ? bins[hoverIdx] : null;
  const hoveredCount = hoveredBin ? countOf(hoveredBin) : 0;
  const displayValue = hoveredBin ? hoveredCount : total;
  const displayLabel = hoveredBin
    ? `calculator events ${labelForDaysAgo(hoveredBin.daysAgo)}`
    : `calculator events across the trailing ${days} days`;

  const toggle = (k: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <section className="uni-hub-section" style={{ marginTop: 0 }}>
      <header className="uni-hub-section-head">
        <div className="aq-section-head-left">
          <h2 className="uni-hub-section-title">
            Calculator events, last {days} days
          </h2>
          <span className="uni-hub-section-meta">
            today {latest.toLocaleString("en-US")} · peak{" "}
            {max.toLocaleString("en-US")}/day
          </span>
        </div>
        <div className="aq-timeframe" role="tablist" aria-label="Chart breakdown mode">
          {(["all", "breakdown"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`aq-timeframe-tab${mode === m ? " active" : ""}`}
              onClick={() => setMode(m)}
            >
              {m === "all" ? "All" : "Breakdown"}
            </button>
          ))}
        </div>
      </header>

      <div className="aq-chart-card">
        <div className="aq-chart-bignum">{displayValue.toLocaleString("en-US")}</div>
        <div className="aq-chart-bignum-label">{displayLabel}</div>

        <div className="aq-chart">
          <div className="aq-chart-bars" style={{ position: "relative" }}>
            {bins.map((b, i) => {
              const v = countOf(b);
              const heightPct = Math.max((v / max) * 100, v > 0 ? 4 : 0);
              return (
                <div
                  key={i}
                  className="aq-bar-col"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                >
                  {mode === "all" || v === 0 ? (
                    <div className="aq-bar" style={{ height: `${heightPct}%` }} />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: `${heightPct}%`,
                        minHeight: 4,
                        display: "flex",
                        flexDirection: "column",
                        borderRadius: "5px 5px 0 0",
                        overflow: "hidden",
                      }}
                    >
                      {visible
                        .filter((s) => b.byStage[s.key])
                        .map((s) => (
                          <div
                            key={s.key}
                            style={{
                              height: `${((b.byStage[s.key] || 0) / v) * 100}%`,
                              background: s.color,
                            }}
                          />
                        ))}
                    </div>
                  )}
                </div>
              );
            })}

            {hoveredBin && hoveredCount > 0 && (
              <ChartTooltip
                bin={hoveredBin}
                count={hoveredCount}
                stages={visible}
                idx={hoverIdx as number}
                days={days}
              />
            )}
          </div>
          <div className="aq-chart-axis">
            <span>{days}d ago</span>
            <span>{Math.floor(days / 2)}d ago</span>
            <span>today</span>
          </div>
        </div>

        {mode === "breakdown" && (
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
            {stages.map((s) => {
              const off = hidden.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggle(s.key)}
                  aria-pressed={!off}
                  title={off ? `Show ${s.label}` : `Hide ${s.label}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    font: "inherit",
                    fontSize: 12.5,
                    opacity: off ? 0.4 : 1,
                    color: "var(--uni-ink-2, inherit)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: s.color,
                      flex: "0 0 auto",
                    }}
                  />
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function ChartTooltip({
  bin,
  count,
  stages,
  idx,
  days,
}: {
  bin: { daysAgo: number; byStage: Record<string, number> };
  count: number;
  stages: readonly { key: string; label: string; color: string }[];
  idx: number;
  days: number;
}) {
  const rows = stages
    .filter((s) => bin.byStage[s.key])
    .map((s) => ({ ...s, n: bin.byStage[s.key] || 0 }));
  const leftPct = ((idx + 0.5) / days) * 100;
  // Keep the card on-screen: anchored left near the start, right near the end.
  const tx = leftPct < 18 ? "0%" : leftPct > 82 ? "-100%" : "-50%";
  return (
    <div
      style={{
        position: "absolute",
        left: `${leftPct}%`,
        bottom: "calc(100% + 8px)",
        transform: `translateX(${tx})`,
        zIndex: 5,
        pointerEvents: "none",
        minWidth: 200,
        padding: "10px 12px",
        borderRadius: 8,
        background: "var(--uni-card, #fff)",
        border: "1px solid var(--uni-line-2)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        fontSize: 12.5,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--uni-ink-2, inherit)" }}>
        {labelForDaysAgo(bin.daysAgo)}
      </div>
      {rows.map((r) => (
        <div
          key={r.key}
          style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: r.color,
              flex: "0 0 auto",
            }}
          />
          <span style={{ flex: 1 }}>{r.label}</span>
          <strong>{r.n.toLocaleString("en-US")}</strong>
        </div>
      ))}
      <div
        style={{
          marginTop: 6,
          paddingTop: 6,
          borderTop: "1px solid var(--uni-line-2)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>Total</span>
        <strong>{count.toLocaleString("en-US")}</strong>
      </div>
    </div>
  );
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
        {value === undefined ? "—" : `${value.toLocaleString("en-US")}${suffix}`}
      </div>
    </div>
  );
}
