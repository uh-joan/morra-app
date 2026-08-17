// calibration/fit.ts — the PURE fits behind "Calibratge": from what the
// player's own throws measured, derive the sensor thresholds that read this
// player on this camera. DOM-free, node-tested. The flow (calibration.ts)
// collects the samples; the store (store.ts) persists per profile+device.
//
// What is fitted, and what is deliberately NOT:
//   - HIGH_V / LOW_V (velocity onset FSM) and vadMult (live-VAD sensitivity)
//     — sensor reads of THIS player. Fitted.
//   - settleMs — kept at the spike's 50; no evidence it's per-person.
//   - co-occurrence ±ms — a RULE (hand and voice must be simultaneous),
//     never fitted; L'Espill shows the natural lead as coaching instead.
//   - the finger-count thresholds — per-hand too, but they need both a 4 and
//     a thumb-out number in the session and a corpus-style fit; follow-up.

export interface VelocitySamples {
  /** p95 of tip-centroid velocity while the fist rested still (the floor) */
  jitterP95: number;
  /** peak velocity of each prompted throw between motion start and settle */
  throwPeaks: readonly number[];
}

export interface VoiceSamples {
  /** ambient floor: low quantile of live RMS during the quiet phase */
  ambientFloor: number;
  /** peak live RMS of each prompted shout */
  shoutPeaks: readonly number[];
}

export interface CalibrationValues {
  highV: number;
  lowV: number;
  vadMult: number;
}

/** The app's defaults, i.e. what a fresh profile on a new device gets. */
export const APP_DEFAULTS: CalibrationValues = { highV: 0.5, lowV: 0.25, vadMult: 6 };

// Clamp bounds — the fitter may move a threshold toward "reads you", never
// out of the range the pipeline was validated in.
export const HIGH_V_RANGE: readonly [number, number] = [0.3, 1.5];
export const LOW_V_RANGE: readonly [number, number] = [0.08, 0.6];
export const VAD_MULT_RANGE: readonly [number, number] = [2.5, 12];
export const MIN_THROWS = 4;
export const MIN_SHOUTS = 3;

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));
export const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)]! : NaN;
};
export const quantile = (xs: readonly number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]! : NaN;
};

/**
 * HIGH_V: high enough that resting jitter never crosses it (2× the jitter
 * p95), low enough that a normal throw of THIS player always does (~45% of
 * the median throw peak — a slow thumb-1 moves ~1/5 of the centroid a 3
 * does, so the median must leave headroom below it). The max() picks
 * whichever protects more; the clamp keeps it in the validated range.
 * LOW_V: the settle threshold — just above jitter, and well under HIGH_V so
 * the FSM can actually settle. Returns null with too few throws.
 */
export function fitVelocity(s: VelocitySamples): Pick<CalibrationValues, "highV" | "lowV"> | null {
  const peaks = s.throwPeaks.filter((p) => Number.isFinite(p) && p > 0);
  if (peaks.length < MIN_THROWS || !Number.isFinite(s.jitterP95)) return null;
  const med = median(peaks);
  let highV = clamp(Math.max(2 * s.jitterP95, 0.45 * med), HIGH_V_RANGE);
  // LOW_V must sit above the resting jitter or a throw can never SETTLE (the
  // FSM waits for v < LOW_V for settleMs) — that outranks the ratio to
  // HIGH_V, so on a very jittery hand HIGH_V rises to keep LOW_V ≤ 0.6·HIGH_V.
  let lowV = clamp(Math.max(1.5 * s.jitterP95, 0.3 * highV), LOW_V_RANGE);
  highV = clamp(Math.max(highV, lowV / 0.6), HIGH_V_RANGE);
  lowV = Math.min(lowV, 0.6 * highV); // only binds when HIGH_V hit its ceiling
  return { highV, lowV };
}

/**
 * vadMult: the live-VAD threshold is noiseFloor × vadMult. With the shout /
 * floor ratio r, sqrt(r) puts the threshold at the geometric middle of the
 * two — a 36× shout gives the spike's 6, a quiet 10× shout gives ~3.2, a
 * 100× shout ~10. Uses the median shout so one weak call doesn't drag it.
 */
export function fitVoice(s: VoiceSamples): Pick<CalibrationValues, "vadMult"> | null {
  const shouts = s.shoutPeaks.filter((p) => Number.isFinite(p) && p > 0);
  if (shouts.length < MIN_SHOUTS || !(s.ambientFloor > 0)) return null;
  const ratio = median(shouts) / s.ambientFloor;
  if (!Number.isFinite(ratio) || ratio <= 1) return null;
  return { vadMult: clamp(Math.sqrt(ratio), VAD_MULT_RANGE) };
}

/** Both fits merged over the current values — a fit that can't be made
 * (too few samples) leaves that value untouched. */
export function fitAll(current: CalibrationValues, v: VelocitySamples | null, a: VoiceSamples | null): { values: CalibrationValues; fitted: { velocity: boolean; voice: boolean } } {
  const values = { ...current };
  const fv = v ? fitVelocity(v) : null;
  const fa = a ? fitVoice(a) : null;
  if (fv) Object.assign(values, fv);
  if (fa) Object.assign(values, fa);
  return { values, fitted: { velocity: !!fv, voice: !!fa } };
}

export const round2 = (x: number): number => Math.round(x * 100) / 100;
