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
// The whole suite exercises the no-vosk regime (words are injected via the
// seam; maybeResolveGameRound waits for recognition when voskLoaded()). The
// first-run flow clicks the Veu gate and the model IS served locally — stall
// that request forever so voskLoaded() stays false, like the original design.
await page.setRequestInterception(true);
page.on("request", (req) => {
  if (req.url().includes("vosk-model")) return; // never answered — "carregant…" forever
  req.continue().catch(() => {});
});
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
// Routes (2026-08-17): the hash mirrors screen+mode; back/forward and deep links apply
r.check("boot lands on #/", (await page.evaluate(() => location.hash)) === "#/");

// First run (2026-08-20): a fresh browser is gated behind the sign-on card.
// Naming yourself claims the default profile and chains: sensors (fake ones
// here) → the Calibratge page; any way out lands a jugar — the tripulants.
r.check("first-run gate is up on a fresh browser", (await page.evaluate(() => document.body.dataset.firstrun)) === "on");
await page.type("#firstrunName", "Grumet");
await page.click("#firstrunGo");
await page.waitForFunction(() => document.body.dataset.calibrating === "on", { timeout: 8000 });
r.check("first run: name → sensors → the Calibratge page", await page.evaluate(() => document.body.dataset.screen === "calib" && location.hash === "#/calibratge" && !!document.querySelector("#calibStage .video-wrap")));
r.check("first-run save button says where the flow goes", (await page.$eval("#calibSave", (n) => n.textContent)) === "Desa i a jugar");
await page.click("#calibClose");
await page.waitForFunction(() => document.body.dataset.screen === "select", { timeout: 3000 });
r.check("first run ends a jugar: the tripulants in Partida", await page.evaluate(() => document.body.dataset.mode === "partida" && location.hash === "#/tripulants?per=duel"));
r.check("the default profile carries the name from the card", await page.evaluate(() => window.__play.profiles.find((p) => p.id === "default").name === "Grumet"));
r.check("save button label restored after first run", (await page.$eval("#calibSave", (n) => n.textContent)) === "Desa per a aquest perfil");
await page.evaluate(() => { location.hash = "#/"; });
await page.waitForFunction(() => document.body.dataset.screen === "title", { timeout: 3000 });

