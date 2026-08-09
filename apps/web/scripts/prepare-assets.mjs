#!/usr/bin/env node
// prepare-assets.mjs — M4 dispatch item 4: serve the rival-voice clips and
// the vosk CA model to apps/web WITHOUT duplicating the 47MB model zip in
// git. Chosen approach ("gitignored copy script", one of the three options
// offered): copy the specific files this app actually needs from spikes/
// into apps/web/public/assets/ before dev/build (wired as predev/prebuild
// npm-lifecycle hooks in package.json). public/assets/ is gitignored
// (apps/web/.gitignore) — the copies never reach git, only the SCRIPT that
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
import { existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
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

const clipCount = copyRivalVoiceClips();
const modelCopied = copyVoskModel();
console.log(`prepare-assets: ${clipCount} rival-voice clip(s) copied; vosk model ${modelCopied ? "copied" : "SKIPPED (not fetched yet)"}.`);
