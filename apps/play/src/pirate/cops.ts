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
  L1: "PLAM!", // Nino — the tavern smack (field verdict 2026-08-25: «ganxo» out)
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

// EMPAT: two cutlasses cross and a spark pops at the bite point — a clash
// has energy but no winner. Constant authored art.
const SABRES_SVG = `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <g stroke-linecap="round" fill="none">
    <path class="cs-blade" d="M22 84 L72 30 M72 30 Q76 24 74 18" stroke="#cdd6e0" stroke-width="4.5"/>
    <path d="M28 78 q-7 7 -2 12 q6 4 11 -3" stroke="#8a6a1f" stroke-width="3.5"/>
    <path class="cs-blade" d="M78 84 L28 30 M28 30 Q24 24 26 18" stroke="#b9c4d2" stroke-width="4.5"/>
    <path d="M72 78 q7 7 2 12 q-6 4 -11 -3" stroke="#8a6a1f" stroke-width="3.5"/>
  </g>
  <g class="cs-spark" fill="#ffe9a8">
    <polygon points="50,40 52.5,50 62,52 52.5,54 50,64 47.5,54 38,52 47.5,50"/>
  </g>
</svg>`;

// PER A NINGÚ: the sea sweeps in and keeps the coin. Two foam humps
// crossing the stage bottom, translucent. Constant authored art.
const ONADA_SVG = `<svg viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 26 Q12 14 25 26 T50 26 T75 26 T100 26 T125 26 T150 26 T175 26 T200 26 L200 40 L0 40 Z" fill="rgba(191,227,224,.28)"/>
  <path d="M0 32 Q15 22 30 32 T60 32 T90 32 T120 32 T150 32 T180 32 T210 32 L210 40 L0 40 Z" fill="rgba(95,140,160,.38)"/>
</svg>`;

// GUANYES: your punt lands ON the corsair — a cartoon llamp cracks down
// over his figure. Child-friendly by design (2026-08-27): chunky bolt,
// warm yellows, star sparks — playful, never menacing. Constant authored art.
const LLAMP_SVG = `<svg viewBox="0 0 100 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <circle class="ll-glow" cx="30" cy="118" r="30" fill="#ffe9a8"/>
  <path class="ll-bolt" d="M62 4 L24 66 L44 66 L20 126 L80 52 L56 52 L88 4 Z" fill="#ffd94a" stroke="#b97e10" stroke-width="4" stroke-linejoin="round"/>
  <g class="ll-espurnes" fill="#fff3c4">
    <polygon points="24,112 27,121 36,124 27,127 24,136 21,127 12,124 21,121"/>
    <polygon points="58,124 60,130 66,132 60,134 58,140 56,134 50,132 56,130"/>
  </g>
</svg>`;

// PERDS is per-corsair: the blow that lands on you IS his named move made
// literal. Same child-friendly register as the llamp throughout (2026-08-27
// audience note: children play this). Constant authored art.
// L1 Nino «PLAM!»: the tavern smack — a big cartoon palm slaps straight
// into the camera, impact star behind it.
const MA_PLAM_SVG = `<svg viewBox="0 0 100 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <polygon class="mp-estrella" points="50,2 60,36 94,26 68,52 98,72 62,68 66,104 46,74 22,98 32,62 2,54 36,46" fill="#ffe9a8"/>
  <g class="mp-ma" fill="#eec39a" stroke="#8a5a30" stroke-width="3.5" stroke-linejoin="round">
    <rect x="29" y="18" width="13" height="48" rx="6.5"/>
    <rect x="44" y="11" width="13" height="54" rx="6.5"/>
    <rect x="59" y="16" width="13" height="50" rx="6.5"/>
    <rect x="73" y="30" width="11" height="38" rx="5.5"/>
    <rect x="10" y="58" width="14" height="34" rx="7" transform="rotate(38 17 75)"/>
    <ellipse cx="52" cy="80" rx="29" ry="26"/>
  </g>
</svg>`;

