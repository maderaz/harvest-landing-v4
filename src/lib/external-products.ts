// Build-time reader for /product/[slug]. Unlike src/lib/polygon-yield.ts
// (reads a git-committed JSON snapshot), this reads Supabase directly --
// supabaseSelectAll already only uses global fetch + env vars, so it works
// identically at Next build time (Node) as it does client-side; there is no
// separate "build API" to maintain. See supabase/external_products.sql and
// scripts/sync-external-products.mjs for the write side.
//
// Falls back to the bare registry (data/external-products.json) with every
// row marked rateNa when Supabase isn't configured, e.g. a fresh checkout
// with no NEXT_PUBLIC_SUPABASE_URL set yet -- same resilience the polygon
// venue reader has for its own missing-pipeline-output case.

import { readFileSync } from "fs";
import { join } from "path";
import { supabaseSelectAll } from "@/lib/supabase";

const REGISTRY_FILE = join(process.cwd(), "data", "external-products.json");

// Master switch for the /product/[slug] surface. Currently OFF: no product
// page is published, and this module only feeds the sitemap's (empty) list.
//
// The rest of the pipeline is intact and verified -- the registry
// (data/external-products.json), the Supabase schema
// (supabase/external_products.sql, already applied), the adapters and the
// hourly sync cron all still run and keep the tables warm. Only the rendered
// route is gone: Next's `output: export` rejects a generateStaticParams()
// that yields nothing, so a page-level flag can't express "route exists but
// publishes zero pages" and the route file had to be removed rather than
// disabled in place. Restore it with:
//   git checkout d63bcc65 -- src/app/product
// then flip this to true.
//
// Off by design right now: /polygon is deliberately scoped to venues whose
// rate we read directly from their own contract, and every product in this
// registry other than the Aave duplicates is Portals-sourced. See
// data/polygon-venues.json's `hidden` array for the same decision applied
// there.
export const EXTERNAL_PRODUCT_PAGES_ENABLED = false;

// Slugs in data/external-products.json that describe the exact same venue as
// an existing /polygon/[venue] page (same Aave v3 Pool, same asset). Kept so
// that if EXTERNAL_PRODUCT_PAGES_ENABLED is flipped on before the two systems
// are consolidated, these canonicalize back to /polygon/[venue] and stay out
// of the sitemap rather than competing as duplicate content.
export const POLYGON_VENUE_OVERLAP: Record<string, string> = {
  "aave-v3-dai-polygon": "/polygon/aave-v3-dai-polygon",
  "aave-v3-usdce-polygon": "/polygon/aave-v3-usdce-polygon",
  "aave-v3-usdc-polygon": "/polygon/aave-v3-usdc-polygon",
  "aave-v3-usdt-polygon": "/polygon/aave-v3-usdt-polygon",
  "aave-v3-weth-polygon": "/polygon/aave-v3-weth-polygon",
  "aave-v3-wbtc-polygon": "/polygon/aave-v3-wbtc-polygon",
};

export interface ExternalProduct {
  slug: string;
  asset: string;
  assetGroup: string;
  platform: string;
  chain: string;
  productType: string | null;
  productUrl: string;
  vaultTokenAddress: string;
  sourceKind: "onchain" | "portals";
  apy: number | null;
  apyBase: number | null;
  tvlUsd: number;
  rateNa: boolean;
  rateBasis: string | null;
  updatedAt: string | null;
}

interface ExternalProductRow {
  slug: string;
  asset: string;
  platform: string;
  chain: string;
  product_type: string | null;
  product_url: string;
  vault_token_address: string;
  source_kind: "onchain" | "portals";
  apy: number | null;
  apy_base: number | null;
  tvl_usd: number;
  rate_na: boolean;
  rate_basis: string | null;
  updated_at: string | null;
}

interface RegistryProduct {
  slug: string;
  asset: string;
  assetGroup: string;
  platform: string;
  chain: string;
  productType?: string;
  productUrl: string;
  vaultTokenAddress: string;
  source: { kind: "onchain" | "portals" };
}

function assetGroupOf(slug: string): string {
  const doc = JSON.parse(readFileSync(REGISTRY_FILE, "utf-8"));
  return (
    (doc.products as RegistryProduct[]).find((p) => p.slug === slug)?.assetGroup ?? "Other"
  );
}

function fallbackFromRegistry(): ExternalProduct[] {
  const doc = JSON.parse(readFileSync(REGISTRY_FILE, "utf-8"));
  return (doc.products as RegistryProduct[]).map((p) => ({
    slug: p.slug,
    asset: p.asset,
    assetGroup: p.assetGroup,
    platform: p.platform,
    chain: p.chain,
    productType: p.productType ?? null,
    productUrl: p.productUrl,
    vaultTokenAddress: p.vaultTokenAddress,
    sourceKind: p.source.kind,
    apy: null,
    apyBase: null,
    tvlUsd: 0,
    rateNa: true,
    rateBasis: "na",
    updatedAt: null,
  }));
}

export async function getExternalProducts(): Promise<ExternalProduct[]> {
  const rows = await supabaseSelectAll<ExternalProductRow>(
    "external_products",
    "select=*&order=apy.desc",
  );
  if (!rows.length) return fallbackFromRegistry();
  return rows.map((r) => ({
    slug: r.slug,
    asset: r.asset,
    assetGroup: assetGroupOf(r.slug),
    platform: r.platform,
    chain: r.chain,
    productType: r.product_type,
    productUrl: r.product_url,
    vaultTokenAddress: r.vault_token_address,
    sourceKind: r.source_kind,
    apy: r.apy,
    apyBase: r.apy_base,
    tvlUsd: r.tvl_usd ?? 0,
    rateNa: r.rate_na,
    rateBasis: r.rate_basis,
    updatedAt: r.updated_at,
  }));
}

export async function getExternalProductBySlug(slug: string): Promise<ExternalProduct | null> {
  const products = await getExternalProducts();
  return products.find((p) => p.slug === slug) ?? null;
}

export interface ExternalProductHistoryPoint {
  d: string;
  apy: number | null;
}

export async function getExternalProductHistory(
  slug: string,
): Promise<ExternalProductHistoryPoint[]> {
  const rows = await supabaseSelectAll<{ d: string; apy: number | null }>(
    "external_product_history",
    `select=d,apy&product_slug=eq.${encodeURIComponent(slug)}&order=d.asc`,
  );
  return rows;
}

export function getExternalProductSlugsFromRegistry(): string[] {
  if (!EXTERNAL_PRODUCT_PAGES_ENABLED) return [];
  const doc = JSON.parse(readFileSync(REGISTRY_FILE, "utf-8"));
  return (doc.products as RegistryProduct[]).map((p) => p.slug);
}
