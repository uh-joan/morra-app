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
  // Everything from `function dist(` through the end of `function
  // countFingers(...) {...}` — dist, jointAngleDeg, countFingers — is one
  // contiguous block in the worker source.
  const distStart = src.indexOf("function dist(");
  const cfStart = src.indexOf("function countFingers(");
  const cfEnd = src.indexOf("\n}\n", cfStart);
  expect(distStart).toBeGreaterThan(-1);
  expect(cfStart).toBeGreaterThan(distStart);
  expect(cfEnd).toBeGreaterThan(cfStart);
  const block = src.slice(distStart, cfEnd + 2);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`${block}\nreturn countFingers;`)() as (lm: Landmark[]) => number;
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

  it("agrees on the thumb poses the rule was picked on (straight / folded / lens-pointed / near-threshold)", () => {
    const base = (): Landmark[] => {
      const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
      lm[9] = { x: 0, y: 0.35 };
      lm[17] = { x: 0.1, y: 0.3 };
      for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) { lm[pip] = { x: 0, y: 0.3 }; lm[tip] = { x: 0, y: 0.31 }; }
      lm[1] = { x: -0.05, y: 0.1 };
      lm[2] = { x: -0.1, y: 0.2 };
      return lm;
    };
    const straight = base();
    straight[3] = { x: -0.15, y: 0.3 }; straight[4] = { x: -0.2, y: 0.4 };
    const folded = base();
    folded[3] = { x: -0.03, y: 0.27 }; folded[4] = { x: 0.04, y: 0.3 };
    const lens = base();
    lens[2] = { x: -0.1, y: 0.2, z: -0.1 }; lens[3] = { x: -0.15, y: 0.3, z: -0.2 }; lens[4] = { x: -0.2, y: 0.4, z: -0.3 };
    const near = (deg: number): Landmark[] => {
      const lm = base();
      lm[1] = { x: 0, y: 0.1 }; lm[2] = { x: 0, y: 0.2 };
      const r = ((180 - deg) * Math.PI) / 180;
      lm[3] = { x: 0.1 * Math.sin(r), y: 0.2 + 0.1 * Math.cos(r) };
      lm[4] = { x: 0.2 * Math.sin(r), y: 0.2 + 0.2 * Math.cos(r) };
      return lm;
    };
    for (const lm of [straight, folded, lens, near(159), near(160), near(161)]) {
      expect(workerCount(lm)).toBe(countFingers(lm));
    }
    expect(countFingers(straight)).toBe(1);
    expect(countFingers(folded)).toBe(0);
    expect(countFingers(lens)).toBe(1);
  });
});
