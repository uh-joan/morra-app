// handHasReset.ts — ported verbatim from spikes/s03-beat.html's
// handHasResetSince (step 13): has the player shown any evidence their
// hand moved on from the count used in the LAST resolved throw? Hand gone,
// or a different count (including dropping to a fist), both count as a
// reset; a static hand held at the exact same count does not.
// null lastThrownFingerCount means there's no prior throw to reset from
// (e.g. game/session just started) — always armed. Pure; drives the ready
// pill's "Llest — tira!" vs "Torna al puny…" state (gameStore.ts).
export function handHasResetSince(lastThrownFingerCount: number | null, currentCount: number | null): boolean {
  if (lastThrownFingerCount == null) return true;
  if (currentCount == null) return true;
  return currentCount !== lastThrownFingerCount;
}
