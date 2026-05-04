import Link from "next/link";
import { YieldVault } from "@/lib/types";
import { assetHubPath, isUmbrellaAsset, getSubAssetFamilyName } from "@/lib/sub-asset";
import { formatTVL, stripChainSuffix } from "@/lib/format";
import type { FullVaultHistory } from "@/lib/history-api";
import { AssetIcon } from "./token-icons";
import { CopyAddressButton } from "./copy-address-button";
import { VaultTabs } from "./vault-tabs";
import { harvestAppUrl } from "@/lib/harvest-app";
import { chainToSlug } from "@/lib/networks";

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length);
}

function getStabilityLabel(sd: number): string {
  if (sd < 0.5) return "very consistent";
  if (sd < 1.5) return "consistent";
  if (sd < 3) return "moderate";
  return "volatile";
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface Props {
  vault: YieldVault;
  history: FullVaultHistory;
  allVaults: YieldVault[];
}

export function VaultHero({ vault, history, allVaults }: Props) {
  const sameAsset = allVaults.filter((v) => v.asset === vault.asset && v.apy24h > 0);
  const rank = [...sameAsset].sort((a, b) => b.apy24h - a.apy24h).findIndex((v) => v.id === vault.id) + 1;

  // KPI sub-context
  const apyDelta = vault.apy24h - vault.apy30d;
  const apyDeltaDir = apyDelta >= 0 ? "▲" : "▼";

  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = now - 30 * 86400;
  const recent30d = history.apyHistory.filter((p) => p.apy >= 0 && p.timestamp >= thirtyDaysAgo);
  const sd = stdDev(recent30d.map((p) => p.apy));
  const stabilityLabel = getStabilityLabel(sd);

  const peakTvl = history.tvlHistory.length > 0
    ? Math.max(...history.tvlHistory.map((p) => p.value))
    : vault.tvl;

  const spGrowth = history.sharePriceHistory.length >= 2
    ? (() => {
        const sorted = [...history.sharePriceHistory].sort((a, b) => a.timestamp - b.timestamp);
        const first = sorted[0].sharePrice;
        const last = sorted[sorted.length - 1].sharePrice;
        return first > 0 ? ((last - first) / first) * 100 : 0;
      })()
    : null;

  const lastSp = history.sharePriceHistory.length > 0
    ? [...history.sharePriceHistory].sort((a, b) => b.timestamp - a.timestamp)[0].sharePrice
    : null;

  const nameLen = vault.productName.length > 38 ? "long" : vault.productName.length > 22 ? "medium" : "short";

  // Tracked-for / live-since signal: derived from the earliest observed
  // apyHistory timestamp (falls back to tvlHistory / sharePriceHistory).
  const earliestTs = (() => {
    const candidates: number[] = [];
    if (history.apyHistory.length > 0) candidates.push(Math.min(...history.apyHistory.map((p) => p.timestamp)));
    if (history.tvlHistory.length > 0) candidates.push(Math.min(...history.tvlHistory.map((p) => p.timestamp)));
    if (history.sharePriceHistory.length > 0) candidates.push(Math.min(...history.sharePriceHistory.map((p) => p.timestamp)));
    return candidates.length > 0 ? Math.min(...candidates) : null;
  })();
  const trackedDays = earliestTs ? Math.round((now - earliestTs) / 86400) : 0;
  const liveSince = earliestTs
    ? new Date(earliestTs * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <>
    <section className="vault-hero">
      <div className="vault-hero-inner">
        <nav className="vh-crumbs">
          <Link href="/">Home</Link>
          <span className="vh-chev">›</span>
          <Link href={assetHubPath(vault.asset)}>
            {isUmbrellaAsset(vault.asset)
              ? `${getSubAssetFamilyName(vault.asset)} Yield`
              : `${vault.asset} Yield`}
          </Link>
          <span className="vh-chev">›</span>
          <span className="vh-current">{vault.productName}</span>
        </nav>

        <div className="vh-body">
          <div className="vh-headline">
            <div className="vh-tag-row">
              <span className="vh-tag">
                <AssetIcon asset={vault.asset} size={12} /> {vault.asset}
              </span>
              <span className="vh-tag">{vault.chain}</span>
              <span className="vh-tag">{vault.vaultType}</span>
              {rank > 0 && (
                <span className="vh-tag solid">#{rank} of {sameAsset.length} tracked {vault.asset} vaults</span>
              )}
            </div>
            <h1 className="vh-title" data-len={nameLen}>{vault.productName}</h1>
            <div className="vh-by">
              by <b>{vault.protocol.name}</b> &nbsp;·&nbsp;
              Strategy <b>{stripChainSuffix(vault.category, vault.chain)}</b> &nbsp;·&nbsp;
              {vault.vaultType} &nbsp;·&nbsp;
              Operated on{" "}
              <Link href={`/${chainToSlug(vault.chain)}`}>{vault.chain}</Link>
            </div>
          </div>

          <div className="vh-kpi-stack">
            <div className="vh-kpi">
              <div className="vh-k-label">24H APY</div>
              <div className="vh-k-val hot">{vault.apy24h.toFixed(2)}<span className="pct">%</span></div>
              <div className={`vh-k-sub${apyDelta >= 0 ? " up" : ""}`}>
                {apyDeltaDir} {Math.abs(apyDelta).toFixed(2)} vs 30d avg
              </div>
            </div>
            <div className="vh-kpi">
              <div className="vh-k-label">
                30D APY{" "}
                <a href="/methodology#apy-calculation" className="meth-ref" title="See methodology">?</a>
              </div>
              <div className="vh-k-val">{vault.apy30d.toFixed(2)}<span className="pct">%</span></div>
              <div className="vh-k-sub">
                σ {sd.toFixed(2)} · {stabilityLabel}{" "}
                <a href="/methodology#consistency" className="meth-ref" title="See methodology">?</a>
              </div>
            </div>
            <div className="vh-kpi">
              <div className="vh-k-label">TVL</div>
              <div className="vh-k-val">{formatTVL(vault.tvl)}</div>
              <div className="vh-k-sub">peak {formatTVL(peakTvl)}</div>
            </div>
            <div className="vh-kpi">
              <div className="vh-k-label">Share price</div>
              <div className="vh-k-val">{lastSp ? lastSp.toFixed(4) : "-"}</div>
              <div className={`vh-k-sub${spGrowth && spGrowth >= 0 ? " up" : ""}`}>
                {spGrowth !== null ? `${spGrowth >= 0 ? "+" : ""}${spGrowth.toFixed(2)}% since inception` : "-"}
              </div>
            </div>
          </div>
        </div>

        <div className="vh-actions">
          <div className="vh-actions-left">
            {trackedDays > 0 && liveSince && (
              <span className="vh-meta-pill">
                <span className="dot" />
                Tracked for {trackedDays} days · live since {liveSince}
              </span>
            )}
          </div>
          <div className="vh-actions-right">
            <CopyAddressButton address={vault.contractAddress} />
            <a href="#deposit-calc" className="pp-copy-btn vh-calc-btn">
              Calculator
            </a>
            <a
              href={harvestAppUrl(vault.chain, vault.contractAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="vh-btn-primary"
            >
              View Strategy
              <svg
                className="vh-btn-icon"
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
          </div>
        </div>
      </div>
    </section>

    <VaultTabs contractLabel={truncateAddress(vault.contractAddress)} />
    </>
  );
}
