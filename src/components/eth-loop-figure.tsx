"use client";

// Animated figure for the leveraged-looping paragraph on /eth.
//
// A loop is the one ETH strategy whose mechanism does not survive being
// written down: "supply, borrow against it, supply again" reads as a sentence
// and lands as nothing. Drawn, it is obvious. The figure builds the loop one
// round at a time, stacks the position as it grows, counts the net rate up,
// then raises the borrow rate until the same multiplier turns the position
// negative, which is the leverage risk the risk section names.
//
// Every number is illustrative and labelled so: a 75% loan-to-value, a 2.5%
// supply rate and a 2.0% borrow rate, chosen to make the arithmetic legible
// rather than to describe any live strategy. Net rate on the starting ETH is
//
//   net = supply * L - borrow * (L - 1)      L = total supplied / starting ETH
//
// SVG and CSS rather than video: it is sharp at any width, weighs a few KB,
// and starts only when scrolled into view. With reduced motion requested it
// renders the finished state and does not move.

import { useEffect, useRef, useState } from "react";

const LTV = 0.75;
const SUPPLY = 2.5;
const BORROW = 2.0;
const BORROW_SPIKE = 4.0;
const ROUNDS = 4; // starting ETH plus three loops

/** Cumulative leverage after each round: 1, 1.75, 2.3125, 2.734375 */
const LEVERAGE = Array.from({ length: ROUNDS }, (_, i) =>
  Array.from({ length: i + 1 }, (_, k) => LTV ** k).reduce((a, b) => a + b, 0),
);
const net = (lev: number, borrow: number) => SUPPLY * lev - borrow * (lev - 1);

// Timeline. Each step is one beat of the story, ms from the start.
//  0..3  rounds of the loop (arcs draw, layers stack, net rises)
//  4     borrow rate spikes
//  5     verdict
const BEATS = [400, 1700, 3000, 4300, 6400, 7600];
const HOLD = 5200; // pause on the last frame before replaying

const LAYER_LABELS = ["Starting ETH", "Borrowed, round 1", "Borrowed, round 2", "Borrowed, round 3"];

