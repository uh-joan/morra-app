// screens.ts — the screen flow of the pirate skin: title → (onboarding) →
// character select → fight, plus the VS splash and the end-of-match
// overlay's extra navigation. Pure presentation state: one body[data-*]
// attribute drives ALL visibility via CSS; game/mode/level state stays
// owned by game.ts/modes.ts — this module only pushes the same buttons a
// player could (selAiLevel change, btnPlayAgain click, setSessionMode).

import { LEVELS } from "@morra/core";
import { el } from "./dom.js";
import { logEvent } from "./telemetry.js";
import { setSessionMode } from "./modes.js";
import { PIRATES, pirateForLevel, type Pirate } from "./pirate/cast.js";
import { artWithUniqueIds, PIRATE_ART, WORDMARK_SVG } from "./pirate/art.js";
import { setPirate, installPirateChoreography } from "./pirate/render.js";
import { installOnboarding, setOnboardingReadyHook, startOnboarding } from "./onboarding.js";
import { installFirstRun, maybeStartFirstRun, setFirstRunNamedHook } from "./firstrun.js";
import { renderProfileControls } from "./profiles.js";
import { calibrationSiteKey, hasCalibrationForCurrentSite, isCalibrating, isCalibrationDeclined, markCalibrationDeclined, setCalibrationEndHook, start as startCalibration, stop as stopCalibration } from "./calibration.js";
import { getActiveProfileName, loadBeatenRivals } from "./profile.js";
import { frontierLevel, isRivalUnlocked, predecessorLevel } from "./rivalLadder.js";
import { renderEspillScreen } from "./training.js";
import { renderClassificacioScreen } from "./render/classificacio.js";
import { getSessionMode } from "./game.js";
import { syncReady } from "./analysis.js";
import { installRouter, reflectRoute, type Route, type RouteParams } from "./router.js";
import { isSoloTraining, levelForSlug, setSoloTraining, slugForLevel, SOLO_SLUG } from "./rivalState.js";
import { applyModeLayout } from "./modes.js";

export type Screen = "title" | "select" | "fight" | "espill" | "calib" | "classificacio";

export function setScreen(s: Screen): void {
  if (s === "select") buildSelectGrid(); // rebuild so freshly-earned unlocks show
  if (s === "classificacio") renderClassificacioScreen(); // fresh table on entry
  document.body.dataset.screen = s;
  if (s === "fight") renderRivalHud(); // the header chip says who you fight
  logEvent("screen_change", { screen: s });
  reflectRoute(s, getSessionMode(), routeParamsFor(s), "push", currentRivalSlug());
}
/** The header's rival chip: the partner at the table (or the mirror). */
function renderRivalHud(): void {
  const name = byId("rivalHudName");
  if (!name) return;
  name.textContent = isSoloTraining() && getSessionMode() === "entrenament" ? "Sol" : PIRATES.find((p) => p.levelId === (el.selAiLevel.value || "L1"))?.name ?? "—";
}
/** The path segment for the fight routes: the rival, or "sol" when sparring nobody. */
export function currentRivalSlug(): string {
  return getSessionMode() === "entrenament" && isSoloTraining() ? SOLO_SLUG : slugForLevel(el.selAiLevel.value || "L1");
}
function routeParamsFor(s: Screen): RouteParams {
  if (s === "espill") return { tab: el.espillPanes.dataset.tab ?? "rei" };
  if (s === "select") return { per: getSessionMode() === "entrenament" ? "entrena" : "duel" };
  return {};
}
function selectEspillTab(tab: string): void {
  if (!el.espillTabs.querySelector(`button[data-tab="${tab}"]`)) return;
  el.espillPanes.dataset.tab = tab;
  for (const x of el.espillTabs.querySelectorAll("button")) x.classList.toggle("on", x.dataset.tab === tab);
}

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

// ------------------------------------------------------- character select

function rankPips(rank: number): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "card-rank";
  for (let i = 1; i <= 4; i++) {
    const pip = document.createElement("span");
    pip.className = "pip" + (i <= rank ? " lit" : "");
    wrap.appendChild(pip);
  }
  return wrap;
}

// A small chain-padlock, in the card's own gold-dim — createElementNS-free
// (a constant authored string, like the corsair art it sits over).
const LOCK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';

