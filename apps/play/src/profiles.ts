// profiles.ts — the tripulant chip: one player per vessel. The browser IS
// the account — named once at first run (firstrun.ts renames the default
// profile; its legacy storage key keeps the accumulated history). The chip
// shows who at the port and hides during play; its menu holds the rare
// actions (rename here; export/reset wired in training.ts, same ids as
// before). The multi-profile registry stays underneath as a seam
// (profileRegistry.ts, pure + tested) — this module just no longer
// surfaces switching/creating/deleting.

import { el } from "./dom.js";
import { logEvent } from "./telemetry.js";
import { getActiveProfileId, getActiveProfileName, profileNameHash, renameProfileById } from "./profile.js";
import { openRenameCard } from "./firstrun.js";

/** The name, everywhere it stands in for "TU": the chip, the fight
 * nameplate, the score strip's left label. (The sr-only scoreboard keeps
 * its "Tu N — M Rival" format — the harness and telemetry parse it.) */
export function renderProfileControls(): void {
  const name = getActiveProfileName();
  el.tripulantName.textContent = name;
  const nameplate = document.getElementById("youNameplate");
  if (nameplate) nameplate.textContent = name;
  const ssLabel = document.getElementById("ssLabelYou");
  if (ssLabel) ssLabel.textContent = name;
}

export function installProfiles(): void {
  renderProfileControls();
  el.btnRenameProfile.addEventListener("click", () => {
    el.profileMenu.hidden = true;
    el.btnProfileMenu.setAttribute("aria-expanded", "false");
    openRenameCard(getActiveProfileName(), (name) => {
      if (name === getActiveProfileName()) return true; // unchanged — just close
      if (!renameProfileById(getActiveProfileId(), name)) return false;
      logEvent("profile_change", { action: "rename", profileId: getActiveProfileId(), profileHash: profileNameHash(name) });
      renderProfileControls();
      return true;
    });
  });
}
