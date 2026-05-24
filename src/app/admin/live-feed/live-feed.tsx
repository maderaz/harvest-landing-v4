"use client";

// Admin > Live Feed. The heart of everything happening in Harvest: one
// reverse-chron stream that merges front-page page views (frontpage_
// visits) with in-app deposits and withdrawals (vault_events_prod).
//
// Per-row source resolution:
//  - Visits carry REAL source + country straight from frontpage_visits.
//  - App events (deposit/withdraw) show a sample source + country until
//    the .app persists wallet<->hsid into Supabase, after which they
//    resolve real via first-touch (event.wallet -> hsid ->
//    frontpage_visits.session_id -> .source / .country).
//
// The "Product / Page" column shows the visited URL for a visit, and
// the front-end product name (mapped from slug/address by the server
// wrapper via the vaults API) for an app event.

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

type FeedItem =
  | {
      kind: "visit";
      id: string;
      time: string;
      source: string | null;
      country: string | null;
      pagePath: string;
    }
  | {
      kind: "event";
      id: string;
      time: string;
      eventType: "deposit" | "withdraw";
      wallet: string;
      vaultSlug: string | null;
      vaultAddress: string;
      chain: string;
      tx: string;
    };

const FEED_LIMIT = 200;
const FEED_COLS = "150px 138px 104px 96px minmax(170px, 1.7fr) 132px 58px";

// ── Source channel classification ──────────────────────────────────
// Real visit sources arrive as a referrer URL or utm_source string;
// map them to a channel. App events get a deterministic sample channel
// per wallet (fixed first-touch) until hsid tracking lands.
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
  if (s === "direct" || s === "(direct)" || s === "(none)") return "Direct";
  return "Referral";
}

function channelTone(name: string): "search" | "ai" | "direct" | "neutral" {
  if (name === "Google" || name === "Bing" || name === "DuckDuckGo") return "search";
  if (name === "ChatGPT" || name === "Perplexity" || name === "Claude" || name === "Gemini") return "ai";
  if (name === "Direct") return "direct";
  return "neutral";
}

const SAMPLE_CHANNELS: ReadonlyArray<{ name: string; weight: number }> = [
  { name: "Google", weight: 32 },
  { name: "Direct", weight: 22 },
  { name: "ChatGPT", weight: 13 },
  { name: "X / Twitter", weight: 10 },
  { name: "Referral", weight: 8 },
  { name: "Reddit", weight: 6 },
  { name: "Bing", weight: 5 },
  { name: "Perplexity", weight: 4 },
];
const SAMPLE_COUNTRIES: ReadonlyArray<{ iso: string; weight: number }> = [
  { iso: "US", weight: 28 }, { iso: "GB", weight: 11 }, { iso: "DE", weight: 9 },
  { iso: "IN", weight: 8 }, { iso: "BR", weight: 7 }, { iso: "FR", weight: 6 },
  { iso: "CA", weight: 5 }, { iso: "NL", weight: 5 }, { iso: "PL", weight: 4 },
  { iso: "JP", weight: 4 }, { iso: "SG", weight: 3 }, { iso: "AU", weight: 3 },
  { iso: "KR", weight: 3 }, { iso: "AE", weight: 2 }, { iso: "TR", weight: 2 },
];

