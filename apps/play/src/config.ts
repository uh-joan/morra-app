// config.ts — ports spikes/s03-beat.html L901–995 (sync/game/vosk/rival-voice
// constants; beat-mode-only constants dropped) plus the CDN URLs from L920 and
// L1866–1892. Values are FROZEN against the spike — any change here is a
// deliberate divergence from the oracle and must be called out in review.

// step 9/10: sync mode (no beat) — the player throws + shouts self-paced.
// The event anchor is the hand MOTION START (velocity-spike crossing), not
// the settle instant — the original settle-anchored version measured
// systematically-early voice as clipped at the window edge, because the
// throw's shout starts with the swing, not with the hand coming to rest
// ~250-300ms later. Timing analysis for the extraction window:
//   - ring extraction is only requested once `now >= motionStartPerfTime +
//     SYNC_POST_MS` has elapsed (see analysis.ts's frame() drain) — because
//     the window's END (motionStart+700ms) is in the FUTURE at the instant
//     the SETTLE fires (settle itself already lags motion-start by up to
//     ~300ms — HIGH_V->LOW_V spike duration plus SETTLE_MS — so by settle
//     time we're already partway through the needed post-window, but not
//     necessarily all the way). Waiting on the motion-start anchor directly
//     (rather than estimating a fixed offset from settle) is exact
//     regardless of how long any individual throw's spike phase ran.
//   - Once that wait has elapsed, `now` is motionStart+SYNC_POST_MS (+ at
//     most one rAF tick, ~16ms, of polling slop). The OLDEST sample we then
//     need is at motionStart-SYNC_PRE_MS, i.e. (now - (700 + 16) - 400) =
//     at most ~1116ms in the past — still comfortably inside the 1.5s ring
//     (ringSize = sampleRate*1.5 in the VAD worklet), leaving ~380ms of
//     margin. Any change to this budget must re-derive that margin.
// ux-pirates r2 divergence (2026-08-16, session 7dc3b3ac): SYNC_PRE_MS
// 400 -> 600. The sync rule is symmetric (|delta| <= coOccurrenceMs, both
// sides 400), but with a 400ms pre-window the EARLY side was structurally
// unobservable: a shout starting 255-400ms before the anchor was already
// sounding at the window's first sample, got preWindow-PINNED, and the
// pin rule (correctly) demotes it to voice-early -- so the implementation
// accepted +368ms but could never accept -300ms. 600ms of pre-audio makes
// the rule's own stated bound measurable. Ring-margin re-derivation (the
// header demands it): oldest sample needed = now - (SYNC_POST_MS + ~16ms
// rAF slop) - SYNC_PRE_MS = now - 1316ms; the VAD ring holds 1500ms ->
// 184ms of margin remains. A drain stall beyond that degrades gracefully:
// the extract clamps and the onset pins, exactly as before.
export const SYNC_PRE_MS = 600;
export const SYNC_POST_MS = 700;
export const SYNC_COOCCURRENCE_MS_DEFAULT = 400;
export const SYNC_PARTNER_TIMEOUT_MS = 1500; // how long a voice-only event waits for a hand onset before it's called incomplete

// step 11: a morra micatio round vs a committed-then-revealed AI opponent.
export const GAME_WIN_SCORE = 10;

// step 7/8: detector-sensitivity constants shared by the offline voice-onset
// analysis (findEnergyOnsetInBuffer) over the extracted ring buffer.
export const OFFLINE_ONSET_SUSTAIN_MS = 60; // sustained-energy requirement for the buffer-based voice onset
export const BUFFER_FLOOR_CAP = 0.15;       // adaptive noise floor cap, so a loud room can't out-shout a real shout

// Iteration-2 noisy-venue fix (2026-08-16 field playtest, see
// docs/iteration-1-playtest-analysis.md §5.1): seed the offline onset
// detector's noise floor from the window's own leading ~150ms of ambience
// instead of the spike's constant 0.001, which made continuous room noise
// read as a preWindow voice onset on 64% of field throws. Flag-gated
// DELIBERATE divergence from the spike oracle: set to 0 to disable and get
// spike-verbatim onset behavior (also overridable at runtime with
// ?primefloor=0 for A/B testing in the field).
export const ONSET_FLOOR_PRIME_MS: number =
  typeof location !== "undefined" && new URLSearchParams(location.search).get("primefloor") === "0" ? 0 : 150;
export const HAND_FRAME_HISTORY_MS = 3000;  // finger-count history ring retained for debugging/seam

