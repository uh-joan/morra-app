import { describe, expect, it } from "vitest";
import { computeFraming, DEFAULT_FRAMING_TARGET, drawFramingGuide, FRAMING_COPY, NO_HAND } from "../../src/framing.js";
import type { Landmark } from "@morra/recognition";

// A hand as a 21-point cloud filling the box [x0,x0+w] × [y0,y0+h]
function hand(x0: number, y0: number, w: number, h: number): Landmark[] {
  const lm: Landmark[] = [];
  for (let i = 0; i < 21; i++) {
    const fx = (i % 7) / 6, fy = Math.floor(i / 7) / 2;
    lm.push({ x: x0 + fx * w, y: y0 + fy * h });
  }
  return lm;
}

describe("framing: computeFraming", () => {
  it("no hand → no-hand", () => {
    expect(computeFraming(null)).toEqual(NO_HAND);
    expect(computeFraming([])).toEqual(NO_HAND);
  });
  it("a big centered hand is in the zone", () => {
    const f = computeFraming(hand(0.25, 0.25, 0.5, 0.5));
    expect(f.inZone).toBe(true);
    expect(f.hint).toBe("none");
    expect(f.size).toBeCloseTo(0.5, 6);
    expect(f.offCenter).toBeCloseTo(0, 6);
  });
  it("a small centered hand → 'closer' (the corpus's 71%-correct bucket)", () => {
    const f = computeFraming(hand(0.4, 0.4, 0.2, 0.2));
    expect(f.hint).toBe("closer");
    expect(f.inZone).toBe(false);
  });
  it("a hand filling the frame → 'farther'", () => {
    const f = computeFraming(hand(0.05, 0.05, 0.9, 0.9));
    expect(f.hint).toBe("farther");
  });
  it("a big hand off to one side → 'center'", () => {
    const f = computeFraming(hand(0.05, 0.25, 0.5, 0.5));
    expect(f.hint).toBe("center");
    expect(f.offCenter).toBeGreaterThan(DEFAULT_FRAMING_TARGET.maxOffCenter);
  });
  it("points touching the frame edge → 'clipped', which outranks everything", () => {
    const f = computeFraming(hand(0.0, 0.25, 0.5, 0.5)); // left edge at 0
    expect(f.hint).toBe("clipped");
    expect(f.edge).toBeLessThan(DEFAULT_FRAMING_TARGET.minEdge);
  });
  it("target is tunable", () => {
    const strict = { ...DEFAULT_FRAMING_TARGET, minSize: 0.7 };
    expect(computeFraming(hand(0.25, 0.25, 0.5, 0.5), strict).hint).toBe("closer");
  });
  it("every hint has player-facing copy; in-zone has none", () => {
    for (const k of ["closer", "farther", "center", "clipped", "no-hand"] as const) expect(FRAMING_COPY[k].length).toBeGreaterThan(0);
    expect(FRAMING_COPY.none).toBe("");
  });
  it("drawFramingGuide mirrors the ghost's x for the right hand (mirror=true)", () => {
    // A stub 2-D context that records the path points; only what draw uses.
    const capture = () => {
      const pts: [number, number][] = [];
      const noop = () => {};
      const ctx = {
        save: noop, restore: noop, beginPath: noop, closePath: noop, fill: noop, stroke: noop,
        setLineDash: noop, moveTo: (x: number, y: number) => pts.push([x, y]), lineTo: (x: number, y: number) => pts.push([x, y]),
        lineWidth: 0, strokeStyle: "", fillStyle: "",
      } as unknown as CanvasRenderingContext2D;
      return { ctx, pts };
    };
    const a = capture(), b = capture();
    drawFramingGuide(a.ctx, 100, 100, NO_HAND, false);
    drawFramingGuide(b.ctx, 100, 100, NO_HAND, true);
    expect(b.pts.length).toBe(a.pts.length);
    for (let i = 0; i < a.pts.length; i++) {
      expect(b.pts[i]![0]).toBeCloseTo(100 - a.pts[i]![0], 6); // x mirrored around the frame center
      expect(b.pts[i]![1]).toBe(a.pts[i]![1]); // y untouched
    }
  });
});
