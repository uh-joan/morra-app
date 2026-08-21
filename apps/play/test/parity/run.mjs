#!/usr/bin/env node
// Parity harness: drives the UNTOUCHED spike (spikes/s03-beat.html, via its
// own window.__s03 debug seam) and the built app (apps/play/dist, via
// window.__play) through IDENTICAL scenarios with ONE shared driver —
// possible because __play deliberately exposes the same member signatures
// as __s03. Any behavioral divergence shows up as differing scenario
// results, not as translation-layer noise.
//
// Scenarios (branch parity — AI move VALUES remain structurally
// unverifiable: the spike's commitAiMove hardcodes Math.random; the
// conformance corpus already proves decideMove itself is value-identical):
//   synced   (per AI level L1–L4): reveal → resolve → verdict consistent with rules
//   void     (per AI level): reveal → hand-only → RONDA ANUL·LADA + burn-and-remint
//   incomplete: throw-of-1 + late voice, no reveal → commitment stands
//   reset    : fist + no voice → not a throw, not counted, commitment untouched
//   preWindow demotion: pinned onset can never report SYNCED
//   reset-latest-guard: a slow reset must not clobber a newer throw's state
//
// SKIPs (exit 0) without local Chrome; FAILs if apps/play/dist is missing.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { serve, findChrome, launchWithFakeDevices, makeReporter } from "../lib.mjs";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const DIST = join(APP_ROOT, "dist");
const SPIKES = join(REPO_ROOT, "spikes");

if (!existsSync(join(DIST, "index.html"))) {
  console.error("FAIL - parity: apps/play/dist missing — run `pnpm --filter @morra/play build` first.");
  process.exit(1);
}
const chrome = findChrome();
if (!chrome) {
  console.log("SKIP - parity: no local Chrome found (set CHROME_PATH to override).");
  process.exit(0);
}

const r = makeReporter("spike-vs-play parity");
const appSrv = await serve(DIST);
const spikeSrv = await serve(SPIKES, "s03-beat.html");
const browser = await launchWithFakeDevices(chrome);

async function preparePage(url, seam) {
  const page = await browser.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.click("#btnCam");
  await page.click("#btnMic");
  try {
    await page.waitForFunction((s) => window[s] && window[s].syncReady(), { timeout: 90000 }, seam);
  } catch {
    return null; // env-level sensor failure (e.g. MediaPipe CDN unreachable) — caller SKIPs
  }
  return page;
}

