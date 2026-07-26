#!/usr/bin/env node
// Emits the machine-readable distributions for /report/stablecoin-yield-ranking:
//   public/data/stablecoin-yield/index.json  (full snapshot + stats)
//   public/data/stablecoin-yield/rates.csv   (one row per venue, contracts + timestamps)
// Both are referenced by the page's Dataset schema (CC-BY-4.0) and its visible
// download links, so Google's Dataset crawler and agents get a real parseable
// file rather than only the HTML table. Pattern reference:
// scripts/build-xrp-history.mjs. Runs after `mv out public` in the build chain.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const IN_FILE = join(ROOT, "data", "stablecoin-yield.json");
const OUT_DIR = join(ROOT, "public", "data", "stablecoin-yield");

if (!existsSync(IN_FILE)) {
  console.log("[stablecoin-export] no data/stablecoin-yield.json yet; skipping export.");
  process.exit(0);
}

const doc = JSON.parse(readFileSync(IN_FILE, "utf-8"));
mkdirSync(OUT_DIR, { recursive: true });

writeFileSync(
  join(OUT_DIR, "index.json"),
  JSON.stringify(
    {
      license: "CC-BY-4.0",
      attribution: "Harvest (harvest.finance)",
      dataModified: doc.dataModifiedIso,
      source: doc.source,
      stats: doc.stats,
      rows: doc.rows,
    },
    null,
    2,
  ),
  "utf-8",
);

const esc = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const header = [
  "stablecoin", "venue", "product", "network", "venue_type", "apy_pct", "apy_7d_pct",
  "tvl_usd", "contract_address", "observed_at", "rate_basis",
];
const lines = [header.join(",")];
for (const r of doc.rows) {
  lines.push(
    [r.stablecoin, r.platform, r.product, r.network, r.venueType, r.apy, r.apy7d ?? "",
     r.tvlUsd, r.contractAddress, r.observedAt ?? "", r.rateBasis].map(esc).join(","),
  );
}
writeFileSync(join(OUT_DIR, "rates.csv"), lines.join("\n") + "\n", "utf-8");

console.log(
  `[stablecoin-export] wrote index.json + rates.csv (${doc.rows.length} venues) to public/data/stablecoin-yield/`,
);
