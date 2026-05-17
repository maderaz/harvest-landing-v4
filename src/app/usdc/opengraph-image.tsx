import { buildAssetHubOgPayload } from "@/lib/hub-og";
import { ogImageResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";

export const dynamic = "force-static";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Harvest USDC yields";

export default async function Og() {
  const payload = await buildAssetHubOgPayload("USDC");
  return ogImageResponse(payload);
}
