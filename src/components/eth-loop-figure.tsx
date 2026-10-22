"use client";

// Animated figure for the leveraged-looping paragraph on /eth.
//
// A loop is the one ETH strategy whose mechanism does not survive being
// written down: "supply, borrow against it, supply again" reads as a sentence
// and lands as nothing. Drawn, it is obvious. The figure builds the loop one
// round at a time, stacks the position as it grows and counts the net rate up,
// then sets the result beside the rate of supplying without the loop.
//
// One idea per frame and few words on screen: three short node labels, one
// leverage figure, one position bar, one net rate. Labels sit clear of the
// arcs, never on them.
//
// Every number is illustrative and labelled so: 75% loan-to-value, a 2.5%
// supply rate and a 2.0% borrow rate. Net rate on the starting ETH is
//
//   net = supply * L - borrow * (L - 1)      L = total supplied / starting ETH
//
// SVG and CSS rather than video: sharp at any width, a few KB, and it starts
// only when scrolled into view. With reduced motion it renders the finished
// state and does not move.
//
// Drawn in the social-card style: an orange dotted canvas holding a header,
// one dark brown panel and a footer note. Inside the panel the chart is one
// series in brand orange, the part that has not grown (the starting ETH, the
// plain supply rate) at reduced strength, and a faint "Harvest" watermark sits
// top-left over empty space, clear of every mark.

import { useEffect, useRef, useState } from "react";
import { AssetIcon } from "@/components/token-icons";

const LTV = 0.75;
const SUPPLY = 2.5;
const BORROW = 2.0;
const ROUNDS = 4; // starting ETH plus three loops

/** Cumulative leverage after each round: 1, 1.75, 2.3125, 2.734375 */
const LEVERAGE = Array.from({ length: ROUNDS }, (_, i) =>
  Array.from({ length: i + 1 }, (_, k) => LTV ** k).reduce((a, b) => a + b, 0),
);
const net = (lev: number) => SUPPLY * lev - BORROW * (lev - 1);
const FINAL = net(LEVERAGE[ROUNDS - 1]);

// Beats, in ms from the start: rounds 1-4, then the comparison.
const BEATS = [300, 1500, 2700, 3900, 5200];
const HOLD = 5500;
const LAST = BEATS.length - 1;

// Comparison bars: px per percentage point.
const PX = 58;

