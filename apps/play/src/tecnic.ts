// tecnic.ts — "mode tècnic": every diagnostic surface (status chips,
// Ajustos, tunables, export, commit line, sync tally) lives in a drawer
// that is invisible by default and toggles with the T key or ?tecnic=1.
// The elements are always in the DOM (the harnesses and the sensor modules
// keep reading/writing them); only their visibility is game-friendly.

import { logEvent } from "./telemetry.js";

function setTecnic(on: boolean): void {
  document.body.classList.toggle("tecnic", on);
  logEvent("tecnic_toggle", { on });
}

export function installTecnic(): void {
  if (new URLSearchParams(location.search).get("tecnic") === "1") {
    document.body.classList.add("tecnic");
  }
  window.addEventListener("keydown", (e) => {
    if (e.key !== "t" && e.key !== "T") return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    setTecnic(!document.body.classList.contains("tecnic"));
  });
}
