import { buildNetworkHubOgPayload } from "@/lib/hub-og";
import { ogImageResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";

export const dynamic = "force-static";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Harvest Arbitrum yields";

export default async function Og() {
  const payload = await buildNetworkHubOgPayload("Arbitrum", "Arbitrum");
  return ogImageResponse(payload);
}