export function EthLoopFigure() {
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(-1);
  const [run, setRun] = useState(0);
  const [reduced, setReduced] = useState(false);
  // On a phone the three parts stack: the loop on top, then the position and
  // the net rate side by side under it, so the drawing fits without scrolling.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setStep(LAST);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let timers: number[] = [];
    // The observer fires again whenever layout shifts (sparklines and fonts
    // load below the figure), so it starts a run only when none is going, and
    // a run keeps looping once started.
    let playing = false;
    const play = () => {
      timers.forEach(clearTimeout);
      timers = [];
      playing = true;
      setStep(-1);
      BEATS.forEach((t, i) => timers.push(window.setTimeout(() => setStep(i), t)));
      timers.push(window.setTimeout(play, BEATS[LAST] + HOLD));
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !playing) play();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [run]);

  const round = Math.min(step, ROUNDS - 1); // -1..3
  const lev = round >= 0 ? LEVERAGE[round] : 1;
  const done = step >= LAST;

  // Stacked position bar, layer heights proportional to ETH in each round.
  const BASE_Y = 380;
  const BAR_H = 250;
  const unit = BAR_H / LEVERAGE[ROUNDS - 1];
  let y = BASE_Y;

  return (
    <figure
      ref={ref}
      className={`eh-fig${done ? " is-done" : ""}${reduced ? " is-static" : ""}`}
      aria-labelledby="loop-fig-title"
      // The animated labels are frames of a drawing, not claims; keep them out
      // of search snippets. The <desc> carries the one-sentence summary.
      data-nosnippet=""
    >
      <header className="eh-fig-head">
        <div className="eh-fig-title">
          <p className="eh-fig-eyebrow">Leveraged looping</p>
          <div className="eh-fig-titlerow">
            <AssetIcon asset="ETH" size={44} />
            <h3 id="loop-fig-title">How a loop multiplies the spread</h3>
          </div>
        </div>
        <p className="eh-fig-meta">
          <span>Supply 2.5% · Borrow 2.0%</span>
          <strong>75% LTV</strong>
        </p>
      </header>

      <div className="eh-fig-panel">
        <p className="eh-fig-label">Position and net rate · 3 loops</p>
      <svg
        viewBox={narrow ? "0 0 480 920" : "0 0 960 520"}
        className="eh-fig-svg" role="img" aria-labelledby="loop-fig-desc">
        <desc id="loop-fig-desc">
          ETH is supplied, borrowed against at 75% and supplied again, three times. The position
          grows from 1 ETH to about 2.73 ETH, and the net rate on the starting ETH rises from 2.50%
          to about 3.37%, against 2.50% for supplying without the loop.
        </desc>
        <defs>
          <radialGradient id="lf-glow">
            <stop offset="0" stopColor="#ffb234" stopOpacity="0.18" />
            <stop offset="1" stopColor="#ffb234" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Watermark: top-left, over the empty band above the drawing. */}
        <text x="0" y="96" className="lf-mark" aria-hidden="true">
          Harvest
        </text>
        <g transform="translate(0 100)">

        {/* ---- the loop: circle r=125 centred at (200, 215) ---- */}
        <g
          className={`lf-cycle${step >= 0 ? " is-on" : ""}`}
          transform={narrow ? "translate(40 0)" : undefined}
        >
          <circle cx="200" cy="215" r="100" fill="url(#lf-glow)" className="lf-glow" />
          {[
            // arcs run -78°..18°, 42°..138°, 162°..258°, leaving gaps at the nodes
            { d: "M 226.0 92.7 A 125 125 0 0 1 318.9 253.6", g: "#ffb234" },
            { d: "M 292.9 298.6 A 125 125 0 0 1 107.1 298.6", g: "#ffb234" },
            { d: "M 81.1 253.6 A 125 125 0 0 1 174.0 92.7", g: "#ffb234" },
          ].map((a, i) => (
            <g key={i}>
              <path
                pathLength={1}
                d={a.d}
                stroke={a.g}
                className={`lf-arc${round >= i ? " is-drawn" : ""}`}
              />
              <path pathLength={1} d={a.d} className={`lf-flow${round >= i ? " is-drawn" : ""}`} />
            </g>
          ))}

          {/* Node labels sit outside the circle, clear of every arc end. */}
          <text x="200" y="56" className="lf-node">Supply ETH</text>
          <text x="318" y="396" className="lf-node">Borrow 75%</text>
          <text x="82" y="396" className="lf-node">Supply again</text>

          <text x="200" y="226" className="lf-lev">{`${lev.toFixed(2)}×`}</text>
          <text x="200" y="256" className="lf-lev-sub">leverage</text>
        </g>

        {/* ---- the position ---- */}
        <g className="lf-stack" transform={narrow ? "translate(-470 430)" : undefined}>
          <text x="510" y="96" className="lf-col-h">Position</text>
          <line x1="500" x2="640" y1={BASE_Y + 0.5} y2={BASE_Y + 0.5} className="lf-axis" />
          {LEVERAGE.map((_, i) => {
            const h = LTV ** i * unit;
            y -= h;
            return (
              <g key={i} className={`lf-layer${round >= i ? " is-in" : ""}${i > 0 ? " is-borrowed" : ""}`}>
                <rect x="510" y={y + 3} width="120" height={h - 6} rx="9" />
                <text x="570" y={y + h / 2 + 6} textAnchor="middle" className="lf-layer-t">
                  {i === 0 ? "1 ETH" : `+${(LTV ** i).toFixed(2)}`}
                </text>
              </g>
            );
          })}
        </g>

        {/* ---- the result ---- */}
        <g className="lf-math" transform={narrow ? "translate(-505 430)" : undefined}>
          <text x="700" y="96" className="lf-col-h">Net rate on 1 ETH</text>
          <text x="700" y="160" className="lf-net">{`${net(lev).toFixed(2)}%`}</text>
          <g className={`lf-compare${done ? " is-in" : ""}`}>
            <text x="700" y="250" className="lf-compare-h">Supplying alone</text>
            <rect x="700" y="264" width={SUPPLY * PX} height="12" rx="6" className="lf-bar-plain" />
            <text x={700 + SUPPLY * PX + 10} y="275" className="lf-bar-t">{`${SUPPLY.toFixed(2)}%`}</text>
            <text x="700" y="318" className="lf-compare-h">With the loop</text>
            <rect x="700" y="332" width={FINAL * PX} height="12" rx="6" className="lf-bar-loop" />
            <text x={700 + FINAL * PX + 10} y="343" className="lf-bar-t lf-bar-t-hi">
              {`${FINAL.toFixed(2)}%`}
            </text>
          </g>
        </g>
        </g>
      </svg>
      </div>

      <footer className="eh-fig-foot">
        <p className="eh-fig-note">
          Illustrative figures: 75% loan-to-value, a 2.5% supply rate and a 2.0% borrow rate.
          Real rates move, and a borrow rate above the supply rate turns the loop against the
          position.
        </p>
        {!reduced ? (
          <button type="button" className="eh-fig-replay" onClick={() => setRun((r) => r + 1)}>
            Replay
          </button>
        ) : null}
      </footer>
    </figure>
  );
}
