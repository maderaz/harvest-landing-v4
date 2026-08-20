"use client";

// The switch above the calculator on /xrp-rich-list.
//
// Two questions arrive on this page and only one of them had a tool. "Where
// does my balance rank" is what the page is for and what it ranks for; "what
// would that balance earn" is the question a rank raises, and answering it
// meant sending the reader to another page. The switch keeps both here.
//
// THE RICH LIST CALCULATOR IS THE DEFAULT AND STAYS THE DEFAULT. It holds the
// best click-through on the page, the H2 above it is what "xrp rich list
// calculator" matches, and the staking tool is the second answer rather than
// a replacement. The switch renders after it in the DOM for the same reason:
// what a crawler reads first should be what the page is about.
//
// Only one calculator is mounted at a time. Rendering both and hiding one
// would put a second set of form controls and a second product list into the
// page for every visitor who never touches the switch, and would give the
// document two elements with the same ids.

import { useState } from "react";
import {
  PercentileCalculator,
  type LadderPoint,
  type TopYield,
} from "@/components/richlist/percentile-calculator";
import {
  XrpStakingCalculator,
  type CalcProduct,
} from "@/components/report/xrp-staking-calculator";
import { trackCalculator } from "@/lib/richlist-tracking";

/**
 * What the staking calculator reports as `source_page` from this page.
 *
 * Still this page, so an operator can see where the interaction happened,
 * but distinguishable, so it does not land in the rich list calculator's
 * completion rate. See the control room's TOOLS table.
 */
export const EMBEDDED_STAKING_SOURCE = "/xrp-rich-list#staking-calculator";

export function CalculatorSwitch({
  ladder,
  accounts,
  snapshotDate,
  topYield,
  staking,
}: {
  ladder: LadderPoint[];
  accounts: number;
  snapshotDate: string;
  topYield?: TopYield | null;
  /** Absent when the yield feed is unreadable, and then there is no switch. */
  staking: {
    products: CalcProduct[];
    asOf: string;
    xrpUsd: number | null;
  } | null;
}) {
  const [mode, setMode] = useState<"rank" | "earn">("rank");

  // Both directions are recorded, and both against the embedded calculator's
  // source_page rather than the page's own.
  //
  // The question this answers is about the embedded tool: how many people
  // reach for it, and how many of those go on to use it. Filed under
  // /xrp-rich-list the flips would sit in the rich list calculator's numbers,
  // where they measure nothing and inflate its event count; filed here they
  // are the first stage of the embedded tool's own funnel. The flip back is
  // recorded for the same reason it is worth knowing: a visitor who looks at
  // the staking calculator and returns to the rank has told us something a
  // visitor who never flipped has not.
  //
  // A press on the tab already selected is not a switch and is not recorded.
  const flip = (next: "rank" | "earn") => {
    if (next === mode) return;
    setMode(next);
    trackCalculator({
      event: "switch",
      tier: next === "earn" ? "to-staking" : "to-rich-list",
      sourcePage: EMBEDDED_STAKING_SOURCE,
    });
  };

  const rank = (
    <PercentileCalculator
      ladder={ladder}
      accounts={accounts}
      snapshotDate={snapshotDate}
      topYield={topYield}
    />
  );

  // No products, no switch. A control offering one option is a label that
  // looks clickable. The anchor still has to be here either way.
  if (!staking || staking.products.length === 0) {
    return <div id="calculator">{rank}</div>;
  }

  return (
    <div id="calculator">
      <div className="rl-calcswitch" role="tablist" aria-label="Calculator">
        <button
          type="button"
          role="tab"
          id="rl-tab-rank"
          aria-selected={mode === "rank"}
          aria-controls="rl-calc-panel"
          className={`rl-calcswitch-tab${mode === "rank" ? " is-on" : ""}`}
          onClick={() => flip("rank")}
        >
          Rich List Calculator
        </button>
        <button
          type="button"
          role="tab"
          id="rl-tab-earn"
          aria-selected={mode === "earn"}
          aria-controls="rl-calc-panel"
          className={`rl-calcswitch-tab${mode === "earn" ? " is-on" : ""}`}
          onClick={() => flip("earn")}
        >
          XRP Staking Calculator
          {/* The badge is the only thing telling a reader the second tab is
              worth pressing, on a control whose default tab is what the page
              is named after. aria-hidden because a screen reader announcing
              "popular" between the tab name and its selected state reads as
              part of the label. */}
          <span className="rl-calcswitch-badge" aria-hidden="true">
            popular
          </span>
        </button>
      </div>

      <div
        id="rl-calc-panel"
        role="tabpanel"
        aria-labelledby={mode === "rank" ? "rl-tab-rank" : "rl-tab-earn"}
      >
        {mode === "rank" ? (
          rank
        ) : (
          <div className="rl-calc-embed">
            <p className="rl-calcswitch-note">
              The same calculator that sits on Harvest&rsquo;s XRP staking
              report, reading the same rates. XRP has no native staking, so
              every product below is a lending market, a vault, a liquidity
              position or a fixed-rate instrument.
            </p>
            <XrpStakingCalculator
              products={staking.products}
              asOf={staking.asOf}
              xrpUsd={staking.xrpUsd}
              total={staking.products.length}
              sourcePage={EMBEDDED_STAKING_SOURCE}
              ctaHref="/report/xrp-yield-ranking"
              ctaLabel="Open the XRP staking report"
            />
          </div>
        )}
      </div>
    </div>
  );
}
