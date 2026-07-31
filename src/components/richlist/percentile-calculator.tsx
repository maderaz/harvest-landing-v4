"use client";

// The percentile calculator on /xrp-rich-list.
//
// Three rules from the build spec drive every decision here.
//
// It never asks for a wallet address. A form requesting an address on a page
// about the largest holders looks exactly like phishing, in a community that
// is unusually alert to it, and the notice under the field says so explicitly
// rather than leaving the user to infer it.
//
// It computes client-side against a build-time ladder. No request per lookup,
// so no balance a visitor types is ever transmitted or logged.
//
// Its output is positive at every balance. The page title promises a rank, so
// the result is framed as a position rather than as a verdict: "you are in the
// top 23%, larger than 6.2 million accounts", never "you are not in the top
// 10%". Most XRPL accounts hold very little, so most people place higher than
// they expect, and that surprise is what gets shared.

import { useMemo, useState } from "react";

export interface LadderPoint {
  xrp: number;
  atOrAbove: number;
}

// Mirrors accountsAtOrAbove in src/lib/xrp-richlist.ts. The two must agree,
// because the prose above the calculator is rendered from the server copy and
// the result inside it from this one.
function accountsAtOrAbove(ladder: LadderPoint[], xrp: number): number {
  if (!ladder.length) return 0;
  if (xrp <= ladder[0].xrp) return ladder[0].atOrAbove;
  const last = ladder[ladder.length - 1];
  if (xrp >= last.xrp) return last.atOrAbove;
  let lo = 0;
  let hi = ladder.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ladder[mid].xrp <= xrp) lo = mid;
    else hi = mid;
  }
  const a = ladder[lo];
  const b = ladder[hi];
  const span = Math.log10(b.xrp) - Math.log10(a.xrp);
  const t = span > 0 ? (Math.log10(xrp) - Math.log10(a.xrp)) / span : 0;
  return a.atOrAbove + t * (b.atOrAbove - a.atOrAbove);
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} million` : fmt(n);

/**
 * Top-percentage label. Rounded so the number reads as a position rather than
 * as a measurement: "top 23%" is shareable, "top 22.8371%" is not, and the
 * ladder's resolution does not support the extra digits anyway.
 */
function topPctLabel(topPct: number): string {
  if (topPct < 0.01) return "top 0.01%";
  if (topPct < 1) return `top ${topPct.toFixed(2)}%`;
  if (topPct < 10) return `top ${topPct.toFixed(1)}%`;
  return `top ${Math.round(topPct)}%`;
}

export function PercentileCalculator({
  ladder,
  accounts,
  snapshotDate,
}: {
  ladder: LadderPoint[];
  accounts: number;
  snapshotDate: string;
}) {
  const [raw, setRaw] = useState("");
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => {
    // Accept "12,500", "12 500" and "12500.5". Rejecting a thousands separator
    // would fail the most natural way to type a balance.
    const n = Number(raw.replace(/[,\s_]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [raw]);

  const result = useMemo(() => {
    if (parsed == null) return null;
    const above = Math.min(accounts, Math.max(0, accountsAtOrAbove(ladder, parsed)));
    // "Larger than" counts accounts strictly below, which is the number that
    // makes the result feel like a position in a crowd.
    const below = Math.max(0, accounts - above);
    const topPct = (above / accounts) * 100;
    return { above, below, topPct };
  }, [parsed, ladder, accounts]);

  const shareText = result
    ? `${fmt(parsed ?? 0)} XRP puts you in the ${topPctLabel(result.topPct)} of XRP Ledger accounts, ` +
      `larger than ${compact(result.below)} of them (${snapshotDate}).`
    : "";

  return (
    <div className="rl-calc" id="calculator">
      <h2 className="rl-calc-h">XRP rich list calculator</h2>
      <p className="rl-calc-sub">
        Enter a balance to see where it ranks among all funded XRP Ledger
        accounts as of {snapshotDate}.
      </p>

      <label className="rl-calc-label" htmlFor="rl-balance">
        Your XRP balance
      </label>
      <div className="rl-calc-field">
        <input
          id="rl-balance"
          className="rl-calc-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 5,000"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setCopied(false);
          }}
          aria-describedby="rl-calc-privacy"
        />
        <span className="rl-calc-unit" aria-hidden="true">
          XRP
        </span>
      </div>
      <p className="rl-calc-privacy" id="rl-calc-privacy">
        No wallet connection. No address. Just a number. The calculation runs in
        your browser and nothing you type is sent anywhere.
      </p>

      <div className="rl-calc-out" role="status" aria-live="polite">
        {result ? (
          <>
            <p className="rl-calc-rank">
              You are in the <strong>{topPctLabel(result.topPct)}</strong>.
            </p>
            <p className="rl-calc-detail">
              A balance of {fmt(parsed ?? 0)} XRP is larger than{" "}
              <strong>{compact(result.below)}</strong> of the {compact(accounts)}{" "}
              funded XRP Ledger accounts as of {snapshotDate}.
            </p>
            <p className="rl-calc-detail rl-calc-dim">
              About {compact(result.above)} accounts hold at least that much.
            </p>
            <button
              type="button"
              className="rl-calc-share"
              onClick={() => {
                // Clipboard is unavailable over plain HTTP and in some
                // embedded browsers, so a failure leaves the button silent
                // rather than throwing into an empty catch the user can see.
                navigator.clipboard?.writeText(shareText).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "Copied" : "Copy result"}
            </button>
          </>
        ) : (
          <p className="rl-calc-idle">
            {raw.trim() === ""
              ? "Your rank appears here."
              : "Enter a balance greater than zero."}
          </p>
        )}
      </div>
    </div>
  );
}