export function EthLoopFigure() {
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(-1);
  const [run, setRun] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReduced(true);
      setStep(BEATS.length - 1);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let timers: number[] = [];
    // The observer fires again whenever layout shifts (sparklines and fonts
    // load below the figure), so it only starts a run when none is going.
    let playing = false;
    const clear = () => {
      timers.forEach(clearTimeout);
      timers = [];
      playing = false;
    };
    const play = () => {
      clear();
      playing = true;
      setStep(-1);
      BEATS.forEach((t, i) => timers.push(window.setTimeout(() => setStep(i), t)));
      timers.push(window.setTimeout(play, BEATS[BEATS.length - 1] + HOLD));
    };
    const io = new IntersectionObserver(
      ([e]) => {
        // Start on first sight and keep looping. Resetting on exit made the
        // figure restart whenever layout shifted it partly out of view.
        if (e.isIntersecting && !playing) play();
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
    };
  }, [run]);

  const round = Math.min(step, ROUNDS - 1); // -1..3
  const lev = round >= 0 ? LEVERAGE[round] : 0;
  const spiked = step >= 4;
  const borrow = spiked ? BORROW_SPIKE : BORROW;
  const netRate = round >= 0 ? net(lev, borrow) : 0;
  const negative = netRate < 0;

  // Stacked position bar: layer heights proportional to ETH in each round.
  const BAR_H = 300;
  const unit = BAR_H / LEVERAGE[ROUNDS - 1];
  let y = 430;

  return (
    <figure
      ref={ref}
      className={`eh-fig${spiked ? " is-spiked" : ""}${negative && step >= 5 ? " is-negative" : ""}${reduced ? " is-static" : ""}`}
      aria-labelledby="loop-fig-title"
    >
      <div className="eh-fig-head">
        <h3 id="loop-fig-title">How a leveraged loop multiplies the spread</h3>
        <figcaption>
          Illustrative: 75% loan-to-value, 2.5% supply rate, 2.0% borrow rate. Not a live
          strategy.
        </figcaption>
      </div>

      <svg viewBox="0 0 960 470" className="eh-fig-svg" role="img" aria-labelledby="loop-fig-desc">
        <desc id="loop-fig-desc">
          ETH is supplied, borrowed against at 75% and supplied again, three times. The position
          grows from 1 ETH to about 2.73 ETH and the net rate on the starting ETH rises from 2.5% to
          about 3.4%. When the borrow rate rises from 2.0% to 4.0%, the same leverage turns the net
          rate slightly negative.
        </desc>
        <defs>
          <linearGradient id="lf-supply" x1="0" x2="1">
            <stop offset="0" stopColor="#3b6cff" />
            <stop offset="1" stopColor="#7d8bff" />
          </linearGradient>
          <linearGradient id="lf-borrow" x1="0" x2="1">
            <stop offset="0" stopColor="#8a6cff" />
            <stop offset="1" stopColor="#d06bd8" />
          </linearGradient>
          <linearGradient id="lf-again" x1="0" x2="1">
            <stop offset="0" stopColor="#d06bd8" />
            <stop offset="1" stopColor="#3b6cff" />
          </linearGradient>
          <radialGradient id="lf-glow">
            <stop offset="0" stopColor="#ffb936" stopOpacity="0.35" />
            <stop offset="1" stopColor="#ffb936" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ---- the loop ---- */}
        <g className={`lf-cycle${step >= 0 ? " is-on" : ""}`} data-round={round}>
          <circle cx="220" cy="245" r="120" fill="url(#lf-glow)" className="lf-glow" />
          {/* three arcs around a circle of radius 150 centred at (250, 250) */}
          <path pathLength={1} className={`lf-arc lf-arc-1${round >= 0 ? " is-drawn" : ""}`} d="M 251.2 98.3 A 150 150 0 0 1 362.7 291.4" stroke="url(#lf-supply)" />
          <path pathLength={1} className={`lf-arc lf-arc-2${round >= 1 ? " is-drawn" : ""}`} d="M 331.5 345.4 A 150 150 0 0 1 108.5 345.4" stroke="url(#lf-borrow)" />
          <path pathLength={1} className={`lf-arc lf-arc-3${round >= 2 ? " is-drawn" : ""}`} d="M 77.3 291.4 A 150 150 0 0 1 188.8 98.3" stroke="url(#lf-again)" />
          <path pathLength={1} className={`lf-flow${round >= 0 ? " is-drawn" : ""}`} d="M 251.2 98.3 A 150 150 0 0 1 362.7 291.4" />
          <path pathLength={1} className={`lf-flow${round >= 1 ? " is-drawn" : ""}`} d="M 331.5 345.4 A 150 150 0 0 1 108.5 345.4" />
          <path pathLength={1} className={`lf-flow${round >= 2 ? " is-drawn" : ""}`} d="M 77.3 291.4 A 150 150 0 0 1 188.8 98.3" />

          <text x="220" y="58" className="lf-node">Supply ETH</text>
          <text x="220" y="78" className="lf-node-sub">earns the supply rate</text>
          <text x="352" y="404" className="lf-node">Borrow ETH</text>
          <text x="352" y="424" className="lf-node-sub">against it, at 75%</text>
          <text x="88" y="404" className="lf-node">Supply it again</text>
          <text x="88" y="424" className="lf-node-sub">and repeat</text>

          <text x="220" y="242" className="lf-lev">
            {round >= 0 ? `${lev.toFixed(2)}×` : "1.00×"}
          </text>
          <text x="220" y="272" className="lf-lev-sub">
            {round >= 0 ? `round ${round + 1} of ${ROUNDS}` : "leverage"}
          </text>
        </g>

        {/* ---- the position ---- */}
        <g className="lf-stack">
          <text x="470" y="110" className="lf-col-h" textAnchor="start">Position</text>
          <line x1="458" x2="602" y1="430.5" y2="430.5" className="lf-axis" />
          <text x="470" y="456" className="lf-legend" textAnchor="start">1 ETH yours, the rest borrowed</text>
          {LEVERAGE.map((_, i) => {
            const h = LTV ** i * unit;
            y -= h;
            const shown = round >= i;
            return (
              <g key={i} className={`lf-layer${shown ? " is-in" : ""}${i > 0 ? " is-borrowed" : ""}`}>
                <rect x="470" y={y + 2} width="120" height={Math.max(h - 4, 2)} rx="8">
                  <title>{LAYER_LABELS[i]}</title>
                </rect>
                <text x="530" y={y + h / 2 + 5} textAnchor="middle" className="lf-layer-t">
                  {i === 0 ? "1.00 ETH" : `+${(LTV ** i).toFixed(2)}`}
                </text>
              </g>
            );
          })}
        </g>

        {/* ---- the arithmetic ---- */}
        <g className="lf-math">
          <text x="660" y="110" textAnchor="start" className="lf-col-h">Net rate on 1 ETH</text>
          <text x="660" y="170" textAnchor="start" className={`lf-net${negative ? " is-neg" : ""}`}>
            {round >= 0 ? `${netRate >= 0 ? "" : "−"}${Math.abs(netRate).toFixed(2)}%` : "2.50%"}
          </text>
          <text x="660" y="204" textAnchor="start" className="lf-math-row">
            {`earns ${SUPPLY.toFixed(1)}% on ${(round >= 0 ? lev : 1).toFixed(2)} ETH`}
          </text>
          <text x="660" y="228" textAnchor="start" className={`lf-math-row lf-borrow-row${spiked ? " is-hot" : ""}`}>
            {`pays ${borrow.toFixed(1)}% on ${(round >= 0 ? lev - 1 : 0).toFixed(2)} ETH`}
          </text>
          <g className={`lf-spike${spiked ? " is-in" : ""}`}>
            <text x="660" y="276" textAnchor="start" className="lf-spike-t">Borrow rate jumps to 4.0%</text>
          </g>
          <g className={`lf-verdict${step >= 5 ? " is-in" : ""}`}>
            <text x="660" y="306" textAnchor="start" className="lf-verdict-t">
              The same leverage now
            </text>
            <text x="660" y="330" textAnchor="start" className="lf-verdict-t">
              works against the position
            </text>
          </g>
        </g>
      </svg>

      {!reduced ? (
        <button type="button" className="eh-fig-replay" onClick={() => setRun((r) => r + 1)}>
          Replay
        </button>
      ) : null}
    </figure>
  );
}
