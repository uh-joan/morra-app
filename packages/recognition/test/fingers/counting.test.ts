import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  countFingers,
  countFingersSpike,
  dist,
  HAND_CONNECTIONS,
  jointAngleDeg,
  THUMB_MCP_STRAIGHT_DEG,
  type Landmark,
} from "../../src/fingers/counting.js";

// Synthetic 21-point MediaPipe-shaped landmark sets. Wrist at the origin;
// the four fingers run up +y: an "extended" finger places its tip well past
// its PIP (satisfying the >1.05x wrist-distance margin), a "folded" one
// puts the tip at roughly the PIP's distance. The THUMB is a real chain
// CMC(1)→MCP(2)→IP(3)→TIP(4): extended = the four points colinear (angle
// at the MCP 180°), folded = bent at the MCP toward the palm (~120°) —
// the geometry the shipped thumb rule reads.
function makeLandmarks(extended: { index?: boolean; middle?: boolean; ring?: boolean; pinky?: boolean; thumb?: boolean }): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  lm[0] = { x: 0, y: 0 }; // wrist
  lm[9] = { x: 0, y: 0.35 }; // middle MCP (palm scale)
  lm[17] = { x: 0.1, y: 0.3 }; // pinky MCP

  const setPair = (tipIdx: number, pipIdx: number, isExtended: boolean) => {
    lm[pipIdx] = { x: 0, y: 0.3 };
    lm[tipIdx] = isExtended ? { x: 0, y: 0.6 } : { x: 0, y: 0.31 };
  };
  setPair(8, 6, !!extended.index);
  setPair(12, 10, !!extended.middle);
  setPair(16, 14, !!extended.ring);
  setPair(20, 18, !!extended.pinky);

  lm[1] = { x: -0.05, y: 0.1 }; // thumb CMC
  lm[2] = { x: -0.1, y: 0.2 }; // thumb MCP
  if (extended.thumb) {
    lm[3] = { x: -0.15, y: 0.3 }; // IP — colinear with CMC→MCP: straight (180°)
    lm[4] = { x: -0.2, y: 0.4 };
  } else {
    lm[3] = { x: -0.03, y: 0.27 }; // IP — bent back toward the palm (~120° at MCP)
    lm[4] = { x: 0.04, y: 0.3 };
  }
  return lm;
}

