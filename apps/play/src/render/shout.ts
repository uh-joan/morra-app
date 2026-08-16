// render/shout.ts — ports spikes/s03-beat.html L1550–1584 (the shout
// mirror): idle before mic start, a calm "escoltant…" state while running,
// a ~400ms bright flash on every live-VAD onset, permanent red ERROR text
// (never just a console line) if the mic or worklet fails. Same
// "unmissable, never silent" contract as the hand mirror. ux-pirates:
// player-facing strings are Catalan; the onset diagnostic line (mode
// tècnic) keeps its technical English.

import { el } from "../dom.js";

let shoutFlashTimer: ReturnType<typeof setTimeout> | null = null;
let shoutHasError = false;

export function renderShoutIdle(): void {
  shoutHasError = false;
  el.shoutBadge.textContent = "mic apagat";
  el.shoutBadge.className = "shout-badge idle";
}

export function renderShoutRequesting(): void {
  el.shoutBadge.textContent = "demanant…";
  el.shoutBadge.className = "shout-badge idle";
}

export function renderShoutListening(): void {
  if (shoutHasError) return;
  el.shoutBadge.textContent = "escoltant…";
  el.shoutBadge.className = "shout-badge listening";
}

export function triggerShoutFlash(onsetPerfMs: number, onsetCtxTime: number): void {
  if (shoutHasError) return;
  el.shoutBadge.textContent = "CRIT!";
  el.shoutBadge.className = "shout-badge flash";
  if (shoutFlashTimer) clearTimeout(shoutFlashTimer);
  shoutFlashTimer = setTimeout(renderShoutListening, 400);
  const elapsedS = Math.max(0, performance.now() - onsetPerfMs) / 1000;
  el.onsetInfo.textContent = `onset detected — ring-buffer t=${onsetCtxTime.toFixed(3)}s (${elapsedS.toFixed(2)}s ago)`;
}

export function renderShoutError(message: string): void {
  shoutHasError = true;
  if (shoutFlashTimer) {
    clearTimeout(shoutFlashTimer);
    shoutFlashTimer = null;
  }
  el.shoutBadge.textContent = "ERROR";
  el.shoutBadge.className = "shout-badge err";
  el.onsetInfo.textContent = message;
}
