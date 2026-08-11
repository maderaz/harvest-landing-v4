#!/usr/bin/env node
// Build gate for atomically-quotable prose on the report and hub pages.
//
// Why this exists, and why it is separate from check-page-consistency:
// answer engines lift SENTENCES, not pages. A sentence that stops being true
// or comprehensible once separated from its neighbours cannot be cited, so it
// is not. check-page-consistency asks "do the numbers on this page agree with
// each other"; this asks "does each sentence survive being cut out".
//
// Scope note that matters: check-banned-words and check-page-consistency both
// walk data/vaults.json and lint public/<slug>.html, so they cover the 156+
// product pages and NOTHING else. The reports and hubs, which carry the most
// hand-written prose on the site, had no lint coverage at all. This gate
// covers exactly those.
//
// Rules, chosen because they catch mechanical, repetitive misses that a human
// review reliably misses while doing well on judgment calls. Numbering follows
// the writing spec so a finding can be traced back to the rule that fired.
//
//   1.  Undated figures   - a retrieved sentence with a number and no date is
//                           unattributable months later. Satisfied either by a
//                           date in the sentence or by a section dateline; see
//                           data-dateline below.
//   2.  Orphaned openers  - a sentence whose subject sits in the previous
//                           sentence is dead the moment it is lifted.
//   3.  Temporal deixis   - "today" and "currently" beside a figure, in a
//                           sentence a model may retrieve months later.
//   7.  Entity density    - the opposite failure: naming the brand in every
//                           sentence reads as keyword stuffing.
//   11. onchain           - house rule, one word.
//   13. Bullet fragments  - a list item that parses as a noun phrase belongs
//                           in a table. The parent heading supplies the
//                           grammar and the writer stops noticing.
//   14. Bullet density    - list items over 40% of body words reads as thin.
//
// Usage:
//   node scripts/check-atomicity.mjs            lint the built pages
//   node scripts/check-atomicity.mjs --self-test verify the rules still bite

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PUBLIC = join(ROOT, "public");

// Pages this gate owns. Product pages are deliberately excluded: their prose is
// generated from templates already covered by check-page-consistency, and the
// date rule would fire on every generated rank sentence.
const PAGES = [
  "report/xrp-yield-ranking",
  "xrp-rich-list",
  "report/aerodrome",
  "polygon",
  "ethereum",
  "base",
  "arbitrum",
  "zksync",
  "hyperevm",
  "usdc",
  "usdt",
  "eth",
  "btc",
  "aave",
  "morpho",
];

const ENTITY_CAP = 10;
// Spec caps 4 and 14: list items as a share of body words.
const BULLET_SHARE_CAP = 0.4;

// Spec rule 3. Fires only alongside a digit, because "currently tracked" in
// explanatory prose is fine; "3.96% currently" is not.
const TEMPORAL_DEIXIS =
  /\b(today|right now|currently|recently|at present|these days)\b/i;

// Spec rule 13. A finite verb is the cheap test for "is this a sentence".
// Listing the auxiliaries and the common copulas catches the fragment shape
// without a POS tagger; the -ed/-s endings catch most simple past and present.
const FINITE_VERB =
  /\b(is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must|pays?|holds?|earns?|runs?|sits?|comes?|makes?|takes?|gives?|needs?|counts?|carries|carry|ranks?|reads?|shows?|means?|works?|goes?|lets?|puts?|keeps?|stays?|moves?|adds?|offers?|tracks?|covers?|uses?|owns?|gets?|sets?|depends?|reached?|ranged?|grew|rose|fell|stood|placed?|held)\b|\b\w+(ed|es)\b/i;

// Pages held to the gate. Everything else in PAGES is reported as a warning so
// the backlog stays visible without blocking the build. Move a page here once
// its prose has been brought up to spec.
const ENFORCED = new Set(["report/xrp-yield-ranking", "xrp-rich-list", "usdc"]);

// A date token is "as of", a month name, or a four-digit year.
const DATE_TOKEN =
  /\bas of\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\b|\b20\d{2}\b/i;

// A section may carry its date once, on a dateline, instead of on every
// sentence inside it.
//
// The per-sentence form of rule 1 is what makes a lifted sentence survive, and
// it is worth keeping for the sentences that actually get lifted. Applied to a
// whole long-form page it produces something else: /usdc reached 29 separate
// renderings of "as of August 2, 2026" in running prose, which reads as
// templated filler to a human and wastes embedding capacity on a chunker that
// already carries the section's context. Two independent model reviews of the
// live page raised it unprompted.
//
// So a digit-bearing sentence is satisfied by a date of its own OR by a date on
// its enclosing section. The exemption is opt-in and self-enforcing: the
// dateline element must print a real date, checked with the same DATE_TOKEN, so
// marking a section dated without dating it does nothing.
//
// The hero sits outside any <section> and therefore keeps the per-sentence rule
// unconditionally, which is the right way round: the answer sentence is the one
// most likely to be quoted alone.
const DATELINE_EL = /<([a-z]+)\b[^>]*\sdata-dateline(?:=["'][^"']*["'])?[^>]*>([\s\S]*?)<\/\1>/gi;

