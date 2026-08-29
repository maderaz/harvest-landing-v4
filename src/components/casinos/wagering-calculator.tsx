"use client";

// What a bonus is actually worth once its playthrough is priced.
//
// Every competing ranking prints the headline figure. This turns it into the
// turnover it obliges and the expected cost of that turnover at the game's
// house edge, which is the number that decides whether the bonus is worth
// taking. Runs in the browser; nothing is sent anywhere.

import { useState } from "react";
import { wageringMath } from "@/lib/crypto-casinos";

const EDGES = [
  { label: "Blackjack, basic strategy", pct: 0.5 },
  { label: "Baccarat, banker", pct: 1.06 },
  { label: "European roulette", pct: 2.7 },
  { label: "Slots, typical", pct: 4 },
  { label: "American roulette", pct: 5.26 },
];

const money = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export function WageringCalculator() {
  const [bonus, setBonus] = useState("500");
  const [wr, setWr] = useState("40");
  const [edge, setEdge] = useState(4);
  const [shown, setShown] = useState<{ b: number; w: number; e: number } | null>(
    null,
  );

  const calculate = () => {
    const b = Number(bonus.replace(/[,\s]/g, "")) || 0;
    const w = Number(wr) || 0;
    if (b <= 0 || w <= 0) return;
    setShown({ b, w, e: edge });
  };

  const res = shown ? wageringMath(shown.b, shown.w, shown.e) : null;

  return (
    <div className="cc-calc">
      <div className="cc-calc-in">
        <label className="cc-calc-label" htmlFor="cc-bonus">Bonus amount (USD)</label>
        <div className="cc-calc-field">
          <input
            id="cc-bonus"
            className="cc-calc-input"
            inputMode="decimal"
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
          />
          <span className="cc-calc-unit">USD</span>
        </div>

        <label className="cc-calc-label" htmlFor="cc-wr">Wagering requirement</label>
        <div className="cc-calc-field">
          <input
            id="cc-wr"
            className="cc-calc-input"
            inputMode="numeric"
            value={wr}
            onChange={(e) => setWr(e.target.value)}
          />
          <span className="cc-calc-unit">x</span>
        </div>

        <label className="cc-calc-label" htmlFor="cc-edge">Game</label>
        <div className="cc-calc-field cc-calc-field--select">
          <select
            id="cc-edge"
            className="cc-calc-input"
            value={edge}
            onChange={(e) => setEdge(Number(e.target.value))}
          >
            {EDGES.map((g) => (
              <option key={g.label} value={g.pct}>
                {g.label} ({g.pct}% edge)
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="cc-calc-go" onClick={calculate}>
          Calculate
        </button>
        <p className="cc-calc-privacy">
          Runs in your browser. Educational only, not advice or an offer.
        </p>
      </div>

      <div className="cc-calc-res" role="status" aria-live="polite">
        {res && shown ? (
          <>
            <p className="cc-calc-headline">
              You would have to wager <strong>${money(res.turnover)}</strong> to
              clear it
            </p>
            <p className="cc-calc-detail">
              A ${money(shown.b)} bonus at {shown.w}x playthrough obliges $
              {money(res.turnover)} of turnover.
            </p>
            <ul className="cc-calc-facts">
              <li>
                At a {shown.e}% house edge that turnover costs about{" "}
                <strong>${money(res.expectedCost)}</strong> on average.
              </li>
              <li>
                The bonus is worth about{" "}
                <strong>
                  {res.net >= 0 ? `$${money(res.net)}` : `−$${money(-res.net)}`}
                </strong>{" "}
                once that cost is taken off.
              </li>
            </ul>
            <p className="cc-calc-foot">
              An average, not an outcome. Any single session lands anywhere
              around it, and a house edge is the long-run cost of play rather
              than a fee you are charged.
            </p>
          </>
        ) : (
          <p className="cc-calc-rest">
            Enter a bonus and its playthrough to see what clearing it costs.
          </p>
        )}
      </div>
    </div>
  );
}
