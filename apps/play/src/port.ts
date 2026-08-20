// port.ts — La mà que compta (homepage ambience, part 2). Every so often a
// parchment hand rises from behind the waves and throws morra at the sky:
// fingers snap to a count, a gold numeral floats up and fades, back to the
// fist, one more throw, and the hand sinks. It is the game's verb, played
// by the sea itself. Reuses the real SvgHandCharacterRenderer — the same
// hand the rival throws with.
//
// Runs only while the title screen is showing and the tab is visible;
// skipped entirely under prefers-reduced-motion.

import type { FingerCount } from "@morra/core";
import { SvgHandCharacterRenderer } from "./render/SvgHandCharacterRenderer.js";

const COUNTS: readonly FingerCount[] = [3, 1, 4, 2, 5];
const CYCLE_MS = 13000;

let idx = 0;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function onTitle(): boolean {
  return document.body.dataset.screen === "title" && !document.hidden;
}

function spawnNumeral(host: HTMLElement, hand: HTMLElement, n: number): void {
  const num = document.createElement("div");
  num.className = "port-num";
  num.textContent = String(n);
  const r = hand.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  num.style.left = `${r.left - h.left + r.width / 2}px`;
  num.style.bottom = `${h.bottom - r.top + 6}px`;
  host.appendChild(num);
  setTimeout(() => num.remove(), 2400);
}

export function installPort(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const hand = document.getElementById("portHand");
  const screen = document.getElementById("screenTitle");
  if (!hand || !screen) return;
  const renderer = new SvgHandCharacterRenderer();
  renderer.mount(hand);
  renderer.render({ fingerCount: null, settled: true, avatarGlyph: "" });

  async function cycle(): Promise<void> {
    if (onTitle()) {
      hand!.classList.add("up");
      await wait(900); // out of the water, fist closed
      for (let t = 0; t < 2 && onTitle(); t++) {
        const n = COUNTS[idx % COUNTS.length]!;
        idx++;
        renderer.render({ fingerCount: n, settled: true, avatarGlyph: "" });
        spawnNumeral(screen!, hand!, n);
        await wait(1700);
        renderer.render({ fingerCount: null, settled: true, avatarGlyph: "" });
        await wait(500);
      }
      hand!.classList.remove("up");
    }
    setTimeout(cycle, CYCLE_MS + Math.floor(Math.random() * 5000));
  }
  setTimeout(cycle, 3500); // let the port settle first
}