function buildCard(p: Pirate, beaten: ReadonlySet<string>, frontier: string | null): HTMLButtonElement {
  const unlocked = isRivalUnlocked(p.levelId, beaten);
  const isBeaten = beaten.has(p.levelId);
  const isNext = unlocked && !isBeaten && p.levelId === frontier;
  const shroud = !unlocked && p.levelId === "L4"; // the final boss stays a mystery

  const card = document.createElement("button");
  card.type = "button";
  card.id = "pirateCard-" + p.levelId;
  card.className = "pirate-card stage-" + p.stageId;
  // A locked card stays focusable (so the reason is reachable) but announces
  // itself disabled; the click is intercepted below rather than dead.
  if (!unlocked) { card.dataset.locked = "on"; card.setAttribute("aria-disabled", "true"); }
  if (isBeaten) card.dataset.beaten = "on";
  if (isNext) card.dataset.next = "on";
  if (shroud) card.dataset.shroud = "on";

  const portrait = document.createElement("div");
  portrait.className = "card-portrait";
  portrait.innerHTML = artWithUniqueIds(PIRATE_ART[p.levelId] ?? "", "card-" + p.levelId); // constant authored art
  const name = document.createElement("div");
  name.className = "card-name";
  name.textContent = shroud ? "???" : p.name;
  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = p.title;
  const flavor = document.createElement("div");
  flavor.className = "card-flavor";
  if (unlocked) {
    flavor.textContent = p.flavor;
  } else {
    const predName = pirateForLevel(predecessorLevel(p.levelId) ?? "L1").defeatName;
    flavor.textContent = shroud
      ? `Venç ${predName} i el desvetllaràs.`
      : `Bloquejat — primer, venç ${predName}.`;
  }
  const stage = document.createElement("div");
  stage.className = "card-stage";
  stage.textContent = shroud ? "un mar sense nom" : p.stageName;
  const core = document.createElement("div");
  core.className = "card-core";
  core.textContent = LEVELS[p.levelId]?.name ?? p.levelId;
  card.append(rankPips(p.rank), portrait, name, title, flavor, stage, core);

  // Corner badges (absolutely placed by CSS): the padlock, the ✓ medal for
  // rivals already down, the "el següent" ribbon on the current challenge.
  if (!unlocked) {
    const lock = document.createElement("div");
    lock.className = "card-lock";
    lock.innerHTML = LOCK_SVG;
    lock.setAttribute("aria-hidden", "true");
    card.appendChild(lock);
  }
  if (isBeaten) {
    const medal = document.createElement("div");
    medal.className = "card-medal";
    medal.textContent = "✓";
    medal.setAttribute("aria-hidden", "true");
    card.appendChild(medal);
  }
  if (isNext) {
    const ribbon = document.createElement("div");
    ribbon.className = "card-ribbon";
    ribbon.textContent = "el següent";
    card.appendChild(ribbon);
  }

  card.addEventListener("click", () => {
    if (!unlocked) { nudgeLocked(card, predecessorLevel(p.levelId)); return; }
    chooseRival(p);
  });
  return card;
}

// A locked tap isn't silent: the card rattles its chains and the rival you
// must beat first pulses — "that one, then me".
function nudgeLocked(card: HTMLElement, predLevel: string | null): void {
  card.classList.remove("rattle");
  void card.offsetWidth; // reflow so the animation restarts on repeat taps
  card.classList.add("rattle");
  logEvent("rival_locked_tap", { level: card.id.replace("pirateCard-", "") });
  const pred = predLevel ? byId("pirateCard-" + predLevel) : null;
  if (!pred) return;
  pred.classList.remove("point");
  void pred.offsetWidth;
  pred.classList.add("point");
}

function buildSoloCard(): HTMLButtonElement {
  const card = document.createElement("button");
  card.type = "button";
  card.id = "pirateCard-sol";
  card.className = "pirate-card solo-card";
  const portrait = document.createElement("div"); portrait.className = "card-portrait solo-portrait"; // a mirror-glow, no icon
  const name = document.createElement("div"); name.className = "card-name"; name.textContent = "Sol";
  const title = document.createElement("div"); title.className = "card-title"; title.textContent = "davant l'espill";
  const flavor = document.createElement("div"); flavor.className = "card-flavor"; flavor.textContent = "Ningú et torna la tirada. Només tu, els teus números i l'ombra d'El Rei que et llegeix.";
  card.append(portrait, name, title, flavor);
  card.addEventListener("click", () => chooseSolo());
  return card;
}
function buildSelectGrid(): void {
  const grid = byId("selectGrid");
  if (!grid) return;
  const beaten = loadBeatenRivals();
  const frontier = frontierLevel(beaten);
  // the solo card shows in Entrenament only (CSS)
  grid.replaceChildren(...PIRATES.map((p) => buildCard(p, beaten, frontier)), buildSoloCard());
}

