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

/** The live VAD's hard floor (vadWorkletSource / DEFAULT_ONLINE_ONSET_CONFIG):
 * threshold = max(noiseFloor × vadMult, floorMin). In a quiet room the
 * measured ambient floor sits far below this and the multiplier is judged
 * against the floor that will actually be in force. */
export const LIVE_VAD_FLOOR_MIN = 0.015;

/** Bump when a fit rule changes: stored records carry the version and are
 * re-fit from their saved samples on next apply, so a player never has to
 * redo the session because the math got better. */
export const FIT_VERSION = 2;

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
 * HIGH_V must sit UNDER the weakest prompted throw with margin — the prompts
 * include the 1 and 2 on purpose, and on the first real session (jani,
 * 2026-08-17) the thumb-1 peaked at 0.58 while the 5 peaked at 4.5; a
 * median-based rule put HIGH_V at 0.81 and would have made the thumb-1
 * unregisterable, i.e. worse than the default. So: 70% of the MINIMUM peak
 * (30% headroom for a slower repeat of the same throw), capped by 45% of
 * the median (never let one freak fast throw drag it up), and never below
 * 2× the resting jitter p95 (phantom onsets are costlier now: a phantom at
 * a fist reveals then voids). Clamped to the validated range.
 * LOW_V: the settle threshold — just above jitter, and ≤ 60% of HIGH_V so
 * the FSM can settle; settle-ability outranks the ratio, so HIGH_V rises
 * if needed. Returns null with too few throws.
 */
export function fitVelocity(s: VelocitySamples): Pick<CalibrationValues, "highV" | "lowV"> | null {
  const peaks = s.throwPeaks.filter((p) => Number.isFinite(p) && p > 0);
  if (peaks.length < MIN_THROWS || !Number.isFinite(s.jitterP95)) return null;
  const weakest = Math.min(...peaks);
  const med = median(peaks);
  let highV = clamp(Math.max(2 * s.jitterP95, Math.min(0.7 * weakest, 0.45 * med)), HIGH_V_RANGE);
  let lowV = clamp(Math.max(1.5 * s.jitterP95, 0.3 * highV), LOW_V_RANGE);
  highV = clamp(Math.max(highV, lowV / 0.6), HIGH_V_RANGE);
  lowV = Math.min(lowV, 0.6 * highV); // only binds when HIGH_V hit its ceiling
  return { highV, lowV };
}

/**
 * vadMult: the live-VAD threshold is max(noiseFloor × vadMult, floorMin).
 * With the shout / effective-floor ratio r, sqrt(r) puts the threshold at
 * the geometric middle of the two — a 36× shout gives the spike's 6, a quiet
 * 10× shout ~3.2, a 100× shout 10. Median shout so one weak call doesn't
 * drag it.
 */
export function fitVoice(s: VoiceSamples): Pick<CalibrationValues, "vadMult"> | null {
  const shouts = s.shoutPeaks.filter((p) => Number.isFinite(p) && p > 0);
  if (shouts.length < MIN_SHOUTS || !(s.ambientFloor >= 0)) return null;
  // judge against the floor that will be in force: a near-silent room
  // (jani's read 0.00005) is still floored at LIVE_VAD_FLOOR_MIN by the
  // worklet, so the raw ratio (~8000×) is meaningless there
  const floor = Math.max(s.ambientFloor, LIVE_VAD_FLOOR_MIN);
  const ratio = median(shouts) / floor;
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
