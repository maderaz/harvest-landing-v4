#!/usr/bin/env node
// Voice lint for the pages whose copy is written by hand rather than generated
// from data.
//
// The tell that a page was drafted by a machine is not one big thing, it is a
// short list of connectives and stock nouns that no person reaches for twice
// in the same article. They are cheap to ban and the prose is better without
// them.
//
// Separate from check-banned-words.mjs on purpose. That gate polices financial
// claims across the product pages and bans "deposit", "returns" and "capital",
// which a page about casino bonuses cannot write around. This one polices
// register, on a much smaller page set.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(path.resolve(__dirname, ".."), "public");

const PAGES = ["crypto-casinos"];

const BANNED = [
  { name: "rather than", re: /\brather than\b/i },
  { name: "that said", re: /\bthat said\b/i },
  { name: "moreover / furthermore", re: /\b(moreover|furthermore)\b/i },
  { name: "it's worth noting", re: /\bit(?:'|’)?s worth noting\b/i },
  { name: "when it comes to", re: /\bwhen it comes to\b/i },
  { name: "in today's", re: /\bin today(?:'|’)?s\b/i },
  { name: "look no further", re: /\blook no further\b/i },
  { name: "whether you're X or Y", re: /\bwhether you(?:'|’)?re\b[^.]{0,60}\bor\b/i },
  { name: "delve", re: /\bdelv(?:e|es|ing)\b/i },
  { name: "navigate the", re: /\bnavigat(?:e|ing) the\b/i },
  { name: "landscape / realm / tapestry", re: /\b(landscape|realm|tapestry)\b/i },
  { name: "seamless", re: /\bseamless(?:ly)?\b/i },
  { name: "robust", re: /\brobust\b/i },
  { name: "leverage (verb)", re: /\bleverag(?:e|es|ed|ing)\b/i },
  { name: "unlock", re: /\bunlock(?:s|ed|ing)?\b/i },
  { name: "elevate", re: /\belevat(?:e|es|ed|ing)\b/i },
  { name: "dive into", re: /\bdiv(?:e|es|ing) into\b/i },
  { name: "game-changer", re: /\bgame[\s-]?chang(?:er|ing)\b/i },
  { name: "a testament to", re: /\ba testament to\b/i },
  { name: "not just X, but Y", re: /\bnot just\b[^.]{0,50},?\s+but\b/i },
  { name: "em dash", re: /—/ },

  // The second list. Not stock phrases this time but a rhythm: the same
  // sentence engine reused every eighty words until the page reads as one
  // voice explaining its own method. Each of these was on the page more than
  // once before it was banned.
  {
    name: "X is not Y, it is Z",
    re: /\b(?:is|are) not (?:money|cash|a forecast|a prediction)\b[^.]{0,40}\.\s+(?:It|They) (?:is|are)\b/i,
  },
  {
    name: "a larger headline, not a better venue",
    re: /\bnot a better venue\b/i,
  },
  {
    name: "the part nobody writes about",
    re: /\bnobody writes about\b/i,
  },
  {
    name: "rarer than it sounds",
    re: /\brarer than it (?:sounds|looks)\b/i,
  },
  {
    name: "the odd part is",
    re: /\bthe odd part is\b/i,
  },
  {
    name: "that single change",
    re: /\bthat single change\b/i,
  },
  {
    name: "doing less work than it looks like",
    re: /\bdoing less work\b/i,
  },
  {
    name: "which is the difference this page exists to make",
    re: /\bexists to (?:make|be different)\b/i,
  },
];

// Everything a reader never sees, plus everything that is data rather than
// prose. A table cell printing "—" for a missing value is not an em dash in a
// sentence, and a bonus headline is the venue's wording and not ours. Mark
// those containers with data-voice-skip; the strip counts nesting so it stops
// at the matching close tag and not at the first one it meets.
function stripSkipped(html) {
  const open = /<(\w+)[^>]*\sdata-voice-skip[^>]*>/i;
  let out = html;
  for (;;) {
    const m = open.exec(out);
    if (!m) return out;
    const tag = m[1];
    const scan = new RegExp(`</?${tag}\\b[^>]*>`, "gi");
    scan.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = out.length;
    for (let t = scan.exec(out); t; t = scan.exec(out)) {
      depth += t[0][1] === "/" ? -1 : 1;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    out = out.slice(0, m.index) + " " + out.slice(end);
  }
}

function visibleText(html) {
  return stripSkipped(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&rsquo;|&#8217;/g, "’")
    .replace(/&mdash;/g, "—")
    .replace(/\s+/g, " ");
}

function excerpt(text, index, len) {
  const from = Math.max(0, index - 45);
  const to = Math.min(text.length, index + len + 45);
  return `…${text.slice(from, to).trim()}…`;
}

const t0 = Date.now();
let findings = 0;
let scanned = 0;

for (const slug of PAGES) {
  const file = path.join(PUBLIC_DIR, `${slug}.html`);
  let html;
  try {
    html = await fs.readFile(file, "utf8");
  } catch {
    console.log(`[voice] ${slug}.html not built, skipping.`);
    continue;
  }
  scanned++;
  const text = visibleText(html);
  for (const b of BANNED) {
    const re = new RegExp(b.re.source, b.re.flags.includes("g") ? b.re.flags : b.re.flags + "g");
    for (const m of text.matchAll(re)) {
      findings++;
      console.log(`\n  /${slug}`);
      console.log(`    [X] ${b.name}`);
      console.log(`        ${excerpt(text, m.index, m[0].length)}`);
    }
  }
}

const ms = Date.now() - t0;
if (findings > 0) {
  console.log(
    `\n[VOICE] ${findings} finding(s) across ${scanned} page(s) (${ms}ms).\n` +
      `Reword and rebuild. The list lives in scripts/check-voice.mjs.\n`,
  );
  process.exit(1);
}
console.log(`[OK] voice check passed (${scanned} page(s) scanned, ${ms}ms)`);