// Digits that are not measurements: contract addresses, ratios, version
// strings, protocol names that contain numerals, and standard token/licence
// identifiers. Sentences matching these are exempt unless they also carry a
// currency or percentage figure.
const ALLOW_DIGIT =
  /0x[0-9a-f]{6,}|\b1:1\b|\b\d+(\.\d+)?x\b|\bv\d+(\.\d+)?\b|ve\(3,3\)|\bERC-\d+\b|\bSPL\b|\bCC-BY-[\d.]+\b|\b\d+-day\b|\b\d+-hour\b|\bUniswap v\d\b|\bFTSOv\d\b/i;

const ORPHAN_OPENER =
  /^(Those|These|This|That|It|They|Their|Its|Neither|Both|Each|Such|The former|The latter)\b/;

// "This report" / "This page" / "This ranking" are self-referential rather than
// back-references: the antecedent is the document itself, which travels with
// any excerpt. Same for existential "There are".
const ORPHAN_EXEMPT =
  /^(This (report|page|ranking|section)|There (is|are|were|was)|Neither\s+\S.*\bnor\b|Both\s+\S.*\band\b)/;

/**
 * Remove every element matching `open`, up to its own matching `</div>`.
 *
 * Depth-counted rather than regex-terminated. A self-closing `<div/>` is not
 * valid HTML and React never emits one, so every `<div` opens a level. An
 * unbalanced opener (truncated HTML) removes the remainder, which fails loudly
 * on the next rule rather than silently keeping unlinted prose.
 */
function stripBalancedDivs(html, open) {
  let out = "";
  let cursor = 0;
  open.lastIndex = 0;
  let m;
  while ((m = open.exec(html))) {
    if (m.index < cursor) continue;
    out += html.slice(cursor, m.index);
    let depth = 1;
    let i = m.index + m[0].length;
    const tag = /<div\b|<\/div\s*>/gi;
    tag.lastIndex = i;
    let t;
    while (depth > 0 && (t = tag.exec(html))) {
      depth += t[0][1] === "/" ? -1 : 1;
      i = t.index + t[0].length;
    }
    cursor = depth > 0 ? html.length : i;
    open.lastIndex = cursor;
  }
  return out + html.slice(cursor);
}

function stripChrome(html) {
  let h = html;
  for (const re of [
    /<script[\s\S]*?<\/script>/gi,
    /<style[\s\S]*?<\/style>/gi,
    /<svg[\s\S]*?<\/svg>/gi,
    /<header[\s\S]*?<\/header>/gi,
    /<footer[\s\S]*?<\/footer>/gi,
    /<nav[\s\S]*?<\/nav>/gi,
    /<table[\s\S]*?<\/table>/gi,
    /<!-- -->/g,
  ]) {
    h = h.replace(re, "");
  }
  // Tables rendered as divs carry data-nosnippet; the spec exempts table
  // content from the digit rule, so anything inside one is out of scope.
  //
  // This used to end the strip at the first `</div></div>` pair, which is a
  // guess at nesting depth rather than a close. On /xrp-rich-list that guess
  // ran 42,000 characters past the element it was meant to remove and took two
  // whole sections of prose with it, so the linter was blind to them and said
  // the page passed. It was caught by accident: turning four cards from <div>
  // into <a> moved where the pair happened to appear, and three real findings
  // surfaced in copy nobody had changed. A strip that silences the gate has to
  // know where the element ends, so this one counts.
  h = stripBalancedDivs(h, /<div[^>]*\bdata-nosnippet\b[^>]*>/gi);
  // Interface chrome that happens to use prose tags: chart legends, stat-card
  // value lists, key/value pairs inside a card. The spec exempts table cells
  // and stat cards from the digit rule and exempts label lists from the
  // fragment rule, and this is how an element declares it is one of those.
  // It is an opt-out for non-prose, not for prose that would rather not be
  // linted: everything marked here must have a prose twin elsewhere.
  h = h.replace(/<(ul|ol|dl|div)[^>]*data-lint="chrome"[^>]*>[\s\S]*?<\/\1>/gi, "");
  return h;
}

