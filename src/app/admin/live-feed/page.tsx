"use client";

// Admin > Live Feed. Reverse-chron stream of every deposit and
// withdrawal we index, with the acquisition channel + country that
// brought the wallet in. Time / Event / Product / Wallet / Tx are live
// off vault_events_prod; Source and Country are sample data until the
// .app persists wallet<->hsid (the index session id we append to
// outbound app links) into Supabase. Once that link exists, both
// resolve real via first-touch:
//   event.wallet -> wallet_session_links.hsid
//                -> frontpage_visits.session_id -> .source / .country
// taking the earliest session per wallet as the acquisition source.
//
// Visual language is the public ranking table (.uni-hub-table), not the
// dense admin recent-events table, so it reads cleanly and reflows to
// labelled cards on mobile with no horizontal scroll.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseSelectAll } from "@/lib/supabase";
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
  amount_shares: string;
}

const FEED_LIMIT = 200;
const FEED_COLS = "150px 138px 104px 96px minmax(160px, 1.6fr) 132px 58px";

// Sample acquisition channels, weighted to look realistic and assigned
// deterministically per wallet (a wallet's first-touch source is fixed,
// so the same wallet always shows the same channel). Replaced by the
// real frontpage_visits.source join once hsid tracking lands; the
// column shape does not change.
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

// Sample first-touch countries (ISO 3166-1 alpha-2), same deterministic
// per-wallet assignment. Replaced by frontpage_visits.country.
const SAMPLE_COUNTRIES: ReadonlyArray<{ iso: string; weight: number }> = [
  { iso: "US", weight: 28 },
  { iso: "GB", weight: 11 },
  { iso: "DE", weight: 9 },
  { iso: "IN", weight: 8 },
  { iso: "BR", weight: 7 },
  { iso: "FR", weight: 6 },
  { iso: "CA", weight: 5 },
  { iso: "NL", weight: 5 },
  { iso: "PL", weight: 4 },
  { iso: "JP", weight: 4 },
  { iso: "SG", weight: 3 },
  { iso: "AU", weight: 3 },
  { iso: "KR", weight: 3 },
  { iso: "AE", weight: 2 },
  { iso: "TR", weight: 2 },
];

