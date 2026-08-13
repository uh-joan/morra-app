// export.ts — ports the debug-JSON slice of spikes/s03-beat.html's
// exportDebugLog (L3784–3856; the beat-harness CSVs are dropped with beat
// mode). Everything the analysis pipeline recorded — per-throw debugRecs
// (incl. the full recognition records), orphan onsets, and the whole
// ordered event bus — in one downloadable file. Pulled forward from M6 as
// the primary field-debugging tool.

import { PAGE_VERSION } from "./config.js";
import { el } from "./dom.js";
import { debugLog, debugOrphanOnsets, eventBusLog, LOG_SESSION_ID, logEvent } from "./telemetry.js";
import { rivalClipPlaybacks } from "./rivalAudioLog.js";
import { rivalVoiceLoadStatus } from "./rivalVoice.js";

export function download(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportDebugLog(): void {
  const payload = {
    meta: {
      pageVersion: PAGE_VERSION,
      sessionId: LOG_SESSION_ID,
      exportedAtIso: new Date().toISOString(),
      userAgent: navigator.userAgent,
      rivalVoiceLoadStatus,
      rivalClipPlaybackCount: rivalClipPlaybacks.length,
    },
    debugLog,
    debugOrphanOnsets,
    eventBusLog,
  };
  logEvent("debug_export", { debugRecs: debugLog.length, busEvents: eventBusLog.length });
  download(`morra-play-debug-${LOG_SESSION_ID}.json`, JSON.stringify(payload, null, 1), "application/json");
}

export function installExport(): void {
  el.btnExportDebug.addEventListener("click", exportDebugLog);
}
