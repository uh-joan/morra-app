// calibration.ts — "Calibratge": a guided throw session in L'Espill that
// fits the sensor thresholds to THIS player on THIS camera, per profile +
// device. Evidence-driven like everything else in the app — every step
// advances on what the camera/mic saw, never on a countdown.
//
//   0 Enquadra  — the ghost hand (framing.ts): no measurement counts until
//                 the hand is in the zone (corpus: framing alone moves the
//                 count from ~70% to ~100% correct).
//   1 Quiet     — fist still, in zone: ~60 frames of low velocity → the
//                 resting-jitter floor; ~1.5 s of live RMS → the room floor.
//   2 Tira      — prompted throws ("Tira un 3 i crida fort") — the app knows
//                 the truth because it asked. Per throw: peak centroid
//                 velocity between motion start and settle, shout peak RMS
//                 around the throw, and the count the pipeline read.
//   3 Resultat  — the fits (calibration/fit.ts), shown old → new with one
//                 line of why each; Desa / Descarta / Restableix.
//
// Pure calibration: prompted throws are NOT training throws — game.ts skips
// recordTrainingThrow while this is active (a "tira un 3" isn't a choice and
// the L4 rival must not learn from it). Rules never move (co-occurrence).
// Values are applied INTO the live sliders (mode tècnic keeps working;
// everything stays inspectable) and persisted per profile+device
// (calibration/store.ts); on profile switch or camera start the stored fit
// for the active profile+device is re-applied, or the app defaults if none.

import { el } from "./dom.js";
import { logEvent } from "./telemetry.js";
import { addThrowObserver, type ThrowEvent } from "./analysis.js";
import { cameraDeviceKey, currentFraming, handTrackingActive, lastFingerCount, setDeviceKeyHandler, setFramingGuide, setFramingHandler } from "./camera.js";
import { currentHandState, peakVelocityBetween, velocityHistory } from "./velocity.js";
import { micReady, micRmsBetween, pushVadTuning } from "./mic.js";
import { getEntorn, setEntorn, SUGGEST_AMBIENT_THRESHOLD, type Entorn } from "./entorn.js";
import { getActiveProfileId } from "./profile.js";
import { APP_DEFAULTS, FIT_VERSION, fitAll, quantile, round2, type CalibrationValues, MIN_THROWS } from "./calibration/fit.js";
import { appendSession, loadBlob, pooledSamples, recordFor, saveBlob, withoutRecord, withRecord, type CalibrationRecord, type SessionSamples } from "./calibration/store.js";
import type { FramingState } from "./framing.js";
import { HARD_COPY, judgeCalibrationThrow, REPEAT_COPY, shouldRepeatPrompt, VERDICT_COPY } from "./calibration/judge.js";

// ------------------------------------------------------------ apply/persist

let calibrating = false;
export function isCalibrating(): boolean {
  return calibrating;
}

/** How a calibration session ended: Desa, Descarta/Restableix, or the ✕.
 * The hook fires once per session, AFTER cleanup — screens.ts owns what
 * happens next (leave the Calibratge page; first-run: "a jugar"). */
export type CalibrationEndOutcome = "saved" | "reset" | "closed";
let onEnd: ((outcome: CalibrationEndOutcome) => void) | null = null;
export function setCalibrationEndHook(hook: (outcome: CalibrationEndOutcome) => void): void {
  onEnd = hook;
}

export function currentValues(): CalibrationValues {
  return {
    highV: parseFloat(el.tuneHighV.value),
    lowV: parseFloat(el.tuneLowV.value),
    vadMult: parseFloat(el.tuneVadMult.value),
  };
}

function applyValues(v: CalibrationValues, source: string): void {
  el.tuneHighV.value = String(round2(v.highV));
  el.tuneLowV.value = String(round2(v.lowV));
  el.tuneVadMult.value = String(round2(v.vadMult));
  pushVadTuning(); // the worklet reads vadMult on push, the FSM reads highV/lowV live
  logEvent("calibration_apply", { profileId: getActiveProfileId(), deviceKey: cameraDeviceKey, values: v, source });
}

