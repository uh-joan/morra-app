// Ported from spikes/modules/test.mjs's "playermodel.mjs" section — pure
// functions only. loadModel/saveModel/clearModel are NOT ported to core (see
// src/playermodel.ts's header comment): that's the PlayerModelStore port's
// job, implemented in packages/platform-web at M4.
import { describe, expect, it } from "vitest";
import { createEmptyModel, recordThrow, snapshotModel, toHistoryArray } from "../src/playermodel.js";
import type { HistoryEntry } from "../src/types.js";

function entry(playerFingers: number): HistoryEntry {
  return { playerFingers, playerCall: null, aiFingers: null, aiCall: null, verdictWinner: null };
}

describe("playermodel", () => {
  it("createEmptyModel starts with zero throws", () => {
    const m = createEmptyModel();
    expect(m.throws).toEqual([]);
  });
  it("recordThrow appends without mutating the original model", () => {
    const m = createEmptyModel();
    const m2 = recordThrow(m, entry(3));
    expect(m.throws.length).toBe(0);
    expect(m2.throws.length).toBe(1);
  });
  it("snapshotModel reflects the throw count", () => {
    const m2 = recordThrow(createEmptyModel(), entry(3));
    expect(snapshotModel(m2).throwCount).toBe(1);
  });
  it("snapshotModel of an empty model -> zero", () => {
    expect(snapshotModel(createEmptyModel()).throwCount).toBe(0);
  });
  it("toHistoryArray returns the plain throws array (the shape ai.ts expects)", () => {
    const m2 = recordThrow(createEmptyModel(), entry(3));
    const arr = toHistoryArray(m2);
    expect(arr.length).toBe(1);
    expect(arr[0]!.playerFingers).toBe(3);
  });
  it("HISTORY_CAP truncation: small case sanity (no truncation for 3 entries)", () => {
    let m = createEmptyModel();
    for (const f of [1, 2, 3]) m = recordThrow(m, entry(f));
    expect(m.throws.length).toBe(3);
  });
});

import { isPhantomThrow, prunePhantomThrows } from "../src/playermodel.js";
import type { HistoryEntry } from "../src/types.js";

// The retraction phantoms (2026-08-10..17): the fist coming back down after a
// throw, recorded as an incomplete "throw of 1". Signature: fingers <= 1, no
// rival move, not synced. docs/rival-intelligence-research.md.
const e = (o: Partial<HistoryEntry>): HistoryEntry => ({ playerFingers: null, playerCall: null, aiFingers: null, aiCall: null, verdictWinner: null, ...o });
describe("playermodel: phantom-throw hygiene", () => {
  it("the phantom: fingers 1 (or 0), no rival, voice-early/hand-only/incomplete", () => {
    expect(isPhantomThrow(e({ playerFingers: 1, syncOutcome: "voice-early" }))).toBe(true);
    expect(isPhantomThrow(e({ playerFingers: 0, syncOutcome: "hand-only" }))).toBe(true);
    expect(isPhantomThrow(e({ playerFingers: 1, syncOutcome: "voice-late" }))).toBe(true);
  });
  it("NOT a phantom: a resolved round, a revealed void, a synced training 1, fingers >= 2, or anything tagged entrenament", () => {
    expect(isPhantomThrow(e({ playerFingers: 1, aiFingers: 3, aiCall: 4, verdictWinner: "parata" }))).toBe(false); // resolved
    expect(isPhantomThrow(e({ playerFingers: 1, aiFingers: 3, aiCall: 4, syncOutcome: "hand-only" }))).toBe(false); // revealed void
    expect(isPhantomThrow(e({ playerFingers: 1, syncOutcome: "synced" }))).toBe(false); // synced training thumb-1
    expect(isPhantomThrow(e({ playerFingers: 2, syncOutcome: "voice-early" }))).toBe(false);
    expect(isPhantomThrow(e({ playerFingers: 1, syncOutcome: "voice-early", source: "entrenament" }))).toBe(false);
    expect(isPhantomThrow(e({ playerFingers: null, syncOutcome: "voice-early" }))).toBe(false);
  });
  it("prunePhantomThrows removes only phantoms, reports the count, and returns the SAME model when nothing goes", () => {
    const m = { version: 1, throws: [
      e({ playerFingers: 3, aiFingers: 2, aiCall: 5, verdictWinner: "player" }),
      e({ playerFingers: 1, syncOutcome: "voice-early" }),
      e({ playerFingers: 1, syncOutcome: "voice-early" }),
      e({ playerFingers: 5, aiFingers: 1, aiCall: 6, verdictWinner: "ai" }),
    ] };
    const { model, removed } = prunePhantomThrows(m);
    expect(removed).toBe(2);
    expect(model.throws.map((t) => t.playerFingers)).toEqual([3, 5]);
    expect(m.throws.length).toBe(4); // input untouched
    const clean = prunePhantomThrows(model);
    expect(clean.removed).toBe(0);
    expect(clean.model).toBe(model);
  });
});