// L2 Bru «COP DE TIMÓ!»: the helm swings — a chunky wooden ship's wheel
// spins in from his side, whacks center-frame (star pop + wobble), spins
// off. Eight handles, brass hub, wood two-tone.
const TIMO_SVG = `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <polygon class="tb-estrella" points="50,4 59,34 88,22 66,48 96,58 64,62 70,96 50,70 30,96 36,62 4,58 34,48" fill="#ffe9a8"/>
  <g class="tb-roda">
    <g fill="#b98a4e" stroke="#6e4a1f" stroke-width="3">
      <rect x="47" y="1" width="6" height="16" rx="3"/>
      <rect x="47" y="1" width="6" height="16" rx="3" transform="rotate(45 50 50)"/>
      <rect x="47" y="1" width="6" height="16" rx="3" transform="rotate(90 50 50)"/>
      <rect x="47" y="1" width="6" height="16" rx="3" transform="rotate(135 50 50)"/>
      <rect x="47" y="1" width="6" height="16" rx="3" transform="rotate(180 50 50)"/>
      <rect x="47" y="1" width="6" height="16" rx="3" transform="rotate(225 50 50)"/>
      <rect x="47" y="1" width="6" height="16" rx="3" transform="rotate(270 50 50)"/>
      <rect x="47" y="1" width="6" height="16" rx="3" transform="rotate(315 50 50)"/>
    </g>
    <circle cx="50" cy="50" r="32" fill="none" stroke="#b98a4e" stroke-width="10"/>
    <circle cx="50" cy="50" r="37" fill="none" stroke="#6e4a1f" stroke-width="2.5"/>
    <circle cx="50" cy="50" r="27" fill="none" stroke="#6e4a1f" stroke-width="2.5"/>
    <g stroke="#b98a4e" stroke-width="5" stroke-linecap="round">
      <line x1="50" y1="40" x2="50" y2="28"/><line x1="50" y1="60" x2="50" y2="72"/>
      <line x1="40" y1="50" x2="28" y2="50"/><line x1="60" y1="50" x2="72" y2="50"/>
      <line x1="43" y1="43" x2="34" y2="34"/><line x1="57" y1="57" x2="66" y2="66"/>
      <line x1="57" y1="43" x2="66" y2="34"/><line x1="43" y1="57" x2="34" y2="66"/>
    </g>
    <circle cx="50" cy="50" r="10" fill="#e0b64f" stroke="#6e4a1f" stroke-width="3"/>
  </g>
</svg>`;

// L3 Mercè «TALL DE MAREA!»: the tide cuts — a curling water blade sweeps
// across the stage, the cut line it leaves flashes foam-white, spray pops
// where it exits. Three layers, one markup string.
const MAREA_SVG = `<svg class="tm-ona" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <path d="M104 4 C36 18 36 82 104 96 C66 82 66 18 104 4 Z" fill="#4f8fae" stroke="#2e5a72" stroke-width="4" stroke-linejoin="round"/>
  <path d="M100 14 C64 26 64 74 100 86" fill="none" stroke="#7fb7cf" stroke-width="3.5" stroke-linecap="round"/>
  <g fill="#eafffb" stroke="#2e5a72" stroke-width="3">
    <circle cx="48" cy="50" r="9"/>
    <circle cx="54" cy="30" r="7"/>
    <circle cx="54" cy="70" r="7"/>
    <circle cx="68" cy="14" r="5"/>
    <circle cx="68" cy="86" r="5"/>
  </g>
</svg>
<div class="tm-tall"></div>
<svg class="tm-esquitxos" viewBox="0 0 80 60" aria-hidden="true">
  <g fill="#eafffb">
    <circle cx="16" cy="22" r="5"/>
    <circle cx="36" cy="10" r="4"/>
    <circle cx="52" cy="26" r="3.5"/>
    <circle cx="28" cy="40" r="4.5"/>
    <circle cx="60" cy="44" r="3"/>
  </g>
</svg>`;

