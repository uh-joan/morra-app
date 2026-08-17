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

export interface CalibrationRecord {
  values: CalibrationValues;
  /** fit.ts FIT_VERSION the values were computed with; older records are
   * re-fit from their samples on apply (missing = version 1) */
  fitVersion?: number;
  measuredAt: string; // ISO
  samples: {
    jitterP95: number | null;
    throwPeaks: number[];
    ambientFloor: number | null;
    shoutPeaks: number[];
    /** prompted truth vs what the count read — accuracy feedback + a mini corpus */
    prompts: { truth: number; count: number | null }[];
  };
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
