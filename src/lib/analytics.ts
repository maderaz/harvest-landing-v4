// Client-side helpers for the visit-tracking pipeline. All functions
// here run only in the browser (they touch `window`, `navigator`,
// `sessionStorage`, `localStorage`). They are imported only by
// "use client" components.

// --------------------------------------------------------------------------
// Consent
// --------------------------------------------------------------------------

const CONSENT_KEY = "harvest_analytics_consent";

// TEMP: testing-phase override. While CONSENT_REQUIRED is false, the
// cookie banner is suppressed and every visitor is treated as
// consented so tracking fires immediately. Flip to `true` before
// shipping a public consent flow.
const CONSENT_REQUIRED = false;

export type Consent = "accepted" | "declined";

export function getConsent(): Consent | null {
  if (!CONSENT_REQUIRED) return "accepted";
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "declined" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(v: Consent): void {
  try {
    localStorage.setItem(CONSENT_KEY, v);
  } catch {
    // private browsing or storage blocked - tracking simply won't fire.
  }
}

// --------------------------------------------------------------------------
// Session ID (durable, time-windowed - GA4-style)
// --------------------------------------------------------------------------
//
// The id lives in localStorage (NOT sessionStorage) so it survives the things
// that used to mint a spurious "new session" and inflate the SEO funnel: a
// mobile browser discarding a backgrounded tab and reloading it on return, a
// manual refresh, or a full browser restart. Two rules bound it so it stays a
// "session" and never a permanent fingerprint:
//
//   1. Inactivity rollover (SESSION_IDLE_MS, 30 min). A genuine new navigation
//      after the visitor was idle longer than this starts a fresh session -
//      exactly GA4's definition.
//   2. Reload/restore reuse. When this page load is a reload or back/forward
//      restore (Navigation Timing type), it is a continuation of the open tab,
//      never a new acquisition from search - so we reuse the stored id
//      regardless of the idle gap, up to a hard age cap (SESSION_MAX_AGE_MS),
//      after which even a reload starts fresh.
//
// The decision is made once per document load and memoized, so every
// trackVisit() within the same load (SPA route changes) sees a stable id and a
// stable entry flag; each call still slides the idle window forward.

const SESSION_KEY = "harvest_session_id";
const SESSION_LAST_KEY = "harvest_session_last"; // last-activity epoch ms
const SESSION_START_KEY = "harvest_session_start"; // session-start epoch ms

const SESSION_IDLE_MS = 30 * 60 * 1000; // 30-min inactivity rollover
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // reload-reuse capped at 24h

function newSessionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// True when this document was loaded by a reload or a back/forward restore
// (rather than a fresh navigation). Reflects how the document was loaded, so
// it is stable for the document's whole lifetime.
function navIsReloadOrRestore(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav && typeof nav.type === "string") {
      return nav.type === "reload" || nav.type === "back_forward";
    }
  } catch {
    // Navigation Timing unavailable - treat as a normal navigation.
  }
  return false;
}

// Memoized per document load: { id, isEntry }.
let resolvedSession: { id: string; isEntry: boolean } | null = null;

function resolveSession(): { id: string; isEntry: boolean } {
  if (resolvedSession) return resolvedSession;
  const now = Date.now();
  let id: string;
  let isEntry: boolean;
  try {
    const prevId = localStorage.getItem(SESSION_KEY);
    const last = Number(localStorage.getItem(SESSION_LAST_KEY) || 0);
    const start = Number(localStorage.getItem(SESSION_START_KEY) || 0);
    const idle = !Number.isFinite(last) || now - last > SESSION_IDLE_MS;
    const tooOld = !Number.isFinite(start) || now - start > SESSION_MAX_AGE_MS;
    // Reuse the stored session when it's a reload/restore of an open tab
    // (never a new acquisition) or the visitor was active within the idle
    // window. Start fresh only with no usable session, a real navigation
    // after the idle gap, or a stored session past the hard age cap.
    const reuse = !!prevId && !tooOld && (navIsReloadOrRestore() || !idle);
    if (reuse) {
      id = prevId as string;
      isEntry = false;
    } else {
      id = newSessionId();
      isEntry = true;
      localStorage.setItem(SESSION_START_KEY, String(now));
    }
    localStorage.setItem(SESSION_KEY, id);
    localStorage.setItem(SESSION_LAST_KEY, String(now));
  } catch {
    // Storage blocked (private mode): fall back to a fresh per-load id.
    id = newSessionId();
    isEntry = true;
  }
  resolvedSession = { id, isEntry };
  return resolvedSession;
}

