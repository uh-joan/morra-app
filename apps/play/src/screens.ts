// screens.ts — the screen flow of the pirate skin: title → (onboarding) →
// character select → fight, plus the VS splash and the end-of-match
// overlay's extra navigation. Pure presentation state: one body[data-*]
// attribute drives ALL visibility via CSS; game/mode/level state stays
// owned by game.ts/modes.ts — this module only pushes the same buttons a
// player could (selAiLevel change, btnPlayAgain click, setSessionMode).

import { computeTopTells, LEVELS, toHistoryArray } from "@morra/core";
import { getPlayerModel } from "./game.js";
import { HOME_TEXT } from "./game/copy.js";
import { el } from "./dom.js";
import { logEvent } from "./telemetry.js";
import { setSessionMode } from "./modes.js";
import { PIRATES, type Pirate } from "./pirate/cast.js";
import { artWithUniqueIds, PIRATE_ART, WORDMARK_SVG } from "./pirate/art.js";
import { setPirate, installPirateChoreography } from "./pirate/render.js";
import { installOnboarding, setOnboardingReadyHook, startOnboarding } from "./onboarding.js";
import { queueMission, renderEspillScreen } from "./training.js";
import { getSessionMode } from "./game.js";
import { syncReady } from "./analysis.js";
import { installRouter, reflectRoute, type Route, type RouteParams } from "./router.js";
import { isSoloTraining, levelForSlug, setSoloTraining, slugForLevel, SOLO_SLUG } from "./rivalState.js";
import { applyModeLayout } from "./modes.js";
import { getLastTopTell } from "./render/training.js";
import { missionForTell } from "@morra/core";

export type Screen = "title" | "select" | "fight" | "espill";

