"use client";

// AI Traffic - the audit behind the agent-traffic question. Who arrives from an
// AI assistant, where they land, whether they go on into the app, which agents
// ran the tracker, and which referrers the AI channel does not recognise yet.
// Same analysis as supabase/audits/ai-traffic.sql, read with the signed-in
// session so it needs no SQL editor access.
//
// Agents that fetch pages without running JavaScript (how ChatGPT, Perplexity
// and Claude read pages, llms.txt and /data/*.json while answering) never reach
// this tracker. They exist only in Vercel's edge logs.

import { useEffect, useMemo, useState } from "react";
import { supabaseSelectAll } from "@/lib/supabase";
import { isBotRow } from "@/lib/bots";
import { classifyVisit, channelGroup } from "@/lib/channels";
import { agentOf, assistantOf, isAssistantHost, referrerHost } from "@/lib/ai-assistants";
import { InfoTip } from "@/components/admin/info-tip";
import "../../_styles/asset-hub.css";

interface VisitRow {
  created_at: string;
  session_id: string | null;
  page_path: string | null;
  referrer: string | null;
  source: string | null;
  utm_source: string | null;
  user_agent: string | null;
  is_bot: boolean | null;
  device_type: string | null;
  screen_width: number | null;
  screen_height: number | null;
  viewport_width: number | null;
  viewport_height: number | null;
}

interface ClickRow {
  session_id: string | null;
  created_at: string;
}

interface Sess {
  id: string;
  ms: number;
  landing: string;
  referrer: string | null;
  source: string | null;
  utm: string | null;
  bot: boolean;
  assistant: string | null;
}

const FETCH_DAYS = 180;
const WINDOWS = [7, 30, 90, 180] as const;
type Window = (typeof WINDOWS)[number];
const DAY = 86_400_000;

const PALETTE = [
  "#4E79A7", "#F28E2B", "#59A14F", "#E15759", "#76B7B2", "#EDC948",
  "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC", "#1F77B4", "#D62728", "#2CA02C",
];

const DESCRIPTION =
  "People who arrived from an AI assistant's answer, where they landed and " +
  "whether they went on into the app, plus agents that ran the tracker. " +
  "Assistants are recognised more widely than the AI channel, and the " +
  "assistant table shows where that channel files each one today. Agents " +
  "that fetch pages without running JavaScript are not visible here; they " +
  "appear only in Vercel's edge logs. Bots excluded from every human count.";