export function getSessionId(): string {
  const s = resolveSession();
  // Slide the inactivity window forward on every tracked action so a long
  // active session doesn't roll over mid-visit.
  try {
    localStorage.setItem(SESSION_LAST_KEY, String(Date.now()));
  } catch {
    // ignore
  }
  return s.id;
}

export function takeIsEntryPage(): boolean {
  return resolveSession().isEntry;
}

// --------------------------------------------------------------------------
// Source derivation
// --------------------------------------------------------------------------

// Map of well-known referrer hostnames → display label. Match is
// exact OR suffix (so "news.google.com" still resolves to "Google").
const SOURCE_MAP: Record<string, string> = {
  "google.com": "Google",
  "bing.com": "Bing",
  "duckduckgo.com": "DuckDuckGo",
  "yahoo.com": "Yahoo",
  "yandex.com": "Yandex",
  "baidu.com": "Baidu",
  "perplexity.ai": "Perplexity",
  "chatgpt.com": "ChatGPT",
  "openai.com": "ChatGPT",
  "claude.ai": "Claude",
  "anthropic.com": "Claude",
  "gemini.google.com": "Gemini",
  "grok.com": "Grok",
  "x.ai": "Grok",
  "copilot.microsoft.com": "Copilot",
  "twitter.com": "Twitter/X",
  "x.com": "Twitter/X",
  "t.co": "Twitter/X",
  "facebook.com": "Facebook",
  "linkedin.com": "LinkedIn",
  "reddit.com": "Reddit",
  "old.reddit.com": "Reddit",
  "github.com": "GitHub",
  "medium.com": "Medium",
  "substack.com": "Substack",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "warpcast.com": "Warpcast",
  "farcaster.xyz": "Farcaster",
  "discord.com": "Discord",
  "telegram.org": "Telegram",
  "t.me": "Telegram",
  "instagram.com": "Instagram",
  "tiktok.com": "TikTok",
};

export function deriveSource(
  referrer: string,
  utmSource?: string | null,
): string {
  if (utmSource) return capitalize(utmSource);
  if (!referrer) return "Direct";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
    for (const [domain, label] of Object.entries(SOURCE_MAP)) {
      if (host === domain || host.endsWith("." + domain)) return label;
    }
    // Internal navigation (referrer is same site) - shouldn't normally
    // fire because we track each route, but covers edge cases like
    // hash navigation.
    if (host.includes("harvest")) return "Internal";
    // Brand from the registrable domain, not the subdomain, so a referrer of
    // "docs.moonwell.fi" reads "Moonwell", not "Docs". Heuristic root = last
    // two labels; the second-to-last label is the brand.
    const parts = host.split(".").filter(Boolean);
    const sld = parts.length >= 2 ? parts[parts.length - 2] : parts[0] || host;
    return capitalize(sld);
  } catch {
    return "Unknown";
  }
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// --------------------------------------------------------------------------
// User-agent parsing
// --------------------------------------------------------------------------

export interface ParsedUserAgent {
  device_type: "desktop" | "tablet" | "mobile";
  os: string;
  browser: string;
  browser_version: string;
  is_bot: boolean;
}

const BOT_RE =
  /\b(bot|crawler|spider|googlebot|bingbot|yandex|baiduspider|slurp|duckduckgo|facebot|ia_archiver|chatgpt|gptbot|claude-?web|anthropic|perplexitybot)\b/i;

export function parseUserAgent(ua: string): ParsedUserAgent {
  const u = (ua || "").toLowerCase();
  const is_bot = BOT_RE.test(u);

  let device_type: ParsedUserAgent["device_type"] = "desktop";
  if (/\b(ipad|tablet|kindle|playbook|silk)\b/.test(u)) device_type = "tablet";
  else if (/\b(mobile|android|iphone|ipod|blackberry|opera mini|windows phone)\b/.test(u))
    device_type = "mobile";

  let os = "Unknown";
  if (/windows nt/.test(u)) os = "Windows";
  else if (/iphone|ipad|ipod/.test(u) || /mac os x.*mobile/.test(u)) os = "iOS";
  else if (/mac os x/.test(u)) os = "macOS";
  else if (/android/.test(u)) os = "Android";
  else if (/linux/.test(u)) os = "Linux";
  else if (/cros/.test(u)) os = "ChromeOS";

  let browser = "Unknown";
  let browser_version = "";
  // Order matters: Edge before Chrome (Edge UA contains "Chrome").
  // Opera, Brave, Vivaldi often pose as Chrome and are reported as such.
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/Edg\/(\S+)/))) {
    browser = "Edge";
    browser_version = m[1];
  } else if ((m = ua.match(/OPR\/(\S+)/))) {
    browser = "Opera";
    browser_version = m[1];
  } else if ((m = ua.match(/Firefox\/(\S+)/))) {
    browser = "Firefox";
    browser_version = m[1];
  } else if ((m = ua.match(/Chrome\/(\S+)/))) {
    browser = "Chrome";
    browser_version = m[1];
  } else if ((m = ua.match(/Version\/(\S+)\s+Safari/))) {
    browser = "Safari";
    browser_version = m[1];
  }

  return { device_type, os, browser, browser_version, is_bot };
}

