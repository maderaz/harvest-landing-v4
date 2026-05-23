/* eslint-disable @next/next/no-img-element */
// Shared layout helper for every opengraph-image.tsx / twitter-image.tsx
// route. ImageResponse from next/og renders a subset of flexbox via
// Satori, so the JSX here intentionally avoids grid / floats / table
// layouts. Everything is flex + inline styles. Colours come from the
// Sunflower Gold + Onyx palette used everywhere else on the site.
//
// Brand colours hardcoded (rather than read from globals.css) because
// Satori cannot resolve CSS variables - the file would render with
// black-on-white if we tried to use var(--uni-gold) at build time.

import { ImageResponse } from "next/og";

// 1200x630 is the canonical OG canvas. Twitter summary_large_image
// uses the same dimensions, so we re-export the same component for
// /twitter-image.tsx via `export { default } from "./opengraph-image"`.
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const GOLD = "#ffb936";
const GOLD_SOFT = "#ffd98a";
const INK = "#191717";
const INK_2 = "#32312b";
const INK_3 = "#6e6c66";
const BG = "#fff8e5";
const BG_DOT = "rgba(25, 23, 23, 0.10)";

interface OgProps {
  // Top-left brand badge label, e.g. "Harvest" or "Harvest / USDC".
  brand?: string;
  // Small uppercase eyebrow above the headline. Optional - omit on
  // the homepage where the headline is the whole point.
  eyebrow?: string;
  // The big display headline. Renders at clamp 56-80px depending on
  // length; wraps naturally onto 2 lines.
  headline: string;
  // Subheadline below the headline. Two lines max.
  sub?: string;
  // Optional stats row at the bottom (e.g. APY + TVL on product OGs).
  stats?: { label: string; value: string; accent?: boolean }[];
  // Optional CTA-style footer line on the right (e.g. "harvest.finance").
  footer?: string;
}

