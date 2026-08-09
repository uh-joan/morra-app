#!/usr/bin/env node
// M2 headless integration test for @morra/recognition. Loads
// test/fixtures/integration.html — through a local static server rooted at
// the repo root — via Puppeteer driving a real, installed Chrome with fake
// camera/mic devices. The fixture imports the REAL built package
// (../../dist/index.js, not source, not a reimplementation) and exercises
// three real pipelines end-to-end:
//   1. MediaPipeFingerRecognizer — real CDN MediaPipe HandLandmarker load +
//      recognizeFrame() over a fake-camera frame.
//   2. VoskCallRecognizer — real CDN vosk-browser script load + real
//      download/decode of the self-hosted spikes/models/vosk-model-small-ca-0.4.zip
//      model + a grammar-restricted KaldiRecognizer round trip.
//   3. VadRingBuffer — real AudioWorklet module load + requestExtract()
//      round trip over a fake mic stream.
//
// CI-friendly by design: this test depends on a locally installed Chrome
// AND live network access to two CDNs (jsdelivr for MediaPipe/vosk-browser,
// storage.googleapis.com for the hand model) — neither is guaranteed in
// every environment. When either is unavailable, this script SKIPS
// (exit 0, clearly labeled) rather than failing the build. A missing
// dist/ build, by contrast, is always fixable in-repo, so that's a real
// failure (exit 1), not a skip.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./staticServer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..", "..");
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const FIXTURE_PATH = "/packages/recognition/test/fixtures/integration.html";
const NETWORK_PROBE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.js";
const NETWORK_PROBE_TIMEOUT_MS = 8000;
const TEST_TIMEOUT_MS = 60000;

function skip(reason) {
  console.log(`SKIP - @morra/recognition integration test: ${reason}`);
  console.log("SKIP - this is not a failure: rerun with a local Chrome install and network access to see it run.");
  process.exit(0);
}

function fail(reason) {
  console.error(`FAIL - @morra/recognition integration test: ${reason}`);
  process.exit(1);
}

// ---- 0. dist/ must exist — this is always fixable in-repo, so it's a real
// failure, not a skip. ----
if (!existsSync(join(PACKAGE_ROOT, "dist", "index.js"))) {
  fail(`${join(PACKAGE_ROOT, "dist", "index.js")} not found — run "pnpm --filter @morra/recognition run build" first.`);
}

// ---- 1. puppeteer-core must be installed (devDependency) ----
let puppeteer;
try {
  ({ default: puppeteer } = await import("puppeteer-core"));
} catch {
  skip('puppeteer-core is not installed (run "pnpm install" at the repo root).');
}

// ---- 2. a real Chrome/Chromium binary must be locally available ----
function findChromeExecutable() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (envPath && existsSync(envPath)) return envPath;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // macOS
    "/Applications/Chromium.app/Contents/MacOS/Chromium", // macOS
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}
const chromeExecutable = findChromeExecutable();
if (!chromeExecutable) {
  skip("no local Chrome/Chromium install found (checked PUPPETEER_EXECUTABLE_PATH, CHROME_PATH, and common install paths).");
}

// ---- 3. live network access to the CDN this test depends on ----
try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_PROBE_TIMEOUT_MS);
  const resp = await fetch(NETWORK_PROBE_URL, { method: "HEAD", signal: controller.signal });
  clearTimeout(timer);
  if (!resp.ok) skip(`network probe to ${NETWORK_PROBE_URL} returned HTTP ${resp.status}.`);
} catch (e) {
  skip(`network probe to ${NETWORK_PROBE_URL} failed (${(e && e.message) || e}) — CDN/network unavailable.`);
}

// ---- run the real test ----
let pass = 0, fail_ = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`ok   - ${name}`); }
  else { fail_++; console.log(`FAIL - ${name}${detail !== undefined ? " :: " + JSON.stringify(detail) : ""}`); }
}

const { close, port } = await startStaticServer(REPO_ROOT);
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: chromeExecutable,
    headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

  await page.goto(`http://localhost:${port}${FIXTURE_PATH}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__integrationResult && window.__integrationResult.done, { timeout: TEST_TIMEOUT_MS });
  const result = await page.evaluate(() => window.__integrationResult);

  console.log("\n--- raw result ---");
  console.log(JSON.stringify(result, null, 2));
  console.log("---\n");

  check("fingers: init() completed without error", result.fingerError === null, result.fingerError);
  check("fingers: init() reports a real mode (worker or main-thread-fallback)", ["worker", "main-thread-fallback"].includes(result.fingerInit?.mode), result.fingerInit);
  check("fingers: init() reports a real delegate (GPU or CPU)", ["GPU", "CPU"].includes(result.fingerInit?.delegate), result.fingerInit);
  check("fingers: recognizeFrame() completed and returned a well-formed RecognitionResult", result.fingerRecognize != null && typeof result.fingerRecognize.capturedAtMs === "number" && Array.isArray(result.fingerRecognize.hypotheses), result.fingerRecognize);

  check("voice: vosk model load() completed without error", result.voskError === null, result.voskError);
  check("voice: vosk reports isLoaded true after load()", result.voskLoad?.isLoaded === true, result.voskLoad);
  check("voice: recognizeWindow() completed and returned a well-formed RecognitionResult", result.voskRecognize != null && typeof result.voskRecognize.capturedAtMs === "number" && typeof result.voskRecognize.hypothesesCount === "number", result.voskRecognize);

  check("VadRingBuffer: AudioWorklet init + real extract round-trip completed without error", result.vadError === null, result.vadError);
  check("VadRingBuffer: extraction reports the real worklet sample rate", typeof result.vadInit?.sampleRate === "number" && result.vadInit.sampleRate > 0, result.vadInit);

  const nonResourceConsoleErrors = consoleErrors.filter((e) => !/Failed to load resource/i.test(e) && !/favicon/i.test(e));
  check("zero unexpected console/page errors", nonResourceConsoleErrors.length === 0, nonResourceConsoleErrors);

  console.log(`\n${pass} passed, ${fail_} failed`);
} finally {
  if (browser) await browser.close();
  await close();
}
process.exit(fail_ ? 1 : 0);
