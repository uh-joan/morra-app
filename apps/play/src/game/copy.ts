// copy.ts — the literal Catalan UI strings from spikes/s03-beat.html,
// centralized so the render layer stays a thin projection (render this
// text, don't compose it) and so a future i18n pass has one place to touch.
// Every string here is DEAD TEXT (a template with numbers substituted in) —
// only ever rendered via textContent, never HTML interpolation. Salvaged
// from apps/web (verbatim spike port); SyncOutcome now derives from
// @morra/core's SyncClassification instead of the deleted gameStore.
import type { SyncClassification } from "@morra/core";

export type SyncOutcome = SyncClassification["outcome"];

export const READY_PILL_TEXT = {
  analyzing: "Reading your throw…",
  armed: "Llest — tira!",
  notArmed: "Torna al puny…",
} as const;

export const COACH_HINT = "Torna al puny entre cops! (return to a fist between throws)";

export function roundResultText(
  phase: "idle" | "analyzing" | "incomplete" | "void" | "player" | "ai" | "parata"
): string {
  switch (phase) {
    case "idle": return "–";
    case "analyzing": return "…";
    case "incomplete": return "INCOMPLETE — try again";
    case "void": return "RONDA ANUL·LADA";
    case "player": return "TU GUANYES!";
    case "ai": return "RIVAL GUANYA";
    case "parata": return "PARATA";
  }
}

// step 8's SYNC_OUTCOME_VOID_REASON — why a round with a phase-1 reveal
// still got voided.
export const SYNC_OUTCOME_VOID_REASON: Partial<Record<SyncOutcome, string>> = {
  "voice-late": "you called it too late",
  "voice-early": "too early",
  "hand-only": "no call word heard",
};

export function voidDetail(outcome: SyncOutcome): string {
  const reason = SYNC_OUTCOME_VOID_REASON[outcome] ?? "no hand onset seen";
  return `${reason} — torna-hi (el rival ja ha fet una nova aposta)`;
}

export const SCOREBOARD_TEXT = (player: number, ai: number): string => `Tu ${player} — ${ai} Rival`;

export const GAME_END_TEXT = (winner: "player" | "ai", playerScore: number, aiScore: number): string =>
  winner === "player" ? `Has guanyat ${playerScore}-${aiScore}!` : `Ha guanyat el rival ${aiScore}-${playerScore}.`;

export const GO_TO_TRAINING = "Ves a Entrenament per l'anàlisi completa";
export const PLAY_AGAIN = "Torna a jugar";

export const AI_COMMIT_STATUS = {
  committed: (hash8: string): string => `Opponent committed: ${hash8}`,
  verified: (hash8: string): string => `Opponent committed: ${hash8} ✓`,
  verifyFailed: "✗ VERIFY FAILED",
  gameOver: "Partit acabat.",
};

export const TRAINING_PANEL_TEXT = {
  headlineExploitability: "Explotabilitat",
  headlineRandomness: "Aleatorietat",
  headlineSyncRate: "Sincronia",
  headlineMedianDelta: "Δ mediana",
  yourNumbers: "Els teus números",
  fHistogram: "Dits (f)",
  gHistogram: "Endevinalles (g)",
  topWords: "Crits més usats",
  tellsHeading: "Els teus defectes",
  tellsEmpty: "Encara no hi ha prou dades — tira una mica més.",
  bigramHeading: "Seqüència — després de tirar X, tires Y",
  exportButton: "Exporta perfil (JSON)",
  resetButton: "Reinicia perfil",
  resetConfirm: "Esborrar tot el teu perfil (totes les sessions)? Això no es pot desfer.",
  scopeSession: "Aquesta sessió",
  scopeAllTime: "Tot el temps",
} as const;

export const MODE_BUTTONS = { partida: "Partida", entrenament: "Entrenament" } as const;

// AI level avatar glyphs, from the spike's 4-level selector.
export const AI_LEVEL_AVATAR: Record<string, string> = { L1: "🙂", L2: "🧔", L3: "🧙", L4: "👹" };
