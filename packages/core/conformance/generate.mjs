// Generates the conformance corpus JSON files by running the REAL built
// core (dist/) once and recording its outputs — avoids hand-computed
// arithmetic mistakes in the fixtures themselves. Run after `pnpm build`:
//   node conformance/generate.mjs
// The resulting *.json files are then the source of truth two ways:
//   1. test/conformance.test.ts re-runs src/ against them (regression test).
//   2. ../../scripts/cross-check-conformance.mjs re-runs spikes/modules/*.mjs
//      against them (proves the port is faithful to the spike).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as core from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const write = (name, data) => {
  writeFileSync(join(HERE, name), JSON.stringify(data, null, 2) + "\n");
  console.log(`wrote ${name} (${data.length} cases)`);
};

/* ------------------------------- rules.json ------------------------------ */
const rulesCases = [];
// call<->(f,g) mapping
for (const [f, g] of [[1, 1], [1, 5], [5, 1], [5, 5], [3, 4], [2, 3]]) {
  const call = core.callFromFG(f, g);
  rulesCases.push({ fn: "callFromFG", input: { f, g }, expected: call });
  rulesCases.push({ fn: "gFromCall", input: { call, f }, expected: g });
}
// Catalan vocab, incl. tot=deu=10, no "morra"
for (const word of Object.keys(core.CATALAN_NUMBER_WORDS)) {
  rulesCases.push({ fn: "wordToNumber", input: { word }, expected: core.wordToNumber(word) });
}
for (const word of ["VUIT", "Tres", " ", "morra", "onze"]) {
  rulesCases.push({ fn: "wordToNumber", input: { word }, expected: core.wordToNumber(word) });
}
rulesCases.push({ fn: "wordToNumber", input: { word: null }, expected: core.wordToNumber(null) });
// verdict truth table: player-only-correct, ai-only-correct, both-correct
// (parata), neither-correct (parata), and boundary totals (min=2, max=10)
const verdictInputs = [
  { playerFingers: 3, playerCall: 7, aiFingers: 4, aiCall: 5 }, // player only
  { playerFingers: 3, playerCall: 5, aiFingers: 4, aiCall: 7 }, // ai only
  { playerFingers: 3, playerCall: 7, aiFingers: 4, aiCall: 7 }, // both correct -> parata
  { playerFingers: 3, playerCall: 5, aiFingers: 4, aiCall: 6 }, // neither -> parata
  { playerFingers: 1, playerCall: 2, aiFingers: 1, aiCall: 3 }, // boundary total=2 (min)
  { playerFingers: 5, playerCall: 10, aiFingers: 5, aiCall: 9 }, // boundary total=10 (max)
];
for (const input of verdictInputs) {
  rulesCases.push({ fn: "computeMicatioVerdict", input, expected: core.computeMicatioVerdict(input.playerFingers, input.playerCall, input.aiFingers, input.aiCall) });
}
write("rules.json", rulesCases);

/* ------------------------------ commit.json ------------------------------ */
const commitCases = [];
const commitInputs = [
  { fingers: 3, call: 7, nonce: "deadbeef" },
  { fingers: 1, call: 2, nonce: "0000" },
  { fingers: 5, call: 10, nonce: "ffffffffffffffffffffffffffffffff" },
  { fingers: 3, call: 7, nonce: "" }, // empty nonce — degenerate but must still hash deterministically
];
for (const input of commitInputs) {
  const hashHex = core.computeCommitHash(input.fingers, input.call, input.nonce);
  commitCases.push({ fn: "computeCommitHash", input, expected: hashHex });
  commitCases.push({ fn: "verifyCommitment", input: { ...input, expectedHashHex: hashHex }, expected: true });
  commitCases.push({ fn: "verifyCommitment", input: { ...input, call: input.call + 1, expectedHashHex: hashHex }, expected: false, note: "tampered call" });
  commitCases.push({ fn: "verifyCommitment", input: { ...input, nonce: input.nonce + "x", expectedHashHex: hashHex }, expected: false, note: "tampered nonce" });
}
// raw hash format cases (known test vectors) — proves the ${fingers}|${call}|${nonce} format itself
commitCases.push({ fn: "sha256Hex", input: { text: "hello" }, expected: core.sha256Hex("hello") });
commitCases.push({ fn: "sha256Hex", input: { text: "" }, expected: core.sha256Hex("") });
write("commit.json", commitCases);

