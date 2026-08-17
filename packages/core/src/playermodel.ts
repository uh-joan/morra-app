// playermodel.ts — ported from spikes/modules/playermodel.mjs. The spike's
// localStorage-backed loadModel/saveModel/clearModel are DELIBERATELY NOT
// ported here — that's exactly the impurity the PlayerModelStore port
// exists to carry; the real (browser) implementation lands in
// packages/platform-web at M4. Core only defines the pure model shape and
// the port it's read/written through.
import type { HistoryEntry } from "./types.js";

export const MODEL_VERSION = 1;
export const HISTORY_CAP = 2000; // bounded — keeps cross-session storage + AI replay cost sane

export interface PlayerModel {
  version: number;
  throws: HistoryEntry[];
}

export function createEmptyModel(): PlayerModel {
  return { version: MODEL_VERSION, throws: [] };
}

/** Never mutates the input model. */
export function recordThrow(model: PlayerModel, entry: HistoryEntry): PlayerModel {
  const throws = [...model.throws, entry];
  if (throws.length > HISTORY_CAP) throws.splice(0, throws.length - HISTORY_CAP);
  return { version: MODEL_VERSION, throws };
}

export function snapshotModel(model: PlayerModel): { throwCount: number } {
  return { throwCount: model ? model.throws.length : 0 };
}

/** The plain array shape ai.ts's decideMove/predictPlayerF expect as `history`. */
export function toHistoryArray(model: PlayerModel): HistoryEntry[] {
  return model ? model.throws : [];
}

// ---------------------------------------------------------------- hygiene
// The rival must learn only from throws the game actually judged. From
// 2026-08-10 to 08-17 the pipeline recorded the hand RETURNING to the fist
// after a throw as an incomplete "throw of 1" (voice-early from the rival
// clip's tail) — and Phase G fed every incomplete with known fingers into
// the model. Result in the field: L4 guessed "1" on 50% of its throws and
// aimed at 12% (docs/rival-intelligence-research.md). Feed rule now: a
// Partida entry enters the model only when the round resolved or the rival
// was revealed. Existing profiles are pruned on load with the phantom
// signature below.

/** A stored entry that matches the retraction-phantom signature: fingers
 * <= 1, no rival move (never revealed), and not synced. Real training
 * throws of 1 that synced survive; a training thumb-1 that failed timing is
 * dropped too — it was a failed throw either way. Entries tagged
 * source:"entrenament" are never pruned (they never had a rival). */
export function isPhantomThrow(e: HistoryEntry): boolean {
  if (e.source === "entrenament") return false;
  const fingers = e.playerFingers;
  if (fingers == null || fingers > 1) return false;
  if (e.aiFingers != null || e.verdictWinner != null) return false;
  return e.syncOutcome !== "synced";
}

/** Never mutates the input. Returns the pruned model and how many went. */
export function prunePhantomThrows(model: PlayerModel): { model: PlayerModel; removed: number } {
  const kept = model.throws.filter((e) => !isPhantomThrow(e));
  const removed = model.throws.length - kept.length;
  return { model: removed ? { version: MODEL_VERSION, throws: kept } : model, removed };
}