function hashStr(s: string, salt: number): number {
  let h = salt >>> 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function weightedPick<T extends { weight: number }>(items: ReadonlyArray<T>, hash: number): T {
  let n = hash % 100;
  for (const it of items) {
    if (n < it.weight) return it;
    n -= it.weight;
  }
  return items[items.length - 1];
}
function sampleChannel(wallet: string): string {
  return weightedPick(SAMPLE_CHANNELS, hashStr(wallet, 7)).name;
}
function sampleCountry(wallet: string): string {
  return weightedPick(SAMPLE_COUNTRIES, hashStr(wallet, 1009)).iso;
}

// ── Sample fallbacks (only when a real stream is empty) ─────────────
const SAMPLE_EVENT_SEED: ReadonlyArray<{ slug: string; chain: string; type: "deposit" | "withdraw"; wallet: string; minsAgo: number }> = [
  { slug: "usdc-aerodrome-aero-base", chain: "Base", type: "deposit", wallet: "0x8a3fce21b9d47a0c6f5e2d18b4c7a90e3f1d6b24", minsAgo: 6 },
  { slug: "usdc-morpho-gauntlet-balanced-v2-arbitrum", chain: "Arbitrum", type: "deposit", wallet: "0xc6e0a91f4d2b75308e1c6a9b04f3d27e5a8c1b96", minsAgo: 38 },
  { slug: "usdc-hypurr-hyperevm", chain: "HyperEVM", type: "withdraw", wallet: "0xa07f3c91e6b2d8540c19a3f7b08e2d45c6019e8b", minsAgo: 73 },
  { slug: "wbtc-reactorfusion-zksync", chain: "zkSync", type: "deposit", wallet: "0x5c8e2a9140d7b36f0e1a4c97285bd03e6a9f1c47", minsAgo: 151 },
  { slug: "usdc-aave-polygon", chain: "Polygon", type: "deposit", wallet: "0x1f9c4a60e3b2d87540a9c1e74b08d3f25690ac18", minsAgo: 320 },
  { slug: "eth-stake-dao-onlyboost-ethereum", chain: "Ethereum", type: "withdraw", wallet: "0xb1c5f8093a2e7d46c0918bf35e7a2d4c6098e1f3", minsAgo: 540 },
];
const SAMPLE_EVENT_TX: readonly string[] = [
  "0x9f2c1ab73e08d45c6a1f90b3e27d4c85a06f1e93b2d7c40859a1e6f3c08d24b71",
  "0x3b7e0d92a14c6f85309e1b4a7c0d28f6e5a9c1340b8d6e2f7019a4c83e6d50f29",
  "0xc1a6e3920d74b85f016c9a3e7b0d42f8e5690a1c34b7d6e2f80193a4c56e0d8b9",
  "0x6d04b9e2a71c8f3508e1a6c94b0d27f3e5a8019c6d2b4e7f0a91c83560de4f218",
  "0x2e8c1f04a93d76b850c1e6a4b079d2f3568a0c194e7b6d2f8013a9c46e05d8f37",
  "0xb40e9c1a73d28f650a1c9e34b7f08d265c0a9143e6b8d7f201943c856e0d2f49a",
];
const SAMPLE_VISIT_SEED: ReadonlyArray<{ page: string; source: string; country: string; minsAgo: number }> = [
  { page: "/", source: "https://www.google.com/", country: "US", minsAgo: 1 },
  { page: "/usdc", source: "chatgpt.com", country: "GB", minsAgo: 4 },
  { page: "/eth", source: "(direct)", country: "DE", minsAgo: 12 },
  { page: "/arbitrum", source: "https://t.co/", country: "BR", minsAgo: 27 },
  { page: "/btc", source: "https://www.bing.com/", country: "IN", minsAgo: 49 },
  { page: "/usdc-aave-polygon", source: "https://www.reddit.com/", country: "FR", minsAgo: 96 },
  { page: "/methodology", source: "perplexity.ai", country: "CA", minsAgo: 188 },
  { page: "/", source: "https://www.google.com/", country: "NL", minsAgo: 410 },
];

function sampleVisits(now: number): VisitRow[] {
  return SAMPLE_VISIT_SEED.map((v, i) => ({
    created_at: new Date(now - v.minsAgo * 60_000).toISOString(),
    session_id: `sample-${i}`,
    page_path: v.page,
    source: v.source,
    country: v.country,
  }));
}
function sampleEvents(now: number): VaultEventRow[] {
  return SAMPLE_EVENT_SEED.map((s, i) => ({
    tx_hash: SAMPLE_EVENT_TX[i],
    log_index: 0,
    block_timestamp: new Date(now - s.minsAgo * 60_000).toISOString(),
    chain: s.chain,
    vault_address: "0x0000000000000000000000000000000000000000",
    vault_slug: s.slug,
    event_type: s.type,
    wallet_address: s.wallet,
  }));
}

export function LiveFeed({ productNames }: { productNames: Record<string, string> }) {
  const [visits, setVisits] = useState<VisitRow[] | null>(null);
  const [events, setEvents] = useState<VaultEventRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [v, e] = await Promise.all([
          supabaseSelect<VisitRow>(
            "frontpage_visits",
            `select=created_at,session_id,page_path,source,country&order=created_at.desc&limit=${FEED_LIMIT}`,
          ),
          supabaseSelect<VaultEventRow>(
            "vault_events_prod",
            `select=tx_hash,log_index,block_timestamp,chain,vault_address,vault_slug,event_type,wallet_address&event_type=in.(deposit,withdraw)&order=block_timestamp.desc&limit=${FEED_LIMIT}`,
          ),
        ]);
        if (cancelled) return;
        setVisits(v);
        setEvents(e);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const eventsAreSample = !events || events.length === 0;

  const items = useMemo<FeedItem[]>(() => {
    const now = Date.now();
    const vSrc = visits && visits.length > 0 ? visits : sampleVisits(now);
    const eSrc = events && events.length > 0 ? events : sampleEvents(now);
    const merged: FeedItem[] = [
      ...vSrc.map((v, i) => ({
        kind: "visit" as const,
        id: `v-${v.session_id}-${v.created_at}-${i}`,
        time: v.created_at,
        source: v.source,
        country: v.country,
        pagePath: v.page_path || "/",
      })),
      ...eSrc.map((e) => ({
        kind: "event" as const,
        id: `e-${e.tx_hash}-${e.log_index}`,
        time: e.block_timestamp,
        eventType: e.event_type as "deposit" | "withdraw",
        wallet: e.wallet_address,
        vaultSlug: e.vault_slug,
        vaultAddress: e.vault_address,
        chain: e.chain,
        tx: e.tx_hash,
      })),
    ];
    return merged
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, FEED_LIMIT);
  }, [visits, events]);

  const loading = (visits === null || events === null) && !err;

  function productLabel(item: Extract<FeedItem, { kind: "event" }>): string {
    return (
      productNames[(item.vaultSlug ?? "").toLowerCase()] ??
      productNames[item.vaultAddress.toLowerCase()] ??
      item.vaultSlug ??
      shortenAddress(item.vaultAddress)
    );
  }

  return (
    <div className="uni-hub-test">
      <header className="uni-hub-hero aq-hero-slim aq-hero-fullwidth">
        <div className="uni-hub-hero-headline">
          <div style={{ width: "100%" }}>
            <h1 className="uni-hub-h1">Live Feed</h1>
            <p className="uni-hub-sub aq-sub-full">
              The heart of Harvest activity, newest first: every front-page
              page view alongside every in-app deposit and withdrawal. Visits
              carry their real source and country; app events show a sample
              source and country until the app writes wallet-to-hsid into
              Supabase.
            </p>
          </div>
        </div>
      </header>

      <section className="uni-hub-section" style={{ marginTop: 28 }}>
        <header className="uni-hub-section-head">
          <div className="aq-section-head-left">
            <h2 className="uni-hub-section-title">
              Site &amp; app activity
              {eventsAreSample && (
                <span className="aq-sample-badge">sample</span>
              )}
            </h2>
            <span className="uni-hub-section-meta">
              {items.length} most recent · visits real, deposit/withdraw source
              and country are sample pending the hsid wallet-session join
            </span>
          </div>
        </header>

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
                {items.map((item) => {
                  const channel =
                    item.kind === "visit"
                      ? classifyChannel(item.source)
                      : sampleChannel(item.wallet);
                  const country =
                    item.kind === "visit" ? item.country : sampleCountry(item.wallet);
                  return (
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
                        <span className={`lf-badge lf-badge-${channelTone(channel)}`}>
                          {channel}
                        </span>
                      </span>
                      <span className="uni-hub-cell" data-label="Country">
                        <CountryFlag country={country} />
                      </span>
                      <span className="uni-hub-cell" data-label="Event">
                        {item.kind === "visit" ? (
                          <span className="lf-event lf-event-visit">
                            <VisitIcon />
                            Visit
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
                        ) : item.vaultSlug ? (
                          <Link href={`/${item.vaultSlug}`} className="lf-product-link">
                            {productLabel(item)}
                          </Link>
                        ) : (
                          <span className="lf-product-link">{productLabel(item)}</span>
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
                  );
                })}
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

// "just now", "Nmin ago", "Nh ago" up to a day, then the absolute date.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return "just now";
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `${min}min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
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