// L4 El Rei «L'ONADA NEGRA»: the deep doesn't shout — no star, no whack:
// a dark swell rises from below, swallows the stage bottom, sways once and
// pulls back with the punt. Same hump grammar as ONADA_SVG, deep-water dark.
const ONADA_NEGRA_SVG = `<svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 22 Q12 10 25 22 T50 22 T75 22 T100 22 T125 22 T150 22 T175 22 T200 22 L200 60 L0 60 Z" fill="rgba(13,27,38,.92)"/>
  <path d="M0 22 Q12 10 25 22 T50 22 T75 22 T100 22 T125 22 T150 22 T175 22 T200 22" fill="none" stroke="rgba(191,227,224,.35)" stroke-width="2.5"/>
  <path d="M0 32 Q15 20 30 32 T60 32 T90 32 T120 32 T150 32 T180 32 T210 32 L210 60 L0 60 Z" fill="rgba(9,16,25,.96)"/>
</svg>`;

/** Every corsair's blow, authored. */
const COP_CORSARI_FX: Record<string, { cls: string; svg: string }> = {
  L1: { cls: "cop-plam", svg: MA_PLAM_SVG },
  L2: { cls: "cop-timo", svg: TIMO_SVG },
  L3: { cls: "cop-marea", svg: MAREA_SVG },
  L4: { cls: "cop-onadanegra", svg: ONADA_NEGRA_SVG },
};

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

  // The clash: crossed cutlasses + spark behind the EMPAT slam.
  if (kind === "empat") {
    const sabres = document.createElement("div");
    sabres.className = "cop-sabres";
    sabres.innerHTML = SABRES_SVG; // constant authored art — no data
    stage.appendChild(sabres);
  }

  // The deflation: the sea sweeps the stage bottom and keeps the coin.
  if (kind === "ningu") {
    const onada = document.createElement("div");
    onada.className = "cop-onada";
    onada.innerHTML = ONADA_SVG; // constant authored art — no data
    stage.appendChild(onada);
  }

  // The rival's blow lands: his figure smear-lunges toward your side
  // (mirrored when the PiP is docked left — style.css owns the direction).
  if (kind === "perds") {
    const frame = document.getElementById("rivalFigureFrame");
    if (frame) {
      frame.classList.remove("cop-lunge");
      void frame.offsetWidth; // restart the animation
      frame.classList.add("cop-lunge");
      setTimeout(() => frame.classList.remove("cop-lunge"), 700);
    }
    // His named move, made literal on your stage.
    const fx = COP_CORSARI_FX[levelId ?? ""];
    if (fx) {
      const el = document.createElement("div");
      el.className = fx.cls;
      el.innerHTML = fx.svg; // constant authored art — no data
      stage.appendChild(el);
    }
  }

  // Your blow lands: a llamp cracks down over the corsair's figure and his
  // frame shivers under it (the shiver displaces render.ts's react-lose
  // grumble while it runs; the grumble restarts fresh after) — the mirror
  // of his cop-lunge when he scores.
  if (kind === "guanyes") {
    const frame = document.getElementById("rivalFigureFrame");
    if (frame) {
      frame.querySelector(".cop-llamp")?.remove();
      const llamp = document.createElement("div");
      llamp.className = "cop-llamp";
      llamp.innerHTML = LLAMP_SVG; // constant authored art — no data
      frame.appendChild(llamp);
      frame.classList.remove("cop-espurneig");
      void frame.offsetWidth; // restart the animation
      frame.classList.add("cop-espurneig");
      setTimeout(() => {
        llamp.remove();
        frame.classList.remove("cop-espurneig");
      }, 800);
    }
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
// the «BUM!» stamp (Oda's DON!!, said in Catalan — field verdict
// 2026-08-25: the manga syllable doesn't land here) and a rain of
// doblons. On a loss the corsair's
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
    don.textContent = "BUM!";
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
