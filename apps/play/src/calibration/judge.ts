// calibration/judge.ts — does this settled throw COUNT as the prompted one?
// Pure, node-tested. First field run of Calibratge (2026-08-17): the "Tira"
// step advanced on any onset — the return to fist after a real throw is an
// onset too (classified reset), and a silent throw advanced because the
// shout was only measured, never required. Both wrong: a prompt is
// satisfied by a real throw WITH a shout, and nothing else.

import { LIVE_VAD_FLOOR_MIN } from "./fit.js";

export type ThrowVerdict =
  | { accept: true; voice: "onset" | "loud" }
  | { accept: false; reason: "reset" | "no-fingers" | "no-voice" };

/** A shout must clear the room floor by this much when the offline onset
 * detector didn't fire (e.g. sorollós demoted it). The floor is the
 * EFFECTIVE one — max(measured, LIVE_VAD_FLOOR_MIN): jani's second and
 * third sessions (2026-08-17) accepted silent throws at 0.0005 RMS because
 * that was "4×" a near-silent room floor of 0.0001. So: at least 4 × 0.015
 * = 0.06 RMS, ever. */
export const SHOUT_OVER_FLOOR = 4;

export function judgeCalibrationThrow(input: {
  outcome: string;
  fingerCount: number | null;
  voiceOnsetPerfTime: number | null;
  shoutPeak: number | null;
  ambientFloor: number | null;
}): ThrowVerdict {
  if (input.outcome === "reset") return { accept: false, reason: "reset" };
  if (input.fingerCount == null || input.fingerCount < 1) return { accept: false, reason: "no-fingers" };
  if (input.voiceOnsetPerfTime != null) return { accept: true, voice: "onset" };
  if (input.shoutPeak != null && input.ambientFloor != null && input.ambientFloor >= 0) {
    const floor = Math.max(input.ambientFloor, LIVE_VAD_FLOOR_MIN);
    if (input.shoutPeak > SHOUT_OVER_FLOOR * floor) return { accept: true, voice: "loud" };
  }
  return { accept: false, reason: "no-voice" };
}

export const VERDICT_COPY = {
  reset: "Això era tornar al puny — tira des del puny, no compta.",
  "no-fingers": "No he vist dits — tira més clar, cap a la càmera.",
  "no-voice": "No t'he sentit cridar — torna-hi: tira i crida alhora, fort.",
  accepted: (truth: number, count: number | null) =>
    count === truth ? `✓ Un ${truth}, llegit bé. Crit sentit.` : `✓ Comptat. He llegit un ${count ?? "?"} (demanava ${truth}) — s'apunta.`,
} as const;

/** Repeat a prompt whose count did not match — up to MAX_ATTEMPTS, then
 * accept-and-flag. Why repeat: the weakest prompted throw is THE input to
 * the velocity fit, and a "1" read as 3 is either a misread 1 or a thrown 3
 * — the peak can't be assigned blind. Why cap: if this hand's 2 genuinely
 * reads as 4 under the current count rule, calibration can't fix the
 * counter (finger thresholds aren't fitted yet) and the player would be
 * stuck; three misreads in a row is itself the signal (a "hard number" in
 * the record — the input for the finger-threshold follow-up). */
export const MAX_ATTEMPTS = 3;
export function shouldRepeatPrompt(truth: number, count: number | null, attempt: number): boolean {
  return count !== truth && attempt < MAX_ATTEMPTS;
}
export const REPEAT_COPY = (truth: number, count: number | null, attempt: number): string =>
  `He llegit un ${count ?? "?"} — torna-hi (${attempt}/${MAX_ATTEMPTS}): des del puny, tira un ${truth} ben clar cap a la càmera, i crida.`;
export const HARD_COPY = (truth: number, count: number | null): string =>
  `⚠ El ${truth} se'm resisteix (l'he llegit ${count ?? "?"} tres cops). S'apunta com a número difícil i seguim.`;
