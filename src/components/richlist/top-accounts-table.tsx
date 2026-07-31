"use client";

// The top-100 table on /xrp-rich-list.
//
// Built on the ranking pattern the asset hubs use (see .uni-hub-row in
// asset-hub.css): a CSS grid where the header defines the column track and
// every row repeats it, rather than a <table> whose cells size themselves.
// The reason is uniform rows. A table lets one cell with an extra line push
// its whole row taller, and a hundred rows of different heights read as a
// dump rather than as a ranking. Here every cell is exactly one line, so all
// hundred rows are the same height and the eye can run down a column.
//
// That constraint is why the escrow figure has its own column instead of a
// sub-line under the XRP amount, and why the evidence note moved out of the
// Name cell and into a single sentence under the table. Both were secondary
// text living inside a cell, and both broke the row rhythm.
//
// It is still a table semantically: role="table" with row/columnheader/cell
// on the grid elements, so a screen reader gets the same structure a <table>
// would give it.
//
// The filters exist because three groups in this list are not what a reader
// means by "an XRP holder". An exchange wallet is thousands of customers
// pooled into one row. Ripple's own wallets are the issuer's treasury, most
// of it escrowed and unable to move. Its co-founders' personal wallets are a
// third thing again, and folding them into the company's total would overstate
// what Ripple controls. Each comes out separately.
//
// The controls sit under the ranking rather than over it. The table is what
// the section is for and what a visitor scrolled to; three checkboxes above it
// delay that for everyone, including the majority who never filter.
//
// All hundred rows render on the server and the filters only narrow what is
// already there, so the unfiltered ranking is what a crawler sees. Ranks stay
// at their position in the full list when a filter is on: a renumbered subset
// would call a row "the third largest XRP holder" when it is really the
// twelfth, and that sentence would be false.

import { useMemo, useState } from "react";

export interface TopRow {
  rank: number;
  address: string;
  xrp: number;
  spendableXrp?: number;
  escrowedXrp?: number;
  pctOfSupply: number;
  domain: string | null;
  label?: {
    name: string;
    type?: string;
    affiliation?: string | null;
    evidence: string;
    evidenceUrl: string | null;
    attribution: string | null;
    verifiedOn: string | null;
  } | null;
}

const usd = (n: number): string => {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}bn`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n)}`;
};

// One format for every XRP figure in the table, so the column reads as a
// column. Full digit groups would be exact but would also make the widest cell
// twice the width of the narrowest, and the ranking is about relative size.
const xrpShort = (n: number): string =>
  n >= 1_000_000_000
    ? `${(n / 1_000_000_000).toFixed(2)}bn`
    : n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : Math.round(n).toLocaleString("en-US");

const pct = (v: number): string => {
  if (v >= 1) return `${v.toFixed(2)}%`;
  if (v >= 0.01) return `${v.toFixed(2)}%`;
  return "<0.01%";
};

type FilterKey = "exchange" | "ripple" | "founder";

const FILTERS: { key: FilterKey; label: string; match: (r: TopRow) => boolean }[] = [
  {
    key: "exchange",
    label: "Exchange wallets",
    match: (r) => r.label?.type === "exchange",
  },
  {
    key: "ripple",
    label: "Ripple-controlled wallets",
    match: (r) => r.label?.affiliation === "ripple",
  },
  {
    key: "founder",
    label: "Ripple founder wallets",
    match: (r) => r.label?.affiliation === "ripple-founder",
  },
];

export function TopAccountsTable({
  rows,
  snapshotDate,
  xrpUsd,
}: {
  rows: TopRow[];
  snapshotDate: string;
  xrpUsd: number | null;
}) {
  const [hidden, setHidden] = useState<Record<FilterKey, boolean>>({
    exchange: false,
    ripple: false,
    founder: false,
  });

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f.key, rows.filter(f.match).length]),
      ) as Record<FilterKey, number>,
    [rows],
  );

  const active = FILTERS.filter((f) => hidden[f.key]);
  const shown = useMemo(
    () => (active.length ? rows.filter((r) => !active.some((f) => f.match(r))) : rows),
    // `active` is derived from `hidden` on every render, so keying on the flags
    // themselves is what keeps this from recomputing on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, hidden],
  );

  const shownXrp = shown.reduce((a, r) => a + r.xrp, 0);
  const shownPct = shown.reduce((a, r) => a + r.pctOfSupply, 0);

  return (
    <>
      <div className="rl-rank-box">
      <div className="rl-rank" role="table" aria-label={`Largest 100 XRP Ledger accounts as of ${snapshotDate}`} data-nosnippet="">
        <div className="rl-rank-head" role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Account</span>
          <span role="columnheader" className="rl-rank-n">XRP</span>
          <span role="columnheader" className="rl-rank-n rl-rank-esc">In escrow</span>
          <span role="columnheader" className="rl-rank-n">Value</span>
          <span role="columnheader">Name</span>
          <span role="columnheader" className="rl-rank-n">Share</span>
        </div>
        {/* The rows sit in a wrapper so the header can be sticky against the
            scroll container, and a bare <div> between a table and its rows
            breaks the role hierarchy, so it declares itself a rowgroup. */}
        <div className="rl-rank-body" role="rowgroup">
          {shown.map((t) => (
            <div className="rl-rank-row" role="row" key={t.address}>
              <span className="rl-rank-i" role="cell">{t.rank}</span>
              <span className="rl-rank-addr" role="cell">
                {t.address}
              </span>
              <span className="rl-rank-n rl-rank-xrp" role="cell">
                {xrpShort(t.xrp)}
              </span>
              <span className="rl-rank-n rl-rank-esc" role="cell">
                {t.escrowedXrp ? xrpShort(t.escrowedXrp) : "—"}
              </span>
              <span className="rl-rank-n" role="cell">
                {xrpUsd ? usd(t.xrp * xrpUsd) : "—"}
              </span>
              <span className="rl-rank-name" role="cell">
                {t.label ? (
                  <span className={`rl-badge rl-badge-${t.label.type ?? "unknown"}`}>
                    {t.label.name}
                  </span>
                ) : t.domain ? (
                  <span className="rl-badge rl-badge-domain">{t.domain}</span>
                ) : (
                  <span className="rl-rank-none">Unnamed</span>
                )}
              </span>
              <span className="rl-rank-n rl-rank-share" role="cell">
                {pct(t.pctOfSupply)}
              </span>
            </div>
          ))}
        </div>
      </div>
      </div>

      <div className="rl-rank-foot">
      <div className="rl-filters">
        <span className="rl-filters-label">Hide</span>
        {FILTERS.map((f) => (
          <label key={f.key} className="rl-chip">
            <input
              type="checkbox"
              checked={hidden[f.key]}
              onChange={(e) =>
                setHidden((h) => ({ ...h, [f.key]: e.target.checked }))
              }
            />
            <span>
              {f.label} <em>{counts[f.key]}</em>
            </span>
          </label>
        ))}
      </div>

      <p className="rl-filters-read" role="status" aria-live="polite">
        Showing <strong>{shown.length}</strong> of {rows.length} accounts,
        holding {xrpShort(shownXrp)} XRP between them, or {shownPct.toFixed(2)}%
        of all XRP in funded accounts as of {snapshotDate}.
      </p>
      </div>
    </>
  );
}
