#!/usr/bin/env node
/**
 * Post-build URL hygiene check.
 *
 * WHY THIS EXISTS
 * Ahrefs has crawled ~671,000 URLs on this domain against roughly 480 real
 * pages. The excess is a self-generating asset-path space: malformed URLs that
 * recursively re-encode themselves (`%25` is the encoding of `%`, so every
 * pass through an encoder inserts another `25`) and that answer 302 rather
 * than 404, so each crawl discovers a longer variant of the same URL. A 404
 * terminates a crawler; a 302 invites it back.
 *
 * That generator is not in this repository. This build has no middleware, no
 * redirects or rewrites in vercel.json or next.config.ts, no basePath or
 * assetPrefix, and no relative `public/...` asset references. The apex answers
 * 404 on every trap shape, verified against production. The multiplier lives
 * on the www hostname, at the edge, outside this codebase.
 *
 * What this file does is make sure it stays that way, and that our own two
 * outbound URL surfaces stay clean:
 *
 *   1. SITEMAP. Every entry must be an apex https URL that resolves to a file
 *      this build actually emitted. A sitemap entry that redirects or 404s
 *      spends crawl budget teaching Google that our sitemap lies.
 *   2. CANONICALS. Every rendered canonical must point at the apex origin.
 *      A canonical on www, on http, or carrying a query string splits the
 *      hostname and undoes the consolidation the edge redirect is for.
 *   3. ROBOTS. The crawl-trap Disallow prefixes must never start matching a
 *      real page. Blocking a namespace we later start using would be a silent,
 *      self-inflicted deindexing, so it is asserted rather than trusted.
 *
 * Runs after `mv out public`, alongside check-banned-words and
 * check-page-consistency, so it lints the rendered output rather than source.
 *
 * Usage:
 *   node scripts/check-url-hygiene.mjs
 *
 * Exits 0 if clean, non-zero on any finding. Wired into `npm run build` so
 * Vercel deploys fail on regressions.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const CONSTANTS_FILE = path.join(ROOT, "src", "lib", "constants.ts");

// Same single-source-of-truth read as build-seo-static.mjs, so a future
// www/non-www switch moves both together instead of drifting.
async function readSiteUrl() {
  const src = await fs.readFile(CONSTANTS_FILE, "utf-8");
  const m = src.match(/export\s+const\s+SITE_URL\s*=\s*["'`]([^"'`]+)["'`]/);
  if (!m) throw new Error("could not find SITE_URL in constants.ts");
  return m[1].replace(/\/$/, "");
}

// A sitemap URL is only honest if the export actually produced something at
// that path. cleanUrls means /usdc is served from usdc.html; the root is
// index.html. Anything else is a sitemap entry pointing at a 404.
async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolvesToFile(urlPath) {
  const rel = urlPath.replace(/^\//, "");
  if (rel === "") return exists(path.join(PUBLIC_DIR, "index.html"));
  const candidates = [
    path.join(PUBLIC_DIR, `${rel}.html`),
    path.join(PUBLIC_DIR, rel, "index.html"),
    path.join(PUBLIC_DIR, rel),
  ];
  for (const c of candidates) if (await exists(c)) return true;
  return false;
}

function parseLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

function parseDisallows(robots) {
  return [...robots.matchAll(/^Disallow:\s*(\S+)\s*$/gim)].map((m) => m[1]);
}

async function main() {
  const t0 = Date.now();
  const SITE_URL = await readSiteUrl();
  const findings = [];

  // --- 1. Sitemap ---------------------------------------------------------
  const sitemapPath = path.join(PUBLIC_DIR, "sitemap.xml");
  if (!(await exists(sitemapPath))) {
    console.error("[url-hygiene] public/sitemap.xml not found; run after `mv out public`.");
    process.exit(1);
  }
  const locs = parseLocs(await fs.readFile(sitemapPath, "utf-8"));
  if (!locs.length) findings.push({ where: "sitemap.xml", msg: "no <loc> entries" });

  const seen = new Set();
  for (const loc of locs) {
    const add = (msg) => findings.push({ where: `sitemap: ${loc}`, msg });
    if (seen.has(loc)) add("duplicate entry");
    seen.add(loc);

    if (!loc.startsWith(`${SITE_URL}/`) && loc !== SITE_URL) {
      add(`not on the canonical origin ${SITE_URL} (www and http split the host)`);
      continue;
    }
    const urlPath = loc.slice(SITE_URL.length) || "/";
    if (urlPath.includes("%")) add("percent-encoded character");
    if (urlPath.includes("?") || urlPath.includes("#")) add("query string or fragment");
    if (urlPath.endsWith(".html")) add("ends in .html (cleanUrls will 308 this)");
    if (urlPath !== "/" && urlPath.endsWith("/")) add("trailing slash (trailingSlash:false will 308 this)");
    if (urlPath.includes("//")) add("doubled path separator");
    if (!(await resolvesToFile(urlPath))) add("no file emitted at this path; would 404");
  }

  // --- 2. Canonicals ------------------------------------------------------
  const htmlFiles = (await fs.readdir(PUBLIC_DIR, { recursive: true, withFileTypes: true }))
    .filter((d) => d.isFile() && d.name.endsWith(".html"))
    .map((d) => path.join(d.parentPath ?? d.path, d.name));

  let canonicalCount = 0;
  for (const file of htmlFiles) {
    const html = await fs.readFile(file, "utf-8");
    const m = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
    if (!m) continue;
    canonicalCount += 1;
    const href = m[1];
    const rel = path.relative(PUBLIC_DIR, file);
    if (!href.startsWith(`${SITE_URL}/`) && href !== SITE_URL) {
      findings.push({ where: `canonical in ${rel}`, msg: `points at ${href}, not the ${SITE_URL} origin` });
    }
  }

  // --- 3. Robots Disallow prefixes vs real pages --------------------------
  const robotsPath = path.join(PUBLIC_DIR, "robots.txt");
  if (await exists(robotsPath)) {
    const disallows = parseDisallows(await fs.readFile(robotsPath, "utf-8"));
    const sitemapPaths = locs
      .filter((l) => l.startsWith(SITE_URL))
      .map((l) => l.slice(SITE_URL.length) || "/");
    for (const rule of disallows) {
      const blocked = sitemapPaths.filter((p) => p.startsWith(rule));
      if (blocked.length) {
        findings.push({
          where: `robots.txt "Disallow: ${rule}"`,
          msg: `blocks ${blocked.length} URL(s) that are in the sitemap, e.g. ${blocked[0]}`,
        });
      }
    }
  }

  const ms = Date.now() - t0;
  if (findings.length) {
    console.error(`\n[FAIL] url-hygiene: ${findings.length} finding(s)\n`);
    for (const f of findings) console.error(`  ${f.where}\n    ${f.msg}`);
    console.error("");
    process.exit(1);
  }
  console.log(
    `[OK] url hygiene passed (${locs.length} sitemap URLs, ${canonicalCount} canonicals, origin ${SITE_URL}, ${ms}ms)`,
  );
}

main().catch((err) => {
  console.error(`[url-hygiene] ${err.message}`);
  process.exit(1);
});
