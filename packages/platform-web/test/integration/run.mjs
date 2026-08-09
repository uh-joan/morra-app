#!/usr/bin/env node
// M3 headless integration test for @morra/platform-web. Same pattern as
// packages/recognition/test/integration/run.mjs (M2): Puppeteer drives a
// real, locally installed Chrome with fake camera/mic devices against
// test/fixtures/integration.html, served by a local static server rooted
// at the repo root. The fixture imports the REAL built package
// (../../dist/index.js, not source) and exercises:
//   1. AudioContextManager — real context created + resumed, clock mapping
//      sane after resume().
//   2. EventBusTelemetrySink — a real batched POST that this script proves
//      landed in a temp log dir (not just "fetch() was called").
//   3. LocalStoragePlayerModelStore — a REAL browser localStorage round
//      trip (distinct from the unit suite, which only exercises the
//      in-memory fallback since Node has no browser localStorage).
//   4. PerformanceClock / CryptoRandomSource — trivial real-adapter sanity.
//   5. MicGraph / CameraSource — device-acquisition glue against fake
//      devices, reusing @morra/recognition's VadRingBuffer.
//
// CI-friendly by the same design as M2's runner: SKIPs (exit 0) when no
// local Chrome is available; FAILs (exit 1) when dist/ is missing (always
// fixable in-repo) or a check fails. This test only needs the FAKE device
// flags + the local static server — no external CDN/network dependency —
// so it does not gate on a network probe the way recognition's does.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./staticServer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..", "..");
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const FIXTURE_PATH = "/packages/platform-web/test/fixtures/integration.html";
const TEST_TIMEOUT_MS = 60000;

function skip(reason) {
  console.log(`SKIP - @morra/platform-web integration test: ${reason}`);
  console.log("SKIP - this is not a failure: rerun with a local Chrome install to see it run.");
  process.exit(0);
}

function fail(reason) {
  console.error(`FAIL - @morra/platform-web integration test: ${reason}`);
  process.exit(1);
}

for (const pkg of ["platform-web", "core", "recognition"]) {
  const distIndex = join(REPO_ROOT, "packages", pkg, "dist", "index.js");
  if (!existsSync(distIndex)) {
    fail(`${distIndex} not found — run "pnpm build" at the repo root first (platform-web depends on core + recognition's dist output too).`);
  }
}

let puppeteer;
try {
  ({ default: puppeteer } = await import("puppeteer-core"));
} catch {
  skip('puppeteer-core is not installed (run "pnpm install" at the repo root).');
}

function findChromeExecutable() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (envPath && existsSync(envPath)) return envPath;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
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

let pass = 0, fail_ = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`ok   - ${name}`); }
  else { fail_++; console.log(`FAIL - ${name}${detail !== undefined ? " :: " + JSON.stringify(detail) : ""}`); }
}

const logDir = mkdtempSync(join(tmpdir(), "morra-platform-web-telemetry-"));
const { close, port } = await startStaticServer(REPO_ROOT, { logDir });
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

  check("AudioContextManager: context created + resume() completed without error", result.audioContextError === null, result.audioContextError);
  check("AudioContextManager: context reports a real running state + sampleRate", result.audioContext?.state === "running" && typeof result.audioContext?.sampleRate === "number", result.audioContext);
  check(
    "AudioContextManager: clock mapping is sane after resume() (getOutputTimestamp supported) or a valid fallback (unsupported, with an outputLatency estimate)",
    result.clockMappingError === null &&
      ((result.clockMapping?.contextTimeIsNumber === true && result.clockMapping?.performanceTimeIsNumber === true && result.clockMapping?.performanceTimePositive === true) ||
        (result.clockMapping?.unsupported === true && typeof result.clockMapping?.outputLatencyEstimate === "number")),
    result.clockMapping
  );

  check("EventBusTelemetrySink: emit()/flush() completed without error", result.telemetryError === null, result.telemetryError);
  check("EventBusTelemetrySink: in-memory eventLog recorded both emitted events", result.telemetry?.eventLogCount === 2, result.telemetry);

  check("LocalStoragePlayerModelStore: real browser round trip completed without error", result.localStorageError === null, result.localStorageError);
  check("LocalStoragePlayerModelStore: empty before save, correct throw count after save, empty again after clear", result.localStorage?.emptyLoadThrowCount === 0 && result.localStorage?.saveOk === true && result.localStorage?.loadedThrowCount === 1 && result.localStorage?.afterClearThrowCount === 0, result.localStorage);
  check("LocalStoragePlayerModelStore: loaded model deep-equals the saved model", result.localStorage?.loadedMatchesSaved === true, result.localStorage);
  check("LocalStoragePlayerModelStore: a SECOND store instance sees data through real localStorage (not the in-memory fallback)", result.localStorage?.secondInstanceSeesIt === true, result.localStorage);

  check("PerformanceClock / CryptoRandomSource: real-adapter sanity checks completed without error", result.clockPortsError === null, result.clockPortsError);

  check("MicGraph / CameraSource: device-acquisition glue completed without error", result.deviceGlueError === null, result.deviceGlueError);
  check("MicGraph / CameraSource: a real camera track + a real ring extraction sample rate were reported", result.deviceGlue?.cameraTrackCount === 1 && typeof result.deviceGlue?.ringExtractSampleRate === "number", result.deviceGlue);

  const nonResourceConsoleErrors = consoleErrors.filter((e) => !/Failed to load resource/i.test(e) && !/favicon/i.test(e));
  check("zero unexpected console/page errors", nonResourceConsoleErrors.length === 0, nonResourceConsoleErrors);

  // ---- proves the telemetry POST landed on the real server, from the Node side ----
  const logPath = join(logDir, "telemetry.ndjson");
  const logLanded = existsSync(logPath);
  let logLines = [];
  if (logLanded) logLines = readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
  check("telemetry POST actually landed in the temp log dir (server-side proof, not just client-side)", logLanded && logLines.length === 2, { logLanded, lineCount: logLines.length });
  if (logLanded && logLines.length) {
    const parsed = logLines.map((l) => JSON.parse(l));
    check("landed telemetry lines carry the fixture's sessionId + event types", parsed.every((e) => e.sessionId === "integration-fixture") && parsed[0]?.type === "integration_probe" && parsed[1]?.type === "integration_probe_2", parsed);
  }

  console.log(`\n${pass} passed, ${fail_} failed`);
} finally {
  if (browser) await browser.close();
  await close();
  rmSync(logDir, { recursive: true, force: true });
}
process.exit(fail_ ? 1 : 0);
