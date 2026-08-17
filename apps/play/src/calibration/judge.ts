// calibration/judge.ts — does this settled throw COUNT as the prompted one?
// Pure, node-tested. First field run of Calibratge (2026-08-17): the "Tira"
// step advanced on any onset — the return to fist after a real throw is an
// onset too (classified reset), and a silent throw advanced because the
// shout was only measured, never required. Both wrong: a prompt is
// satisfied by a real throw WITH a shout, and nothing else.

export type ThrowVerdict =
  | { accept: true; voice: "onset" | "loud" }
  | { accept: false; reason: "reset" | "no-fingers" | "no-voice" };

/** A shout must clear the room floor by this much when the offline onset
 * detector didn't fire (e.g. sorollós demoted it) — 4× is well above the
 * live-VAD's own default multiplier territory. */
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
  if (input.shoutPeak != null && input.ambientFloor != null && input.ambientFloor > 0 && input.shoutPeak > SHOUT_OVER_FLOOR * input.ambientFloor) {
    return { accept: true, voice: "loud" };
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
