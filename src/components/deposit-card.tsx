"use client";

import { useState } from "react";
import { formatAPY } from "@/lib/format";
import { harvestAppUrl } from "@/lib/harvest-app";

interface DepositCardProps {
  apy24h: number;
  apy30d: number;
  asset: string;
  chain: string;
  contractAddress: string;
}

const PRESETS = [100, 1000, 10000, 100000];

function fmtCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function DepositCard({ apy24h, apy30d, asset, chain, contractAddress }: DepositCardProps) {
  const [amount, setAmount] = useState(1000);
  const [input, setInput] = useState("1000");

  const yearly = amount * (apy24h / 100);
  const monthly = yearly / 12;

  function setAmt(n: number) {
    setAmount(n);
    setInput(String(n));
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/[^0-9.]/g, "");
    setInput(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0) setAmount(n);
  }

  return (
    <div className="dep-calc-card" id="deposit-calc">
      <div className="dc-header">
        <div className="dc-apy-row">
          <div>
            <div className="dep-tag">24H APY</div>
            <div className="dc-apy">{formatAPY(apy24h)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="dep-tag">30D</div>
            <div className="dc-apy-30d mono">{formatAPY(apy30d)}</div>
          </div>
        </div>
      </div>

      <div className="dc-input-label">Estimate your earnings</div>
      <div className="dc-input-wrap">
        <span className="dc-currency">$</span>
        <input
          type="text"
          value={input}
          onChange={handleInput}
          inputMode="decimal"
          className="dc-input"
        />
        <span className="dc-asset">{asset}</span>
      </div>

      <div className="dc-presets">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setAmt(p)}
            className={`dc-preset${amount === p ? " active" : ""}`}
          >
            ${p >= 1000 ? `${p / 1000}K` : p}
          </button>
        ))}
      </div>

      <div className="dc-projection">
        <div className="dc-proj-row">
          <span className="dp-l">Est. monthly</span>
          <span className="dp-v">+{fmtCurrency(monthly)}</span>
        </div>
        <div className="dc-proj-row">
          <span className="dp-l">Est. yearly</span>
          <span className="dp-v">+{fmtCurrency(yearly)}</span>
        </div>
      </div>

      <a
        href={harvestAppUrl(chain, contractAddress)}
        target="_blank"
        rel="noopener noreferrer"
        className="dc-cta"
      >
        View Strategy
        <svg
          className="dc-cta-icon"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>

      <div className="dc-note">
        Assumes the {formatAPY(apy24h)} APY holds steady and is not diluted by your deposit.
      </div>
    </div>
  );
}
