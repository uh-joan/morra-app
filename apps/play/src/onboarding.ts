// onboarding.ts — the one-tap "Juga" flow. The three gesture-gated sensor
// buttons remain the ONLY entry points to the sensors (Chrome autoplay
// policy: the AudioContext resumes inside a real click handler). "Juga"
// dispatches .click() on all three synchronously inside its own click
// gesture, so the user activation is still valid for every handler — the
// buttons themselves stay visible on the title screen for granular control
// and for the automated harnesses, which click them directly.
//
// Readiness is polled from the same live state the seam exposes
// (handTrackingActive / micReady / voskLoaded) — never from timers tied to
// the game loop. The overlay auto-advances the moment camera + mic are
// live; the 47 MB voice model keeps downloading in the background with a
// mini progress banner.

import { el } from "./dom.js";
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

  setRow("Cam", chipBad(el.chipCamera) ? "err" : camOn ? "on" : "pending", chipBad(el.chipCamera) ? "error" : camOn ? "a punt" : "obrint…");
  setRow("Mic", chipBad(el.chipMic) ? "err" : micOn ? "on" : "pending", chipBad(el.chipMic) ? "error" : micOn ? "a punt" : "obrint…");
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
  // Same gesture, all three gates — disabled buttons no-op safely on re-entry.
  el.btnCam.click();
  el.btnMic.click();
  el.btnLoadVosk.click();
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
  });
  // Keep polling from boot: if the sensors were started via the individual
  // buttons (or a hot reload left them live), rows and the mini banner stay
  // truthful and the overlay can still auto-advance.
  ensurePolling();
}