export function setScreen(s: Screen): void {
  document.body.dataset.screen = s;
  logEvent("screen_change", { screen: s });
  if (s === "title") setTimeout(renderHome, 0); // the rival at the table, after first paint
  reflectRoute(s, getSessionMode(), routeParamsFor(s), "push", currentRivalSlug());
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

// ------------------------------------------------------- the home
// The rival is already at the table: the pirate you'll face (the last one
// you duelled, or Nino), his nameplate, and a speech bubble — if the mirror
// knows you, he taunts you with your own tell; otherwise his greeting. One
// CTA: Juga → that table, straight (the tripulants only if you ask).
let homeRival: Pirate = PIRATES[0]!;
let quickPlay = false; // Juga pressed: the ready hook goes to homeRival's table, not the select
function pickHomeRival(): Pirate {
  const hist = toHistoryArray(getPlayerModel());
  const lastDuel = [...hist].reverse().find((h) => h.source !== "entrenament" && h.aiLevel);
  // last one duelled → else the currently-selected level → else Nino
  const level = lastDuel?.aiLevel ?? el.selAiLevel.value ?? "L1";
  return PIRATES.find((p) => p.levelId === level) ?? PIRATES[0]!;
}
function renderHome(): void {
  // (the character at the table is parked — the wordmark carries the home)
  homeRival = pickHomeRival();
  const vs = byId("homeVs");
  if (vs) vs.textContent = HOME_TEXT.vs(homeRival.name);
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

function buildCard(p: Pirate): HTMLButtonElement {
  const card = document.createElement("button");
  card.type = "button";
  card.id = "pirateCard-" + p.levelId;
  card.className = "pirate-card stage-" + p.stageId;
  const portrait = document.createElement("div");
  portrait.className = "card-portrait";
  portrait.innerHTML = artWithUniqueIds(PIRATE_ART[p.levelId] ?? "", "card-" + p.levelId); // constant authored art
  const name = document.createElement("div");
  name.className = "card-name";
  name.textContent = p.name;
  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = p.title;
  const flavor = document.createElement("div");
  flavor.className = "card-flavor";
  flavor.textContent = p.flavor;
  const stage = document.createElement("div");
  stage.className = "card-stage";
  stage.textContent = p.stageName;
  const core = document.createElement("div");
  core.className = "card-core";
  core.textContent = LEVELS[p.levelId]?.name ?? p.levelId;
  card.append(rankPips(p.rank), portrait, name, title, flavor, stage, core);
  card.addEventListener("click", () => chooseRival(p));
  return card;
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
  grid.replaceChildren(...PIRATES.map(buildCard), buildSoloCard()); // the solo card shows in Entrenament only (CSS)
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
function chooseSolo(): void {
  setSoloTraining(true);
  logEvent("rival_chosen", { level: null, solo: true });
  setSessionMode("entrenament");
  setScreen("fight");
  applyModeLayout();
}

// ----------------------------------------------------------------- wiring

function syncModeDataset(mode: "partida" | "entrenament"): void {
  document.body.dataset.mode = mode;
}

export function installScreens(): void {
  const wordmark = byId("titleWordmark");
  if (wordmark) wordmark.innerHTML = WORDMARK_SVG; // constant authored art
  buildSelectGrid();
  installPirateChoreography();
  installOnboarding();

  // Boot: reflect the level game.ts restored, land on the title screen.
  setPirate(el.selAiLevel.value || "L1");
  document.body.dataset.mode = "partida";
  setScreen("title");

  // The home. Juga → the sensor onboarding, then straight to homeRival's
  // table (quick play); "canvia de rival" → the tripulants; Entrenament →
  // the tripulants with that intent; L'Espill opens directly (no sensors).
  byId("btnJuga")?.addEventListener("click", () => { quickPlay = true; startOnboarding("partida"); });
  byId("btnHomeChange")?.addEventListener("click", () => { quickPlay = false; startOnboarding("partida"); });
  byId("doorEntrena")?.addEventListener("click", () => { quickPlay = false; startOnboarding("entrenament"); });
  const openEspill = () => { renderEspillScreen(); setScreen("espill"); };
  byId("doorEspill")?.addEventListener("click", openEspill);
  el.btnOpenEspill.addEventListener("click", openEspill);
  el.btnGoToTraining.addEventListener("click", openEspill);
  el.btnEspillBack.addEventListener("click", () => setScreen("title"));
  const toTraining = () => startOnboarding("entrenament");
  el.btnEspillTrain.addEventListener("click", toTraining);
  // "Practica-ho": queue the mission for the coach card's tell, then Entrenament
  el.btnPractica.addEventListener("click", () => { queueMission(missionForTell(getLastTopTell())); toTraining(); });
  el.btnMoreTells.addEventListener("click", () => {
    const open = el.tellsList.hasAttribute("hidden");
    el.tellsList.toggleAttribute("hidden", !open);
    el.btnMoreTells.textContent = open ? "Els altres defectes ▴" : "Els altres defectes ▾";
  });
  el.espillTabs.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest("button[data-tab]") as HTMLButtonElement | null;
    if (!b || !b.dataset.tab) return;
    selectEspillTab(b.dataset.tab);
    reflectRoute("espill", getSessionMode(), { tab: b.dataset.tab }, "replace");
  });
  setOnboardingReadyHook((t) => {
    setSessionMode(t);
    syncModeDataset(t);
    // Juga from the home: straight to the table shown there. Everything
    // else passes through the tripulants: choose whom to duel, or whom to
    // spar with (or "sol"). The pills carry the intent there.
    if (t === "partida" && quickPlay) { quickPlay = false; chooseRival(homeRival); return; }
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
  // figure in sync.
  el.selAiLevel.addEventListener("change", () => setPirate(el.selAiLevel.value));

  // Routes (router.ts): back/forward, reload and deep links. A route that
  // needs the sensors (duel, entrena, tripulants) and doesn't have them
  // opens the onboarding with that target — the same card "Juga" opens.
  installRouter({
    apply: (route: Route, params: RouteParams, rival: string | null) => {
      const pickRival = (slug: string | null) => {
        if (slug === SOLO_SLUG) { setSoloTraining(true); return; }
        const level = slug ? levelForSlug(slug) : null;
        if (level) { el.selAiLevel.value = level; el.selAiLevel.dispatchEvent(new Event("change")); setPirate(level); }
        setSoloTraining(false);
      };
      switch (route) {
        case "title": setScreen("title"); break;
        case "select": {
          const intent = params.per === "entrena" ? "entrenament" : "partida";
          setSessionMode(intent); syncModeDataset(intent);
          if (syncReady()) setScreen("select"); else startOnboarding(intent);
          break;
        }
        case "duel":
          if (syncReady()) { pickRival(rival); setScreen("fight"); setSessionMode("partida"); syncModeDataset("partida"); applyModeLayout(); }
          else startOnboarding("partida");
          break;
        case "entrena":
          if (syncReady()) { pickRival(rival); setScreen("fight"); setSessionMode("entrenament"); syncModeDataset("entrenament"); applyModeLayout(); }
          else startOnboarding("entrenament");
          break;
        case "espill":
          renderEspillScreen();
          if (params.tab) selectEspillTab(params.tab);
          setScreen("espill");
          break;
      }
    },
  });
  // Backing out of the onboarding card leaves the URL on the title.
  byId("obBack")?.addEventListener("click", () => reflectRoute("title", getSessionMode(), {}, "replace"));
}
