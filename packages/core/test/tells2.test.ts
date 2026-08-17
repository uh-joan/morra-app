// tells2 — the named, ranked tells and the window summary.
import { describe, expect, it } from "vitest";
import { computeExploitabilityV2 } from "../src/mirror2.js";
import { computeTells2, summarizeTrend } from "../src/tells2.js";
import type { HistoryEntry } from "../src/types.js";

const H = (pf: number, pc: number | null, af: number, ac: number, w: "player" | "ai" | "parata" | null): HistoryEntry =>
  ({ playerFingers: pf, playerCall: pc, aiFingers: af, aiCall: ac, aiGuessPlayerFingers: ac - af, verdictWinner: w });
const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const fromF = (seq: number[]): HistoryEntry[] => seq.map((f, i) => H(f, f + 1 + (i % 5), 1 + (i % 5), 1 + (i % 5) + 1 + ((i * 3) % 5), "parata"));

describe("tells2", () => {
  it("names a planted order-1 habit, prices it, and says what the rival does with it", () => {
    // after a 3 always a 4; otherwise noise
    const r = mulberry(2); const seq: number[] = [];
    for (let i = 0; i < 120; i++) seq.push(i && seq[i - 1] === 3 ? 4 : 1 + Math.floor(r() * 5));
    const tells = computeTells2(fromF(seq));
    const t = tells.find((x) => x.id === "order1")!;
    expect(t).toBeDefined();
    expect(t.sentence).toMatch(/Després de tirar un 3, tires un 4 el 100%/);
    expect(t.counterMove).toMatch(/aposta al 4/);
    expect(t.evidence.n).toBeGreaterThan(10);
    expect(t.pointsPer100).not.toBeNull(); expect(t.pointsPer100!).toBeGreaterThan(3);
    // priced tells come first
    const firstUnpriced = tells.findIndex((x) => x.pointsPer100 == null);
    const lastPriced = tells.map((x) => x.pointsPer100 != null).lastIndexOf(true);
    if (firstUnpriced >= 0) expect(lastPriced).toBeLessThan(firstUnpriced);
  });
  it("names the chase and the weld from the call channel", () => {
    // player guesses the rival's previous fingers, and calls double when showing 2
    const hist: HistoryEntry[] = [];
    let prevAf = 3;
    for (let i = 0; i < 60; i++) { const af = 1 + ((i * 2) % 5); const f = i % 3 === 0 ? 2 : 1 + (i % 5); const g = f === 2 ? 2 : prevAf; hist.push(H(f, f + g, af, af + 1, "parata")); prevAf = af; }
    const ids = computeTells2(hist).map((t) => t.id);
    expect(ids).toContain("chase"); expect(ids).toContain("weld");
  });
  it("says nothing about a uniform player beyond thin-evidence noise, and never prices a habit El Rei loses money on", () => {
    const r = mulberry(8); const seq = Array.from({ length: 150 }, () => 1 + Math.floor(r() * 5));
    const tells = computeTells2(fromF(seq));
    // whatever thin-evidence sentence slips through, none of it is priced: the whole read is worth nothing here
    for (const t of tells) expect(t.pointsPer100).toBeNull();
  });
  it("computeExploitabilityV2 reads a planted habit high and a uniform player near a coin", () => {
    const seq: number[] = []; for (let i = 0; i < 100; i++) seq.push(i % 2 ? 4 : 2);
    expect(computeExploitabilityV2(fromF(seq)).rate!).toBeGreaterThan(0.9);
    const r = mulberry(5); const u = Array.from({ length: 200 }, () => 1 + Math.floor(r() * 5));
    expect(computeExploitabilityV2(fromF(u)).rate!).toBeLessThan(0.3);
  });
  it("summarizeTrend: a player who was readable and then went uniform shows predictability falling", () => {
    const r = mulberry(6); const seq: number[] = [];
    for (let i = 0; i < 40; i++) seq.push(i % 2 ? 4 : 2);                    // alternator
    for (let i = 0; i < 30; i++) seq.push(1 + Math.floor(r() * 5));          // then noise
    const t = summarizeTrend(fromF(seq), 30);
    expect(t.recent.n).toBe(30); expect(t.previous.n).toBe(30);
    expect(t.previous.predictability!).toBeGreaterThan(0.8);
    expect(t.recent.predictability!).toBeLessThan(t.previous.predictability!);
    expect(t.recent.entropyBits!).toBeGreaterThan(t.previous.entropyBits!);
    expect(t.recent.chase).not.toBeNull(); expect(t.recent.readerHit).not.toBeNull();
  });
});
