#!/usr/bin/env node
// Integration smoke for apps/play: drives the BUILT app (dist/) headless
// with Chrome's fake media devices, through the real start buttons and the
// window.__play seam (same-signature port of the spike's __s03). SKIPs
// (exit 0) without a local Chrome; FAILs if dist/ is missing (build first:
// pnpm --filter @morra/play build).
//
// ux-pirates: the app boots on a title screen; the manual sensor buttons
// live there (same ids). After the sensors are up we enter the fight the
// way a player does — through the character select — before exercising the
// game surfaces.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { serve, findChrome, launchWithFakeDevices, makeReporter } from "../lib.mjs";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = join(APP_ROOT, "dist");

if (!existsSync(join(DIST, "index.html"))) {
  console.error("FAIL - apps/play integration: dist/ missing — run `pnpm --filter @morra/play build` first.");
  process.exit(1);
}
const chrome = findChrome();
if (!chrome) {
  console.log("SKIP - apps/play integration: no local Chrome found (set CHROME_PATH to override).");
  process.exit(0);
}

const r = makeReporter("apps/play integration");
const srv = await serve(DIST);
const browser = await launchWithFakeDevices(chrome);
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
let promptText = null; // what the next prompt() dialog answers with
page.on("dialog", (d) => d.accept(promptText ?? undefined));

await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "networkidle0" });

// Shell
r.check("7 status chips render", (await page.$$eval(".status-chip", (n) => n.length)) === 7);
r.check("session id in footer", /session [0-9a-f]{8}/.test(await page.$eval("#sessionIdFooter", (n) => n.textContent)));
r.check("commitment minted at boot", /Opponent committed: [0-9a-f]{8}/.test(await page.$eval("#aiCommitStatus", (n) => n.textContent)));
r.check("boots on the title screen", (await page.evaluate(() => document.body.dataset.screen)) === "title");

// Gesture-gated sensors (the manual buttons on the title screen)
await page.click("#btnCam");
await page.click("#btnMic");
await page.waitForFunction(() => window.__play && window.__play.syncReady(), { timeout: 60000 });
r.check("camera chip ok", /@ \d+fps|\d+x\d+/.test(await page.$eval("#chipCamera .detail", (n) => n.textContent)));
r.check("model loaded", /loaded/.test(await page.$eval("#chipModel .detail", (n) => n.textContent)));
r.check("mic running", (await page.$eval("#chipMic .detail", (n) => n.textContent)) === "running");
r.check("audio clock live after gesture", /outputLatency ok|baseLatency/.test(await page.$eval("#chipClock .detail", (n) => n.textContent)));

// Enter the fight through the character select (the harness bypassed the
// "Juga" onboarding by starting the sensors directly, so navigate there).
await page.evaluate(() => { document.body.dataset.screen = "select"; });
await page.click("#pirateCard-L2");
await page.waitForFunction(() => document.body.dataset.screen === "fight", { timeout: 5000 });
await page.waitForFunction(() => !document.body.classList.contains("vs-on"), { timeout: 5000 });
r.check("character select enters the fight", true);
r.check("stage scenery mounted", (await page.$$eval("#stageScenery svg", (n) => n.length)) >= 1);
r.check("corsair figure mounted", (await page.$$eval("#rivalAvatar svg", (n) => n.length)) === 1);

// A full synced round via the seam (word injected; no vosk download needed)
const round = await page.evaluate(async () => {
  const now = performance.now();
  window.__play.onSyncHandOnset(now - 50, now - 150, 4);
  const t = window.__play.syncThrows[window.__play.syncThrows.length - 1];
  const t0 = performance.now();
  while (!t.rivalRevealed && performance.now() - t0 < 2000) await new Promise((r2) => setTimeout(r2, 10));
  const ai = t.revealedAiMove;
  const map = { 2: "dos", 3: "tres", 4: "quatre", 5: "cinc", 6: "sis", 7: "set", 8: "vuit", 9: "nou", 10: "deu" };
  const total = 4 + ai.fingers;
  window.__play.applyRecognizedWord(t, map[total]);
  window.__play.finalizeSyncThrow(t, t.debugRec, t.handOnsetPerfTime + 60, false);
  const t1 = performance.now();
  while (!t.gameHandled && performance.now() - t1 < 2000) await new Promise((r2) => setTimeout(r2, 10));
  return {
    revealed: t.rivalRevealed, outcome: t.outcome, gameHandled: t.gameHandled,
    expected: ai.call === total ? "parata" : "player",
    winner: window.__play.matchHistory[window.__play.matchHistory.length - 1]?.verdictWinner ?? null,
    aiFingers: ai.fingers,
  };
});
r.check("phase-1 reveal fired", round.revealed);
r.check("throw classified synced", round.outcome === "synced", round.outcome);
r.check("round resolved once", round.gameHandled);
r.check("verdict matches rules", round.winner === round.expected, `winner=${round.winner} expected=${round.expected}`);
r.check(
  "rival SVG shows revealed fingers",
  (await page.$$eval("#rivalHandSvg .finger.extended", (n) => n.length)) === round.aiFingers
);
r.check("scoreboard updated or parata", /Tu [01] — [01] Rival/.test(await page.$eval("#scoreboard", (n) => n.textContent)));
r.check("verdict card shows SYNCED", /SYNCED/.test(await page.$eval("#verdictResult", (n) => n.textContent)));
r.check(
  "treasure coins mirror the scoreboard",
  await page.evaluate(() => {
    const m = /Tu (\d+) — (\d+) Rival/.exec(document.getElementById("scoreboard").textContent);
    const lit = (id) => document.querySelectorAll(`#${id} .coin.full`).length;
    return m && lit("coinsPlayer") === parseInt(m[1], 10) && lit("coinsRival") === parseInt(m[2], 10);
  })
);