// L'Espill is its own screen (2026-08-17): opens from the title without sensors, shows the coach card, tabs switch, back returns to port
await page.click("#doorEspill");
await page.waitForFunction(() => document.body.dataset.screen === "espill", { timeout: 3000 });
const espill = await page.evaluate(() => {
  const tab = document.querySelector('#espillTabs button[data-tab="numeros"]'); tab.click();
  return { screen: document.body.dataset.screen, coach: document.getElementById("coachSentence").textContent, label: document.getElementById("coachLabel").textContent, pane: document.getElementById("espillPanes").dataset.tab, tilesVisible: getComputedStyle(document.getElementById("trainingTiles")).display !== "none", modeBarHidden: getComputedStyle(document.querySelector(".bar-modes")).visibility === "hidden" };
});
r.check("L'Espill opens as its own screen from the title", espill.screen === "espill" && espill.modeBarHidden, JSON.stringify(espill));
r.check("coach card speaks with an empty profile", /encara no puc dir res|Cap punt feble|costum/i.test(espill.coach + espill.label), JSON.stringify(espill));
r.check("L'Espill tabs switch panes", espill.pane === "numeros" && espill.tilesVisible, JSON.stringify(espill));
r.check("L'Espill route reflects the tab", (await page.evaluate(() => location.hash)) === "#/espill?tab=numeros");
await page.click("#btnEspillBack");
r.check("back to port from L'Espill", (await page.evaluate(() => document.body.dataset.screen)) === "title" && (await page.evaluate(() => location.hash)) === "#/");
// browser back returns to L'Espill (with its tab); a typed deep link opens it too
await page.goBack(); await page.waitForFunction(() => document.body.dataset.screen === "espill", { timeout: 3000 });
r.check("browser back re-opens L'Espill on the same tab", await page.evaluate(() => document.body.dataset.screen === "espill" && document.getElementById("espillPanes").dataset.tab === "numeros"));
await page.evaluate(() => { location.hash = "#/"; });
await page.waitForFunction(() => document.body.dataset.screen === "title", { timeout: 3000 });
await page.evaluate(() => { location.hash = "#/espill?tab=sequencia"; });
await page.waitForFunction(() => document.body.dataset.screen === "espill", { timeout: 3000 });
r.check("deep link #/espill?tab=sequencia opens L'Espill on Seqüència", await page.evaluate(() => document.getElementById("espillPanes").dataset.tab === "sequencia"));
await page.evaluate(() => { location.hash = "#/"; });
await page.waitForFunction(() => document.body.dataset.screen === "title", { timeout: 3000 });

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
// The rival is a dimension of both modes (2026-08-17): on the tripulants screen the pill is the intent and
// stays; choosing a rival keeps it — in Entrenament that is sparring (rival side + strip), route #/entrena/:rival
const pill = await page.evaluate(() => {
  document.body.dataset.screen = "select";
  document.getElementById("btnModeEntrenament").click();
  const r1 = { screen: document.body.dataset.screen, ent: document.getElementById("btnModeEntrenament").classList.contains("primary"), hash: location.hash, soloCardShown: getComputedStyle(document.getElementById("pirateCard-sol")).display !== "none" };
  document.getElementById("pirateCard-L2").click();
  const r2 = { screen2: document.body.dataset.screen, hash2: location.hash, mode2: document.body.dataset.mode, sparring: document.body.dataset.sparring, rivalShown: document.getElementById("rivalSide").style.display !== "none", stripShown: document.getElementById("trainingPanel").style.display !== "none", head: document.getElementById("trainingHead").textContent };
  return { ...r1, ...r2 };
});
r.check("Entrenament pill on the tripulants screen stays there as the intent (?per=entrena, solo card shown)", pill.screen === "select" && pill.ent && pill.hash === "#/tripulants?per=entrena" && pill.soloCardShown, JSON.stringify(pill));
r.check("choosing Bru in Entrenament starts sparring: #/entrena/bru, rival side + strip, head names him", pill.screen2 === "fight" && pill.hash2 === "#/entrena/bru" && pill.mode2 === "entrenament" && pill.sparring === "on" && pill.rivalShown && pill.stripShown && /Bru/.test(pill.head), JSON.stringify(pill));
await page.evaluate(() => { document.body.classList.remove("vs-on"); location.hash = "#/entrena/sol"; });
await page.waitForFunction(() => document.body.dataset.solo === "on", { timeout: 3000 });
r.check("route #/entrena/sol: solo training — no rival side, strip head says sol", await page.evaluate(() => document.getElementById("rivalSide").style.display === "none" && /sol/.test(document.getElementById("trainingHead").textContent) && document.getElementById("readingBox").hidden));
await page.evaluate(() => { location.hash = "#/duel/rei"; });
await page.waitForFunction(() => document.body.dataset.mode === "partida", { timeout: 3000 });
r.check("route #/duel/rei: Partida against El Rei", await page.evaluate(() => document.getElementById("btnModePartida").classList.contains("primary") && document.getElementById("selAiLevel").value === "L4" && location.hash === "#/duel/rei"));
await page.evaluate(() => { location.hash = "#/duel/bru"; });
await page.waitForFunction(() => document.getElementById("selAiLevel").value === "L2", { timeout: 3000 });
// The home (2026-08-17): Juga → the tripulants (with the sensors up, no onboarding card)
await page.evaluate(() => { location.hash = "#/"; });
await page.waitForFunction(() => document.body.dataset.screen === "title", { timeout: 3000 });
r.check("home mounts the wordmark image", (await page.evaluate(() => document.querySelectorAll("#titleWordmark img").length)) === 1);
await page.click("#btnJuga");
await page.waitForFunction(() => document.body.dataset.screen === "select", { timeout: 5000 });
r.check("Juga goes to the tripulants with the duel intent", (await page.evaluate(() => location.hash)) === "#/tripulants?per=duel" && (await page.evaluate(() => document.body.dataset.mode)) === "partida");
// Calibratge from the home: with the sensors up it opens its own page (#/calibratge) with the session running
await page.evaluate(() => { location.hash = "#/"; });
await page.waitForFunction(() => document.body.dataset.screen === "title", { timeout: 3000 });
await page.click("#doorCalibra");
await page.waitForFunction(() => document.body.dataset.calibrating === "on", { timeout: 5000 });
r.check("home's Calibratge opens its own page with the live camera on stage", await page.evaluate(() => document.body.dataset.screen === "calib" && location.hash === "#/calibratge" && !!document.querySelector("#calibStage .video-wrap")));
r.check("the page hails the player by name", /Grumet/.test(await page.$eval("#calibWelcome", (n) => n.textContent)));
// Hand tabs (2026-08-20): right-hand layout by default (columns mirrored), left flips back, choice persists
r.check("hand tabs: right by default, left flips, persisted", await page.evaluate(() => {
  const dretaOn = document.body.dataset.ma === "dreta" && document.getElementById("maDreta").classList.contains("on");
  document.getElementById("maEsquerra").click();
  const flipped = document.body.dataset.ma === "esquerra" && localStorage.getItem("morra_ma") === "esquerra";
  document.getElementById("maDreta").click();
  return dretaOn && flipped && document.body.dataset.ma === "dreta";
}));
await page.click("#calibClose");
await page.waitForFunction(() => document.body.dataset.calibrating === undefined, { timeout: 3000 });
r.check("closing the calibration returns to the port and the camera to the player side", await page.evaluate(() => document.body.dataset.screen === "title" && !!document.querySelector(".hero-video .video-wrap")));
await page.evaluate(() => { location.hash = "#/"; });
await page.waitForFunction(() => document.body.dataset.screen === "title", { timeout: 3000 });
await page.click("#btnJuga");
await page.waitForFunction(() => document.body.dataset.screen === "select", { timeout: 5000 });
await page.click("#pirateCard-L2");
await page.waitForFunction(() => document.body.dataset.screen === "fight", { timeout: 5000 });
await page.evaluate(() => { document.body.classList.remove("vs-on"); });
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
// 2026-08-17: the next commitment is minted AFTER the round is recorded (the
// policy's history includes the round just played), and a sealed move exists
// again for the next throw. Before: minted at phase-1 — every read one round stale.
const mintOrder = await page.evaluate(() => {
  const log = window.__play.eventBusLog;
  const iReveal = log.map((e) => e.type).lastIndexOf("game_reveal");
  const iAim = log.map((e) => e.type).lastIndexOf("ai_aim_result");
  const iCommit = log.map((e) => e.type).lastIndexOf("game_commit");
  return { iReveal, iAim, iCommit, sealed: !!window.__play.currentAiMove, hasOnsetMint: log.some((e) => e.type === "commit_minted_at_onset") };
});
r.check("next commitment minted after the round was recorded", mintOrder.iCommit > mintOrder.iAim && mintOrder.iAim > mintOrder.iReveal && mintOrder.sealed, JSON.stringify(mintOrder));
r.check("no onset-time mint was needed", !mintOrder.hasOnsetMint);
// Rival engine v2 (2026-08-17): switch to L4, force a fresh commitment via
// the level change, and check the commit event carries the READ trace only
// (no anti-aim distribution before reveal), and that ?rival is v2.
const v2commit = await page.evaluate(() => {
  const sel = document.getElementById("selAiLevel"); sel.value = "L4"; sel.dispatchEvent(new Event("change"));
  // a level change applies from the NEXT commitment (never a sealed one) — mint it
  const before = window.__play.eventBusLog.length;
  window.__play.commitAiMove();
  const evs = window.__play.eventBusLog.slice(before).filter((e) => e.type === "game_commit");
  const last = evs[evs.length - 1];
  const load = window.__play.eventBusLog.find((e) => e.type === "page_load");
  return { engine: last?.engine, hasRead: !!last?.v2 && "fTau" in last.v2, leaksHide: !!last?.v2 && "gBelief" in last.v2, antiAim: "antiAimDist" in (last ?? {}), pageEngine: load?.rivalEngine, level: last?.level };
});
r.check("L4 commit uses the v2 engine and logs the read-side trace only", v2commit.engine === "v2" && v2commit.pageEngine === "v2" && v2commit.level === "L4" && v2commit.hasRead && !v2commit.leaksHide && !v2commit.antiAim, JSON.stringify(v2commit));
await page.evaluate(() => { const sel = document.getElementById("selAiLevel"); sel.value = "L2"; sel.dispatchEvent(new Event("change")); });
// r3: the score lives on TOP (strip with big numerals + coins), the verdict
// is a BANNER over the player card, and the player card carries the pill's
// state as color.
r.check("score strip visible on top with numerals mirroring the scoreboard", await page.evaluate(() => {
  const m = /Tu (\d+) — (\d+) Rival/.exec(document.getElementById("scoreboard").textContent);
  const strip = document.getElementById("scoreStrip");
  return !!m && getComputedStyle(strip).display === "flex" &&
    document.getElementById("scoreYou").textContent === m[1] && document.getElementById("scoreRival").textContent === m[2] &&
    strip.compareDocumentPosition(document.querySelector(".face-off")) & Node.DOCUMENT_POSITION_FOLLOWING;
}));
r.check("verdict banner shows the round's headline over the player card", await page.evaluate(() => {
  const b = document.getElementById("verdictBanner");
  return !b.hidden && /TU GUANYES|RIVAL GUANYA|PARATA/.test(document.getElementById("verdictBannerHead").textContent) &&
    document.getElementById("verdictBannerReason").textContent.length > 5 && !!b.closest(".player-side");
}));
r.check("bottom round card stays hidden after a resolved round (renders rewrite its className)", await page.evaluate(() =>
  getComputedStyle(document.getElementById("roundResultCard")).display === "none" && !document.body.classList.contains("tecnic")));
