// missions.ts — L'Espill's drills (docs/espill-brainstorm.md §3): a mission
// is a pure spec built from a tell, and a pure evaluation of the throws
// made under it. The app owns the clock and the UI; nothing here touches
// the rival. Four kinds:
//   break-pattern  — after A (or A,B), NOT the habitual next: rate ≤ target
//   unweld         — showing F, don't call F+G: rate ≤ target
//   shadow         — El Rei's silent read hits ≤ maxHits of N (the app scores it)
//   coverage       — every digit within a band over N throws (+ shadow ≤ maxHits)
import type { HistoryEntry } from "./types.js";
import type { Tell2 } from "./tells2.js";

export type MissionKind = "break-pattern" | "unweld" | "shadow" | "coverage";
export interface MissionSpec {
  kind: MissionKind;
  id: string; // stable per tell/kind, for the log
  title: string;
  goal: string; // one sentence, what to do
  n: number; // throws in the mission
  /** break-pattern / unweld */
  ctx?: { a: number; b?: number } | { f: number };
  bad?: number; // the habitual next (break-pattern) or the habitual guess (unweld)
  targetRate?: number; // ≤ this over context throws
  minCtx?: number; // contexts needed for a verdict
  /** shadow / coverage */
  maxHits?: number;
  band?: [number, number]; // coverage: share of each digit within [lo, hi]
}
export interface MissionThrow { f: number; g: number | null; shadowHit: boolean | null }
export interface MissionProgress {
  n: number; total: number; done: boolean;
  ctxN: number; badN: number; rate: number | null;
  shadowHits: number; shadowScored: number;
  shares: Record<number, number>;
  pass: boolean | null; // null until done (or undecidable)
  /** per-throw feedback for the last throw: "bad" (fed the habit), "good" (broke it), "neutral" (context not active) */
  last: "bad" | "good" | "neutral" | null;
}

/** The mission for a tell — the top of the coach card. Tells without a
 * drillable habit (guess-side, timing, reader gap) get the shadow mission:
 * be unreadable for 20 throws. */
export function missionForTell(t: Tell2 | null | undefined): MissionSpec {
  if (t?.id === "order1" && t.params) {
    const { a, b } = t.params as { a: number; b: number };
    return { kind: "break-pattern", id: `break-o1-${a}-${b}`, title: "Trenca el patró", goal: `Vint tirs. Després d'un ${a}, tira qualsevol cosa menys un ${b} — com a molt una de cada quatre vegades.`, n: 20, ctx: { a }, bad: b, targetRate: 0.3, minCtx: 3 };
  }
  if (t?.id === "order2" && t.params) {
    const { a, b, c } = t.params as { a: number; b: number; c: number };
    return { kind: "break-pattern", id: `break-o2-${a}${b}-${c}`, title: "Trenca el patró", goal: `Vint-i-cinc tirs. Després d'un ${a} i un ${b}, no tiris un ${c} — com a molt una de cada quatre vegades.`, n: 25, ctx: { a, b }, bad: c, targetRate: 0.3, minCtx: 3 };
  }
  if (t?.id === "weld" && t.params) {
    const { f, g } = t.params as { f: number; g: number };
    return { kind: "unweld", id: `unweld-${f}-${g}`, title: "Deslliga la crida", goal: `Vint tirs. Quan mostris ${f} dits, no cantis ${f + g} — com a molt una de cada quatre vegades.`, n: 20, ctx: { f }, bad: g, targetRate: 0.3, minCtx: 3 };
  }
  return SHADOW_MISSION;
}
export const SHADOW_MISSION: MissionSpec = { kind: "shadow", id: "shadow-20", title: "Que no et llegeixi", goal: "Vint tirs. L'ombra d'El Rei aposta a cada tir; que n'encerti cinc o menys — una moneda n'encerta quatre.", n: 20, maxHits: 5 };
export const COVERAGE_MISSION: MissionSpec = { kind: "coverage", id: "coverage-25", title: "Cobreix el tauler", goal: "Vint-i-cinc tirs. Cada número entre el 12% i el 28% — cap oblidat, cap preferit — i l'ombra d'El Rei n'encerta set o menys.", n: 25, band: [0.12, 0.28], maxHits: 7 };

/** Evaluate the throws made under a mission. `before` is the history as it
 * stood when the mission started (contexts for the first throws). */
export function missionProgress(spec: MissionSpec, before: readonly HistoryEntry[], throws: readonly MissionThrow[]): MissionProgress {
  const fs = [...before.map((h) => h.playerFingers).filter((x): x is number => x != null && x >= 1 && x <= 5)];
  let ctxN = 0, badN = 0, last: MissionProgress["last"] = null;
  const shares: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let shadowHits = 0, shadowScored = 0;
  throws.forEach((t, i) => {
    let active = false, bad = false;
    if (spec.kind === "break-pattern" && spec.ctx && "a" in spec.ctx) {
      const p1 = fs[fs.length - 1], p2 = fs[fs.length - 2];
      active = spec.ctx.b == null ? p1 === spec.ctx.a : p2 === spec.ctx.a && p1 === spec.ctx.b;
      bad = active && t.f === spec.bad;
    } else if (spec.kind === "unweld" && spec.ctx && "f" in spec.ctx) {
      active = t.f === spec.ctx.f;
      bad = active && t.g === spec.bad;
    }
    if (active) { ctxN++; if (bad) badN++; }
    if (i === throws.length - 1) last = active ? (bad ? "bad" : "good") : "neutral";
    shares[t.f] = (shares[t.f] ?? 0) + 1;
    if (t.shadowHit != null) { shadowScored++; if (t.shadowHit) shadowHits++; }
    fs.push(t.f);
  });
  const n = throws.length, done = n >= spec.n;
  for (const d of [1, 2, 3, 4, 5]) shares[d] = n ? shares[d]! / n : 0;
  const rate = ctxN ? badN / ctxN : null;
  let pass: boolean | null = null;
  if (done) {
    if (spec.kind === "break-pattern" || spec.kind === "unweld") pass = ctxN >= (spec.minCtx ?? 1) ? rate! <= (spec.targetRate ?? 0.3) : null;
    else if (spec.kind === "shadow") pass = shadowScored >= Math.min(spec.n, 8) ? shadowHits <= (spec.maxHits ?? 5) : null;
    else if (spec.kind === "coverage") { const [lo, hi] = spec.band ?? [0.12, 0.28]; pass = [1, 2, 3, 4, 5].every((d) => shares[d]! >= lo - 1e-9 && shares[d]! <= hi + 1e-9) && shadowHits <= (spec.maxHits ?? 7); }
  }
  return { n, total: spec.n, done, ctxN, badN, rate, shadowHits, shadowScored, shares, pass, last };
}
