"use client";

// What a deposit is actually worth at one casino.
//
// Two inputs and a button, because the question a reader arrives with is "how
// much do I get for my money" and the tool that answered it before asked for
// six figures first. The playthrough has not gone anywhere: it is a line in
// the result, derived from the offer the reader picked, instead of a control
// they have to fill in before they see anything.
//
// Runs in the browser; nothing is sent anywhere.

import { useEffect, useMemo, useState } from "react";
import { OutboundLink } from "@/components/report/outbound-link";
import { CASINO_LOGOS } from "@/lib/casino-logos";
import { LEAVE_SITE_BODY, amount } from "@/lib/crypto-casinos-copy";
import { trackCasinoCalculator } from "@/lib/casino-tracking";

/**
 * The house edge the cost line assumes.
 *
 * One figure, stated beside the result, and not a control. It is the typical
 * slots edge; no casino on this page has published its own, and a dropdown of
 * game types invited a reader to price a game whose eligibility nobody has
 * read.
 */
const SLOTS_EDGE_PCT = 4;

export interface CalcOffer {
  slug: string;
  name: string;
  /** 1-based position in the ranking, for the outbound event. */
  rank: number;
  /** The advertised match, as a percentage. */
  matchPct: number;
  /**
   * The ceiling on the deposit the reader is about to make. A package total
   * spread across several deposits is not it, so a ladder offer carries its
   * first stage here.
   */
  capUsd: number;
  /** Whether the cap above is one stage of a larger advertised package. */
  packageUsd: number | null;
  unit: "USD" | "USDT";
  /** Playthrough multiple, where the terms publish one. */
  wagering: number | null;
  /** What that multiple applies to. */
  wagersDeposit: boolean;
  minDeposit: string | null;
  url: string;
  /** True where the URL is the attributed one. */
  attributed: boolean;
}

const num = (s: string) => Number(s.replace(/[,\s$]/g, "")) || 0;

const DEFAULT_BUDGET = "100";

interface Result {
  sig: string;
  offer: CalcOffer;
  deposit: number;
  bonus: number;
  capped: boolean;
}

