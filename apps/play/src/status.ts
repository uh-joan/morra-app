// status.ts — ports spikes/s03-beat.html L1119–1149: status-strip chips +
// the visible error panel. Nothing async fails silently to the console only —
// every catch block in this app also calls reportError() so a real user with
// devtools closed can still see what broke. Unlike the spike, list items are
// built via createElement/textContent (never innerHTML string interpolation).

import { el } from "./dom.js";
import { logEvent } from "./telemetry.js";

export type ChipKind = "ok" | "warn" | "bad" | "dim";

export function setChip(node: HTMLElement, text: string, cls?: ChipKind): void {
  const detail = node.querySelector(".detail");
  if (detail) detail.textContent = text;
  node.className = "status-chip" + (cls ? " " + cls : " dim");
}

interface ErrorEntry {
  atMs: number;
  subsystem: string;
  message: string;
}

const errorLog: ErrorEntry[] = [];

export function reportError(subsystem: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  errorLog.unshift({ atMs: performance.now(), subsystem, message });
  if (errorLog.length > 30) errorLog.length = 30;
  logEvent("error", { subsystem, message }); // single choke point — every reportError() also hits the bus
  renderErrors();
}

function renderErrors(): void {
  if (!errorLog.length) {
    el.errorPanel.style.display = "none";
    el.errorList.replaceChildren();
    return;
  }
  el.errorPanel.style.display = "block";
  el.errorHeadText.textContent = `Errors (${errorLog.length})`;
  el.errorList.replaceChildren(
    ...errorLog.map((e) => {
      const li = document.createElement("li");
      const time = document.createElement("span");
      time.className = "err-time";
      time.textContent = `t+${(e.atMs / 1000).toFixed(1)}s`;
      const sub = document.createElement("span");
      sub.className = "err-sub";
      sub.textContent = `[${e.subsystem}]`;
      li.append(time, " ", sub, " ", e.message);
      return li;
    })
  );
}

export function installErrorHandling(): void {
  el.btnClearErrors.addEventListener("click", () => {
    errorLog.length = 0;
    renderErrors();
  });
  window.addEventListener("error", (e) => reportError("window", e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => reportError("promise", e.reason));
}