let splashTimer: ReturnType<typeof setTimeout> | null = null;

function chooseRival(p: Pirate): void {
  // The hidden level select stays the single source of truth — game.ts's
  // change handler does the real work (setCurrentAiLevel, re-commit).
  el.selAiLevel.value = p.levelId;
  el.selAiLevel.dispatchEvent(new Event("change"));
  setPirate(p.levelId);
  logEvent("rival_chosen", { level: p.levelId });
  // VS splash, then the fight. Presentation-only drama: the game is
  // already committed and playable underneath.
  const vsName = byId("vsName");
  const vsTitle = byId("vsTitle");
  const vsStage = byId("vsStage");
  const vsPortrait = byId("vsPortrait");
  if (vsName) vsName.textContent = p.name;
  if (vsTitle) vsTitle.textContent = p.title;
  if (vsStage) vsStage.textContent = p.stageName;
  if (vsPortrait) vsPortrait.innerHTML = artWithUniqueIds(PIRATE_ART[p.levelId] ?? "", "vs");
  // Your name, sized to fit whatever its length: short names get the full
  // drama, long ones shrink so the vertical splash never overflows.
  const vsYou = byId("vsYouMark");
  if (vsYou) {
    const name = getActiveProfileName();
    vsYou.textContent = name;
    vsYou.style.fontSize = `min(72px, ${Math.round(880 / Math.max(4, name.length)) / 10}vw)`;
  }
  document.body.classList.add("vs-on");
  if (splashTimer) clearTimeout(splashTimer);
  splashTimer = setTimeout(() => {
    document.body.classList.remove("vs-on");
  }, 1400);
  // The mode is the player's intent (the pills); choosing a rival keeps it:
  // in Partida this starts the duel, in Entrenament the sparring.
  setSoloTraining(false);
  setScreen("fight");
  applyModeLayout(); // partner changed inside the same mode: panels + loop + route
}
let pendingCalibration = false;
/** The first-run journey (name → sensors → calibration → a jugar) is in
 * flight: the calibration end hands off to the tripulants instead of the
 * port. */
let firstRunFlow = false;
function chooseSolo(): void {
  setSoloTraining(true);
  logEvent("rival_chosen", { level: null, solo: true });
  setSessionMode("entrenament");
  setScreen("fight");
  applyModeLayout();
}

// ------------------------------------------------------ Calibratge (page)
// One live camera pipeline, two homes: the fight screen's .video-wrap is
// reparented into the Calibratge page's stage while the page is up, and put
// back exactly where it was when the session ends. The <video> keeps
// playing across the move (srcObject survives reparenting).
let videoHome: { parent: HTMLElement; next: Node | null } | null = null;
function moveVideoToStage(): void {
  const wrap = document.querySelector<HTMLElement>(".video-wrap");
  const stage = byId("calibStage");
  if (!wrap || !stage || wrap.parentElement === stage) return;
  videoHome = { parent: wrap.parentElement!, next: wrap.nextSibling };
  stage.appendChild(wrap);
}
function moveVideoBack(): void {
  const wrap = document.querySelector<HTMLElement>(".video-wrap");
  if (!wrap || !videoHome) return;
  videoHome.parent.insertBefore(wrap, videoHome.next);
  videoHome = null;
}
// The play detour: nobody plays uncalibrated by ACCIDENT. Heading to play
// with no saved fit for this profile+camera routes through Calibratge
// first; Desa — or declining (✕/Descarta) — continues to where they were
// going. A decline is remembered per profile+camera for THIS session only
// (calibration.ts owns the set), so the invitation returns next sitting
// but never nags within one.
let afterCalibration: (() => void) | null = null;
function maybeDetourToCalibration(after: () => void): boolean {
  // callers guarantee the sensors are up, so the device key is known
  if (hasCalibrationForCurrentSite() || isCalibrationDeclined()) return false;
  logEvent("calibration_detour", { site: calibrationSiteKey() });
  afterCalibration = after;
  enterCalibration();
  // mid-route-apply reflectRoute is suppressed — normalize the hash by hand
  if (location.hash !== "#/calibratge") history.replaceState(null, "", "#/calibratge");
  return true;
}