/** Is there a saved fit for the active profile on the CURRENT camera?
 * Meaningful once the camera is up (the device key is known) — the play
 * detour asks exactly then. */
export function hasCalibrationForCurrentSite(): boolean {
  return recordFor(loadBlob(getActiveProfileId()), cameraDeviceKey) != null;
}

/** profile+camera, as one key — what a calibration is FOR (and what a
 * declined detour is remembered against, per session). */
export function calibrationSiteKey(): string {
  return getActiveProfileId() + "|" + (cameraDeviceKey ?? "");
}

// Declined invitations, per profile+camera, for THIS session only — the
// tripulants' invitation pill won't re-show until the next page load.
// Owned here (it is calibration state); screens.ts is the only writer via
// the end hook and the pill's ✕. (The old play detour and its forever-skip
// flag are gone — 2026-08-28: nobody is interposed anymore; a stale
// morra-calib-skip-v1 key in localStorage is harmless.)
const declinedSites = new Set<string>();
export function markCalibrationDeclined(): void {
  declinedSites.add(calibrationSiteKey());
}
export function isCalibrationDeclined(): boolean {
  return declinedSites.has(calibrationSiteKey());
}

/** Re-apply the stored fit for the active profile on the current camera —
 * or the app defaults if there is none. Called on profile switch and when
 * the camera reports its device key. */
export function applyCalibrationForActiveProfile(): CalibrationRecord | null {
  const pid = getActiveProfileId();
  let rec = recordFor(loadBlob(pid), cameraDeviceKey);
  if (rec) rec = refitIfStale(pid, rec);
  applyValues(rec ? rec.values : APP_DEFAULTS, rec ? "stored" : "defaults");
  reflectStatus(rec);
  return rec;
}

/** A record fitted by an older rule is re-fit from its saved samples and
 * re-saved — the math got better, the player doesn't redo the session. */
export function refitIfStale(pid: string, rec: CalibrationRecord): CalibrationRecord {
  if ((rec.fitVersion ?? 1) === FIT_VERSION) return rec;
  const s = pooledSamples(rec);
  const { values } = fitAll(
    APP_DEFAULTS,
    s.jitterP95 != null ? { jitterP95: s.jitterP95, throwPeaks: s.throwPeaks } : null,
    s.ambientFloor != null ? { ambientFloor: s.ambientFloor, shoutPeaks: s.shoutPeaks } : null
  );
  const next: CalibrationRecord = { ...rec, values, fitVersion: FIT_VERSION };
  saveBlob(pid, withRecord(loadBlob(pid), cameraDeviceKey, next));
  logEvent("calibration_refit", { profileId: pid, deviceKey: cameraDeviceKey, from: rec.fitVersion ?? 1, to: FIT_VERSION, before: rec.values, values });
  return next;
}

// ------------------------------------------------------------------ hand
// Which hand throws (right by default): pure presentation — the Calibratge
// page mirrors so the camera sits on the throwing-hand side and the steps
// on the free-hand side. Persisted like the entorn choice.

export type Ma = "dreta" | "esquerra";
const MA_KEY = "morra_ma";

function applyMa(ma: Ma): void {
  document.body.dataset.ma = ma;
  document.getElementById("maDreta")?.classList.toggle("on", ma === "dreta");
  document.getElementById("maEsquerra")?.classList.toggle("on", ma === "esquerra");
}

function installMa(): void {
  let stored: string | null = null;
  try { stored = localStorage.getItem(MA_KEY); } catch { /* private browsing */ }
  applyMa(stored === "esquerra" ? "esquerra" : "dreta");
  for (const id of ["maDreta", "maEsquerra"] as const) {
    document.getElementById(id)?.addEventListener("click", (ev) => {
      const ma = (ev.currentTarget as HTMLElement).dataset.ma as Ma;
      applyMa(ma);
      try { localStorage.setItem(MA_KEY, ma); } catch { /* session-only then */ }
      logEvent("setting_change", { setting: "ma", value: ma });
    });
  }
}

