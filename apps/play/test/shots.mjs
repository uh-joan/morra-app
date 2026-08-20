// shots.mjs — capture README screenshots from the built dist. Not a test;
// run on demand: `node test/shots.mjs`. Fake devices give a camera pattern;
// the vosk model request is stalled so the port stays in its normal
// "carregant" regime, exactly like the integration harness.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { serve, findChrome, launchWithFakeDevices } from "./lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "..", "..", "docs", "screenshots");

const chrome = findChrome();
if (!chrome) { console.log("SKIP - no Chrome"); process.exit(0); }

const srv = await serve(DIST);
const browser = await launchWithFakeDevices(chrome);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.setRequestInterception(true);
page.on("request", (req) => { if (req.url().includes("vosk-model")) return; req.continue().catch(() => {}); });
await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "networkidle0" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seedHistory = () => {
  const H = (pf) => ({ playerFingers: pf, playerCall: pf + 2, aiFingers: 2, aiCall: 5, aiGuessPlayerFingers: 1, aiLevel: "L4", verdictWinner: "parata", syncOutcome: "synced", source: "partida" });
  const rows = []; for (let i = 0; i < 70; i++) rows.push(H(i % 2 ? 4 : 2));
  window.__play.renderTrainingPanel(rows, "allTime");
};

// name the tripulant so the chip + splash read real
await page.type("#firstrunName", "Jani");
await page.click("#firstrunGo");
await page.waitForFunction(() => document.body.dataset.calibrating === "on", { timeout: 8000 });
await page.click("#calibClose");
await page.waitForFunction(() => document.body.dataset.screen === "select", { timeout: 3000 });

// 1 · the port
await page.evaluate(() => { location.hash = "#/"; });
await page.waitForFunction(() => document.body.dataset.screen === "title", { timeout: 3000 });
await sleep(1200);
await page.screenshot({ path: join(OUT, "port.png") });

// 2 · the tripulants
await page.evaluate(() => { document.body.dataset.screen = "select"; });
await sleep(400);
await page.screenshot({ path: join(OUT, "tripulants.png") });

// 3 · the fight (against Bru). Hide the fake-camera test pattern + the
// transient mic-saturation toast so the shot reads clean.
await page.addStyleTag({ content: "#camPreview{opacity:0} #errorPanel,#clipWarn,#veuMini{display:none!important}" });
await page.evaluate(() => { document.getElementById("pirateCard-L2").click(); });
await sleep(300);
await page.evaluate(() => document.body.classList.remove("vs-on"));
await sleep(600);
await page.screenshot({ path: join(OUT, "fight.png") });

// 4 · L'Espill, with a seeded history
await page.evaluate(seedHistory);
await page.evaluate(() => { document.body.dataset.screen = "espill"; window.scrollTo(0, 0); });
await sleep(400);
await page.screenshot({ path: join(OUT, "espill.png") });

console.log("saved port / tripulants / fight / espill to docs/screenshots/");
await browser.close();
srv.close();
