// Homepage OG image. Uses the same product-card template as every
// other card (Harvest wordmark left, data card right) showing the
// highest live USDC rate on the platform - generated once at build
// time and emitted as a static PNG that Next.js wires into <head>.

import { buildAssetHubOgPayload } from "@/lib/hub-og";
import {
  ogProductCard,
  loadOgFonts,
  OG_SIZE,
  OG_CONTENT_TYPE,
} from "@/lib/og-template";

export const dynamic = "force-static";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Harvest - Compare the best DeFi yields across networks";

export default async function HomeOg() {
  const [payload, fonts] = await Promise.all([
    buildAssetHubOgPayload("USDC"),
    loadOgFonts(),
  ]);
  return ogProductCard(payload, fonts);
}
