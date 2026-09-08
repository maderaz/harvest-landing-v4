/* eslint-disable @next/next/no-img-element */
// The social card for /best-crypto-casino-bonus.
//
// Built around the page's own header image instead of the shared text
// template. That graphic already carries the headline and all sixteen
// wordmarks, and a card that redrew the same claim in Satori would be a second
// version of it to keep in step. This one has nothing to fall out of sync
// with: the picture is the picture the reader lands on.
//
// It fits without cropping, and it does not need a matching background either.
// The header's own canvas is #ffb936, the site's gold, so the card is that
// colour and the image sits on it seamlessly.
//
// The one figure on the card comes from bonusHeadline, the same function the
// title and the description call, so the three cannot quote different totals.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { loadOgFonts, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { isRanked, loadCasinos } from "@/lib/crypto-casinos-data";
import { bonusHeadline } from "@/lib/crypto-casinos-copy";

export const dynamic = "force-static";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt =
  "Best crypto casino bonuses, ranked by offer size, by Harvest";

const GOLD = "#ffb936";
const INK = "#191717";

/**
 * The header image as a data URI.
 *
 * Satori cannot fetch a relative path and this build has no server, so the
 * file is read off disk and inlined. Null when it is missing, and the card
 * then renders as the gold canvas with its text, which is a worse card and
 * not a broken build.
 */
function headerDataUri(): string | null {
  try {
    const f = join(process.cwd(), "src", "assets", "icons", "CryptoCasinos-Header.png");
    if (!existsSync(f)) return null;
    return `data:image/png;base64,${readFileSync(f).toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Og() {
  const [fonts] = await Promise.all([loadOgFonts()]);
  const ranked = loadCasinos().casinos.filter(isRanked);
  const { compact } = bonusHeadline(ranked);
  const hero = headerDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: GOLD,
          color: INK,
          fontFamily: "Inter, system-ui, sans-serif",
          padding: "26px 40px 30px",
        }}
      >
        {/* Brand, small. The header image below carries the headline, so
            repeating it here would be the card arguing with itself. */}
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: INK,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: GOLD,
              fontSize: 18,
              fontWeight: 600,
              fontFamily: "Inter Tight, Inter, sans-serif",
            }}
          >
            H
          </div>
          <div
            style={{
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              fontFamily: "Inter Tight, Inter, sans-serif",
            }}
          >
            Harvest
          </div>
        </div>

        {/* The page's own header image, whole. */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 0,
            padding: "6px 0",
          }}
        >
          {hero ? (
            <img
              src={hero}
              alt=""
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                fontSize: 54,
                fontWeight: 600,
                textAlign: "center",
                fontFamily: "Inter Tight, Inter, sans-serif",
              }}
            >
              Best Crypto Casino Bonuses
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div
              style={{
                fontSize: 40,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                fontFamily: "Inter Tight, Inter, sans-serif",
              }}
            >
              {compact}
            </div>
            <div style={{ fontSize: 23, color: "rgba(25,23,23,0.72)" }}>
              {`in welcome bonuses across ${ranked.length} casinos`}
            </div>
          </div>
          <div style={{ fontSize: 19, color: "rgba(25,23,23,0.62)" }}>
            harvest.finance
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
