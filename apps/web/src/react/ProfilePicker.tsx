// ProfilePicker.tsx — Feature 3: "who's playing". A small header switcher
// ("Qui juga: <name> ▾") per Feature 3a's spec, not a blocking modal — the
// store already auto-loads the last-played profile with zero friction
// (GameStore's constructor resolves it via resolveInitialProfileId), so
// this component exists purely to SWITCH or CREATE. It starts pre-expanded
// on a fresh install (still on the auto-created placeholder profile, id ===
// DEFAULT_PROFILE_ID) so a new player notices it immediately and picks a
// real name instead of silently staying "Jugador" forever.
import { useState } from "react";
import { store } from "../appSingletons.js";
import { useGameStore } from "./useStore.js";
import { DEFAULT_PROFILE_ID } from "../profiles/profileTypes.js";

export function ProfilePicker() {
  const profiles = useGameStore(store, (s) => s.profiles);
  const profileId = useGameStore(store, (s) => s.profileId);
  const current = profiles.find((p) => p.id === profileId);
  const [open, setOpen] = useState(profiles.length === 1 && profileId === DEFAULT_PROFILE_ID);
  const [newName, setNewName] = useState("");

  return (
    <div className="profile-picker">
      <button
        type="button"
        id="profilePickerToggle"
        className="profile-picker-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Qui juga: {current?.name ?? "Jugador"} ▾
      </button>
      {open && (
        <div className="profile-picker-panel" role="menu">
          <div className="profile-chip-list">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                className="profile-chip"
                aria-pressed={p.id === profileId}
                onClick={() => {
                  store.switchProfile(p.id);
                  setOpen(false);
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
          <form
            className="profile-create-form"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newName.trim();
              if (!name) return;
              store.createProfile(name);
              setNewName("");
              setOpen(false);
            }}
          >
            <input
              type="text"
              placeholder="Nom nou jugador"
              aria-label="Nom nou jugador"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit">+ Nou</button>
          </form>
        </div>
      )}
    </div>
  );
}
