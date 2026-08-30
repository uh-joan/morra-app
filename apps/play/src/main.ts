// main.ts — bootstrap, ports the M0 slice of spikes/s03-beat.html's init
// (L3808–3857): session footer, error handling, telemetry flushing, initial
// chip states. Sensor startup is GESTURE-GATED behind the spike's own three
// buttons (Start Camera / Start Mic / Load Voice Recognition) — the
// ux-pirates "Juga" flow only proxies .click() onto them inside its own
// click gesture, so the AudioContext still only ever resumes inside a real
// user gesture, never on load (Chrome autoplay policy).

import "./style.css";
import { el } from "./dom.js";
import { installErrorHandling, setChip } from "./status.js";
import { installTelemetryFlushing, logEvent, LOG_SESSION_ID } from "./telemetry.js";
import { FINGER_COUNT_RULE, PAGE_VERSION, RIVAL_ENGINE, RIVAL_VOICE_DEFER } from "./config.js";
import { installClockUpkeep } from "./audioClock.js";
import { setFrameCountHandler, startCamera } from "./camera.js";
import { pushVadTuning, setVoiceOnsetHandler, startMic, updateMicMeterUI } from "./mic.js";
import { loadVoskModel } from "./vosk.js";
import { setHandOnsetHandler } from "./velocity.js";
import { drainPendingAnalysis, onSyncHandOnset, onSyncVoiceOnset } from "./analysis.js";
import { renderReadyPill, setPillRenderHook, updateReadyPillFromFrame } from "./readyPill.js";
import { resetSyncVerdict } from "./render/syncVerdict.js";
import { installSeam } from "./seam.js";
import { getPlayerModel, installGame } from "./game.js";
import { getActiveProfileId, getActiveProfileName, profileNameHash } from "./profile.js";
import { installExport } from "./export.js";
import { installTraining } from "./training.js";
import { installModes } from "./modes.js";
import { installSettings } from "./settings.js";
import { installEntorn } from "./entorn.js";
import { installProfiles } from "./profiles.js";
import { installScreens } from "./screens.js";
import { installTecnic } from "./tecnic.js";
import { installLandmarkRecorder } from "./landmarkRecorder.js";
import { installCalibration } from "./calibration.js";

installErrorHandling();
installTelemetryFlushing();
installClockUpkeep();

// Gesture-gated sensor startup (finding A): the spike's own three buttons.
el.btnCam.addEventListener("click", () => void startCamera());
el.btnMic.addEventListener("click", () => void startMic());
el.btnLoadVosk.addEventListener("click", () => void loadVoskModel());
el.tuneVadMult.addEventListener("input", pushVadTuning);
el.tuneVadMult.addEventListener("change", pushVadTuning);

// Sensor events → the sync throw pipeline (M3).
setHandOnsetHandler(onSyncHandOnset);
setVoiceOnsetHandler(onSyncVoiceOnset);
setFrameCountHandler(updateReadyPillFromFrame);

// The game layer (M5): installs the real GameHooks into analysis.ts, wires
// the level selector + Torna a jugar, mints the first commitment, preloads
// the rival voice clips.
installGame();
installExport();
installTraining();
installModes();
installSettings();
  installEntorn();
installProfiles();

installSeam();
renderReadyPill();
resetSyncVerdict();

// ux-pirates presentation layer: screens (title → select → fight), the
// one-tap onboarding, the corsair figures + choreography, mode tècnic.
// Installed last — it reads the level installGame restored.
installTecnic();
installScreens();
// r3: the whole player card takes the ready pill's color — green armed
// (throw), blue analyzing (reading), orange not-armed (back to the fist).
// The pill's own state is the single source; this is one attribute + CSS.
{
  const side = document.querySelector<HTMLElement>(".player-side");
  setPillRenderHook((state) => {
    if (side) side.dataset.pill = state;
  });
}
installLandmarkRecorder(); // ?rec=1 only — the finger-count corpus recorder
installCalibration(); // L'Espill → Calibratge (per profile + camera)

// The shared rAF frame loop (spike frame(), L1385–1449): mic meters + the
// sync-analysis drain — extraction fires only once now >= anchor +
// SYNC_POST_MS (single loop, never a second one; invariant 2).
function frame(now: number): void {
  requestAnimationFrame(frame);
  drainPendingAnalysis(now);
  updateMicMeterUI();
}
requestAnimationFrame(frame);

el.sessionIdFooter.textContent = `session ${LOG_SESSION_ID} — ${PAGE_VERSION}`;

// Initial chip states (idle until each subsystem's start button is pressed).
setChip(el.chipCamera, "idle", "dim");
setChip(el.chipModel, "not loaded", "dim");
setChip(el.chipHand, "—", "dim");
setChip(el.chipMic, "idle", "dim");
setChip(el.chipVad, "—", "dim");
setChip(el.chipVosk, "not loaded", "dim");
setChip(el.chipClock, "unsampled", "dim");

// Device context (field crashes 2026-08-30): a home-screen web app on iOS
// dies where a Safari tab survives — without displayMode + ua in the logs
// those sessions were invisible among the permission-abandoners.
const nav = navigator as Navigator & { standalone?: boolean; deviceMemory?: number };
const displayMode = matchMedia("(display-mode: standalone)").matches || nav.standalone === true ? "standalone" : "browser";
logEvent("page_load", {
  pageVersion: PAGE_VERSION,
  veudelayActive: RIVAL_VOICE_DEFER,
  fingerCountRule: FINGER_COUNT_RULE,
  rivalEngine: RIVAL_ENGINE,
  displayMode,
  ua: navigator.userAgent,
  deviceMemory: nav.deviceMemory ?? null,
});
// Field study (2026-08-18): every session says WHO is playing from the first
// event — the active profile at boot, not only on a switch — so the logs can
// be split per player later without guessing.
logEvent("profile_active", { profileId: getActiveProfileId(), profileHash: profileNameHash(getActiveProfileName()), throws: getPlayerModel().throws.length });
