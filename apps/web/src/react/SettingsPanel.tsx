// SettingsPanel.tsx — every user-adjustable setting from the spike's
// settings panel that carries over to the self-paced sync pipeline
// (co-occurrence window, VAD sensitivity, hand velocity HIGH_V/LOW_V/
// SETTLE_MS). SYNC_PRE_MS/SYNC_POST_MS and the voice vocabulary/rival-voice
// suffix are hardcoded constants in the spike too (confirmed via the
// spike-mapping exploration) — no UI for those, matching the spike.
// Camera/mic device pickers don't exist in the spike either (confirmed:
// no enumerateDevices/deviceId usage there) — not added here.
import { store } from "../appSingletons.js";
import { useGameStore } from "./useStore.js";

export function SettingsPanel() {
  const settings = useGameStore(store, (s) => s.settings);

  return (
    <div className="settings-panel" role="dialog" aria-label="Settings">
      <label>
        Co-occurrence window ±ms
        <input
          type="number"
          min={100}
          max={1000}
          step={50}
          value={settings.coOccurrenceMs}
          onChange={(e) => store.setSetting("coOccurrenceMs", Number(e.target.value))}
        />
      </label>
      <label>
        Sensitivity (VAD)
        <input
          type="range"
          min={2}
          max={20}
          step={0.5}
          value={settings.vadMult}
          onChange={(e) => store.setSetting("vadMult", Number(e.target.value))}
        />
        <span>{settings.vadMult}</span>
      </label>
      <label>
        Hand: HIGH velocity
        <input type="number" step={0.1} value={settings.highV} onChange={(e) => store.setSetting("highV", Number(e.target.value))} />
      </label>
      <label>
        Hand: LOW velocity
        <input type="number" step={0.05} value={settings.lowV} onChange={(e) => store.setSetting("lowV", Number(e.target.value))} />
      </label>
      <label>
        Hand: settle ms
        <input type="number" step={10} value={settings.settleMs} onChange={(e) => store.setSetting("settleMs", Number(e.target.value))} />
      </label>

      {/* Feature 2 — the reset palette. Each gesture toggles independently
          (OR-semantics: any ENABLED one re-arms); stillness (the held-over/
          transition backstop) isn't listed — it's a permanent safety net,
          not a toggleable gesture. Feature 3 makes these per-profile. */}
      <fieldset className="reset-palette-settings">
        <legend>Reset palette</legend>
        <label>
          <input
            type="checkbox"
            checked={settings.resetPalette.outOfFrameEnabled}
            onChange={(e) => store.setResetPaletteSetting("outOfFrameEnabled", e.target.checked)}
          />
          Hand out of frame
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.resetPalette.belowZoneEnabled}
            onChange={(e) => store.setResetPaletteSetting("belowZoneEnabled", e.target.checked)}
          />
          Below-zone ("the table")
        </label>
        <label>
          Zone height %
          <input
            type="number"
            min={5}
            max={40}
            step={1}
            disabled={!settings.resetPalette.belowZoneEnabled}
            value={settings.resetPalette.belowZoneHeightPct}
            onChange={(e) => store.setResetPaletteSetting("belowZoneHeightPct", Number(e.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.resetPalette.waveEnabled}
            onChange={(e) => store.setResetPaletteSetting("waveEnabled", e.target.checked)}
          />
          Wave to cancel
        </label>
      </fieldset>
    </div>
  );
}
