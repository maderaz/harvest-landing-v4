"use client";

// Acquisition funnel - step 04: Deposits (TVL).
// Network-wide Harvest TVL aggregated from per-vault history, paired
// with a daily new-wallets chart, a deposits-with-source feed, and the
// raw onchain event stream. The visits -> clicks -> wallets ->
// depositors cohort funnel now lives in the shared acquisition layout
// (fixed 180-day window), above the step nav, so it shows on every
// page rather than only here.
//
// Data sources:
//  - Network TVL: precomputed at build time by
//    scripts/build-network-tvl.mjs into src/data/network-tvl-daily.json
//  - Wallet connects: wallet_connections_prod (Supabase)
//  - Deposits / events: vault_events_prod (Supabase)
//
// Depositor proxy: a wallet is treated as a "depositor" if its
// harvest_balance is currently > 0 (and below the outlier cap). This
// is a snapshot, not a first-deposit-date - good enough for the
// conversion-rate cohort framing until we wire onchain Deposit-event
// timestamps from the subgraph.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseSelectAll } from "@/lib/supabase";
import {
  TimeframeSelector,
  resolveDays,
  type Timeframe,
} from "@/components/admin/timeframe-selector";
import networkTvl from "@/data/network-tvl-daily.json";

interface WalletRow {
  wallet_address: string;
  connected_at: string;
  harvest_balance: number | null;
  balance: number | null;
}

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
  // Only set on the seeded sample rows below, to demonstrate the
  // Frontend/External split before the real attribution join exists.
  // Live Supabase rows never carry it (source is derived from
  // wallet_connections_prod membership instead).
  demoSource?: "Frontend" | "External";
}

interface DailyTvlPoint {
  date: string;
  tvl: number;
}

interface NetworkTvlFile {
  generated_at: string;
  days: number;
  vaults: number;
  series: DailyTvlPoint[];
}

const TVL: NetworkTvlFile = networkTvl as NetworkTvlFile;
const WALLET_OUTLIER_CAP = 100_000_000;
const DAY_MS = 86_400_000;

