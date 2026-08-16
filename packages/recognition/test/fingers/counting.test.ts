import { describe, expect, it } from "vitest";
import { countFingers, dist, HAND_CONNECTIONS, type Landmark } from "../../src/fingers/counting.js";

// Synthetic 21-point MediaPipe-shaped landmark sets. countFingers only reads
// indices 0 (wrist), 3/4 (thumb IP/TIP), 6/8 (index PIP/TIP), 10/12
// (middle), 14/16 (ring), 17 (pinky MCP), 18/20 (pinky) — every other index
// is a harmless placeholder. wrist sits at the origin; an "extended" finger
// places its tip well past its PIP joint (satisfying the >1.05x margin);
// a "folded" finger places the tip at roughly the SAME distance as the PIP
// (well under the margin, matching a curled finger in real MediaPipe output).
function makeLandmarks(extended: { index?: boolean; middle?: boolean; ring?: boolean; pinky?: boolean; thumb?: boolean }): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  lm[0] = { x: 0, y: 0 }; // wrist
  lm[17] = { x: 0.1, y: 0.5 }; // pinky MCP — thumb's reference point

  const setPair = (tipIdx: number, pipIdx: number, isExtended: boolean) => {
    lm[pipIdx] = { x: 0, y: 0.3 };
    lm[tipIdx] = isExtended ? { x: 0, y: 0.6 } : { x: 0, y: 0.31 };
  };
  setPair(8, 6, !!extended.index);
  setPair(12, 10, !!extended.middle);
  setPair(16, 14, !!extended.ring);
  setPair(20, 18, !!extended.pinky);

  // thumb: dist(tip, pinkyMcp) vs dist(ip, pinkyMcp) * 1.05. IP sits at
  // distance 0.2 from pinkyMcp; a folded tip matches that SAME distance
  // (0.2 is not > 0.2*1.05=0.21 — correctly folded); an extended tip sits
  // at distance 0.6 (well past the margin).
  lm[3] = { x: 0.1, y: 0.7 }; // thumb IP
  lm[4] = extended.thumb ? { x: 0.1, y: 1.1 } : { x: 0.1, y: 0.7 }; // thumb TIP

  return lm;
}

describe("counting: dist", () => {
  it("is the Euclidean distance, z optional (defaults to 0)", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 9);
    expect(dist({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 })).toBeCloseTo(Math.SQRT2, 9);
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
  it("4 fingers (all but thumb)", () => {
    expect(countFingers(makeLandmarks({ index: true, middle: true, ring: true, pinky: true }))).toBe(4);
  });
  it("5 fingers (open hand incl. thumb)", () => {
    expect(countFingers(makeLandmarks({ index: true, middle: true, ring: true, pinky: true, thumb: true }))).toBe(5);
  });
  it("thumb alone counts as 1", () => {
    expect(countFingers(makeLandmarks({ thumb: true }))).toBe(1);
  });
  it("thumbs-UP 'one' counts as 1 (fist + thumb toward frame top — lateral rule misses it, wrist rule catches it)", () => {
    const lm = makeLandmarks({});
    // Thumb pointing "up": tip far from the WRIST but at nearly the same
    // distance from the pinky MCP as the IP joint (real thumbs-up
    // geometry: session 90fac889 read this pose as fingers=0).
    lm[3] = { x: 0.15, y: 0.25 }; // thumb IP — dist to wrist ~0.29
    lm[4] = { x: 0.18, y: 0.55 }; // thumb TIP — dist to wrist ~0.58 (> 1.15x)
    // pinky MCP placed so tip and IP are EQUIDISTANT from it (lateral rule
    // false: 0.367 < 0.370*1.05) — only the new wrist rule can count this.
    lm[17] = { x: 0.5, y: 0.37 };
    expect(countFingers(lm)).toBe(1);
  });
  it("a folded thumb tucked over the fist still counts 0 under both rules", () => {
    const lm = makeLandmarks({});
    lm[3] = { x: 0.15, y: 0.25 }; // thumb IP
    lm[4] = { x: 0.18, y: 0.27 }; // tip barely past IP — inside both margins
    lm[17] = { x: 0.5, y: 0.37 };
    expect(countFingers(lm)).toBe(0);
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
