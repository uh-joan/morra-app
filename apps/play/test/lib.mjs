// test/lib.mjs — shared plumbing for the integration + parity harnesses:
// a tiny static server (with a /log sink so telemetry never errors) and
// Chrome discovery with the SKIP-without-Chrome contract (exit 0 — CI
// without a local Chrome must not fail the suite; missing BUILD is a real
// failure and exits 1 from the callers).
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".zip": "application/zip", ".m4a": "audio/mp4", ".wasm": "application/wasm", ".json": "application/json",
};

export function serve(root, indexFile = "index.html") {
  const srv = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/log") { res.writeHead(204); res.end(); return; }
    const p = join(root, req.url === "/" ? indexFile : decodeURIComponent(req.url.split("?")[0]));
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    const data = readFileSync(p);
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream", "Content-Length": data.length });
    res.end(data);
  });
  return new Promise((r) => srv.listen(0, () => r(srv)));
}

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}

export async function launchWithFakeDevices(chromePath) {
  const puppeteer = (await import("puppeteer-core")).default;
  return puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
}

export function makeReporter(name) {
  let passed = 0;
  let failed = 0;
  return {
    check(label, ok, detail = "") {
      if (ok) { passed++; console.log(`  ok   ${label}`); }
      else { failed++; console.error(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
    },
    note(label, detail) {
      console.log(`  n/a  ${label}${detail ? " — " + detail : ""}`);
    },
    finish() {
      console.log(`${name}: ${passed} passed, ${failed} failed`);
      process.exit(failed ? 1 : 0);
    },
  };
}
