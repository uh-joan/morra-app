import { describe, expect, it } from "vitest";
import { findStableCountRun, type CountFrame } from "../../src/fingers/stableRun.js";

describe("stableRun: findStableCountRun", () => {
  it("finds the earliest transition-preceded stable run", () => {
    const frames: CountFrame[] = [
      { t: 0, count: 0 }, { t: 10, count: 0 },
      { t: 20, count: 3 }, { t: 30, count: 3 }, { t: 40, count: 3 }, // transition at t=20, stable for 3
    ];
    const r = findStableCountRun(frames, 3);
    expect(r).toEqual({ t: 20, heldOver: false });
  });

  it("a stable run with NO preceding transition is held-over, not a fresh onset", () => {
    // the hand is ALREADY at count 3 for the whole window — no transition ever observed
    const frames: CountFrame[] = [{ t: 0, count: 3 }, { t: 10, count: 3 }, { t: 20, count: 3 }];
    const r = findStableCountRun(frames, 3);
    expect(r).toEqual({ heldOver: true });
  });

  it("prefers a LATER transition-preceded run over an earlier held-over one", () => {
    const frames: CountFrame[] = [
      { t: 0, count: 3 }, { t: 10, count: 3 }, { t: 20, count: 3 }, // held-over run (no transition before it — window opens already at 3)
      { t: 30, count: 4 }, { t: 40, count: 4 }, { t: 50, count: 4 }, // genuine transition at t=30
    ];
    const r = findStableCountRun(frames, 3);
    expect(r).toEqual({ t: 30, heldOver: false });
  });

  it("no stable run at all -> null", () => {
    const frames: CountFrame[] = [{ t: 0, count: 1 }, { t: 10, count: 2 }, { t: 20, count: 3 }];
    expect(findStableCountRun(frames, 3)).toBeNull();
  });

  it("not enough frames to even form a run of minRun -> null", () => {
    const frames: CountFrame[] = [{ t: 0, count: 3 }, { t: 10, count: 3 }];
    expect(findStableCountRun(frames, 3)).toBeNull();
  });

  it("a run exactly at minRun length counts as stable", () => {
    const frames: CountFrame[] = [{ t: 0, count: 1 }, { t: 10, count: 3 }, { t: 20, count: 3 }, { t: 30, count: 3 }];
    const r = findStableCountRun(frames, 3);
    expect(r).toEqual({ t: 10, heldOver: false });
  });
});
