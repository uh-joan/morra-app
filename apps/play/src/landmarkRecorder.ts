// landmarkRecorder.ts — the counting corpus recorder (mode tècnic, ?rec=1).
// Records every detected-hand frame's 21 landmarks + the shipped count +
// perf timestamp, under a per-batch TRUTH label the operator types, and
// exports one JSON. That file is what scripts/eval-counting.mjs replays
// through the candidate rules in @morra/recognition/countingCandidates —
// the 2026-08-16 console probe showed the shipped rule reads 3s and 4s
// right ~1 in 5 and the fix has to be picked on data, not eyeballed.
//
// Pure instrumentation: nothing here feeds back into counting, timing or
// the game. Off unless ?rec=1 (a recording is ~1 MB/min; not for play).
// Also usable from the console: window.__rec.label(n), .stop(), .export().

import { logEvent } from "./telemetry.js";
import { download } from "./export.js";
import type { Landmark } from "@morra/recognition";

export interface RecFrame {
  t: number; // perf-timeline frame time (same base as handFrameHistory)
  label: number | null; // operator's truth for this batch; null = unlabeled
  count: number; // what the shipped rule said
  lm: [number, number, number][]; // 21 × [x, y, z]
}

let armed = false;
let recording = false;
let currentLabel: number | null = null;
const frames: RecFrame[] = [];
let ui: { root: HTMLElement; status: HTMLElement } | null = null;

export function isRecording(): boolean {
  return recording;
}

/** camera.ts calls this per detected-hand frame; free when not recording. */
export function recordFrame(t: number, lm: readonly Landmark[], count: number): void {
  if (!recording) return;
  frames.push({ t, label: currentLabel, count, lm: lm.map((p) => [p.x, p.y, p.z ?? 0]) });
  if (frames.length % 30 === 0) refresh();
}

function setLabel(n: number | null): void {
  currentLabel = n;
  logEvent("rec_label", { label: n, frames: frames.length });
  refresh();
}
function start(): void {
  recording = true;
  logEvent("rec_start", {});
  refresh();
}
function stop(): void {
  recording = false;
  logEvent("rec_stop", { frames: frames.length });
  refresh();
}
function exportCorpus(): void {
  const byLabel: Record<string, number> = {};
  for (const f of frames) byLabel[String(f.label)] = (byLabel[String(f.label)] ?? 0) + 1;
  const payload = {
    kind: "morra-landmark-corpus",
    version: 1,
    recordedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    video: { width: (document.getElementById("handOverlay") as HTMLCanvasElement | null)?.width ?? null, height: (document.getElementById("handOverlay") as HTMLCanvasElement | null)?.height ?? null },
    framesByLabel: byLabel,
    frames,
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  download(`morra-landmarks-${stamp}.json`, JSON.stringify(payload), "application/json");
  logEvent("rec_export", { frames: frames.length, byLabel });
}
function clear(): void {
  frames.length = 0;
  refresh();
}

function refresh(): void {
  if (!ui) return;
  const byLabel: Record<string, number> = {};
  for (const f of frames) byLabel[String(f.label)] = (byLabel[String(f.label)] ?? 0) + 1;
  const parts = Object.entries(byLabel).map(([k, v]) => `${k === "null" ? "?" : k}:${v}`).join("  ");
  ui.status.textContent = `${recording ? "● REC" : "○ aturat"} · truth=${currentLabel ?? "?"} · ${frames.length} frames · ${parts}`;
  ui.root.classList.toggle("rec-on", recording);
}

/** Builds the small control strip inside the tècnic drawer. Only when
 * ?rec=1 — the drawer stays untouched otherwise. */
export function installLandmarkRecorder(): void {
  if (new URLSearchParams(location.search).get("rec") !== "1") return;
  armed = true;
  const drawer = document.getElementById("tecnicDrawer");
  if (!drawer) return;
  const root = document.createElement("div");
  root.className = "rec-strip";
  root.innerHTML = `
    <div class="rec-title">Corpus de dits <span class="rec-hint">?rec=1</span></div>
    <div class="rec-row">
      <span>Veritat:</span>
      ${[0, 1, 2, 3, 4, 5].map((n) => `<button data-rec-label="${n}" class="ghost">${n}</button>`).join("")}
      <button data-rec-label="null" class="ghost">?</button>
    </div>
    <div class="rec-row">
      <button id="recStart" class="ghost">▶ Grava</button>
      <button id="recStop" class="ghost">■ Atura</button>
      <button id="recExport" class="ghost">⤓ Exporta JSON</button>
      <button id="recClear" class="ghost">Buida</button>
    </div>
    <div id="recStatus" class="rec-status"></div>`;
  drawer.appendChild(root);
  ui = { root, status: root.querySelector("#recStatus") as HTMLElement };
  root.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.dataset.recLabel !== undefined) {
      const v = b.dataset.recLabel === "null" ? null : parseInt(b.dataset.recLabel, 10);
      root.querySelectorAll<HTMLButtonElement>("button[data-rec-label]").forEach((x) => x.classList.toggle("active", x === b));
      setLabel(v);
    } else if (b.id === "recStart") start();
    else if (b.id === "recStop") stop();
    else if (b.id === "recExport") exportCorpus();
    else if (b.id === "recClear") clear();
  });
  // Keyboard: digits 0–5 set the truth, R toggles recording (not in inputs)
  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (/^[0-5]$/.test(e.key)) {
      setLabel(parseInt(e.key, 10));
      root.querySelectorAll<HTMLButtonElement>("button[data-rec-label]").forEach((x) => x.classList.toggle("active", x.dataset.recLabel === e.key));
    } else if (e.key === "r" || e.key === "R") {
      if (recording) stop();
      else start();
    }
  });
  (window as unknown as { __rec: unknown }).__rec = { label: setLabel, start, stop, export: exportCorpus, clear, get frames() { return frames; } };
  refresh();
  logEvent("rec_armed", {});
}

export function recorderArmed(): boolean {
  return armed;
}
