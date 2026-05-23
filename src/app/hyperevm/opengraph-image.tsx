import { buildNetworkHubOgPayload } from "@/lib/hub-og";
import { ogProductCard, loadOgFonts, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";

export const dynamic = "force-static";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Harvest HyperEVM yields";

export default async function Og() {
  const [payload, fonts] = await Promise.all([
    buildNetworkHubOgPayload("HyperEVM", "HyperEVM"),
    loadOgFonts(),
  ]);
  return ogProductCard(payload, fonts);
}
