// training.ts — ports spikes/s03-beat.html L3233–3238 + L3304–3317: the
// mirror-scope state, the history-source slice, and the Entrenament panel's
// controls (scope toggle, export/reset profile). "Session vs all-time" just
// changes which slice of playerModel.throws feeds the SAME mirror functions.

import { createEmptyModel, toHistoryArray } from "@morra/core";
import { el } from "./dom.js";
import { logEvent, LOG_SESSION_ID } from "./telemetry.js";
import { getPlayerModel, getSessionMode, setPlayerModelState, setTrainingPanelHook } from "./game.js";
import { clearPlayerModel } from "./profile.js";
import { renderTrainingPanel, type MirrorScope } from "./render/training.js";
import { download } from "./export.js";
import { TRAINING_PANEL_TEXT } from "./game/copy.js";

// Deliberate deviation from the spike (which defaulted to "session"): the
// session id is minted per page load, so right after a reload the session
// slice is always empty and L'Espill read as "data gone". Defaulting to
// all-time always shows the accumulated picture; "Aquesta sessió" is one
// click away when practicing. (User decision, 2026-08-14.)
let mirrorScope: MirrorScope = "allTime";

export function getMirrorScope(): MirrorScope {
  return mirrorScope;
}

export function setMirrorScope(scope: MirrorScope): void {
  mirrorScope = scope;
  renderTrainingPanelIfActive();
}

function trainingHistorySource() {
  const all = toHistoryArray(getPlayerModel());
  return mirrorScope === "session" ? all.filter((h) => h.sessionId === LOG_SESSION_ID) : all;
}

export function renderTrainingPanelIfActive(): void {
  if (getSessionMode() !== "entrenament" && document.body.dataset.screen !== "espill") return;
  renderTrainingPanel(trainingHistorySource(), mirrorScope);
}
/** The L'Espill screen renders on open regardless of mode (it needs no
 * sensors — it reads the profile). Same renderer, same ids. */
export function renderEspillScreen(): void {
  renderTrainingPanel(trainingHistorySource(), mirrorScope);
}

export function installTraining(): void {
  setTrainingPanelHook(renderTrainingPanelIfActive);
  el.btnScopeSession.addEventListener("click", () => setMirrorScope("session"));
  el.btnScopeAllTime.addEventListener("click", () => setMirrorScope("allTime"));
  el.btnExportProfile.addEventListener("click", () => {
    download("morra-player-profile.json", JSON.stringify(getPlayerModel(), null, 2), "application/json");
  });
  el.btnResetProfile.addEventListener("click", () => {
    if (!confirm(TRAINING_PANEL_TEXT.resetConfirm)) return;
    clearPlayerModel();
    setPlayerModelState(createEmptyModel());
    logEvent("setting_change", { setting: "playerProfileReset", value: true });
    renderTrainingPanelIfActive();
  });
}
