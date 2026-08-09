// PlayerModelStore port — where the spike's localStorage-backed
// loadModel/saveModel/clearModel (spikes/modules/playermodel.mjs) moved.
// Core takes/produces PlayerModel snapshots only through this interface;
// the real browser-localStorage implementation is packages/platform-web's
// job (M4), same pattern as the plan's `PlayerModelStore` port.
import type { PlayerModel } from "../playermodel.js";

export interface PlayerModelStore {
  load(key?: string): PlayerModel;
  save(model: PlayerModel, key?: string): boolean;
  clear(key?: string): boolean;
}