// Vosk word recognition. Same CDN + self-hosted-model pattern as the spike:
// alphacephei blocks CORS, so the Catalan model is a same-origin copy under
// public/assets/ (prepare-assets.mjs copies it from spikes/models/). Grammar
// restricts output to the morra number words (+ "tot"/"deu" all-in calls)
// plus the reject class.
// ux-pirates r2: vendored by prepare-assets.mjs (offline play); the CDN
// originals are recorded there. Same bytes, local origin — except the CDN
// sourceMappingURL comment, which prepare-assets strips (it points at
// jsdelivr's /sm/ path and makes Vite log an ENOENT on every dev start).
export const VOSK_CDN_URL = "/assets/vendor/vosk/vosk.js";
export const VOSK_MODEL_URL = "/assets/vosk-model/vosk-model-small-ca-0.4.zip";
export const VOSK_SAMPLE_RATE = 16000;
export const VOSK_GRAMMAR_WORDS = ["dos", "tres", "quatre", "cinc", "sis", "set", "vuit", "nou", "deu", "tot", "[unk]"] as const;

// MediaPipe hands — byte-identical URLs to the spike (L1866–1892): the +esm
// suffix for the module import and the RAW package path for the wasm assets
// are two deliberately different URLs (jsdelivr quirk). Main thread only —
// no worker (0.10.14 ships no vision_bundle.js; the worker loader 404s).
// The ESM bundle is import()ed at runtime, so it lives in src/vendor/
// (populated by prepare-assets.mjs) and resolves through Vite — dev serves
// it as a module, build emits it as an asset. new URL keeps tsc happy
// without needing a ?url module declaration.
export const MEDIAPIPE_VISION_ESM_URL = new URL("./vendor/tasks-vision.mjs", import.meta.url).href;
export const MEDIAPIPE_VISION_WASM_URL = "/assets/vendor/mediapipe/wasm";
export const MEDIAPIPE_HAND_LANDMARKER_TASK_URL = "/assets/vendor/mediapipe/hand_landmarker.task";

// Pre-generated rival voice clips — zero-latency playback via the page's
// single AudioContext. RIVAL_VOICE_SUFFIX is the single knob for swapping
// voice sets ("_jordi" = Jordi Enhanced, male Catalan; "_gruff" = spare set).
export const RIVAL_VOICE_DIR = "/assets/rival-voice";
export const RIVAL_VOICE_SUFFIX = "_jordi";
export const RIVAL_VOICE_WORDS = ["dos", "tres", "quatre", "cinc", "sis", "set", "vuit", "nou", "deu", "tot"] as const;
export const RIVAL_VOICE_GAIN = 1.2; // modest boost — the source clips run quiet; stays under clipping

// Debug telemetry caps (spike L979–986).
export const PAGE_VERSION = "apps/play ux-pirates r2 (veudelay-default) — spike-faithful vanilla TS port of s03-beat.html (sync mode only)";
export const DEBUG_LOG_CAP = 2000;
export const DEBUG_ORPHAN_CAP = 500;
export const EVENT_BUS_CAP = 5000;

// ux-pirates TEST FLAG (?veudelay=1), user-approved A/B 2026-08-16: defer
// the rival's voice clip to just after the capture window closes — the
// plan's own D3 construction ("the character's number word onset is at
// close + ε, strictly outside the buffered window"). Session 6b73fe52
// showed the instant-at-reveal clip lands ~510–600ms into every capture
// window, so blanking erases the tail of the player's shout (~340ms/window
// blanked; chronic [unk]s). OFF by default; the visual reveal is untouched
// — only the AUDIO waits until the window can no longer hear it.
// A/B result (sessions 6b73fe52 vs c358f352, 2026-08-16): deferring the
// clip took blanked-audio-in-window from ~342ms to 0ms and synced-throw
// recognition from 88% to 94% — now the DEFAULT. ?veudelay=0 restores the
// instant-at-reveal clip for comparison.
export const RIVAL_VOICE_DEFER =
  typeof location === "undefined" || new URLSearchParams(location.search).get("veudelay") !== "0";
export const RIVAL_VOICE_DEFER_EPS_MS = 60;

// Finger-count rule (2026-08-16, docs/finger-counting-accuracy.md): the
// shipped countFingers judges the thumb by its MCP angle — picked on a
// recorded corpus where the spike's lateral rule read a 4 as 5 on 36% of
// held frames. ?count=spike restores the verbatim spike rule for a field
// A/B; page_load logs which one is active.
export const FINGER_COUNT_RULE: "mcp" | "spike" =
  typeof location !== "undefined" && new URLSearchParams(location.search).get("count") === "spike" ? "spike" : "mcp";

// Rival engine (2026-08-17, docs/rival-intelligence-research.md): v2 is the
// measured policy (BMA over contexts + joint anti-aim + fixed cold τ);
// ?rival=spike restores the spike's ai.ts ladder for a field A/B. page_load
// and every game_commit log which one is in force.
export const RIVAL_ENGINE: "v2" | "spike" =
  typeof location !== "undefined" && new URLSearchParams(location.search).get("rival") === "spike" ? "spike" : "v2";
