"use client";

// Cohort funnel overview, shared across all four acquisition pages.
// Fixed 180-day window so the visitor-to-depositor conversion picture
// stays constant as the operator moves between funnel steps. Renders
// above the clickable step nav in the acquisition layout.
//
// Walks Visits -> App clicks -> New wallets -> Depositors with the
// cohort conversion rate between each stage. Cohort rates, not
// per-individual attribution (that lands once wallet_session_links
// ships). wallet_connections_prod is pulled in full because the
// "new wallet in window" test needs each wallet's earliest connect
// across all history, not just the last 180 days.

import { useEffect, useMemo, useState } from "react";
import { supabaseSelectAll } from "@/lib/supabase";

const WINDOW_DAYS = 180;
const WALLET_OUTLIER_CAP = 100_000_000;
const DAY_MS = 86_400_000;

interface VisitRow {
  created_at: string;
  session_id: string;
}
interface ClickRow {
  created_at: string;
  session_id: string;
}
interface WalletRow {
  wallet_address: string;
  connected_at: string;
  harvest_balance: number | null;
}

export function AcquisitionCohortFunnel() {
  const [visits, setVisits] = useState<VisitRow[] | null>(null);
  const [clicks, setClicks] = useState<ClickRow[] | null>(null);
  const [wallets, setWallets] = useState<WalletRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cutoff = new Date(Date.now() - WINDOW_DAYS * DAY_MS).toISOString();
        const [v, c, w] = await Promise.all([
          supabaseSelectAll<VisitRow>(
            "frontpage_visits",
            `select=created_at,session_id&created_at=gte.${cutoff}&order=created_at.desc`,
          ),
          supabaseSelectAll<ClickRow>(
            "outbound_clicks",
            `select=created_at,session_id&created_at=gte.${cutoff}&order=created_at.desc`,
          ),
          supabaseSelectAll<WalletRow>(
            "wallet_connections_prod",
            "select=wallet_address,connected_at,harvest_balance&order=connected_at.desc",
          ),
        ]);
        if (cancelled) return;
        setVisits(v);
        setClicks(c);
        setWallets(w);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cohort = useMemo(() => {
    if (!visits || !clicks || !wallets) return null;
    const cutoffMs = Date.now() - WINDOW_DAYS * DAY_MS;
    const inWin = (iso: string) => new Date(iso).getTime() >= cutoffMs;

    const visitSessions = new Set(
      visits.filter((v) => v.session_id).map((v) => v.session_id),
    );
    const clickSessions = new Set(
      clicks.filter((c) => c.session_id).map((c) => c.session_id),
    );

    // Earliest connect per wallet across all history, then count the
    // ones whose first-ever connect lands inside the window.
    const earliest = new Map<string, WalletRow>();
    for (const w of wallets) {
      const a = (w.wallet_address || "").toLowerCase();
      if (!a) continue;
      const prev = earliest.get(a);
      if (!prev || w.connected_at < prev.connected_at) earliest.set(a, w);
    }
    let newWallets = 0;
    let depositors = 0;
    let depositorTvl = 0;
    for (const w of earliest.values()) {
      if (!inWin(w.connected_at)) continue;
      newWallets++;
      const b = typeof w.harvest_balance === "number" ? w.harvest_balance : 0;
      if (b > 0 && b < WALLET_OUTLIER_CAP) {
        depositors++;
        depositorTvl += b;
      }
    }

    return {
      visitCount: visits.length,
      uniqueVisitors: visitSessions.size,
      clickCount: clicks.length,
      clickSessions: clickSessions.size,
      newWallets,
      depositors,
      depositorTvl,
    };
  }, [visits, clicks, wallets]);

  const pct = (num: number, den: number): string =>
    den === 0 ? "—" : `${((num / den) * 100).toFixed(1)}%`;

  return (
    <section
      className="uni-hub-section aq-cohort-overview"
      style={{ marginTop: 0, marginBottom: 36 }}
      aria-label={`Cohort funnel, last ${WINDOW_DAYS} days`}
    >
      <header className="uni-hub-section-head">
        <div className="aq-section-head-left">
          <h2 className="uni-hub-section-title">
            Cohort funnel — last {WINDOW_DAYS} days
          </h2>
          <span className="uni-hub-section-meta">
            cohort rates, not individual attribution (pending
            wallet_session_links)
          </span>
        </div>
      </header>

      {err ? (
        <div className="uni-hub-empty" style={{ color: "#b91c1c" }}>
          Could not load cohort data: {err}
        </div>
      ) : !cohort ? (
        <div className="uni-hub-empty">Loading cohort…</div>
      ) : (
        <div className="aq-cohort-funnel">
          <CohortStep
            rank="01"
            label="Visits"
            value={cohort.visitCount.toLocaleString("en-US")}
            sub={`${cohort.uniqueVisitors.toLocaleString("en-US")} unique sessions`}
          />
          <CohortArrow
            rate={pct(cohort.clickCount, cohort.visitCount)}
            caption="click-through"
          />
          <CohortStep
            rank="02"
            label="App clicks"
            value={cohort.clickCount.toLocaleString("en-US")}
            sub={`${cohort.clickSessions.toLocaleString("en-US")} sessions clicked`}
          />
          <CohortArrow
            rate={pct(cohort.newWallets, cohort.clickSessions)}
            caption="connect rate (clicks to new wallets)"
          />
          <CohortStep
            rank="03"
            label="New wallets"
            value={cohort.newWallets.toLocaleString("en-US")}
            sub="first-seen in this window"
          />
          <CohortArrow
            rate={pct(cohort.depositors, cohort.newWallets)}
            caption="deposit rate (new wallets to depositors)"
          />
          <CohortStep
            rank="04"
            label="Depositors"
            value={cohort.depositors.toLocaleString("en-US")}
            sub={`${formatUsd(cohort.depositorTvl)} TVL`}
          />
        </div>
      )}
    </section>
  );
}

function CohortStep({
  rank,
  label,
  value,
  sub,
}: {
  rank: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="aq-cohort-step">
      <div className="aq-cohort-rank">{rank}</div>
      <div className="aq-cohort-label">{label}</div>
      <div className="aq-cohort-value">{value}</div>
      <div className="aq-cohort-sub">{sub}</div>
    </div>
  );
}

function CohortArrow({ rate, caption }: { rate: string; caption: string }) {
  return (
    <div className="aq-cohort-arrow">
      <div className="aq-cohort-rate">{rate}</div>
      <div className="aq-cohort-arrow-caption">{caption}</div>
    </div>
  );
}

function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
