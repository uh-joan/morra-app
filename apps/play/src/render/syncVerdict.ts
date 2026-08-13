// render/syncVerdict.ts — ports spikes/s03-beat.html L2426–2502: the sync
// verdict card + tally. The stale-render guard syncVerdictThrowRef lives
// HERE (module-level, object identity — race #8): a slow-resolving throw
// can never clobber a newer throw's card.

import { el } from "../dom.js";
import { median } from "../util.js";
import { renderBigWordIdle } from "./bigWord.js";
import { voskLoaded } from "../vosk.js";
import type { ThrowEvent } from "../analysis.js";

let syncVerdictThrowRef: ThrowEvent | null = null;

export function isCurrentVerdictThrow(t: ThrowEvent): boolean {
  return syncVerdictThrowRef === t;
}

export function resetSyncVerdict(): void {
  syncVerdictThrowRef = null;
  el.verdictCard.className = "verdict-card idle";
  el.verdictResult.textContent = "–";
  el.verdictDetail.textContent = "waiting for a throw…";
  el.verdictWord.style.display = "none";
  renderBigWordIdle(voskLoaded());
}

export function renderSyncVerdictPending(t: ThrowEvent): void {
  syncVerdictThrowRef = t;
  el.verdictCard.className = "verdict-card pending";
  el.verdictResult.textContent = "…";
  el.verdictDetail.textContent = "analyzing…";
  if (voskLoaded()) {
    el.verdictWord.style.display = "block";
    el.verdictWord.textContent = "recognizing…";
  } else {
    el.verdictWord.style.display = "none";
  }
}

// step 10 fix 3: a preWindow-pinned early delta is a lower bound, not an
// exact reading — labeled with "≥" so it doesn't read as a precise
// measurement.
function outcomeLabel(t: ThrowEvent): string {
  switch (t.outcome) {
    case "synced": return "SYNCED";
    case "voice-late": return `voice late by ${Math.abs(t.syncDeltaMs ?? 0).toFixed(0)}ms`;
    case "voice-early": return `voice early by ${t.voicePreWindow ? "≥" : ""}${Math.abs(t.syncDeltaMs ?? 0).toFixed(0)}ms`;
    case "hand-only": return "ONLY HAND SEEN";
    case "voice-only": return "ONLY VOICE HEARD";
    // Phase C.1: not a throw at all — the fist retracting after the previous
    // one, disambiguated from a real silent throw by the absence of a voice.
    case "reset": return "hand reset";
    default: return t.outcome;
  }
}

export function renderSyncVerdict(t: ThrowEvent): void {
  syncVerdictThrowRef = t;
  const cardClass =
    t.outcome === "synced"
      ? "hit"
      : t.outcome === "hand-only" || t.outcome === "voice-only" || t.outcome === "reset"
        ? "incomplete"
        : "miss";
  el.verdictCard.className = "verdict-card " + cardClass;
  el.verdictResult.textContent = outcomeLabel(t);
  if (t.outcome === "reset") el.verdictDetail.textContent = "fist seen, no voice — not counted as a throw";
  else if (t.outcome === "voice-only") el.verdictDetail.textContent = "no hand onset seen near this shout";
  else if (t.outcome === "hand-only") el.verdictDetail.textContent = "no voice onset heard near this throw";
  else if (t.voicePreWindow) el.verdictDetail.textContent = `sync delta: ≤ ${(t.syncDeltaMs ?? 0).toFixed(0)}ms (voice started before the capture window)`;
  else el.verdictDetail.textContent = `sync delta: ${(t.syncDeltaMs ?? 0) >= 0 ? "+" : ""}${(t.syncDeltaMs ?? 0).toFixed(0)}ms`;
  if (voskLoaded()) {
    el.verdictWord.style.display = "block";
    el.verdictWord.textContent = t.word ? (t.word !== "?" ? `"${t.word}"` : "?") : t.pending ? "recognizing…" : "?";
  } else {
    el.verdictWord.style.display = "none";
  }
}

const SYNC_NATURAL_LEAD_MIN_THROWS = 8;

export function renderSyncTally(throws: readonly ThrowEvent[]): void {
  // Phase C.1: a "reset" (fist retraction, no voice) is never a throw — it
  // never counts toward the throw count or the sync rate.
  const countable = throws.filter((t) => t.outcome !== "reset");
  const resolved = countable.filter((t) => !t.pending);
  const total = resolved.length;
  const synced = resolved.filter((t) => t.outcome === "synced").length;
  const rate = total ? synced / total : 0;
  el.heroThrowCount.textContent = `${countable.length} throw${countable.length === 1 ? "" : "s"}`;
  el.heroHitRate.textContent = total ? (rate * 100).toFixed(1) + "%" : "—";
  el.heroHitRate.className = "hitrate" + (total ? (rate >= 0.85 ? " pass" : " fail") : "");
  (el.heroHitBarFill as HTMLElement).style.width = Math.min(100, rate * 100) + "%";
  const deltas = resolved.filter((t) => t.syncDeltaMs != null).map((t) => Math.abs(t.syncDeltaMs!));
  if (deltas.length) {
    el.syncMedianDelta.style.display = "block";
    el.syncMedianDelta.textContent = `median |Δ|: ${median(deltas)!.toFixed(0)}ms over ${deltas.length} paired throw${deltas.length === 1 ? "" : "s"}`;
  } else {
    el.syncMedianDelta.style.display = "none";
  }
  // step 10 fix 4: informational only — excludes preWindow-pinned throws
  // (lower bounds, not exact readings) so the median stays a real measurement.
  const confidentSignedDeltas = resolved
    .filter((t) => t.syncDeltaMs != null && !t.voicePreWindow)
    .map((t) => t.syncDeltaMs!);
  if (confidentSignedDeltas.length >= SYNC_NATURAL_LEAD_MIN_THROWS) {
    const lead = median(confidentSignedDeltas)!;
    el.syncNaturalLead.style.display = "block";
    el.syncNaturalLead.textContent = `your natural lead: ${lead >= 0 ? "+" : ""}${lead.toFixed(0)}ms (median over ${confidentSignedDeltas.length} throws)`;
  } else {
    el.syncNaturalLead.style.display = "none";
  }
}