// ------------------------------------------------------------------ flow

type Step = "idle" | "frame" | "quiet" | "throws" | "result";
const PROMPTS: readonly number[] = [3, 1, 4, 2, 5]; // thumb-in AND thumb-out numbers, small ones included
const QUIET_FRAMES = 60;
const FRAME_STABLE_FRAMES = 20;

interface Session {
  step: Step;
  /** timestamp of the last CAMERA frame we counted — the step machine runs
   * on rAF (~60/s) but frames arrive at ~30/s; steps count frames, not ticks */
  lastFrameT: number | null;
  frameStable: number;
  quiet: number[];
  quietStartT: number | null;
  promptIdx: number;
  /** accepted-but-misread attempts on the CURRENT prompt */
  attempt: number;
  throwPeaks: number[];
  shoutPeaks: number[];
  prompts: { truth: number; count: number | null; attempt?: number; hard?: boolean }[];
  jitterP95: number | null;
  ambientFloor: number | null;
  /** Entorn decided from the measured room floor (quiet step) */
  entornBefore: Entorn | null;
  entornDecided: Entorn | null;
  awaitingThrow: ThrowEvent | null;
  fitted: { values: CalibrationValues; before: CalibrationValues; which: { velocity: boolean; voice: boolean } } | null;
  pooledInfo: { throws: number; sessions: number; weakest: number; jitter: number | null } | null;
}
let S: Session | null = null;
let rafId: number | null = null;
let unobserve: (() => void) | null = null;

function ui() {
  const g = (id: string) => document.getElementById(id);
  return {
    overlay: g("calibOverlay"),
    title: g("calibTitle"),
    body: g("calibBody"),
    prompt: g("calibPrompt"),
    dots: g("calibDots"),
    result: g("calibResult"),
    feedback: g("calibFeedback"),
    save: g("calibSave") as HTMLButtonElement | null,
    discard: g("calibDiscard") as HTMLButtonElement | null,
    reset: g("calibReset") as HTMLButtonElement | null,
    close: g("calibClose") as HTMLButtonElement | null,
    status: g("calibStatus"),
  };
}

function reflectStatus(rec: CalibrationRecord | null): void {
  const { status } = ui();
  if (!status) return;
  if (!rec) {
    status.textContent = "Sense calibrar en aquesta càmera — valors per defecte.";
    status.classList.remove("ok");
  } else {
    const d = new Date(rec.measuredAt);
    status.textContent = `Calibrat ${d.toLocaleDateString()} · tirada ${round2(rec.values.highV)} · crit ×${round2(rec.values.vadMult)}`;
    status.classList.add("ok");
  }
}

function setStep(step: Step): void {
  if (!S) return;
  S.step = step;
  const u = ui();
  document.body.dataset.calib = step;
  logEvent("calibration_step", { step });
  const copy: Record<Step, [string, string]> = {
    idle: ["", ""],
    frame: ["1 · Enquadra la mà", "Posa la mà oberta dins la silueta daurada. Quan s'ompli d'or, ja hi ets."],
    quiet: ["2 · Puny quiet", "Tanca el puny i queda't quiet dins la silueta un moment. Mesurem el teu repòs i el soroll de la sala."],
    throws: ["3 · Tira", ""],
    result: ["4 · Resultat", "Això és el que hem après de tu. Desa-ho per a aquest perfil en aquesta càmera, o descarta-ho."],
  };
  if (u.title) u.title.textContent = copy[step][0];
  if (u.body) u.body.textContent = copy[step][1];
  if (u.prompt) u.prompt.hidden = step !== "throws";
  if (u.result) u.result.hidden = step !== "result";
  if (u.feedback) { u.feedback.hidden = step !== "throws"; if (step === "throws") { u.feedback.textContent = ""; u.feedback.className = "calib-feedback"; } }
  if (u.save) u.save.hidden = step !== "result";
  if (u.discard) u.discard.hidden = step !== "result";
  renderDots();
  if (step === "throws") renderPrompt();
}

