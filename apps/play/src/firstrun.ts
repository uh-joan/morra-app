// firstrun.ts — the sign-on card. A factory-fresh registry (only an
// untouched "Principal") means nobody has claimed this browser yet, so the
// port stays behind a single card: "com et dius?". Submitting RENAMES the
// default profile — the id and its legacy storage key stay, so any
// accumulated history simply becomes the named player (zero migration) and
// the gate closes forever (profileRegistry.needsFirstRun is name-based).
//
// The card is an overlay like the sensor card — not a screen, no route.
// Deep links while the gate is up are swallowed to the title: first-run has
// one fixed path (name → sensors → calibration), wired by screens.ts via
// the named hook. The submit is a real click/Enter gesture, so the hook can
// dispatch the gesture-gated sensor buttons synchronously.

import { logEvent } from "./telemetry.js";
import { getActiveProfileId, needsFirstRunProfile, renameProfileById } from "./profile.js";
import { renderProfileControls } from "./profiles.js";

let onNamed: (name: string) => void = () => {};
export function setFirstRunNamedHook(hook: (name: string) => void): void {
  onNamed = hook;
}

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** Raise the gate if the registry is still factory-fresh. Idempotent;
 * returns whether the gate is (now) up — the router uses this to swallow
 * deep links while nobody has signed on. */
export function maybeStartFirstRun(): boolean {
  if (!needsFirstRunProfile()) return false;
  if (document.body.dataset.firstrun !== "on") {
    document.body.dataset.firstrun = "on";
    logEvent("firstrun_start", {});
    requestAnimationFrame(() => (byId("firstrunName") as HTMLInputElement | null)?.focus());
  }
  return true;
}

export function installFirstRun(): void {
  const form = byId("firstrunForm") as HTMLFormElement | null;
  const input = byId("firstrunName") as HTMLInputElement | null;
  const go = byId("firstrunGo") as HTMLButtonElement | null;
  if (!form || !input || !go) return;
  input.addEventListener("input", () => {
    go.disabled = !input.value.trim();
  });
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    // At first run the active profile IS the default one.
    if (!renameProfileById(getActiveProfileId(), name)) return;
    renderProfileControls();
    document.body.dataset.firstrun = "off";
    logEvent("firstrun_named", { profileId: getActiveProfileId(), profileName: name });
    onNamed(name); // screens.ts: same gesture → sensors → calibration
  });
}
