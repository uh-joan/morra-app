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
  setSessionModeState,
  type SessionMode,
} from "./game.js";
import { renderRivalCommitted } from "./render/rival.js";
import { preloadRivalVoiceClips } from "./rivalVoice.js";
import { renderReadyPill } from "./readyPill.js";
import { renderTrainingPanelIfActive } from "./training.js";

export function setSessionMode(mode: SessionMode): void {
  if (getSessionMode() === mode) return;
  setSessionModeState(mode);
  logEvent("mode_change", { sessionMode: mode });

  el.btnModePartida.classList.toggle("primary", mode === "partida");
  el.btnModeEntrenament.classList.toggle("primary", mode === "entrenament");
  el.gamePanel.style.display = mode === "partida" ? "flex" : "none";
  el.rivalSide.style.display = mode === "partida" ? "flex" : "none";
  el.trainingPanel.style.display = mode === "entrenament" ? "block" : "none";

  if (mode === "partida" && !isGameOver()) {
    // Already committed while we were away — show it, don't burn a new one.
    const move = getCurrentAiMove();
    if (move) {
      renderRivalCommitted(move);
    } else {
      commitAiMove();
      const fresh = getCurrentAiMove();
      if (fresh) renderRivalCommitted(fresh);
    }
    void preloadRivalVoiceClips();
  }
  if (mode === "entrenament") renderTrainingPanelIfActive();
  renderReadyPill();
}

export function installModes(): void {
  el.btnModePartida.addEventListener("click", () => setSessionMode("partida"));
  el.btnModeEntrenament.addEventListener("click", () => setSessionMode("entrenament"));
  el.btnGoToTraining.addEventListener("click", () => setSessionMode("entrenament"));
}
