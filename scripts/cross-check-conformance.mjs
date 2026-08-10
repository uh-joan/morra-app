#!/usr/bin/env node
// Cross-check: replays packages/core/conformance/*.json against the
// ORIGINAL spikes/modules/*.mjs (the untouched regression oracle — never
// modified by the M1 port) and asserts identical outputs to what
// packages/core/src/ produces for the same corpus (already checked by
// packages/core/test/conformance.test.ts). If this script finds a
// discrepancy, THE SPIKE IS THE TRUTH — fix the port, not the spike.
//
// Two real behavioral differences are accounted for, not treated as bugs:
//   - the spike's sha256Hex/computeCommitHash/verifyCommitment are ASYNC
//     (crypto.subtle); the port's are sync (@noble/hashes). Same VALUES,
//     different calling convention — this script awaits both sides.
//   - the spike's decideMove takes a bare `rng` closure; the port takes a
//     RandomSource port object. This script only ever calls the SPIKE side
//     (wrapping the corpus's `rngSequence` into a bare cycling closure) —
//     the port's own correctness against the corpus is already covered by
//     packages/core/test/conformance.test.ts, so this script's only job is
//     spike-output === corpus.expected.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const CONFORMANCE_DIR = join(REPO_ROOT, "packages", "core", "conformance");
const SPIKE_MODULES_DIR = join(REPO_ROOT, "spikes", "modules");

const Rules = await import(join(SPIKE_MODULES_DIR, "rules.mjs"));
const Commit = await import(join(SPIKE_MODULES_DIR, "commit.mjs"));
const Scorer = await import(join(SPIKE_MODULES_DIR, "scorer.mjs"));
const Ai = await import(join(SPIKE_MODULES_DIR, "ai.mjs"));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL - ${name}${detail !== undefined ? " :: " + JSON.stringify(detail) : ""}`); }
}

async function loadCorpus(name) {
  return JSON.parse(await readFile(join(CONFORMANCE_DIR, name), "utf8"));
}

// deep-equal good enough for these plain JSON-shaped values (numbers,
// strings, booleans, null, plain objects/arrays) — everything in this
// corpus round-trips through JSON already.
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return a === b;
  if (typeof a !== "object") return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual(a[k], b[k]));
}

/* -------------------------------- rules.json -------------------------------- */
for (const c of await loadCorpus("rules.json")) {
  let actual;
  switch (c.fn) {
    case "callFromFG": actual = Rules.callFromFG(c.input.f, c.input.g); break;
    case "gFromCall": actual = Rules.gFromCall(c.input.call, c.input.f); break;
    case "wordToNumber": actual = Rules.wordToNumber(c.input.word); break;
    case "computeMicatioVerdict": actual = Rules.computeMicatioVerdict(c.input.playerFingers, c.input.playerCall, c.input.aiFingers, c.input.aiCall); break;
    default: throw new Error(`unknown fn: ${c.fn}`);
  }
  check(`rules.${c.fn}(${JSON.stringify(c.input)})`, deepEqual(actual, c.expected), { actual, expected: c.expected });
}

/* -------------------------------- commit.json -------------------------------- */
// spike's commit.mjs is async (crypto.subtle) — the core port is sync
// (@noble/hashes) but produces identical hash VALUES; awaiting a non-promise
// on the port side elsewhere is a no-op, so this is a value-only comparison.
for (const c of await loadCorpus("commit.json")) {
  let actual;
  switch (c.fn) {
    case "computeCommitHash": actual = await Commit.computeCommitHash(c.input.fingers, c.input.call, c.input.nonce); break;
    case "verifyCommitment": actual = await Commit.verifyCommitment(c.input.fingers, c.input.call, c.input.nonce, c.input.expectedHashHex); break;
    case "sha256Hex": actual = await Commit.sha256Hex(c.input.text); break;
    default: throw new Error(`unknown fn: ${c.fn}`);
  }
  check(`commit.${c.fn}(${JSON.stringify(c.input)})${c.note ? " — " + c.note : ""}`, deepEqual(actual, c.expected), { actual, expected: c.expected });
}

/* -------------------------------- scorer.json --------------------------------
 * classifyHandSettleForSync is DELIBERATELY EXCLUDED from this corpus as of
 * the throw-of-1 fix (post-migration apps/web product evolution — see
 * apps/web/PARITY.md's divergence section): the spike still silently
 * classifies a fist(<=1)+no-voice settle as a reset (deleting the throw);
 * apps/web's port now treats it as a real throw of 1, by design. The spike
 * is intentionally NOT updated (it's the frozen regression oracle), so this
 * one function can no longer be value-identical to it — that's expected,
 * not a discrepancy to chase. */
for (const c of await loadCorpus("scorer.json")) {
  let actual;
  switch (c.fn) {
    case "classifySyncThrow": actual = Scorer.classifySyncThrow(c.input.handOnsetPerfTime, c.input.voiceOnsetPerfTime, c.input.coOccurrenceMs); break;
    case "shouldRevealPhase1": actual = Scorer.shouldRevealPhase1(c.input.fingerCount); break;
    case "isOrphanVoiceOnset": actual = Scorer.isOrphanVoiceOnset(c.input.voicePerfTime, c.input.handOnsetPerfTimes, c.input.partnerWindowMs); break;
    default: throw new Error(`unknown fn: ${c.fn}`);
  }
  check(`scorer.${c.fn}(${JSON.stringify(c.input)})`, deepEqual(actual, c.expected), { actual, expected: c.expected });
}

/* ----------------------------------- ai.json -----------------------------------
 * The spike's decideMove takes a bare `rng: () => number` closure (default
 * Math.random) — never Math.random here, always the corpus's fixed
 * rngSequence, cycled the same way createSequenceRandomSource does. */
function bareSequenceRng(sequence) {
  let i = 0;
  return () => sequence[i++ % sequence.length];
}
for (const c of await loadCorpus("ai.json")) {
  let actual;
  if (c.fn === "decideMove") {
    const rng = bareSequenceRng(c.rngSequence);
    actual = Ai.decideMove(c.level, rng, c.history, null);
  } else if (c.fn === "predictPlayerF") {
    actual = Ai.predictPlayerF(c.level, c.history);
  } else {
    throw new Error(`unknown fn: ${c.fn}`);
  }
  check(`ai.${c.fn} ${c.caseId ?? c.level + " " + (c.historyId ?? "")}`, deepEqual(actual, c.expected), { actual, expected: c.expected });
}

console.log(`\nCross-check (spike spikes/modules/*.mjs vs packages/core conformance corpus): ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nA discrepancy means the port drifted from the spike. THE SPIKE IS THE TRUTH — fix packages/core/src/, never spikes/.");
}
process.exit(fail ? 1 : 0);