export function ogImageResponse(props: OgProps) {
  const { brand = "Harvest", eyebrow, headline, sub, stats, footer = "harvest.finance" } = props;
  const headlineSize = headline.length > 48 ? 56 : headline.length > 28 ? 68 : 80;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 64px",
          background: BG,
          backgroundImage: `radial-gradient(${BG_DOT} 1.5px, transparent 1.5px)`,
          backgroundSize: "20px 20px",
          color: INK,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Top row: brand badge + eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: GOLD,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: INK,
                fontSize: 28,
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              H
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: INK,
                letterSpacing: "-0.01em",
              }}
            >
              {brand}
            </div>
          </div>
          {eyebrow ? (
            <div
              style={{
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: INK_2,
                padding: "8px 16px",
                borderRadius: 999,
                background: "rgba(25, 23, 23, 0.06)",
              }}
            >
              {eyebrow}
            </div>
          ) : null}
        </div>

        {/* Middle: headline + sub */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            maxWidth: 1020,
          }}
        >
          <div
            style={{
              fontSize: headlineSize,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
              color: INK,
            }}
          >
            {headline}
          </div>
          {sub ? (
            <div
              style={{
                fontSize: 26,
                fontWeight: 400,
                lineHeight: 1.35,
                color: INK_2,
                maxWidth: 920,
              }}
            >
              {sub}
            </div>
          ) : null}
        </div>

        {/* Bottom row: stats (optional) + footer URL */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          {stats && stats.length > 0 ? (
            <div style={{ display: "flex", gap: 36 }}>
              {stats.map((s) => (
                <div
                  key={s.label}
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: INK_3,
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontSize: 40,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      color: s.accent ? GOLD : INK,
                    }}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div />
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 18,
              fontWeight: 600,
              color: INK_2,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: GOLD,
              }}
            />
            {footer}
          </div>
        </div>

        {/* Right-edge gold accent line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 8,
            height: "100%",
            background: `linear-gradient(180deg, ${GOLD} 0%, ${GOLD_SOFT} 100%)`,
          }}
        />
      </div>
    ),
    { ...OG_SIZE },
  );
}

// Product-card OG renderer. Mirrors the hero / studio 1:1 preview
// card: a left column with the centred Harvest wordmark (black) and
// a right column holding a white product card filled with real
// vault data (asset icon, name, byline, big APY number, a gold
// sparkline-bar chart, and TVL + chain chips). Classic 1200x630
// social ratio.
export interface ProductCardOg {
  productName: string;
  asset: string;
  chain: string;
  protocol: string;
  vaultType: string;
  apyValue: string; // formatted, e.g. "5.42%"
  apyLabel: string; // e.g. "24h APY"
  tvlValue: string; // formatted, e.g. "$1.2M"
  // 0-100 normalized bar heights (already scaled). 12-20 entries.
  bars: number[];
  // Optional base64 data URI for the asset icon. Falls back to a
  // gold monogram circle when absent.
  assetIconDataUri?: string | null;
}

export function ogProductCard(p: ProductCardOg) {
  const bars = p.bars.length > 0 ? p.bars : [40, 55, 48, 62, 70, 58, 75, 82, 78, 90, 86, 95];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          background: BG,
          backgroundImage: `radial-gradient(${BG_DOT} 1.5px, transparent 1.5px)`,
          backgroundSize: "22px 22px",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Left column: centred Harvest wordmark (black) + tagline */}
        <div
          style={{
            width: 440,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 40px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: INK,
                lineHeight: 1,
              }}
            >
              Harvest
            </div>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: GOLD,
                marginBottom: 8,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 19,
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: INK_3,
            }}
          >
            Onchain yield index
          </div>
        </div>

        {/* Right column: the product card */}
        <div
          style={{
            flex: 1,
            height: "100%",
            display: "flex",
            alignItems: "center",
            paddingRight: 56,
          }}
        >
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              background: "#ffffff",
              borderRadius: 28,
              border: "1px solid #e7e3da",
              boxShadow: "0 24px 60px -20px rgba(25, 23, 23, 0.28)",
              padding: "34px 38px",
            }}
          >
            {/* Head: icon + name + byline */}
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              {p.assetIconDataUri ? (
                <img
                  src={p.assetIconDataUri}
                  width={56}
                  height={56}
                  style={{ borderRadius: 999, display: "block" }}
                  alt=""
                />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    background: GOLD,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: INK,
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                >
                  {p.asset.slice(0, 4)}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div
                  style={{
                    fontSize: p.productName.length > 26 ? 30 : 36,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    color: INK,
                    lineHeight: 1.05,
                  }}
                >
                  {p.productName}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 18,
                    fontWeight: 500,
                    color: INK_3,
                    display: "flex",
                  }}
                >
                  {p.chain} · {p.protocol} · {p.vaultType}
                </div>
              </div>
            </div>

            {/* Bignum */}
            <div
              style={{
                marginTop: 28,
                display: "flex",
                alignItems: "flex-end",
                gap: 14,
              }}
            >
              <div
                style={{
                  fontSize: 72,
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  color: INK,
                  lineHeight: 1,
                }}
              >
                {p.apyValue}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: INK_3,
                  marginBottom: 10,
                }}
              >
                {p.apyLabel}
              </div>
            </div>

            {/* Gold bar chart */}
            <div
              style={{
                marginTop: 22,
                height: 132,
                display: "flex",
                alignItems: "flex-end",
                gap: 6,
              }}
            >
              {bars.map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${Math.max(6, Math.min(100, h))}%`,
                    background: GOLD,
                    borderRadius: "6px 6px 0 0",
                  }}
                />
              ))}
            </div>

            {/* Footer chips */}
            <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  borderRadius: 999,
                  background: "rgba(25, 23, 23, 0.05)",
                  fontSize: 18,
                  fontWeight: 600,
                  color: INK_2,
                }}
              >
                TVL {p.tvlValue}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  borderRadius: 999,
                  background: "rgba(255, 185, 54, 0.18)",
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#946208",
                }}
              >
                {p.chain}
              </div>
            </div>
          </div>
        </div>

        {/* Right-edge gold accent stripe */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 8,
            height: "100%",
            background: `linear-gradient(180deg, ${GOLD} 0%, ${GOLD_SOFT} 100%)`,
          }}
        />
      </div>
    ),
    { ...OG_SIZE },
  );
}
