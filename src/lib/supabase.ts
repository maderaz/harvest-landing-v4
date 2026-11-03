// Lightweight Supabase REST client. Uses raw fetch so we don't ship
// the @supabase/supabase-js SDK to every page (saves ~200KB of bundle).
// Both helpers run client-side; the anon key + URL are public-config
// by design (NEXT_PUBLIC_* env vars get inlined into the bundle).

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function configured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

// Control-room READS authenticate as the logged-in admin (a Supabase Auth
// JWT), so they work under RLS where the publishable/`anon` key is INSERT-only.
// The control-room gate sets this token on login and clears it on sign-out
// (see supabase-auth.ts). When absent - public pages, logged-out - reads fall
// back to the publishable key, i.e. the `anon` role. Writes always stay anon.
let _accessToken: string | null = null;
export function setSupabaseAccessToken(token: string | null): void {
  _accessToken = token;
}
function readBearer(): string {
  return _accessToken || SUPABASE_ANON_KEY;
}

export async function supabaseInsert(
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  if (!configured()) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      // keepalive lets the request finish even if the user navigates
      // away mid-flight (common on first pageview tracking calls).
      keepalive: true,
    });
  } catch {
    // analytics insert is best-effort; never break the page.
  }
}

export async function supabaseSelect<T>(
  table: string,
  params: string = "",
): Promise<T[]> {
  if (!configured()) return [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/${table}${params ? "?" + params : ""}`;
    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${readBearer()}`,
      },
    });
    if (!r.ok) return [];
    return (await r.json()) as T[];
  } catch {
    return [];
  }
}

// Paginated full-table fetch. PostgREST hard-caps a single response
// at 1000 rows, so for tables that have grown past that we page through.
// Caller passes the same query-string they'd pass to supabaseSelect
// (select / order / filters); pagination is handled here.
//
// Paging is keyset when the query orders by one column (every control-room
// caller does): each page asks for rows past the last value seen, so page 90
// costs the database what page 1 does. Offset paging (the Range header) made
// it sort and skip every earlier row on each request; once frontpage_visits
// grew large enough, the deep pages timed out, the loop stopped on the first
// failed page, and the charts quietly showed only the newest few days.
// Queries without an order still page by offset.
//
// A failed page is retried, then thrown: a short dataset drawn as if it were
// the full history is worse than an error the page shows.
//
// hardLimit caps total rows pulled so a runaway table can't lock the page.
export async function supabaseSelectAll<T>(
  table: string,
  params: string = "",
  chunk = 1000,
  hardLimit = 500_000,
): Promise<T[]> {
  if (!configured()) return [];
  const order = /(?:^|&)order=([A-Za-z0-9_]+)\.(asc|desc)(?:\.nulls(?:first|last))?(?=&|$)/.exec(params);
  const base = `${SUPABASE_URL}/rest/v1/${table}`;
  const all: T[] = [];

  const page = async (query: string, range?: string): Promise<T[]> => {
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
      try {
        const r = await fetch(`${base}${query ? "?" + query : ""}`, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${readBearer()}`,
            ...(range ? { Range: range, "Range-Unit": "items" } : {}),
          },
        });
        if (r.ok) {
          const batch = (await r.json()) as T[];
          return Array.isArray(batch) ? batch : [];
        }
        lastErr = `${r.status} ${(await r.text()).slice(0, 200)}`;
        // A bad query or a missing grant will not pass on a retry.
        if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) break;
      } catch (e) {
        lastErr = String(e);
      }
    }
    throw new Error(`${table}: page ${Math.floor(all.length / chunk) + 1} failed after ${all.length} rows (${lastErr})`);
  };

  if (!order) {
    for (let from = 0; from < hardLimit; from += chunk) {
      const batch = await page(params, `${from}-${from + chunk - 1}`);
      all.push(...batch);
      if (batch.length < chunk) return all;
    }
    console.warn(`supabaseSelectAll(${table}): stopped at the ${hardLimit}-row limit`);
    return all;
  }

  const [, col, dir] = order;
  const op = dir === "desc" ? "lte" : "gte";
  let cursor: unknown = undefined;
  // Rows already taken that sit exactly on the cursor value. The next page
  // repeats the cursor (lte/gte) so rows sharing a timestamp across the page
  // boundary are not lost, and skips this many of them.
  let atCursor = 0;
  while (all.length < hardLimit) {
    const filter =
      cursor === undefined ? "" : `&${col}=${op}.${encodeURIComponent(String(cursor))}`;
    const batch = await page(`${params}${filter}&limit=${chunk + atCursor}`);
    const fresh = batch.slice(atCursor);
    all.push(...fresh);
    if (batch.length < chunk + atCursor || fresh.length === 0) return all;
    const last = (fresh[fresh.length - 1] as Record<string, unknown>)[col];
    if (last === null || last === undefined) {
      // Cannot key past a null; finish the rest by offset.
      for (let from = all.length; from < hardLimit; from += chunk) {
        const rest = await page(params, `${from}-${from + chunk - 1}`);
        all.push(...rest);
        if (rest.length < chunk) return all;
      }
      break;
    }
    if (last === cursor) {
      atCursor += fresh.length;
    } else {
      cursor = last;
      atCursor = 0;
      for (let k = fresh.length - 1; k >= 0; k--) {
        if ((fresh[k] as Record<string, unknown>)[col] === last) atCursor++;
        else break;
      }
    }
  }
  console.warn(`supabaseSelectAll(${table}): stopped at the ${hardLimit}-row limit`);
  return all;
}
