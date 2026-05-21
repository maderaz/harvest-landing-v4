#!/usr/bin/env node
// Copies the design-system bundle (src/design-system-bundle/*) into
// public/design-system/ AFTER the build pipeline does `rm -rf public
// && mv out public`. The .md/.css files live under src/ (not public/,
// which is gitignored) and are not Next.js-aware, so they'd be
// dropped without this step.

import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src", "design-system-bundle");
const DST = join(ROOT, "public", "design-system");

if (!existsSync(SRC)) {
  console.error(`[design-system] source dir missing: ${SRC}`);
  process.exit(1);
}

if (!existsSync(DST)) mkdirSync(DST, { recursive: true });

let copied = 0;
let totalBytes = 0;
for (const name of readdirSync(SRC)) {
  const from = join(SRC, name);
  const to = join(DST, name);
  if (!statSync(from).isFile()) continue;
  copyFileSync(from, to);
  totalBytes += statSync(to).size;
  copied++;
}

console.log(
  `[design-system] copied ${copied} file(s) -> ${DST} (${(totalBytes / 1024).toFixed(1)}KB)`,
);
