"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { YieldVault } from "@/lib/types";
import { formatAPY, formatTVL, stripChainSuffix } from "@/lib/format";
import { AssetIcon, ChainIcon } from "./token-icons";
import { getSubAsset } from "@/lib/sub-asset";

import usdcIcon from "@/assets/icons/USDC.png";
import usdtIcon from "@/assets/icons/USDT.png";
import ethIcon from "@/assets/icons/ETH.png";
import wbtcIcon from "@/assets/icons/WBTC.png";
import cbbtcIcon from "@/assets/icons/cbBTC.png";
import tbtcIcon from "@/assets/icons/tBTC.png";
import eurcIcon from "@/assets/icons/EURC.png";

const ASSET_ICONS: Record<string, { src: string }> = {
  USDC: usdcIcon, USDT: usdtIcon, ETH: ethIcon, WETH: ethIcon,
  BTC: wbtcIcon, WBTC: wbtcIcon, wBTC: wbtcIcon, cbBTC: cbbtcIcon,
  tBTC: tbtcIcon, EURC: eurcIcon,
};

// For BTC family vaults, surface the specific sub-asset icon (WBTC, cbBTC,
// tBTC, etc.) so visually similar wrapped-BTC variants are distinguishable
// in the table. ETH family vaults keep a single ETH icon for now since
// staking derivatives (stETH, wstETH, weETH) are visually similar to ETH.
function displayAsset(v: YieldVault): string {
  if (v.asset === "BTC") return getSubAsset(v);
  return v.asset;
}

function AssetDot({ asset, size = 22 }: { asset: string; size?: number }) {
  const icon = ASSET_ICONS[asset];
  if (icon) {
    // lazy: most strategy rows are below the fold even on a 50-row page;
    // deferring image fetch until scroll keeps initial-load network usage
    // proportional to what the user actually sees.
    return (
      <img
        src={icon.src}
        alt={asset}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={{ width: size, height: size, borderRadius: "50%" }}
      />
    );
  }
  return (
    <span className="asset-dot" style={{ background: "#999", width: size, height: size, fontSize: size * 0.5 }}>
      {asset[0] || "?"}
    </span>
  );
}

/* === Spark chart === */

function seedSpark(seed: number, up: boolean): number[] {
  const out: number[] = [];
  let v = 50;
  for (let i = 0; i < 24; i++) {
    const n = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const r = n - Math.floor(n);
    v += (r - 0.5) * 8 + (up ? 0.4 : -0.4);
    out.push(v);
  }
  return out;
}

function Spark({
  points,
  up = true,
  w = 68,
  h = 22,
}: {
  points: number[];
  up?: boolean;
  w?: number;
  h?: number;
}) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / range) * (h - 2) - 1;
    return [x, y] as [number, number];
  });
  const d = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const last = coords[coords.length - 1];
  const color = up ? "var(--up)" : "var(--down)";
  return (
    <svg width={w} height={h} className="spark">
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity="0.08" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.25" />
      <circle cx={last[0]} cy={last[1]} r="1.8" fill={color} />
    </svg>
  );
}

/* === Sort types === */

type SortKey = "apy24h" | "apy30d" | "tvl" | "momentum" | "chain";
type SortDir = "asc" | "desc";

/* === VaultTable === */

