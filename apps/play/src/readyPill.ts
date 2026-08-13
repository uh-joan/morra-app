// readyPill.ts — ports spikes/s03-beat.html L2819–2861 (the step-13 ready
// indicator) + updateReadyPillFromFrame (L2023–2030). Surfaces whether the
// detector will actually accept a fresh onset right now, derived from real
// per-frame hand data (handHasResetSince), never a timer. Sync mode only
// exists in apps/play, so the pill is always active (the spike hid it only
// in beat mode).

import { el } from "./dom.js";
import { logEvent } from "./telemetry.js";
import { handHasResetSince } from "./game/handHasReset.js";
import { READY_PILL_TEXT } from "./game/copy.js";

let lastThrownFingerCount: number | null = null; // the fingerCount used in the most recently RESOLVED throw
let handArmedForNextThrow = true; // armed from the very start of a game, per spec
let throwInProgress = false; // between onSyncHandOnset firing and the round resolving
let lastLoggedReadyPillState: string | null = null; // only log on an actual transition, not every render

export type ReadyPillState = "analyzing" | "armed" | "not-armed";

// step 13 fix 3 (M5 hook): dim the rival's fresh commitment while the player
// still needs to reset — game.ts plugs this in; a no-op until then.
let onPillRender: (state: ReadyPillState) => void = () => {};
export function setPillRenderHook(hook: (state: ReadyPillState) => void): void {
  onPillRender = hook;
}

export function isThrowInProgress(): boolean {
  return throwInProgress;
}
export function setThrowInProgress(value: boolean): void {
  throwInProgress = value;
}
export function armForNextThrow(): void {
  handArmedForNextThrow = true;
}
export function currentLastThrownFingerCount(): number | null {
  return lastThrownFingerCount;
}

export function renderReadyPill(): void {
  el.readyPill.style.display = "block";
  const pillState: ReadyPillState = throwInProgress ? "analyzing" : handArmedForNextThrow ? "armed" : "not-armed";
  if (pillState !== lastLoggedReadyPillState) {
    logEvent("ready_pill", { state: pillState });
    lastLoggedReadyPillState = pillState;
  }
  if (pillState === "analyzing") {
    el.readyPill.className = "ready-pill analyzing";
    el.readyPill.textContent = READY_PILL_TEXT.analyzing;
  } else if (pillState === "armed") {
    el.readyPill.className = "ready-pill armed";
    el.readyPill.textContent = READY_PILL_TEXT.armed;
  } else {
    el.readyPill.className = "ready-pill not-armed";
    el.readyPill.textContent = READY_PILL_TEXT.notArmed;
  }
  onPillRender(pillState);
}

/** step 13: called on every camera frame (hand-detected or not) to check for
 * reset evidence — only does work while genuinely waiting (armed already ==
 * nothing to do, and re-rendering every frame would be wasteful). */
export function updateReadyPillFromFrame(count: number | null): void {
  if (handArmedForNextThrow) return;
  if (handHasResetSince(lastThrownFingerCount, count)) {
    handArmedForNextThrow = true;
    renderReadyPill();
  }
}

export function markThrowResolvedForReadyPill(playerFingers: number | null): void {
  throwInProgress = false;
  if (playerFingers != null) {
    lastThrownFingerCount = playerFingers;
    handArmedForNextThrow = false;
  }
  renderReadyPill();
}

/** resetGame's slice of pill state (spike L3078–3080): a fresh game reads
 * ready immediately, per spec. */
export function resetReadyPillForNewGame(): void {
  lastThrownFingerCount = null;
  handArmedForNextThrow = true;
  throwInProgress = false;
}
