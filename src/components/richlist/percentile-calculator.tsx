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

import { useEffect, useMemo, useRef, useState } from "react";

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

// The lookup itself is a binary search over a few hundred points and returns
// in well under a millisecond. The check is paced anyway, because a rank that
// appears the instant a digit is typed reads as a guess, and because the page
// is competing on being a tool rather than a table. The stages below name what
// the ladder actually represents at each step, so the wait describes real work
// rather than inventing some.
const CHECK_MS = 3000;
const STAGES = [
  "Reading the ledger snapshot",
  "Placing your balance in the distribution",
  "Counting accounts above and below",
];

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
  const [phase, setPhase] = useState<"idle" | "checking" | "done">("idle");
  const [stage, setStage] = useState(0);
  // Held so an unmount or a restart cannot leave a timer writing into a
  // component that is no longer on the page.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The button is never disabled, so it needs somewhere to send a visitor who
  // presses it before typing anything.
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("idle");
    setStage(0);
    setCopied(false);
  };

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

  const startCheck = () => {
    // `disabled` is gone from the button, so the mid-check guard that attribute
    // used to provide has to live here: a second press while the bar is
    // running would restart it from zero.
    if (phase === "checking") return;
    // A greyed-out primary action on the one control this page exists for
    // reads as broken, so the button always looks live. When there is nothing
    // to check it puts the cursor in the field rather than doing nothing.
    if (parsed == null) {
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("checking");
    setStage(0);
    const step = CHECK_MS / STAGES.length;
    for (let i = 1; i < STAGES.length; i++) {
      timers.current.push(setTimeout(() => setStage(i), step * i));
    }
    timers.current.push(setTimeout(() => setPhase("done"), CHECK_MS));
  };

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
          ref={inputRef}
          id="rl-balance"
          className="rl-calc-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 5,000"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            reset();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && parsed != null && phase !== "checking") startCheck();
          }}
          aria-describedby="rl-calc-privacy"
        />
        <span className="rl-calc-unit" aria-hidden="true">
          XRP
        </span>
      </div>
      <button
        type="button"
        className="rl-calc-go"
        onClick={startCheck}
        // Only while a check is running, which is the one moment pressing it
        // genuinely does nothing. It is NOT set for an empty field: assistive
        // tech and automation both treat aria-disabled as non-interactive, and
        // with no balance typed the press has a job to do, so marking it
        // disabled then would be a lie that also blocks the behaviour.
        aria-disabled={phase === "checking"}
      >
        {phase === "checking" ? "Checking" : phase === "done" ? "Check again" : "Start check"}
      </button>

      <p className="rl-calc-privacy" id="rl-calc-privacy">
        <svg
          className="rl-lock"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <rect x="3" y="7" width="10" height="7" rx="1.6" fill="currentColor" />
        </svg>
        <span>
          No wallet connection. No address. Just a number, and an approximation
          is fine. The calculation runs in your browser against XRP Ledger data
          and nothing you type is sent anywhere.
        </span>
      </p>

      <div className="rl-calc-out" role="status" aria-live="polite">
        {phase === "checking" ? (
          <div className="rl-check">
            <div className="rl-check-bar" aria-hidden="true">
              <span style={{ animationDuration: `${CHECK_MS}ms` }} />
            </div>
            <ol className="rl-check-stages">
              {STAGES.map((label, i) => (
                <li key={label} className={i <= stage ? "is-on" : undefined}>
                  {label}
                </li>
              ))}
            </ol>
          </div>
        ) : phase === "done" && result ? (
          <>
            <p className="rl-calc-rank">
              You are in the <strong>{topPctLabel(result.topPct)}</strong>.
            </p>
            <p className="rl-calc-detail">
              A balance of {fmt(parsed ?? 0)} XRP, measured against all{" "}
              {compact(accounts)} funded XRP Ledger accounts as of {snapshotDate}.
            </p>
            <ul className="rl-calc-facts">
              <li>
                There are about <strong>{compact(result.above)}</strong> XRP
                accounts holding more XRP than that.
              </li>
              <li>
                There are about <strong>{compact(result.below)}</strong> XRP
                accounts holding less.
              </li>
            </ul>
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
              ? "Enter a balance, then start the check."
              : parsed == null
                ? "Enter a balance greater than zero."
                : "Ready. Start the check to see where this balance ranks."}
          </p>
        )}
      </div>
    </div>
  );
}
