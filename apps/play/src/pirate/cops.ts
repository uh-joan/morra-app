// pirate/cops.ts — «Cops amb nom»: One Piece-style verdict choreography
// (docs/cops-amb-nom-2026-08-25.md). Every round verdict is a NAMED move —
// the Gomu-Gomu insight: the shouted name IS the celebration. This module
// owns the names (pure, unit-tested) and the DOM choreography (impact
// flash, name slam, speed lines, screen shake, coin flight).
//
// Layering doctrine (same as pirate/render.ts): pure visual after-effects
// over DOM the game already wrote. Nothing here is awaited, nothing touches
// game logic or the timing layer — if performCop did nothing, the game
// would play identically. The verdict banner stays the semantic source of
// truth; this is the punch on top.

import { artWithUniqueIds, PIRATE_ART } from "./art.js";

export type CopKind = "guanyes" | "perds" | "empat" | "ningu";

/** Your finisher. One name whoever the rival is (v1; per-player names are
 * a later idea). Draft names — the user is the ground truth on Catalan.
 * 2026-08-25 field verdict: «BORDADA» read "super super weird" — removed;
 * «PUNT!» is the plain table shout. */
export const COP_DEL_GRUMET = "PUNT!";

/** Each corsari's signature move, One Piece style: the pattern is
 * per-character, like «Gomu Gomu no ___» is Luffy's alone. */
export const COP_DEL_CORSARI: Record<string, string> = {
  L1: "GANXO!", // Nino — the tavern hook
  L2: "COP DE TIMÓ!", // Bru — the helm swings
  L3: "TALL DE MAREA!", // Mercè — the tide cuts
  L4: "L'ONADA NEGRA", // El Rei — no exclamation; the deep doesn't shout
};

/** The tie wears two faces (asymmetric on purpose): a CLASH when both
 * guessed, a DEFLATION when nobody did. */
export const COP_EMPAT = "EMPAT!";
export const COP_NINGU = "PER A NINGÚ";

/** The slammed name for a verdict. Pure — unit-tested. */
export function copName(kind: CopKind, levelId?: string | null): string {
  switch (kind) {
    case "guanyes": return COP_DEL_GRUMET;
    case "perds": return (levelId && COP_DEL_CORSARI[levelId]) || "COP DE CORSARI!";
    case "empat": return COP_EMPAT;
    case "ningu": return COP_NINGU;
  }
}

/** The match-end shout. Plain register (the BORDADA lesson): you win the
 * PARTIDA; a corsair finishes you with his own signature move. Pure. */
export const COP_FINAL_GRUMET = "PARTIDA!";
export function finalCopName(playerWon: boolean, levelId?: string | null): string {
  return playerWon ? COP_FINAL_GRUMET : copName("perds", levelId);
}

// ------------------------------------------------------------ choreography

function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ~24 radial manga speed lines, jittered lengths, drawn once per burst.
// currentColor so the palette rides on .cop-linies[data-cop].
function speedLinesSvg(): string {
  const lines: string[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + (i % 3) * 0.05;
    const r0 = 34 + (i % 4) * 5; // inner gap — the subject stays clear
    const r1 = 62 + ((i * 7) % 11); // outer reach, jittered
    const x0 = 50 + Math.cos(a) * r0, y0 = 50 + Math.sin(a) * r0;
    const x1 = 50 + Math.cos(a) * r1, y1 = 50 + Math.sin(a) * r1;
    const w = i % 5 === 0 ? 2.2 : 1.1;
    lines.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke-width="${w}"/>`);
  }
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g stroke="currentColor" stroke-linecap="round">${lines.join("")}</g></svg>`;
}

let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

/** Play the named-move choreography for a verdict. Fire and forget. */
export function performCop(kind: CopKind, levelId?: string | null): void {
  if (reducedMotion()) return; // the banner already says everything
  const stage = document.getElementById("moveStage");
  if (!stage) return;

  // A new round's cop preempts a stale one cleanly.
  if (cleanupTimer) clearTimeout(cleanupTimer);
  stage.replaceChildren();

  // One voice only (field verdict 2026-08-25, round 2): on a cop verdict
  // the old banner is hidden entirely — the slam IS the verdict on screen.
  // Visual-only (display:none via .amb-cop): textContent + [hidden] stay
  // untouched for the harness and a11y. banner() resets className every
  // render, so the class self-cleans; void rounds (no cop) keep the banner.
  document.getElementById("verdictBanner")?.classList.add("amb-cop");

  // Impact flash — the fake hit-stop. Double flash on a hit, a single
  // spark on a clash, nothing on the deflation.
  if (kind === "guanyes" || kind === "perds" || kind === "empat") {
    const flash = document.createElement("div");
    flash.className = "cop-impacte" + (kind === "empat" ? " una" : "");
    stage.appendChild(flash);
  }

  // Radial speed lines converge on the stage (not for the deflation).
  if (kind !== "ningu") {
    const linies = document.createElement("div");
    linies.className = "cop-linies";
    linies.dataset.cop = kind;
    linies.innerHTML = speedLinesSvg(); // constant authored art — no data
    stage.appendChild(linies);
  }

  // The name, slammed.
  const nom = document.createElement("div");
  nom.className = "cop-nom";
  nom.dataset.cop = kind;
  nom.textContent = copName(kind, levelId);
  stage.appendChild(nom);

  // Screen shake only when something actually LANDED.
  if (kind === "guanyes" || kind === "perds") {
    const arena = document.querySelector(".arena");
    if (arena) {
      arena.classList.remove("cop-tremolor");
      void (arena as HTMLElement).offsetWidth; // restart the animation
      arena.classList.add("cop-tremolor");
    }
  }

  cleanupTimer = setTimeout(() => {
    stage.replaceChildren();
    document.querySelector(".arena")?.classList.remove("cop-tremolor");
    cleanupTimer = null;
  }, 1300);
}

/** A doblo flies from the stage to the freshly-earned coin slot (Web
 * Animations API — self-cleaning). Called by renderCoins on a new fill. */
export function flyCoin(target: Element): void {
  if (reducedMotion()) return;
  const stage = document.getElementById("moveStage");
  const from = (stage ?? document.querySelector(".video-wrap"))?.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (!from || !to.width) return; // strip hidden (entrenament) — no flight
  const fly = document.createElement("div");
  fly.className = "coin-fly";
  document.body.appendChild(fly);
  const x0 = from.left + from.width / 2, y0 = from.top + from.height / 2;
  const x1 = to.left + to.width / 2, y1 = to.top + to.height / 2;
  const anim = fly.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(2.4)`, opacity: 0.95 },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 36}px) scale(1.5)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px) scale(1)`, opacity: 1 },
    ],
    { duration: 480, easing: "cubic-bezier(.3,.7,.4,1)", delay: 260, fill: "backwards" }
  );
  const done = () => fly.remove();
  anim.onfinish = done;
  anim.oncancel = done;
}

