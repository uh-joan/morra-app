// calibration/store.ts — per-profile, per-device calibration persistence.
// Pure key/selection logic (node-tested) + the thin localStorage IO.
//
// Keyed by profile AND camera device: velocity is in frame-normalized units,
// so the same throw reads differently through a phone camera and a laptop
// camera, and hand-size-in-frame (which the count depends on) differs too.
// A profile on a device it has never calibrated on gets the app defaults —
// and a nudge to calibrate. Deliberate divergence from "the 5 spike
// tunables stay unpersisted": what's persisted here is a per-player fit,
// applied INTO the live sliders (which stay the source of truth), reversible
// in Ajustos, and only ever the sensor knobs — never a rule.

import type { CalibrationValues } from "./fit.js";

export const CALIBRATION_STORAGE_PREFIX = "morra-calibration-v1:";

export interface SessionSamples {
  jitterP95: number | null;
  throwPeaks: number[];
  ambientFloor: number | null;
  shoutPeaks: number[];
  /** prompted truth vs what the count read, per ACCEPTED attempt (a
   * misread is repeated up to MAX_ATTEMPTS, then flagged hard) —
   * accuracy feedback + a mini corpus + the "hard numbers" signal */
  prompts: { truth: number; count: number | null; attempt?: number; hard?: boolean }[];
  measuredAt?: string;
}

/** Fits use the LAST N sessions pooled: the weakest-throw estimate is far
 * more stable over 25 throws than 5 (jani's thumb-1 peaked 0.54 / 0.58 /
 * 0.73 across three sessions → HIGH_V bounced 0.38–0.51 session to
 * session), and a slightly slower throw tomorrow still clears it. */
export const POOL_SESSIONS = 5;

export interface CalibrationRecord {
  values: CalibrationValues;
  /** fit.ts FIT_VERSION the values were computed with; older records are
   * re-fit from their samples on apply (missing = version 1) */
  fitVersion?: number;
  measuredAt: string; // ISO
  /** this session's samples */
  samples: SessionSamples;
  /** the last POOL_SESSIONS sessions (this one included, last) — what the
   * values were actually fitted on. Missing on old records = [samples]. */
  history?: SessionSamples[];
}

/** The union the fits run on: all throw/shout peaks of the pooled sessions,
 * the LARGEST resting jitter seen (the floor must hold on a bad day), the
 * latest room floor. */
export function pooledSamples(rec: Pick<CalibrationRecord, "samples" | "history">): SessionSamples & { sessions: number } {
  const hist = rec.history && rec.history.length ? rec.history : [rec.samples];
  const throwPeaks = hist.flatMap((h) => h.throwPeaks);
  const shoutPeaks = hist.flatMap((h) => h.shoutPeaks);
  const jitters = hist.map((h) => h.jitterP95).filter((j): j is number => j != null && Number.isFinite(j));
  const last = hist[hist.length - 1]!;
  return {
    jitterP95: jitters.length ? Math.max(...jitters) : null,
    throwPeaks,
    shoutPeaks,
    ambientFloor: last.ambientFloor,
    prompts: hist.flatMap((h) => h.prompts),
    sessions: hist.length,
  };
}

export function appendSession(prev: CalibrationRecord | null, session: SessionSamples): SessionSamples[] {
  const hist = prev ? (prev.history && prev.history.length ? prev.history : [prev.samples]) : [];
  return [...hist, session].slice(-POOL_SESSIONS);
}

export interface CalibrationBlob {
  version: 1;
  byDevice: Record<string, CalibrationRecord>;
}

export function calibrationKeyFor(profileId: string): string {
  return CALIBRATION_STORAGE_PREFIX + profileId;
}

/** Device key from the camera track: a short, stable-per-device fingerprint.
 * getSettings().deviceId is stable per origin; fall back to the resolution
 * (still separates phone from laptop most of the time). */
export function deviceKeyFrom(settings: { deviceId?: string; width?: number; height?: number } | null): string {
  if (!settings) return "unknown";
  const id = settings.deviceId ? settings.deviceId.slice(0, 12) : "nodev";
  return `${id}@${settings.width ?? 0}x${settings.height ?? 0}`;
}

export function emptyBlob(): CalibrationBlob {
  return { version: 1, byDevice: {} };
}

export function normalizeBlob(raw: unknown): CalibrationBlob {
  if (!raw || typeof raw !== "object") return emptyBlob();
  const r = raw as Partial<CalibrationBlob>;
  if (r.version !== 1 || !r.byDevice || typeof r.byDevice !== "object") return emptyBlob();
  const out = emptyBlob();
  for (const [k, rec] of Object.entries(r.byDevice)) {
    const v = (rec as CalibrationRecord | undefined)?.values;
    if (!v || ![v.highV, v.lowV, v.vadMult].every((x) => typeof x === "number" && Number.isFinite(x))) continue;
    out.byDevice[k] = rec as CalibrationRecord;
  }
  return out;
}

export function recordFor(blob: CalibrationBlob, deviceKey: string): CalibrationRecord | null {
  return blob.byDevice[deviceKey] ?? null;
}

export function withRecord(blob: CalibrationBlob, deviceKey: string, rec: CalibrationRecord): CalibrationBlob {
  return { version: 1, byDevice: { ...blob.byDevice, [deviceKey]: rec } };
}

export function withoutRecord(blob: CalibrationBlob, deviceKey: string): CalibrationBlob {
  const byDevice = { ...blob.byDevice };
  delete byDevice[deviceKey];
  return { version: 1, byDevice };
}

// ------------------------------------------------------------------ IO

export function loadBlob(profileId: string): CalibrationBlob {
  try {
    const text = localStorage.getItem(calibrationKeyFor(profileId));
    return normalizeBlob(text ? JSON.parse(text) : null);
  } catch {
    return emptyBlob();
  }
}

export function saveBlob(profileId: string, blob: CalibrationBlob): boolean {
  try {
    localStorage.setItem(calibrationKeyFor(profileId), JSON.stringify(blob));
    return true;
  } catch {
    return false;
  }
}

export function clearBlob(profileId: string): void {
  try {
    localStorage.removeItem(calibrationKeyFor(profileId));
  } catch {
    /* ignore */
  }
}