function renderDots(): void {
  const { dots } = ui();
  if (!dots || !S) return;
  dots.replaceChildren(
    ...PROMPTS.map((n, i) => {
      const d = document.createElement("span");
      d.className = "calib-dot" + (i < S!.promptIdx ? " done" : i === S!.promptIdx && S!.step === "throws" ? " now" : "");
      d.textContent = String(n);
      return d;
    })
  );
}

function renderPrompt(): void {
  const { prompt } = ui();
  if (!prompt || !S) return;
  const n = PROMPTS[S.promptIdx]!;
  const word = ["zero", "un", "dos", "tres", "quatre", "cinc"][n]!;
  prompt.innerHTML = `Des del puny, <b>tira un ${n}</b> i <b>crida fort</b> qualsevol número.<br><small>(${word} — la veritat és el que et demanem, no el que reconeguem)</small>`;
}

/** rAF-driven step machine — reads live sensor state, no timers. Every
 * branch first waits for a NEW camera frame (velocityHistory's last entry
 * changed), so "N frames" means camera frames. */
function tick(): void {
  if (!S) return;
  rafId = requestAnimationFrame(tick);
  const last = velocityHistory[velocityHistory.length - 1];
  const fr = currentFraming();
  const newFrame = !!last && last.t !== S.lastFrameT;
  if (!newFrame && fr.hint !== "no-hand") return; // nothing new to judge
  if (last) S.lastFrameT = last.t;
  const now = performance.now();

  if (S.step === "frame") {
    S.frameStable = fr.inZone ? S.frameStable + 1 : 0;
    if (S.frameStable >= FRAME_STABLE_FRAMES) setStep("quiet");
    return;
  }
  if (S.step === "quiet") {
    const fist = (lastFingerCount() ?? 5) <= 1;
    if (!fr.inZone || currentHandState() !== "idle" || !fist || !last) {
      if (S.quiet.length) quietProgress(0, !fist ? "Tanca el puny." : !fr.inZone ? "Torna a la silueta." : "Quiet…");
      S.quiet = [];
      S.quietStartT = null;
      return;
    }
    if (S.quietStartT == null) S.quietStartT = now;
    S.quiet.push(last.v);
    quietProgress(S.quiet.length / QUIET_FRAMES, "Quiet… així.");
    if (S.quiet.length >= QUIET_FRAMES) {
      S.jitterP95 = quantile(S.quiet, 0.95);
      const rms = micRmsBetween(S.quietStartT, now);
      S.ambientFloor = rms.length >= 10 ? quantile(rms, 0.25) : null;
      // Entorn from the room itself: the same rule the title-screen banner
      // uses (a floor above the tranquil detector's 0.015 = a noisy room),
      // decided here in BOTH directions and applied before the throws so
      // they're judged under the right preset. Switching restarts the mic;
      // the throws step waits for it (see below). Caveat, stated: the floor
      // is measured under the CURRENT preset — sorollós's DSP flattens it —
      // so a noisy room can read quiet from inside sorollós; if the switch
      // to tranquil is wrong, entorn's own post-restart ambient calibration
      // raises the banner again.
      S.entornBefore = getEntorn();
      S.entornDecided = S.ambientFloor != null && S.ambientFloor > SUGGEST_AMBIENT_THRESHOLD ? "sorollos" : "tranquil";
      if (S.entornDecided !== S.entornBefore) setEntorn(S.entornDecided, "calibration");
      logEvent("calibration_quiet", {
        jitterP95: S.jitterP95, ambientFloor: S.ambientFloor, frames: S.quiet.length, rmsSamples: rms.length,
        entornBefore: S.entornBefore, entornDecided: S.entornDecided,
      });
      setStep("throws");
    }
    return;
  }
  if (S.step === "throws" && !micReady()) {
    // preset switch in flight: the mic is restarting — say so, don't take throws yet
    const { feedback } = ui();
    if (feedback && !/micròfon/.test(feedback.textContent ?? "")) setFeedback("Un moment — reajusto el micròfon a la sala…", "no");
    return;
  }
}