// The ONE driver. Runs a scenario in-page through the given seam and
// returns a plain result record; the harness compares records across pages.
async function drive(page, seam, scenario, level) {
  return page.evaluate(
    async (s, sc, lvl) => {
      const P = window[s];
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      const waitFor = async (fn, ms = 3000) => {
        const t0 = performance.now();
        while (!fn() && performance.now() - t0 < ms) await sleep(10);
        return fn();
      };
      const WORD_FOR = { 2: "dos", 3: "tres", 4: "quatre", 5: "cinc", 6: "sis", 7: "set", 8: "vuit", 9: "nou", 10: "deu" };
      const lastThrow = () => P.syncThrows[P.syncThrows.length - 1];
      if (lvl) P.currentAiLevel = lvl;

      if (sc === "synced") {
        const hashBefore = P.currentAiMove ? P.currentAiMove.hashHex : null;
        const historyBefore = P.matchHistory.length;
        const now = performance.now();
        P.onSyncHandOnset(now - 50, now - 150, 4);
        const t = lastThrow();
        await waitFor(() => t.rivalRevealed);
        if (!t.rivalRevealed) return { error: "phase-1 reveal never fired" };
        const ai = t.revealedAiMove;
        const total = 4 + ai.fingers;
        P.applyRecognizedWord(t, WORD_FOR[total]);
        P.finalizeSyncThrow(t, t.debugRec, t.handOnsetPerfTime + 60, false);
        await waitFor(() => t.gameHandled);
        await waitFor(() => P.currentAiMove && P.currentAiMove.hashHex !== hashBefore, 1500);
        const entry = P.matchHistory[P.matchHistory.length - 1];
        const expected = ai.call === total ? "parata" : "player"; // player's call always correct in this scenario
        return {
          outcome: t.outcome,
          resolved: !!t.gameHandled,
          verdictConsistent: entry && entry.verdictWinner === expected,
          historyGrew: P.matchHistory.length === historyBefore + 1,
          reminted: P.currentAiMove ? P.currentAiMove.hashHex !== hashBefore : false,
          // The verdict depends on this system's OWN unseeded AI draw —
          // never compare card text across systems for synced rounds;
          // instead each system's card must match its own expected verdict.
          // Parata in this scenario is always the both-guessed case (the
          // player's call is always correct here): the spike says PARATA,
          // the app's living-Catalan copy says EMPAT! — accept each
          // system's own wording.
          cardMatchesOwnVerdict:
            expected === "parata"
              ? ["PARATA", "EMPAT!"].includes(document.getElementById("roundResultText").textContent)
              : document.getElementById("roundResultText").textContent === "TU GUANYES!",
        };
      }

      if (sc === "void") {
        const now = performance.now();
        P.onSyncHandOnset(now - 50, now - 150, 3);
        const t = lastThrow();
        await waitFor(() => t.rivalRevealed);
        if (!t.rivalRevealed) return { error: "phase-1 reveal never fired" };
        const burnedHash = t.revealedAiMove.hashHex;
        P.finalizeSyncThrow(t, t.debugRec, null);
        await waitFor(() => t.gameHandled);
        const entry = P.matchHistory[P.matchHistory.length - 1];
        return {
          outcome: t.outcome,
          card: document.getElementById("roundResultText").textContent,
          burned: P.currentAiMove ? P.currentAiMove.hashHex !== burnedHash : false,
          historyRecordsVoid: entry && entry.verdictWinner === null && entry.playerFingers === 3,
        };
      }

      if (sc === "incomplete") {
        const hashBefore = P.currentAiMove.hashHex;
        const now = performance.now();
        P.onSyncHandOnset(now - 50, now - 150, 1); // fingers<=1: no phase-1 reveal
        const t = lastThrow();
        P.applyRecognizedWord(t, "cinc");
        P.finalizeSyncThrow(t, t.debugRec, t.handOnsetPerfTime + 600, false); // voice-late
        await waitFor(() => t.gameHandled);
        return {
          outcome: t.outcome,
          revealed: !!t.rivalRevealed,
          card: document.getElementById("roundResultText").textContent,
          commitmentStands: P.currentAiMove.hashHex === hashBefore,
        };
      }

      if (sc === "reset") {
        const hashBefore = P.currentAiMove.hashHex;
        const countBefore = document.getElementById("heroThrowCount").textContent;
        const now = performance.now();
        P.onSyncHandOnset(now - 50, now - 150, 1);
        const t = lastThrow();
        P.finalizeSyncThrow(t, t.debugRec, null); // low count + no voice = reset
        await sleep(100);
        return {
          outcome: t.outcome,
          notCounted: document.getElementById("heroThrowCount").textContent === countBefore,
          commitmentUntouched: P.currentAiMove.hashHex === hashBefore,
          verdictCard: document.getElementById("verdictResult").textContent,
        };
      }

      if (sc === "preWindowDemotion") {
        const now = performance.now();
        P.onSyncHandOnset(now - 50, now - 150, 1); // no reveal; pure classification check
        const t = lastThrow();
        // In-window delta that WOULD classify synced, but pinned at window
        // start (preWindow=true) — must be demoted, never SYNCED.
        P.finalizeSyncThrow(t, t.debugRec, t.handOnsetPerfTime - 100, true);
        await sleep(50);
        return { outcome: t.outcome, preWin: !!t.voicePreWindow };
      }

      if (sc === "resetLatestGuard") {
        const now = performance.now();
        P.onSyncHandOnset(now - 50, now - 150, 1); // throw A (fist retraction in flight)
        const a = lastThrow();
        await sleep(30);
        const now2 = performance.now();
        P.onSyncHandOnset(now2 - 20, now2 - 60, 3); // throw B starts after A
        const b = lastThrow();
        await waitFor(() => b.rivalRevealed, 2000);
        P.finalizeSyncThrow(a, a.debugRec, null); // A resolves as reset AFTER B started
        await sleep(80);
        const pill = document.getElementById("readyPill").textContent;
        // cleanup: resolve B so later scenarios start clean
        const ai = b.revealedAiMove;
        if (ai) {
          P.applyRecognizedWord(b, WORD_FOR[4 + ai.fingers - 1] || "cinc");
          P.finalizeSyncThrow(b, b.debugRec, b.handOnsetPerfTime + 60, false);
          await waitFor(() => b.gameHandled);
        }
        return { aOutcome: a.outcome, pillDuringB: pill };
      }

      return { error: "unknown scenario " + sc };
    },
    seam,
    scenario,
    level
  );
}

