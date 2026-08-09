import { describe, expect, it } from "vitest";
import { computeTipVelocity, fingertipsOf } from "../../src/fingers/tipVelocity.js";
import type { Landmark } from "../../src/fingers/counting.js";

function makeLandmarks(tipPositions: Partial<Record<4 | 8 | 12 | 16 | 20, Landmark>>): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  for (const [idx, pos] of Object.entries(tipPositions)) lm[Number(idx)] = pos;
  return lm;
}

describe("tipVelocity: fingertipsOf", () => {
  it("extracts landmarks 4, 8, 12, 16, 20 in that order", () => {
    const lm = makeLandmarks({
      4: { x: 1, y: 0 },
      8: { x: 2, y: 0 },
      12: { x: 3, y: 0 },
      16: { x: 4, y: 0 },
      20: { x: 5, y: 0 },
    });
    const tips = fingertipsOf(lm);
    expect(tips.map((t) => t.x)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("tipVelocity: computeTipVelocity", () => {
  it("no previous frame -> null (first frame a hand appears)", () => {
    const tips = fingertipsOf(makeLandmarks({}));
    expect(computeTipVelocity(tips, null, null, 1000)).toBeNull();
    expect(computeTipVelocity(tips, tips, null, 1000)).toBeNull();
  });

  it("computes average per-tip displacement per second across all 5 tips", () => {
    const prevTips: Landmark[] = [
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
    ];
    // each tip moves exactly 1 unit in x over 1 second (dt = 1000ms)
    const tips: Landmark[] = [
      { x: 1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 },
    ];
    const v = computeTipVelocity(tips, prevTips, 0, 1000);
    expect(v).toBeCloseTo(1, 9); // 1 unit / 1s, averaged across 5 identical tips
  });

  it("a faster frame rate (smaller dt) yields a proportionally larger velocity for the same displacement", () => {
    const prevTips: Landmark[] = [{ x: 0, y: 0 }];
    const tips: Landmark[] = [{ x: 1, y: 0 }];
    const vSlow = computeTipVelocity(tips, prevTips, 0, 1000); // 1 unit over 1s
    const vFast = computeTipVelocity(tips, prevTips, 0, 100); // 1 unit over 0.1s
    expect(vFast).toBeCloseTo(vSlow! * 10, 6);
  });

  it("dt is floored at 1ms to avoid division blowups from a zero/negative timestamp delta", () => {
    const prevTips: Landmark[] = [{ x: 0, y: 0 }];
    const tips: Landmark[] = [{ x: 1, y: 0 }];
    // timestampMs <= prevTs -> dt clamps to max(1, ...)/1000 = 0.001s -> velocity = 1000
    const v = computeTipVelocity(tips, prevTips, 1000, 1000);
    expect(v).toBeCloseTo(1000, 6);
    expect(Number.isFinite(v)).toBe(true);
  });

  it("no motion -> zero velocity", () => {
    const tips: Landmark[] = [{ x: 5, y: 5 }, { x: 1, y: 1 }];
    const v = computeTipVelocity(tips, tips, 0, 1000);
    expect(v).toBe(0);
  });
});