// ------------------------------------------------- the FINALE (phase 2)
// Match end takes the WHOLE screen: triple impact flash, a diagonal cut-in
// band (the fighting-game super-move grammar), and — on your win only —
// the «DON!!» stamp and a rain of doblons. On a loss the corsair's
// portrait rides the band with his signature move. All pointer-events:
// none — the game-end banner's buttons stay clickable underneath.

let finalTimer: ReturnType<typeof setTimeout> | null = null;

export function performCopFinal(playerWon: boolean, levelId?: string | null): void {
  if (reducedMotion()) return;
  document.querySelector(".cop-final")?.remove();
  if (finalTimer) clearTimeout(finalTimer);
  // the last round's own cop yields the stage — one thunder at a time
  document.getElementById("moveStage")?.replaceChildren();

  const overlay = document.createElement("div");
  overlay.className = "cop-final " + (playerWon ? "final-guanyes" : "final-perds");

  const flash = document.createElement("div");
  flash.className = "cop-final-impacte";
  overlay.appendChild(flash);

  const band = document.createElement("div");
  band.className = "cop-final-band";
  if (!playerWon && levelId && PIRATE_ART[levelId]) {
    const portrait = document.createElement("div");
    portrait.className = "cop-final-portrait";
    portrait.innerHTML = artWithUniqueIds(PIRATE_ART[levelId], "final"); // constant authored art — no data
    band.appendChild(portrait);
  }
  const nom = document.createElement("div");
  nom.className = "cop-final-nom";
  nom.textContent = finalCopName(playerWon, levelId);
  band.appendChild(nom);
  overlay.appendChild(band);

  if (playerWon) {
    const don = document.createElement("div");
    don.className = "cop-final-don";
    don.textContent = "DON!!";
    overlay.appendChild(don);
    const rain = document.createElement("div");
    rain.className = "cop-final-rain";
    for (let i = 0; i < 14; i++) {
      const c = document.createElement("i");
      c.style.left = `${(i * 7.3 + 4) % 100}%`;
      c.style.animationDelay = `${(i % 7) * 0.09 + 0.4}s`;
      c.style.animationDuration = `${1 + (i % 4) * 0.18}s`;
      rain.appendChild(c);
    }
    overlay.appendChild(rain);
  }

  document.body.appendChild(overlay);
  finalTimer = setTimeout(() => {
    overlay.remove();
    finalTimer = null;
  }, 2600);
}

// Match point: one warning drum — a single impact frame the moment either
// side reaches the brink (rising edge only; the strip's glow does the rest).
let wasMatchPoint = false;

export function matchPointDrum(isMatchPoint: boolean): void {
  const rising = isMatchPoint && !wasMatchPoint;
  wasMatchPoint = isMatchPoint;
  if (!rising || reducedMotion()) return;
  const stage = document.getElementById("moveStage");
  if (!stage) return;
  const drum = document.createElement("div");
  drum.className = "cop-impacte una";
  stage.appendChild(drum);
  setTimeout(() => drum.remove(), 400);
}