export default function DepositsPage() {
  const [wallets, setWallets] = useState<WalletRow[] | null>(null);
  const [events, setEvents] = useState<VaultEventRow[] | null>(null);
  const [deposits30d, setDeposits30d] = useState<VaultEventRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Last 7 days for the mixed-event feed; 30 days for the
        // deposits-with-source table below the charts. The visit/click
        // cohort funnel now lives in the shared acquisition layout
        // (last 180 days), so this page no longer pulls those tables.
        const eventCutoff = new Date(
          Date.now() - 7 * 86_400_000,
        ).toISOString();
        const deposit30dCutoff = new Date(
          Date.now() - 30 * 86_400_000,
        ).toISOString();
        const [w, e, d30] = await Promise.all([
          supabaseSelectAll<WalletRow>(
            "wallet_connections_prod",
            "select=wallet_address,connected_at,harvest_balance,balance&order=connected_at.desc",
          ),
          supabaseSelectAll<VaultEventRow>(
            "vault_events_prod",
            `select=tx_hash,log_index,block_timestamp,chain,vault_address,vault_slug,event_type,wallet_address,amount_shares&block_timestamp=gte.${eventCutoff}&order=block_timestamp.desc`,
          ),
          supabaseSelectAll<VaultEventRow>(
            "vault_events_prod",
            `select=tx_hash,log_index,block_timestamp,chain,vault_address,vault_slug,event_type,wallet_address,amount_shares&event_type=eq.deposit&block_timestamp=gte.${deposit30dCutoff}&order=block_timestamp.desc`,
          ),
        ]);
        if (cancelled) return;
        setWallets(w);
        setEvents(e);
        setDeposits30d(d30);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Earliest-connect per wallet, deduped, capped at the outlier
  // threshold. Used by both the daily new-wallets chart and the
  // funnel "new connects" count.
  const uniqueWallets = useMemo(() => {
    if (!wallets) return null;
    const earliest = new Map<string, WalletRow>();
    for (const w of wallets) {
      const addr = (w.wallet_address || "").toLowerCase();
      if (!addr) continue;
      const prev = earliest.get(addr);
      if (!prev || w.connected_at < prev.connected_at) {
        earliest.set(addr, w);
      }
    }
    return [...earliest.values()];
  }, [wallets]);

  const walletStats = useMemo(() => {
    if (!uniqueWallets) return null;
    let activeDepositors = 0;
    let trackedBalance = 0;
    for (const w of uniqueWallets) {
      const b = typeof w.harvest_balance === "number" ? w.harvest_balance : 0;
      if (b > 0 && b < WALLET_OUTLIER_CAP) {
        activeDepositors++;
        trackedBalance += b;
      }
    }
    return { activeDepositors, trackedBalance };
  }, [uniqueWallets]);

  const latestTvl = TVL.series[TVL.series.length - 1]?.tvl ?? 0;
  const avgPosition =
    walletStats && walletStats.activeDepositors > 0
      ? walletStats.trackedBalance / walletStats.activeDepositors
      : null;

  const loading = wallets === null;

  return (
    <>
      <section className="aq-step-header">
        <h2 className="aq-step-title">Deposits (TVL)</h2>
        <p className="aq-step-sub">
          Network-wide Harvest TVL aggregated across the {TVL.vaults} vaults
          we index, with a cohort funnel that follows visits through to
          first-deposit. The terminal step: anonymous visit converted into
          a real onchain position.
        </p>
      </section>

      <div
        className="uni-hub-stats"
        role="group"
        aria-label="Deposit summary"
        style={{
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          marginBottom: 32,
        }}
      >
        <Stat label="Current TVL" value={formatUsd(latestTvl)} />
        <Stat
          label="Active depositor wallets"
          value={
            walletStats === null
              ? null
              : walletStats.activeDepositors.toLocaleString("en-US")
          }
        />
        <Stat
          label="Tracked wallet TVL"
          value={
            walletStats === null ? null : formatUsd(walletStats.trackedBalance)
          }
        />
        <Stat
          label="Avg position size"
          value={avgPosition === null ? null : formatUsd(avgPosition)}
        />
      </div>

      {err && (
        <div className="uni-hub-empty" style={{ color: "#b91c1c" }}>
          Could not load Supabase tables: {err}
        </div>
      )}

      <TvlChartSection
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
      />

      {!loading && uniqueWallets && (
        <>
          <NewWalletsChartSection
            wallets={uniqueWallets}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
          />
          <DepositsWithSourceSection
            deposits={
              deposits30d && deposits30d.length > 0
                ? deposits30d
                : SAMPLE_DEPOSITS_30D
            }
            wallets={uniqueWallets}
            sample={!deposits30d || deposits30d.length === 0}
          />
          <RecentDepositorsSection wallets={uniqueWallets} />
          <VaultEventsSection events={events ?? []} />
        </>
      )}

      {loading && !err && (
        <div className="uni-hub-empty">Loading cohort data…</div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="uni-hub-stat">
      <div className="uni-hub-stat-label">{label}</div>
      <div className="uni-hub-stat-value">{value ?? "—"}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// TVL chart - network-wide, sourced from the precomputed daily JSON.
// ──────────────────────────────────────────────────────────────────

function TvlChartSection({
  timeframe,
  onTimeframeChange,
}: {
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}) {
  const [hovered, setHovered] = useState<{ date: string; tvl: number } | null>(
    null,
  );

  const oldestMs = useMemo(() => {
    const first = TVL.series[0]?.date;
    if (!first) return null;
    return new Date(first + "T00:00:00Z").getTime();
  }, []);
  const days = resolveDays(timeframe, oldestMs);

  const { bins, max, latest, peak } = useMemo(() => {
    const tail = TVL.series.slice(-days);
    const out = tail.map((p) => ({ date: p.date, tvl: p.tvl }));
    const m = Math.max(1, ...out.map((b) => b.tvl));
    const peakBin = out.reduce(
      (best, b) => (b.tvl > best.tvl ? b : best),
      out[0] ?? { date: "", tvl: 0 },
    );
    return {
      bins: out,
      max: m,
      latest: out[out.length - 1]?.tvl ?? 0,
      peak: peakBin.tvl,
    };
  }, [days]);

  return (
    <section className="uni-hub-section" style={{ marginTop: 0 }}>
      <header className="uni-hub-section-head">
        <div className="aq-section-head-left">
          <h2 className="uni-hub-section-title">
            Network TVL, last {days} days
          </h2>
          <span className="uni-hub-section-meta">
            today {formatUsd(latest)} · peak {formatUsd(peak)}
          </span>
        </div>
        <TimeframeSelector value={timeframe} onChange={onTimeframeChange} />
      </header>
      <div className="aq-chart-card">
        <div className="aq-chart-bignum">
          {formatUsd(hovered ? hovered.tvl : latest)}
        </div>
        <div className="aq-chart-bignum-label">
          {hovered
            ? `Harvest TVL on ${hovered.date}`
            : `current Harvest TVL across ${TVL.vaults} indexed vaults`}
        </div>
        <div className="aq-chart">
          <div className="aq-chart-bars">
            {bins.map((b, i) => {
              const heightPct = Math.max((b.tvl / max) * 100, b.tvl > 0 ? 4 : 0);
              return (
                <div
                  key={i}
                  className="aq-bar-col"
                  title={`${formatUsd(b.tvl)} (${b.date})`}
                  onMouseEnter={() => setHovered(b)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div
                    className="aq-bar"
                    style={{ height: `${heightPct}%` }}
                  />
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

// ──────────────────────────────────────────────────────────────────
// New wallets per day - mirrors the bar shape of the other charts
// in the funnel so the four steps read as a coherent series. Bin a
// wallet on the day of its earliest connected_at row.
// ──────────────────────────────────────────────────────────────────

function NewWalletsChartSection({
  wallets,
  timeframe,
  onTimeframeChange,
}: {
  wallets: WalletRow[];
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}) {
  const [hovered, setHovered] = useState<{ v: number; daysAgo: number } | null>(
    null,
  );

  const oldestMs = useMemo(() => {
    if (wallets.length === 0) return null;
    let oldest = Infinity;
    for (const w of wallets) {
      const t = new Date(w.connected_at).getTime();
      if (t < oldest) oldest = t;
    }
    return Number.isFinite(oldest) ? oldest : null;
  }, [wallets]);
  const days = resolveDays(timeframe, oldestMs);

  const { bins, max, total, latest, peak } = useMemo(() => {
    const now = Date.now();
    const out: { v: number; daysAgo: number }[] = [];
    for (let i = 0; i < days; i++) {
      out.push({ v: 0, daysAgo: days - 1 - i });
    }
    let inWindow = 0;
    for (const w of wallets) {
      const daysAgo = Math.floor(
        (now - new Date(w.connected_at).getTime()) / DAY_MS,
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
  }, [wallets, days]);

  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <div className="aq-section-head-left">
          <h2 className="uni-hub-section-title">
            New wallets, last {days} days
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
          {(hovered ? hovered.v : total).toLocaleString("en-US")}
        </div>
        <div className="aq-chart-bignum-label">
          {hovered
            ? `new wallets ${labelForDaysAgo(hovered.daysAgo)}`
            : `first-time wallet connections in the trailing ${days} days`}
        </div>

        <div className="aq-chart">
          <div className="aq-chart-bars">
            {bins.map((b, i) => {
              const heightPct = Math.max((b.v / max) * 100, b.v > 0 ? 4 : 0);
              return (
                <div
                  key={i}
                  className="aq-bar-col"
                  title={`${b.v} new wallet${b.v === 1 ? "" : "s"} (${labelForDaysAgo(b.daysAgo)})`}
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

function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

// ──────────────────────────────────────────────────────────────────
// Recent depositors - wallets first seen in the last 7 days that
// currently hold a Harvest position. Proxies a deposit-event feed
// until we wire onchain Deposit events from the subgraph. Sorted
// most-recent first; truncated to a single readable page.
// ──────────────────────────────────────────────────────────────────

const RECENT_DEPOSITORS_DAYS = 7;
const RECENT_DEPOSITORS_LIMIT = 200;

const RECENT_DEPOSITORS_COLS =
  "150px minmax(220px, 1.6fr) 120px 120px 70px";

function RecentDepositorsSection({ wallets }: { wallets: WalletRow[] }) {
  const rows = useMemo(() => {
    const now = Date.now();
    const cutoff = now - RECENT_DEPOSITORS_DAYS * DAY_MS;
    const out: WalletRow[] = [];
    for (const w of wallets) {
      const t = new Date(w.connected_at).getTime();
      if (t < cutoff) continue;
      const b =
        typeof w.harvest_balance === "number" ? w.harvest_balance : 0;
      if (b <= 0 || b >= WALLET_OUTLIER_CAP) continue;
      out.push(w);
    }
    out.sort(
      (a, b) =>
        new Date(b.connected_at).getTime() -
        new Date(a.connected_at).getTime(),
    );
    return out.slice(0, RECENT_DEPOSITORS_LIMIT);
  }, [wallets]);

  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <div className="aq-section-head-left">
          <h2 className="uni-hub-section-title">
            Recent depositors, last {RECENT_DEPOSITORS_DAYS} days
          </h2>
          <span className="uni-hub-section-meta">
            wallets first seen in this window that currently hold a Harvest
            position. Will be replaced by onchain Deposit events once the
            subgraph feed is wired.
          </span>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="uni-hub-empty">
          No new depositors in the last {RECENT_DEPOSITORS_DAYS} days yet.
        </div>
      ) : (
        <div className="hub-table-wrap aq-recent-wrap">
          <div className="hub-table aq-clicks-table aq-recent-table">
            <div
              className="hub-thead"
              style={{ gridTemplateColumns: RECENT_DEPOSITORS_COLS }}
            >
              <span className="hub-th">Time</span>
              <span className="hub-th">Wallet</span>
              <span className="hub-th">Harvest balance</span>
              <span className="hub-th">Total wallet</span>
              <span className="hub-th">Link</span>
            </div>
            {rows.map((w) => (
              <div
                key={w.wallet_address}
                className="hub-row"
                style={{ gridTemplateColumns: RECENT_DEPOSITORS_COLS }}
              >
                <span className="hub-cell aq-cell-time">
                  {formatTime(w.connected_at)}
                </span>
                <span className="hub-cell aq-cell-vault">
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>
                    {shortenAddress(w.wallet_address)}
                  </span>
                </span>
                <span className="hub-cell">
                  {formatUsd(w.harvest_balance ?? 0)}
                </span>
                <span className="hub-cell">
                  {typeof w.balance === "number" && w.balance > 0
                    ? formatUsd(w.balance)
                    : "—"}
                </span>
                <span className="hub-cell">
                  <a
                    href={`https://debank.com/profile/${w.wallet_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aq-vault-link"
                  >
                    debank
                  </a>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ──────────────────────────────────────────────────────────────────
// 30-day deposits feed with source attribution
//
// Sits directly under the charts. Same hub-table chrome as the
// other recent-events tables, but filtered to event_type=deposit
// and a 30-day window, with one extra column: Source. Attribution
// is intentionally simple - a wallet is "Frontend" if it appears in
// wallet_connections_prod (i.e. we have at least one record of it
// connecting through the Harvest app, where index-side outbound
// clicks would have driven traffic to); otherwise "External"
// (deposited directly via another front-end or contract). The
// classification is heuristic - it doesn't prove the *individual
// deposit* was triggered from our flow, but it does separate "this
// wallet has ever touched our funnel" from "we have no signal at
// all".
// ──────────────────────────────────────────────────────────────────

const DEPOSITS_SOURCE_COLS =
  "150px minmax(180px, 1.6fr) 100px 120px minmax(110px, 0.9fr) 130px 70px";

// ──────────────────────────────────────────────────────────────────
// Seeded sample deposits. Rendered only when the live 30-day query
// returns nothing, so the operator can see the table fully wired
// (vault links, chain, source split, shares, tx link) before the
// onchain indexer has any real Deposit events. Timestamps are relative
// to now so rows always read as recent; the set is dropped the moment
// vault_events_prod returns real deposits. Spans all six chains and a
// realistic Frontend/External mix.
// ──────────────────────────────────────────────────────────────────

const SAMPLE_DEPOSIT_SEED: ReadonlyArray<{
  slug: string;
  chain: string;
  source: "Frontend" | "External";
  wallet: string;
  shares: string;
  hoursAgo: number;
}> = [
  { slug: "usdc-aerodrome-aero-base", chain: "Base", source: "Frontend", wallet: "0x8a3fce21b9d47a0c6f5e2d18b4c7a90e3f1d6b24", shares: "5200000000000000000000", hoursAgo: 2 },
  { slug: "eth-baseswap-bswap-base", chain: "Base", source: "External", wallet: "0x4d7e9a1c0b3f8e25d6a4c91278fb0e3a5c8d2f17", shares: "4180000000000000000", hoursAgo: 7 },
  { slug: "usdc-morpho-clearstar-core-v2-ethereum", chain: "Ethereum", source: "Frontend", wallet: "0xb1c5f8093a2e7d46c0918bf35e7a2d4c6098e1f3", shares: "18500000000000000000000", hoursAgo: 19 },
  { slug: "eth-stake-dao-onlyboost-ethereum", chain: "Ethereum", source: "Frontend", wallet: "0x2f9a4c7e1d05b836a9c4e2f70d18b35c6a4e9d02", shares: "12400000000000000000", hoursAgo: 33 },
  { slug: "usdc-morpho-gauntlet-balanced-v2-arbitrum", chain: "Arbitrum", source: "External", wallet: "0xc6e0a91f4d2b75308e1c6a9b04f3d27e5a8c1b96", shares: "940000000000000000000", hoursAgo: 52 },
  { slug: "usdc-autopilot-arbitrum", chain: "Arbitrum", source: "Frontend", wallet: "0x7d31b8e0a45c29f6d108e3b7c05a4f29d6e1c830", shares: "6750000000000000000000", hoursAgo: 88 },
  { slug: "usdc-aave-polygon", chain: "Polygon", source: "External", wallet: "0x0e9c4a6f3b18d7254a09f1c83b6e0d472a5c91fe", shares: "2300000000000000000000", hoursAgo: 140 },
  { slug: "usdc-venus-zksync", chain: "zkSync", source: "Frontend", wallet: "0x93b1e7c0a4d28f56309c1b8e4a07f2d96c5e3a18", shares: "1180000000000000000000", hoursAgo: 210 },
  { slug: "wbtc-reactorfusion-zksync", chain: "zkSync", source: "Frontend", wallet: "0x5c8e2a9140d7b36f0e1a4c97285bd03e6a9f1c47", shares: "85000000000000000", hoursAgo: 380 },
  { slug: "usdc-hypurr-hyperevm", chain: "HyperEVM", source: "External", wallet: "0xa07f3c91e6b2d8540c19a3f7b08e2d45c6019e8b", shares: "8900000000000000000000", hoursAgo: 640 },
];

const SAMPLE_TX_HASHES: readonly string[] = [
  "0x9f2c1ab73e08d45c6a1f90b3e27d4c85a06f1e93b2d7c40859a1e6f3c08d24b71",
  "0x3b7e0d92a14c6f85309e1b4a7c0d28f6e5a9c1340b8d6e2f7019a4c83e6d50f29",
  "0xc1a6e3920d74b85f016c9a3e7b0d42f8e5690a1c34b7d6e2f80193a4c56e0d8b",
  "0x6d04b9e2a71c8f3508e1a6c94b0d27f3e5a8019c6d2b4e7f0a91c83560de4f218",
  "0x2e8c1f04a93d76b850c1e6a4b079d2f3568a0c194e7b6d2f8013a9c46e05d8f37",
  "0xb40e9c1a73d28f650a1c9e34b7f08d265c0a9143e6b8d7f201943c856e0d2f49a",
  "0x7c1a9e30b46d2f8501e6c9a47b08d3f25690a1c834e7b6d0f29143a85c6e0d97b",
  "0x0a9e6c3140b87d2f5e019a4c7b36d802596a1c0e349b7d6f8021a94c5e63d08f4",
  "0xe6309c1a47b02d8f5106a9c34e7b0d28f495a6c10394b8d7e02f1a9c465e0d83c",
  "0x4b8e1c0a93d672f50e1a96c47b30d8f2650a9c1e348b7d6f0219a4c8356e0df21",
];

function buildSampleDeposits(): VaultEventRow[] {
  return SAMPLE_DEPOSIT_SEED.map((s, i) => ({
    tx_hash: SAMPLE_TX_HASHES[i],
    log_index: i,
    block_timestamp: new Date(Date.now() - s.hoursAgo * 3_600_000).toISOString(),
    chain: s.chain,
    vault_address: "0x0000000000000000000000000000000000000000",
    vault_slug: s.slug,
    event_type: "deposit" as const,
    wallet_address: s.wallet,
    amount_shares: s.shares,
    demoSource: s.source,
  }));
}

const SAMPLE_DEPOSITS_30D: VaultEventRow[] = buildSampleDeposits();

function DepositsWithSourceSection({
  deposits,
  wallets,
  sample = false,
}: {
  deposits: VaultEventRow[];
  wallets: WalletRow[] | null;
  sample?: boolean;
}) {
  const knownWallets = useMemo(() => {
    const s = new Set<string>();
    if (wallets) {
      for (const w of wallets) {
        const a = (w.wallet_address || "").toLowerCase();
        if (a) s.add(a);
      }
    }
    return s;
  }, [wallets]);

  // Seeded sample rows carry an explicit demoSource; live rows derive
  // "Frontend" from ever having connected through the Harvest app.
  const isFrontendRow = (d: VaultEventRow): boolean => {
    if (d.demoSource) return d.demoSource === "Frontend";
    const a = (d.wallet_address || "").toLowerCase();
    return !!a && knownWallets.has(a);
  };

  const sorted = useMemo(
    () =>
      [...deposits].sort(
        (a, b) =>
          new Date(b.block_timestamp).getTime() -
          new Date(a.block_timestamp).getTime(),
      ),
    [deposits],
  );

  const counts = useMemo(() => {
    let frontend = 0;
    let external = 0;
    for (const d of deposits) {
      if (isFrontendRow(d)) frontend++;
      else external++;
    }
    return { frontend, external, total: deposits.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deposits, knownWallets]);

  const display = sorted.slice(0, 200);

  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <div className="aq-section-head-left">
          <h2 className="uni-hub-section-title">
            Deposits, last 30 days, with source attribution
            {sample && <span className="aq-sample-badge">sample data</span>}
          </h2>
          <span className="uni-hub-section-meta">
            {sample && (
              <>
                preview rows, no live deposits indexed yet ·{" "}
              </>
            )}
            {counts.total.toLocaleString("en-US")} deposits ·{" "}
            {counts.frontend.toLocaleString("en-US")} from wallets ever
            connected through the Harvest app ({" "}
            {counts.total > 0
              ? Math.round((counts.frontend / counts.total) * 100)
              : 0}
            % ) · {counts.external.toLocaleString("en-US")} external
          </span>
        </div>
      </header>

      {display.length === 0 ? (
        <div className="uni-hub-empty">
          No deposits indexed in the last 30 days. The 15-min indexer
          cron fills the table as new onchain Deposit events occur.
        </div>
      ) : (
        <div className="hub-table-wrap aq-recent-wrap">
          <div className="hub-table aq-clicks-table aq-recent-table">
            <div
              className="hub-thead"
              style={{ gridTemplateColumns: DEPOSITS_SOURCE_COLS }}
            >
              <span className="hub-th">Time</span>
              <span className="hub-th">Vault</span>
              <span className="hub-th">Chain</span>
              <span className="hub-th">Wallet</span>
              <span className="hub-th">Source</span>
              <span className="hub-th">Shares</span>
              <span className="hub-th">Tx</span>
            </div>
            {display.map((d) => {
              const isFrontend = isFrontendRow(d);
              return (
                <div
                  key={`${d.tx_hash}-${d.log_index}`}
                  className="hub-row"
                  style={{ gridTemplateColumns: DEPOSITS_SOURCE_COLS }}
                >
                  <span className="hub-cell aq-cell-time">
                    {formatTime(d.block_timestamp)}
                  </span>
                  <span className="hub-cell aq-cell-vault">
                    {d.vault_slug ? (
                      <Link href={`/${d.vault_slug}`} className="aq-vault-link">
                        {d.vault_slug}
                      </Link>
                    ) : (
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                        {shortenAddress(d.vault_address)}
                      </span>
                    )}
                  </span>
                  <span className="hub-cell">{d.chain}</span>
                  <span className="hub-cell">
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                      {shortenAddress(d.wallet_address)}
                    </span>
                  </span>
                  <span className="hub-cell">
                    <span
                      className={`adm-reason ${
                        isFrontend
                          ? "adm-reason-frontend"
                          : "adm-reason-external"
                      }`}
                    >
                      {isFrontend ? "Frontend" : "External"}
                    </span>
                  </span>
                  <span className="hub-cell" title={d.amount_shares}>
                    {formatShares(d.amount_shares)}
                  </span>
                  <span className="hub-cell">
                    <a
                      href={txLink(d.chain, d.tx_hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aq-vault-link"
                    >
                      view
                    </a>
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

// ──────────────────────────────────────────────────────────────────
// Vault events feed - real onchain Deposit / Withdraw events
// streamed by scripts/index-vault-events.mjs (GitHub Actions cron,
// runs every 15 min on main, free public RPCs).
// ──────────────────────────────────────────────────────────────────

const EVENTS_COLS =
  "150px minmax(180px, 1.6fr) 100px 110px 130px 120px 70px";

function VaultEventsSection({ events }: { events: VaultEventRow[] }) {
  // Most recent 200 visible; counts use the full window.
  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          new Date(b.block_timestamp).getTime() -
          new Date(a.block_timestamp).getTime(),
      ),
    [events],
  );
  const display = sorted.slice(0, 200);

  const counts = useMemo(() => {
    let deposits = 0;
    let withdraws = 0;
    for (const e of events) {
      if (e.event_type === "deposit") deposits++;
      else if (e.event_type === "withdraw") withdraws++;
    }
    return { deposits, withdraws };
  }, [events]);

  return (
    <section className="uni-hub-section">
      <header className="uni-hub-section-head">
        <div className="aq-section-head-left">
          <h2 className="uni-hub-section-title">
            Onchain deposit + withdraw events, last 7 days
          </h2>
          <span className="uni-hub-section-meta">
            {counts.deposits.toLocaleString("en-US")} deposits ·{" "}
            {counts.withdraws.toLocaleString("en-US")} withdrawals · indexed
            every 15 min via GitHub Actions cron
          </span>
        </div>
      </header>

      {display.length === 0 ? (
        <div className="uni-hub-empty">
          No events indexed yet. First cron run lands within 15 min of the
          workflow being enabled; the table fills as new on-chain
          Deposit / Withdraw events occur on the {TVL.vaults} vaults we
          track.
        </div>
      ) : (
        <div className="hub-table-wrap aq-recent-wrap">
          <div className="hub-table aq-clicks-table aq-recent-table">
            <div
              className="hub-thead"
              style={{ gridTemplateColumns: EVENTS_COLS }}
            >
              <span className="hub-th">Time</span>
              <span className="hub-th">Vault</span>
              <span className="hub-th">Chain</span>
              <span className="hub-th">Event</span>
              <span className="hub-th">Wallet</span>
              <span className="hub-th">Shares</span>
              <span className="hub-th">Tx</span>
            </div>
            {display.map((e) => (
              <div
                key={`${e.tx_hash}-${e.log_index}`}
                className="hub-row"
                style={{ gridTemplateColumns: EVENTS_COLS }}
              >
                <span className="hub-cell aq-cell-time">
                  {formatTime(e.block_timestamp)}
                </span>
                <span className="hub-cell aq-cell-vault">
                  {e.vault_slug ? (
                    <Link href={`/${e.vault_slug}`} className="aq-vault-link">
                      {e.vault_slug}
                    </Link>
                  ) : (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                      {shortenAddress(e.vault_address)}
                    </span>
                  )}
                </span>
                <span className="hub-cell">{e.chain}</span>
                <span className="hub-cell">
                  <span
                    style={{
                      color:
                        e.event_type === "deposit"
                          ? "#15803d"
                          : e.event_type === "withdraw"
                            ? "#b91c1c"
                            : "var(--uni-ink-3)",
                      fontWeight: 600,
                    }}
                  >
                    {e.event_type}
                  </span>
                </span>
                <span className="hub-cell">
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                    {shortenAddress(e.wallet_address)}
                  </span>
                </span>
                <span className="hub-cell" title={e.amount_shares}>
                  {formatShares(e.amount_shares)}
                </span>
                <span className="hub-cell">
                  <a
                    href={txLink(e.chain, e.tx_hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aq-vault-link"
                  >
                    view
                  </a>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function formatShares(raw: string): string {
  // amount_shares is a uint256 string in the token's smallest units.
  // Vault tokens almost universally use 18 decimals; until we wire
  // per-vault decimals we present 18-decimal-divided values for a
  // sensible at-a-glance read. The full raw value is in the cell
  // tooltip.
  try {
    const n = Number(BigInt(raw)) / 1e18;
    if (!Number.isFinite(n)) return raw;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
    if (n >= 1) return n.toFixed(3);
    return n.toFixed(5);
  } catch {
    return raw;
  }
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
