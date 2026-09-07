"use client";

// What a bonus asks for in betting volume, and what that volume costs.
//
// Two things kept apart on purpose. Which games a casino allows and at what
// rate is a fact about its terms; the house edge and contribution figures in
// the dropdown are generic illustrations. A calculation that mixes them would
// tell a reader a venue permits a game nobody has checked, so a preset with no
// published eligibility is labelled a custom scenario and says so.
//
// Runs in the browser; nothing is sent anywhere.

import { useMemo, useState } from "react";

/**
 * Illustrative game assumptions. Not the terms of any casino.
 *
 * Edge and contribution are typical figures, editable in the panel, and the
 * label says which they are. Contribution has three states rather than two:
 * slots usually clear at face value, tables often count a fifth, and some
 * terms bar a category outright while a bonus is live.
 */
const GAMES = [
  { label: "Slots", edge: 4, contrib: 100 },
  { label: "Blackjack", edge: 0.5, contrib: 20 },
  { label: "Baccarat", edge: 1.06, contrib: 20 },
  { label: "European roulette", edge: 2.7, contrib: 20 },
  { label: "American roulette", edge: 5.26, contrib: 20 },
  { label: "Video poker", edge: 2, contrib: 20 },
];

/** The game a venue's own terms name as the only eligible one. */
const SLOTS_ONLY: Record<string, string> = {
  "wild-io":
    "Wild.io bonus terms 2.4 allow wagering in slots only, and bar table, live, jackpot and sportsbook play while a bonus is active.",
};

export interface CalcPreset {
  slug: string;
  name: string;
  /** The amount the playthrough multiplies. */
  bonus: number;
  wagering: number;
  /** Which stage of a multi-deposit offer the amount above is. */
  stage?: string | null;
}

const money = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

const num = (s: string) => Number(s.replace(/[,\s$]/g, "")) || 0;

interface Shown {
  sig: string;
  slug: string;
  name: string;
  base: number;
  wr: number;
  edge: number;
  contrib: number;
  game: string;
  wagersDeposit: boolean;
  published: string | null;
}

/**
 * What the tool opens on: a $100 bonus at 40× on bonus funds, slots, before
 * anyone has touched a control. The panel shows the worked answer rather than
 * an empty box, and its signature matches the initial inputs so the first
 * render is not marked out of date.
 */
interface Inputs {
  slug: string;
  bonus: string;
  wr: string;
  applies: "bonus" | "deposit";
  deposit: string;
  gameIdx: number;
  edge: string;
  contrib: string;
}

const INIT: Inputs = {
  slug: "",
  bonus: "100",
  wr: "40",
  applies: "bonus",
  deposit: "100",
  gameIdx: 0,
  edge: "4",
  contrib: "100",
};

const sigOf = (s: Inputs) =>
  [s.slug, s.bonus, s.wr, s.applies, s.deposit, s.gameIdx, s.edge, s.contrib].join("|");

const EXAMPLE: Shown = {
  sig: sigOf(INIT),
  slug: "",
  name: "",
  base: 100,
  wr: 40,
  edge: 4,
  contrib: 100,
  game: "Slots",
  wagersDeposit: false,
  published: null,
};

