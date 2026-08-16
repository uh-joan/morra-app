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
import { PIRATES, type Pirate } from "./pirate/cast.js";
import { artWithUniqueIds, PIRATE_ART, WORDMARK_SVG } from "./pirate/art.js";
import { setPirate, installPirateChoreography } from "./pirate/render.js";
import { installOnboarding, setOnboardingReadyHook, startOnboarding } from "./onboarding.js";

export type Screen = "title" | "select" | "fight";

export function setScreen(s: Screen): void {
  document.body.dataset.screen = s;
  logEvent("screen_change", { screen: s });
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
  stage.textContent = "⚓ " + p.stageName;
  const core = document.createElement("div");
  core.className = "card-core";
  core.textContent = LEVELS[p.levelId]?.name ?? p.levelId;
  card.append(rankPips(p.rank), portrait, name, title, flavor, stage, core);
  card.addEventListener("click", () => chooseRival(p));
  return card;
}

function buildSelectGrid(): void {
  const grid = byId("selectGrid");
  if (!grid) return;
  grid.replaceChildren(...PIRATES.map(buildCard));
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
  setScreen("fight");
  setSessionMode("partida");
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

  byId("btnJuga")?.addEventListener("click", () => startOnboarding("partida"));
  byId("btnEspillTitle")?.addEventListener("click", () => startOnboarding("entrenament"));
  setOnboardingReadyHook((t) => {
    if (t === "entrenament") {
      setScreen("fight");
      setSessionMode("entrenament");
      syncModeDataset("entrenament");
    } else {
      setScreen("select");
    }
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
  el.btnModeEntrenament.addEventListener("click", () => syncModeDataset("entrenament"));
  el.btnGoToTraining.addEventListener("click", () => syncModeDataset("entrenament"));

  // Level changed from anywhere else (tècnic select, seam): keep the
  // figure in sync.
  el.selAiLevel.addEventListener("change", () => setPirate(el.selAiLevel.value));
}
