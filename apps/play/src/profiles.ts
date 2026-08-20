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
import { getActiveProfileId, getActiveProfileName, renameProfileById } from "./profile.js";
import { openRenameCard } from "./firstrun.js";

export function renderProfileControls(): void {
  el.tripulantName.textContent = getActiveProfileName();
}

export function installProfiles(): void {
  renderProfileControls();
  el.btnRenameProfile.addEventListener("click", () => {
    el.profileMenu.hidden = true;
    el.btnProfileMenu.setAttribute("aria-expanded", "false");
    openRenameCard(getActiveProfileName(), (name) => {
      if (name === getActiveProfileName()) return true; // unchanged — just close
      if (!renameProfileById(getActiveProfileId(), name)) return false;
      logEvent("profile_change", { action: "rename", profileId: getActiveProfileId(), profileName: name });
      renderProfileControls();
      return true;
    });
  });
}
