"use client";

// Admin > Live Feed. The heart of Harvest activity in one reverse-chron
// stream, merging four real Supabase sources:
//   - frontpage_visits     -> page views (real source + country)
//   - outbound_clicks      -> [View strategy] CTA clicks into the app
//   - vault_events_prod    -> on-chain deposits / withdrawals
//   - wallet_connections_prod (wallet <-> session_id) -> the join that
//     attributes an on-chain event back to the index session that drove
//     it, now that the app persists the hsid as session_id.
//
// Attribution (first-touch):
//   event.wallet -> wallet_connections_prod.session_id
//                -> frontpage_visits/outbound_clicks.session_id -> source
// A funnel-linked app event whose session reached us directly reads
// "Homepage" (owned); one that arrived via Google/Reddit/etc. keeps that
// channel; an event from a wallet that never touched the index reads
// "External". The "Product / Page" column shows the visited URL for a
// visit and the front-end product name (mapped from slug/address) for a
// click or on-chain event.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseSelect } from "@/lib/supabase";
import { CountryFlag } from "@/components/admin/country-flag";
import "../../_styles/asset-hub.css";

interface VaultEventRow {
  tx_hash: string;
  log_index: number;
  block_timestamp: string;
  chain: string;
  vault_address: string;
  vault_slug: string | null;
  event_type: "deposit" | "withdraw" | "transfer";
  wallet_address: string;
}
interface VisitRow {
  created_at: string;
  session_id: string;
  page_path: string;
  source: string | null;
  country: string | null;
}
interface ClickRow {
  created_at: string;
  session_id: string;
  vault_slug: string | null;
  source_page: string;
  target_url: string;
  source: string | null;
  country: string | null;
}
interface ConnectionRow {
  wallet_address: string;
  connected_at: string;
  session_id: string | null;
}

type FeedItem =
  | {
      kind: "visit";
      id: string;
      time: string;
      channel: string;
      country: string | null;
      pagePath: string;
    }
  | {
      kind: "click";
      id: string;
      time: string;
      channel: string;
      country: string | null;
      vaultSlug: string | null;
      sourcePage: string;
      targetUrl: string;
    }
  | {
      kind: "event";
      id: string;
      time: string;
      channel: string;
      country: string | null;
      attributed: boolean;
      upstream: string | null;
      eventType: "deposit" | "withdraw";
      wallet: string;
      vaultSlug: string | null;
      vaultAddress: string;
      chain: string;
      tx: string;
    };

type ActivityFilter = "all" | "visits" | "clicks" | "deposits" | "withdrawals";
const ACTIVITY_OPTIONS: ReadonlyArray<{ value: ActivityFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "visits", label: "Visits" },
  { value: "clicks", label: "Clicks" },
  { value: "deposits", label: "Deposits" },
  { value: "withdrawals", label: "Withdrawals" },
];

const DISPLAY_LIMIT = 200; // rows rendered
const FETCH_LIMIT = 500; // visits/clicks/events pulled for merge + map
const MAP_LIMIT = 2000; // connections pulled for the attribution map only
const FEED_COLS = "132px 132px 92px 104px minmax(170px, 1.7fr) 128px 54px";

// ── Source channel classification ──────────────────────────────────
// Visit / click sources arrive as a referrer URL or utm_source string.
function classifyChannel(raw: string | null): string {
  if (!raw) return "Direct";
  const s = raw.toLowerCase();
  if (s.includes("google")) return "Google";
  if (s.includes("bing")) return "Bing";
  if (s.includes("duckduckgo")) return "DuckDuckGo";
  if (s.includes("chatgpt") || s.includes("openai")) return "ChatGPT";
  if (s.includes("perplexity")) return "Perplexity";
  if (s.includes("claude") || s.includes("anthropic")) return "Claude";
  if (s.includes("gemini")) return "Gemini";
  if (s.includes("t.co") || s.includes("twitter") || s.includes("x.com")) return "X / Twitter";
  if (s.includes("reddit")) return "Reddit";
  if (s.includes("github")) return "GitHub";
  if (s.includes("t.me") || s.includes("telegram")) return "Telegram";
  if (s.includes("discord")) return "Discord";
  if (s.includes("medium")) return "Medium";
  if (s.includes("harvest.finance")) return "Homepage";
  if (s === "direct" || s === "(direct)" || s === "(none)") return "Direct";
  return "Referral";
}