const fmt = (n: number) => n.toLocaleString("en-US");
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export default function AiTrafficPage() {
  const [visits, setVisits] = useState<VisitRow[] | null>(null);
  const [clicks, setClicks] = useState<ClickRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [win, setWin] = useState<Window>(90);
  // Stamped once when the data arrives, so every window is measured from the
  // same instant and rendering stays pure.
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const started = Date.now();
        const since = new Date(started - FETCH_DAYS * DAY).toISOString();
        const [v, c] = await Promise.all([
          supabaseSelectAll<VisitRow>(
            "frontpage_visits",
            `select=created_at,session_id,page_path,referrer,source,utm_source,user_agent,is_bot,device_type,screen_width,screen_height,viewport_width,viewport_height&created_at=gte.${since}&order=created_at.desc`,
            1000,
            1_000_000,
          ),
          supabaseSelectAll<ClickRow>(
            "outbound_clicks",
            `select=session_id,created_at&created_at=gte.${since}`,
            1000,
            1_000_000,
          ),
        ]);
        if (!cancelled) {
          setLoadedAt(started);
          setVisits(v);
          setClicks(c);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cutoff = loadedAt - win * DAY;

  // One record per session: its first hit is the landing, and the session is a
  // bot if any of its hits looked non-human.
  const sessions = useMemo<Sess[]>(() => {
    if (!visits) return [];
    const m = new Map<string, Sess>();
    for (const v of visits) {
      if (!v.session_id) continue;
      const ms = new Date(v.created_at).getTime();
      if (!Number.isFinite(ms)) continue;
      let s = m.get(v.session_id);
      if (!s || ms < s.ms) {
        const bot = (s?.bot ?? false) || isBotRow(v);
        s = {
          id: v.session_id,
          ms,
          landing: v.page_path || "/",
          referrer: v.referrer,
          source: v.source,
          utm: v.utm_source,
          bot,
          assistant: assistantOf(v.referrer, v.utm_source),
        };
        m.set(v.session_id, s);
      } else if (!s.bot && isBotRow(v)) {
        s.bot = true;
      }
    }
    return [...m.values()];
  }, [visits]);

  const humans = useMemo(() => sessions.filter((s) => !s.bot && s.ms >= cutoff), [sessions, cutoff]);
  const ai = useMemo(() => humans.filter((s) => s.assistant), [humans]);

  const clickedSessions = useMemo(() => {
    const set = new Set<string>();
    for (const c of clicks ?? []) {
      if (c.session_id && new Date(c.created_at).getTime() >= cutoff) set.add(c.session_id);
    }
    return set;
  }, [clicks, cutoff]);

  const byAssistant = useMemo(() => {
    const m = new Map<string, { n: number; first: number; last: number; filed: Map<string, number> }>();
    for (const s of ai) {
      const a = s.assistant as string;
      const e = m.get(a) ?? { n: 0, first: Infinity, last: 0, filed: new Map() };
      e.n++;
      e.first = Math.min(e.first, s.ms);
      e.last = Math.max(e.last, s.ms);
      const ch = classifyVisit(s.source, s.referrer);
      e.filed.set(ch, (e.filed.get(ch) ?? 0) + 1);
      m.set(a, e);
    }
    return [...m.entries()]
      .map(([name, e]) => {
        const filedAs = [...e.filed.entries()].sort((x, y) => y[1] - x[1])[0][0];
        return { name, ...e, filedAs, filedGroup: channelGroup(filedAs) };
      })
      .sort((x, y) => y.n - x.n || x.name.localeCompare(y.name));
  }, [ai]);

  const colorOf = useMemo(() => {
    const c: Record<string, string> = {};
    byAssistant.forEach((a, i) => (c[a.name] = PALETTE[i % PALETTE.length]));
    return c;
  }, [byAssistant]);

  // Weekly stacked bars, oldest on the left.
  const weeks = useMemo(() => {
    const n = Math.ceil(win / 7);
    const out = Array.from({ length: n }, (_, i) => ({ weeksAgo: n - 1 - i, by: {} as Record<string, number>, total: 0 }));
    for (const s of ai) {
      const w = Math.floor((loadedAt - s.ms) / (7 * DAY));
      if (w < 0 || w >= n) continue;
      const b = out[n - 1 - w];
      b.by[s.assistant as string] = (b.by[s.assistant as string] ?? 0) + 1;
      b.total++;
    }
    return out;
  }, [ai, win, loadedAt]);
  const weekMax = Math.max(1, ...weeks.map((w) => w.total));

  const landings = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of ai) m.set(s.landing, (m.get(s.landing) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40);
  }, [ai]);

  const cohorts = useMemo(() => {
    const row = (label: string, list: Sess[]) => {
      const clicked = list.filter((s) => clickedSessions.has(s.id)).length;
      return { label, n: list.length, clicked };
    };
    return [row("AI-referred", ai), row("Everyone else", humans.filter((s) => !s.assistant))];
  }, [ai, humans, clickedSessions]);

  // Every page view in the window, human or not: an agent browser may not be
  // flagged as a bot, and a crawler counts per page it rendered.
  const agents = useMemo(() => {
    const m = new Map<string, { views: number; pages: Set<string>; first: number; last: number }>();
    for (const v of visits ?? []) {
      const ms = new Date(v.created_at).getTime();
      if (ms < cutoff) continue;
      const name = agentOf(v.user_agent) ?? (isBotRow(v) ? "Other flagged bot" : null);
      if (!name) continue;
      const e = m.get(name) ?? { views: 0, pages: new Set<string>(), first: Infinity, last: 0 };
      e.views++;
      e.pages.add(v.page_path || "/");
      e.first = Math.min(e.first, ms);
      e.last = Math.max(e.last, ms);
      m.set(name, e);
    }
    return [...m.entries()].sort((a, b) => b[1].views - a[1].views || a[0].localeCompare(b[0]));
  }, [visits, cutoff]);

  const gaps = useMemo(() => {
    const m = new Map<string, { n: number; filed: string }>();
    for (const s of humans) {
      const host = referrerHost(s.referrer);
      if (!host || host === "harvest.finance" || host.endsWith(".harvest.finance")) continue;
      if (isAssistantHost(s.referrer)) continue;
      const e = m.get(host) ?? { n: 0, filed: classifyVisit(s.source, s.referrer) };
      e.n++;
      m.set(host, e);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0])).slice(0, 60);
  }, [humans]);

  const utms = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of humans) if (s.utm) m.set(s.utm, (m.get(s.utm) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40);
  }, [humans]);

  const misfiled = byAssistant.filter((a) => a.filedGroup !== "AI").reduce((t, a) => t + a.n, 0);
  const aiCohort = cohorts[0];
  const restCohort = cohorts[1];
  const agentViews = agents.filter(([n]) => n !== "Other flagged bot").reduce((t, [, e]) => t + e.views, 0);
  const loading = visits === null && !error;

  return (
    <div className="uni-hub-test lf-page">
      <header className="uni-hub-hero aq-hero-slim aq-hero-fullwidth">
        <div className="uni-hub-hero-headline">
          <div style={{ width: "100%" }}>
            <h1 className="uni-hub-h1">
              AI Traffic
              <InfoTip label="About AI Traffic">{DESCRIPTION}</InfoTip>
            </h1>
            <p className="uni-hub-sub aq-sub-full">{DESCRIPTION}</p>
          </div>
        </div>
      </header>

      <div
        className="uni-hub-stats"
        role="group"
        aria-label="AI traffic summary"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 32 }}
      >
        <Stat label="AI-referred sessions" value={loading ? undefined : fmt(ai.length)} />
        <Stat label="Share of human sessions" value={loading ? undefined : pct(ai.length, humans.length)} />
        <Stat
          label="Into app: AI vs everyone else"
          value={loading ? undefined : `${pct(aiCohort.clicked, aiCohort.n)} vs ${pct(restCohort.clicked, restCohort.n)}`}
        />
        <Stat label="Not in the AI channel today" value={loading ? undefined : fmt(misfiled)} />
      </div>

      {error && (
        <div className="uni-hub-empty" style={{ color: "#b91c1c" }}>
          Could not load traffic: {error}
        </div>
      )}
      {loading && <div className="uni-hub-empty">Loading {FETCH_DAYS} days of visits…</div>}

      {visits && (
        <>
          <section className="uni-hub-section" style={{ marginTop: 0 }}>
            <header className="uni-hub-section-head">
              <div className="aq-section-head-left">
                <h2 className="uni-hub-section-title">AI-referred sessions per week, last {win} days</h2>
                <span className="uni-hub-section-meta">{fmt(ai.length)} sessions</span>
              </div>
              <div className="aq-head-controls">
                <div className="aq-timeframe" role="tablist" aria-label="Window">
                  {WINDOWS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      role="tab"
                      aria-selected={win === w}
                      className={`aq-timeframe-tab${win === w ? " active" : ""}`}
                      onClick={() => setWin(w)}
                    >
                      {w}d
                    </button>
                  ))}
                </div>
              </div>
            </header>
            <div className="aq-chart-card">
              <div className="aq-chart">
                <div className="aq-chart-bars">
                  {weeks.map((w, i) => (
                    <div
                      key={i}
                      className="aq-bar-col"
                      title={`${w.weeksAgo === 0 ? "This week" : `${w.weeksAgo} weeks ago`}: ${
                        Object.entries(w.by)
                          .map(([k, n]) => `${k} ${n}`)
                          .join(", ") || "none"
                      }`}
                    >
                      <div
                        style={{
                          height: `${(w.total / weekMax) * 100}%`,
                          display: "flex",
                          flexDirection: "column-reverse",
                          width: "100%",
                          borderRadius: 4,
                          overflow: "hidden",
                        }}
                      >
                        {byAssistant.map((a) =>
                          w.by[a.name] ? (
                            <div key={a.name} style={{ flex: w.by[a.name], background: colorOf[a.name] }} />
                          ) : null,
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="aq-chart-axis">
                  <span>{Math.ceil(win / 7)} weeks ago</span>
                  <span>this week</span>
                </div>
              </div>
              {byAssistant.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 12, fontSize: 12 }}>
                  {byAssistant.map((a) => (
                    <span key={a.name} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: colorOf[a.name] }} />
                      {a.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <Table
            title="By assistant"
            meta="where the AI channel files each one today"
            cols="1.4fr 0.8fr 0.9fr 1fr 1fr 1.4fr"
            head={["Assistant", "Sessions", "Of human", "First seen", "Last seen", "Filed as today"]}
            rows={byAssistant.map((a) => [
              a.name,
              fmt(a.n),
              pct(a.n, humans.length),
              day(a.first),
              day(a.last),
              a.filedGroup === "AI" ? a.filedAs : `${a.filedAs} (missed)`,
            ])}
            empty="No AI-referred sessions in this window."
          />

          <Table
            title="Where AI-referred people land"
            meta="first page of the session"
            cols="3fr 1fr"
            head={["Landing page", "Sessions"]}
            rows={landings.map(([p, n]) => [p, fmt(n)])}
            empty="No AI-referred sessions in this window."
          />

          <Table
            title="Into the app"
            meta="sessions with at least one click into app.harvest.finance"
            cols="1.6fr 1fr 1.4fr 1fr"
            head={["Cohort", "Sessions", "Clicked into app", "Rate"]}
            rows={cohorts.map((c) => [c.label, fmt(c.n), fmt(c.clicked), pct(c.clicked, c.n)])}
            empty=""
          />

          <Table
            title="Agents and crawlers that ran the tracker"
            meta="page views, any session; plain fetchers cannot appear here"
            cols="2.2fr 1fr 1fr 1fr 1fr"
            head={["Agent", "Page views", "Pages", "First seen", "Last seen"]}
            rows={agents.map(([n, e]) => [n, fmt(e.views), fmt(e.pages.size), day(e.first), day(e.last)])}
            empty="None in this window."
            note={`${fmt(agentViews)} page views from named agents.`}
          />

          <Table
            title="Referrers not recognised as AI"
            meta="scan for assistants the list misses"
            cols="2.4fr 1fr 1.4fr"
            head={["Referrer host", "Sessions", "Filed as today"]}
            rows={gaps.map(([h, e]) => [h, fmt(e.n), e.filed])}
            empty="No external referrers in this window."
          />

          <Table
            title="utm_source values"
            meta="ChatGPT tags its links utm_source=chatgpt.com"
            cols="3fr 1fr"
            head={["utm_source", "Sessions"]}
            rows={utms.map(([u, n]) => [u, fmt(n)])}
            empty="No tagged sessions in this window."
          />
        </>
      )}
    </div>
  );
}

function Table({
  title,
  meta,
  cols,
  head,
  rows,
  empty,
  note,
}: {
  title: string;
  meta: string;
  cols: string;
  head: string[];
  rows: string[][];
  empty: string;
  note?: string;
}) {
  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <div className="aq-section-head-left">
          <h2 className="uni-hub-section-title">{title}</h2>
          <span className="uni-hub-section-meta">{meta}</span>
        </div>
      </header>
      {rows.length === 0 ? (
        empty && <div className="uni-hub-empty">{empty}</div>
      ) : (
        // The recent-events table classes keep every column on narrow screens
        // (the public ranking rules hide columns 4-6) and scroll inside the
        // table instead. Their 1,180px floor suits eight columns; these carry
        // two to six, so the floor scales with the count.
        <div className="hub-table-wrap aq-recent-wrap">
          <div className="hub-table aq-recent-table ai-traffic-table" style={{ minWidth: head.length <= 2 ? 0 : head.length <= 4 ? 520 : 720 }}>
            <div className="hub-thead" style={{ gridTemplateColumns: cols }}>
              {head.map((h) => (
                <span key={h} className="hub-th">
                  {h}
                </span>
              ))}
            </div>
            {rows.map((r, i) => (
              <div className="hub-row" key={i} style={{ gridTemplateColumns: cols }}>
                {r.map((c, j) => (
                  <span key={j} className="hub-cell aq-cell-text">
                    {c}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {note && <p className="uni-hub-section-meta" style={{ marginTop: 8 }}>{note}</p>}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="uni-hub-stat">
      <div className="uni-hub-stat-label">{label}</div>
      <div className="uni-hub-stat-value">{value ?? "—"}</div>
    </div>
  );
}