describe("counting: dist / jointAngleDeg", () => {
  it("dist is the Euclidean distance, z optional (defaults to 0)", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 9);
    expect(dist({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 })).toBeCloseTo(Math.SQRT2, 9);
  });
  it("jointAngleDeg is the interior angle at the middle point, 3-D", () => {
    expect(jointAngleDeg({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90, 6);
    expect(jointAngleDeg({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(180, 6);
    expect(jointAngleDeg({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 })).toBeCloseTo(180, 6);
  });
  it("jointAngleDeg reads a degenerate joint (coincident points) as straight rather than throwing", () => {
    expect(jointAngleDeg({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(180);
  });
});

describe("counting: HAND_CONNECTIONS", () => {
  it("is the 21-point MediaPipe hand topology (21 connections incl. the wrist-to-pinky-MCP closing edge)", () => {
    const maxIndex = Math.max(...HAND_CONNECTIONS.flat());
    expect(maxIndex).toBe(20);
    expect(HAND_CONNECTIONS.length).toBe(21);
  });
});

describe("counting: countFingers — all 6 real-world settle states", () => {
  it("fist (0 fingers extended)", () => {
    expect(countFingers(makeLandmarks({}))).toBe(0);
  });
  it("1 finger (index only)", () => {
    expect(countFingers(makeLandmarks({ index: true }))).toBe(1);
  });
  it("2 fingers (index + middle)", () => {
    expect(countFingers(makeLandmarks({ index: true, middle: true }))).toBe(2);
  });
  it("3 fingers (index + middle + ring)", () => {
    expect(countFingers(makeLandmarks({ index: true, middle: true, ring: true }))).toBe(3);
  });
  it("4 fingers (all but thumb — thumb folded across the palm)", () => {
    expect(countFingers(makeLandmarks({ index: true, middle: true, ring: true, pinky: true }))).toBe(4);
  });
  it("5 fingers (open hand incl. thumb)", () => {
    expect(countFingers(makeLandmarks({ index: true, middle: true, ring: true, pinky: true, thumb: true }))).toBe(5);
  });
  it("thumb alone — the thumbs-up 'one' — counts as 1", () => {
    expect(countFingers(makeLandmarks({ thumb: true }))).toBe(1);
  });
  it("Mediterranean thumb-first 2 (thumb + index) counts as 2", () => {
    expect(countFingers(makeLandmarks({ thumb: true, index: true }))).toBe(2);
  });
});

describe("counting: the thumb rule is the angle at the thumb MCP (deliberate spike divergence)", () => {
  it(`threshold is ${THUMB_MCP_STRAIGHT_DEG}° — in the gap between folded (p90 156°) and extended (p10 170°) on the corpus`, () => {
    expect(THUMB_MCP_STRAIGHT_DEG).toBe(160);
  });
  it("a thumb straight at the MCP but pointed at the LENS (all the extension in z) still counts — the angle is 3-D", () => {
    const lm = makeLandmarks({});
    lm[1] = { x: -0.05, y: 0.1, z: 0 };
    lm[2] = { x: -0.1, y: 0.2, z: -0.1 };
    lm[3] = { x: -0.15, y: 0.3, z: -0.2 };
    lm[4] = { x: -0.2, y: 0.4, z: -0.3 };
    expect(countFingers(lm)).toBe(1);
  });
  it("a folded thumb whose tip drifts toward the lens does NOT count (this was the spike's 4→5)", () => {
    // Four fingers up; thumb bent at the MCP; tip pulled toward the camera
    // so its 3-D distances inflate — the spike's lateral ratio fires here,
    // the MCP angle does not.
    const lm = makeLandmarks({ index: true, middle: true, ring: true, pinky: true });
    lm[4] = { x: 0.04, y: 0.3, z: -0.25 };
    expect(countFingersSpike(lm)).toBe(5);
    expect(countFingers(lm)).toBe(4);
  });
  it("just under / just over the threshold", () => {
    const at = (deg: number): Landmark[] => {
      const lm = makeLandmarks({});
      // CMC→MCP along +y; IP placed so the interior angle at MCP is `deg`
      lm[1] = { x: 0, y: 0.1 };
      lm[2] = { x: 0, y: 0.2 };
      const r = ((180 - deg) * Math.PI) / 180; // deviation from straight
      lm[3] = { x: 0.1 * Math.sin(r), y: 0.2 + 0.1 * Math.cos(r) };
      lm[4] = { x: 0.2 * Math.sin(r), y: 0.2 + 0.2 * Math.cos(r) };
      return lm;
    };
    expect(countFingers(at(THUMB_MCP_STRAIGHT_DEG - 1))).toBe(0);
    expect(countFingers(at(THUMB_MCP_STRAIGHT_DEG + 1))).toBe(1);
  });
});

describe("counting: countFingersSpike is the verbatim spike rule", () => {
  it("agrees with countFingers on the four fingers and differs only in the thumb", () => {
    for (const pose of [{}, { index: true }, { index: true, middle: true, ring: true, pinky: true }, { thumb: true }]) {
      const a = countFingers(makeLandmarks(pose)), b = countFingersSpike(makeLandmarks(pose));
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    }
  });
});

describe("counting: countFingers — margin behavior (the 1.05x threshold)", () => {
  it("a tip exactly at the PIP's distance (no margin) does NOT count as extended", () => {
    const lm = makeLandmarks({});
    lm[8] = { x: 0, y: 0.3 }; // index tip exactly AT the pip's distance from wrist
    expect(countFingers(lm)).toBe(0);
  });
  it("a tip just past the 1.05x margin counts as extended", () => {
    const lm = makeLandmarks({});
    lm[8] = { x: 0, y: 0.3 * 1.06 }; // just over the margin
    expect(countFingers(lm)).toBe(1);
  });
});

// The recorded corpus (2026-08-16, one hand, 480x360, held+open frames,
// stride-subsampled 40/truth). This is what picked the thumb rule; freezing
// it here means the number cannot regress silently. Thresholds sit a few
// points under the measured 99/99/96/99/97 so camera-noise-level jitter in
// a future re-recording doesn't flap the suite — but a return to the
// spike's 63% on 4 fails loudly.
describe("counting: recorded corpus fixture", () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const doc = JSON.parse(readFileSync(join(HERE, "..", "fixtures", "counting-corpus-2026-08-16.json"), "utf8")) as {
    frames: { label: number; lm: [number, number, number][] }[];
  };
  const toLm = (lm: [number, number, number][]): Landmark[] => lm.map(([x, y, z]) => ({ x, y, z }));
  const accuracy = (fn: (lm: readonly Landmark[]) => number, truth: number): number => {
    const fr = doc.frames.filter((f) => f.label === truth);
    return fr.filter((f) => fn(toLm(f.lm)) === truth).length / fr.length;
  };
  it("has 40 frames per truth 1..5", () => {
    for (const t of [1, 2, 3, 4, 5]) expect(doc.frames.filter((f) => f.label === t).length).toBe(40);
  });
  it.each([
    [1, 0.95],
    [2, 0.95],
    [3, 0.9],
    [4, 0.95],
    [5, 0.93],
  ])("countFingers reads truth %i at ≥ %d", (truth, min) => {
    expect(accuracy(countFingers, truth)).toBeGreaterThanOrEqual(min);
  });
  it("documents WHY: the spike rule reads a 4 as 5 on a third of these frames", () => {
    expect(accuracy(countFingersSpike, 4)).toBeLessThan(0.75);
  });
});
