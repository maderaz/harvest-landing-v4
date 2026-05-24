// Inline caution marker rendered next to a low-TVL vault's product
// name in ranking-style views (asset/network hub tables, market
// benchmarking rows, ecosystem legend, "Other opportunities" cards)
// and beside the TVL stat on the product page itself. Keeps thin
// pools ranked while signalling that the headline yield sits on very
// little liquidity, so a $95 pool can't read as an unqualified "best"
// pick. Threshold lives in src/lib/admin-rules.ts.
//
// Mirrors LpBadge: the leading non-breaking space is a safety net in
// case a more-specific selector strips margin-left.

export function LowLiquidityBadge() {
  return (
    <>
      {" "}
      <span
        className="lowliq-badge"
        data-tooltip="Low liquidity: this strategy currently holds very little TVL. Thin liquidity can mean higher slippage on entry and exit, and the yield can be skewed by a small number of holders."
        aria-label="Low liquidity"
      >
        Low liquidity
      </span>
    </>
  );
}