/** Open the Calibratge page and start the session. Callers guarantee the
 * sensors are up (the onboarding gate / syncReady). */
function enterCalibration(): void {
  // The hail, by name (textContent-built — a name is player input).
  const welcome = byId("calibWelcome");
  if (welcome) {
    const name = document.createElement("b");
    name.textContent = getActiveProfileName();
    welcome.replaceChildren("A coberta, tripulant ", name, "!");
  }
  moveVideoToStage();
  setScreen("calib");
  startCalibration();
  if (!isCalibrating()) {
    // sensors dropped between the gate and here — nothing to run
    moveVideoBack();
    setScreen("title");
  }
}

// ------------------------------------------------------ the rival PiP drag
// Stacked layout only: the rival's corner card drags sideways and docks to
// whichever side you fling it toward (call-app behavior); the side sticks
// across sessions. CSS owns the resting positions via [data-dock]; the drag
// itself is a transient translateX.
const PIP_DOCK_KEY = "morra_pip_dock";
function installPipDrag(): void {
  const pip = el.rivalSide;
  try { if (localStorage.getItem(PIP_DOCK_KEY) === "left") pip.dataset.dock = "left"; } catch { /* session-only */ }
  let dragging = false;
  let startX = 0;
  pip.addEventListener("pointerdown", (ev) => {
    if (!window.matchMedia("(max-width: 900px)").matches) return;
    dragging = true;
    startX = ev.clientX;
    try { pip.setPointerCapture(ev.pointerId); } catch { /* synthetic pointers have no capture */ }
  });
  pip.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    pip.style.transform = `translateX(${ev.clientX - startX}px)`;
  });
  const drop = (ev: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    const r = pip.getBoundingClientRect(); // with the drag transform still applied
    const dock = r.left + r.width / 2 < window.innerWidth / 2 ? "left" : "right";
    pip.style.transform = "";
    if (dock === "left") pip.dataset.dock = "left";
    else delete pip.dataset.dock;
    try { localStorage.setItem(PIP_DOCK_KEY, dock); } catch { /* session-only */ }
    logEvent("pip_dock", { dock, x: Math.round(ev.clientX) });
  };
  pip.addEventListener("pointerup", drop);
  pip.addEventListener("pointercancel", drop);
}

// ----------------------------------------------------------------- wiring

function syncModeDataset(mode: "partida" | "entrenament"): void {
  document.body.dataset.mode = mode;
}

