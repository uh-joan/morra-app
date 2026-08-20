// training.ts — ports spikes/s03-beat.html L3233–3238 + L3304–3317: the
// mirror-scope state, the history-source slice, and the Entrenament panel's
// controls (scope toggle, export/reset profile). "Session vs all-time" just
// changes which slice of playerModel.throws feeds the SAME mirror functions.

import { COVERAGE_MISSION, createEmptyModel, missionForTell, missionProgress, predictPlayerFV2, toHistoryArray, type HistoryEntry, type MissionProgress, type MissionSpec, type MissionThrow } from "@morra/core";
import { el } from "./dom.js";
import { logEvent, LOG_SESSION_ID } from "./telemetry.js";
import { getPlayerModel, getSessionMode, setPlayerModelState, setTrainingPanelHook } from "./game.js";
import { clearPlayerModel } from "./profile.js";
import { getLastTopTell, renderTrainingPanel, type MirrorScope } from "./render/training.js";
import { isSoloTraining } from "./rivalState.js";
import { PIRATES } from "./pirate/cast.js";
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

/** Under this many session rows, "Aquesta sessió" shows the all-time
 * picture instead (with a note): the mirror always says something. The
 * choice sticks — once the session reaches the bar, the slice is honored. */
const SESSION_MIN_ROWS = 20;

function renderMirror(): void {
  const all = toHistoryArray(getPlayerModel());
  if (mirrorScope === "session") {
    const session = all.filter((h) => h.sessionId === LOG_SESSION_ID);
    if (session.length < SESSION_MIN_ROWS && all.length > session.length) {
      renderTrainingPanel(all, "allTime");
      el.trainingSampleCount.textContent = TRAINING_PANEL_TEXT.sessionThin(session.length, all.length);
      return;
    }
    renderTrainingPanel(session, "session");
    return;
  }
  renderTrainingPanel(all, "allTime");
}

export function renderTrainingPanelIfActive(): void {
  if (getSessionMode() !== "entrenament" && document.body.dataset.screen !== "espill") return;
  renderMirror();
}
/** The L'Espill screen renders on open regardless of mode (it needs no
 * sensors — it reads the profile). Same renderer, same ids. */
