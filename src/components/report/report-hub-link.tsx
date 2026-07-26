"use client";

// Internal link from a report page down to an asset hub, instrumented into
// the report_outbound_clicks channel with a "hub:<slug>" venue_ref. The
// stablecoin report's conversion mechanism is this link, not its own CTA
// (build spec section 8), so it has to be measurable before launch. Reuses
// the existing report tracking table rather than inventing a new channel;
// event stays "open" (there is no interstitial on an internal link, so the
// open IS the navigation).

import Link from "next/link";
import type { ReactNode } from "react";
import { trackReportOutbound } from "@/lib/report-tracking";

export function ReportHubLink({
  href,
  hub,
  className,
  children,
}: {
  href: string;
  hub: string; // e.g. "usdc"
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() =>
        trackReportOutbound({
          event: "open",
          platform: "Harvest",
          venueRef: `hub:${hub}`,
          targetUrl: href,
        })
      }
    >
      {children}
    </Link>
  );
}