r.check("player card carries the pill state as data-pill (not-armed right after a resolved throw)", await page.evaluate(() =>
  ["armed", "not-armed", "analyzing"].includes(document.querySelector(".player-side").dataset.pill) &&
  document.getElementById("readyPill").closest(".video-wrap") != null));
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
    return { revealed, outcome: t.outcome, lastThrown: P.lastThrownFingerCount, card, dbg: { active: P.calibration.active, screen: document.body.dataset.screen, mode: document.body.dataset.mode, pending: P.syncPendingAnalysisCount } };
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
    // data hygiene: an INCOMPLETE (unknown pre-onset 1 WITH voice → not
    // revealed, not judged) must not enter the player model
    modelBefore: P.playerModel.throws.length,
    incomplete: await fire(1, undefined, -100),
    modelAfter: P.playerModel.throws.length,
  };
});
r.check("an incomplete (never revealed) does NOT feed the player model", oneRule.modelAfter === oneRule.modelBefore && oneRule.incomplete.outcome !== "reset", `${oneRule.modelBefore}→${oneRule.modelAfter} (${oneRule.incomplete.outcome})`);
r.check("a 1 coming down from a held 3 WITH a voice onset is still a reset (was voice-early)", oneRule.fromHeld3WithVoice.outcome === "reset", oneRule.fromHeld3WithVoice.outcome);
r.check("a 0 coming down from a held 4 WITH a voice onset is still a reset", oneRule.fromHeld4WithVoice.outcome === "reset", oneRule.fromHeld4WithVoice.outcome);
r.check("neither retraction resolved anything (lastThrownFingerCount unchanged)", oneRule.fromHeld3WithVoice.lastThrown === oneRule.fromFist1.lastThrown && oneRule.fromHeld4WithVoice.lastThrown === oneRule.fromFist1.lastThrown, JSON.stringify(oneRule));
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
// "El que veu El Rei" (2026-08-17): the read, shown. With one round it says
// so; with a seeded 12-round history it names a digit (or a flat read),
// lists 5+5 belief bars, drivers in words, and the self-watch line.
r.check("the read says it is too early with one round", /Encara no et llegeix/.test(await page.$eval("#readHeadline", (n) => n.textContent)));
const readShown = await page.evaluate(() => {
  const H = (pf, pc, af, ac, w) => ({ playerFingers: pf, playerCall: pc, aiFingers: af, aiCall: ac, aiGuessPlayerFingers: 1, aiLevel: "L4", verdictWinner: w, syncOutcome: "synced", source: "partida" });
  const hist = [];
  for (let i = 0; i < 12; i++) hist.push(H(1 + (i % 3), 1 + (i % 3) + 2, 1 + (i % 5), 1 + (i % 5) + 3, "parata"));
  window.__play.renderTrainingPanel(hist, "session");
  return {
    headline: document.getElementById("readHeadline").textContent,
    fBars: document.querySelectorAll("#readFBelief li").length, gBars: document.querySelectorAll("#readGBelief li").length,
    drivers: document.getElementById("readDrivers").textContent, self: document.getElementById("readSelfWatch").textContent,
  };
});
// L'Espill v2 (2026-08-17): ranked tells carry price/evidence/counter-move; the trends strip says "too early" under 60 rows and shows four tiles on a seeded 70-row history
const v2panel = await page.evaluate(() => {
  const H = (pf, pc, af, ac, w) => ({ playerFingers: pf, playerCall: pc, aiFingers: af, aiCall: ac, aiGuessPlayerFingers: 1, aiLevel: "L4", verdictWinner: w, syncOutcome: "synced", source: "partida" });
  const short = []; for (let i = 0; i < 12; i++) short.push(H(1 + (i % 3), 1 + (i % 3) + 2, 1 + (i % 5), 1 + (i % 5) + 3, "parata"));
  window.__play.renderTrainingPanel(short, "session");
  const tooEarly = document.getElementById("trendStrip").textContent;
  const long = []; for (let i = 0; i < 70; i++) { const f = i % 2 ? 4 : 2; long.push(H(f, f + 2, 1 + (i % 5), 1 + (i % 5) + 3, "parata")); }
  window.__play.renderTrainingPanel(long, "session");
  return { tooEarly, tiles: document.querySelectorAll("#trendStrip .trend").length, coach: document.getElementById("coachSentence").textContent, price: document.getElementById("coachPrice").textContent, evidence: document.getElementById("coachEvidence").textContent, counter: document.getElementById("coachCounter").textContent, others: document.querySelectorAll("#tellsList li").length, live: document.getElementById("liveTopTell").textContent, headline: document.getElementById("espillHeadline").textContent, bigram: document.getElementById("bigramHeadline").textContent, thinRows: document.querySelectorAll("#bigramHeatmap .hm-thin").length, rowCounts: document.querySelectorAll("#bigramHeatmap .hm-label small").length };
});
r.check("trends strip says too early under 60 rows", /60 tirs/.test(v2panel.tooEarly));
r.check("trends strip shows four tiles on 70 rows", v2panel.tiles === 4, JSON.stringify(v2panel));
r.check("coach card names the #1 weakness with price, evidence and the rival's counter-move", /Després de tirar un [24], tires un [24]/.test(v2panel.coach) && /punts cada 100/.test(v2panel.price) && /\d+ de \d+/.test(v2panel.evidence) && /^El Rei: /.test(v2panel.counter) && v2panel.live === v2panel.coach, JSON.stringify(v2panel));
r.check("the read names what El Rei sees", /apostaria que tiraràs [1-5] \(\d+%\)|cap costum clar/.test(readShown.headline) && readShown.fBars === 5 && readShown.gBars === 5 && /%/.test(readShown.drivers) && readShown.self.length > 0, JSON.stringify(readShown));
// 2026-08-20: the one number promoted; Seqüència speaks; heatmap rows carry their counts
r.check("espill headline counts El Rei's hits out of 20", /El Rei t'endevinaria \d+ de cada 20 tirades/.test(v2panel.headline), v2panel.headline);
r.check("Seqüència names the strongest chain in words", /Després d'un [24], tires un [24] el \d+%.*cadena/.test(v2panel.bigram), v2panel.bigram);
r.check("heatmap rows show their sample counts (alternator: two rows have data)", v2panel.rowCounts === 2, String(v2panel.rowCounts));
// The shadow rival (2026-08-17): in Entrenament, El Rei's bet is frozen before each throw and scored after;
// 12 seam throws (alternating 2/4): the first ones say "too early", then the meter fills and the last line speaks.
const shadow = await page.evaluate(async () => {
  const map = { 3: "tres", 4: "quatre", 5: "cinc", 6: "sis", 7: "set", 8: "vuit" };
  for (let i = 0; i < 12; i++) {
    const f = i % 2 ? 4 : 2;
    const now = performance.now();
    window.__play.onSyncHandOnset(now - 50, now - 150, f);
    const t = window.__play.syncThrows[window.__play.syncThrows.length - 1];
    window.__play.applyRecognizedWord(t, map[f + 2]);
    window.__play.finalizeSyncThrow(t, t.debugRec, t.handOnsetPerfTime + 60, false);
    await new Promise((r2) => setTimeout(r2, 30));
  }
  const evs = window.__play.eventBusLog.filter((e) => e.type === "shadow_read");
  return { events: evs.length, scored: evs.filter((e) => e.hit != null).length, hits: evs.filter((e) => e.hit === true).length, count: document.getElementById("shadowCount").textContent, dots: document.querySelectorAll("#shadowDots span.hit, #shadowDots span.miss").length, last: document.getElementById("shadowLast").textContent };
});
r.check("shadow rival scores every training throw once it knows enough", shadow.events >= 12 && shadow.scored >= 4 && /\d+ de \d+/.test(shadow.count) && shadow.dots === shadow.scored, JSON.stringify(shadow));
r.check("shadow rival reads an alternator (bets land) and says so", shadow.hits >= 2 && /l'esperava|no l'ha vist venir/.test(shadow.last), JSON.stringify(shadow));
// Missions (2026-08-17): the strip's mission button targets the coach card's tell; a break-pattern mission
// on the alternator (2→4) fed 20 more alternating throws fails with per-throw feedback; the shadow mission
// runs on the meter; "Prou" stops; the verdict is logged.
const mission = await page.evaluate(async () => {
  const map = { 3: "tres", 4: "quatre", 5: "cinc", 6: "sis", 7: "set", 8: "vuit" };
  const throwOne = async (f) => { const now = performance.now(); window.__play.onSyncHandOnset(now - 50, now - 150, f); const t = window.__play.syncThrows[window.__play.syncThrows.length - 1]; window.__play.applyRecognizedWord(t, map[f + 2]); window.__play.finalizeSyncThrow(t, t.debugRec, t.handOnsetPerfTime + 60, false); await new Promise((r2) => setTimeout(r2, 25)); };
  const topLabel = document.getElementById("missionTopTitle").textContent;
  document.getElementById("btnMissionTop").click();
  const liveShown = !document.getElementById("missionLive").hidden;
  const title = document.getElementById("missionTitle").textContent;
  const goal = document.getElementById("missionGoal").textContent;
  let fedBack = false;
  for (let i = 0; i < 20; i++) { await throwOne(i % 2 ? 4 : 2); if (/esperava|soldada/.test(document.getElementById("missionFeedback").textContent)) fedBack = true; }
  const doneShown = !document.getElementById("missionDone").hidden;
  const verdict = document.getElementById("missionVerdict").textContent;
  const evs = window.__play.eventBusLog.filter((e) => e.type === "training_mission");
  const done = evs.find((e) => e.phase === "done");
  // stop mid-way
  document.getElementById("btnMissionAgain").click();
  await throwOne(3);
  document.getElementById("btnMissionStop").click();
  const idleBack = !document.getElementById("missionIdle").hidden;
  return { topLabel, liveShown, title, goal, fedBack, doneShown, verdict, phases: evs.map((e) => e.phase), pass: done?.pass, kind: done?.kind, idleBack };
});
r.check("mission starts from the strip with title and goal", mission.liveShown && mission.title.length > 3 && /tirs/i.test(mission.goal) && mission.title === mission.topLabel, JSON.stringify(mission));
r.check("break-pattern mission on the alternator: feedback per throw, verdict at 20, logged, Prou returns to idle", mission.kind === "break-pattern" && mission.fedBack && mission.doneShown && mission.pass === false && /Torna-hi|no —/.test(mission.verdict) && mission.phases.includes("start") && mission.phases.includes("done") && mission.idleBack, JSON.stringify(mission));

// Calibratge (per profile + camera). The fake camera has no hand, so the
// guided steps can't run end-to-end here; what CAN be checked: the section,
// the panel open/close, the seam-driven apply/save into the live sliders,
// and that the fit persists per profile and per device.
r.check("uncalibrated status reads defaults", /Sense calibrar|per defecte/.test(await page.$eval("#calibStatus", (n) => n.textContent)));
// 2026-08-20: calibratge left the Entrenament strip — status + Restableix live on its own page
r.check("no calibratge section in the Entrenament strip; status + reset on the Calibratge page", await page.evaluate(() =>
  !document.querySelector("#trainingPanel .calib-section") && !!document.querySelector("#screenCalib #calibStatus") && !!document.querySelector("#screenCalib #calibReset")));
r.check("profile menu (⚙) opens with export and reset", await page.evaluate(() => {
  document.getElementById("btnProfileMenu").click();
  const open = !document.getElementById("profileMenu").hidden && !!document.querySelector("#profileMenu #btnExportProfile") && !!document.querySelector("#profileMenu #btnResetProfile");
  document.body.click();
  return open && document.getElementById("profileMenu").hidden;
}));
await page.evaluate(() => { location.hash = "#/calibratge"; });
await page.waitForFunction(() => document.body.dataset.calibrating === "on", { timeout: 5000 });
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
r.check("saved record carries a session history (pooling)", await page.evaluate(() => {
  const key = "morra-calibration-v1:" + window.__play.activeProfileId;
  const rec = JSON.parse(localStorage.getItem(key)).byDevice[window.__play.calibration.deviceKey];
  return Array.isArray(rec.history) && rec.history.length === 1;
}));
// Descarta (result-card button) = delete the stored fit and go back to defaults
await page.evaluate(() => document.getElementById("calibDiscard").click());
r.check("Descarta deletes the stored fit and returns the sliders to defaults", await page.evaluate(() =>
  document.getElementById("tuneHighV").value === "0.5" && document.getElementById("tuneVadMult").value === "6" && /Sense calibrar/.test(document.getElementById("calibStatus").textContent)));
// re-save so the following checks (persisted per profile+device, Restableix) still have a record
await page.evaluate(() => window.__play.calibration.save({
  values: { highV: 0.62, lowV: 0.21, vadMult: 4.5 }, fitVersion: 2, measuredAt: new Date().toISOString(),
  samples: { jitterP95: 0.1, throwPeaks: [1, 1, 1, 1], ambientFloor: 0.01, shoutPeaks: [0.2, 0.2, 0.2], prompts: [] },
}));
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
// Restableix lives on the Calibratge page now — entering it starts a
// session; the reset mid-session applies defaults and closes back to port
await page.evaluate(() => { location.hash = "#/calibratge"; });
await page.waitForFunction(() => document.body.dataset.calibrating === "on", { timeout: 5000 });
await page.click("#calibReset");
await page.waitForFunction(() => document.body.dataset.calibrating === undefined, { timeout: 3000 });
r.check("Restableix returns the sliders to the app defaults and clears the record", await page.evaluate(() =>
  document.getElementById("tuneHighV").value === "0.5" && document.getElementById("tuneVadMult").value === "6" && /Sense calibrar/.test(document.getElementById("calibStatus").textContent)));
r.check("(sliders were at defaults before too)", before.highV === 0.5 && before.vadMult === 6, JSON.stringify(before));

// Profiles: default = legacy key; create/switch/delete isolate histories
// First flush the analysis queue: seam throws from earlier sections are still
// awaiting their audio window, and a late drain would record into whichever
// profile is active by then — poisoning the fresh-model checks below.
await page.evaluate(() => window.__play.drainPendingAnalysis(performance.now() + 60000));
await page.waitForFunction(() => window.__play.syncPendingAnalysisCount === 0, { timeout: 5000 });
// …and the drained extractions finalize async: wait for the model to go quiet
await page.evaluate(async () => {
  let last = -1;
  for (let i = 0; i < 20 && last !== window.__play.playerModel.throws.length; i++) {
    last = window.__play.playerModel.throws.length;
    await new Promise((r2) => setTimeout(r2, 250));
  }
});
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
// 2026-08-20: "+" opens the sign-on card (no prompt()); create → the card offers Calibra ara / Més tard
await page.click("#btnNewProfile");
await page.waitForFunction(() => document.body.dataset.firstrun === "on", { timeout: 3000 });
await page.type("#firstrunName", "Bea");
await page.click("#firstrunGo");
r.check("new tripulant card hails and offers Calibra ara / Més tard", await page.evaluate(() =>
  /A coberta, tripulant Bea!/.test(document.getElementById("firstrunTitle").textContent) && !document.getElementById("firstrunOffer").hidden));
await page.click("#firstrunLater");
await page.waitForFunction(() => document.body.dataset.firstrun === "off", { timeout: 3000 });
r.check("new profile activates with a fresh empty model", await page.evaluate(() =>
  window.__play.activeProfileId !== "default" && window.__play.playerModel.throws.length === 0),
await page.evaluate(() => JSON.stringify({ active: window.__play.activeProfileId, throws: window.__play.playerModel.throws, syncCount: window.__play.syncThrows.length, pending: window.__play.syncPendingAnalysisCount })));
r.check("new profile gets the app-default sensor values, not the default profile's fit", await page.evaluate(() =>
  document.getElementById("tuneHighV").value === "0.5" && document.getElementById("tuneVadMult").value === "6"));
r.check("select shows both profiles", (await page.$$eval("#selProfile option", (n) => n.length)) === 2);
r.check("match reset for the new player", /Tu 0 — 0 Rival/.test(await page.$eval("#scoreboard", (n) => n.textContent)));
r.check("delete enabled for a non-default profile", await page.$eval("#btnDeleteProfile", (n) => !n.disabled));
// The play detour (2026-08-20): Bea has no fit on this camera — heading to
// play routes through Calibratge first; declining (✕) continues and is
// remembered for the session.
await page.evaluate(() => { location.hash = "#/tripulants?per=duel"; });
await page.waitForFunction(() => document.body.dataset.calibrating === "on", { timeout: 5000 });
r.check("an uncalibrated tripulant heading to play detours to Calibratge", await page.evaluate(() =>
  document.body.dataset.screen === "calib" && location.hash === "#/calibratge"));
await page.click("#calibClose");
await page.waitForFunction(() => document.body.dataset.screen === "select", { timeout: 3000 });
r.check("declining the detour continues to the tripulants", true);
await page.evaluate(() => { location.hash = "#/"; });
await page.waitForFunction(() => document.body.dataset.screen === "title", { timeout: 3000 });
await page.evaluate(() => { location.hash = "#/tripulants?per=duel"; });
await page.waitForFunction(() => document.body.dataset.screen === "select", { timeout: 3000 });
r.check("no re-detour after declining this session", await page.evaluate(() => document.body.dataset.calibrating === undefined));
await page.evaluate(() => { location.hash = "#/"; });
await page.waitForFunction(() => document.body.dataset.screen === "title", { timeout: 3000 });
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
// Data hygiene on load: a stored model carrying retraction phantoms is pruned
// once and saved back (default profile key = the spike's legacy key).
await page2.evaluate(() => {
  const mk = (o) => ({ playerFingers: null, playerCall: null, aiFingers: null, aiCall: null, verdictWinner: null, ...o });
  localStorage.setItem("morra-s03-playermodel-v1", JSON.stringify({ version: 1, throws: [
    mk({ playerFingers: 3, aiFingers: 2, aiCall: 5, verdictWinner: "player" }),
    mk({ playerFingers: 1, syncOutcome: "voice-early" }),
    mk({ playerFingers: 1, syncOutcome: "voice-early" }),
    mk({ playerFingers: 0, syncOutcome: "hand-only" }),
    mk({ playerFingers: 1, syncOutcome: "synced" }),
  ] }));
});
await page2.reload({ waitUntil: "networkidle0" });
r.check("phantoms are pruned from a stored model on load (3 of 5), saved back", await page2.evaluate(() => {
  const m = window.__play.playerModel; const stored = JSON.parse(localStorage.getItem("morra-s03-playermodel-v1"));
  return m.throws.length === 2 && stored.throws.length === 2 && m.throws.map((t) => t.playerFingers).join() === "3,1";
}));
r.check("recorder starts idle with no frames", await page2.evaluate(() => window.__rec && window.__rec.frames.length === 0));
await page2.evaluate(() => { window.__rec.label(4); window.__rec.start(); });
r.check("recorder R/label/start reflect in the status line", /REC.*truth=4/.test(await page2.$eval("#recStatus", (n) => n.textContent)));
await page2.close();

await browser.close();
srv.close();
r.finish();
