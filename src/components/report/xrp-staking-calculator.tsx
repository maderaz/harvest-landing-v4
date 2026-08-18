"use client";

// The XRP staking calculator on /report/xrp-yield-ranking.
//
// The page is titled "XRP Staking: 10+ Ways to Earn & Calculator", so the tool
// has to exist before the title ships: a title that promises something the
// page does not have sends the visitor back to the results, and that signal
// costs more than the extra click was worth.
//
// Three rules carried over from the rich-list calculator, for the same
// reasons.
//
// It never asks for a wallet address. A form requesting an address on a page
// about XRP yield reads as phishing to this community, and there is nothing an
// address would add: the arithmetic needs an amount and a rate.
//
// It computes in the browser against build-time constants. No request per
// lookup, so no amount a visitor types is transmitted or logged.
//
// It states the rate is variable in the same breath as it projects it. A
// calculator that annualises one day's rate without saying the rate moves is
// making a forecast, which this site does not do. The variance line and the
// emissions line are not decoration around the result; they are part of it,
// and neither is conditional on the number being large or small.

import { useMemo, useState } from "react";
import { AssetIcon } from "@/components/token-icons";
import { trackCalculator } from "@/lib/richlist-tracking";
import { ProductPicker } from "@/components/report/product-picker";

export interface CalcProduct {
  slug: string;
  /** Product name as the ranking table shows it, e.g. "FXRP · MXRPY". */
  label: string;
  /** Asset head and product detail, kept apart for the picker's two lines. */
  asset: string;
  detail: string | null;
  venue: string;
  chain: string;
  /** Short product type, as the ranking's Type column shows it. */
  type: string;
  /** Published rate, percent. The same figure the ranking row shows. */
  rate: number;
  /** Rate range over the trailing 30 days, percent, when history supports it. */
  min30: number | null;
  max30: number | null;
  /** Fixed-rate Principal Tokens do not float, so they are worded differently. */
  fixed: boolean;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const xrpAmt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 2 : 0 });

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s_]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function XrpStakingCalculator({
  products,
  asOf,
  xrpUsd,
  priceAsOf,
  incentivized,
  total,
}: {
  products: CalcProduct[];
  asOf: string;
  /** XRP price in dollars. The dollar clause is dropped when it is absent. */
  xrpUsd: number | null;
  priceAsOf: string | null;
  incentivized: number;
  total: number;
}) {
  const [raw, setRaw] = useState("");
  const [slug, setSlug] = useState(products[0]?.slug ?? "");
  const [shown, setShown] = useState<{ amount: number; product: CalcProduct } | null>(
    null,
  );

  const product = useMemo(
    () => products.find((p) => p.slug === slug) ?? products[0],
    [products, slug],
  );
  const amount = parseAmount(raw);

  function calculate() {
    // Never gated on a parsed amount. The button is always live, so pressing
    // it with an empty field has to do something other than nothing: it falls
    // back to 10,000, which is also the amount the FAQ answers against.
    const a = amount ?? 10_000;
    if (!raw.trim()) setRaw("10,000");
    if (!product) return;
    trackCalculator({ event: "start" });
    setShown({ amount: a, product });
    trackCalculator({ event: "result", tier: product.slug });
  }

  if (!products.length) return null;

  const earned = shown ? shown.amount * (shown.product.rate / 100) : 0;

  return (
    <div className="rp-calc" data-nosnippet="">
      <div className="rp-calc-panes">
        <div className="rp-calc-in">
          <p className="rp-calc-h">
            Enter an XRP amount, pick a product, then calculate.
          </p>

          <label className="rp-calc-label" htmlFor="rp-amount">
            Amount in XRP
          </label>
          <div className="rp-calc-field">
            <input
              id="rp-amount"
              className="rp-calc-input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="10,000"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") calculate();
              }}
              aria-describedby="rp-calc-privacy"
            />
            <span className="rp-calc-unit" aria-hidden="true">
              <AssetIcon asset="XRP" size={16} decorative />
              XRP
            </span>
          </div>

          <span className="rp-calc-label" id="rp-product-label">
            Product
          </span>
          <ProductPicker
            label="Product"
            options={products}
            value={slug}
            onChange={setSlug}
          />

          <button type="button" className="rp-calc-go" onClick={calculate}>
            Calculate
          </button>

          <p className="rp-calc-privacy" id="rp-calc-privacy">
            No wallet connection and no address. The calculation runs in your
            browser against the rates on this page. Educational only, not
            advice, an offer or a forecast.
          </p>
        </div>

        <div className="rp-calc-res">
          {!shown ? (
            <p className="rp-calc-rest">Results appear here once you calculate.</p>
          ) : null}

          <div className="rp-calc-out" role="status" aria-live="polite">
            {shown ? (
              <>
                <p className="rp-calc-headline">
                  About <strong>{xrpAmt(earned)} XRP</strong> a year
                </p>
                <p className="rp-calc-detail">
                  {xrpAmt(shown.amount)} XRP at {shown.product.label} on{" "}
                  {shown.product.venue} would earn about {xrpAmt(earned)} XRP
                  over a year at the {shown.product.rate.toFixed(2)}% rate
                  recorded as of {asOf}
                  {xrpUsd != null ? (
                    <>
                      , worth ${money(earned * xrpUsd)} at the{" "}
                      {priceAsOf ?? asOf} XRP price
                    </>
                  ) : null}
                  .
                </p>
                <ul className="rp-calc-facts">
                  {/* Not optional, and not phrased as a caveat. The figure
                      above annualises one reading; these two lines are what
                      make that figure honest rather than a projection. */}
                  <li>
                    {shown.product.fixed ? (
                      <>
                        That rate is fixed to the product&rsquo;s maturity
                        rather than floating, but its market price moves
                        {shown.product.min30 != null && shown.product.max30 != null ? (
                          <>
                            , and the quoted rate has ranged from{" "}
                            {shown.product.min30.toFixed(2)}% to{" "}
                            {shown.product.max30.toFixed(2)}% over the 30 days
                            to {asOf}
                          </>
                        ) : null}
                        .
                      </>
                    ) : shown.product.min30 != null && shown.product.max30 != null ? (
                      <>
                        That rate is variable and has ranged from{" "}
                        {shown.product.min30.toFixed(2)}% to{" "}
                        {shown.product.max30.toFixed(2)}% over the 30 days to{" "}
                        {asOf}.
                      </>
                    ) : (
                      <>
                        That rate is variable, and this product has too little
                        rate history as of {asOf} to state a 30-day range for
                        it.
                      </>
                    )}
                  </li>
                  <li>
                    {incentivized} of the {total} products in this ranking
                    depended on reward emissions for most of their rate as of{" "}
                    {asOf}, so published rates move.
                  </li>
                </ul>
                {/* Same-page anchor, so the insert is never racing an
                    unload. Without it the result -> ranking half of this
                    tool's funnel would record nothing, which is the number
                    that says whether the calculator feeds the report or ends
                    the visit. */}
                <a
                  className="rp-calc-cta"
                  href="#ranking"
                  onClick={() =>
                    trackCalculator({
                      event: "cta",
                      cta: "see-ranking",
                      targetUrl: "#ranking",
                    })
                  }
                >
                  See every product in the ranking
                  <span aria-hidden="true">↓</span>
                </a>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
