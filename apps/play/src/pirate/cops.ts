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

export type CopKind = "guanyes" | "perds" | "empat" | "ningu";

/** Your finisher — the broadside. One name whoever the rival is (v1;
 * per-player names are a later idea). Draft names — the user is the
 * ground truth on Catalan and renames after feeling them in-game. */
export const COP_DEL_GRUMET = "BORDADA!";

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
