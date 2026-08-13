#!/usr/bin/env node
// Integration smoke for apps/play: drives the BUILT app (dist/) headless
// with Chrome's fake media devices, through the real start buttons and the
// window.__play seam (same-signature port of the spike's __s03). SKIPs
// (exit 0) without a local Chrome; FAILs if dist/ is missing (build first:
// pnpm --filter @morra/play build).
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

// Gesture-gated sensors
await page.click("#btnCam");
await page.click("#btnMic");
await page.waitForFunction(() => window.__play && window.__play.syncReady(), { timeout: 60000 });
r.check("camera chip ok", /@ \d+fps|\d+x\d+/.test(await page.$eval("#chipCamera .detail", (n) => n.textContent)));
r.check("model loaded", /loaded/.test(await page.$eval("#chipModel .detail", (n) => n.textContent)));
r.check("mic running", (await page.$eval("#chipMic .detail", (n) => n.textContent)) === "running");
r.check("audio clock live after gesture", /outputLatency ok|baseLatency/.test(await page.$eval("#chipClock .detail", (n) => n.textContent)));

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

// Entrenament switch renders L'Espill from real history
await page.click("#btnModeEntrenament");
r.check("training panel visible", (await page.$eval("#trainingPanel", (n) => n.style.display)) === "block");
r.check("heatmap renders 25 cells", (await page.$$eval("#bigramHeatmap .hm-cell", (n) => n.length)) === 25);
r.check("sample count rendered", /tir/.test(await page.$eval("#trainingSampleCount", (n) => n.textContent)));

// Profiles: default = legacy key; create/switch/delete isolate histories
r.check("boots with the default profile only", await page.evaluate(() =>
  window.__play.activeProfileId === "default" && window.__play.profiles.length === 1));
r.check("delete disabled for the default profile", await page.$eval("#btnDeleteProfile", (n) => n.disabled));
const defaultThrows = await page.evaluate(() => window.__play.playerModel.throws.length);
r.check("default profile carries this session's history", defaultThrows >= 1, `throws=${defaultThrows}`);
promptText = "Bea";
await page.click("#btnNewProfile");
promptText = null;
r.check("new profile activates with a fresh empty model", await page.evaluate(() =>
  window.__play.activeProfileId !== "default" && window.__play.playerModel.throws.length === 0));
r.check("select shows both profiles", (await page.$$eval("#selProfile option", (n) => n.length)) === 2);
r.check("match reset for the new player", /Tu 0 — 0 Rival/.test(await page.$eval("#scoreboard", (n) => n.textContent)));
r.check("delete enabled for a non-default profile", await page.$eval("#btnDeleteProfile", (n) => !n.disabled));
await page.select("#selProfile", "default");
r.check("switching back restores the default profile's history", await page.evaluate((expected) =>
  window.__play.activeProfileId === "default" && window.__play.playerModel.throws.length === expected, defaultThrows));
const beaId = await page.$$eval("#selProfile option", (n) => n.map((o) => o.value).find((v) => v !== "default"));
await page.select("#selProfile", beaId);
await page.click("#btnDeleteProfile"); // confirm auto-accepted
r.check("deleting the active profile falls back to default", await page.evaluate(() =>
  window.__play.activeProfileId === "default" && window.__play.profiles.length === 1));

// Error surfacing
await page.evaluate(() => { setTimeout(() => { throw new Error("integration probe"); }); });
await new Promise((r2) => setTimeout(r2, 300));
r.check("error panel surfaces runtime errors", (await page.$eval("#errorPanel", (n) => getComputedStyle(n).display)) === "block");

const unexpected = pageErrors.filter((e) => !/integration probe/.test(e));
r.check("no unexpected page errors", unexpected.length === 0, unexpected.join("; "));

await browser.close();
srv.close();
r.finish();