// Throw-of-one reveal rule (core shouldRevealPhase1From): a settle at 1
// reveals iff the hand came from a resting fist. Each throw here is left
// silent and finalized as-is so it never resolves a round — we only look
// at whether phase 1 fired. Between throws the ready pill needs a count
// change (handHasResetSince) — the seam's onset does that on its own.
const oneRule = await page.evaluate(async () => {
  const P = window.__play;
  const fire = async (fingers, preOnset, voiceOffsetMs = null) => {
    const now = performance.now();
    P.onSyncHandOnset(now - 50, now - 150, fingers, preOnset);
    const t = P.syncThrows[P.syncThrows.length - 1];
    await new Promise((r2) => setTimeout(r2, 60));
    const revealed = !!t.rivalRevealed;
    // silent unless a voice offset (ms from the anchor) is given
    P.finalizeSyncThrow(t, t.debugRec, voiceOffsetMs == null ? null : t.handOnsetPerfTime + voiceOffsetMs, false);
    await new Promise((r2) => setTimeout(r2, 60));
    const card = document.getElementById("roundResultText")?.textContent ?? "";
    // A RESOLVED throw records its count as lastThrownFingerCount and puts
    // the pill on "Torna al puny…"; a reset touches neither. (The pill
    // itself can't be asserted here: the fake camera has no hand, so the
    // very next frame's null count re-arms it — the spike's own hand-gone
    // rule. At a real camera the thumb stays in view and the pill holds.)
    return { revealed, outcome: t.outcome, lastThrown: P.lastThrownFingerCount, card };
  };
  return {
    fromFist0: await fire(1, 0),
    fromFist1: await fire(1, 1),
    fromHeld3: await fire(1, 3),
    unknown: await fire(1, undefined),
    zeroFromFist: await fire(0, 0),
    // the 2026-08-17 session bug: a retraction whose window carried a (clip-
    // tail) voice onset was classified voice-early and recorded as a throw
    fromHeld3WithVoice: await fire(1, 3, -400),
    fromHeld4WithVoice: await fire(0, 4, 50),
  };
});
r.check("a 1 coming down from a held 3 WITH a voice onset is still a reset (was voice-early)", oneRule.fromHeld3WithVoice.outcome === "reset", oneRule.fromHeld3WithVoice.outcome);
r.check("a 0 coming down from a held 4 WITH a voice onset is still a reset", oneRule.fromHeld4WithVoice.outcome === "reset", oneRule.fromHeld4WithVoice.outcome);
r.check("neither retraction resolved anything (lastThrownFingerCount unchanged)", oneRule.fromHeld3WithVoice.lastThrown === oneRule.fromFist1.lastThrown && oneRule.fromHeld4WithVoice.lastThrown === oneRule.fromFist1.lastThrown);
r.check("throw of ONE from a fist (pre-onset 0) reveals", oneRule.fromFist0.revealed);
r.check("throw of ONE from a fist that reads 1 reveals", oneRule.fromFist1.revealed);
r.check("a 1 coming down from a held 3 is a retraction — no reveal", !oneRule.fromHeld3.revealed);
r.check("a 1 with unknown pre-onset keeps the spike answer — no reveal", !oneRule.unknown.revealed);
r.check("a 0 never reveals", !oneRule.zeroFromFist.revealed);
// …and a SILENT throw of one is a throw, not a reset: hand-only → the round
// is void (revealed move burned) and the pill waits for the fist.
r.check("silent 1 from a fist classifies hand-only (not reset)", oneRule.fromFist0.outcome === "hand-only", oneRule.fromFist0.outcome);
r.check("silent 1 from a fist voids the round (RONDA ANUL·LADA)", /ANUL/i.test(oneRule.fromFist0.card), oneRule.fromFist0.card.slice(0, 60));
r.check("silent 1 from a fist RESOLVES (lastThrownFingerCount=1 → pill 'Torna al puny')", oneRule.fromFist0.lastThrown === 1, String(oneRule.fromFist0.lastThrown));
r.check("silent 1 down from a held 3 is still a reset", oneRule.fromHeld3.outcome === "reset", oneRule.fromHeld3.outcome);
r.check("a reset does not resolve (lastThrownFingerCount unchanged)", oneRule.fromHeld3.lastThrown === oneRule.fromFist1.lastThrown, String(oneRule.fromHeld3.lastThrown));
// Every seam onset above ALSO queued the app's own analysis drain, which
// re-finalizes the same throw ~SYNC_POST_MS later off the fake mic. Let all
// of those land before moving on: two of these throws are now real
// (hand-only) throws, and a re-finalize arriving while the harness is in
// Entrenament would record them into the profile at a random moment and
// flake the profile checks. (The real app never double-finalizes — only
// the drain finalizes there.)
// "Landed" = the drain ran (debugRec.recognition exists) AND its extraction
// resolved (windowStartCtxTime set, or skipped) — the drain's own
// finalizeSyncThrow runs synchronously right after that.
await page.waitForFunction(() =>
  window.__play.syncPendingAnalysisCount === 0 &&
  window.__play.syncThrows.filter((t) => t.handOnsetPerfTime != null).every((t) => {
    const rec = t.debugRec && t.debugRec.recognition;
    return !!rec && (rec.windowStartCtxTime != null || rec.skipped);
  }),
  { timeout: 10000 });