export function renderEspillScreen(): void {
  renderMirror();
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
function shadowScoreLastThrow(): boolean | null {
  const hist = toHistoryArray(getPlayerModel());
  const last = hist[hist.length - 1];
  const actual = last?.playerFingers;
  if (actual == null || actual < 1 || actual > 5) return null;
  const bet = shadowPending;
  shadowFreeze(); // the next bet, from history that now includes this throw
  if (!bet || bet.rows < SHADOW_MIN_ROWS) { el.shadowLast.textContent = TRAINING_PANEL_TEXT.shadowTooEarly(actual); logEvent("shadow_read", { predicted: bet?.predicted ?? null, actual, hit: null, rows: bet?.rows ?? 0 }); return null; }
  const hit = bet.predicted === actual;
  shadowRing.push({ predicted: bet.predicted, actual, hit });
  if (shadowRing.length > SHADOW_WINDOW) shadowRing.shift();
  logEvent("shadow_read", { predicted: bet.predicted, actual, hit, p: bet.p, rows: bet.rows });
  el.shadowLast.textContent = hit ? TRAINING_PANEL_TEXT.shadowHit(actual, Math.round(bet.p * 100)) : TRAINING_PANEL_TEXT.shadowMiss(actual, bet.predicted);
  renderShadowMeter();
  return hit;
}

// ------------------------------------------------------------ missions
// A mission is a pure spec (core missions.ts) run over the throws made
// while it is on: the app owns the clock (start/stop/again), feeds each
// training throw with the shadow verdict, renders progress/feedback/verdict,
// and logs training_mission at the end. "Practica-ho" in L'Espill queues
// the mission for the coach card's tell; it starts when Entrenament opens.
let mission: { spec: MissionSpec; before: HistoryEntry[]; throws: MissionThrow[]; startedAt: number } | null = null;
let pendingMission: MissionSpec | null = null;
export function queueMission(spec: MissionSpec): void { pendingMission = spec; }
export function startMission(spec: MissionSpec): void {
  mission = { spec, before: [...toHistoryArray(getPlayerModel())], throws: [], startedAt: performance.now() };
  logEvent("training_mission", { phase: "start", id: spec.id, kind: spec.kind, n: spec.n });
  el.missionIdle.hidden = true; el.missionDone.hidden = true; el.missionLive.hidden = false;
  el.missionTitle.textContent = spec.title; el.missionGoal.textContent = spec.goal;
  el.missionFeedback.textContent = ""; el.missionFeedback.classList.remove("good");
  renderMission(missionProgress(spec, mission.before, []));
}
function stopMission(reason: "stop" | "close"): void {
  if (mission) logEvent("training_mission", { phase: reason, id: mission.spec.id, n: mission.throws.length });
  mission = null;
  el.missionLive.hidden = true; el.missionDone.hidden = true; el.missionIdle.hidden = false;
}
function ctxLabel(spec: MissionSpec): string {
  if (spec.ctx && "a" in spec.ctx) return spec.ctx.b != null ? `un ${spec.ctx.a} i un ${spec.ctx.b}` : `un ${spec.ctx.a}`;
  return "";
}
function renderMission(p: MissionProgress): void {
  if (!mission) return;
  const { spec } = mission;
  el.missionProgress.textContent = TRAINING_PANEL_TEXT.missionProgress(p.n, p.total);
  el.missionBarFill.style.width = `${Math.min(100, (100 * p.n) / p.total)}%`;
  if (spec.kind === "break-pattern") el.missionLiveLine.textContent = TRAINING_PANEL_TEXT.missionLiveBreak(spec.bad!, ctxLabel(spec), p.badN, p.ctxN, spec.targetRate ?? 0.3);
  else if (spec.kind === "unweld") el.missionLiveLine.textContent = TRAINING_PANEL_TEXT.missionLiveUnweld((spec.ctx as { f: number }).f, (spec.ctx as { f: number }).f + spec.bad!, p.badN, p.ctxN, spec.targetRate ?? 0.3);
  else if (spec.kind === "shadow") el.missionLiveLine.textContent = TRAINING_PANEL_TEXT.missionLiveShadow(p.shadowHits, p.shadowScored, spec.maxHits ?? 5);
  else el.missionLiveLine.textContent = TRAINING_PANEL_TEXT.missionLiveCoverage(p.shares, p.shadowHits, spec.maxHits ?? 7);
}
function missionOnThrow(f: number, g: number | null, shadowHit: boolean | null): void {
  if (!mission) return;
  mission.throws.push({ f, g, shadowHit });
  const p = missionProgress(mission.spec, mission.before, mission.throws);
  const { spec } = mission;
  // per-throw feedback
  let fb: string = TRAINING_PANEL_TEXT.missionFeedbackNeutral, good = false;
  if (spec.kind === "break-pattern" && p.last === "bad") fb = TRAINING_PANEL_TEXT.missionFeedbackBadBreak(f, ctxLabel(spec));
  else if (spec.kind === "break-pattern" && p.last === "good") { fb = TRAINING_PANEL_TEXT.missionFeedbackGoodBreak(f, ctxLabel(spec)); good = true; }
  else if (spec.kind === "unweld" && p.last === "bad") fb = TRAINING_PANEL_TEXT.missionFeedbackBadUnweld(f, f + spec.bad!);
  else if (spec.kind === "unweld" && p.last === "good") { fb = TRAINING_PANEL_TEXT.missionFeedbackGoodUnweld(f); good = true; }
  el.missionFeedback.textContent = fb; el.missionFeedback.classList.toggle("good", good);
  renderMission(p);
  if (p.done) {
    logEvent("training_mission", { phase: "done", id: spec.id, kind: spec.kind, pass: p.pass, n: p.n, ctxN: p.ctxN, badN: p.badN, rate: p.rate, shadowHits: p.shadowHits, shadowScored: p.shadowScored, ms: Math.round(performance.now() - mission.startedAt) });
    el.missionVerdict.textContent = p.pass === true ? TRAINING_PANEL_TEXT.missionPass(spec.title) : p.pass === false ? TRAINING_PANEL_TEXT.missionFail(spec.title) : TRAINING_PANEL_TEXT.missionUndecidable;
    el.missionLive.hidden = true; el.missionDone.hidden = false;
    const done = mission; mission = null;
    el.btnMissionAgain.onclick = () => startMission(done.spec);
  }
}
/** The strip's mission button follows the coach card's #1 tell. */
function renderMissionIdle(): void {
  const spec = missionForTell(getLastTopTell());
  el.missionTopTitle.textContent = spec.title;
}
/** Entering Entrenament: start the queued mission, if any. */
export function missionArm(): void {
  renderMissionIdle();
  if (pendingMission) { const m = pendingMission; pendingMission = null; startMission(m); }
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
  renderStripHead();
}

// ------------------------------------------------------------ the strip head + the reading meter (sparring)
// Sparring: the partner throws and calls back — so the mirror also scores
// YOU as a reader: did your guess land on their fingers? Last 20 rounds.
const readingRing: { g: number; af: number; hit: boolean }[] = [];
function partnerName(): string | null {
  if (isSoloTraining()) return null;
  const level = el.selAiLevel.value || "L1";
  return PIRATES.find((p) => p.levelId === level)?.name ?? null;
}
function renderStripHead(): void {
  const name = partnerName();
  el.trainingHead.textContent = name ? TRAINING_PANEL_TEXT.trainingHeadSparring(name) : TRAINING_PANEL_TEXT.trainingHeadSolo;
  el.readingBox.hidden = !name;
  if (name) el.readingName.textContent = name;
  renderReadingMeter();
}
function readingScoreLastRound(): void {
  const hist = toHistoryArray(getPlayerModel());
  const last = hist[hist.length - 1];
  if (!last || last.aiFingers == null || last.playerCall == null || last.playerFingers == null) return;
  const g = last.playerCall - last.playerFingers;
  if (g < 1 || g > 5) return;
  const hit = g === last.aiFingers;
  readingRing.push({ g, af: last.aiFingers, hit });
  if (readingRing.length > SHADOW_WINDOW) readingRing.shift();
  el.readingLast.textContent = hit ? TRAINING_PANEL_TEXT.readingHit(last.aiFingers) : TRAINING_PANEL_TEXT.readingMiss(g, last.aiFingers);
  renderReadingMeter();
}
function renderReadingMeter(): void {
  const hits = readingRing.filter((x) => x.hit).length;
  el.readingCount.textContent = readingRing.length ? TRAINING_PANEL_TEXT.readingCount(hits, readingRing.length) : "—";
  const dots: HTMLSpanElement[] = [];
  for (let i = 0; i < SHADOW_WINDOW; i++) { const d = document.createElement("span"); const x = readingRing[i]; if (x) d.className = x.hit ? "hit" : "miss"; dots.push(d); }
  el.readingDots.replaceChildren(...dots);
}

export function installTraining(): void {
  setTrainingPanelHook(() => {
    const shadowHit = shadowScoreLastThrow();
    readingScoreLastRound(); // sparring only has rival fingers to read; solo entries have none
    renderTrainingPanelIfActive();
    const hist = toHistoryArray(getPlayerModel()); const last = hist[hist.length - 1];
    if (last?.playerFingers != null) missionOnThrow(last.playerFingers, last.playerCall != null ? last.playerCall - last.playerFingers : null, shadowHit);
    renderMissionIdle();
  });
  renderShadowMeter();
  el.btnMissionTop.addEventListener("click", () => startMission(missionForTell(getLastTopTell())));
  el.btnMissionCoverage.addEventListener("click", () => startMission(COVERAGE_MISSION));
  el.btnMissionStop.addEventListener("click", () => stopMission("stop"));
  el.btnMissionClose.addEventListener("click", () => stopMission("close"));
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
