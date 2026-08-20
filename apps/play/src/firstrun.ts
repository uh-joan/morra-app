// firstrun.ts — the name card, two duties. (1) Sign-on: a factory-fresh
// registry (only an untouched "Principal") keeps the port behind "com et
// dius?" — submitting RENAMES the default profile, so its legacy storage
// key and any accumulated history simply become the named player (zero
// migration) and the gate closes forever (profileRegistry.needsFirstRun is
// name-based). (2) The "+" flow: the same card creates a new tripulant and
// then offers "Calibra ara / Més tard" — a fresh profile is always
// uncalibrated, and the play detour (screens.ts) catches "Més tard" later.
//
// The card is an overlay like the sensor card — not a screen, no route.
// Deep links while the sign-on gate is up are swallowed to the title.
// Submits and the offer buttons are real click/Enter gestures, so the hooks
// can dispatch the gesture-gated sensor buttons synchronously.

import { logEvent } from "./telemetry.js";
import { getActiveProfileId, needsFirstRunProfile, renameProfileById } from "./profile.js";

let onNamed: (name: string) => void = () => {};
export function setFirstRunNamedHook(hook: (name: string) => void): void {
  onNamed = hook;
}
let onCalibraAra: () => void = () => {};
export function setCalibraAraHook(hook: () => void): void {
  onCalibraAra = hook;
}

type CardMode = "signon" | "nou";
let mode: CardMode = "signon";
let onCreate: ((name: string) => boolean) | null = null;

const CARD_COPY: Record<CardMode, { title: string; sub: string; cta: string; cancelable: boolean }> = {
  signon: { title: "Puja a bord", sub: "Cada corsari deixa la seva marca a la taula de morra. Com et dius?", cta: "Embarca", cancelable: false },
  nou: { title: "Un tripulant nou", sub: "Com es diu, el nou corsari?", cta: "Crea", cancelable: true },
};
const OFFER_SUB = "Vols que la taula t'aprengui la mà i el crit ara? Mig minut.";

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function openCard(m: CardMode): void {
  mode = m;
  const c = CARD_COPY[m];
  const input = byId("firstrunName") as HTMLInputElement | null;
  const go = byId("firstrunGo") as HTMLButtonElement | null;
  const title = byId("firstrunTitle");
  if (title) title.textContent = c.title;
  const sub = byId("firstrunSub");
  if (sub) sub.textContent = c.sub;
  if (go) { go.textContent = c.cta; go.disabled = true; go.hidden = false; }
  if (input) { input.value = ""; input.hidden = false; }
  const cancel = byId("firstrunCancel");
  if (cancel) cancel.hidden = !c.cancelable;
  const note = byId("firstrunNote");
  if (note) note.hidden = m !== "signon";
  const offer = byId("firstrunOffer");
  if (offer) offer.hidden = true;
  document.body.dataset.firstrun = "on";
  requestAnimationFrame(() => input?.focus());
}

function closeCard(): void {
  document.body.dataset.firstrun = "off";
  onCreate = null;
}

/** After creating a tripulant: the hail, and the calibration offer. */
function showOffer(name: string): void {
  const title = byId("firstrunTitle");
  if (title) title.textContent = `A coberta, tripulant ${name}!`;
  const sub = byId("firstrunSub");
  if (sub) sub.textContent = OFFER_SUB;
  (byId("firstrunName") as HTMLInputElement | null)?.setAttribute("hidden", "");
  byId("firstrunGo")?.setAttribute("hidden", "");
  byId("firstrunCancel")?.setAttribute("hidden", "");
  const offer = byId("firstrunOffer");
  if (offer) offer.hidden = false;
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

/** The "+" flow: same card, a new tripulant. `create` returns false on an
 * invalid name (the card stays open); on success the card turns into the
 * Calibra ara / Més tard offer. */
export function openNouTripulant(create: (name: string) => boolean): void {
  onCreate = create;
  openCard("nou");
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
      logEvent("firstrun_named", { profileId: getActiveProfileId(), profileName: name });
      onNamed(name); // screens.ts: same gesture → sensors → calibration
      return;
    }
    if (!onCreate?.(name)) return; // blank/failed: the card stays
    onCreate = null;
    showOffer(name);
  });
  byId("firstrunCancel")?.addEventListener("click", () => closeCard());
  byId("firstrunCalibra")?.addEventListener("click", () => {
    closeCard();
    logEvent("profile_calibra_ara", { profileId: getActiveProfileId() });
    onCalibraAra(); // screens.ts: same gesture → sensors → Calibratge
  });
  byId("firstrunLater")?.addEventListener("click", () => closeCard());
}
