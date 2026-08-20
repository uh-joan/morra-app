// modes.ts — ports spikes/s03-beat.html L3463–3489 (setSessionMode), minus
// the beat axis: apps/play is permanently sync-mode, so sessionMode is just
// Partida (game vs rival) ↔ Entrenament (L'Espill mirror in the rival's
// place). Both run the same sync throw pipeline underneath; only
// playVsOpponent (and the panels) differ.

import { el } from "./dom.js";
import { logEvent } from "./telemetry.js";
import {
  commitAiMove,
  getCurrentAiMove,
  getSessionMode,
  isGameOver,
  playVsOpponent,
  resetGame,
  setSessionModeState,
  type SessionMode,
} from "./game.js";
import { renderRivalCommitted } from "./render/rival.js";
import { preloadRivalVoiceClips } from "./rivalVoice.js";
import { renderReadyPill } from "./readyPill.js";
import { missionArm, renderTrainingPanelIfActive, shadowArm } from "./training.js";
import { reflectRoute, type Screen as RouteScreen } from "./router.js";
import { isSoloTraining, slugForLevel, SOLO_SLUG } from "./rivalState.js";

export function setSessionMode(mode: SessionMode): void {
  if (getSessionMode() === mode) return;
  setSessionModeState(mode);
  logEvent("mode_change", { sessionMode: mode, solo: isSoloTraining() });
  applyModeLayout();
}

/** Layout + loop for the current mode and partner. Called on a mode change
 * and when the partner changes (a rival ↔ solo) inside Entrenament. */
export function applyModeLayout(): void {
  const mode = getSessionMode();
  const vs = playVsOpponent(); // duel, or sparring
  el.btnModePartida.classList.toggle("primary", mode === "partida");
  el.btnModeEntrenament.classList.toggle("primary", mode === "entrenament");
  el.gamePanel.style.display = vs ? "flex" : "none";
  el.rivalSide.style.display = vs ? "" : "none"; // "": the stylesheet decides (flex, or the stacked grid on phones)
  el.trainingPanel.style.display = mode === "entrenament" ? "block" : "none";
  document.body.dataset.sparring = mode === "entrenament" && vs ? "on" : "off";

  if (vs) {
    // Sparring never ends a match; a finished duel is reset before sparring.
    if (mode === "entrenament" && isGameOver()) resetGame();
    if (!isGameOver()) {
      // Already committed while we were away — show it, don't burn a new one.
      const move = getCurrentAiMove();
      if (move) {
        renderRivalCommitted(move);
      } else {
        commitAiMove();
        const fresh = getCurrentAiMove();
        if (fresh) renderRivalCommitted(fresh);
      }
    }
    void preloadRivalVoiceClips();
  }
  if (mode === "entrenament") { shadowArm(); renderTrainingPanelIfActive(); missionArm(); }
  renderReadyPill();
  // the mode is part of the route (#/duel vs #/entrena) — a mode flip replaces, never pushes
  const screen = (document.body.dataset.screen ?? "title") as RouteScreen;
  const rival = mode === "entrenament" && isSoloTraining() ? SOLO_SLUG : slugForLevel(el.selAiLevel.value || "L1");
  if (screen === "fight") reflectRoute(screen, mode, {}, "replace", rival);
}

export function installModes(): void {
  el.btnModePartida.addEventListener("click", () => setSessionMode("partida"));
  el.btnModeEntrenament.addEventListener("click", () => setSessionMode("entrenament"));
  // btnGoToTraining opens the L'Espill screen (screens.ts) — no mode change.
}
