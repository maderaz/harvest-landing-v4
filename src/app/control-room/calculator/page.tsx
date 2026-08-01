"use client";

// Control Room > Reports > Rich List Calculator.
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

const ROWS_FETCH_LIMIT = 5000;
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
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const [countries, setCountries] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const data = await supabaseSelect<CalcEvent>(
        "richlist_calculator_events",
        `select=*&order=created_at.desc&limit=${ROWS_FETCH_LIMIT}`,
      );
      if (alive) setRows(data);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Timeframe first, then country, so the country counts in the picker
  // describe the window the operator is actually looking at.
  const scoped = useMemo(() => {
    if (!rows) return null;
    if (timeframe === "all") return rows;
    // "all" is handled above, so the oldest row only matters as the span
    // resolveDays falls back to; rows arrive newest-first.
    const oldestMs = rows.length
      ? new Date(rows[rows.length - 1].created_at).getTime()
      : null;
    const cut = Date.now() - resolveDays(timeframe, oldestMs) * 86_400_000;
    return rows.filter((r) => new Date(r.created_at).getTime() >= cut);
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
    const toReport = ctas.filter((r) => r.cta === "earn-on-xrp").length;
    const toRanking = ctas.filter((r) => r.cta === "top-accounts").length;
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
    };
  }, [filtered]);

  const tiers = useMemo(() => {
    if (!filtered) return [];
    const counts = new Map<string, number>();
    for (const r of filtered) {
      if (r.event !== "result" || !r.tier) continue;
      counts.set(r.tier, (counts.get(r.tier) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    return TIER_ORDER.filter((t) => counts.has(t)).map((t) => ({
      tier: t,
      n: counts.get(t) ?? 0,
      pct: total > 0 ? Math.round(((counts.get(t) ?? 0) / total) * 100) : 0,
    }));
  }, [filtered]);

  const recent = useMemo(
    () => (filtered ? filtered.slice(0, ROWS_DISPLAY_LIMIT) : []),
    [filtered],
  );

  return (
    <div className="uni-hub-test">
      <header className="uni-hub-hero aq-hero-slim aq-hero-fullwidth">
        <div className="uni-hub-hero-headline">
          <div style={{ width: "100%" }}>
            <h1 className="uni-hub-h1">Rich List Calculator</h1>
            <p className="uni-hub-sub aq-sub-full">
              Interactions with the percentile calculator on /xrp-rich-list.
              &ldquo;Started&rdquo; is a Start check press with a balance
              typed; &ldquo;Results shown&rdquo; is a rank rendered, and the
              gap between them is people leaving during the check. The two
              buttons under a result are tracked separately, so the click
              -through into the XRP yield report can be read on its own. The
              balance a visitor types is never recorded, which is why results
              are grouped by percentile band rather than by amount.
            </p>
          </div>
        </div>
      </header>

      <div className="aq-filterbar">
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

      <div
        className="uni-hub-stats"
        role="group"
        aria-label="Calculator summary"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 32 }}
      >
        <Stat label="Started" value={stats?.starts} />
        <Stat label="Results shown" value={stats?.results} />
        <Stat label="Completion rate" value={stats?.completion ?? undefined} suffix="%" />
        <Stat label="Unique sessions" value={stats?.sessions} />
      </div>

      <div
        className="uni-hub-stats"
        role="group"
        aria-label="Onward clicks"
        style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginBottom: 32 }}
      >
        <Stat label="Into the yield report" value={stats?.toReport} />
        <Stat label="Into the ranking" value={stats?.toRanking} />
        <Stat
          label="Report click-through"
          value={stats?.reportCtr ?? undefined}
          suffix="%"
        />
      </div>

      {tiers.length > 0 && (
        <section className="aq-chart-card" style={{ marginBottom: 32 }}>
          <div className="aq-chart-bignum-label" style={{ marginBottom: 12 }}>
            Where visitors land, by percentile band
          </div>
          <table className="uni-hub-table">
            <thead>
              <tr>
                <th scope="col">Band</th>
                <th scope="col">Results</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.tier}>
                  <td>{t.tier}</td>
                  <td>{t.n.toLocaleString("en-US")}</td>
                  <td>{t.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <table className="uni-hub-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Event</th>
                <th scope="col">Band / target</th>
                <th scope="col">Source</th>
                <th scope="col">Country</th>
                <th scope="col">Device</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString("en-GB")}</td>
                  <td>{r.event ?? "—"}</td>
                  <td>{r.tier ?? r.cta ?? "—"}</td>
                  <td>{r.source ?? "—"}</td>
                  <td>
                    {r.country ? (
                      <>
                        <CountryFlag country={r.country} /> {countryName(r.country)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{r.device_type ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
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
