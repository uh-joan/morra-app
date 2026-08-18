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
  verifyFailed: "VERIFY FAILED",
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
  // ranked tells (tells2): price, evidence, the rival's counter-move
  tellPrice: (pts: number) => `${pts >= 0 ? "+" : ""}${pts.toFixed(1).replace(".", ",")} punts/100`,
  tellEvidence: (hits: number, n: number) => `${hits} de ${n}`,
  tellCounterPrefix: "El Rei: ",
  // the coach card (L'Espill screen hero) and the Entrenament live strip
  coachLabel: "El teu punt feble",
  coachLabelNone: "Cap punt feble clar",
  coachNone: "Encara no et veig cap costum clar. Tira una mica més i torna.",
  coachNoneTooEarly: (n: number) => `Amb ${n} tir${n === 1 ? "" : "s"} encara no puc dir res. En calen uns 20.`,
  coachPrice: (pts: number) => `${pts >= 0 ? "+" : ""}${pts.toFixed(1).replace(".", ",")} punts cada 100 rondes per al rival`,
  coachEvidence: (hits: number, n: number) => `${hits} de ${n} vegades`,
  liveExploit: (pct: number) => `El Rei et llegeix el ${pct}% — 20% és una moneda.`,
  liveExploitNone: "El Rei encara no té prou tirs per llegir-te.",
  // Entrenament strip head, by partner
  trainingHeadSolo: "Entrenament — sol, davant l'espill",
  trainingHeadSparring: (name: string) => `Entrenament amb ${name} — sense punts, amb mirall`,
  readingCount: (hits: number, n: number) => `${hits} de ${n}`,
  readingHit: (f: number) => `Has cantat els seus ${f} dits — l'has llegit.`,
  readingMiss: (g: number, f: number) => `Buscaves ${g}, tenia ${f}.`,
  readingIntro: "Cada ronda: si la teva endevinalla cau als seus dits, verd.",
  // the shadow rival (Entrenament): El Rei's silent read of each throw, told afterwards
  shadowCount: (hits: number, n: number) => `${hits} de ${n}`,
  shadowCountEmpty: "—",
  shadowIntro: "Tira: abans de cada tir, El Rei aposta en silenci. Després et diu si t'ha vist venir.",
  shadowHit: (f: number, pct: number) => `Aquest ${f} — l'esperava (${pct}%).`,
  shadowMiss: (f: number, predicted: number) => `Aquest ${f} — no l'ha vist venir (apostava al ${predicted}).`,
  shadowTooEarly: (f: number) => `Aquest ${f} — encara no et coneix prou per apostar.`,
  // missions (Entrenament drills)
  missionProgress: (n: number, total: number) => `${n}/${total}`,
  missionLiveBreak: (bad: number, ctx: string, badN: number, ctxN: number, target: number) => `${bad} després d'${ctx}: ${badN} de ${ctxN}${ctxN ? ` (${Math.round((100 * badN) / ctxN)}%)` : ""} — objectiu ≤ ${Math.round(target * 100)}%`,
  missionLiveUnweld: (f: number, call: number, badN: number, ctxN: number, target: number) => `${f} dits + crida ${call}: ${badN} de ${ctxN}${ctxN ? ` (${Math.round((100 * badN) / ctxN)}%)` : ""} — objectiu ≤ ${Math.round(target * 100)}%`,
  missionLiveShadow: (hits: number, scored: number, max: number) => `L'ombra n'ha encertat ${hits} de ${scored} — objectiu ≤ ${max}`,
  missionLiveCoverage: (shares: Record<number, number>, hits: number, max: number) => `${[1, 2, 3, 4, 5].map((d) => `${d}: ${Math.round((shares[d] ?? 0) * 100)}%`).join(" · ")} — ombra ${hits}/${max}`,
  missionFeedbackBadBreak: (f: number, ctx: string) => `Aquest ${f} després d'${ctx} — el rival l'esperava.`,
  missionFeedbackGoodBreak: (f: number, ctx: string) => `Aquest ${f} després d'${ctx} — ben trencat.`,
  missionFeedbackBadUnweld: (f: number, call: number) => `${f} dits i crida ${call} — la crida soldada.`,
  missionFeedbackGoodUnweld: (f: number) => `${f} dits i una crida diferent — bé.`,
  missionFeedbackNeutral: "",
  missionPass: (title: string) => `Missió superada — ${title}. Ara mira si aguanta a la Partida.`,
  missionFail: (title: string) => `Aquesta vegada no — ${title}. Torna-hi: el costum és fort.`,
  missionUndecidable: "No hi ha hagut prou situacions per jutjar-ho. Torna-hi.",
  missionTopLabel: (title: string) => `Missió: ${title}`,
  // trends strip — last 30 vs the 30 before
  trendTitle: (n: number) => `Últims ${n} tirs vs els ${n} d'abans`,
  trendTooEarly: "Els canvis es veuran quan hi hagi 60 tirs.",
  trendLabels: { predictability: "Previsibilitat", entropy: "Aleatorietat", reader: "Lectura", chase: "Persecució" } as Record<string, string>,
  // "El que veu El Rei" — the read, shown
  readHeading: "El que veu El Rei",
  readTooEarly: (n: number) => `Encara no et llegeix — ${n} tir${n === 1 ? "" : "s"}. En calen uns quants més.`,
  readHeadlineBefore: "Ara mateix, El Rei apostaria que tiraràs ",
  readHeadlineAfter: (pct: number) => ` (${pct}%).`,
  readHeadlineFlat: "Ara mateix, El Rei no et veu cap costum clar — bona feina.",
  readSelfWatch: (pct: number) => `Tu li has llegit els dits el ${pct}% de les últimes rondes.`,
  readSelfWatchHigh: (pct: number) => `Tu li has llegit els dits el ${pct}% de les últimes rondes — se n'ha adonat i s'amaga més.`,
  readSelfWatchNone: "Encara no hi ha prou rondes per saber si el llegeixes.",
  // BMA context names → what they mean, for the player
  driverNames: {
    marginal: "els teus números preferits",
    freq: "els teus números d'últimament",
    blend: "l'últim número i els preferits",
    order1: "el que acabes de tirar",
    order2: "els teus dos últims números",
    prevOutcome: "si has guanyat o perdut",
    outcomePrevF: "com ha acabat la ronda i què has tirat",
    prevAiF: "els dits que ell ha tret",
    prevG: "la teva última endevinalla",
    prevTotal: "el total de l'última ronda",
    prevAiG: "el número que ell ha cantat",
    joint: "la mà que lliga la crida",
  } as Record<string, string>,
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

// ux-pirates r3: the VERDICT BANNER — the round's outcome, big, over the
// player card, in the language of "what happened and why". Headlines reuse
// the frozen strings; the reason is the one line the player needs to fix
// the next throw. Rendered via textContent only.
export const VERDICT_BANNER = {
  win: (pf: number, af: number, total: number, word: string | null): string =>
    `${pf} + ${af} = ${total} · has dit «${word ?? "?"}»`,
  loss: (pf: number, af: number, total: number, aiWord: string): string =>
    `${pf} + ${af} = ${total} · ell ha dit «${aiWord}»`,
  parata: (pf: number, af: number, total: number, word: string | null, aiWord: string): string =>
    `ningú l'ha encertat: ${pf} + ${af} = ${total} (tu «${word ?? "?"}», ell «${aiWord}»)`,
  incompleteHeadline: "INCOMPLETA",
  incompleteTail: "la mateixa aposta segueix en peu",
} as const;

export const HOME_TEXT = {
  vs: (name: string) => `contra ${name}`,
} as const;