export function VaultTable({
  vaults,
  sparklines,
}: {
  vaults: YieldVault[];
  sparklines?: Record<string, number[]>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("apy24h");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [assetFilter, setAssetFilter] = useState("All");
  const [chainFilter, setChainFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const stickyDockRef = useRef<HTMLDivElement | null>(null);
  const [openSheet, setOpenSheet] = useState<null | "asset" | "chain">(null);

  // Close the dropdown sheet when a tap lands outside the dock.
  useEffect(() => {
    if (!openSheet) return;
    function handle(e: Event) {
      if (!stickyDockRef.current) return;
      if (!stickyDockRef.current.contains(e.target as Node)) setOpenSheet(null);
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [openSheet]);

  const PAGE_SIZE = 50;

  const assets = Array.from(new Set(vaults.map((v) => v.asset))).sort();
  const chains = Array.from(new Set(vaults.map((v) => v.chain))).sort();

  const lcQuery = query.trim().toLowerCase();
  const filtered = vaults.filter((v) => {
    if (v.apy24h <= 0 || v.tvl <= 0) return false;
    if (assetFilter !== "All" && v.asset !== assetFilter) return false;
    if (chainFilter !== "All" && v.chain !== chainFilter) return false;
    if (lcQuery) {
      const hay = (v.productName + " " + v.asset + " " + v.category).toLowerCase();
      if (!hay.includes(lcQuery)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let va: string | number;
    let vb: string | number;
    if (sortKey === "chain") {
      va = a.chain;
      vb = b.chain;
    } else if (sortKey === "momentum") {
      va = a.apy24h - a.apy30d;
      vb = b.apy24h - b.apy30d;
    } else {
      va = a[sortKey];
      vb = b[sortKey];
    }
    if (typeof va === "string" && typeof vb === "string") {
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sortDir === "desc"
      ? (vb as number) - (va as number)
      : (va as number) - (vb as number);
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, sorted.length);
  const visible = sorted.slice(pageStart, pageEnd);

  function toggleSort(key: SortKey) {
    setPage(0);
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortHeaderProps = (k: SortKey, align: "left" | "right" | "center" = "right") => ({
    className: `${align} sortable${sortKey === k ? " sorted" : ""}`,
    onClick: () => toggleSort(k),
    style: { cursor: "pointer" as const },
  });

  return (
    <>
      <div className="filterbar">
        <div className="fb-row">
          <div className="fb-tabs">
            <button
              type="button"
              className={`fb-tab${assetFilter === "All" ? " active" : ""}`}
              onClick={() => { setAssetFilter("All"); setPage(0); }}
            >
              All
            </button>
            {assets.map((a) => (
              <button
                key={a}
                type="button"
                className={`fb-tab${assetFilter === a ? " active" : ""}`}
                onClick={() => { setAssetFilter(a); setPage(0); }}
              >
                <AssetIcon asset={a} size={16} />
                {a}
              </button>
            ))}
          </div>
          <label className="search-box small">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              placeholder="Search vaults..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            />
          </label>
        </div>
        <div className="fb-row fb-row-secondary">
          <div className="fb-chips">
            <button
              type="button"
              className={`fb-chip${chainFilter === "All" ? " active" : ""}`}
              onClick={() => { setChainFilter("All"); setPage(0); }}
            >
              All chains
            </button>
            {chains.map((c) => (
              <button
                key={c}
                type="button"
                className={`fb-chip${chainFilter === c ? " active" : ""}`}
                onClick={() => { setChainFilter(c); setPage(0); }}
              >
                <ChainIcon chain={c} size={14} />
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="ranking">
          <thead>
            <tr>
              <th className="left">#</th>
              <th className="left">Product Name</th>
              <th {...sortHeaderProps("apy24h")}>
                APY
                {sortKey === "apy24h" && (
                  <span className="caret">{sortDir === "desc" ? " ▾" : " ▴"}</span>
                )}
              </th>
              <th {...sortHeaderProps("apy30d")}>
                30D APY
                {sortKey === "apy30d" && (
                  <span className="caret">{sortDir === "desc" ? " ▾" : " ▴"}</span>
                )}
              </th>
              <th {...sortHeaderProps("tvl")}>
                TVL
                {sortKey === "tvl" && (
                  <span className="caret">{sortDir === "desc" ? " ▾" : " ▴"}</span>
                )}
              </th>
              <th {...sortHeaderProps("momentum", "center")}>
                30d trend
                {sortKey === "momentum" && (
                  <span className="caret">{sortDir === "desc" ? " ▾" : " ▴"}</span>
                )}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody key={`${assetFilter}|${chainFilter}|${query}|${sortKey}|${sortDir}|${safePage}`}>
            {visible.map((vault, index) => {
              const up = vault.apy24h >= vault.apy30d;
              const overallIndex = pageStart + index;
              return (
                <tr
                  key={vault.id}
                  className="row"
                >
                  <td className="td rank mono">{overallIndex + 1}</td>
                  <td className="td">
                    <div className="proto">
                      <AssetDot asset={displayAsset(vault)} size={28} />
                      <div>
                        <div className="proto-name">
                          <Link href={`/${vault.slug}`} className="row-link">
                            {vault.productName}
                          </Link>
                        </div>
                        <div className="proto-sub mono">
                          {stripChainSuffix(vault.category, vault.chain)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="td right mono big">
                    <span className={`apy${vault.apy24h >= 10 ? " hot" : ""}`}>
                      {formatAPY(vault.apy24h)}
                    </span>
                  </td>
                  <td className="td right mono dim">
                    {formatAPY(vault.apy30d)}
                  </td>
                  <td className="td right mono">{formatTVL(vault.tvl)}</td>
                  <td className="td center">
                    {(() => {
                      const real = sparklines?.[vault.contractAddress];
                      const pts = real && real.length >= 2 ? real : seedSpark(overallIndex + 1, up);
                      return <Spark points={pts} up={up} />;
                    })()}
                  </td>
                  <td className="td right">
                    <Link href={`/${vault.slug}`} className="row-cta" style={{ position: "relative", zIndex: 2 }}>
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="table-foot">
          <span className="mono dim">
            {sorted.length === 0
              ? "No vaults match the current filters"
              : `Showing ${pageStart + 1}-${pageEnd} of ${sorted.length}${sorted.length !== vaults.length ? ` (${vaults.length} total)` : ""}`}
          </span>
          {totalPages > 1 && (
            <div className="table-pager">
              <button
                type="button"
                className="pager-btn"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
              >
                Prev
              </button>
              <span className="mono dim pager-info">
                Page {safePage + 1} of {totalPages}
              </span>
              <button
                type="button"
                className="pager-btn"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile sticky filter dock — replaces the inline filter bar
          entirely on <=700px. Two collapsed buttons that pop a dropdown
          sheet UPWARD on tap. Hidden on desktop via CSS (where the
          inline bar is the primary control). */}
      <div
        ref={stickyDockRef}
        className="sticky-filters"
        aria-label="Quick filters"
      >
        <div className="fdock-buttons">
          <button
            type="button"
            className={`fdock-btn${openSheet === "asset" ? " is-open" : ""}`}
            onClick={() => setOpenSheet(openSheet === "asset" ? null : "asset")}
            aria-haspopup="listbox"
            aria-expanded={openSheet === "asset"}
          >
            <span className="fdock-btn-label">Asset</span>
            <span className="fdock-btn-value">
              {assetFilter !== "All" && <AssetIcon asset={assetFilter} size={14} />}
              <span>{assetFilter}</span>
              <svg className="fdock-btn-caret" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
          <button
            type="button"
            className={`fdock-btn${openSheet === "chain" ? " is-open" : ""}`}
            onClick={() => setOpenSheet(openSheet === "chain" ? null : "chain")}
            aria-haspopup="listbox"
            aria-expanded={openSheet === "chain"}
          >
            <span className="fdock-btn-label">Network</span>
            <span className="fdock-btn-value">
              {chainFilter !== "All" && <ChainIcon chain={chainFilter} size={14} />}
              <span>{chainFilter}</span>
              <svg className="fdock-btn-caret" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        </div>

        {openSheet === "asset" && (
          <div className="fdock-sheet" role="listbox" aria-label="Filter by asset">
            <div className="fdock-sheet-grid">
              <button
                type="button"
                role="option"
                aria-selected={assetFilter === "All"}
                className={`fdock-opt${assetFilter === "All" ? " active" : ""}`}
                onClick={() => { setAssetFilter("All"); setPage(0); setOpenSheet(null); }}
              >
                All
              </button>
              {assets.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="option"
                  aria-selected={assetFilter === a}
                  className={`fdock-opt${assetFilter === a ? " active" : ""}`}
                  onClick={() => { setAssetFilter(a); setPage(0); setOpenSheet(null); }}
                >
                  <AssetIcon asset={a} size={16} />
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        {openSheet === "chain" && (
          <div className="fdock-sheet" role="listbox" aria-label="Filter by network">
            <div className="fdock-sheet-grid">
              <button
                type="button"
                role="option"
                aria-selected={chainFilter === "All"}
                className={`fdock-opt${chainFilter === "All" ? " active" : ""}`}
                onClick={() => { setChainFilter("All"); setPage(0); setOpenSheet(null); }}
              >
                All
              </button>
              {chains.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="option"
                  aria-selected={chainFilter === c}
                  className={`fdock-opt${chainFilter === c ? " active" : ""}`}
                  onClick={() => { setChainFilter(c); setPage(0); setOpenSheet(null); }}
                >
                  <ChainIcon chain={c} size={16} />
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