function hashStr(s: string, salt: number): number {
  let h = salt >>> 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function weightedPick<T extends { weight: number }>(
  items: ReadonlyArray<T>,
  hash: number,
): T {
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

// Channel -> badge tone. Search engines read blue, AI assistants purple,
// Direct stays plain (outlined), everything else neutral.
function channelTone(name: string): "search" | "ai" | "direct" | "neutral" {
  if (name === "Google" || name === "Bing") return "search";
  if (name === "ChatGPT" || name === "Perplexity") return "ai";
  if (name === "Direct") return "direct";
  return "neutral";
}

// Fallback stream shown only if vault_events_prod is empty, so the page
// renders fully even before the indexer has events. Real chains + slugs;
// timestamps relative to now so it always reads as a live feed.
const SAMPLE_FEED_SEED: ReadonlyArray<{
  slug: string;
  chain: string;
  type: "deposit" | "withdraw";
  wallet: string;
  minsAgo: number;
}> = [
  { slug: "usdc-aerodrome-aero-base", chain: "Base", type: "deposit", wallet: "0x8a3fce21b9d47a0c6f5e2d18b4c7a90e3f1d6b24", minsAgo: 4 },
  { slug: "eth-stake-dao-onlyboost-ethereum", chain: "Ethereum", type: "deposit", wallet: "0x2f9a4c7e1d05b836a9c4e2f70d18b35c6a4e9d02", minsAgo: 21 },
  { slug: "usdc-hypurr-hyperevm", chain: "HyperEVM", type: "withdraw", wallet: "0xa07f3c91e6b2d8540c19a3f7b08e2d45c6019e8b", minsAgo: 47 },
  { slug: "usdc-morpho-gauntlet-balanced-v2-arbitrum", chain: "Arbitrum", type: "deposit", wallet: "0xc6e0a91f4d2b75308e1c6a9b04f3d27e5a8c1b96", minsAgo: 92 },
  { slug: "wbtc-reactorfusion-zksync", chain: "zkSync", type: "deposit", wallet: "0x5c8e2a9140d7b36f0e1a4c97285bd03e6a9f1c47", minsAgo: 138 },
  { slug: "usdc-aave-polygon", chain: "Polygon", type: "withdraw", wallet: "0x0e9c4a6f3b18d7254a09f1c83b6e0d472a5c91fe", minsAgo: 205 },
  { slug: "eth-baseswap-bswap-base", chain: "Base", type: "deposit", wallet: "0x4d7e9a1c0b3f8e25d6a4c91278fb0e3a5c8d2f17", minsAgo: 280 },
  { slug: "usdc-autopilot-arbitrum", chain: "Arbitrum", type: "deposit", wallet: "0x7d31b8e0a45c29f6d108e3b7c05a4f29d6e1c830", minsAgo: 366 },
  { slug: "usdc-morpho-clearstar-core-v2-ethereum", chain: "Ethereum", type: "withdraw", wallet: "0xb1c5f8093a2e7d46c0918bf35e7a2d4c6098e1f3", minsAgo: 488 },
  { slug: "usdc-venus-zksync", chain: "zkSync", type: "deposit", wallet: "0x93b1e7c0a4d28f56309c1b8e4a07f2d96c5e3a18", minsAgo: 642 },
  { slug: "usdt-morpho-felix-frontier-hyperevm", chain: "HyperEVM", type: "deposit", wallet: "0xd2c0a9148e6b3f7250a1c9e34b08d2f56907a1cd", minsAgo: 791 },
  { slug: "usdc-aave-polygon", chain: "Polygon", type: "deposit", wallet: "0x1f9c4a60e3b2d87540a9c1e74b08d3f25690ac18", minsAgo: 980 },
  { slug: "eth-baseswap-bswap-base", chain: "Base", type: "withdraw", wallet: "0x6a0e9c3140b87d2f5e019a4c7b36d802596a1c0e", minsAgo: 1240 },
  { slug: "wbtc-reactorfusion-zksync", chain: "zkSync", type: "deposit", wallet: "0x3b7e0d92a14c6f85309e1b4a7c0d28f6e5a9c134", minsAgo: 1510 },
];

const SAMPLE_FEED_TX: readonly string[] = [
  "0x9f2c1ab73e08d45c6a1f90b3e27d4c85a06f1e93b2d7c40859a1e6f3c08d24b71",
  "0x3b7e0d92a14c6f85309e1b4a7c0d28f6e5a9c1340b8d6e2f7019a4c83e6d50f29",
  "0xc1a6e3920d74b85f016c9a3e7b0d42f8e5690a1c34b7d6e2f80193a4c56e0d8b9",
  "0x6d04b9e2a71c8f3508e1a6c94b0d27f3e5a8019c6d2b4e7f0a91c83560de4f218",
  "0x2e8c1f04a93d76b850c1e6a4b079d2f3568a0c194e7b6d2f8013a9c46e05d8f37",
  "0xb40e9c1a73d28f650a1c9e34b7f08d265c0a9143e6b8d7f201943c856e0d2f49a",
  "0x7c1a9e30b46d2f8501e6c9a47b08d3f25690a1c834e7b6d0f29143a85c6e0d97b",
  "0x0a9e6c3140b87d2f5e019a4c7b36d802596a1c0e349b7d6f8021a94c5e63d08f4",
  "0xe6309c1a47b02d8f5106a9c34e7b0d28f495a6c10394b8d7e02f1a9c465e0d83c",
  "0x4b8e1c0a93d672f50e1a96c47b30d8f2650a9c1e348b7d6f0219a4c8356e0df21",
  "0x1d7a0c94e3b86f2510a9c1e47b0d38f2659a0c134e8b7d6f209143ac56e0d8b47",
  "0x8e0c1a9347b6d2f5019a4c87b30d6f25e90a1c34b8d7e6f0213a9c465e0d8f39c",
  "0x5a9e0c3148b7d62f019ac4e7b3608d2f59a01c6e34b8d7f2091a4c8356e0db17e",
  "0x2c8a1e0934b67d2f50a19c4e7b08d3f2569a0c14e3b8d7f6021a9c4c560e8d3fa",
];

function buildSampleFeed(): VaultEventRow[] {
  const now = Date.now();
  return SAMPLE_FEED_SEED.map((s, i) => ({
    tx_hash: SAMPLE_FEED_TX[i],
    log_index: 0,
    block_timestamp: new Date(now - s.minsAgo * 60_000).toISOString(),
    chain: s.chain,
    vault_address: "0x0000000000000000000000000000000000000000",
    vault_slug: s.slug,
    event_type: s.type,
    wallet_address: s.wallet,
    amount_shares: "0",
  }));
}

const SAMPLE_FEED: VaultEventRow[] = buildSampleFeed();

export default function LiveFeedPage() {
  const [events, setEvents] = useState<VaultEventRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await supabaseSelectAll<VaultEventRow>(
          "vault_events_prod",
          `select=tx_hash,log_index,block_timestamp,chain,vault_address,vault_slug,event_type,wallet_address,amount_shares&event_type=in.(deposit,withdraw)&order=block_timestamp.desc&limit=${FEED_LIMIT}`,
        );
        if (!cancelled) setEvents(rows);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const eventsAreSample = !events || events.length === 0;

  const rows = useMemo(() => {
    const src = eventsAreSample ? SAMPLE_FEED : events!;
    return [...src]
      .sort(
        (a, b) =>
          new Date(b.block_timestamp).getTime() -
          new Date(a.block_timestamp).getTime(),
      )
      .slice(0, FEED_LIMIT);
  }, [events, eventsAreSample]);

  const loading = events === null && !err;

  return (
    <div className="uni-hub-test">
      <header className="uni-hub-hero aq-hero-slim aq-hero-fullwidth">
        <div className="uni-hub-hero-headline">
          <div style={{ width: "100%" }}>
            <h1 className="uni-hub-h1">Live Feed</h1>
            <p className="uni-hub-sub aq-sub-full">
              Every deposit and withdrawal we index, newest first, with the
              acquisition channel and country that first brought the wallet
              in. Time, event, product, wallet and tx are live; Source and
              Country are first-touch and resolve real once the app writes
              wallet-to-hsid into Supabase.
            </p>
          </div>
        </div>
      </header>

      <section className="uni-hub-section" style={{ marginTop: 28 }}>
        <header className="uni-hub-section-head">
          <div className="aq-section-head-left">
            <h2 className="uni-hub-section-title">
              Deposits &amp; withdrawals
              <span className="aq-sample-badge">sample source</span>
            </h2>
            <span className="uni-hub-section-meta">
              {eventsAreSample
                ? "preview stream, sample events with sample source and country pending the hsid wallet-session join"
                : `${rows.length} most recent events · Source and Country are sample data pending hsid wallet-session tracking`}
            </span>
          </div>
        </header>

        {err && (
          <div className="uni-hub-empty" style={{ color: "#b91c1c" }}>
            Could not load events: {err}
          </div>
        )}

        {loading ? (
          <div className="uni-hub-empty">Loading feed…</div>
        ) : (
          <div className="lf-scroll">
            <div className="uni-hub-table lf-table">
              <div
                className="uni-hub-thead"
                style={{ gridTemplateColumns: FEED_COLS }}
              >
                <span className="uni-hub-th">Time</span>
                <span className="uni-hub-th">Source</span>
                <span className="uni-hub-th">Country</span>
                <span className="uni-hub-th">Event</span>
                <span className="uni-hub-th">Product</span>
                <span className="uni-hub-th">Wallet</span>
                <span className="uni-hub-th">Tx</span>
              </div>
              <div className="uni-hub-tbody">
                {rows.map((e) => {
                  const channel = sampleChannel(e.wallet_address);
                  return (
                    <div
                      key={`${e.tx_hash}-${e.log_index}`}
                      className="uni-hub-row"
                      style={{ gridTemplateColumns: FEED_COLS }}
                    >
                      <span className="uni-hub-cell lf-time" data-label="Time">
                        {formatTime(e.block_timestamp)}
                      </span>
                      <span className="uni-hub-cell" data-label="Source">
                        <span className={`lf-badge lf-badge-${channelTone(channel)}`}>
                          {channel}
                        </span>
                      </span>
                      <span className="uni-hub-cell" data-label="Country">
                        <CountryFlag country={sampleCountry(e.wallet_address)} />
                      </span>
                      <span className="uni-hub-cell" data-label="Event">
                        <span className={`lf-event lf-event-${e.event_type}`}>
                          {e.event_type}
                        </span>
                      </span>
                      <span
                        className="uni-hub-cell lf-product"
                        data-label="Product"
                      >
                        {e.vault_slug ? (
                          <Link href={`/${e.vault_slug}`} className="lf-product-link">
                            {e.vault_slug}
                          </Link>
                        ) : (
                          <span className="lf-mono">
                            {shortenAddress(e.vault_address)}
                          </span>
                        )}
                      </span>
                      <span className="uni-hub-cell" data-label="Wallet">
                        <span className="lf-mono">
                          {shortenAddress(e.wallet_address)}
                        </span>
                      </span>
                      <span className="uni-hub-cell" data-label="Tx">
                        <a
                          href={txLink(e.chain, e.tx_hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="lf-tx"
                        >
                          view
                        </a>
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
