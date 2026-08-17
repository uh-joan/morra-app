#!/usr/bin/env node
// prepare-assets.mjs — serve the rival-voice clips and the vosk CA model to
// apps/play WITHOUT duplicating the 47MB model zip in git (salvaged from
// apps/web's M4). Chosen approach ("gitignored copy script"): copy the
// specific files this app actually needs from spikes/ into
// apps/play/public/assets/ before dev/build (wired as predev/prebuild
// npm-lifecycle hooks in package.json). public/assets/ is gitignored
// (apps/play/.gitignore) — the copies never reach git, only the SCRIPT that
// produces them does. Vite serves/bundles public/ identically for both
// `vite dev` and `vite build`, so this one mechanism covers both, unlike a
// dev-only proxy (which would silently stop working for the built app the
// M4 integration test is required to drive).
//
// Rejected alternatives, for the record: a public-dir symlink works too
// and avoids the copy, but committing a symlink into public/ is fragile
// across platforms/deploy targets that don't preserve symlinks (esp. a
// future non-local hosting target) — a plain copy has no such risk. A
// dev-server-only proxy was rejected outright since the built app must
// also resolve these paths (the integration test drives the BUILT app).
//
// The vosk model zip is itself gitignored upstream (spikes/models/*.zip —
// fetched via spikes/models/fetch-ca-model.sh) and STAYS gitignored here
// too; this script only copies it forward if it's already present, and
// warns (never hard-fails) if it isn't, since a fresh checkout legitimately
// won't have it yet.
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

const RIVAL_VOICE_SRC = join(REPO_ROOT, "spikes", "rival-voice");
const RIVAL_VOICE_SUFFIX = "_jordi"; // matches spikes/s03-beat.html's RIVAL_VOICE_SUFFIX
const RIVAL_VOICE_DEST = join(APP_ROOT, "public", "assets", "rival-voice");

const MODEL_SRC = join(REPO_ROOT, "spikes", "models", "vosk-model-small-ca-0.4.zip");
const MODEL_DEST_DIR = join(APP_ROOT, "public", "assets", "vosk-model");
const MODEL_DEST = join(MODEL_DEST_DIR, "vosk-model-small-ca-0.4.zip");

function copyRivalVoiceClips() {
  if (!existsSync(RIVAL_VOICE_SRC)) {
    console.warn(`prepare-assets: ${RIVAL_VOICE_SRC} not found — skipping rival-voice clips.`);
    return 0;
  }
  mkdirSync(RIVAL_VOICE_DEST, { recursive: true });
  const files = readdirSync(RIVAL_VOICE_SRC).filter((f) => f.endsWith(`${RIVAL_VOICE_SUFFIX}.m4a`));
  for (const f of files) copyFileSync(join(RIVAL_VOICE_SRC, f), join(RIVAL_VOICE_DEST, f));
  return files.length;
}

function copyVoskModel() {
  if (!existsSync(MODEL_SRC)) {
    console.warn(
      `prepare-assets: ${MODEL_SRC} not found (gitignored, fetched separately) — ` +
        `run spikes/models/fetch-ca-model.sh first if you need voice recognition working locally.`
    );
    return false;
  }
  mkdirSync(MODEL_DEST_DIR, { recursive: true });
  copyFileSync(MODEL_SRC, MODEL_DEST);
  return true;
}

// ---------------------------------------------------------------- vendor
// ux-pirates r2 (2026-08-16): vendor the three CDN dependencies (the
// README's standing follow-up) so the app runs fully OFFLINE once primed.
// Download-if-missing into public/assets/vendor/ (gitignored like the rest
// of public/assets). First run needs network; later runs (and offline
// play) reuse the cached copies. A failed download warns and leaves the
// app dependent on that CDN — it never hard-fails the build.
const VENDOR_DIR = join(APP_ROOT, "public", "assets", "vendor");
const VENDOR_FILES = [
  // [dest relative to VENDOR_DIR, source URL, required]
  // NOTE: tasks-vision.mjs is dynamically import()ed, so it lives in
  // src/vendor/ (Vite refuses module imports from public/); everything
  // else is fetch()ed or <script>-tagged and stays under public/.
  ["__SRC__vendor/tasks-vision.mjs", "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm", true],
  ["mediapipe/wasm/vision_wasm_internal.js", "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.js", true],
  ["mediapipe/wasm/vision_wasm_internal.wasm", "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.wasm", true],
  ["mediapipe/wasm/vision_wasm_nosimd_internal.js", "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_nosimd_internal.js", false],
  ["mediapipe/wasm/vision_wasm_nosimd_internal.wasm", "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_nosimd_internal.wasm", false],
  ["mediapipe/hand_landmarker.task", "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", true],
  ["vosk/vosk.js", "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js", true],
  // best-effort siblings some vosk-browser builds fetch next to vosk.js
  ["vosk/vosk.wasm", "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.wasm", false],
  ["vosk/vosk.worker.js", "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.worker.js", false],
];

// jsdelivr's +esm bundles end in `//# sourceMappingURL=/sm/<hash>.map` — a
// path on the CDN. Served from our own origin, Vite tries to read /sm/… off
// the local disk and logs an ENOENT on every dev start (harmless: only the
// devtools source map is affected). Strip the comment from vendored .mjs
// files; also runs on cached copies so an already-vendored file gets fixed.
function stripCdnSourceMap(dest) {
  if (!dest.endsWith(".mjs") && !dest.endsWith(".js")) return;
  const text = readFileSync(dest, "utf8");
  const stripped = text.replace(/\n\/\/# sourceMappingURL=\/sm\/[^\n]*\n?$/, "\n");
  if (stripped !== text) writeFileSync(dest, stripped);
}

async function vendorCdnAssets() {
  let ok = 0, cached = 0, failed = 0;
  for (const [rel, url, required] of VENDOR_FILES) {
    const dest = rel.startsWith("__SRC__")
      ? join(APP_ROOT, "src", rel.slice("__SRC__".length))
      : join(VENDOR_DIR, rel);
    if (existsSync(dest) && statSync(dest).size > 0) { stripCdnSourceMap(dest); cached++; continue; }
    mkdirSync(dirname(dest), { recursive: true });
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      writeFileSync(dest, buf);
      stripCdnSourceMap(dest);
      ok++;
      console.log(`prepare-assets: vendored ${rel} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
    } catch (err) {
      failed++;
      const note = required ? "REQUIRED for offline play" : "optional";
      console.warn(`prepare-assets: could not vendor ${rel} (${note}): ${err.message} — ` +
        `the app will need this CDN at runtime until a run with network succeeds.`);
    }
  }
  // The jsdelivr +esm bundle must be self-contained for offline use.
  const esmDest = join(APP_ROOT, "src", "vendor", "tasks-vision.mjs");
  if (existsSync(esmDest)) {
    const src = readFileSync(esmDest, "utf8");
    if (/from\s*["']\/npm\//.test(src) || /import\s*\(?["']\/npm\//.test(src)) {
      console.warn("prepare-assets: WARNING — vendored tasks-vision.mjs still imports from /npm/ (not self-contained); offline camera model may fail.");
    }
  }
  console.log(`prepare-assets: vendor step — ${ok} downloaded, ${cached} cached, ${failed} failed.`);
}

const clipCount = copyRivalVoiceClips();
const modelCopied = copyVoskModel();
await vendorCdnAssets();
console.log(`prepare-assets: ${clipCount} rival-voice clip(s) copied; vosk model ${modelCopied ? "copied" : "SKIPPED (not fetched yet)"}.`);
