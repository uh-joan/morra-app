// firstrun.ts — the name card, two duties. (1) Sign-on: a factory-fresh
// registry (only an untouched "Principal") keeps the port behind "com et
// dius?" — submitting RENAMES the default profile, so its legacy storage
// key and any accumulated history simply become the named player (zero
// migration) and the gate closes forever (profileRegistry.needsFirstRun is
// name-based). (2) Rename: the tripulant chip's "Canvia el nom" reopens
// the same card prefilled — one player per vessel, so a rename is the only
// profile action left with a face.
//
// The card is an overlay like the sensor card — not a screen, no route.
// Deep links while the sign-on gate is up are swallowed to the title. The
// submit is a real click/Enter gesture, so the sign-on hook can dispatch
// the gesture-gated sensor buttons synchronously.

import { logEvent } from "./telemetry.js";
import { getActiveProfileId, needsFirstRunProfile, profileNameHash, renameProfileById } from "./profile.js";

let onNamed: (name: string) => void = () => {};
export function setFirstRunNamedHook(hook: (name: string) => void): void {
  onNamed = hook;
}

type CardMode = "signon" | "rename";
let mode: CardMode = "signon";
let onRename: ((name: string) => boolean) | null = null;

const CARD_COPY: Record<CardMode, { title: string; sub: string; cta: string; cancelable: boolean }> = {
  signon: { title: "Puja a bord", sub: "Cada corsari deixa la seva marca a la taula de morra. Com et dius?", cta: "Embarca", cancelable: false },
  rename: { title: "Canvia el nom", sub: "Com et dius, corsari?", cta: "Desa", cancelable: true },
};

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function openCard(m: CardMode, prefill = ""): void {
  mode = m;
  const c = CARD_COPY[m];
  const input = byId("firstrunName") as HTMLInputElement | null;
  const go = byId("firstrunGo") as HTMLButtonElement | null;
  const title = byId("firstrunTitle");
  if (title) title.textContent = c.title;
  const sub = byId("firstrunSub");
  if (sub) sub.textContent = c.sub;
  if (input) input.value = prefill;
  if (go) { go.textContent = c.cta; go.disabled = !prefill.trim(); }
  const cancel = byId("firstrunCancel");
  if (cancel) cancel.hidden = !c.cancelable;
  const note = byId("firstrunNote");
  if (note) note.hidden = m !== "signon";
  document.body.dataset.firstrun = "on";
  requestAnimationFrame(() => input?.focus());
}

function closeCard(): void {
  document.body.dataset.firstrun = "off";
  onRename = null;
}

/** Raise the sign-on gate if the registry is still factory-fresh.
 * Idempotent; returns whether the gate is (now) up — the router uses this
 * to swallow deep links while nobody has signed on. */
export function maybeStartFirstRun(): boolean {
  if (!needsFirstRunProfile()) return false;
  if (document.body.dataset.firstrun !== "on") {
    openCard("signon");
    logEvent("firstrun_start", {});
  }
  return true;
}

/** "Canvia el nom": the same card, prefilled. `rename` returns false on an
 * invalid name (the card stays open). */
export function openRenameCard(current: string, rename: (name: string) => boolean): void {
  onRename = rename;
  openCard("rename", current);
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
    if (mode === "signon") {
      // At first run the active profile IS the default one.
      if (!renameProfileById(getActiveProfileId(), name)) return;
      closeCard();
      logEvent("firstrun_named", { profileId: getActiveProfileId(), profileHash: profileNameHash(name) });
      onNamed(name); // screens.ts: same gesture → sensors → calibration
      return;
    }
    if (!onRename?.(name)) return; // unchanged/blank: the card stays
    closeCard();
  });
  byId("firstrunCancel")?.addEventListener("click", () => closeCard());
}
