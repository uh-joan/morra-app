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