// Entrenament switch renders L'Espill from real history
await page.click("#btnModeEntrenament");
r.check("training panel visible", (await page.$eval("#trainingPanel", (n) => n.style.display)) === "block");
r.check("heatmap renders 25 cells", (await page.$$eval("#bigramHeatmap .hm-cell", (n) => n.length)) === 25);
r.check("sample count rendered", /tir/.test(await page.$eval("#trainingSampleCount", (n) => n.textContent)));

// Calibratge (per profile + camera). The fake camera has no hand, so the
// guided steps can't run end-to-end here; what CAN be checked: the section,
// the panel open/close, the seam-driven apply/save into the live sliders,
// and that the fit persists per profile and per device.
r.check("calibratge section in L'Espill, uncalibrated status", /Sense calibrar|per defecte/.test(await page.$eval("#calibStatus", (n) => n.textContent)));
await page.click("#btnCalibrate");
r.check("calibratge opens on 'Enquadra' with the ghost hand on", await page.evaluate(() =>
  document.body.dataset.calibrating === "on" && document.body.dataset.calib === "frame" && window.__play.calibration.active));
r.check("framing reports no hand (fake camera)", await page.evaluate(() => window.__play.framing.hint === "no-hand"));
await page.click("#calibClose");
r.check("close stops calibration, ghost hand off", await page.evaluate(() =>
  document.body.dataset.calibrating === undefined && !window.__play.calibration.active));
const before = await page.evaluate(() => window.__play.calibration.currentValues());
await page.evaluate(() => window.__play.calibration.save({
  values: { highV: 0.62, lowV: 0.21, vadMult: 4.5 }, fitVersion: 2, measuredAt: new Date().toISOString(),
  samples: { jitterP95: 0.1, throwPeaks: [1, 1, 1, 1], ambientFloor: 0.01, shoutPeaks: [0.2, 0.2, 0.2], prompts: [] },
}));
r.check("saved fit is applied INTO the live sliders", await page.evaluate(() =>
  document.getElementById("tuneHighV").value === "0.62" && document.getElementById("tuneLowV").value === "0.21" && document.getElementById("tuneVadMult").value === "4.5"));