// App-side events (clicks, deposits, withdrawals) entered the app from
// our index, so a bare "Direct" session reads as "Homepage" (owned) -
// they came straight to us and through the CTA. A real external channel
// (Google, Reddit, ...) is kept since it's the more useful first touch.
function appChannel(raw: string | null): string {
  const c = classifyChannel(raw);
  return c === "Direct" ? "Homepage" : c;
}

function channelTone(
  name: string,
): "search" | "ai" | "social" | "owned" | "direct" | "external" | "neutral" {
  if (name === "Google" || name === "Bing" || name === "DuckDuckGo") return "search";
  if (name === "ChatGPT" || name === "Perplexity" || name === "Claude" || name === "Gemini") return "ai";
  if (
    name === "X / Twitter" || name === "Reddit" || name === "Discord" ||
    name === "Telegram" || name === "GitHub" || name === "Medium"
  )
    return "social";
  if (name === "Homepage") return "owned";
  if (name === "External") return "external";
  if (name === "Direct") return "direct";
  return "neutral";
}

// ── Sample fallback (only when every real source is empty) ──────────
const SAMPLE_VISIT_SEED: ReadonlyArray<{ page: string; source: string; country: string; minsAgo: number }> = [
  { page: "/", source: "https://www.google.com/", country: "US", minsAgo: 1 },
  { page: "/usdc", source: "chatgpt.com", country: "GB", minsAgo: 5 },
  { page: "/eth", source: "(direct)", country: "DE", minsAgo: 14 },
  { page: "/arbitrum", source: "https://t.co/", country: "BR", minsAgo: 33 },
  { page: "/btc", source: "https://www.reddit.com/", country: "IN", minsAgo: 70 },
  { page: "/methodology", source: "perplexity.ai", country: "CA", minsAgo: 150 },
];
const SAMPLE_EVENT_SEED: ReadonlyArray<{ slug: string; chain: string; type: "deposit" | "withdraw"; wallet: string; channel: string; country: string; minsAgo: number }> = [
  { slug: "weth-autopilot-base", chain: "Base", type: "deposit", wallet: "0x417c8e123e5d0f3e0a0c0ee171606e61ccb637df", channel: "Homepage", country: "PL", minsAgo: 3 },
  { slug: "usdc-aerodrome-aero-base", chain: "Base", type: "deposit", wallet: "0x8a3fce21b9d47a0c6f5e2d18b4c7a90e3f1d6b24", channel: "Google", country: "US", minsAgo: 28 },
  { slug: "usdc-hypurr-hyperevm", chain: "HyperEVM", type: "withdraw", wallet: "0xa07f3c91e6b2d8540c19a3f7b08e2d45c6019e8b", channel: "External", country: "DE", minsAgo: 96 },
];
const SAMPLE_CLICK_SEED: ReadonlyArray<{ slug: string; source: string; country: string; minsAgo: number }> = [
  { slug: "weth-autopilot-base", source: "(direct)", country: "PL", minsAgo: 4 },
  { slug: "usdc-aerodrome-aero-base", source: "https://www.google.com/", country: "US", minsAgo: 30 },
];
const SAMPLE_TX: readonly string[] = [
  "0x9f2c1ab73e08d45c6a1f90b3e27d4c85a06f1e93b2d7c40859a1e6f3c08d24b71",
  "0x3b7e0d92a14c6f85309e1b4a7c0d28f6e5a9c1340b8d6e2f7019a4c83e6d50f29",
  "0xc1a6e3920d74b85f016c9a3e7b0d42f8e5690a1c34b7d6e2f80193a4c56e0d8b9",
];

