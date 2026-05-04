import Link from "next/link";
import { YieldVault } from "@/lib/types";
import { formatAPY, formatTVL } from "@/lib/format";
import { AssetIcon } from "./token-icons";

interface Props {
  vaults: YieldVault[];
  sparklines?: Record<string, number[]>;
}

// NASDAQ-style strip on the homepage. Surface the top 5 yielding
// strategies per asset family (USDC / USDT / ETH / BTC ...), filtered
// to live, non-stale vaults with a meaningful APY floor so dust-yield
// rows don't dilute the strip. Stale/broken vaults are already
// excluded upstream by getLiveVaults.
export function TickerStrip({ vaults }: Props) {
  const MIN_APY = 1; // anything below 1% reads as a dud on a yield ticker
  const MAX_APY = 50; // ignore obviously broken / promotional outliers
  const MIN_TVL = 10_000;
  const TOP_PER_ASSET = 5;

  const eligible = vaults
    .filter((v) => v.apy24h >= MIN_APY && v.apy24h <= MAX_APY && v.tvl >= MIN_TVL)
    .sort((a, b) => b.apy24h - a.apy24h);

  const seen = new Map<string, number>();
  const top: YieldVault[] = [];
  for (const v of eligible) {
    const count = seen.get(v.asset) || 0;
    if (count >= TOP_PER_ASSET) continue;
    seen.set(v.asset, count + 1);
    top.push(v);
  }

  if (top.length === 0) return null;

  // Repeat enough copies so even on ultrawide screens the track is at
  // least 2x the viewport. We render an even number of copies so the
  // CSS -50% translate produces a seamless loop.
  const TARGET_TILES = 32;
  const repeats = Math.max(2, Math.ceil(TARGET_TILES / top.length));
  const evenRepeats = repeats % 2 === 0 ? repeats : repeats + 1;
  const items = Array.from({ length: evenRepeats }, () => top).flat();

  return (
    <div className="ticker">
      <div className="ticker-track">
        {items.map((v, i) => (
          <Link key={i} href={`/${v.slug}`} className="ticker-item">
            <AssetIcon asset={v.asset} size={18} />
            <span className="t-name">{v.productName}</span>
            <span className="t-val">{formatAPY(v.apy24h)}</span>
            <span className="t-val" style={{ color: "var(--ink-4)" }}>
              {formatTVL(v.tvl)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
