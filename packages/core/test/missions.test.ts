import { describe, expect, it } from "vitest";
import { COVERAGE_MISSION, missionForTell, missionProgress, SHADOW_MISSION } from "../src/missions.js";
import type { HistoryEntry } from "../src/types.js";
import type { Tell2 } from "../src/tells2.js";

const H = (pf: number): HistoryEntry => ({ playerFingers: pf, playerCall: pf + 2, aiFingers: 3, aiCall: 5, verdictWinner: "parata" });
const tell = (id: string, params: Record<string, number>): Tell2 => ({ id, family: null, sentence: "", counterMove: "", evidence: { hits: 1, n: 1, rate: 1 }, pointsPer100: null, strength: 1, params });

describe("missions", () => {
  it("builds the mission from the tell: break-pattern for order-1/2, unweld for the weld, shadow otherwise", () => {
    expect(missionForTell(tell("order1", { a: 3, b: 4 }))).toMatchObject({ kind: "break-pattern", ctx: { a: 3 }, bad: 4, n: 20 });
    expect(missionForTell(tell("order2", { a: 3, b: 4, c: 2 }))).toMatchObject({ kind: "break-pattern", ctx: { a: 3, b: 4 }, bad: 2, n: 25 });
    expect(missionForTell(tell("weld", { f: 2, g: 2 }))).toMatchObject({ kind: "unweld", ctx: { f: 2 }, bad: 2 });
    expect(missionForTell(tell("chase", {})).kind).toBe("shadow");
    expect(missionForTell(null).kind).toBe("shadow");
  });
  it("break-pattern: contexts count from the history before the mission, the bad rate decides, per-throw feedback names bad/good/neutral", () => {
    const spec = missionForTell(tell("order1", { a: 3, b: 4 }));
    const before = [H(1), H(3)]; // last throw before the mission is a 3 → the first mission throw is in context
    let p = missionProgress(spec, before, [{ f: 4, g: 1, shadowHit: null }]);
    expect(p.ctxN).toBe(1); expect(p.badN).toBe(1); expect(p.last).toBe("bad"); expect(p.done).toBe(false);
    p = missionProgress(spec, before, [{ f: 4, g: 1, shadowHit: null }, { f: 5, g: 1, shadowHit: null }]);
    expect(p.last).toBe("neutral"); // previous throw was 4, not 3
    const throws = []; let f = 3;
    for (let i = 0; i < 20; i++) { throws.push({ f, g: 1, shadowHit: null }); f = f === 3 ? 1 : 3; } // 3,1,3,1… — after each 3 comes a 1: never the bad 4
    p = missionProgress(spec, before, throws);
    expect(p.done).toBe(true); expect(p.ctxN).toBeGreaterThanOrEqual(10); expect(p.rate).toBe(0); expect(p.pass).toBe(true); expect(p.last).toBe("good");
    const fail = Array.from({ length: 20 }, (_, i) => ({ f: i % 2 ? 4 : 3, g: 1, shadowHit: null })); // 3,4,3,4 — feeds the habit every time
    expect(missionProgress(spec, before, fail).pass).toBe(false);
    expect(missionProgress(spec, [], Array.from({ length: 20 }, () => ({ f: 1, g: 1, shadowHit: null }))).pass).toBeNull(); // no contexts → undecidable
  });
  it("unweld: showing F and calling F+G is bad; the rate over F-throws decides", () => {
    const spec = missionForTell(tell("weld", { f: 2, g: 2 }));
    const throws = Array.from({ length: 20 }, (_, i) => ({ f: 2, g: i < 4 ? 2 : 5, shadowHit: null })); // 4 of 20 welded → 20% ≤ 30%
    const p = missionProgress(spec, [], throws);
    expect(p.ctxN).toBe(20); expect(p.badN).toBe(4); expect(p.pass).toBe(true);
  });
  it("shadow: passes when El Rei's silent read hits ≤ maxHits; coverage needs every digit in band", () => {
    const sh = Array.from({ length: 20 }, (_, i) => ({ f: 1 + (i % 5), g: 1, shadowHit: i % 4 === 0 })); // 5 hits
    expect(missionProgress(SHADOW_MISSION, [], sh).pass).toBe(true);
    const sh2 = Array.from({ length: 20 }, (_, i) => ({ f: 1 + (i % 5), g: 1, shadowHit: i % 3 === 0 })); // 7 hits
    expect(missionProgress(SHADOW_MISSION, [], sh2).pass).toBe(false);
    const cov = Array.from({ length: 25 }, (_, i) => ({ f: 1 + (i % 5), g: 1, shadowHit: false })); // 20% each
    expect(missionProgress(COVERAGE_MISSION, [], cov).pass).toBe(true);
    const skew = Array.from({ length: 25 }, (_, i) => ({ f: i < 10 ? 5 : 1 + (i % 4), g: 1, shadowHit: false }));
    expect(missionProgress(COVERAGE_MISSION, [], skew).pass).toBe(false);
  });
});