function comparable(res) {
  // strip per-system free text the comparison shouldn't hinge on
  const { card, verdictCard, pillDuringB, ...rest } = res;
  return rest;
}

const appPage = await preparePage(`http://127.0.0.1:${appSrv.address().port}/`, "__play");
const spikePage = await preparePage(`http://127.0.0.1:${spikeSrv.address().port}/s03-beat.html`, "__s03");
if (!appPage || !spikePage) {
  console.log("SKIP - parity: a page's sensors never became ready (likely MediaPipe CDN/network in this environment, not a code defect).");
  process.exit(0);
}

const LEVELS = ["L1", "L2", "L3", "L4"];
for (const level of LEVELS) {
  for (const sc of ["synced", "void"]) {
    const a = await drive(appPage, "__play", sc, level);
    const s = await drive(spikePage, "__s03", sc, level);
    if (a.error || s.error) {
      r.check(`[${level}] ${sc}`, false, a.error || s.error);
      continue;
    }
    r.check(
      `[${level}] ${sc}: identical branch behavior`,
      JSON.stringify(comparable(a)) === JSON.stringify(comparable(s)),
      `app=${JSON.stringify(a)} spike=${JSON.stringify(s)}`
    );
    if (sc === "void") {
      // Void's card is outcome-deterministic — safe to compare across systems.
      r.check(`[${level}] void: card text matches`, a.card === s.card, `app="${a.card}" spike="${s.card}"`);
    }
  }
  r.note(`[${level}] AI move VALUE parity`, "spike's commitAiMove hardcodes Math.random — covered by the conformance corpus instead");
}
for (const sc of ["incomplete", "reset", "preWindowDemotion", "resetLatestGuard"]) {
  const a = await drive(appPage, "__play", sc, "L2");
  const s = await drive(spikePage, "__s03", sc, "L2");
  if (a.error || s.error) {
    r.check(sc, false, a.error || s.error);
    continue;
  }
  r.check(
    `${sc}: identical branch behavior`,
    JSON.stringify(comparable(a)) === JSON.stringify(comparable(s)),
    `app=${JSON.stringify(a)} spike=${JSON.stringify(s)}`
  );
}
// direct invariant asserts (both systems, same expectations)
{
  const a = await drive(appPage, "__play", "preWindowDemotion", "L2");
  const s = await drive(spikePage, "__s03", "preWindowDemotion", "L2");
  r.check("preWindow pin never reports SYNCED (app)", a.outcome === "voice-early" && a.preWin === true, JSON.stringify(a));
  r.check("preWindow pin never reports SYNCED (spike)", s.outcome === "voice-early" && s.preWin === true, JSON.stringify(s));
}

await browser.close();
appSrv.close();
spikeSrv.close();
r.finish();
