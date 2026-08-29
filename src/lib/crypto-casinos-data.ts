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
    const casinos = (Array.isArray(d.casinos) ? d.casinos : [])
      .filter((c: Casino) => c && c.slug && c.name && c.url)
      .sort(
        (a: Casino, b: Casino) =>
          casinoScore(b) - casinoScore(a) || a.name.localeCompare(b.name),
      );
    return { generatedAt: d.generatedAt ?? null, casinos };
  } catch {
    return { generatedAt: null, casinos: [] };
  }
}
