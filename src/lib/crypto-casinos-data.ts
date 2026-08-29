// Server-only reader for data/crypto-casinos.json. Split from
// lib/crypto-casinos so the client components can import the types and the
// score without pulling node:fs into the browser bundle.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { casinoScore, type Casino, type CasinoData } from "@/lib/crypto-casinos";

export function loadCasinos(): CasinoData {
  try {
    const f = join(process.cwd(), "data", "crypto-casinos.json");
    if (!existsSync(f)) return { generatedAt: null, casinos: [] };
    const d = JSON.parse(readFileSync(f, "utf-8")) as CasinoData;
    const casinos = (Array.isArray(d.casinos) ? d.casinos : []).filter(
      (c: Casino) => c && c.slug && c.name,
    );
    // Verified venues rank above unverified ones, by score. Everything else
    // keeps the order it was supplied in, which is commercial and is labelled
    // that way on the page rather than dressed up as a merit order.
    casinos.sort((a, b) => {
      const sa = casinoScore(a);
      const sb = casinoScore(b);
      if (sa != null && sb != null) return sb - sa || a.order - b.order;
      if (sa != null) return -1;
      if (sb != null) return 1;
      return a.order - b.order;
    });
    return { generatedAt: d.generatedAt ?? null, casinos };
  } catch {
    return { generatedAt: null, casinos: [] };
  }
}
