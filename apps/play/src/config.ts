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
export const SYNC_PRE_MS = 400;
export const SYNC_POST_MS = 700;
export const SYNC_COOCCURRENCE_MS_DEFAULT = 400;
export const SYNC_PARTNER_TIMEOUT_MS = 1500; // how long a voice-only event waits for a hand onset before it's called incomplete

// step 11: a morra micatio round vs a committed-then-revealed AI opponent.
export const GAME_WIN_SCORE = 10;

// step 7/8: detector-sensitivity constants shared by the offline voice-onset
// analysis (findEnergyOnsetInBuffer) over the extracted ring buffer.
export const OFFLINE_ONSET_SUSTAIN_MS = 60; // sustained-energy requirement for the buffer-based voice onset
export const BUFFER_FLOOR_CAP = 0.15;       // adaptive noise floor cap, so a loud room can't out-shout a real shout
export const HAND_FRAME_HISTORY_MS = 3000;  // finger-count history ring retained for debugging/seam

// Vosk word recognition. Same CDN + self-hosted-model pattern as the spike:
// alphacephei blocks CORS, so the Catalan model is a same-origin copy under
// public/assets/ (prepare-assets.mjs copies it from spikes/models/). Grammar
// restricts output to the morra number words (+ "tot"/"deu" all-in calls)
// plus the reject class.
export const VOSK_CDN_URL = "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js";
export const VOSK_MODEL_URL = "/assets/vosk-model/vosk-model-small-ca-0.4.zip";
export const VOSK_SAMPLE_RATE = 16000;
export const VOSK_GRAMMAR_WORDS = ["dos", "tres", "quatre", "cinc", "sis", "set", "vuit", "nou", "deu", "tot", "[unk]"] as const;

// MediaPipe hands — byte-identical URLs to the spike (L1866–1892): the +esm
// suffix for the module import and the RAW package path for the wasm assets
// are two deliberately different URLs (jsdelivr quirk). Main thread only —
// no worker (0.10.14 ships no vision_bundle.js; the worker loader 404s).
export const MEDIAPIPE_VISION_ESM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";
export const MEDIAPIPE_VISION_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
export const MEDIAPIPE_HAND_LANDMARKER_TASK_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// Pre-generated rival voice clips — zero-latency playback via the page's
// single AudioContext. RIVAL_VOICE_SUFFIX is the single knob for swapping
// voice sets ("_jordi" = Jordi Enhanced, male Catalan; "_gruff" = spare set).
export const RIVAL_VOICE_DIR = "/assets/rival-voice";
export const RIVAL_VOICE_SUFFIX = "_jordi";
export const RIVAL_VOICE_WORDS = ["dos", "tres", "quatre", "cinc", "sis", "set", "vuit", "nou", "deu", "tot"] as const;
export const RIVAL_VOICE_GAIN = 1.2; // modest boost — the source clips run quiet; stays under clipping

// Debug telemetry caps (spike L979–986).
export const PAGE_VERSION = "apps/play — spike-faithful vanilla TS port of s03-beat.html (sync mode only)";
export const DEBUG_LOG_CAP = 2000;
export const DEBUG_ORPHAN_CAP = 500;
export const EVENT_BUS_CAP = 5000;
