// entorn.ts — iteration-2 environment preset (2026-08-16 field playtest,
// docs/iteration-1-playtest-analysis.md §5.2): ONE player-facing switch,
// "Entorn", with two values, instead of scattered noise flags:
//
//   "tranquil"  🎧 — spike-verbatim everything: raw mic (no browser DSP),
//                    live-VAD floor 0.015. The parity harness's world.
//   "sorollos"  🔊 — noisy-venue bundle: browser noiseSuppression +
//                    echoCancellation ON, live-VAD floor raised from the
//                    measured room ambience, and (phase 3) the softer
//                    preWindow verdict policy.
//
// The offline onset's per-window floor priming (ONSET_FLOOR_PRIME_MS) is
// NOT gated here — it's correct in any environment and self-neutralizes in
// quiet rooms (primes to ~0.001 = spike-verbatim).
//
// Ambient calibration: after the mic goes live we sample ~1.5s of the live
// level stream, take a low quantile (same 25th-pct rationale as
// primeNoiseFloorFromBuffer), log it, and if the player is in Tranquil but
// the room clearly isn't, offer the switch in one tap. Calibration reruns
// on every mic (re)start, so re-checking a venue is just toggling the mic
// — or switching Entorn, which restarts the mic itself.
//
// Persisted in localStorage (unlike the 5 spike tunables, which stay
// unpersisted for spike parity — this setting is deliberately NEW surface,
// not a spike knob). URL ?entorn=tranquil|sorollos overrides for testing.

import { logEvent } from "./telemetry.js";

export type Entorn = "tranquil" | "sorollos";

const STORAGE_KEY = "morra_entorn";
const AMBIENT_SAMPLE_MS = 1500;
/** Live-VAD floor for sorollós = clamp(ambient*3, 0.015..0.12); before any
 * calibration completes, a conservative fixed raise. */
export const SOROLLOS_FALLBACK_FLOOR_MIN = 0.03;
/** Suggest switching to sorollós when the measured room floor alone clears
 * the tranquil detector's floorMin (0.015) — the exact condition under
 * which the field build false-fired on 64% of throws. */
export const SUGGEST_AMBIENT_THRESHOLD = 0.015;

// ------------------------------------------------------------- pure logic
// (kept DOM-free so unit tests run in plain node)

export function resolveEntorn(stored: string | null, urlValue: string | null): Entorn {
  if (urlValue === "sorollos" || urlValue === "tranquil") return urlValue;
  if (stored === "sorollos" || stored === "tranquil") return stored;
  return "tranquil";
}

/** Low-quantile ambient floor from live RMS samples (25th percentile —
 * robust to chatter/claps landing in the sample window). Returns null when
 * there aren't enough samples to trust (< 10). */
export function computeAmbientFloor(rmsSamples: readonly number[]): number | null {
  if (rmsSamples.length < 10) return null;
  const sorted = [...rmsSamples].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * 0.25)]!;
}

export function shouldSuggestSorollos(entorn: Entorn, ambientFloor: number | null): boolean {
  return entorn === "tranquil" && ambientFloor != null && ambientFloor > SUGGEST_AMBIENT_THRESHOLD;
}

/** Live-VAD floorMin for the current preset (+ measured ambience if any). */
export function liveFloorMinFor(entorn: Entorn, ambientFloor: number | null): number | undefined {
  if (entorn !== "sorollos") return undefined; // tranquil: leave the worklet at its 0.015 default
  if (ambientFloor == null) return SOROLLOS_FALLBACK_FLOOR_MIN;
  return Math.min(0.12, Math.max(0.015, ambientFloor * 3));
}

/** getUserMedia constraints per preset. Tranquil = spike-verbatim raw
 * capture; sorollós = let the browser fight the room. AGC stays off in
 * both: it rescales RMS mid-window, which would fight the onset detector's
 * adaptive floor in both presets. */
export function micConstraintsFor(entorn: Entorn): MediaTrackConstraints {
  return entorn === "sorollos"
    ? { echoCancellation: true, noiseSuppression: true, autoGainControl: false }
    : { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
}

// ------------------------------------------------------------ live state

let current: Entorn = "tranquil";
let measuredAmbientFloor: number | null = null;
let onEntornChange: (entorn: Entorn) => void = () => {};

export function getEntorn(): Entorn {
  return current;
}

export function getMeasuredAmbientFloor(): number | null {
  return measuredAmbientFloor;
}

/** mic.ts registers its restart-and-retune hook here (avoids an import
 * cycle: mic.ts already imports from this module). */
export function setEntornChangeHandler(handler: (entorn: Entorn) => void): void {
  onEntornChange = handler;
}

export function setEntorn(next: Entorn, source: "ui" | "suggestion" | "init"): void {
  if (next === current && source !== "init") return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage unavailable (private mode) — session-only is fine */
  }
  reflectEntornUI();
  logEvent("setting_change", { setting: "entorn", value: next, source });
  if (source !== "init") onEntornChange(next);
}

// ------------------------------------------------------- ambient sampling

let sampling: { samples: number[]; timer: ReturnType<typeof setTimeout> } | null = null;

/** Call once per mic (re)start; then feed it every onLevel rms. */
export function beginAmbientCalibration(): void {
  if (sampling) clearTimeout(sampling.timer);
  const samples: number[] = [];
  sampling = {
    samples,
    timer: setTimeout(() => {
      sampling = null;
      const floor = computeAmbientFloor(samples);
      measuredAmbientFloor = floor;
      logEvent("ambient_calibration", {
        entorn: current,
        ambientFloor: floor,
        sampleCount: samples.length,
        suggestedSorollos: shouldSuggestSorollos(current, floor),
      });
      if (shouldSuggestSorollos(current, floor)) showSorollosSuggestion();
      onCalibrated(current);
    }, AMBIENT_SAMPLE_MS),
  };
}

export function feedAmbientSample(rms: number): void {
  sampling?.samples.push(rms);
}

/** mic.ts registers "push the (re)tuned floor into the worklet" here. */
let onCalibrated: (entorn: Entorn) => void = () => {};
export function setCalibratedHandler(handler: (entorn: Entorn) => void): void {
  onCalibrated = handler;
}

// ---------------------------------------------------------------- DOM bits

function reflectEntornUI(): void {
  const seg = document.getElementById("entornToggle");
  if (!seg) return;
  seg.querySelectorAll<HTMLButtonElement>("button[data-entorn]").forEach((b) => {
    b.classList.toggle("active", b.dataset.entorn === current);
    b.setAttribute("aria-pressed", b.dataset.entorn === current ? "true" : "false");
  });
}

function showSorollosSuggestion(): void {
  const banner = document.getElementById("entornSuggest");
  if (banner) banner.hidden = false;
}

export function installEntorn(): void {
  current = resolveEntorn(
    (() => {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })(),
    new URLSearchParams(location.search).get("entorn")
  );
  setEntorn(current, "init");

  document.getElementById("entornToggle")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-entorn]");
    if (btn) setEntorn(btn.dataset.entorn as Entorn, "ui");
  });
  const banner = document.getElementById("entornSuggest");
  document.getElementById("entornSuggestYes")?.addEventListener("click", () => {
    if (banner) banner.hidden = true;
    setEntorn("sorollos", "suggestion");
  });
  document.getElementById("entornSuggestNo")?.addEventListener("click", () => {
    if (banner) banner.hidden = true;
    logEvent("setting_change", { setting: "entornSuggestDismissed", value: true });
  });
}
