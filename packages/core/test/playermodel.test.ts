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