function text(s) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;|&#x27;|&#39;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Sentence split that does not break on "$45.2M", "3.96%" or "v3.1".
function sentences(t) {
  return t
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Split the page into section-sized chunks and say which of them are dated.
 *
 * Lookahead split rather than a matched <section>...</section> pair, because a
 * backreference regex mis-terminates on nesting and these pages hold their
 * sections as flat siblings. Chunk 0 is everything before the first <section>,
 * which is the hero.
 *
 * A nested section would start its chunk early and leave the outer remainder
 * undated, so the failure mode is a false positive that breaks the build
 * loudly rather than a false negative that lets an undated figure through.
 */
function sections(html) {
  return html.split(/(?=<section\b)/i).map((chunk) => {
    let dated = false;
    for (const m of chunk.matchAll(DATELINE_EL)) {
      if (DATE_TOKEN.test(text(m[2]))) {
        dated = true;
        break;
      }
    }
    return { html: chunk, dated };
  });
}

function blocks(html) {
  const out = [];
  for (const sec of sections(html)) {
    for (const m of sec.html.matchAll(/<(p|li|dd|summary)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const inner = m[2];
      // Skip wrappers that contain other blocks; the inner ones are matched too.
      if (/<(p|li|dd)\b/i.test(inner)) continue;
      const t = text(inner);
      if (t.length > 2) out.push({ tag: m[1].toLowerCase(), text: t, sectionDated: sec.dated });
    }
  }
  return out;
}

export function lint(html, { entityCap = ENTITY_CAP } = {}) {
  const h = stripChrome(html);
  const bs = blocks(h);
  const findings = [];

  for (const b of bs) {
    const ss = sentences(b.text);
    ss.forEach((s, i) => {
      // Rule 1: undated figures. Fires on any digit, not just % or $, because
      // "5 of the 14" carries neither and is exactly the case this catches.
      //
      // Questions are exempt. An interrogative asserts nothing, so there is no
      // measurement to date, and the FAQ headings that carry a figure are
      // deliberately verbatim from the People Also Ask block. Rewriting "How
      // many XRP holders have 10,000 or more?" to carry a date would break the
      // exact match the heading exists for. The ANSWER underneath still has to
      // pass, which is where the claim actually lives.
      if (
        /\d/.test(s) &&
        !DATE_TOKEN.test(s) &&
        !b.sectionDated &&
        !s.trimEnd().endsWith("?")
      ) {
        const money = /[%$]/.test(s);
        if (money || !ALLOW_DIGIT.test(s)) {
          findings.push({ rule: "undated-figure", where: b.tag, text: s });
        }
      }
      // Rule 2: orphaned openers, first sentence of a block only. A pronoun
      // mid-paragraph is normal writing; a pronoun opening the block is a
      // back-reference to something an excerpt will not include.
      if (i === 0 && ORPHAN_OPENER.test(s) && !ORPHAN_EXEMPT.test(s)) {
        findings.push({ rule: "orphan-opener", where: b.tag, text: s });
      }
      // Rule 3: temporal deixis. "Today" in a sentence carrying a figure is
      // a claim that expires the moment the page is retrieved later.
      if (/\d/.test(s) && TEMPORAL_DEIXIS.test(s)) {
        findings.push({ rule: "temporal-deixis", where: b.tag, text: s });
      }
    });

    // Rule 13: bullet fragments. Checked on the whole item rather than per
    // sentence, because a fragment is exactly the case with no sentence in it.
    if (b.tag === "li" && !FINITE_VERB.test(b.text) && /[a-z]/i.test(b.text)) {
      findings.push({ rule: "bullet-fragment", where: b.tag, text: b.text });
    }
  }

  // Rule 11: house spelling.
  {
    const body = bs.map((b) => b.text).join(" ");
    if (/\bon-chain\b/i.test(body)) {
      findings.push({
        rule: "on-chain",
        where: "page",
        text: "\"on-chain\" appears in body prose; the house spelling is \"onchain\"",
      });
    }
  }

  // Rule 14: bullet density. Heavy list formatting with little connective
  // prose reads as low-effort, and these pages are already table-dense.
  {
    const words = (t) => t.split(/\s+/).filter(Boolean).length;
    const total = bs.reduce((n, b) => n + words(b.text), 0);
    const inLists = bs.filter((b) => b.tag === "li").reduce((n, b) => n + words(b.text), 0);
    if (total > 0 && inLists / total > BULLET_SHARE_CAP) {
      findings.push({
        rule: "bullet-density",
        where: "page",
        text: `${Math.round((inLists / total) * 100)}% of body words sit in list items, over the ${Math.round(BULLET_SHARE_CAP * 100)}% cap`,
      });
    }
  }

  // Rule 7: entity density.
  const body = bs.map((b) => b.text).join(" ");
  const entity = (body.match(/\bHarvest'?s?\b/g) || []).length;
  if (entity > entityCap) {
    findings.push({
      rule: "entity-density",
      where: "page",
      text: `${entity} mentions of "Harvest" exceeds the cap of ${entityCap}`,
    });
  }

  return { findings, entity, blocks: bs.length };
}

function selfTest() {
  const cases = [
    ["<p>Rates ranged from 1% to 5% with a median of 2%.</p>", "undated-figure", true],
    ["<p>Rates ranged from 1% to 5% as of July 27, 2026.</p>", "undated-figure", false],
    ["<p>5 of the 14 products depended on emissions.</p>", "undated-figure", true],
    ["<p>FXRP is a 1:1 ERC-20 on Flare.</p>", "undated-figure", false],
    ["<p>Those figures are mostly reward emissions.</p>", "orphan-opener", true],
    ["<p>This report focuses on DeFi instead.</p>", "orphan-opener", false],
    ["<p>There are two ways to trade XRP yield.</p>", "orphan-opener", false],
    // Pattern 10 REQUIRES the closing comparative to name both sides, so this
    // is the fixed form and must pass. The bare version below must still fire.
    ["<p>Neither centralized nor DeFi yield is safer.</p>", "orphan-opener", false],
    ["<p>Neither is strictly safer than the other.</p>", "orphan-opener", true],
    ["<p>Both are wrapped XRP, but the trust model differs.</p>", "orphan-opener", true],
    [`<p>${"Harvest ".repeat(12)}</p>`, "entity-density", true],
    ["<p>Harvest tracks these products.</p>", "entity-density", false],
    // A question carries no claim, so there is nothing to date. The answer
    // beneath it is still held to the rule.
    ["<summary>How many holders have 10,000 or more?</summary>", "undated-figure", false],
    ["<p>10,000 holders qualified.</p>", "undated-figure", true],
    // Rule 1, section-dateline form. A dated section covers its own prose,
    // a dateline with no date in it covers nothing, and prose outside every
    // section is never covered.
    [
      '<section><p data-dateline>August 2, 2026</p><p>The median was 4.13%.</p></section>',
      "undated-figure",
      false,
    ],
    [
      '<section><p data-dateline>Composition</p><p>The median was 4.13%.</p></section>',
      "undated-figure",
      true,
    ],
    [
      '<p>The median was 4.13%.</p><section><p data-dateline>August 2, 2026</p></section>',
      "undated-figure",
      true,
    ],
    // A dateline does not license the other rules. Deixis beside a figure is
    // still a claim that expires on retrieval.
    [
      '<section><p data-dateline>August 2, 2026</p><p>The median is currently 4.13%.</p></section>',
      "temporal-deixis",
      true,
    ],
  ];
  let failed = 0;
  for (const [html, rule, shouldFire] of cases) {
    const { findings } = lint(html);
    const fired = findings.some((f) => f.rule === rule);
    if (fired !== shouldFire) {
      failed++;
      console.error(
        `  [self-test] ${rule} expected ${shouldFire ? "fire" : "pass"}: ${html.slice(0, 70)}`,
      );
    }
  }
  if (failed) {
    console.error(`[FAIL] check-atomicity self-test: ${failed}/${cases.length} case(s) wrong`);
    process.exit(1);
  }
  console.log(`[OK] check-atomicity self-test passed (${cases.length} cases)`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  const started = Date.now();
  let scanned = 0;
  const all = [];
  for (const page of PAGES) {
    const file = join(PUBLIC, `${page}.html`);
    if (!existsSync(file)) continue;
    scanned++;
    const { findings } = lint(readFileSync(file, "utf-8"));
    for (const f of findings) all.push({ page, ...f });
  }

  if (all.length === 0) {
    console.log(
      `[OK] atomicity check passed (${scanned} page(s) scanned, 0 findings, ${Date.now() - started}ms)`,
    );
    return;
  }

  const blocking = all.filter((f) => ENFORCED.has(f.page));
  const warned = all.filter((f) => !ENFORCED.has(f.page));
  const dump = (items, log) => {
    const byPage = {};
    for (const f of items) (byPage[f.page] ||= []).push(f);
    for (const [page, list] of Object.entries(byPage)) {
      log(`  /${page}`);
      for (const f of list) log(`    ${f.rule} <${f.where}> ${f.text.slice(0, 150)}`);
      log("");
    }
  };

  if (warned.length) {
    console.log(
      `[warn] atomicity: ${warned.length} finding(s) on pages not yet enforced\n`,
    );
    dump(warned, console.log);
  }

  if (blocking.length === 0) {
    console.log(
      `[OK] atomicity check passed (${ENFORCED.size} enforced page(s), ${scanned} scanned, ${Date.now() - started}ms)`,
    );
    return;
  }

  console.error(`[FAIL] atomicity check: ${blocking.length} finding(s) on enforced page(s)\n`);
  dump(blocking, console.error);
  process.exit(1);
}

main();
