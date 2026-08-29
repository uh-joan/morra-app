// onboarding.ts — the one-tap "Juga" flow. The three gesture-gated sensor
// buttons remain the ONLY entry points to the sensors (Chrome autoplay
// policy: the AudioContext resumes inside a real click handler). "Juga"
// keeps the gesture-critical work synchronous inside its own click —
// resume the AudioContext, open the camera, start the model download —
// but the MIC waits until the camera settles (field finding 2026-08-30:
// two concurrent getUserMedia calls race — the second gets NotAllowedError
// «not allowed by the user agent…» while the first prompt is pending,
// 17 such errors in the collector; clicking the title's individual buttons
// by hand, humanly serialized, «usually works well»). The context is
// already running from this gesture, so the deferred mic click needs no
// activation of its own. The buttons stay visible on the title screen for
// granular control and for the automated harnesses, which click them
// directly.
//
// Readiness is polled from the same live state the seam exposes
// (handTrackingActive / micReady / voskLoaded) — never from timers tied to
// the game loop. The overlay auto-advances the moment camera + mic are
// live; the 47 MB voice model keeps downloading in the background with a
// mini progress banner.

import { el } from "./dom.js";
import { ensureAudioResumed } from "./audioClock.js";
import { handTrackingActive } from "./camera.js";
import { micReady } from "./mic.js";
import { voskLoaded } from "./vosk.js";
import { logEvent } from "./telemetry.js";

export type OnboardTarget = "partida" | "entrenament";

let onReady: (target: OnboardTarget) => void = () => {};
export function setOnboardingReadyHook(hook: (target: OnboardTarget) => void): void {
  onReady = hook;
}

let target: OnboardTarget = "partida";
let pollTimer: ReturnType<typeof setInterval> | null = null;
let startedAt = 0;
/** The mic's turn is owed: fired by tick() once the camera settles (live
 * or errored) — one permission prompt at a time, never two racing. */
let micPending = false;

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

type RowState = "pending" | "on" | "err";

function setRow(row: string, state: RowState, detail?: string): void {
  const node = byId("obRow" + row);
  if (!node) return;
  node.dataset.state = state;
  const d = node.querySelector(".ob-state");
  if (d && detail != null) d.textContent = detail;
}

function chipBad(chip: HTMLElement): boolean {
  return chip.className.includes("bad");
}

function tick(): void {
  const camOn = handTrackingActive;
  const micOn = micReady();
  const veuOn = voskLoaded();

  // The camera settled (live or errored): now it's the mic's turn — its
  // prompt appears alone. The context already runs from the entry gesture.
  if (micPending && (camOn || chipBad(el.chipCamera))) {
    micPending = false;
    el.btnMic.click();
  }

  setRow("Cam", chipBad(el.chipCamera) ? "err" : camOn ? "on" : "pending", chipBad(el.chipCamera) ? "error" : camOn ? "a punt" : "obrint…");
  setRow("Mic", chipBad(el.chipMic) ? "err" : micOn ? "on" : "pending", chipBad(el.chipMic) ? "error" : micOn ? "a punt" : micPending ? "espera la càmera…" : "obrint…");
  setRow("Veu", chipBad(el.chipVosk) ? "err" : veuOn ? "on" : "pending", chipBad(el.chipVosk) ? "error" : veuOn ? "a punt" : "carregant…");

  // Mirror the model download detail (vosk.ts writes the % there).
  const veuDetail = byId("obVeuDetail");
  if (veuDetail) veuDetail.textContent = veuOn ? "" : (el.voskStatus.textContent ?? "");

  // Long-wait hint: permissions are probably sitting in a browser prompt.
  const hint = byId("obHint");
  if (hint) hint.hidden = !(performance.now() - startedAt > 12000 && (!camOn || !micOn));

  // The mini banner during background model download (select/fight screens).
  const mini = byId("veuMini");
  if (mini) {
    const show = startedAt > 0 && document.body.dataset.onboarding !== "on" && !veuOn && !chipBad(el.chipVosk);
    mini.hidden = !show;
    if (show) mini.textContent = (el.voskStatus.textContent ?? "") || "Carregant la veu…";
  }

  if (camOn && micOn && document.body.dataset.onboarding === "on") {
    document.body.dataset.onboarding = "off";
    logEvent("onboarding_ready", { target, veuLoaded: veuOn });
    onReady(target);
  }
}

function ensurePolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(tick, 250);
}

/** The "Juga" / "L'Espill" entry point. Must be called from a click. */
export function startOnboarding(t: OnboardTarget): void {
  target = t;
  startedAt = performance.now();
  document.body.dataset.onboarding = "on";
  logEvent("onboarding_start", { target: t });
  // Gesture-critical, synchronous: the AudioContext resume (the mic's
  // worklet needs it running), the camera, the model download. Disabled
  // buttons no-op safely on re-entry.
  void ensureAudioResumed();
  el.btnCam.click();
  el.btnLoadVosk.click();
  // The mic queues behind the camera — tick() fires it when the camera
  // settles, so the two permission prompts never race. A mic already live
  // (individual-button path, hot reload) has nothing pending.
  micPending = !micReady();
  ensurePolling();
  tick();
}

export function installOnboarding(): void {
  // Retry buttons proxy the real gated buttons (each retry is a real click).
  byId("obRetryCam")?.addEventListener("click", () => el.btnCam.click());
  byId("obRetryMic")?.addEventListener("click", () => el.btnMic.click());
  byId("obRetryVeu")?.addEventListener("click", () => el.btnLoadVosk.click());
  byId("obBack")?.addEventListener("click", () => {
    document.body.dataset.onboarding = "off";
    micPending = false; // don't fire a mic prompt after stepping off
  });
  // Keep polling from boot: if the sensors were started via the individual
  // buttons (or a hot reload left them live), rows and the mini banner stay
  // truthful and the overlay can still auto-advance.
  ensurePolling();
}
