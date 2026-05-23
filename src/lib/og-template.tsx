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
  // Optional base64 data URIs. Fall back to a gold monogram circle
  // (asset) / nothing (chain) when absent.
  assetIconDataUri?: string | null;
  chainIconDataUri?: string | null;
}

// Brand fonts for the OG card, fetched once per build from Google
// Fonts and cached at module scope. Inter Tight is the homepage
// display face (the wordmark + product name + bignum); Inter is the
// body face. Returns [] on any failure so the build never breaks -
// Satori then falls back to its bundled default font.
type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700; style: "normal" };
let _ogFontsCache: OgFont[] | null = null;

export async function loadOgFonts(): Promise<OgFont[]> {
  if (_ogFontsCache) return _ogFontsCache;
  const families: { name: string; css: string; weight: OgFont["weight"] }[] = [
    {
      name: "Inter Tight",
      css: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600",
      weight: 600,
    },
    {
      name: "Inter",
      css: "https://fonts.googleapis.com/css2?family=Inter:wght@500",
      weight: 500,
    },
  ];
  const fonts: OgFont[] = [];
  for (const f of families) {
    try {
      // Node's fetch sends a non-browser UA, so the css2 API returns
      // TTF src URLs (Satori needs ttf/otf, not woff2).
      const css = await (await fetch(f.css)).text();
      const m = css.match(/src:\s*url\((https:\/\/[^)]+\.ttf)\)/);
      if (!m) continue;
      const data = await (await fetch(m[1])).arrayBuffer();
      fonts.push({ name: f.name, data, weight: f.weight, style: "normal" });
    } catch {
      // skip - default font fallback
    }
  }
  _ogFontsCache = fonts;
  return fonts;
}

const DISPLAY = "Inter Tight";
const SANS = "Inter";

export function ogProductCard(p: ProductCardOg, fonts: OgFont[] = []) {
  const bars =
    p.bars.length > 0
      ? p.bars
      : [40, 55, 48, 62, 70, 58, 75, 82, 78, 90, 86, 95, 88, 96];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          // Flagship Sunflower Gold canvas - matches the homepage
          // hero: solid gold + warm corner glow + dark-ink dot
          // raster, layered as absolute children (Satori won't
          // composite comma-separated background images).
          position: "relative",
          background: GOLD,
          fontFamily: SANS,
        }}
      >
        {/* Dot raster (ink dots on gold, 12px grid) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle, rgba(25, 23, 23, 0.07) 1px, transparent 1.3px)",
            backgroundSize: "12px 12px",
          }}
        />
        {/* Warm corner glow, top-right */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 88% 18%, rgba(255, 145, 30, 0.42) 0%, rgba(255, 185, 54, 0) 55%)",
          }}
        />

        {/* Left column: Harvest wordmark + tagline, left-aligned as a
            group, vertically centred. */}
        <div
          style={{
            width: 430,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingLeft: 72,
            paddingRight: 24,
            position: "relative",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <div
              style={{
                fontFamily: DISPLAY,
                fontSize: 66,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: INK,
                lineHeight: 1,
              }}
            >
              Harvest
            </div>
            <div
              style={{
                width: 13,
                height: 13,
                borderRadius: 3,
                background: INK,
                marginBottom: 9,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: INK_2,
              opacity: 0.7,
            }}
          >
            Onchain yield index
          </div>
        </div>

        {/* Right column: white product card, anchored to the bottom
            edge so it reads as rising from the floor (like the hero
            preview). Rounded top corners, square bottom flush to the
            canvas edge. */}
        <div
          style={{
            flex: 1,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            paddingRight: 56,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 22,
              background: "#ffffff",
              borderRadius: "18px 18px 0 0",
              padding: "32px 36px 38px",
              boxShadow:
                "0 -6px 18px -10px rgba(25, 23, 23, 0.16), 0 18px 40px -18px rgba(25, 23, 23, 0.34)",
            }}
          >
            {/* View CTA, top-right corner */}
            <div
              style={{
                position: "absolute",
                top: 22,
                right: 26,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 999,
                background: GOLD,
                color: INK,
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              View ↗
            </div>

            {/* Head: icon + name + byline */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {p.assetIconDataUri ? (
                <img
                  src={p.assetIconDataUri}
                  width={52}
                  height={52}
                  style={{ borderRadius: 999, display: "block" }}
                  alt=""
                />
              ) : (
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 999,
                    background: GOLD,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: INK,
                    fontFamily: DISPLAY,
                    fontSize: 20,
                    fontWeight: 600,
                  }}
                >
                  {p.asset.slice(0, 4)}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: DISPLAY,
                    fontSize: p.productName.length > 26 ? 28 : 33,
                    fontWeight: 600,
                    letterSpacing: "-0.018em",
                    color: INK,
                    lineHeight: 1.1,
                  }}
                >
                  {p.productName}
                </div>
                <div
                  style={{
                    marginTop: 7,
                    fontSize: 17,
                    fontWeight: 500,
                    color: INK_2,
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  {p.chainIconDataUri ? (
                    <img
                      src={p.chainIconDataUri}
                      width={18}
                      height={18}
                      style={{ borderRadius: 999, display: "block" }}
                      alt=""
                    />
                  ) : null}
                  {p.chain} · {p.protocol} · {p.vaultType}
                </div>
              </div>
            </div>

            {/* Bignum */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
              <div
                style={{
                  fontFamily: DISPLAY,
                  fontSize: 58,
                  fontWeight: 600,
                  letterSpacing: "-0.022em",
                  color: INK,
                  lineHeight: 1,
                }}
              >
                {p.apyValue}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: INK_3,
                  marginBottom: 7,
                }}
              >
                {p.apyLabel}
              </div>
            </div>

            {/* Range pill rail (static snapshot, 30D active) */}
            <div style={{ display: "flex" }}>
              <div
                style={{
                  display: "flex",
                  gap: 2,
                  padding: 4,
                  borderRadius: 999,
                  background: "rgba(25, 23, 23, 0.04)",
                }}
              >
                {["24H", "7D", "30D", "All"].map((r) => {
                  const active = r === "30D";
                  return (
                    <div
                      key={r}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 999,
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        color: active ? GOLD : INK_3,
                        background: active ? INK : "transparent",
                      }}
                    >
                      {r}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Gold bar chart */}
            <div
              style={{
                height: 120,
                display: "flex",
                alignItems: "flex-end",
                gap: 4,
              }}
            >
              {bars.map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${Math.max(6, Math.min(100, h))}%`,
                    background: GOLD,
                    borderRadius: "3px 3px 0 0",
                  }}
                />
              ))}
            </div>

            {/* Footer: metric tabs (APY active) + TVL chip */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", gap: 18 }}>
                {["TVL", "APY", "Share price"].map((t) => {
                  const active = t === "APY";
                  return (
                    <div
                      key={t}
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: active ? INK : INK_3,
                        borderBottom: active
                          ? `2px solid ${GOLD}`
                          : "2px solid transparent",
                        paddingBottom: 4,
                      }}
                    >
                      {t}
                    </div>
                  );
                })}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "7px 15px",
                  borderRadius: 999,
                  background: "rgba(25, 23, 23, 0.05)",
                  fontSize: 16,
                  fontWeight: 600,
                  color: INK_2,
                }}
              >
                TVL {p.tvlValue}
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
    {
      ...OG_SIZE,
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );
}
