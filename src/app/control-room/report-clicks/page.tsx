"use client";

// Control Room > Reports > Outbound Clicks.
//
// A SEPARATE tracking surface from the into-app Acquisition funnel: rows here
// come from report_outbound_clicks (see lib/report-tracking.ts), which records
// clicks on the Discover / Visit buttons and the "I understand" confirmations
// on /report/* pages. Every target is a third-party venue, so keeping this
// apart from outbound_clicks means the into-app conversion numbers stay clean.
//
// Two events per venue: "open" (opened the leave modal) and "confirm" (clicked
// through). The gap between them is the confirm rate.

import { useEffect, useMemo, useState } from "react";
import { supabaseSelect } from "@/lib/supabase";
import {
  TimeframeSelector,
  resolveDays,
  type Timeframe,
} from "@/components/admin/timeframe-selector";
import { CountryFlag } from "@/components/admin/country-flag";
import { MultiSelect, type MultiOption } from "@/components/admin/multi-select";
import { FilterHint } from "@/components/admin/filter-hint";
import "../../_styles/asset-hub.css";

interface ReportClick {
  id: string;
  created_at: string;
  session_id: string;
  event: string | null;
  source_page: string | null;
  platform: string | null;
  product: string | null;
  chain: string | null;
  venue_ref: string | null;
  rank: number | null;
  target_url: string | null;
  source: string | null;
  country: string | null;
  city: string | null;
  device_type: string | null;
}

const ROWS_FETCH_LIMIT = 1000;
const ROWS_DISPLAY_LIMIT = 200;

// Event view. "all" keeps both halves of the funnel visible; the other two
// isolate one side, so "confirm" alone answers "who actually left for a
// venue" without the opened-but-bailed rows diluting it.
type EventFilter = "all" | "confirm" | "open";

const EVENT_OPTIONS: { value: EventFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "confirm", label: "Qualified" },
  { value: "open", label: "Opened" },
];

