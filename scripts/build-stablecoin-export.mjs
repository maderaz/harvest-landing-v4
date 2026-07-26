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
  "tier", "product", "platform", "curated_by", "payout_asset", "network", "product_type",
  "apy_pct", "rate_window", "share_price", "tvl_usd", "apy_stdev_pp", "apy_min_pct",
  "apy_max_pct", "tvl_change_pct", "holders", "top5_pct", "contract_address", "rate_basis",
];
const lines = [header.join(",")];
for (const r of doc.rows) {
  const m = r.metrics ?? {};
  const h = r.holders ?? {};
  lines.push(
    [r.tier, r.name, r.platform, r.curatedBy ?? "", r.payoutAsset, r.network, r.productType,
     r.apy ?? "", r.rateWindow ?? "", r.sharePrice ?? "", r.tvlUsd ?? "", m.apyStdev ?? "",
     m.apyMin ?? "", m.apyMax ?? "", m.tvlChangePct ?? "", h.count ?? "", h.top5Pct ?? "",
     r.contract, r.rateBasis].map(esc).join(","),
  );
}
writeFileSync(join(OUT_DIR, "rates.csv"), lines.join("\n") + "\n", "utf-8");

console.log(
  `[stablecoin-export] wrote index.json + rates.csv (${doc.rows.length} venues) to public/data/stablecoin-yield/`,
);