export function BonusCalculator({ offers }: { offers: CalcOffer[] }) {
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  // The top of the ranking, so a reader who changes nothing still gets the
  // offer the page leads with.
  const [slug, setSlug] = useState(offers[0]?.slug ?? "");

  const offer = offers.find((o) => o.slug === slug) ?? offers[0];
  const sig = `${slug}|${budget}`;

  const compute = (o: CalcOffer, dep: number): Result => {
    const uncapped = (dep * o.matchPct) / 100;
    return {
      sig: `${o.slug}|${dep}`,
      offer: o,
      deposit: dep,
      bonus: Math.min(uncapped, o.capUsd),
      capped: uncapped > o.capUsd,
    };
  };

  // Worked on load. An empty result panel above a Calculate button asks the
  // reader to guess what the tool does before it will tell them.
  const [shown, setShown] = useState<Result | null>(() =>
    offers[0] ? compute(offers[0], num(DEFAULT_BUDGET)) : null,
  );

  const stale = shown != null && shown.sig !== `${slug}|${num(budget)}`;

  // One event when the tool first appears, so the panel can report the share
  // of readers who reach it against the share who press the button.
  useEffect(() => {
    trackCasinoCalculator({ event: "view", venue: offers[0]?.slug ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const res = useMemo(() => {
    if (!shown) return null;
    const o = shown.offer;
    const total = shown.deposit + shown.bonus;
    const base = o.wagersDeposit ? total : shown.bonus;
    const turnover = o.wagering != null ? base * o.wagering : null;
    return {
      total,
      turnover,
      cost: turnover != null ? (turnover * SLOTS_EDGE_PCT) / 100 : null,
    };
  }, [shown]);

  if (!offer || !shown || !res) return null;

  const fmt = (n: number) => amount(Math.round(n), shown.offer.unit);
  const logo = CASINO_LOGOS[shown.offer.slug];

  return (
    <div className="cc-bc">
      <div className="cc-bc-form">
        <div className="cc-bc-field">
          <label className="cc-bc-label" htmlFor="cc-bc-budget">
            Your deposit budget
          </label>
          <div className="cc-bc-input-wrap">
            <span className="cc-bc-prefix" aria-hidden="true">
              $
            </span>
            <input
              id="cc-bc-budget"
              className="cc-bc-input"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
        </div>

        <div className="cc-bc-field">
          <label className="cc-bc-label" htmlFor="cc-bc-casino">
            Casino
          </label>
          <select
            id="cc-bc-casino"
            className="cc-bc-input cc-bc-select"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          >
            {offers.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.name} · {o.matchPct}% match
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="cc-bc-go"
          onClick={() => {
            setShown(compute(offer, num(budget)));
            trackCasinoCalculator({ event: "calculate", venue: offer.slug });
          }}
        >
          Calculate
        </button>
      </div>

      <div className={`cc-bc-out${stale ? " is-stale" : ""}`}>
        {stale && (
          <p className="cc-bc-stale" role="status">
            Inputs changed. Select Calculate for an updated estimate.
          </p>
        )}

        <div className="cc-bc-head">
          {logo && (
            <span className="cc-bc-logo-box">
              <img
                className="cc-bc-logo"
                src={logo.src}
                alt=""
                width={110}
                height={47}
                loading="lazy"
                decoding="async"
              />
            </span>
          )}
          <p className="cc-bc-venue">{shown.offer.name}</p>
        </div>
        <p className="cc-bc-big">{fmt(shown.bonus)}</p>
        <p className="cc-bc-sub">
          in bonus funds on a {amount(Math.round(shown.deposit), shown.offer.unit)}{" "}
          deposit, at the advertised {shown.offer.matchPct}% match
          {shown.capped ? `, which reaches the ${fmt(shown.offer.capUsd)} cap` : ""}
          {shown.offer.packageUsd != null
            ? `. The package advertises up to ${fmt(shown.offer.packageUsd)} across its later deposits`
            : ""}
          .
        </p>

        <dl className="cc-bc-rows">
          <div>
            <dt>Total to play with</dt>
            <dd>{fmt(res.total)}</dd>
          </div>
          <div>
            <dt>Wagering requirement</dt>
            <dd>
              {shown.offer.wagering != null
                ? `${shown.offer.wagering}× on ${shown.offer.wagersDeposit ? "deposit plus bonus" : "the bonus"}`
                : "Not published"}
            </dd>
          </div>
          <div>
            <dt>Qualifying bets needed</dt>
            <dd>{res.turnover != null ? fmt(res.turnover) : "Not published"}</dd>
          </div>
          <div>
            <dt>Estimated cost to clear it</dt>
            <dd>{res.cost != null ? fmt(res.cost) : "Not published"}</dd>
          </div>
        </dl>

        <p className="cc-bc-note">
          The cost line applies a {SLOTS_EDGE_PCT}% house edge to that betting
          volume, the typical figure for slots. Each offer sets its own eligible
          games and contribution rates, so check them against the amount above.
          {shown.offer.minDeposit
            ? ` ${shown.offer.name} publishes a ${shown.offer.minDeposit} minimum deposit.`
            : ""}
        </p>

        <div className="cc-bc-cta">
          <OutboundLink
            className="cc-open cc-play"
            href={shown.offer.url}
            rel="sponsored nofollow noopener noreferrer"
            keepHref
            platform={shown.offer.name}
            source={
              shown.offer.attributed
                ? "crypto-casinos-calc-affiliate"
                : "crypto-casinos-calc-plain"
            }
            rank={shown.offer.rank}
            ariaLabel={`Play Now at ${shown.offer.name}`}
            body={LEAVE_SITE_BODY(shown.offer.name)}
          >
            Play Now at {shown.offer.name}
          </OutboundLink>
        </div>
      </div>
    </div>
  );
}
