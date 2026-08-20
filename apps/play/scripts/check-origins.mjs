// check-origins.mjs — supply-chain regression guard (security audit 2026-08-20,
// finding on runtime CDN self-containment). The app must load MediaPipe + vosk
// + its model only from SAME ORIGIN (vendored under /assets/vendor). This
// asserts the runtime URL constants in config.ts are never absolute http(s)
// URLs — so a stray edit that points a loader back at a CDN fails CI instead
// of silently shipping third-party code into a page that holds camera + mic.
//
// Provenance COMMENTS in config.ts may mention the original CDN URLs; only the
// assigned VALUES are checked.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CONFIG = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "config.ts");
const RUNTIME_URL_EXPORTS = [
  "VOSK_CDN_URL",
  "VOSK_MODEL_URL",
  "MEDIAPIPE_VISION_ESM_URL",
  "MEDIAPIPE_VISION_WASM_URL",
  "MEDIAPIPE_HAND_LANDMARKER_TASK_URL",
];

const src = readFileSync(CONFIG, "utf8");
const problems = [];
for (const name of RUNTIME_URL_EXPORTS) {
  // match `export const NAME = <value>;` — the value up to the line's semicolon
  const m = new RegExp(`export const ${name}\\s*=\\s*([^;]+);`).exec(src);
  if (!m) { problems.push(`${name}: not found in config.ts (renamed? update this check)`); continue; }
  const value = m[1].trim();
  if (/https?:\/\//.test(value)) problems.push(`${name} = ${value}  <-- absolute CDN URL; must be same-origin`);
}

if (problems.length) {
  console.error("check-origins: runtime loaders must stay same-origin (vendored). Offending:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`check-origins: OK — all ${RUNTIME_URL_EXPORTS.length} runtime URL constants are same-origin.`);