function quietProgress(frac: number, note: string): void {
  const { body } = ui();
  if (!body || !S || S.step !== "quiet") return;
  const bar = "█".repeat(Math.round(frac * 12)).padEnd(12, "░");
  body.textContent = `Tanca el puny i queda't quiet dins la silueta. ${bar} ${note}`;
}

function onThrowStart(t: ThrowEvent): void {
  if (!S || S.step !== "throws" || S.awaitingThrow) return;
  S.awaitingThrow = t;
}

function setFeedback(text: string, kind: "ok" | "no"): void {
  const { feedback } = ui();
  if (!feedback) return;
  feedback.textContent = text;
  feedback.className = "calib-feedback " + kind;
  feedback.hidden = false;
}

function onThrowFinalized(t: ThrowEvent): void {
  if (!S || S.step !== "throws" || S.awaitingThrow !== t) return;
  S.awaitingThrow = null;
  const truth = PROMPTS[S.promptIdx]!;
  const from = t.handOnsetPerfTime ?? t.handSettlePerfTime ?? performance.now();
  const to = t.handSettlePerfTime ?? from;
  const peak = peakVelocityBetween(from - 30, to + 30);
  // shout: the loudest live-RMS reading from a bit before motion start to
  // well after settle (the capture window is SYNC_POST_MS after the anchor)
  const rms = micRmsBetween(from - 300, to + 800);
  const shout = rms.length ? Math.max(...rms) : null;
  const verdict = judgeCalibrationThrow({
    outcome: t.outcome,
    fingerCount: t.handFingerCount,
    voiceOnsetPerfTime: t.voiceOnsetPerfTime,
    shoutPeak: shout,
    ambientFloor: S.ambientFloor,
  });
  logEvent("calibration_throw", { prompt: truth, count: t.handFingerCount, peak, shout, outcome: t.outcome, verdict });
  if (!verdict.accept) {
    // Not the prompted throw — keep waiting on the SAME prompt. The return
    // to fist after an accepted throw is a reset and is EXPECTED: ignore it
    // silently; only a silent or fingerless throw gets told why.
    if (verdict.reason !== "reset") setFeedback(VERDICT_COPY[verdict.reason], "no");
    return;
  }
  // The shout is a valid voice sample whatever the count read.
  if (shout != null) S.shoutPeaks.push(shout);
  S.attempt++;
  const count = t.handFingerCount;
  if (shouldRepeatPrompt(truth, count, S.attempt)) {
    // Misread: repeat the SAME prompt. The peak isn't taken — a "1" read as
    // 3 may have been a thrown 3, and the weakest throw is the fit's input.
    S.prompts.push({ truth, count, attempt: S.attempt });
    setFeedback(REPEAT_COPY(truth, count, S.attempt), "no");
    return;
  }
  const hard = count !== truth; // capped out: accept-and-flag
  if (peak != null) S.throwPeaks.push(peak);
  S.prompts.push({ truth, count, attempt: S.attempt, hard });
  setFeedback(hard ? HARD_COPY(truth, count) : VERDICT_COPY.accepted(truth, count), hard ? "no" : "ok");
  logEvent("calibration_prompt_done", { prompt: truth, count, attempts: S.attempt, hard });
  S.attempt = 0;
  S.promptIdx++;
  renderDots();
  if (S.promptIdx >= PROMPTS.length) finish();
  else renderPrompt();
}

function thisSession(): SessionSamples {
  if (!S) throw new Error("no session");
  return { jitterP95: S.jitterP95, throwPeaks: S.throwPeaks, ambientFloor: S.ambientFloor, shoutPeaks: S.shoutPeaks, prompts: S.prompts, measuredAt: new Date().toISOString() };
}

