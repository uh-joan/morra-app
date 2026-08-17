// mirror2-report.mjs — run L'Espill v2's statistics library over a logged
// session (or all sessions), print what it sees. A sanity harness for
// packages/core/src/mirror2.ts against real play, not synthetic data.
//   node scripts/mirror2-report.mjs <sessionId|all>
import { readFileSync, readdirSync } from "node:fs";
import * as core from "../packages/core/dist/index.js";
const W = { u: 1, un: 1, una: 1, dos: 2, dues: 2, tres: 3, quatre: 4, cinc: 5, sis: 6, set: 7, vuit: 8, nou: 9, deu: 10 };
const LOGS = new URL("../spikes/logs/", import.meta.url);
const which = process.argv[2] ?? "all";
const files = readdirSync(LOGS).filter((n) => n.endsWith(".ndjson") && (which === "all" || n.includes(which)));
const hist = [];
for (const f of files) {
  const rows = readFileSync(new URL(f, LOGS), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const p1 = new Map(rows.filter((r) => r.type === "rival_reveal_phase1").map((r) => [r.throwIndex, r]));
  const rev = new Map(rows.filter((r) => r.type === "game_reveal").map((r) => [r.throwIndex, r]));
  const rec = new Map(rows.filter((r) => r.type === "recognition_result").map((r) => [r.throwIndex, r]));
  const t0 = rows.find((r) => r.type === "page_load")?.ts;
  for (const a of rows.filter((r) => r.type === "ai_aim_result").sort((x, y) => x.seq - y.seq)) {
    const t = a.throwIndex, ph = p1.get(t), rv = rev.get(t), word = rv?.playerWord ?? rec.get(t)?.finalWord ?? null;
    const call = rv?.playerCallNumber ?? W[word] ?? null;
    hist.push({ sessionId: a.sessionId, atIso: new Date((t0 ? Date.parse(t0) : 0) + a.tPerf).toISOString(), playerFingers: a.actualPlayerFingers, playerCall: call, playerWord: word, aiFingers: ph?.aiFingers ?? null, aiCall: ph?.aiCall ?? null, aiGuessPlayerFingers: a.guessPlayerFingers, aiLevel: a.level, verdictWinner: rv?.verdictWinner ?? null, syncOutcome: rv ? "synced" : "hand-only", syncDeltaMs: null, source: "partida" });
  }
}
const pct = (x) => (x == null ? "—" : (100 * x).toFixed(0) + "%");
console.log(`${hist.length} entries from ${files.length} session(s)\n`);
const o2 = core.computeOrder2(hist);
console.log("ORDER-2  H1", o2.h1.toFixed(2), "H2", o2.h2.toFixed(2), "of", o2.hMax.toFixed(2), "bits · top triples:", o2.triples.slice(0, 4).map((t) => `${t.a},${t.b}→${t.c} ${pct(t.p)} (${t.count}/${t.contextCount})`).join(" · "));
const st = core.computeSteps(hist);
console.log("STEPS    stay", pct(st.pStay), "±1", pct(st.pStepOne), "big", pct(st.pBigJump), "rise→rise", pct(st.riseAfterRise.rate), "fall→fall", pct(st.fallAfterFall.rate), "Δ", JSON.stringify(st.delta));
const rg = core.computeRegimes(hist);
console.log("REGIMES  share low/mid/high", pct(rg.share.low), pct(rg.share.mid), pct(rg.share.high), "· dwell low", rg.dwell.low.mean?.toFixed(1), "high", rg.dwell.high.mean?.toFixed(1), "· leave-high after 1..4:", [1, 2, 3, 4].map((k) => pct(rg.leaveHazard.high[k].rate)).join(" "), "· leave-low:", [1, 2, 3, 4].map((k) => pct(rg.leaveHazard.low[k].rate)).join(" "));
const rt = core.computeReturnTimes(hist);
console.log("RETURN   deck repeats-before-coverage", pct(rt.coverageCycles.rate), "· after gap≥5:", [1, 2, 3, 4, 5].map((d) => `${d}: ${pct(rt.perDigit[d].afterLongGap.rate)} vs base ${pct(rt.perDigit[d].base)}`).join(" · "));
const lp = core.computeLoops(hist);
console.log("LOOPS    bounce a-b-a", pct(lp.bounce.rate), "· lag match 1..6:", [1, 2, 3, 4, 5, 6].map((k) => pct(lp.autocorr[k].rate)).join(" "), "expected", pct(lp.autocorr[1].expected), "· longest run", lp.longestRun);
const wd = core.computeWeld(hist);
console.log("WELD     MI", wd.mutualInfoBits?.toFixed(3), "bits · favourite g|f:", [1, 2, 3, 4, 5].map((f) => `${f}→g${wd.gGivenF[f].favouriteG} ${pct(wd.gGivenF[f].favouriteP)}`).join(" · "), "· never called:", wd.neverCalled.join(","), "· tot", pct(wd.totAvoidance.rate));
const gs = core.computeGuessStats(hist);
console.log("GUESS    repeat", pct(gs.repeatG.rate), "chase", pct(gs.chase.rate), "chase-2", pct(gs.chaseTwoBack.rate), "echo its guess", pct(gs.echoRivalGuess.rate), "stubborn", pct(gs.stubbornAfterMiss.rate), "near-miss adjust", pct(gs.nearMissAdjust.rate));
const oc = core.computeOutcomeStats(hist);
console.log("OUTCOME  shift f after win/loss/parata", pct(oc.shiftF.player.rate), pct(oc.shiftF.ai.rate), pct(oc.shiftF.parata.rate), "· shift g", pct(oc.shiftG.player.rate), pct(oc.shiftG.ai.rate), pct(oc.shiftG.parata.rate), "· shift after read", pct(oc.shiftAfterRead.rate), "vs", pct(oc.shiftAfterNotRead.rate), "· chase own success", pct(oc.chaseOwnSuccess.rate), "· tilt H", oc.tilt.afterTwoLosses.h?.toFixed(2), "vs", oc.tilt.overall.h?.toFixed(2));
const rx = core.computeReactivity(hist);
console.log("REACT    f == its last guess", pct(rx.avoidRivalGuess.rate), "· mirror its fingers", pct(rx.mirrorRivalFingers.rate));
const rd = core.computeReaderStats(hist);
console.log("READER   hit its fingers", pct(rd.hitRivalFingers.rate), JSON.stringify(Object.fromEntries(Object.entries(rd.byLevel).map(([k, v]) => [k, pct(v.rate)]))), "· feeding", pct(rd.feeding.rate), "· it hit you", pct(rd.rivalHitYou.rate), "· fixed-guess ceiling", rd.fixedGuessCeiling.digit, pct(rd.fixedGuessCeiling.rate));
const tm = core.computeTiming(hist);
console.log("TIMING   interval by f (s):", [1, 2, 3, 4, 5].map((f) => `${f}: ${tm.intervalByF[f].meanS?.toFixed(2) ?? "—"}`).join(" "), "· misses by word:", Object.entries(tm.missByWord).sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([w, r]) => `${w} ${pct(r.rate)} (${r.n})`).join(" · "));
const fam = core.computePredictabilityByFamily(hist);
console.log("FAMILY   ", fam.map((x) => `${x.name} ${pct(x.rate)}`).join(" · "));
const t0 = performance.now();
const rk = core.rankExploitValue(hist);
console.log(`EXPLOIT  n=${rk.n} · read value ${rk.readValuePer100.toFixed(1)} pts/100 · rival ${rk.rivalPer100.toFixed(1)} / player ${rk.playerPer100.toFixed(1)} · (${(performance.now() - t0).toFixed(0)} ms)`);
for (const it of rk.items) console.log(`         ${it.name.padEnd(13)} alone ${it.pointsPer100 >= 0 ? "+" : ""}${it.pointsPer100.toFixed(1)} pts/100 (aim ${pct(it.aimAlone)})   marginal ${it.marginalPer100 >= 0 ? "+" : ""}${it.marginalPer100.toFixed(2)}`);
