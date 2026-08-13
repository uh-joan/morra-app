// profiles.ts — UI glue for the profile picker (select + create/delete),
// same layer as training.ts. A profile switch means "a different player
// sits down": reload the player model from the new profile's key, reset
// the match (in-match history and the score belong to the leaving player),
// and re-mint the rival's commitment so a sealed move never carries
// another profile's L4 history into the new player's first round.

import { el } from "./dom.js";
import { logEvent } from "./telemetry.js";
import { PROFILE_TEXT } from "./game/copy.js";
import {
  activateProfile,
  createAndActivateProfile,
  deleteProfileById,
  getActiveProfileId,
  getActiveProfileName,
  getProfiles,
  loadPlayerModel,
} from "./profile.js";
import { DEFAULT_PROFILE_ID } from "./profileRegistry.js";
import { commitAiMove, playVsOpponent, resetGame, setPlayerModelState } from "./game.js";
import { renderTrainingPanelIfActive } from "./training.js";

export function renderProfileControls(): void {
  const activeId = getActiveProfileId();
  el.selProfile.replaceChildren(
    ...getProfiles().map((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      opt.selected = p.id === activeId;
      return opt;
    })
  );
  el.btnDeleteProfile.disabled = activeId === DEFAULT_PROFILE_ID;
}

function afterProfileChange(): void {
  setPlayerModelState(loadPlayerModel());
  resetGame(); // fresh match for the new player; in Partida this also re-mints + renders the commitment
  if (!playVsOpponent()) commitAiMove(); // Entrenament: still reseal so no move informed by another profile survives
  renderTrainingPanelIfActive();
  renderProfileControls();
}

export function installProfiles(): void {
  renderProfileControls();
  el.selProfile.addEventListener("change", () => {
    if (!activateProfile(el.selProfile.value)) return;
    logEvent("profile_change", { action: "switch", profileId: getActiveProfileId() });
    afterProfileChange();
  });
  el.btnNewProfile.addEventListener("click", () => {
    const name = prompt(PROFILE_TEXT.newPrompt);
    if (name == null) return;
    const id = createAndActivateProfile(name);
    if (!id) return; // blank name
    logEvent("profile_change", { action: "create", profileId: id });
    afterProfileChange();
  });
  el.btnDeleteProfile.addEventListener("click", () => {
    const id = getActiveProfileId();
    if (id === DEFAULT_PROFILE_ID) return;
    if (!confirm(PROFILE_TEXT.deleteConfirm(getActiveProfileName()))) return;
    if (!deleteProfileById(id)) return;
    logEvent("profile_change", { action: "delete", profileId: id });
    afterProfileChange(); // active fell back to the default profile
  });
}
