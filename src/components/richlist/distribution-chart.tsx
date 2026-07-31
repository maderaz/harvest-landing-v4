// Balance distribution chart for /xrp-rich-list.
//
// Deliberately NOT a client component. The build spec makes the chart a
// requirement rather than a decoration, because roughly 920 US searches a
// month ask for one by name, and a chart that only exists after hydration is
// invisible to the crawler serving those queries. So this is plain SVG
// rendered at build time: it is in the HTML, it needs no JavaScript, and it
// prints.
//
// It is paired with a data-table twin below it. The twin is not an
// accessibility afterthought: an answer engine cannot lift a figure out of an
// SVG path, and the writing spec requires every number on the page to exist as
// extractable text.

import type { ReactNode } from "react";

export interface Band {
  min: number;
  max: number | null;
  accounts: number;
  pctOfAccounts: number;
  xrpHeld: number;
  pctOfXrp: number;
}

const W = 720;
const H = 300;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 18;
const PAD_B = 46;

const xrpShort = (n: number): string => {
  if (n >= 1_000_000_000) return `${n / 1_000_000_000}bn`;
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000) return `${n / 1_000}k`;
  return String(n);
};

export const bandName = (b: Band): string =>
  b.max == null ? `${xrpShort(b.min)}+` : `${xrpShort(b.min)}-${xrpShort(b.max)}`;

// One decimal below 100k. Rounding 9,707 to a whole "10k" puts a number on the
// bar that the data table two elements below contradicts.
const compact = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 100_000
      ? `${(n / 1_000).toFixed(0)}k`
      : n >= 1_000
        ? `${(n / 1_000).toFixed(1)}k`
        : String(n);

export function DistributionChart({
  bands,
  snapshotDate,
  totalAccounts,
}: {
  bands: Band[];
  snapshotDate: string;
  totalAccounts: number;
}) {
  // Drop leading empty bands so the axis starts where accounts actually are.
  const rows = bands.filter((b) => b.accounts > 0);
  if (rows.length < 2) return null;

  const maxAccounts = Math.max(...rows.map((b) => b.accounts));
  const slot = (W - PAD_L - PAD_R) / rows.length;
  const barW = Math.min(slot * 0.66, 64);
  const plotH = H - PAD_T - PAD_B;

  // Square-root scale. A linear axis on a distribution this skewed renders
  // every band above 100k XRP as a flat line at zero, and a log axis on counts
  // invites reading a band as far larger than it is. Square root keeps the
  // small bands visible without overstating them.
  const barH = (n: number) => Math.max(2, Math.sqrt(n / maxAccounts) * plotH);

  const caption =
    `Funded XRP Ledger accounts by balance band as of ${snapshotDate}. ` +
    rows
      .map((b) => `${bandName(b)} XRP: ${compact(b.accounts)} accounts`)
      .join(". ") +
    ".";

  return (
    <figure className="rl-chart-fig">
      <svg
        className="rl-chart"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="auto"
        role="img"
        aria-label={caption}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>Funded XRP Ledger accounts by balance band, {snapshotDate}</title>
        {rows.map((b, i) => {
          const h = barH(b.accounts);
          const x = PAD_L + i * slot + (slot - barW) / 2;
          const y = PAD_T + plotH - h;
          return (
            <g key={bandName(b)}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={3}
                className="rl-chart-bar"
              />
              <text
                x={x + barW / 2}
                y={y - 5}
                textAnchor="middle"
                className="rl-chart-val"
              >
                {compact(b.accounts)}
              </text>
              <text
                x={x + barW / 2}
                y={PAD_T + plotH + 17}
                textAnchor="middle"
                className="rl-chart-tick"
              >
                {bandName(b)}
              </text>
              <text
                x={x + barW / 2}
                y={PAD_T + plotH + 32}
                textAnchor="middle"
                className="rl-chart-tick rl-chart-tick-dim"
              >
                {b.pctOfAccounts >= 0.1 ? `${b.pctOfAccounts.toFixed(1)}%` : "<0.1%"}
              </text>
            </g>
          );
        })}
        <line
          x1={PAD_L}
          y1={PAD_T + plotH + 0.5}
          x2={W - PAD_R}
          y2={PAD_T + plotH + 0.5}
          className="rl-chart-axis"
        />
      </svg>
      <figcaption className="rl-chart-cap">
        Every one of the {totalAccounts.toLocaleString("en-US")} funded XRP
        Ledger accounts sits in exactly one band, measured as of {snapshotDate}.
        Bar heights use a square-root scale so the smallest bands stay visible.
      </figcaption>
    </figure>
  );
}

/**
 * The extractable twin of the chart. Same numbers, as text, in source order.
 */
export function DistributionTable({
  bands,
  snapshotDate,
}: {
  bands: Band[];
  snapshotDate: string;
}): ReactNode {
  const rows = bands.filter((b) => b.accounts > 0);
  return (
    <div className="rl-dtable-wrap">
      <table className="rl-dtable">
        <caption className="rl-dtable-cap">
          XRP Ledger distribution by amount controlled, as of {snapshotDate}
        </caption>
        <thead>
          <tr>
            <th scope="col">Band (XRP)</th>
            <th scope="col">Accounts</th>
            <th scope="col">Percentage of accounts</th>
            <th scope="col">XRP held</th>
            <th scope="col">Percentage of XRP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={bandName(b)}>
              <th scope="row">{bandName(b)}</th>
              <td data-label="Accounts">{b.accounts.toLocaleString("en-US")}</td>
              <td data-label="Share of accounts">
                {b.pctOfAccounts >= 0.01 ? `${b.pctOfAccounts.toFixed(2)}%` : "under 0.01%"}
              </td>
              <td data-label="XRP held">{Math.round(b.xrpHeld).toLocaleString("en-US")}</td>
              <td data-label="Share of XRP">{b.pctOfXrp >= 0.01 ? `${b.pctOfXrp.toFixed(2)}%` : "under 0.01%"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