export function LiveFeed({ productNames }: { productNames: Record<string, string> }) {
  const [visits, setVisits] = useState<VisitRow[] | null>(null);
  const [clicks, setClicks] = useState<ClickRow[] | null>(null);
  const [events, setEvents] = useState<VaultEventRow[] | null>(null);
  const [connections, setConnections] = useState<ConnectionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [v, c, e, w] = await Promise.all([
          supabaseSelect<VisitRow>(
            "frontpage_visits",
            `select=created_at,session_id,page_path,source,country&order=created_at.desc&limit=${FETCH_LIMIT}`,
          ),
          supabaseSelect<ClickRow>(
            "outbound_clicks",
            `select=created_at,session_id,vault_slug,source_page,target_url,source,country&order=created_at.desc&limit=${FETCH_LIMIT}`,
          ),
          supabaseSelect<VaultEventRow>(
            "vault_events_prod",
            `select=tx_hash,log_index,block_timestamp,chain,vault_address,vault_slug,event_type,wallet_address&event_type=in.(deposit,withdraw)&order=block_timestamp.desc&limit=${FETCH_LIMIT}`,
          ),
          supabaseSelect<ConnectionRow>(
            "wallet_connections_prod",
            `select=wallet_address,connected_at,session_id&order=connected_at.desc&limit=${MAP_LIMIT}`,
          ),
        ]);
        if (cancelled) return;
        setVisits(v);
        setClicks(c);
        setEvents(e);
        setConnections(w);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loaded =
    visits !== null && clicks !== null && events !== null && connections !== null;
  const realEmpty =
    loaded &&
    visits!.length === 0 &&
    clicks!.length === 0 &&
    events!.length === 0;

  // session_id -> earliest-touch { source, country } from visits, then
  // clicks as a backfill for sessions that never logged a page view.
  const sessionFirstTouch = useMemo(() => {
    const m = new Map<string, { source: string | null; country: string | null; t: number }>();
    const consider = (sid: string | null, source: string | null, country: string | null, iso: string) => {
      if (!sid) return;
      const t = new Date(iso).getTime();
      const prev = m.get(sid);
      if (!prev || t < prev.t) m.set(sid, { source, country, t });
    };
    for (const v of visits ?? []) consider(v.session_id, v.source, v.country, v.created_at);
    for (const c of clicks ?? []) consider(c.session_id, c.source, c.country, c.created_at);
    return m;
  }, [visits, clicks]);

  // wallet (lowercased) -> earliest connection session_id.
  const walletSession = useMemo(() => {
    const m = new Map<string, { session: string | null; t: number }>();
    for (const w of connections ?? []) {
      const a = (w.wallet_address || "").toLowerCase();
      if (!a) continue;
      const t = new Date(w.connected_at).getTime();
      const prev = m.get(a);
      if (!prev || t < prev.t) m.set(a, { session: w.session_id, t });
    }
    return m;
  }, [connections]);

  // Resolve an on-chain event's wallet back to its acquisition source.
  function resolveWallet(wallet: string): {
    channel: string;
    country: string | null;
    attributed: boolean;
    upstream: string | null;
  } {
    const link = walletSession.get((wallet || "").toLowerCase());
    const ft = link?.session ? sessionFirstTouch.get(link.session) : undefined;
    if (!ft) {
      return { channel: "External", country: null, attributed: false, upstream: null };
    }
    return {
      channel: appChannel(ft.source),
      country: ft.country,
      attributed: true,
      upstream: classifyChannel(ft.source),
    };
  }

  const [activity, setActivity] = useState<ActivityFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const items = useMemo<FeedItem[]>(() => {
    if (!loaded) return [];
    const now = Date.now();

    if (realEmpty) {
      // Demo stream so the page isn't blank in a credential-less or
      // brand-new environment. Marked "sample" in the header.
      const sv: FeedItem[] = SAMPLE_VISIT_SEED.map((v, i) => ({
        kind: "visit",
        id: `sv-${i}`,
        time: new Date(now - v.minsAgo * 60_000).toISOString(),
        channel: classifyChannel(v.source),
        country: v.country,
        pagePath: v.page,
      }));
      const sc: FeedItem[] = SAMPLE_CLICK_SEED.map((c, i) => ({
        kind: "click",
        id: `sc-${i}`,
        time: new Date(now - c.minsAgo * 60_000).toISOString(),
        channel: appChannel(c.source),
        country: c.country,
        vaultSlug: c.slug,
        sourcePage: `/${c.slug}`,
        targetUrl: "https://app.harvest.finance/",
      }));
      const se: FeedItem[] = SAMPLE_EVENT_SEED.map((s, i) => ({
        kind: "event",
        id: `se-${i}`,
        time: new Date(now - s.minsAgo * 60_000).toISOString(),
        channel: s.channel,
        country: s.country,
        attributed: s.channel !== "External",
        upstream: s.channel,
        eventType: s.type,
        wallet: s.wallet,
        vaultSlug: s.slug,
        vaultAddress: "0x0000000000000000000000000000000000000000",
        chain: s.chain,
        tx: SAMPLE_TX[i],
      }));
      return [...sv, ...sc, ...se].sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
      );
    }

    const merged: FeedItem[] = [
      ...(visits ?? []).map((v, i) => ({
        kind: "visit" as const,
        id: `v-${v.session_id}-${v.created_at}-${i}`,
        time: v.created_at,
        channel: classifyChannel(v.source),
        country: v.country,
        pagePath: v.page_path || "/",
      })),
      ...(clicks ?? []).map((c, i) => ({
        kind: "click" as const,
        id: `c-${c.session_id}-${c.created_at}-${i}`,
        time: c.created_at,
        channel: appChannel(c.source),
        country: c.country,
        vaultSlug: c.vault_slug,
        sourcePage: c.source_page || "/",
        targetUrl: c.target_url,
      })),
      ...(events ?? []).map((e) => {
        const r = resolveWallet(e.wallet_address);
        return {
          kind: "event" as const,
          id: `e-${e.tx_hash}-${e.log_index}`,
          time: e.block_timestamp,
          channel: r.channel,
          country: r.country,
          attributed: r.attributed,
          upstream: r.upstream,
          eventType: e.event_type as "deposit" | "withdraw",
          wallet: e.wallet_address,
          vaultSlug: e.vault_slug,
          vaultAddress: e.vault_address,
          chain: e.chain,
          tx: e.tx_hash,
        };
      }),
    ];
    return merged
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, DISPLAY_LIMIT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits, clicks, events, walletSession, sessionFirstTouch, loaded, realEmpty]);

  const availableSources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.channel, (counts.get(it.channel) ?? 0) + 1);
    return [...counts.keys()].sort(
      (a, b) => (counts.get(b)! - counts.get(a)!) || a.localeCompare(b),
    );
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((it) => {
        if (sourceFilter !== "all" && it.channel !== sourceFilter) return false;
        switch (activity) {
          case "visits":
            return it.kind === "visit";
          case "clicks":
            return it.kind === "click";
          case "deposits":
            return it.kind === "event" && it.eventType === "deposit";
          case "withdrawals":
            return it.kind === "event" && it.eventType === "withdraw";
          default:
            return true;
        }
      }),
    [items, activity, sourceFilter],
  );

  const loading = !loaded && !err;

  function productLabel(slug: string | null, address?: string): string {
    if (slug && productNames[slug.toLowerCase()]) return productNames[slug.toLowerCase()];
    if (address && productNames[address.toLowerCase()]) return productNames[address.toLowerCase()];
    return slug ?? (address ? shortenAddress(address) : "—");
  }

  return (
    <div className="uni-hub-test">
      <header className="uni-hub-hero aq-hero-slim aq-hero-fullwidth">
        <div className="uni-hub-hero-headline">
          <div style={{ width: "100%" }}>
            <h1 className="uni-hub-h1">Live Feed</h1>
            <p className="uni-hub-sub aq-sub-full">
              The heart of Harvest activity, newest first: front-page views,
              [View strategy] clicks into the app, and on-chain deposits and
              withdrawals. On-chain events are attributed back to the session
              that drove them, so a deposit from a wallet that connected
              through the index reads as Homepage rather than External.
            </p>
          </div>
        </div>
      </header>

      <section className="uni-hub-section" style={{ marginTop: 28 }}>
        <header className="uni-hub-section-head">
          <div className="aq-section-head-left">
            <h2 className="uni-hub-section-title">
              Site &amp; app activity
              {realEmpty && <span className="aq-sample-badge">sample</span>}
            </h2>
            <span className="uni-hub-section-meta">
              {filtered.length === items.length
                ? `${items.length} most recent`
                : `${filtered.length} of ${items.length}`}
              {realEmpty
                ? " · preview data, no live activity yet"
                : " · source attributed first-touch via the wallet-session join"}
            </span>
          </div>
        </header>

        <div className="lf-filterbar">
          <div className="aq-timeframe" role="group" aria-label="Activity filter">
            {ACTIVITY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`aq-timeframe-tab${activity === o.value ? " active" : ""}`}
                aria-pressed={activity === o.value}
                onClick={() => setActivity(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <label className="lf-source-filter">
            <span className="lf-source-filter-label">Source</span>
            <select
              className="lf-select"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="all">All sources</option>
              {availableSources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        {err && (
          <div className="uni-hub-empty" style={{ color: "#b91c1c" }}>
            Could not load activity: {err}
          </div>
        )}

        {loading ? (
          <div className="uni-hub-empty">Loading feed…</div>
        ) : (
          <div className="lf-scroll">
            <div className="uni-hub-table lf-table">
              <div className="uni-hub-thead" style={{ gridTemplateColumns: FEED_COLS }}>
                <span className="uni-hub-th">Time</span>
                <span className="uni-hub-th">Source</span>
                <span className="uni-hub-th">Country</span>
                <span className="uni-hub-th">Event</span>
                <span className="uni-hub-th">Product / Page</span>
                <span className="uni-hub-th">Wallet</span>
                <span className="uni-hub-th">Tx</span>
              </div>
              <div className="uni-hub-tbody">
                {filtered.length === 0 && (
                  <div className="uni-hub-empty">No activity matches this filter.</div>
                )}
                {filtered.map((item) => (
                  <div
                    key={item.id}
                    className="uni-hub-row"
                    style={{ gridTemplateColumns: FEED_COLS }}
                  >
                    <span
                      className="uni-hub-cell lf-time"
                      data-label="Time"
                      title={formatTime(item.time)}
                    >
                      {relativeTime(item.time)}
                    </span>
                    <span className="uni-hub-cell" data-label="Source">
                      <span
                        className={`lf-badge lf-badge-${channelTone(item.channel)}`}
                        title={
                          item.kind === "event" && item.attributed && item.upstream && item.upstream !== item.channel
                            ? `first touch: ${item.upstream}`
                            : undefined
                        }
                      >
                        {item.channel}
                      </span>
                    </span>
                    <span className="uni-hub-cell" data-label="Country">
                      {item.country ? <CountryFlag country={item.country} /> : <span className="lf-dim">—</span>}
                    </span>
                    <span className="uni-hub-cell" data-label="Event">
                      {item.kind === "visit" ? (
                        <span className="lf-event lf-event-visit">
                          <VisitIcon />
                          Visit
                        </span>
                      ) : item.kind === "click" ? (
                        <span className="lf-event lf-event-click">
                          <ClickIcon />
                          App click
                        </span>
                      ) : (
                        <span className={`lf-event lf-event-${item.eventType}`}>
                          <EventIcon type={item.eventType} />
                          {item.eventType}
                        </span>
                      )}
                    </span>
                    <span className="uni-hub-cell lf-product" data-label="Product / Page">
                      {item.kind === "visit" ? (
                        <Link href={item.pagePath} className="lf-product-link">
                          {item.pagePath}
                        </Link>
                      ) : item.kind === "click" ? (
                        item.vaultSlug ? (
                          <Link href={`/${item.vaultSlug}`} className="lf-product-link">
                            {productLabel(item.vaultSlug)}
                          </Link>
                        ) : (
                          <Link href={item.sourcePage} className="lf-product-link">
                            {item.sourcePage}
                          </Link>
                        )
                      ) : item.vaultSlug ? (
                        <Link href={`/${item.vaultSlug}`} className="lf-product-link">
                          {productLabel(item.vaultSlug, item.vaultAddress)}
                        </Link>
                      ) : (
                        <span className="lf-product-link">
                          {productLabel(item.vaultSlug, item.vaultAddress)}
                        </span>
                      )}
                    </span>
                    <span className="uni-hub-cell" data-label="Wallet">
                      {item.kind === "event" ? (
                        <span className="lf-mono">{shortenAddress(item.wallet)}</span>
                      ) : (
                        <span className="lf-dim">—</span>
                      )}
                    </span>
                    <span className="uni-hub-cell" data-label="Tx">
                      {item.kind === "event" ? (
                        <a
                          href={txLink(item.chain, item.tx)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="lf-tx"
                        >
                          view
                        </a>
                      ) : (
                        <span className="lf-dim">—</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function txLink(chain: string, tx: string): string {
  const base =
    chain === "Ethereum"
      ? "https://etherscan.io/tx/"
      : chain === "Base"
        ? "https://basescan.org/tx/"
        : chain === "Polygon"
          ? "https://polygonscan.com/tx/"
          : chain === "Arbitrum"
            ? "https://arbiscan.io/tx/"
            : chain === "HyperEVM"
              ? "https://hyperevmscan.io/tx/"
              : chain === "zkSync"
                ? "https://explorer.zksync.io/tx/"
                : "https://etherscan.io/tx/";
  return base + tx;
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

// "now", "Nm", "Nh" up to a day, then the absolute date.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return "now";
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return formatTime(iso);
}

// Direction arrow: deposit points in (down), withdraw points out (up).
function EventIcon({ type }: { type: "deposit" | "withdraw" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {type === "withdraw" ? (
        <>
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </>
      ) : (
        <>
          <path d="M12 5v14" />
          <path d="m19 12-7 7-7-7" />
        </>
      )}
    </svg>
  );
}

// Eye glyph for a page view.
function VisitIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Pointer/cursor glyph for a CTA click into the app.
function ClickIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 9l5 12 1.8-5.2L21 14 9 9z" />
      <path d="M7.5 3.5 8.5 6" />
      <path d="M3.5 7.5 6 8.5" />
      <path d="M3.5 12.5 6 11.5" />
      <path d="M7.5 16.5 8.5 14" />
    </svg>
  );
}