/* ------------------------------ scorer.json ------------------------------ */
const scorerCases = [];
for (const [handOnsetPerfTime, voiceOnsetPerfTime, coOccurrenceMs] of [
  [1000, 1050, 400], [1000, 1600, 400], [1000, 400, 400], [1000, null, 400], [1000, 1400, 400],
]) {
  scorerCases.push({
    fn: "classifySyncThrow", input: { handOnsetPerfTime, voiceOnsetPerfTime, coOccurrenceMs },
    expected: core.classifySyncThrow(handOnsetPerfTime, voiceOnsetPerfTime, coOccurrenceMs),
  });
}
for (const [fingerCount, voiceOnsetPerfTime] of [[0, null], [1, null], [0, 123], [1, 123], [3, null], [3, 123], [5, null]]) {
  scorerCases.push({
    fn: "classifyHandSettleForSync", input: { fingerCount, voiceOnsetPerfTime },
    expected: core.classifyHandSettleForSync(fingerCount, voiceOnsetPerfTime),
  });
}
for (const fingerCount of [0, 1, 2, 3, 4, 5, null]) {
  scorerCases.push({ fn: "shouldRevealPhase1", input: { fingerCount }, expected: core.shouldRevealPhase1(fingerCount) });
}
for (const [voicePerfTime, handOnsetPerfTimes, partnerWindowMs] of [
  [5000, [1000, 2000], 500], [2100, [1000, 2000], 500],
]) {
  scorerCases.push({
    fn: "isOrphanVoiceOnset", input: { voicePerfTime, handOnsetPerfTimes, partnerWindowMs },
    expected: core.isOrphanVoiceOnset(voicePerfTime, handOnsetPerfTimes, partnerWindowMs),
  });
}
write("scorer.json", scorerCases);

/* -------------------------------- ai.json --------------------------------
 * "fixed rng sequence + history -> exact decision, per level" (M1 ask).
 * rngSequence values are replayed cyclically by createSequenceRandomSource.
 * ------------------------------------------------------------------------- */
const aiCases = [];
function historyEntry(partial) {
  return { playerFingers: null, playerCall: null, aiFingers: null, aiCall: null, verdictWinner: null, ...partial };
}
const historyA = [
  historyEntry({ throwIndex: 1, playerFingers: 3, playerCall: 7, aiFingers: 2, aiCall: 5, verdictWinner: "player" }),
  historyEntry({ throwIndex: 2, playerFingers: 5, playerCall: 8, aiFingers: 3, aiCall: 6, verdictWinner: "ai" }),
  historyEntry({ throwIndex: 3, playerFingers: 5, playerCall: 9, aiFingers: 1, aiCall: 4, verdictWinner: "parata" }),
];
const rngSequences = [
  [0.05, 0.5, 0.95],
  [0.2, 0.8],
  [0.99, 0.01, 0.5, 0.33],
];
for (const level of core.LEVEL_ORDER) {
  for (const [seqIdx, seq] of rngSequences.entries()) {
    for (const [histIdx, history] of [[], historyA].entries()) {
      const random = core.createSequenceRandomSource(seq);
      const move = core.decideMove(level, random, history, null);
      aiCases.push({ fn: "decideMove", level, rngSequence: seq, historyId: histIdx === 0 ? "empty" : "A", history, expected: move, caseId: `${level}-seq${seqIdx}-hist${histIdx}` });
    }
  }
}
// predictPlayerF determinism (no rng at all)
for (const level of core.LEVEL_ORDER) {
  for (const [histIdx, history] of [[], historyA].entries()) {
    aiCases.push({ fn: "predictPlayerF", level, historyId: histIdx === 0 ? "empty" : "A", history, expected: core.predictPlayerF(level, history) });
  }
}
write("ai.json", aiCases);

console.log("\nConformance corpus regenerated.");