function finish(): void {
  if (!S) return;
  const before = currentValues();
  // Fit on this session POOLED with the previous ones for this
  // profile+device (store.ts POOL_SESSIONS) — a stable weakest-throw
  // estimate, not this session's luck.
  const prev = recordFor(loadBlob(getActiveProfileId()), cameraDeviceKey);
  const pooled = pooledSamples({ samples: thisSession(), history: appendSession(prev, thisSession()) });
  const { values, fitted } = fitAll(
    before,
    pooled.jitterP95 != null ? { jitterP95: pooled.jitterP95, throwPeaks: pooled.throwPeaks } : null,
    pooled.ambientFloor != null ? { ambientFloor: pooled.ambientFloor, shoutPeaks: pooled.shoutPeaks } : null
  );
  S.fitted = { values, before, which: fitted };
  S.pooledInfo = { throws: pooled.throwPeaks.length, sessions: pooled.sessions, weakest: pooled.throwPeaks.length ? Math.min(...pooled.throwPeaks) : NaN, jitter: pooled.jitterP95 };
  const { result } = ui();
  if (result) {
    const line = (label: string, b: number, a: number, why: string, did: boolean) =>
      `<div class="calib-line${did ? "" : " muted"}"><span class="k">${label}</span><span class="v">${round2(b)} → <b>${round2(a)}</b></span><small>${did ? why : "no s'ha pogut ajustar (poques mostres)"}</small></div>`;
    const pi = S.pooledInfo;
    const done = S.prompts.filter((p) => p.attempt != null && (p.count === p.truth || p.hard));
    const readOk = done.filter((p) => p.count === p.truth).length;
    const hardOnes = done.filter((p) => p.hard).map((p) => p.truth);
    const entornLine = S.entornDecided
      ? `<div class="calib-line"><span class="k">Entorn</span><span class="v">${S.entornBefore === S.entornDecided ? "" : `${S.entornBefore === "sorollos" ? "Local sorollós" : "Tranquil"} → `}<b>${S.entornDecided === "sorollos" ? "Local sorollós" : "Tranquil"}</b></span><small>soroll de sala ${(S.ambientFloor ?? 0).toFixed(4)} ${S.ambientFloor != null && S.ambientFloor > SUGGEST_AMBIENT_THRESHOLD ? ">" : "≤"} ${SUGGEST_AMBIENT_THRESHOLD}</small></div>`
      : "";
    result.innerHTML =
      entornLine +
      line("Llindar de tirada (HIGH_V)", before.highV, values.highV, `la teva tirada més fluixa pica a ${round2(pi?.weakest ?? NaN)} (${pi?.throws ?? 0} tirades, ${pi?.sessions ?? 1} sessi${(pi?.sessions ?? 1) === 1 ? "ó" : "ons"}); el repòs a ${round2(pi?.jitter ?? NaN)}`, fitted.velocity) +
      line("Llindar d'aturada (LOW_V)", before.lowV, values.lowV, `just per sobre del teu repòs`, fitted.velocity) +
      line("Sensibilitat del crit", before.vadMult, values.vadMult, `el teu crit ${round2((quantile(S.shoutPeaks, 0.5) || 0) / (S.ambientFloor || 1))}× per sobre del soroll de la sala`, fitted.voice) +
      `<div class="calib-line${hardOnes.length ? " muted" : ""}"><span class="k">Lectura dels dits</span><span class="v"><b>${readOk}/${done.length}</b></span><small>${S.prompts.map((p) => `${p.truth}→${p.count ?? "?"}${p.hard ? "⚠" : ""}`).join("  ")}${hardOnes.length ? ` · números difícils: ${hardOnes.join(", ")}` : ""}</small></div>`;
  }
  logEvent("calibration_result", { before, values, fitted, samples: { jitterP95: S.jitterP95, throwPeaks: S.throwPeaks, ambientFloor: S.ambientFloor, shoutPeaks: S.shoutPeaks, prompts: S.prompts } });
  setStep("result");
}

function save(): void {
  if (!S?.fitted) return;
  const pid = getActiveProfileId();
  const prev = recordFor(loadBlob(pid), cameraDeviceKey);
  const session = thisSession();
  const rec: CalibrationRecord = {
    values: S.fitted.values,
    fitVersion: FIT_VERSION,
    measuredAt: session.measuredAt!,
    samples: session,
    history: appendSession(prev, session),
  };
  saveBlob(pid, withRecord(loadBlob(pid), cameraDeviceKey, rec));
  applyValues(rec.values, "calibration");
  logEvent("calibration_saved", { profileId: pid, deviceKey: cameraDeviceKey, values: rec.values });
  reflectStatus(rec);
  stop("saved");
}

