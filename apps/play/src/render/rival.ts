// render/rival.ts — ports spikes/s03-beat.html L2909–2952: the rival panel
// (SVG hand + digit + word + commit-status line) and the level selector
// surfaces. The hand is the salvaged SvgHandCharacterRenderer
// (createElementNS discipline — never innerHTML markup, unlike the spike's
// handSvgMarkup string; same geometry, same .finger.extended/.folded
// classes, verified equivalent by apps/web's tests).
//
// ux-pirates: the emoji avatar is replaced by the corsair figure
// (pirate/render.ts owns the art + stage). renderRivalAvatar keeps its
// signature and call sites — it now just delegates.

import { LEVELS, LEVEL_ORDER, NUMBER_TO_CATALAN_CALL, type AiMove } from "@morra/core";
import { el } from "../dom.js";
import { AI_COMMIT_STATUS } from "../game/copy.js";
import { SvgHandCharacterRenderer } from "./SvgHandCharacterRenderer.js";
import { setPirate } from "../pirate/render.js";

const handRenderer = new SvgHandCharacterRenderer();
let handMounted = false;

function renderHand(fingerCount: number | null): void {
  if (!handMounted) {
    handRenderer.mount(el.rivalHandSvg);
    handMounted = true;
  }
  handRenderer.render({ fingerCount: fingerCount as 1 | 2 | 3 | 4 | 5 | null, avatarGlyph: "", settled: true });
}

// Rival hand shows a fist + the CURRENT commitment's fingerprint — used at
// game start, after a manual reset, and at the next throw's start.
// Deliberately NOT called automatically inside commitAiMove/
// resolveGameRound's auto-recommit, so a just-revealed hand/word stays on
// screen until the player's next throw actually begins.
export function renderRivalCommitted(move: AiMove & { hashHex: string }): void {
  renderHand(null);
  el.rivalHandDigit.textContent = "?";
  el.rivalHandDigit.className = "rival-hand-digit";
  el.rivalWord.textContent = "…";
  el.rivalWord.className = "big-word";
  el.aiCommitStatus.textContent = AI_COMMIT_STATUS.committed(move.hashHex.slice(0, 8));
}

export function renderRivalReveal(move: AiMove & { hashHex: string }, verified: boolean): void {
  renderHand(move.fingers);
  el.rivalHandDigit.textContent = String(move.fingers);
  el.rivalHandDigit.className = "rival-hand-digit revealed";
  const aiWord = NUMBER_TO_CATALAN_CALL[move.call] || String(move.call);
  el.rivalWord.textContent = aiWord;
  el.rivalWord.className = "big-word heard";
  el.aiCommitStatus.textContent = verified
    ? AI_COMMIT_STATUS.verified(move.hashHex.slice(0, 8))
    : `Opponent committed: ${move.hashHex.slice(0, 8)} ${AI_COMMIT_STATUS.verifyFailed}`;
}

// Phase G: level selector — names/descriptions come straight from core's
// LEVELS, so the UI never drifts from what the policy actually implements.
export function populateAiLevelSelector(currentLevel: string): void {
  el.selAiLevel.replaceChildren(
    ...LEVEL_ORDER.map((id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = LEVELS[id]?.name ?? id;
      opt.selected = id === currentLevel;
      return opt;
    })
  );
}

export function renderAiLevelDescription(level: string): void {
  el.aiLevelDescription.textContent = LEVELS[level as keyof typeof LEVELS]?.description ?? "";
}

export function renderRivalAvatar(level: string): void {
  setPirate(level); // ux-pirates: the corsair figure replaces the emoji
}