r.check("status shows calibrated", /Calibrat/.test(await page.$eval("#calibStatus", (n) => n.textContent)));
r.check("persisted per profile+device", await page.evaluate(() => {
  const key = "morra-calibration-v1:" + window.__play.activeProfileId;
  const blob = JSON.parse(localStorage.getItem(key) || "null");
  return !!blob && !!blob.byDevice[window.__play.calibration.deviceKey] && blob.byDevice[window.__play.calibration.deviceKey].values.highV === 0.62;
}));
// A record fitted by an older rule is re-fit from its saved samples on apply
// (fit v1 → v2 here, using jani's real session): the values must change and
// the record must be re-stamped, without redoing the session.
await page.evaluate(() => {
  const key = "morra-calibration-v1:" + window.__play.activeProfileId;
  const blob = JSON.parse(localStorage.getItem(key));
  blob.byDevice[window.__play.calibration.deviceKey] = {
    values: { highV: 0.81, lowV: 0.24, vadMult: 12 }, measuredAt: new Date().toISOString(), // v1 (no fitVersion)
    samples: { jitterP95: 0.1115, throwPeaks: [1.168, 0.576, 1.797, 2.483, 4.501], ambientFloor: 0.00005, shoutPeaks: [0.407, 0.663, 0.404, 0.495, 0.420], prompts: [] },
  };
  localStorage.setItem(key, JSON.stringify(blob));
  window.__play.calibration.applyForActiveProfile();
});
r.check("stale (v1) record is re-fit from its samples on apply: HIGH_V under the thumb-1, vadMult off the cap", await page.evaluate(() => {
  const hv = parseFloat(document.getElementById("tuneHighV").value), vm = parseFloat(document.getElementById("tuneVadMult").value);
  const key = "morra-calibration-v1:" + window.__play.activeProfileId;
  const rec = JSON.parse(localStorage.getItem(key)).byDevice[window.__play.calibration.deviceKey];
  return hv < 0.576 * 0.8 && hv > 0.3 && vm < 12 && vm > 4 && rec.fitVersion === 2;
}), await page.evaluate(() => document.getElementById("tuneHighV").value + "/" + document.getElementById("tuneVadMult").value));
await page.click("#calibReset");
r.check("Restableix returns the sliders to the app defaults and clears the record", await page.evaluate(() =>
  document.getElementById("tuneHighV").value === "0.5" && document.getElementById("tuneVadMult").value === "6" && /Sense calibrar/.test(document.getElementById("calibStatus").textContent)));
r.check("(sliders were at defaults before too)", before.highV === 0.5 && before.vadMult === 6, JSON.stringify(before));

// Profiles: default = legacy key; create/switch/delete isolate histories
r.check("boots with the default profile only", await page.evaluate(() =>
  window.__play.activeProfileId === "default" && window.__play.profiles.length === 1));
r.check("delete disabled for the default profile", await page.$eval("#btnDeleteProfile", (n) => n.disabled));
const defaultThrows = await page.evaluate(() => window.__play.playerModel.throws.length);
r.check("default profile carries this session's history", defaultThrows >= 1, `throws=${defaultThrows}`);
// give the default profile a calibration fit, to prove it does NOT leak into a new profile
await page.evaluate(() => window.__play.calibration.save({
  values: { highV: 0.71, lowV: 0.2, vadMult: 3.5 }, fitVersion: 2, measuredAt: new Date().toISOString(),
  samples: { jitterP95: 0.1, throwPeaks: [1, 1, 1, 1], ambientFloor: 0.01, shoutPeaks: [0.2, 0.2, 0.2], prompts: [] },
}));
promptText = "Bea";
await page.click("#btnNewProfile");
promptText = null;
r.check("new profile activates with a fresh empty model", await page.evaluate(() =>
  window.__play.activeProfileId !== "default" && window.__play.playerModel.throws.length === 0));
r.check("new profile gets the app-default sensor values, not the default profile's fit", await page.evaluate(() =>
  document.getElementById("tuneHighV").value === "0.5" && document.getElementById("tuneVadMult").value === "6"));
r.check("select shows both profiles", (await page.$$eval("#selProfile option", (n) => n.length)) === 2);
r.check("match reset for the new player", /Tu 0 — 0 Rival/.test(await page.$eval("#scoreboard", (n) => n.textContent)));
r.check("delete enabled for a non-default profile", await page.$eval("#btnDeleteProfile", (n) => !n.disabled));
await page.select("#selProfile", "default");
r.check("switching back restores the default profile's history", await page.evaluate((expected) =>
  window.__play.activeProfileId === "default" && window.__play.playerModel.throws.length === expected, defaultThrows));
r.check("…and re-applies the default profile's calibration fit", await page.evaluate(() =>
  document.getElementById("tuneHighV").value === "0.71" && document.getElementById("tuneVadMult").value === "3.5"));
