// training.ts — ports spikes/s03-beat.html L3233–3238 + L3304–3317: the
// mirror-scope state, the history-source slice, and the Entrenament panel's
// controls (scope toggle, export/reset profile). "Session vs all-time" just
// changes which slice of playerModel.throws feeds the SAME mirror functions.

import { createEmptyModel, predictPlayerFV2, toHistoryArray } from "@morra/core";
import { el } from "./dom.js";
import { logEvent, LOG_SESSION_ID } from "./telemetry.js";
import { getPlayerModel, getSessionMode, setPlayerModelState, setTrainingPanelHook } from "./game.js";
import { clearPlayerModel } from "./profile.js";
import { renderTrainingPanel, type MirrorScope } from "./render/training.js";
import { download } from "./export.js";
import { TRAINING_PANEL_TEXT } from "./game/copy.js";

// Deliberate deviation from the spike (which defaulted to "session"): the
// session id is minted per page load, so right after a reload the session
// slice is always empty and L'Espill read as "data gone". Defaulting to
// all-time always shows the accumulated picture; "Aquesta sessió" is one
// click away when practicing. (User decision, 2026-08-14.)
let mirrorScope: MirrorScope = "allTime";

export function getMirrorScope(): MirrorScope {
  return mirrorScope;
}

export function setMirrorScope(scope: MirrorScope): void {
  mirrorScope = scope;
  renderTrainingPanelIfActive();
}

function trainingHistorySource() {
  const all = toHistoryArray(getPlayerModel());
  return mirrorScope === "session" ? all.filter((h) => h.sessionId === LOG_SESSION_ID) : all;
}

export function renderTrainingPanelIfActive(): void {
  if (getSessionMode() !== "entrenament" && document.body.dataset.screen !== "espill") return;
  renderTrainingPanel(trainingHistorySource(), mirrorScope);
}
/** The L'Espill screen renders on open regardless of mode (it needs no
 * sensors — it reads the profile). Same renderer, same ids. */
export function renderEspillScreen(): void {
  renderTrainingPanel(trainingHistorySource(), mirrorScope);
}

// ------------------------------------------------------------ the shadow rival
// Entrenament has no rival — but El Rei's read runs anyway, in silence:
// before each throw its bet is frozen (argmax of predictPlayerFV2 on the
// cross-match history, exactly what L4 would aim at); after the throw the
// player is told whether it saw them coming. The last 20 make the meter.
// The classic randomness-with-feedback loop (Neuringer): the mirror is the
// feedback. Nothing here reaches the rival in Partida — it is the same pure
// read over the same history, only shown.
const SHADOW_WINDOW = 20;
interface ShadowBet { predicted: 1 | 2 | 3 | 4 | 5; p: number; rows: number }
let shadowPending: ShadowBet | null = null;
const shadowRing: { predicted: number; actual: number; hit: boolean }[] = [];
const SHADOW_MIN_ROWS = 8;
function shadowFreeze(): void {
  const hist = toHistoryArray(getPlayerModel());
  const { dist } = predictPlayerFV2("L4", hist);
  let best: 1 | 2 | 3 | 4 | 5 = 1;
  for (const v of [2, 3, 4, 5] as const) if (dist[v] > dist[best]) best = v;
  shadowPending = { predicted: best, p: dist[best], rows: hist.length };
}
function shadowScoreLastThrow(): void {
  const hist = toHistoryArray(getPlayerModel());
  const last = hist[hist.length - 1];
  const actual = last?.playerFingers;
  if (actual == null || actual < 1 || actual > 5) return;
  const bet = shadowPending;
  shadowFreeze(); // the next bet, from history that now includes this throw
  if (!bet || bet.rows < SHADOW_MIN_ROWS) { el.shadowLast.textContent = TRAINING_PANEL_TEXT.shadowTooEarly(actual); logEvent("shadow_read", { predicted: bet?.predicted ?? null, actual, hit: null, rows: bet?.rows ?? 0 }); return; }
  const hit = bet.predicted === actual;
  shadowRing.push({ predicted: bet.predicted, actual, hit });
  if (shadowRing.length > SHADOW_WINDOW) shadowRing.shift();
  logEvent("shadow_read", { predicted: bet.predicted, actual, hit, p: bet.p, rows: bet.rows });
  el.shadowLast.textContent = hit ? TRAINING_PANEL_TEXT.shadowHit(actual, Math.round(bet.p * 100)) : TRAINING_PANEL_TEXT.shadowMiss(actual, bet.predicted);
  renderShadowMeter();
}
function renderShadowMeter(): void {
  const hits = shadowRing.filter((x) => x.hit).length;
  el.shadowCount.textContent = shadowRing.length ? TRAINING_PANEL_TEXT.shadowCount(hits, shadowRing.length) : TRAINING_PANEL_TEXT.shadowCountEmpty;
  const dots: HTMLSpanElement[] = [];
  for (let i = 0; i < SHADOW_WINDOW; i++) {
    const d = document.createElement("span");
    const x = shadowRing[i];
    if (x) d.className = x.hit ? "hit" : "miss";
    dots.push(d);
  }
  el.shadowDots.replaceChildren(...dots);
}
/** Entering Entrenament: freeze the first bet, reset the meter's text. */
export function shadowArm(): void {
  shadowFreeze();
  renderShadowMeter();
  if (!shadowRing.length) el.shadowLast.textContent = TRAINING_PANEL_TEXT.shadowIntro;
}

export function installTraining(): void {
  setTrainingPanelHook(() => { shadowScoreLastThrow(); renderTrainingPanelIfActive(); });
  renderShadowMeter();
  el.btnScopeSession.addEventListener("click", () => setMirrorScope("session"));
  el.btnScopeAllTime.addEventListener("click", () => setMirrorScope("allTime"));
  // the profile menu (⚙ next to the Tripulant selector): export / reset
  const closeMenu = () => { el.profileMenu.hidden = true; el.btnProfileMenu.setAttribute("aria-expanded", "false"); };
  el.btnProfileMenu.addEventListener("click", (ev) => { ev.stopPropagation(); const open = el.profileMenu.hidden; el.profileMenu.hidden = !open; el.btnProfileMenu.setAttribute("aria-expanded", String(open)); });
  document.addEventListener("click", (ev) => { if (!el.profileMenu.hidden && !el.profileMenu.contains(ev.target as Node)) closeMenu(); });
  el.btnExportProfile.addEventListener("click", () => {
    closeMenu();
    download("morra-player-profile.json", JSON.stringify(getPlayerModel(), null, 2), "application/json");
  });
  el.btnResetProfile.addEventListener("click", () => {
    closeMenu();
    if (!confirm(TRAINING_PANEL_TEXT.resetConfirm)) return;
    clearPlayerModel();
    setPlayerModelState(createEmptyModel());
    logEvent("setting_change", { setting: "playerProfileReset", value: true });
    renderTrainingPanelIfActive();
  });
}
