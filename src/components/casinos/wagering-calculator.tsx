"use client";

// What a bonus is actually worth once its playthrough is priced.
//
// Every competing ranking prints the headline figure. This turns it into the
// turnover it obliges and the expected cost of that turnover at the game's
// house edge, which is the number that decides whether the bonus is worth
// taking. Runs in the browser; nothing is sent anywhere.

import { useState } from "react";
import { wageringMath } from "@/lib/crypto-casinos";

// Edge, and how much of a wager the bonus terms usually count. Slots clear a
// playthrough at face value; tables often count a fifth, which turns 40x into
// 200x of blackjack and is the term most readers never find.
const GAMES = [
  { label: "Slots, typical", pct: 4, contrib: 100 },
  { label: "Blackjack, basic strategy", pct: 0.5, contrib: 20 },
  { label: "Baccarat, banker", pct: 1.06, contrib: 20 },
  { label: "European roulette", pct: 2.7, contrib: 20 },
  { label: "American roulette", pct: 5.26, contrib: 20 },
];

export interface CalcPreset {
  slug: string;
  name: string;
  cap: number;
  wagering: number;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export function WageringCalculator({
  presets = [],
  defaultSlug,
}: {
  presets?: CalcPreset[];
  /** Which listed offer the tool opens on. The row the page ranks first, so
   *  the intent the headline set survives into the tool. */
  defaultSlug?: string;
}) {
  const start = presets.find((p) => p.slug === defaultSlug) ?? presets[0];
  const [bonus, setBonus] = useState(start ? String(start.cap) : "500");
  const [wr, setWr] = useState(start ? String(start.wagering) : "40");
  const [gameIdx, setGameIdx] = useState(0);
  const [shown, setShown] = useState<
    { b: number; w: number; g: (typeof GAMES)[number] } | null
  >(null);

  const applyPreset = (slug: string) => {
    const p = presets.find((x) => x.slug === slug);
    if (!p) return;
    setBonus(String(p.cap));
    setWr(String(p.wagering));
    setShown(null);
  };

  const calculate = () => {
    const b = Number(bonus.replace(/[,\s]/g, "")) || 0;
    const w = Number(wr) || 0;
    if (b <= 0 || w < 0) return;
    setShown({ b, w, g: GAMES[gameIdx] });
  };

  // A game that counts a fifth of each wager needs five times the turnover.
  const effectiveWr = shown ? shown.w * (100 / shown.g.contrib) : 0;
  const res = shown ? wageringMath(shown.b, effectiveWr, shown.g.pct) : null;

  return (
    <div className="cc-calc">
      <div className="cc-calc-in">
        {presets.length > 0 && (
          <>
            <label className="cc-calc-label" htmlFor="cc-preset">
              Load a listed offer
            </label>
            <div className="cc-calc-field cc-calc-field--select">
              <select
                id="cc-preset"
                className="cc-calc-input"
                defaultValue={start?.slug ?? ""}
                onChange={(e) => applyPreset(e.target.value)}
              >
                <option value="">Type my own numbers</option>
                {presets.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name} · ${p.cap.toLocaleString("en-US")} at {p.wagering}x
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
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

        <label className="cc-calc-label" htmlFor="cc-edge">Game you would clear it on</label>
        <div className="cc-calc-field cc-calc-field--select">
          <select
            id="cc-edge"
            className="cc-calc-input"
            value={gameIdx}
            onChange={(e) => setGameIdx(Number(e.target.value))}
          >
            {GAMES.map((g, i) => (
              <option key={g.label} value={i}>
                {g.label} ({g.pct}% edge, counts {g.contrib}%)
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="cc-calc-go" onClick={calculate}>
          Calculate
        </button>
        <p className="cc-calc-privacy">
          Expected cost is house edge multiplied by required turnover. It is
          not a prediction of what you will lose. Runs in your browser.
          Educational only, not advice or an offer.
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
              {money(shown.b * shown.w)} of turnover on slots.{" "}
              {shown.g.contrib < 100
                ? `${shown.g.label} counts ${shown.g.contrib}% of each wager, so clearing it there takes $${money(res.turnover)}.`
                : ""}
            </p>
            <ul className="cc-calc-facts">
              <li>
                At a {shown.g.pct}% house edge that turnover costs about{" "}
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
        ) : null}
      </div>
    </div>
  );
}
