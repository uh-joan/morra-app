// App.tsx — the entire React tree. Per the M4 boundary law: this file and
// everything under react/ only READS gameStore.ts via useGameStore's
// narrow selectors and calls the store's public methods from event
// handlers — it never holds game/session state of its own (settingsOpen
// below is genuinely view-local UI chrome, not game/session state, so it's
// fine as plain useState). AudioContext/recognizers/camera are already
// running as module-level singletons (appSingletons.ts) before this
// component ever mounts; the effect below only supplies them the <video>
// element they need once it exists in the DOM.
import { useEffect, useRef, useState } from "react";
import { startSensors, store } from "../appSingletons.js";
import { useGameStore } from "./useStore.js";
import { PartidaView } from "./PartidaView.js";
import { EntrenamentView } from "./EntrenamentView.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { ProfilePicker } from "./ProfilePicker.js";
import { MODE_BUTTONS } from "../game/copy.js";

export function App() {
  const mode = useGameStore(store, (s) => s.mode);
  const resetPalette = useGameStore(store, (s) => s.settings.resetPalette);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [sensorsError, setSensorsError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    startSensors(video).catch((err: unknown) => {
      setSensorsError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  return (
    <div className="app">
      <nav className="mode-nav">
        <button type="button" id="btnModePartida" aria-pressed={mode === "partida"} onClick={() => store.setMode("partida")}>
          {MODE_BUTTONS.partida}
        </button>
        <button type="button" id="btnModeEntrenament" aria-pressed={mode === "entrenament"} onClick={() => store.setMode("entrenament")}>
          {MODE_BUTTONS.entrenament}
        </button>
        <button type="button" onClick={() => setSettingsOpen((v) => !v)} aria-pressed={settingsOpen}>
          Settings
        </button>
        <ProfilePicker />
      </nav>

      <div className="camera-preview-wrap">
        <video ref={videoRef} muted playsInline className="camera-preview" />
        {/* Feature 2 — the below-zone reset gesture's line, drawn subtly on
            the preview so the player can see where "the table" is without
            it dominating the frame. Mirrors below the SAME belowZoneHeightPct
            the reset-palette classifier itself uses (sensorPipeline.ts),
            so this line is never just decorative. */}
        {resetPalette.belowZoneEnabled && (
          <div className="below-zone-line" style={{ bottom: `${resetPalette.belowZoneHeightPct}%` }} aria-hidden="true" />
        )}
      </div>

      {/* Error messages render as plain text-node children — never HTML
          (security audit M5); React's default child-text escaping already
          guarantees this as long as no dangerouslySetInnerHTML is used,
          which the eslint react/no-danger rule bans repo-wide. */}
      {sensorsError && (
        <p className="sensor-error" role="alert">
          {sensorsError}
        </p>
      )}

      {settingsOpen && <SettingsPanel />}

      {mode === "partida" ? <PartidaView /> : <EntrenamentView />}
    </div>
  );
}
