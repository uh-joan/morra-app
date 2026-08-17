#!/usr/bin/env node
// eval-rival.mjs — replay the REAL rival engine (@morra/core decideMove /
// predictPlayerF, from dist) over the logged resolved rounds and print, per
// level: aim (its guess = the player's fingers), the player's hit on ITS
// fingers, and the round-outcome table (rival wins / player wins / parata).
// THE measuring stick for ai.ts: a change is accepted when it moves this
// table (docs/rival-intelligence-research.md §4.7), not because it sounds
// clever.
//
//   node scripts/eval-rival.mjs [--engine spike|v2] [--levels L3,L4] [--seed 7] [--cross] [--min 5]
//
// Rounds come from spikes/logs/*.ndjson game_reveal events (resolved rounds
// only — the throws the game judged), replayed in time order per session.
// Two replays per level:
//   argmax  — deterministic read via predictPlayerF (what the engine BELIEVES)
//   sampled — the actual decideMove with a seeded RNG (what it would DO)
// --cross feeds each session the accumulated history of the sessions before
// it (the L4 cross-match memory); default is in-session only.
// Open-loop caveat: the humans were playing the deployed rival; a sharper
// rival perturbs them. Compare rows, don't read them as absolute.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE = join(HERE, "..", "packages", "core", "dist", "index.js");
const core = await import(CORE);
const { LEVEL_ORDER } = core;

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const levels = opt("--levels", LEVEL_ORDER.join(",")).split(",");
const seed = parseInt(opt("--seed", "7"), 10);
const cross = args.includes("--cross");
const minHist = parseInt(opt("--min", "5"), 10);
const engine = opt("--engine", "v2");
// --tune eta=0.3,alpha=1,edgeMode=hit,tauGain=2 → overrides core.V2_TUNING for this run
const tune = opt("--tune", "");
if (tune) for (const kv of tune.split(",")) { const [k, v] = kv.split("="); if (k in core.V2_TUNING) core.V2_TUNING[k] = isNaN(Number(v)) ? v : Number(v); else console.warn("unknown tuning key", k); }
if (tune) console.log("tuning:", JSON.stringify(core.V2_TUNING));
const decideMove = engine === "spike" ? core.decideMove : (level, random, hist) => core.decideMoveV2(level, random, hist);
const predictPlayerF = engine === "spike" ? core.predictPlayerF : (level, hist) => core.predictPlayerFV2(level, hist);

// ------------------------------------------------------------ dataset
const LOGS = join(HERE, "..", "spikes", "logs");
const sessions = new Map(); // sessionId -> { mtime, rounds: [] }
for (const f of readdirSync(LOGS).filter((n) => n.endsWith(".ndjson"))) {
  const path = join(LOGS, f);
  const mtime = statSync(path).mtimeMs;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.includes('"game_reveal"')) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== "game_reveal") continue;
    const { playerFingers: pf, playerCallNumber: pc, aiFingers: af, aiCall: ac, verdictWinner: w } = e;
    if ([pf, pc, af, ac, w].some((x) => x == null)) continue;
    if (!sessions.has(e.sessionId)) sessions.set(e.sessionId, { mtime, rounds: [] });
    sessions.get(e.sessionId).rounds.push({ throwIndex: e.throwIndex, pf, pg: pc - pf, af, ag: ac - af, w, word: e.playerWord ?? null, pc });
  }
}
const ordered = [...sessions.entries()].sort((a, b) => a[1].mtime - b[1].mtime);
for (const [, s] of ordered) s.rounds.sort((a, b) => a.throwIndex - b.throwIndex);
const total = ordered.reduce((n, [, s]) => n + s.rounds.length, 0);
console.log(`engine ${engine} · rounds: ${total} resolved, ${ordered.length} sessions${cross ? " (cross-session memory)" : " (in-session)"}, min history ${minHist}, seed ${seed}\n`);

// ------------------------------------------------------------ rng
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// The history entry shape core expects (types.ts HistoryEntry)
const toEntry = (r, level) => ({ playerFingers: r.pf, playerCall: r.pc, playerWord: r.word, aiFingers: r.af, aiCall: r.af + r.ag, aiGuessPlayerFingers: r.ag, aiLevel: level, verdictWinner: r.w, syncOutcome: "synced", source: "partida" });

// ------------------------------------------------------------ replay
const V = [1, 2, 3, 4, 5];
const pct = (x, n) => (n ? (100 * x / n).toFixed(1).padStart(5) + "%" : "    –");
function replayLevel(level) {
  const rng = mulberry32(seed);
  const random = { next: () => rng() };
  const acc = { n: 0, aimArg: 0, aimSmp: 0, hitSmp: 0, rivalWin: 0, playerWin: 0, parata: 0, guessDist: {}, fDist: {} };
  let prior = [];
  for (const [, s] of ordered) {
    let rows = [];
    for (const r of s.rounds) {
      const hist = (cross ? prior : []).concat(rows);
      if (hist.length >= minHist && r.pg >= 1 && r.pg <= 5) {
        acc.n++;
        // what the engine believes (deterministic)
        const belief = predictPlayerF(level, hist).dist;
        const argmax = V.reduce((b, v) => (belief[v] > belief[b] ? v : b), 1);
        acc.aimArg += argmax === r.pf ? 1 : 0;
        // what the engine would DO (sampled)
        const mv = decideMove(level, random, hist, null);
        const aiHit = mv.guessPlayerFingers === r.pf;
        const plHit = r.pg === mv.fingers;
        acc.aimSmp += aiHit ? 1 : 0;
        acc.hitSmp += plHit ? 1 : 0;
        if (aiHit && !plHit) acc.rivalWin++; else if (plHit && !aiHit) acc.playerWin++; else acc.parata++;
        acc.guessDist[mv.guessPlayerFingers] = (acc.guessDist[mv.guessPlayerFingers] ?? 0) + 1;
        acc.fDist[mv.fingers] = (acc.fDist[mv.fingers] ?? 0) + 1;
      }
      rows.push(toEntry(r, level));
    }
    prior = prior.concat(rows);
  }
  return acc;
}

console.log("level  n      aim(argmax) aim(sampled) player-hit | rival-wins player-wins parata | guess dist 1..5 | fingers dist 1..5");
for (const level of levels) {
  const a = replayLevel(level);
  const d = (o) => V.map((v) => ((100 * (o[v] ?? 0)) / Math.max(1, a.n)).toFixed(0).padStart(2)).join(" ");
  console.log(`${level.padEnd(6)} ${String(a.n).padEnd(6)} ${pct(a.aimArg, a.n)}      ${pct(a.aimSmp, a.n)}      ${pct(a.hitSmp, a.n)}  |  ${pct(a.rivalWin, a.n)}    ${pct(a.playerWin, a.n)}   ${pct(a.parata, a.n)} | ${d(a.guessDist)} | ${d(a.fDist)}`);
}
console.log("\nreference: uniform play = 20% aim, 20% player-hit → 16 / 16 / 68. Deployed field values (pre-hygiene): L4 aim 12.3%, rival 16 / player 17.");
