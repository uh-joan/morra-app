// render/bigNumber.ts — ports spikes/s03-beat.html L1534–1548: the big
// live finger-count readout. Pure data→DOM; camera.ts calls these per
// frame. ux-pirates: Catalan labels.

import { el } from "../dom.js";

export function renderBigNumber(count: number): void {
  el.bigNumber.textContent = String(count);
  el.bigNumber.className = "big-number live";
  el.bigNumberLabel.textContent = count === 1 ? "dit" : "dits";
}

export function renderBigNumberNoHand(): void {
  el.bigNumber.textContent = "–";
  el.bigNumber.className = "big-number";
  el.bigNumberLabel.textContent = "cap mà";
}

export function renderBigNumberError(message: string): void {
  el.bigNumber.textContent = "ERROR";
  el.bigNumber.className = "big-number err";
  el.bigNumberLabel.textContent = message;
}
