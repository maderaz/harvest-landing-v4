#!/usr/bin/env node
// Self-test for the sharded ledger walk, against an in-memory Clio.
//
// The walk splits the key space at existing keys and pages each shard with
// exclusive markers. An off-by-one at a boundary would drop or double-count one
// object per shard, ~48 accounts out of 8 million, which no reconciliation
// would notice. So the partition is checked here: every object exactly once,
// through failed requests, deleted keys, a time budget and a resume from the
// saved markers. Then a shard that can never succeed must fail the walk rather
// than retry forever.
//
//   node scripts/check-xrpl-walk.mjs

import { createHash } from "node:crypto";
import { planShards, walkLedger } from "./lib/xrpl.mjs";

let failed = 0;
const ok = (name, cond, detail = "") => {
  if (!cond) failed++;
  console.error(`  ${cond ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

const LEDGER = 1000;
const key = (i) => createHash("sha256").update(String(i)).digest("hex").toUpperCase();

// Clio pages over its key index, which still holds keys deleted in the pinned
// ledger. It drops those objects from a page, but when one falls in the last
// slot it returns that key as the marker anyway, then rejects it as a marker
// (markerDoesNotExist). Observed on mainnet ledger 107466542. Every tenth key
// here is deleted, so many pages end on one.
const INDEX = Array.from({ length: 33_000 }, (_, i) => key(i)).sort();
const POS = new Map(INDEX.map((k, i) => [k, i]));
const EXISTS = new Set(INDEX.filter((_, i) => i % 10 !== 7));

let requests = 0;
let failEvery = 0;
let poisoned = null;
globalThis.fetch = async (_url, init) => {
  requests++;
  const { method, params } = JSON.parse(init.body);
  const p = params[0];
  const reply = (result) => ({ ok: true, status: 200, json: async () => ({ result }) });
  if (failEvery && requests % failEvery === 0) {
    return requests % 2
      ? { ok: false, status: 503, json: async () => ({}) }
      : reply({ error: "tooBusy", error_message: "load", status: "error" });
  }
  if (method === "ledger_entry") {
    return reply(EXISTS.has(p.index) ? { node_binary: "00", ledger_index: LEDGER } : { error: "entryNotFound", status: "error" });
  }
  if (method === "ledger_data") {
    let from = 0;
    if (p.marker != null) {
      if (!EXISTS.has(p.marker) || p.marker === poisoned) {
        return reply({ error: "invalidParams", error_message: "markerDoesNotExist", status: "error" });
      }
      from = POS.get(p.marker) + 1;
    }
    const slots = INDEX.slice(from, from + p.limit);
    const state = slots.filter((k) => EXISTS.has(k)).map((index) => ({ index, data: "00" }));
    const more = from + p.limit < INDEX.length;
    return reply({ ledger_index: LEDGER, state, ...(more ? { marker: slots[slots.length - 1] } : {}) });
  }
  return reply({ error: "unknownCmd", status: "error" });
};

console.error(`[xrpl walk self-test] ${EXISTS.size.toLocaleString()} objects, ${(INDEX.length - EXISTS.size).toLocaleString()} deleted keys`);

// Seeds: some real keys, some deleted, some never present.
const candidates = [
  ...INDEX.filter((_, i) => i % 211 === 0),
  ...Array.from({ length: 40 }, (_, i) => key(`gone-${i}`)),
];
const shards = await planShards({ ledgerIndex: LEDGER, candidateKeys: candidates, shards: 16 });
ok("shards planned", shards.length >= 12 && shards.length <= 16, `${shards.length}`);
ok("first shard starts at the beginning", shards[0].start === null);
ok("last shard runs to the end", shards[shards.length - 1].end === null);
ok("boundaries chain", shards.every((s, i) => i === 0 || s.start === shards[i - 1].end));
ok("every boundary exists", shards.slice(1).every((s) => EXISTS.has(s.start)));

const seen = new Map();
const onEntries = (entries) => {
  for (const e of entries) seen.set(e.index, (seen.get(e.index) ?? 0) + 1);
};

// A small page so shards span several pages, failures injected, and a budget
// that runs out partway through.
failEvery = 9;
const first = await walkLedger({ ledgerIndex: LEDGER, shards, onEntries, concurrency: 5, pageLimit: 300, deadline: Date.now() + 1_500 });
const partial = seen.size;
ok("budget stops the walk partway", !first.done && partial > 0 && partial < EXISTS.size, `${partial} of ${EXISTS.size}`);

// Resume from the shard state exactly as a checkpoint would carry it.
const resumed = JSON.parse(JSON.stringify(shards));
const second = await walkLedger({ ledgerIndex: LEDGER, shards: resumed, onEntries, concurrency: 5, pageLimit: 300 });
failEvery = 0;
ok("resumed walk completes", second.done);
ok("every object seen", seen.size === EXISTS.size, `${seen.size} of ${EXISTS.size}`);
const twice = [...seen.values()].filter((n) => n !== 1).length;
ok("no object seen twice", twice === 0, `${twice}`);
ok("no deleted key reported as an object", [...seen.keys()].every((k) => EXISTS.has(k)));

// A shard that fails on every request while the others succeed must stop the
// walk, not hold one stream retrying it until the time budget runs out.
{
  const fresh = await planShards({ ledgerIndex: LEDGER, candidateKeys: candidates, shards: 8 });
  poisoned = fresh[3].start;
  const t = Date.now();
  let threw = null;
  try {
    await walkLedger({ ledgerIndex: LEDGER, shards: fresh, onEntries: () => {}, concurrency: 4, pageLimit: 300, rpcTries: 1, retryDelayMs: 10 });
  } catch (e) {
    threw = e;
  }
  poisoned = null;
  ok("a permanently failing shard fails the walk", threw !== null, threw ? threw.message : "walk returned");
  ok("and does so promptly", Date.now() - t < 30_000, `${((Date.now() - t) / 1000).toFixed(1)}s`);
}

if (failed) {
  console.error(`[FAIL] xrpl walk self-test: ${failed} failure(s)`);
  process.exit(1);
}
console.error("[OK] xrpl walk self-test passed");