await page.evaluate(() => document.getElementById("calibReset").click()); // leave the sliders at defaults for the rest
const beaId = await page.$$eval("#selProfile option", (n) => n.map((o) => o.value).find((v) => v !== "default"));
await page.select("#selProfile", beaId);
await page.click("#btnDeleteProfile"); // confirm auto-accepted
r.check("deleting the active profile falls back to default", await page.evaluate(() =>
  window.__play.activeProfileId === "default" && window.__play.profiles.length === 1));

// Mode tècnic: hidden by default, T toggles the drawer
r.check("tècnic drawer hidden by default", await page.evaluate(() =>
  getComputedStyle(document.getElementById("tecnicDrawer")).display === "none"));
await page.keyboard.press("t");
r.check("T opens the tècnic drawer", await page.evaluate(() =>
  getComputedStyle(document.getElementById("tecnicDrawer")).display !== "none"));
await page.keyboard.press("t");

// Entorn preset (iteration-2 noisy-venue bundle) — lives on the title screen
await page.evaluate(() => { document.body.dataset.screen = "title"; });
r.check("entorn toggle renders, tranquil active by default", await page.evaluate(() => {
  const active = document.querySelectorAll("#entornToggle button.active");
  return active.length === 1 && active[0].dataset.entorn === "tranquil";
}));
await page.click('#entornToggle button[data-entorn="sorollos"]');
r.check("entorn switch activates sorollós and persists", await page.evaluate(() =>
  document.querySelector('#entornToggle button[data-entorn="sorollos"]').classList.contains("active") &&
  localStorage.getItem("morra_entorn") === "sorollos"));
// the switch restarts the mic under the new constraints — wait for it, don't sleep
await page.waitForFunction(() => document.querySelector("#chipMic .detail").textContent === "running", { timeout: 10000 });
r.check("mic running again after the entorn restart", true);
await page.click('#entornToggle button[data-entorn="tranquil"]');
await page.waitForFunction(() => document.querySelector("#chipMic .detail").textContent === "running", { timeout: 10000 });
r.check("entorn switch back to tranquil restores the mic", true);

// DSP override (iteration-2 fix #4): pinned independently of the preset,
// and it takes the same mic-restart path the preset does. It lives in the
// tècnic drawer, which the block above left closed — reopen to click it.
await page.keyboard.press("t");
r.check("dsp override defaults to auto", await page.evaluate(() => {
  const active = document.querySelectorAll("#dspToggle button.active");
  return active.length === 1 && active[0].dataset.dsp === "auto";
}));
await page.click('#dspToggle button[data-dsp="on"]');
r.check("dsp pinned on in tranquil, persisted", await page.evaluate(() =>
  document.querySelector('#dspToggle button[data-dsp="on"]').classList.contains("active") &&
  localStorage.getItem("morra_dsp") === "on"));
await page.waitForFunction(() => document.querySelector("#chipMic .detail").textContent === "running", { timeout: 10000 });
r.check("mic running again after the dsp restart", true);
await page.click('#dspToggle button[data-dsp="auto"]');
await page.waitForFunction(() => document.querySelector("#chipMic .detail").textContent === "running", { timeout: 10000 });
r.check("dsp back to auto restores the mic", true);
await page.keyboard.press("t"); // leave the drawer as this block found it

// Error surfacing
await page.evaluate(() => { setTimeout(() => { throw new Error("integration probe"); }); });
await new Promise((r2) => setTimeout(r2, 300));
r.check("error panel surfaces runtime errors", (await page.$eval("#errorPanel", (n) => getComputedStyle(n).display)) === "block");

const unexpected = pageErrors.filter((e) => !/integration probe/.test(e));
r.check("no unexpected page errors", unexpected.length === 0, unexpected.join("; "));

// Corpus recorder (?rec=1): absent by default, present + inert when armed.
r.check("recorder strip absent without ?rec=1", (await page.$$eval(".rec-strip", (n) => n.length)) === 0);
const page2 = await browser.newPage();
await page2.goto(`http://127.0.0.1:${srv.address().port}/?rec=1`, { waitUntil: "networkidle0" });
r.check("recorder strip mounts under ?rec=1", (await page2.$$eval(".rec-strip", (n) => n.length)) === 1);
r.check("recorder starts idle with no frames", await page2.evaluate(() => window.__rec && window.__rec.frames.length === 0));
await page2.evaluate(() => { window.__rec.label(4); window.__rec.start(); });
r.check("recorder R/label/start reflect in the status line", /REC.*truth=4/.test(await page2.$eval("#recStatus", (n) => n.textContent)));
await page2.close();

await browser.close();
srv.close();
r.finish();
