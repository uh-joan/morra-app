// render/bigWord.ts — ports spikes/s03-beat.html L1671–1689: the 84px
// recognized-word readout. The per-throw reference guard (bigWordThrowRef)
// lives HERE, exactly like the spike's module-level ref: slow recognition
// can never clobber a newer throw's display (stale-render guard, race #8).
// The "throw ref" is an opaque object identity — analysis.ts passes its
// per-throw ThrowEvent objects in from M3 on.

import { el } from "../dom.js";

let bigWordThrowRef: object | null = null;

export function renderBigWordIdle(voskLoaded: boolean): void {
  bigWordThrowRef = null;
  el.bigWord.textContent = "–";
  el.bigWord.className = "big-word";
  el.bigWordLabel.textContent = voskLoaded ? "listening" : "voice rec off";
}

export function renderBigWordPendingFor(t: object): void {
  bigWordThrowRef = t;
  el.bigWord.textContent = "…";
  el.bigWord.className = "big-word";
  el.bigWordLabel.textContent = "recognizing…";
}

export function renderBigWordResultFor(t: object, word: string | null): void {
  if (bigWordThrowRef !== t) return; // a newer throw already started recognizing
  const heard = !!word && word !== "?";
  el.bigWord.textContent = heard ? word : "?";
  el.bigWord.className = "big-word" + (heard ? " heard" : " unk");
  el.bigWordLabel.textContent = heard ? "heard" : "no match";
}
