// workerCountingDrift.test.ts — the worker Blob inlines its OWN copy of
// countFingers (it must be a self-contained classic worker; see the
// workerSource.ts header), so a rule change has to be applied twice by hand
// and nothing structural stops the two from drifting — the thumbs-up fix
// (2026-08-16) was exactly that. This test extracts the inlined function
// out of the generated worker source, evaluates it in-process, and asserts
// it agrees with the module's countFingers on a broad randomized landmark
// sweep plus the hand-authored edge poses. If either copy changes alone,
// this fails.
import { describe, expect, it } from "vitest";
import { countFingers, type Landmark } from "../../src/fingers/counting.js";
import { buildFingerWorkerSource } from "../../src/fingers/workerSource.js";

function extractWorkerCountFingers(): (lm: Landmark[]) => number {
  const src = buildFingerWorkerSource({
    tasksVisionBundleUrl: "about:blank",
    tasksVisionWasmUrl: "about:blank",
    handModelUrl: "about:blank",
    numHands: 1,
  });
  const distStart = src.indexOf("function dist(");
  const cfStart = src.indexOf("function countFingers(");
  const cfEnd = src.indexOf("\n}\n", cfStart);
  expect(distStart).toBeGreaterThan(-1);
  expect(cfStart).toBeGreaterThan(distStart);
  expect(cfEnd).toBeGreaterThan(cfStart);
  const distLine = src.slice(distStart, src.indexOf("\n", distStart));
  const cfBody = src.slice(cfStart, cfEnd + 2);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`${distLine}\n${cfBody}\nreturn countFingers;`)() as (lm: Landmark[]) => number;
}

// Deterministic LCG so a failure reproduces exactly.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randomHand(rng: () => number): Landmark[] {
  return Array.from({ length: 21 }, () => ({ x: rng(), y: rng(), z: (rng() - 0.5) * 0.2 }));
}

describe("worker countFingers stays identical to the module's countFingers", () => {
  const workerCount = extractWorkerCountFingers();

  it("agrees on 5000 random landmark sets (seeded)", () => {
    const rng = makeRng(0x5eed);
    let disagreements = 0;
    for (let i = 0; i < 5000; i++) {
      const lm = randomHand(rng);
      if (workerCount(lm) !== countFingers(lm)) disagreements++;
    }
    expect(disagreements).toBe(0);
  });

  it("agrees on the thumb edge poses that motivated the last rule change", () => {
    const base = (): Landmark[] => Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
    // thumbs-UP one: lateral rule false, wrist rule true
    const up = base();
    up[3] = { x: 0.15, y: 0.25 };
    up[4] = { x: 0.18, y: 0.55 };
    up[17] = { x: 0.5, y: 0.37 };
    // tucked thumb: both rules false
    const tucked = base();
    tucked[3] = { x: 0.15, y: 0.25 };
    tucked[4] = { x: 0.18, y: 0.27 };
    tucked[17] = { x: 0.5, y: 0.37 };
    // sit each pose right AT the two margins so a margin edit in one copy shows
    const atLateral = base();
    atLateral[17] = { x: 0.1, y: 0.5 };
    atLateral[3] = { x: 0.1, y: 0.7 };
    atLateral[4] = { x: 0.1, y: 0.7 + 0.2 * 0.05 + 1e-6 }; // dist=0.21+ε vs 0.2*1.05
    const atWrist = base();
    atWrist[17] = { x: 5, y: 5 }; // lateral rule far from firing either way
    atWrist[3] = { x: 0, y: 0.2 };
    atWrist[4] = { x: 0, y: 0.2 * 1.15 + 1e-6 };
    for (const lm of [up, tucked, atLateral, atWrist]) {
      expect(workerCount(lm)).toBe(countFingers(lm));
    }
    expect(countFingers(up)).toBe(1);
    expect(countFingers(tucked)).toBe(0);
  });
});
