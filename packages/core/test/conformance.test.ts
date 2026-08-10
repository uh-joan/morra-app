// Runs every case in conformance/*.json against src/ (not dist/) — the
// corpus's own regression test. The SAME corpus is also replayed against the
// original spikes/modules/*.mjs by ../../scripts/cross-check-conformance.mjs
// to prove this port is faithful; that script can't run through vitest
// (it's a standalone Node comparison across two different runtimes/module
// systems), so it's invoked separately via `pnpm cross-check:conformance`
// at the repo root.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as core from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFORMANCE_DIR = join(HERE, "..", "conformance");

function loadCorpus(name: string): any[] {
  return JSON.parse(readFileSync(join(CONFORMANCE_DIR, name), "utf8"));
}

describe("conformance corpus: rules.json", () => {
  for (const c of loadCorpus("rules.json")) {
    it(`${c.fn}(${JSON.stringify(c.input)})`, () => {
      let actual: unknown;
      switch (c.fn) {
        case "callFromFG": actual = core.callFromFG(c.input.f, c.input.g); break;
        case "gFromCall": actual = core.gFromCall(c.input.call, c.input.f); break;
        case "wordToNumber": actual = core.wordToNumber(c.input.word); break;
        case "computeMicatioVerdict": actual = core.computeMicatioVerdict(c.input.playerFingers, c.input.playerCall, c.input.aiFingers, c.input.aiCall); break;
        default: throw new Error(`unknown fn in corpus: ${c.fn}`);
      }
      expect(actual).toEqual(c.expected);
    });
  }
});

describe("conformance corpus: commit.json", () => {
  for (const c of loadCorpus("commit.json")) {
    it(`${c.fn}(${JSON.stringify(c.input)})${c.note ? " — " + c.note : ""}`, () => {
      let actual: unknown;
      switch (c.fn) {
        case "computeCommitHash": actual = core.computeCommitHash(c.input.fingers, c.input.call, c.input.nonce); break;
        case "verifyCommitment": actual = core.verifyCommitment(c.input.fingers, c.input.call, c.input.nonce, c.input.expectedHashHex); break;
        case "sha256Hex": actual = core.sha256Hex(c.input.text); break;
        default: throw new Error(`unknown fn in corpus: ${c.fn}`);
      }
      expect(actual).toEqual(c.expected);
    });
  }
});

// classifyHandSettleForSync's corpus entries were removed (Feature 1, the
// throw-of-1 fix — see apps/web/PARITY.md's divergence section): the spike
// still silently reset a fist(<=1)+no-voice settle, deleting the throw;
// apps/web's port now treats it as a real throw. That's a deliberate,
// authorized divergence from the frozen spike oracle, so the function no
// longer belongs in a corpus whose whole point is spike-identical values —
// it keeps its own direct unit tests in scorer.test.ts instead.
describe("conformance corpus: scorer.json", () => {
  for (const c of loadCorpus("scorer.json")) {
    it(`${c.fn}(${JSON.stringify(c.input)})`, () => {
      let actual: unknown;
      switch (c.fn) {
        case "classifySyncThrow": actual = core.classifySyncThrow(c.input.handOnsetPerfTime, c.input.voiceOnsetPerfTime, c.input.coOccurrenceMs); break;
        case "shouldRevealPhase1": actual = core.shouldRevealPhase1(c.input.fingerCount); break;
        case "isOrphanVoiceOnset": actual = core.isOrphanVoiceOnset(c.input.voicePerfTime, c.input.handOnsetPerfTimes, c.input.partnerWindowMs); break;
        default: throw new Error(`unknown fn in corpus: ${c.fn}`);
      }
      expect(actual).toEqual(c.expected);
    });
  }
});

describe("conformance corpus: ai.json (fixed rng sequence + history -> exact decision)", () => {
  for (const c of loadCorpus("ai.json")) {
    it(c.caseId ?? `${c.fn} ${c.level} hist=${c.historyId}`, () => {
      let actual: unknown;
      if (c.fn === "decideMove") {
        const random = core.createSequenceRandomSource(c.rngSequence);
        actual = core.decideMove(c.level, random, c.history, null);
      } else if (c.fn === "predictPlayerF") {
        actual = core.predictPlayerF(c.level, c.history);
      } else {
        throw new Error(`unknown fn in corpus: ${c.fn}`);
      }
      expect(actual).toEqual(c.expected);
    });
  }
});