// --------------------------------------------------------------------------
// Geo lookup (consent-gated)
// --------------------------------------------------------------------------

// Called only after the visitor has clicked Accept on the banner.
// Hits ipapi.co (free 30k req/month, returns country/region/city).
// Result is cached in sessionStorage so we don't re-fetch on every
// route change. Failures degrade silently to empty geo.
const GEO_CACHE_KEY = "harvest_geo";

export interface Geo {
  country?: string;
  region?: string;
  city?: string;
}

// Visitor country (and region/city where the provider gives them), looked up
// in the browser because the site is a static export with no server to read
// an edge geo header from.
//
// ipapi.co alone used to do this. Its free tier refuses requests once a
// network hits its limit, and the old code only fell back when the request
// threw, so a 429 or an {"error": true} body left country blank, and that
// blank was cached for the rest of the session: every page of the visit
// went in without a country. Now several keyless, CORS-open providers are
// asked at once, the first answer with a valid two-letter code wins, and an
// empty result is never cached, so the next page view tries again.
const GEO_TIMEOUT_MS = 3000;
const isCountry = (c: unknown): c is string => typeof c === "string" && /^[A-Z]{2}$/.test(c);

async function geoFrom(url: string, read: (body: string) => Geo): Promise<Geo> {
  // AbortController + setTimeout, not AbortSignal.timeout, which Safari
  // only has from 16.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), GEO_TIMEOUT_MS);
  let body: string;
  try {
    const r = await fetch(url, { mode: "cors", signal: ctl.signal });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    body = await r.text();
  } finally {
    clearTimeout(timer);
  }
  const g = read(body);
  if (!isCountry(g.country)) throw new Error(`${url} gave no country`);
  return g;
}

const GEO_PROVIDERS: Array<() => Promise<Geo>> = [
  () =>
    geoFrom("https://ipapi.co/json/", (b) => {
      const j = JSON.parse(b) as Record<string, unknown>;
      return {
        country: (j.country_code as string) || undefined,
        region: (j.region as string) || undefined,
        city: (j.city as string) || undefined,
      };
    }),
  () =>
    geoFrom("https://get.geojs.io/v1/ip/geo.json", (b) => {
      const j = JSON.parse(b) as Record<string, unknown>;
      return {
        country: (j.country_code as string) || undefined,
        region: (j.region as string) || undefined,
        city: (j.city as string) || undefined,
      };
    }),
  () =>
    geoFrom("https://api.country.is/", (b) => ({
      country: ((JSON.parse(b) as Record<string, unknown>).country as string) || undefined,
    })),
  () =>
    geoFrom("https://www.cloudflare.com/cdn-cgi/trace", (b) => ({
      country: b.match(/loc=([A-Z]{2})/)?.[1],
    })),
];

/** The first promise to resolve; rejects only when all of them reject. */
function firstSuccess<T>(ps: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let failed = 0;
    for (const p of ps) {
      p.then(resolve, () => {
        if (++failed === ps.length) reject(new Error("all providers failed"));
      });
    }
  });
}

export async function fetchGeo(): Promise<Geo> {
  try {
    const cached = sessionStorage.getItem(GEO_CACHE_KEY);
    if (cached) {
      const g = JSON.parse(cached) as Geo;
      // A cached result without a country is a past failure: look again.
      if (isCountry(g.country)) return g;
    }
  } catch {
    // ignore - we'll fall through to the network call.
  }
  let out: Geo = {};
  try {
    out = await firstSuccess(GEO_PROVIDERS.map((p) => p()));
  } catch {
    // Every provider failed or timed out: record the visit without a country.
    return {};
  }
  try {
    sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(out));
  } catch {
    // ignore
  }
  return out;
}

// Synchronous read of whatever geo is already cached in
// sessionStorage. Returns {} when nothing is cached yet. Used by
// click tracking, which must fire its insert on the same tick as the
// click (before the browser can unload the page on navigation) and
// therefore cannot await the async network fetchGeo().
export function readCachedGeo(): Geo {
  try {
    const cached = sessionStorage.getItem(GEO_CACHE_KEY);
    if (cached) return JSON.parse(cached) as Geo;
  } catch {
    // ignore
  }
  return {};
}