export function WageringCalculator({ presets = [] }: { presets?: CalcPreset[] }) {
  const [slug, setSlug] = useState(INIT.slug);
  const [bonus, setBonus] = useState(INIT.bonus);
  const [wr, setWr] = useState(INIT.wr);
  const [applies, setApplies] = useState<"bonus" | "deposit">(INIT.applies);
  const [deposit, setDeposit] = useState(INIT.deposit);
  const [gameIdx, setGameIdx] = useState(INIT.gameIdx);
  const [edge, setEdge] = useState(INIT.edge);
  const [contrib, setContrib] = useState(INIT.contrib);
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState<Shown>(EXAMPLE);

  const preset = presets.find((p) => p.slug === slug);
  const published = preset ? (SLOTS_ONLY[preset.slug] ?? null) : null;

  const sig = sigOf({ slug, bonus, wr, applies, deposit, gameIdx, edge, contrib });
  const stale = shown.sig !== sig;

  const pickGame = (i: number) => {
    setGameIdx(i);
    setEdge(String(GAMES[i].edge));
    setContrib(String(GAMES[i].contrib));
  };

  const applyPreset = (next: string) => {
    setSlug(next);
    const p = presets.find((x) => x.slug === next);
    if (!p) return;
    setBonus(String(p.bonus));
    setWr(String(p.wagering));
    setApplies("bonus");
  };

  const calculate = () => {
    const b = num(bonus);
    const w = num(wr);
    if (b <= 0 || w < 0) return;
    // A venue whose terms name slots as the only eligible game contributes
    // nothing on anything else, whatever the generic figure says.
    const barred = published != null && GAMES[gameIdx].label !== "Slots";
    setShown({
      sig,
      slug,
      name: preset?.name ?? "",
      base: applies === "deposit" ? b + num(deposit) : b,
      wr: w,
      edge: num(edge),
      contrib: barred ? 0 : num(contrib),
      game: GAMES[gameIdx].label,
      wagersDeposit: applies === "deposit",
      published,
    });
  };

  const res = useMemo(() => {
    const required = shown.base * shown.wr;
    if (shown.contrib <= 0) return { required, volume: null, cost: null };
    const volume = required * (100 / shown.contrib);
    return { required, volume, cost: volume * (shown.edge / 100) };
  }, [shown]);

  // What the result is a calculation of. A casino name here would claim the
  // venue permits the selected game, which is exactly the thing nobody has
  // read for most of this list.
  const scenario = !shown.slug
    ? "Custom scenario"
    : shown.published
      ? `${shown.name}, published terms`
      : `Custom scenario, ${shown.name} amounts`;

  return (
    <div className="cc-calc">
      <div className="cc-calc-in">
          {presets.length > 0 && (
            <>
              <label className="cc-calc-label" htmlFor="cc-preset">
                Casino offer
              </label>
              <div className="cc-calc-field cc-calc-field--select">
                <select
                  id="cc-preset"
                  className="cc-calc-input"
                  value={slug}
                  onChange={(e) => applyPreset(e.target.value)}
                >
                  <option value="">Enter my own amount</option>
                  {presets.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name} · {money(p.bonus)} at {p.wagering}×
                    </option>
                  ))}
                </select>
              </div>
              {preset?.stage ? (
                <p className="cc-calc-hint">
                  {money(preset.bonus)} is the {preset.stage}.
                </p>
              ) : null}
            </>
          )}

          <label className="cc-calc-label" htmlFor="cc-bonus">
            Bonus amount (USD)
          </label>
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

          <label className="cc-calc-label" htmlFor="cc-wr">
            Wagering requirement
          </label>
          <div className="cc-calc-field">
            <input
              id="cc-wr"
              className="cc-calc-input"
              inputMode="numeric"
              value={wr}
              onChange={(e) => setWr(e.target.value)}
            />
            <span className="cc-calc-unit">×</span>
          </div>

          <label className="cc-calc-label" htmlFor="cc-applies">
            Wagering applies to
          </label>
          <div className="cc-calc-field cc-calc-field--select">
            <select
              id="cc-applies"
              className="cc-calc-input"
              value={applies}
              onChange={(e) => setApplies(e.target.value as "bonus" | "deposit")}
            >
              <option value="bonus">Bonus only</option>
              <option value="deposit">Deposit + bonus</option>
            </select>
          </div>

          {applies === "deposit" && (
            <>
              <label className="cc-calc-label" htmlFor="cc-deposit">
                Deposit amount (USD)
              </label>
              <div className="cc-calc-field">
                <input
                  id="cc-deposit"
                  className="cc-calc-input"
                  inputMode="decimal"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                />
                <span className="cc-calc-unit">USD</span>
              </div>
            </>
          )}

          <label className="cc-calc-label" htmlFor="cc-game">
            Game
          </label>
          <div className="cc-calc-field cc-calc-field--select">
            <select
              id="cc-game"
              className="cc-calc-input"
              value={gameIdx}
              onChange={(e) => pickGame(Number(e.target.value))}
            >
              {GAMES.map((g, i) => (
                <option key={g.label} value={i}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <p className="cc-calc-assum">
            <span>
              {edge}% house edge · counts {contrib}% toward wagering
            </span>
            <button
              type="button"
              className="cc-calc-edit"
              aria-expanded={editing}
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Hide assumptions" : "Edit assumptions"}
            </button>
          </p>

          {editing && (
            <div className="cc-calc-panel">
              <label className="cc-calc-label" htmlFor="cc-edge">
                House edge
              </label>
              <div className="cc-calc-field">
                <input
                  id="cc-edge"
                  className="cc-calc-input"
                  inputMode="decimal"
                  value={edge}
                  onChange={(e) => setEdge(e.target.value)}
                />
                <span className="cc-calc-unit">%</span>
              </div>
              <label className="cc-calc-label" htmlFor="cc-contrib">
                Game contribution
              </label>
              <div className="cc-calc-field">
                <input
                  id="cc-contrib"
                  className="cc-calc-input"
                  inputMode="decimal"
                  value={contrib}
                  onChange={(e) => setContrib(e.target.value)}
                />
                <span className="cc-calc-unit">%</span>
              </div>
              <p className="cc-calc-hint">
                The figures above are illustrative assumptions for a typical
                game of that type. They are not the terms of any casino on this
                page.
                {published ? ` ${published}` : ""}
              </p>
            </div>
          )}

          <button type="button" className="cc-calc-go" onClick={calculate}>
            Calculate
          </button>
        </div>

        <div className="cc-calc-res" role="status" aria-live="polite">
          <p className="cc-calc-scen">
            <span className="cc-calc-scen-tag">{scenario}</span>
            {stale ? (
              <span className="cc-calc-stale">Update calculation to refresh</span>
            ) : null}
          </p>
          {res.volume == null || res.cost == null ? (
            <>
              <p className="cc-calc-headline">
                This game cannot complete the wagering requirement
              </p>
              <p className="cc-calc-detail">
                {shown.published ??
                  "A game that counts nothing toward the requirement can never clear it, at any volume."}
              </p>
            </>
          ) : (
            <>
              <dl className="cc-calc-out">
                <div>
                  <dt>Total wagering</dt>
                  <dd>{money(res.volume)}</dd>
                </div>
                <div>
                  <dt>Estimated wagering cost</dt>
                  <dd>{money(res.cost)}</dd>
                </div>
              </dl>
              <p className="cc-calc-detail">
                {money(shown.base)}
                {shown.wagersDeposit ? " of deposit plus bonus" : " of bonus funds"} at{" "}
                {shown.wr}× is {money(res.required)} of qualifying bets.
                {shown.contrib < 100
                  ? ` ${shown.game} counts ${shown.contrib}%, so completing it takes ${money(res.volume)} of bets.`
                  : ""}
              </p>
              <p className="cc-calc-foot">
                Based on completing the full wagering requirement with the
                assumptions shown.
              </p>
          </>
        )}
      </div>
    </div>
  );
}
