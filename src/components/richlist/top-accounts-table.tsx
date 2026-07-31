"use client";

// The top-100 table on /xrp-rich-list.
//
// A client component for one reason: the exchange filter. An exchange wallet is
// thousands of customers pooled into a single row, so leaving those rows in
// makes the list look like a handful of people own XRP when it mostly shows
// where people keep it. Being able to drop them is the difference between a
// ranking and an answer.
//
// All hundred rows render on the server, and the filter only narrows what is
// already there, so the unfiltered table is what a crawler sees.
//
// Ranks stay at their position in the full list when the filter is on. A
// renumbered subset would read as "the third largest XRP holder" when the row
// is really the twelfth, and that sentence would be wrong.

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
    evidence: string;
    evidenceUrl: string | null;
    attribution: string | null;
    verifiedOn: string | null;
  } | null;
}

const num = (n: number) => Math.round(n).toLocaleString("en-US");

const usd = (n: number): string => {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}bn`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n)}`;
};

const xrpShort = (n: number): string =>
  n >= 1_000_000_000
    ? `${(n / 1_000_000_000).toFixed(2)}bn`
    : n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(2)}M`
      : num(n);

const pct = (v: number): string => {
  if (v >= 100) return "100%";
  if (v >= 1) return `${v.toFixed(2)}%`;
  if (v >= 0.01) return `${v.toFixed(3)}%`;
  return "under 0.01%";
};

function evidenceText(l: NonNullable<TopRow["label"]>): string {
  switch (l.evidence) {
    case "account-domain":
      return "verified onchain";
    case "xrpl-toml":
      return "listed by the operator";
    case "published":
      return `published by the operator, checked ${l.verifiedOn ?? "on file"}`;
    default:
      return `attributed by ${l.attribution ?? "a third party"}`;
  }
}

export function TopAccountsTable({
  rows,
  snapshotDate,
  xrpUsd,
}: {
  rows: TopRow[];
  snapshotDate: string;
  xrpUsd: number | null;
}) {
  const [hideExchanges, setHideExchanges] = useState(false);

  const exchangeCount = useMemo(
    () => rows.filter((r) => r.label?.type === "exchange").length,
    [rows],
  );
  const shown = useMemo(
    () => (hideExchanges ? rows.filter((r) => r.label?.type !== "exchange") : rows),
    [rows, hideExchanges],
  );

  return (
    <>
      <div className="rl-filter">
        <label className="rl-toggle">
          <input
            type="checkbox"
            checked={hideExchanges}
            onChange={(e) => setHideExchanges(e.target.checked)}
          />
          <span>Hide known exchange wallets</span>
        </label>
        <span className="rl-filter-count">
          {hideExchanges
            ? `${shown.length} of ${rows.length} shown, ${exchangeCount} exchange wallets hidden`
            : `${exchangeCount} of ${rows.length} are known exchange wallets`}
        </span>
      </div>

      <div className="rl-dtable-wrap rl-scroll" data-nosnippet="">
        <table className="rl-dtable rl-top">
          <caption className="rl-dtable-cap">
            Largest 100 XRP Ledger accounts by XRP controlled, as of {snapshotDate}
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Account</th>
              <th scope="col">Name</th>
              <th scope="col">XRP</th>
              <th scope="col">Value</th>
              <th scope="col">Share of supply</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.address}>
                <th scope="row">{t.rank}</th>
                <td className="rl-addr" data-label="Account">
                  {t.address}
                </td>
                <td data-label="Name">
                  {t.label ? (
                    <span className="rl-label">
                      <span className={`rl-badge rl-badge-${t.label.type ?? "unknown"}`}>
                        {t.label.name}
                      </span>
                      <span className="rl-evidence">
                        {t.label.evidenceUrl ? (
                          <a
                            href={t.label.evidenceUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                          >
                            {evidenceText(t.label)}
                          </a>
                        ) : (
                          evidenceText(t.label)
                        )}
                      </span>
                    </span>
                  ) : t.domain ? (
                    <span className="rl-label">
                      <span className="rl-badge rl-badge-domain">{t.domain}</span>
                      <span className="rl-evidence">published by the account onchain</span>
                    </span>
                  ) : (
                    <span className="rl-dim">unnamed</span>
                  )}
                </td>
                <td className="rl-num" data-label="XRP">
                  {num(t.xrp)}
                  {t.escrowedXrp ? (
                    <span className="rl-sub">
                      incl. {xrpShort(t.escrowedXrp)} escrowed
                    </span>
                  ) : null}
                </td>
                <td className="rl-num" data-label="Value">
                  {xrpUsd ? usd(t.xrp * xrpUsd) : <span className="rl-dim">n/a</span>}
                </td>
                <td className="rl-num" data-label="Share of supply">
                  {pct(t.pctOfSupply)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
