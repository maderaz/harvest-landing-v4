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
    // Advance by what came back, not by chunk, in case the server caps lower.
    while (all.length < hardLimit) {
      const batch = await page(params, `${all.length}-${all.length + chunk - 1}`);
      if (batch.length === 0) return all;
      all.push(...batch);
    }
    console.warn(`supabaseSelectAll(${table}): stopped at the ${hardLimit}-row limit`);
    return all;
  }

  const [, col, dir] = order;
  const op = dir === "desc" ? "lte" : "gte";
  const valueOf = (r: T) => (r as Record<string, unknown>)[col];
  let cursor: unknown = undefined;
  // Rows already taken that sit exactly on the cursor value, by content. The
  // next page repeats the cursor (lte/gte) so rows sharing a timestamp across
  // the page boundary are not lost, and drops the ones already taken. Matched
  // by content, not position, because Postgres returns tied rows in no fixed
  // order. The page size never goes above chunk: PostgREST caps every reply
  // at its max-rows (1000 on Supabase), so a short page is not proof of the
  // end; only an empty one is.
  let seenAtCursor = new Map<string, number>();
  let tieOffset = 0;
  while (all.length < hardLimit) {
    const filter =
      cursor === undefined ? "" : `&${col}=${op}.${encodeURIComponent(String(cursor))}`;
    const skip = tieOffset ? `&offset=${tieOffset}` : "";
    const batch = await page(`${params}${filter}&limit=${chunk}${skip}`);
    if (batch.length === 0) return all;
    const pending = new Map(seenAtCursor);
    const fresh: T[] = [];
    for (const r of batch) {
      if (!tieOffset && cursor !== undefined && valueOf(r) === cursor) {
        const key = JSON.stringify(r);
        const n = pending.get(key) ?? 0;
        if (n > 0) {
          pending.set(key, n - 1);
          continue;
        }
      }
      fresh.push(r);
    }
    if (fresh.length === 0) {
      // A whole page of rows already taken: one value has more ties than a
      // page holds. Step past them by offset until the value changes.
      tieOffset = [...seenAtCursor.values()].reduce((a, b) => a + b, 0);
      continue;
    }
    all.push(...fresh);
    const last = valueOf(fresh[fresh.length - 1]);
    if (last === null || last === undefined) {
      // Cannot key past a null; finish the rest by offset.
      while (all.length < hardLimit) {
        const rest = await page(params, `${all.length}-${all.length + chunk - 1}`);
        if (rest.length === 0) return all;
        all.push(...rest);
      }
      break;
    }
    if (last !== cursor) {
      cursor = last;
      seenAtCursor = new Map();
      tieOffset = 0;
    }
    for (const r of fresh) {
      if (valueOf(r) !== cursor) continue;
      const key = JSON.stringify(r);
      seenAtCursor.set(key, (seenAtCursor.get(key) ?? 0) + 1);
    }
    if (tieOffset) tieOffset += fresh.length;
  }
  console.warn(`supabaseSelectAll(${table}): stopped at the ${hardLimit}-row limit`);
  return all;
}