export function installScreens(): void {
  // The wordmark is an image (public/wordmark.png); the authored SVG stays
  // as the fallback if the asset fails to load.
  const wordmark = byId("titleWordmark");
  const img = byId("wordmarkImg") as HTMLImageElement | null;
  if (wordmark && img) img.addEventListener("error", () => { wordmark.innerHTML = WORDMARK_SVG; }, { once: true });
  buildSelectGrid();
  installPirateChoreography();
  installOnboarding();
  installFirstRun();
  installPipDrag();

  // Els rivals guaiten: mount the peeking corsaris' art once — CSS owns
  // their rare, slow timing.
  const peekNino = byId("peekNino");
  if (peekNino) peekNino.innerHTML = artWithUniqueIds(PIRATE_ART["L1"] ?? "", "peek-nino");
  const peekBru = byId("peekBru");
  if (peekBru) peekBru.innerHTML = artWithUniqueIds(PIRATE_ART["L2"] ?? "", "peek-bru");

  // Boot: reflect the level game.ts restored, land on the title screen.
  // Deliberately NOT setScreen: its route reflection would overwrite a deep
  // link's hash with "#/" before installRouter (below) gets to read it —
  // every #/espill-on-reload landed on the title. The router applies any
  // boot hash right after the screens are mounted.
  setPirate(el.selAiLevel.value || "L1");
  document.body.dataset.mode = "partida";
  document.body.dataset.screen = "title";
  logEvent("screen_change", { screen: "title" });
  // First run (factory-fresh registry): the sign-on card over the title.
  maybeStartFirstRun();
  // Naming yourself flows straight on: same gesture through the sensor
  // gates, then onto the solo table with the calibration open — the exact
  // path the home's Calibratge link takes.
  setFirstRunNamedHook(() => {
    renderProfileControls(); // the bar shows the new name right away
    firstRunFlow = true;
    pendingCalibration = true;
    startOnboarding("entrenament");
  });
  // When a calibration session ends — Desa, Descarta or the ✕, all valid
  // ways in — the Calibratge page closes: back to the port, or, on the
  // first run, into the game (the tripulants in Partida, sensors warm, one
  // tap from the first duel).
  const calibSave = byId("calibSave");
  const calibSaveLabel = calibSave?.textContent ?? "";
  setCalibrationEndHook((outcome) => {
    moveVideoBack();
    // Anything but Desa counts as declining for this profile+camera — the
    // play detour won't re-ask this session.
    if (outcome !== "saved") markCalibrationDeclined();
    if (firstRunFlow) {
      firstRunFlow = false;
      afterCalibration = null;
      if (calibSave) calibSave.textContent = calibSaveLabel;
      logEvent("firstrun_done", { outcome, calibrated: outcome === "saved" });
      setSessionMode("partida");
      syncModeDataset("partida");
      setScreen("select");
      return;
    }
    // A detour on the way to play: continue to where they were going.
    if (afterCalibration) {
      const go = afterCalibration;
      afterCalibration = null;
      go();
      return;
    }
    // Only navigate if the page is still up (a route change that stopped
    // the session is already navigating somewhere).
    if (document.body.dataset.screen === "calib") setScreen("title");
  });

  // The home. Juga and Entrenament go through the sensor onboarding to the
  // tripulants with that intent; L'Espill opens directly (no sensors).
  // Juga → the sensor onboarding → the tripulants (choose whom to duel).
  byId("btnJuga")?.addEventListener("click", () => startOnboarding("partida"));
  byId("doorEntrena")?.addEventListener("click", () => startOnboarding("entrenament"));
  // Calibratge from the home: it needs the camera, so through the
  // onboarding (which auto-passes when the sensors are already up), then
  // onto its own page with the session running.
  byId("doorCalibra")?.addEventListener("click", () => { pendingCalibration = true; startOnboarding("entrenament"); });
  const openEspill = () => { renderEspillScreen(); setScreen("espill"); };
  byId("doorEspill")?.addEventListener("click", openEspill);
  // Classificació: the vessel's table — no sensors, straight in and out.
  byId("btnClassificacio")?.addEventListener("click", () => setScreen("classificacio"));
  byId("btnClassifBack")?.addEventListener("click", () => setScreen("title"));
  el.btnOpenEspill.addEventListener("click", openEspill);
  el.btnGoToTraining.addEventListener("click", openEspill);
  el.btnEspillBack.addEventListener("click", () => setScreen("title"));
  const toTraining = () => startOnboarding("entrenament");
  el.btnEspillTrain.addEventListener("click", toTraining);
  el.espillTabs.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest("button[data-tab]") as HTMLButtonElement | null;
    if (!b || !b.dataset.tab) return;
    selectEspillTab(b.dataset.tab);
    reflectRoute("espill", getSessionMode(), { tab: b.dataset.tab }, "replace");
  });
  setOnboardingReadyHook((t) => {
    setSessionMode(t);
    syncModeDataset(t);
    if (pendingCalibration) {
      pendingCalibration = false;
      // First run: they don't know what a profile is yet — the save button
      // says where the flow goes instead. Restored by the end hook.
      if (firstRunFlow && calibSave) calibSave.textContent = "Desa i a jugar";
      enterCalibration();
      return;
    }
    // Both intents pass through the tripulants: choose whom to duel, or
    // whom to spar with (or "sol"). The pills carry the intent there —
    // unless this profile+camera has no fit yet: Calibratge first.
    if (maybeDetourToCalibration(() => setScreen("select"))) return;
    setScreen("select");
  });

  byId("btnToTitle")?.addEventListener("click", () => setScreen("title"));
  byId("btnCanviaRival")?.addEventListener("click", () => {
    el.btnPlayAgain.click(); // existing wiring: resetGame + hide banner
    setScreen("select");
  });
  byId("btnRivalHud")?.addEventListener("click", () => setScreen("select"));

  // Keep body[data-mode] mirroring the mode buttons (additive listeners —
  // modes.ts still owns the real state).
  el.btnModePartida.addEventListener("click", () => syncModeDataset("partida"));
  el.btnModeEntrenament.addEventListener("click", () => {
    syncModeDataset("entrenament");
    // On the tripulants screen the pill is the INTENT: it stays there and the
    // cards now read "spar with…"; the route reflects it (?per=entrena).
    if (document.body.dataset.screen === "select") reflectRoute("select", "entrenament", { per: "entrena" }, "replace");
  });
  el.btnModePartida.addEventListener("click", () => {
    if (document.body.dataset.screen === "select") reflectRoute("select", "partida", { per: "duel" }, "replace");
  });

  // Level changed from anywhere else (tècnic select, seam): keep the
  // figure and the header chip in sync.
  el.selAiLevel.addEventListener("change", () => { setPirate(el.selAiLevel.value); renderRivalHud(); });

  // Routes (router.ts): back/forward, reload and deep links. A route that
  // needs the sensors (duel, entrena, tripulants) and doesn't have them
  // opens the onboarding with that target — the same card "Juga" opens.
  installRouter({
    apply: (route: Route, params: RouteParams, rival: string | null) => {
      // Nobody has signed on yet: swallow the deep link — first-run has one
      // fixed path (name → sensors → calibration), it can't land anywhere.
      if (maybeStartFirstRun()) {
        setScreen("title"); // reflectRoute is a no-op mid-apply…
        history.replaceState(null, "", "#/"); // …so normalize the hash by hand
        return;
      }
      // Navigating away from the Calibratge page mid-session (browser back,
      // a typed hash) aborts the session first — ✕ semantics.
      if (route !== "calib" && isCalibrating()) stopCalibration();
      const pickRival = (slug: string | null) => {
        if (slug === SOLO_SLUG) { setSoloTraining(true); return; }
        const level = slug ? levelForSlug(slug) : null;
        if (level) { el.selAiLevel.value = level; el.selAiLevel.dispatchEvent(new Event("change")); setPirate(level); }
        setSoloTraining(false);
      };
      // The ladder guards the routes too: a deep link to a rival you haven't
      // earned lands on the tripulants, never in the fight. Solo (and an
      // absent slug that resolves to an already-open pick) pass through.
      const routeRivalLocked = (slug: string | null): boolean => {
        if (slug === SOLO_SLUG) return false;
        const level = slug ? levelForSlug(slug) : el.selAiLevel.value;
        return !!level && !isRivalUnlocked(level, loadBeatenRivals());
      };
      switch (route) {
        case "title": setScreen("title"); break;
        case "select": {
          const intent = params.per === "entrena" ? "entrenament" : "partida";
          setSessionMode(intent); syncModeDataset(intent);
          if (!syncReady()) { startOnboarding(intent); break; }
          if (maybeDetourToCalibration(() => setScreen("select"))) break;
          setScreen("select");
          break;
        }
        case "duel": {
          if (!syncReady()) { startOnboarding("partida"); break; }
          if (routeRivalLocked(rival)) { setSessionMode("partida"); syncModeDataset("partida"); setScreen("select"); break; }
          const go = () => { pickRival(rival); setScreen("fight"); setSessionMode("partida"); syncModeDataset("partida"); applyModeLayout(); };
          if (!maybeDetourToCalibration(go)) go();
          break;
        }
        case "entrena": {
          if (!syncReady()) { startOnboarding("entrenament"); break; }
          if (routeRivalLocked(rival)) { setSessionMode("entrenament"); syncModeDataset("entrenament"); setScreen("select"); break; }
          const go = () => { pickRival(rival); setScreen("fight"); setSessionMode("entrenament"); syncModeDataset("entrenament"); applyModeLayout(); };
          if (!maybeDetourToCalibration(go)) go();
          break;
        }
        case "espill":
          renderEspillScreen();
          if (params.tab) selectEspillTab(params.tab);
          setScreen("espill");
          break;
        case "calib":
          if (isCalibrating()) break; // already on the page, mid-session
          if (syncReady()) enterCalibration();
          else { pendingCalibration = true; startOnboarding("entrenament"); }
          break;
        case "classificacio":
          setScreen("classificacio"); // renders on entry; no sensors needed
          break;
      }
    },
  });
  // Backing out of the onboarding card leaves the URL on the title — and
  // drops any calibration still pending behind it, so the next "Juga"
  // doesn't detour onto the solo table.
  byId("obBack")?.addEventListener("click", () => {
    pendingCalibration = false;
    if (firstRunFlow) {
      // Signed on but stepped off the gangplank before calibrating (a
      // denied camera, cold feet): the port is theirs anyway.
      firstRunFlow = false;
      logEvent("firstrun_done", { outcome: "backed-out", calibrated: false });
    }
    reflectRoute("title", getSessionMode(), {}, "replace");
  });
}
