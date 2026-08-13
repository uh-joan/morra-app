import { describe, expect, it } from "vitest";
import { computeCentroidVelocity, computeTipVelocity, fingertipsOf } from "../../src/fingers/tipVelocity.js";
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

describe("tipVelocity: computeCentroidVelocity (s03-beat.html's formula)", () => {
  it("no previous centroid -> null v (first frame a hand appears / after hand loss)", () => {
    const tips: Landmark[] = [{ x: 1, y: 2 }];
    const r = computeCentroidVelocity(tips, null, null, 1000);
    expect(r.v).toBeNull();
    expect(r.centroid).toEqual({ x: 1, y: 2 });
  });

  it("dt <= 0 -> null v (the spike's `if (dt > 0)` skip, NOT a 1ms clamp)", () => {
    const tips: Landmark[] = [{ x: 1, y: 0 }];
    expect(computeCentroidVelocity(tips, { x: 0, y: 0 }, 1000, 1000).v).toBeNull();
    expect(computeCentroidVelocity(tips, { x: 0, y: 0 }, 1000, 999).v).toBeNull();
  });

  it("replicates the spike's arithmetic on a concrete frame pair", () => {
    // 5 tips whose centroid is (0.30, 0.40); previous centroid (0.27, 0.36);
    // dt = 33ms. Spike: moveDist = hypot(0.03, 0.04) = 0.05; v = 0.05/0.033.
    const tips: Landmark[] = [
      { x: 0.1, y: 0.4 },
      { x: 0.2, y: 0.2 },
      { x: 0.3, y: 0.6 },
      { x: 0.4, y: 0.3 },
      { x: 0.5, y: 0.5 },
    ];
    const r = computeCentroidVelocity(tips, { x: 0.27, y: 0.36 }, 0, 33);
    expect(r.centroid.x).toBeCloseTo(0.3, 9);
    expect(r.centroid.y).toBeCloseTo(0.4, 9);
    expect(r.v).toBeCloseTo(0.05 / 0.033, 6);
  });

  it("centroid ignores z (2D like the spike) where mean-per-tip includes it", () => {
    const prev: Landmark[] = [{ x: 0, y: 0, z: 0 }];
    const tips: Landmark[] = [{ x: 0, y: 0, z: 1 }];
    expect(computeCentroidVelocity(tips, { x: 0, y: 0 }, 0, 1000).v).toBe(0);
    expect(computeTipVelocity(tips, prev, 0, 1000)).toBeCloseTo(1, 9);
  });

  it("DIVERGES from mean-per-tip on opposing motion: centroid ~0, mean-per-tip > 0", () => {
    // Two tips swap places (fingers spreading): each moves 1 unit, but the
    // centroid doesn't move at all. This is exactly why HIGH_V=0.9 (tuned on
    // the centroid form) misfires when fed mean-per-tip velocity.
    const prev: Landmark[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const tips: Landmark[] = [
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ];
    const centroidV = computeCentroidVelocity(tips, { x: 0.5, y: 0 }, 0, 1000).v;
    const meanPerTipV = computeTipVelocity(tips, prev, 0, 1000);
    expect(centroidV).toBeCloseTo(0, 9);
    expect(meanPerTipV).toBeCloseTo(1, 9);
  });
});
