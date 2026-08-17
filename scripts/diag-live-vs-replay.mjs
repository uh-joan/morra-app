// diag-live-vs-replay.mjs — reconcile the LIVE rival (fEdge logged at each
// commit) against a replay of the persisted history reconstructed from the
// session log, to catch the app handing the policy the wrong history.
//   node scripts/diag-live-vs-replay.mjs <sessionId> [L3|L4]
// Reports how many live edges reproduce with the history one row short
// (the 2026-08-17 stale-mint bug), the aim/outcomes at lag 1 vs lag 0, and
// the hide distribution at two anti-aim temperatures.
import { readFileSync } from "node:fs";
import * as core from "../packages/core/dist/index.js";
const W={u:1,un:1,una:1,dos:2,dues:2,tres:3,quatre:4,cinc:5,sis:6,set:7,vuit:8,nou:9,deu:10,"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10};
const SID=process.argv[2]??"93fc2f29", LVL=process.argv[3]??"L4";
const rows = readFileSync(new URL(`../spikes/logs/session-${SID}.ndjson`, import.meta.url),"utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l));
const commits = new Map(rows.filter(r=>r.type==="game_commit").map(r=>[r.commitmentHash,r]));
const p1 = new Map(rows.filter(r=>r.type==="rival_reveal_phase1").map(r=>[r.throwIndex,r]));
const revByT = new Map(rows.filter(r=>r.type==="game_reveal").map(r=>[r.throwIndex,r]));
const recByT = new Map(rows.filter(r=>r.type==="recognition_result").map(r=>[r.throwIndex,r]));
const aims = rows.filter(r=>r.type==="ai_aim_result").sort((a,b)=>a.seq-b.seq);
const V=[1,2,3,4,5];
const cur = aims.map(a=>{const t=a.throwIndex, ph=p1.get(t), rv=revByT.get(t); const c=ph?commits.get(ph.commitmentHash):null; const scored=!!rv&&rv.playerCallNumber!=null;
  const word = rv?.playerWord ?? recByT.get(t)?.finalWord ?? null; const call = scored? rv.playerCallNumber : (W[word]??null);
  return {live:c?.v2, level:a.level, scored, actual:a.actualPlayerFingers, guess:a.guessPlayerFingers, e:{playerFingers:a.actualPlayerFingers, playerCall: call, playerWord: word, aiFingers: ph?.aiFingers??null, aiCall: ph?.aiCall??null, aiGuessPlayerFingers: a.guessPlayerFingers, aiLevel:a.level, verdictWinner: rv?.verdictWinner??null, syncOutcome: scored?"synced":"x", source:"partida"}};});
const H=cur.map(x=>x.e);
// verify: live commit k saw H[0..k-2] (one stale)
let m=0,n=0; for (let k=0;k<cur.length;k++){ const x=cur[k]; if(x.level!==LVL||x.live?.fEdge==null) continue; n++; const rep=core.predictPlayerFV2(LVL,H.slice(0,Math.max(0,k-1))); if(Math.abs(rep.edge-x.live.fEdge)<1e-6) m++; }
console.log(`stale-by-one hypothesis: ${m}/${n} live edges reproduced exactly`);
// aim: live vs replay(stale) vs replay(fresh), argmax and sampled (3 seeds)
const mk=(s)=>{let a=s;return()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};};
for (const lag of [1,0]) {
  let N=0,arg=0,liveHit=0; const smp=[0,0,0]; const rngs=[mk(1),mk(2),mk(3)];
  for (let k=0;k<cur.length;k++){ const x=cur[k]; if(x.level!==LVL||!x.scored||k<6) continue; const h=H.slice(0,k-lag);
    const b=core.predictPlayerFV2(LVL,h).dist; const am=V.reduce((p,v)=>b[v]>b[p]?v:p,1); N++; arg+=am===x.actual; liveHit+=x.guess===x.actual;
    rngs.forEach((r,i)=>{ smp[i]+= core.decideMoveV2(LVL,{next:r},h).guessPlayerFingers===x.actual; }); }
  console.log(`lag ${lag}: rounds ${N} · live aim ${(liveHit/N*100).toFixed(1)}% · replay argmax ${(arg/N*100).toFixed(1)}% · replay sampled ${smp.map(s=>(s/N*100).toFixed(1)).join("/")}%`);
}
for (const lag of [1,0]) for (const seed of [1,2,3]) {
  const r=mk(seed); let N=0,rw=0,pw=0,aim=0,hit=0; const g={},f={};
  for (let k=0;k<cur.length;k++){ const x=cur[k]; if(x.level!==LVL||!x.scored||k<6) continue; const h=H.slice(0,k-lag);
    const mv=core.decideMoveV2(LVL,{next:r},h); const pg=x.e.playerCall-x.e.playerFingers; N++;
    const a=mv.guessPlayerFingers===x.actual, p=pg===mv.fingers; aim+=a; hit+=p; if(a&&!p)rw++; else if(p&&!a)pw++; g[mv.guessPlayerFingers]=(g[mv.guessPlayerFingers]??0)+1; f[mv.fingers]=(f[mv.fingers]??0)+1; }
  console.log(`lag ${lag} seed ${seed}: aim ${(aim/N*100).toFixed(0)}% hit ${(hit/N*100).toFixed(0)}% → rival ${(rw/N*100).toFixed(0)}% / player ${(pw/N*100).toFixed(0)}%  fingers ${V.map(v=>f[v]??0).join(" ")}`);
}
console.log("live: aim 10% hit 21% → rival 10% / player 20%");
for (const [t,ts] of [[0.04,0.12],[0.08,0.25]]) { core.V2_TUNING.antiT=t; core.V2_TUNING.antiTSelfWatch=ts; let sumF=[0,0,0,0,0,0], hits=0, N=0;
  for (const seed of [1,2,3]) { const r=mk(seed); for (let k=6;k<cur.length;k++){ const x=cur[k]; if(x.level!==LVL||!x.scored) continue; const mv=core.decideMoveV2(LVL,{next:r},H.slice(0,k)); sumF[mv.fingers]++; N++; hits+= (x.e.playerCall-x.e.playerFingers)===mv.fingers; } }
  console.log(`antiT ${t}/${ts}: fingers ${V.map(v=>(sumF[v]/N*100).toFixed(0)).join(" ")}  player-hit ${(hits/N*100).toFixed(1)}%`); }
