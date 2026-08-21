import { describe, expect, it } from "vitest";
import {
  frontierLevel,
  isRivalUnlocked,
  predecessorLevel,
  successorLevel,
} from "../../src/rivalLadder.js";

describe("rivalLadder", () => {
  it("opens only Nino to a fresh player", () => {
    const beaten = new Set<string>();
    expect(isRivalUnlocked("L1", beaten)).toBe(true);
    expect(isRivalUnlocked("L2", beaten)).toBe(false);
    expect(isRivalUnlocked("L3", beaten)).toBe(false);
    expect(isRivalUnlocked("L4", beaten)).toBe(false);
  });

  it("opens each rung only when its predecessor is beaten", () => {
    expect(isRivalUnlocked("L2", new Set(["L1"]))).toBe(true);
    expect(isRivalUnlocked("L3", new Set(["L1"]))).toBe(false);
    expect(isRivalUnlocked("L3", new Set(["L1", "L2"]))).toBe(true);
    expect(isRivalUnlocked("L4", new Set(["L1", "L2", "L3"]))).toBe(true);
  });

  it("beating a later rung without the earlier one still gates the gap", () => {
    // defensive: a stored set that skipped a rung must not open past the gap
    expect(isRivalUnlocked("L4", new Set(["L3"]))).toBe(true); // L3 beaten opens L4
    expect(isRivalUnlocked("L3", new Set(["L3"]))).toBe(false); // beating L3 doesn't open L3 itself via predecessor L2
  });

  it("maps predecessors and successors along the chain", () => {
    expect(predecessorLevel("L1")).toBeNull();
    expect(predecessorLevel("L2")).toBe("L1");
    expect(predecessorLevel("L4")).toBe("L3");
    expect(successorLevel("L1")).toBe("L2");
    expect(successorLevel("L4")).toBeNull();
  });

  it("tracks the frontier — the first open, unbeaten rival", () => {
    expect(frontierLevel(new Set())).toBe("L1");
    expect(frontierLevel(new Set(["L1"]))).toBe("L2");
    expect(frontierLevel(new Set(["L1", "L2"]))).toBe("L3");
    expect(frontierLevel(new Set(["L1", "L2", "L3"]))).toBe("L4");
    expect(frontierLevel(new Set(["L1", "L2", "L3", "L4"]))).toBeNull();
  });

  it("treats unknown ids as open (never traps the UI)", () => {
    expect(isRivalUnlocked("L9", new Set())).toBe(true);
    expect(predecessorLevel("L9")).toBeNull();
    expect(successorLevel("L9")).toBeNull();
  });
});
