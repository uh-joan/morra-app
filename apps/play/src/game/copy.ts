// copy.ts — the Catalan UI strings, centralized so the render layer stays a
// thin projection (render this text, don't compose it) and so a future i18n
// pass has one place to touch. Every string here is DEAD TEXT (a template
// with numbers substituted in) — only ever rendered via textContent, never
// HTML interpolation. ux-pirates: the English remnants inherited from the
// spike are now Catalan too. FROZEN strings (asserted by the parity/
// integration harnesses against the untouched spike): "RONDA ANUL·LADA",
// "TU GUANYES!", "RIVAL GUANYA", "PARATA", the scoreboard format
// "Tu N — M Rival", and AI_COMMIT_STATUS's "Opponent committed:" line.
import type { SyncClassification } from "@morra/core";

export type SyncOutcome = SyncClassification["outcome"];

export const READY_PILL_TEXT = {
  analyzing: "Llegint la tirada…",
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
    case "incomplete": return "INCOMPLETA — torna-hi";
    case "void": return "RONDA ANUL·LADA";
    case "player": return "TU GUANYES!";
    case "ai": return "RIVAL GUANYA";
    case "parata": return "PARATA";
  }
}

// step 8's SYNC_OUTCOME_VOID_REASON — why a round with a phase-1 reveal
// still got voided.
export const SYNC_OUTCOME_VOID_REASON: Partial<Record<SyncOutcome, string>> = {
  "voice-late": "has cantat massa tard",
  "voice-early": "massa aviat",
  "hand-only": "cap crit sentit",
};

export function voidDetail(outcome: SyncOutcome): string {
  const reason = SYNC_OUTCOME_VOID_REASON[outcome] ?? "cap tirada de mà vista";
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

export const PROFILE_TEXT = {
  label: "Perfil",
  defaultName: "Principal",
  newButton: "Nou perfil",
  deleteButton: "Esborra",
  newPrompt: "Nom del nou tripulant:",
  deleteConfirm: (name: string): string =>
    `Esborrar el tripulant «${name}» i tot el seu historial? Això no es pot desfer.`,
} as const;

// ux-pirates: round-card detail strings (gameCards.ts renders these).
export const ROUND_CARD_TEXT = {
  pendingDetail: "Tira i canta el teu número!",
  analyzingDetail: "Llegint la tirada…",
  incompleteHeadline: "INCOMPLETA — torna-hi",
  noHand: "cap mà vista",
  noWord: "cap crit sentit",
  unrecognized: "crit no reconegut",
  notSynced: (outcome: string): string => `fora de temps (${outcome}) — tira i canta a la una`,
  commitmentStands: (hash8: string): string => `la mateixa aposta segueix en peu (${hash8})`,
  sealOk: "segell ✓",
  sealFailed: "SEGELL TRENCAT ✗",
} as const;

// ux-pirates: honest timing feedback. The sync rule (throw + call a la
// una, within the co-occurrence window) IS morra — when a round dies on
// timing we say by how much, and coach the quick-gesture case: session
// logs show 1–2-finger flicks complete in ~100ms so the shout trails them,
// while full throws get the shout during the swing.
export const TIMING_COACH = (
  outcome: string,
  deltaMs: number | null | undefined,
  fingers: number | null | undefined,
  preWindow?: boolean
): string => {
  const ms = deltaMs != null ? Math.abs(Math.round(deltaMs)) : null;
  let s: string;
  if (outcome === "voice-late") s = ms != null ? `el crit ha arribat ${ms} ms tard` : "el crit ha arribat tard";
  else if (outcome === "voice-early" && preWindow)
    // Pinned onset: the shout began inside audio the analyzer can't use —
    // usually overlapping the rival's own (deferred) voice clip in fast
    // back-to-back rounds, or genuinely far too early.
    return "el crit s'ha encavalcat amb la veu del rival (o ha començat molt d'hora) — deixa'l acabar de cantar i llavors tira";
  else if (outcome === "voice-early") s = ms != null ? `el crit s'ha avançat ${ms} ms` : "el crit s'ha avançat";
  else return "";
  if (fingers != null && fingers <= 2) s += " — amb 1 o 2 dits el gest és ràpid: canta MENTRE mous la mà, no després";
  else s += " — tira i canta a la una";
  return s;
};

// Legacy emoji avatars (superseded by pirate/cast.ts; kept for reference).
export const AI_LEVEL_AVATAR: Record<string, string> = { L1: "🙂", L2: "🧔", L3: "🧙", L4: "👹" };