// ISO 3166-1 alpha-2 -> display name. The column stores codes ("PL"), which
// are unsearchable for an operator thinking "Poland", so the filter list is
// labelled with real names. Intl.DisplayNames is built into the browser and
// Node, so this costs no dependency; the try/catch covers the rare
// non-ISO values ("EU", "XK") the geo lookup can emit.
let _regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  const iso = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return iso || "Unknown";
  try {
    if (!_regionNames) {
      _regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    }
    return _regionNames.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

// Everything one row can be matched against by the free-text search, joined
// into a single lower-cased haystack. Includes the *resolved* product label
// (not just the raw columns) so searching "Spectra" catches rows whose
// product string predates the detailed format and only carries the slug
// "spectra-pt-nov-2026", and so "MetaVault" matches the humanized label.
// Also includes the country's display name, so "Poland" works in the search
// box as well as in the country filter.
function searchHaystack(c: ReportClick): string {
  const { label } = productIdentity(c);
  return [
    label,
    c.platform,
    c.product,
    c.venue_ref,
    c.chain,
    c.source,
    c.source_page,
    c.city,
    c.device_type,
    c.target_url,
    c.session_id,
    c.country,
    c.country ? countryName(c.country) : null,
    c.event === "confirm" ? "qualified lead" : c.event === "open" ? "opened" : c.event,
    c.rank != null ? `#${c.rank}` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// Space-separated terms are ANDed, so "spectra pt" narrows rather than
// widens. Quoting is deliberately not supported - this is a filter box, not
// a query language.
function matchesQuery(c: ReportClick, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = searchHaystack(c);
  return terms.every((t) => hay.includes(t));
}

// Time | Venue | Event | Pos | Chain | Source | Country | Device | Session
const TABLE_COLS =
  "140px minmax(170px, 1.5fr) 110px 60px 110px 110px 100px 100px 110px";

export default function ReportClicksPage() {
  const [clicks, setClicks] = useState<ReportClick[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [countries, setCountries] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params =
          "select=id,created_at,session_id,event,source_page,platform,product,chain,venue_ref,rank,target_url,source,country,city,device_type&order=created_at.desc&limit=" +
          ROWS_FETCH_LIMIT;
        const data = await supabaseSelect<ReportClick>(
          "report_outbound_clicks",
          params,
        );
        if (!cancelled) setClicks(data);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Country options are faceted on the event + search filters but NOT on the
  // country selection itself, so picking Poland doesn't collapse the list you
  // picked it from. Counts are the reachable row count under the other two
  // filters, which is what makes the list worth reading before clicking.
  const countryOptions = useMemo<MultiOption[]>(() => {
    if (!clicks) return [];
    const counts = new Map<string, number>();
    for (const c of clicks) {
      if (eventFilter !== "all" && c.event !== eventFilter) continue;
      if (!matchesQuery(c, query)) continue;
      const code = (c.country ?? "").trim().toUpperCase();
      if (!code) continue;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, label: countryName(value), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [clicks, eventFilter, query]);

  // Two scopes, deliberately.
  //
  // `scoped` applies country + search but NOT the event filter, and feeds the
  // stat tiles. Those tiles *are* the funnel breakdown, so folding the event
  // filter into them would be self-defeating: isolating qualified leads would
  // print "Opened 0 / rate -" and destroy the one number worth reading, the
  // qualification rate for the slice. This way "Poland + Spectra" still
  // reports 40 opened / 12 qualified / 30%.
  //
  // `filtered` adds the event filter and drives the chart, both breakdowns and
  // the table - the surfaces where isolating one side of the funnel is the
  // whole point.
  const scoped = useMemo(() => {
    if (!clicks) return null;
    const wanted = new Set(countries);
    return clicks.filter((c) => {
      if (wanted.size > 0) {
        const code = (c.country ?? "").trim().toUpperCase();
        if (!wanted.has(code)) return false;
      }
      return matchesQuery(c, query);
    });
  }, [clicks, countries, query]);

  const filtered = useMemo(() => {
    if (!scoped) return null;
    if (eventFilter === "all") return scoped;
    return scoped.filter((c) => c.event === eventFilter);
  }, [scoped, eventFilter]);

  const filtersActive =
    eventFilter !== "all" || countries.length > 0 || query.trim() !== "";

  const stats = useMemo(() => {
    if (!scoped) return null;
    const opens = scoped.filter((c) => c.event === "open").length;
    const confirms = scoped.filter((c) => c.event === "confirm").length;
    return {
      opens,
      confirms,
      confirmRate: opens > 0 ? Math.round((confirms / opens) * 100) : null,
      uniqueSessions: new Set(scoped.map((c) => c.session_id)).size,
    };
  }, [scoped]);

  return (
    <div className="uni-hub-test">
      <header className="uni-hub-hero aq-hero-slim aq-hero-fullwidth">
        <div className="uni-hub-hero-headline">
          <div style={{ width: "100%" }}>
            <h1 className="uni-hub-h1">Report Outbound Clicks</h1>
            <p className="uni-hub-sub aq-sub-full">
              Clicks leaving the /report pages for third-party venues. Tracked
              separately from the into-app funnel: an &ldquo;Opened&rdquo; is an
              Open-button click that opened the leave-site prompt; a
              &ldquo;Qualified lead&rdquo; is an &ldquo;I understand&rdquo;
              confirmation that followed through. Only qualified leads count as
              leads. Same session, source and geo fields as the rest of the
              control room.
            </p>
          </div>
        </div>
      </header>

      {clicks && (
        <FilterBar
          eventFilter={eventFilter}
          onEventFilter={setEventFilter}
          countries={countries}
          onCountries={setCountries}
          countryOptions={countryOptions}
          query={query}
          onQuery={setQuery}
          shown={filtered?.length ?? 0}
          total={clicks.length}
          filtersActive={filtersActive}
          onClear={() => {
            setEventFilter("all");
            setCountries([]);
            setQuery("");
          }}
        />
      )}

      <div
        className="uni-hub-stats"
        role="group"
        aria-label="Report click summary"
        style={{
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          marginBottom: 32,
        }}
      >
        <Stat label="Opened" value={stats?.opens} />
        <Stat label="Qualified leads" value={stats?.confirms} />
        <Stat
          label="Qualification rate"
          value={stats?.confirmRate ?? undefined}
          suffix="%"
        />
        <Stat label="Unique sessions" value={stats?.uniqueSessions} />
      </div>

      {error && (
        <div className="uni-hub-empty" style={{ color: "#b91c1c" }}>
          Could not load report clicks: {error}
        </div>
      )}

      {clicks === null && !error && (
        <div className="uni-hub-empty">Loading report clicks…</div>
      )}

      {filtered && (
        <>
          <ChartSection
            clicks={filtered}
            eventFilter={eventFilter}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
          />
          <ProductBreakdownSection clicks={filtered} />
          <RankBreakdownSection clicks={filtered} />
          {/* Slice AFTER filtering, so a search surfaces the newest 200
              matching rows rather than only matches that happen to fall
              inside the newest 200 overall. */}
          <TableSection
            clicks={filtered.slice(0, ROWS_DISPLAY_LIMIT)}
            totalMatching={filtered.length}
            filtersActive={filtersActive}
          />
        </>
      )}
    </div>
  );
}

// One control row, matching the Live Feed filter bar: segmented event view,
// searchable country multi-select, free-text search, then a live match count.
function FilterBar({
  eventFilter,
  onEventFilter,
  countries,
  onCountries,
  countryOptions,
  query,
  onQuery,
  shown,
  total,
  filtersActive,
  onClear,
}: {
  eventFilter: EventFilter;
  onEventFilter: (v: EventFilter) => void;
  countries: string[];
  onCountries: (v: string[]) => void;
  countryOptions: MultiOption[];
  query: string;
  onQuery: (v: string) => void;
  shown: number;
  total: number;
  filtersActive: boolean;
  onClear: () => void;
}) {
  return (
    <div className="lf-filterbar" style={{ marginBottom: 20 }}>
      <span className="lf-filter-grp">
        <div className="aq-timeframe" role="tablist" aria-label="Event filter">
          {EVENT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={eventFilter === o.value}
              className={`aq-timeframe-tab${eventFilter === o.value ? " active" : ""}`}
              onClick={() => onEventFilter(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <FilterHint label="About the event filter">
          <strong>Opened</strong> is an Open-button click that opened the
          leave-site prompt. <strong>Qualified</strong> is an &ldquo;I
          understand&rdquo; confirmation, meaning the visitor actually went
          through to the venue. Only qualified count as leads. The four tiles
          above always show both halves for the current country and search, so
          the qualification rate stays readable while you isolate one side here.
        </FilterHint>
      </span>

      <span className="lf-filter-grp">
        <MultiSelect
          values={countries}
          onChange={onCountries}
          options={countryOptions}
          allLabel="All countries"
          searchPlaceholder="Search countries…"
          ariaLabel="Country filter"
          unit="countries"
        />
        <FilterHint label="About the country filter">
          Pick one or several countries. The list holds only countries present
          in the loaded rows, most-seen first, and each count reflects the
          current event and search filters.
        </FilterHint>
      </span>

      <input
        type="search"
        className="lf-select"
        placeholder="Search venue, product, city, session…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        // .lf-select paints a dropdown chevron via background-image, which is
        // a false affordance on a text input.
        style={{ minWidth: 260, backgroundImage: "none", cursor: "text" }}
        aria-label="Search report clicks"
      />

      <span className="uni-hub-section-meta">
        {shown.toLocaleString("en-US")}
        {filtersActive ? ` of ${total.toLocaleString("en-US")}` : ""} rows
      </span>

      {filtersActive && (
        <button type="button" className="aq-timeframe-tab" onClick={onClear}>
          Clear filters
        </button>
      )}
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

function ChartSection({
  clicks,
  eventFilter,
  timeframe,
  onTimeframeChange,
}: {
  clicks: ReportClick[];
  eventFilter: EventFilter;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}) {
  const [hovered, setHovered] = useState<{ v: number; daysAgo: number } | null>(
    null,
  );

  // Default to charting the "confirm" events - the clicks that actually left
  // the site. When the operator has isolated Opened, chart that instead, so
  // the bars always match the view they selected rather than silently showing
  // a series the filter excluded. Under "Qualified" the rows are already all
  // confirms, so the filter below is a no-op.
  const chartingOpens = eventFilter === "open";
  const confirms = useMemo(
    () => (chartingOpens ? clicks : clicks.filter((c) => c.event === "confirm")),
    [clicks, chartingOpens],
  );
  const noun = chartingOpens ? "opens" : "venue click-throughs";

  const oldestMs = useMemo(() => {
    if (confirms.length === 0) return null;
    let oldest = Infinity;
    for (const c of confirms) {
      const t = new Date(c.created_at).getTime();
      if (t < oldest) oldest = t;
    }
    return Number.isFinite(oldest) ? oldest : null;
  }, [confirms]);
  const days = resolveDays(timeframe, oldestMs);

  const { bins, max, total, latest, peak } = useMemo(() => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const out: { v: number; daysAgo: number }[] = [];
    for (let i = 0; i < days; i++) {
      out.push({ v: 0, daysAgo: days - 1 - i });
    }
    let inWindow = 0;
    for (const c of confirms) {
      const daysAgo = Math.floor(
        (now - new Date(c.created_at).getTime()) / dayMs,
      );
      if (daysAgo >= 0 && daysAgo < days) {
        out[days - 1 - daysAgo].v++;
        inWindow++;
      }
    }
    const m = Math.max(1, ...out.map((b) => b.v));
    return {
      bins: out,
      max: m,
      total: inWindow,
      latest: out[out.length - 1]?.v ?? 0,
      peak: m,
    };
  }, [confirms, days]);

  const displayValue = hovered ? hovered.v : total;
  const displayLabel = hovered
    ? `${noun} ${labelForDaysAgo(hovered.daysAgo)}`
    : `${noun} across the trailing ${days} days`;

  return (
    <section className="uni-hub-section" style={{ marginTop: 0 }}>
      <header className="uni-hub-section-head">
        <div className="aq-section-head-left">
          <h2 className="uni-hub-section-title">
            {chartingOpens ? "Opens" : "Click-throughs"}, last {days} days
          </h2>
          <span className="uni-hub-section-meta">
            today {latest.toLocaleString("en-US")} · peak{" "}
            {peak.toLocaleString("en-US")}/day
          </span>
        </div>
        <TimeframeSelector value={timeframe} onChange={onTimeframeChange} />
      </header>
      <div className="aq-chart-card">
        <div className="aq-chart-bignum">
          {displayValue.toLocaleString("en-US")}
        </div>
        <div className="aq-chart-bignum-label">{displayLabel}</div>

        <div className="aq-chart">
          <div className="aq-chart-bars">
            {bins.map((b, i) => {
              const heightPct = Math.max((b.v / max) * 100, b.v > 0 ? 4 : 0);
              return (
                <div
                  key={i}
                  className="aq-bar-col"
                  title={`${b.v} click${b.v === 1 ? "" : "s"} (${labelForDaysAgo(b.daysAgo)})`}
                  onMouseEnter={() => setHovered(b)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div className="aq-bar" style={{ height: `${heightPct}%` }} />
                </div>
              );
            })}
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

function labelForDaysAgo(d: number): string {
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

interface BreakdownRow {
  key: string;
  label: string;
  opens: number;
  confirms: number;
  total: number;
}

// Ranked horizontal-bar list, in the same visual spirit as the aq-chart bars
// but laid out as rows. Each row: label, a proportional bar, and Opens /
// Qualified-leads counts.
function BreakdownBars({ rows }: { rows: BreakdownRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => {
        const widthPct = Math.max((r.total / max) * 100, r.total > 0 ? 4 : 0);
        return (
          <div key={r.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 600, color: "#2b2a26" }}>{r.label}</span>
              <span style={{ fontSize: 12, color: "#6e6c66", whiteSpace: "nowrap" }}>
                {r.opens.toLocaleString("en-US")} opened ·{" "}
                <span style={{ color: "#1c7d47", fontWeight: 600 }}>
                  {r.confirms.toLocaleString("en-US")} qualified
                </span>
              </span>
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: "rgba(0,0,0,0.06)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${widthPct}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "rgba(34,160,90,0.55)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProductBreakdownSection({ clicks }: { clicks: ReportClick[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, BreakdownRow>();
    for (const c of clicks) {
      const { key, label } = productIdentity(c);
      const existing = map.get(key) ?? {
        key,
        label,
        opens: 0,
        confirms: 0,
        total: 0,
      };
      // Prefer the richest label seen for this product (a detailed product
      // string beats a slug-derived one), so a group's label is stable
      // regardless of which click is processed first.
      if (label.includes("·") && !existing.label.includes("·")) {
        existing.label = label;
      }
      if (c.event === "open") existing.opens++;
      else if (c.event === "confirm") existing.confirms++;
      existing.total++;
      map.set(key, existing);
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [clicks]);

  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <h2 className="uni-hub-section-title">Top products by clicks</h2>
        <span className="uni-hub-section-meta">which products people click to</span>
      </header>
      {rows.length === 0 ? (
        <div className="uni-hub-empty">No product clicks captured yet.</div>
      ) : (
        <div className="aq-chart-card">
          <BreakdownBars rows={rows} />
        </div>
      )}
    </section>
  );
}

function RankBreakdownSection({ clicks }: { clicks: ReportClick[] }) {
  const rows = useMemo(() => {
    const map = new Map<number, BreakdownRow>();
    for (const c of clicks) {
      if (c.rank == null) continue;
      const existing = map.get(c.rank) ?? {
        key: String(c.rank),
        label: `#${c.rank}`,
        opens: 0,
        confirms: 0,
        total: 0,
      };
      if (c.event === "open") existing.opens++;
      else if (c.event === "confirm") existing.confirms++;
      existing.total++;
      map.set(c.rank, existing);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, row]) => row);
  }, [clicks]);

  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <h2 className="uni-hub-section-title">Ranking position by clicks</h2>
        <span className="uni-hub-section-meta">
          which position on the ranking gets most clicks
        </span>
      </header>
      {rows.length === 0 ? (
        <div className="uni-hub-empty">No ranked-position clicks captured yet.</div>
      ) : (
        <div className="aq-chart-card">
          <BreakdownBars rows={rows} />
        </div>
      )}
    </section>
  );
}

function TableSection({
  clicks,
  totalMatching,
  filtersActive,
}: {
  clicks: ReportClick[];
  totalMatching: number;
  filtersActive: boolean;
}) {
  const truncated = totalMatching > clicks.length;
  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <h2 className="uni-hub-section-title">
          {filtersActive ? "Matching clicks" : "Recent clicks"}
        </h2>
        <span className="uni-hub-section-meta">
          {truncated
            ? `showing latest ${clicks.length.toLocaleString("en-US")} of ${totalMatching.toLocaleString("en-US")}`
            : `showing latest ${clicks.length.toLocaleString("en-US")}`}
        </span>
      </header>

      {clicks.length === 0 ? (
        <div className="uni-hub-empty">
          {filtersActive ? (
            <>
              No clicks match these filters. Widen the event view, clear a
              country, or shorten the search.
            </>
          ) : (
            <>
              No report clicks captured yet. Once a visitor accepts the cookie
              banner and clicks Discover / Visit (or &ldquo;I understand&rdquo;)
              on a /report page, rows will land here. If this stays empty after
              real clicks, confirm the report_outbound_clicks table exists in
              Supabase.
            </>
          )}
        </div>
      ) : (
        <div className="hub-table-wrap aq-recent-wrap">
          <div className="hub-table aq-clicks-table aq-recent-table">
            <div className="hub-thead" style={{ gridTemplateColumns: TABLE_COLS }}>
              <span className="hub-th">Time</span>
              <span className="hub-th">Venue</span>
              <span className="hub-th">Event</span>
              <span className="hub-th">Pos</span>
              <span className="hub-th">Network</span>
              <span className="hub-th">Source</span>
              <span className="hub-th">Country</span>
              <span className="hub-th">Device</span>
              <span className="hub-th">Session</span>
            </div>
            {clicks.map((c) => (
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
                      {venueLabel(c)}
                    </a>
                  ) : (
                    venueLabel(c)
                  )}
                </span>
                <span className="hub-cell">
                  <EventChip event={c.event} />
                </span>
                <span className="hub-cell aq-cell-text">
                  {c.rank != null ? `#${c.rank}` : "—"}
                </span>
                <span className="hub-cell aq-cell-text">{c.chain ?? "—"}</span>
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
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function venueLabel(c: ReportClick): string {
  const platform = c.platform ?? "Unknown";
  return c.product ? `${platform} · ${c.product}` : platform;
}

// Token casing for humanizing a venue_ref slug into a readable product name.
const REF_TOKEN_CASE: Record<string, string> = {
  pt: "PT",
  yt: "YT",
  lp: "LP",
  fxrp: "FXRP",
  stxrp: "stXRP",
  cbxrp: "cbXRP",
  csxrp: "csXRP",
  xrp: "XRP",
  wxrp: "wXRP",
  weth: "WETH",
  cbbtc: "cbBTC",
  mxrpy: "MXRPY",
  bizfxrp: "bizFXRP",
  earnxrp: "earnXRP",
  metavault: "MetaVault",
  sparkdex: "SparkDEX",
};

function humanizeRef(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map(
      (t) => REF_TOKEN_CASE[t.toLowerCase()] ?? t.charAt(0).toUpperCase() + t.slice(1),
    )
    .join(" ");
}

// Precise product identity for the "Top products by clicks" breakdown.
//
// venue_ref ("ranking:spectra-pt-nov-2026" | "venue:spectra-metavault-fxrp") is
// the unique, always-present product id, so it distinguishes every Spectra
// market — PT vs pool vs MetaVault — down the long tail, even for rows tracked
// before the product string carried that detail. We group by the slug (so
// ranking + venue-card clicks for the same product merge, and same-named
// products on different venues never collide) and label with the richest
// string available: the detailed tracked product when present, otherwise the
// humanized slug (e.g. "Spectra PT Nov 2026", "Spectra MetaVault FXRP").
function productIdentity(c: ReportClick): { key: string; label: string } {
  const ref = (c.venue_ref ?? "").replace(/^(ranking|venue):/, "").trim();
  const detailed = !!c.product && c.product.includes("·");
  let label: string;
  if (detailed) {
    label =
      c.platform && !c.product!.includes(c.platform)
        ? `${c.product} · ${c.platform}`
        : c.product!;
  } else if (ref) {
    label = humanizeRef(ref);
  } else {
    label = c.product ?? c.platform ?? "Unknown";
  }
  const key = ref || label;
  return { key, label };
}

function EventChip({ event }: { event: string | null }) {
  const isConfirm = event === "confirm";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 9px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        background: isConfirm ? "rgba(34,160,90,0.14)" : "rgba(0,0,0,0.06)",
        color: isConfirm ? "#1c7d47" : "#6e6c66",
      }}
    >
      {event === "confirm"
        ? "Qualified lead"
        : event === "open"
          ? "Opened"
          : (event ?? "—")}
    </span>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
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
