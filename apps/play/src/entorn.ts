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

/** Browser-DSP override (iteration-2 fix #4). "auto" = whatever the Entorn
 * preset implies; "on"/"off" pin it regardless of preset, so a field A/B
 * can attribute a win to the DSP alone instead of to the whole sorollós
 * bundle (DSP + raised live floor + preWindow demotion move together). */
export type DspMode = "auto" | "on" | "off";

const STORAGE_KEY = "morra_entorn";
const DSP_STORAGE_KEY = "morra_dsp";
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

/** Phase-3 verdict softening (iteration-2 fix #3): in sorollós, an onset
 * pinned at the window edge (preWindow=true) is treated as NO voice
 * evidence — the round classifies by hand alone (hand-only void, "cap crit
 * sentit") instead of burning as voice-early ("massa aviat"). Rationale
 * from the field data: after floor priming, a residual pinned onset in a
 * noisy room is near-certainly the room, not the player. Tradeoff, by
 * design: a REAL 600ms-early shout in sorollós also reads hand-only — the
 * round is void either way, no advantage to be had; and in tranquil the
 * strict spike semantics are untouched. Kept as a pure function so the
 * rule is unit-testable and greppable. */
export function demotePreWindowOnset(entorn: Entorn, preWindow: boolean): boolean {
  return entorn === "sorollos" && preWindow;
}

export function resolveDspMode(stored: string | null, urlValue: string | null): DspMode {
  // ?dsp=1|0 reads naturally in the field; on|off|auto also accepted.
  const fromUrl = urlValue === "1" ? "on" : urlValue === "0" ? "off" : urlValue;
  if (fromUrl === "on" || fromUrl === "off" || fromUrl === "auto") return fromUrl;
  if (stored === "on" || stored === "off" || stored === "auto") return stored;
  return "auto";
}

/** Whether the browser's noise suppression / echo cancellation is on, given
 * the preset and the override. "auto" keeps the preset's own answer. */
export function dspEnabledFor(entorn: Entorn, mode: DspMode): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return entorn === "sorollos";
}

/** getUserMedia constraints per preset. Tranquil = spike-verbatim raw
 * capture; sorollós = let the browser fight the room. AGC stays off in
 * both — and regardless of the override: it rescales RMS mid-window, which
 * would fight the onset detector's adaptive floor in every configuration. */
export function micConstraintsFor(entorn: Entorn, mode: DspMode = "auto"): MediaTrackConstraints {
  const dsp = dspEnabledFor(entorn, mode);
  return { echoCancellation: dsp, noiseSuppression: dsp, autoGainControl: false };
}

// ------------------------------------------------------------ live state

let current: Entorn = "tranquil";
let currentDsp: DspMode = "auto";
let measuredAmbientFloor: number | null = null;
let onEntornChange: (entorn: Entorn) => void = () => {};

export function getEntorn(): Entorn {
  return current;
}

export function getDspMode(): DspMode {
  return currentDsp;
}

export function getMeasuredAmbientFloor(): number | null {
  return measuredAmbientFloor;
}

/** mic.ts registers its restart-and-retune hook here (avoids an import
 * cycle: mic.ts already imports from this module). */
export function setEntornChangeHandler(handler: (entorn: Entorn) => void): void {
  onEntornChange = handler;
}

export function setEntorn(next: Entorn, source: "ui" | "suggestion" | "init" | "calibration"): void {
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

/** The DSP override is capture configuration, exactly like the preset's own
 * constraints — so changing it takes the same mic-restart path. */
export function setDspMode(next: DspMode, source: "ui" | "init"): void {
  if (next === currentDsp && source !== "init") return;
  currentDsp = next;
  try {
    localStorage.setItem(DSP_STORAGE_KEY, next);
  } catch {
    /* storage unavailable (private mode) — session-only is fine */
  }
  reflectDspUI();
  logEvent("setting_change", {
    setting: "dsp",
    value: next,
    effective: dspEnabledFor(current, next),
    source,
  });
  if (source !== "init") onEntornChange(current);
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
        // Capture config in force for the mic this calibration measured —
        // the segment key for the fix-#4 A/B when reading a session back.
        dspMode: currentDsp,
        dsp: dspEnabledFor(current, currentDsp),
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

function reflectDspUI(): void {
  const seg = document.getElementById("dspToggle");
  if (!seg) return;
  seg.querySelectorAll<HTMLButtonElement>("button[data-dsp]").forEach((b) => {
    b.classList.toggle("active", b.dataset.dsp === currentDsp);
    b.setAttribute("aria-pressed", b.dataset.dsp === currentDsp ? "true" : "false");
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
  setDspMode(
    resolveDspMode(
      (() => {
        try {
          return localStorage.getItem(DSP_STORAGE_KEY);
        } catch {
          return null;
        }
      })(),
      new URLSearchParams(location.search).get("dsp")
    ),
    "init"
  );

  document.getElementById("entornToggle")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-entorn]");
    if (btn) setEntorn(btn.dataset.entorn as Entorn, "ui");
  });
  document.getElementById("dspToggle")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-dsp]");
    if (btn) setDspMode(btn.dataset.dsp as DspMode, "ui");
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