function resetToDefaults(): void {
  const pid = getActiveProfileId();
  saveBlob(pid, withoutRecord(loadBlob(pid), cameraDeviceKey));
  applyValues(APP_DEFAULTS, "reset");
  logEvent("calibration_reset", { profileId: pid, deviceKey: cameraDeviceKey });
  reflectStatus(null);
  stop("reset");
}

export function start(): void {
  if (S) return;
  if (!handTrackingActive || !micReady()) {
    const { status } = ui();
    if (status) status.textContent = "Engega la càmera i el micròfon abans de calibrar.";
    return;
  }
  S = { step: "idle", lastFrameT: null, frameStable: 0, quiet: [], quietStartT: null, promptIdx: 0, attempt: 0, throwPeaks: [], shoutPeaks: [], prompts: [], jitterP95: null, ambientFloor: null, entornBefore: null, entornDecided: null, awaitingThrow: null, fitted: null, pooledInfo: null };
  calibrating = true;
  document.body.dataset.calibrating = "on";
  setFramingGuide(true);
  unobserve = addThrowObserver({ onThrowStart, onThrowFinalized });
  logEvent("calibration_start", { profileId: getActiveProfileId(), deviceKey: cameraDeviceKey, before: currentValues() });
  setStep("frame");
  rafId = requestAnimationFrame(tick);
}

export function stop(outcome: CalibrationEndOutcome = "closed"): void {
  if (!S) return; // no session, no end: a "Restableix" outside a session never fires the hook
  if (rafId != null) cancelAnimationFrame(rafId);
  rafId = null;
  unobserve?.();
  unobserve = null;
  setFramingGuide(false);
  calibrating = false;
  delete document.body.dataset.calibrating;
  delete document.body.dataset.calib;
  logEvent("calibration_stop", { step: S.step, throws: S.prompts.length, outcome });
  S = null;
  onEnd?.(outcome);
}

export function installCalibration(): void {
  const u = ui();
  installMa();
  // btnCalibrate navigates to the Calibratge page (screens.ts) — the page
  // starts the session; this module only runs it.
  u.close?.addEventListener("click", () => stop()); // ✕ mid-flow: abort, keep whatever was in force
  u.discard?.addEventListener("click", resetToDefaults); // Descarta: throw this fit AND the stored one away → app defaults
  u.save?.addEventListener("click", save);
  u.reset?.addEventListener("click", resetToDefaults);
  setFramingHandler((s: FramingState) => logEvent("framing", { hint: s.hint, inZone: s.inZone, size: s.size, offCenter: s.offCenter }));
  // camera reports its device → apply that device's stored fit (or defaults)
  setDeviceKeyHandler(() => applyCalibrationForActiveProfile());
  reflectStatus(recordFor(loadBlob(getActiveProfileId()), cameraDeviceKey));
}

/** Test/debug seam: run the fits over injected samples without a camera. */
export const __calibration = {
  get active() {
    return calibrating;
  },
  currentValues,
  applyValues: (v: CalibrationValues) => applyValues(v, "seam"),
  applyForActiveProfile: applyCalibrationForActiveProfile,
  save: (rec: CalibrationRecord) => {
    // same shape as the real save: this session appended to the pooled history
    const pid = getActiveProfileId();
    const prev = recordFor(loadBlob(pid), cameraDeviceKey);
    const full: CalibrationRecord = { ...rec, history: rec.history ?? appendSession(prev, rec.samples) };
    saveBlob(pid, withRecord(loadBlob(pid), cameraDeviceKey, full));
    applyValues(full.values, "seam-save");
    reflectStatus(full);
  },
  get deviceKey() {
    return cameraDeviceKey;
  },
  /** Test seam: forget this session's declined detours. */
  clearDeclines: () => declinedSites.clear(),
  MIN_THROWS,
};
