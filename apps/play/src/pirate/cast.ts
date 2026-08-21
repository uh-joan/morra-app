// pirate/cast.ts — the four rival corsairs of the ux-pirates skin. PURE
// DATA: names, stages, taunts, palette hooks. The mapping is presentation
// only — level ids and difficulty behavior still come exclusively from
// @morra/core's LEVELS (populateAiLevelSelector keeps reading core, so the
// engine never learns these names). Catalan corsair world, playful with
// bite (user decisions, 2026-08-16).

export type PirateReaction = "greet" | "win" | "lose" | "parata" | "void" | "matchWin" | "matchLose";

export interface Pirate {
  /** core level id — the ONLY key the game layer understands */
  levelId: "L1" | "L2" | "L3" | "L4";
  /** display name */
  name: string;
  /** rank / epithet line under the name */
  title: string;
  /** one-line pitch on the select card */
  flavor: string;
  /** stage name (shown on the vs splash + select card) */
  stageName: string;
  /** body[data-stage] hook — drives scenery + palette */
  stageId: "taverna" | "coberta" | "cala" | "abissal";
  /** difficulty pips on the select card (1–4) */
  rank: 1 | 2 | 3 | 4;
  /** speech-bubble lines; "win" = the RIVAL won the round */
  taunts: Record<PirateReaction, readonly string[]>;
}

export const PIRATES: readonly Pirate[] = [
  {
    levelId: "L1",
    name: "Nino",
    title: "el Grumet",
    flavor: "Acabat d'embarcar. Tira fort, pensa poc, riu sempre.",
    stageName: "La Taverna del Port",
    stageId: "taverna",
    rank: 1,
    taunts: {
      greet: ["Vinga, va! El capità diu que aprenc de pressa!", "Jo primer! Bé... tu primer. Com va, això?"],
      win: ["L'he encertada! L'he encertada!", "Ho has vist?! Ni el capità ho faria!"],
      lose: ["Ai las! Una altra, una altra!", "Això no val... anava a dir aquest número!"],
      parata: ["Ni tu ni jo, grumet!", "Empat! Com ahir amb el cuiner!"],
      void: ["Eh! Això no comptava, oi?", "El vent se t'ha endut el crit!"],
      matchWin: ["HE GUANYAT! Ho explicaré a tota la tripulació!"],
      matchLose: ["Val... però demà et guanyo. Segur. Seguríssim."],
    },
  },
  {
    levelId: "L2",
    name: "Bru",
    title: "el Contramestre",
    flavor: "Trenta anys solcant la Mediterrània. No repeteix mai dos cops el mateix truc.",
    stageName: "La Coberta del Xebec",
    stageId: "coberta",
    rank: 2,
    taunts: {
      greet: ["A coberta, grumet. Veurem què en saps.", "El mar no perdona, i jo tampoc."],
      win: ["El mar no perdona!", "Trenta anys de morra, criatura."],
      lose: ["Llamp de llamp...!", "Bé jugat. No tornarà a passar."],
      parata: ["Empat. El vent decidirà.", "Cap punt! Així m'agrada, de tu a tu."],
      void: ["Crida més fort, que el mestral se t'emporta la veu!", "Mà i veu A LA UNA, grumet."],
      matchWin: ["A fregar la coberta! El duel és meu."],
      matchLose: ["Per tots els tresors... m'has guanyat net. Respecte."],
    },
  },
  {
    levelId: "L3",
    name: "Mercè",
    title: "la Vella Corsària",
    flavor: "La llegenda retirada de la costa. Et llegeix els dits abans que els obris.",
    stageName: "La Cala dels Contrabandistes",
    stageId: "cala",
    rank: 3,
    taunts: {
      greet: ["Seu, criatura. Els teus dits ja m'ho han dit tot.", "Fa anys que no jugo... per a tu, en sobren."],
      win: ["Et llegeixo com una carta de navegació.", "Aquest tres el portaves escrit a la cara."],
      lose: ["Vaja, vaja... tens ofici.", "Bé. Molt bé. Ara ja no em fio de tu."],
      parata: ["Taules. Com als vells temps.", "Empat. El mar riu, quan passa això."],
      void: ["Sense crit no hi ha joc, bonic.", "Calma. Puny tancat, i quan vulguis... llampec."],
      matchWin: ["La vella encara mana. Torna quan hagis après."],
      matchLose: ["M'has guanyat... a mi. Ves-ho explicant, que ningú t'ho creurà."],
    },
  },
  {
    levelId: "L4",
    name: "El Rei del Fons",
    title: "senyor dels ofegats",
    flavor: "El déu que espera sota totes les quilles. Ningú no l'ha vençut dues nits seguides.",
    stageName: "La Mar dels Ofegats",
    stageId: "abissal",
    rank: 4,
    taunts: {
      greet: ["MIL VAIXELLS DORMEN AL MEU JARDÍ.", "ELS TEUS DITS SÓN MEUS, MORTAL."],
      win: ["EL FONS T'ESPERA.", "UNA ONADA MÉS, I CAUS."],
      lose: ["...IMPOSSIBLE.", "CAP MORTAL NO— ...INTERESSANT."],
      parata: ["NI ELS DÉUS DECIDEIXEN.", "LA MAR CONTÉ L'ALÈ."],
      void: ["EL TEU CRIT S'HA OFEGAT.", "MÀ I VEU, MORTAL. LA MAR NO ESPERA."],
      matchWin: ["AFEGEIXO EL TEU NOM A LA MEVA QUILLA."],
      matchLose: ["...VÉS. ABANS QUE M'HO REPENSI, CAMPIÓ."],
    },
  },
] as const;

export function pirateForLevel(levelId: string): Pirate {
  return PIRATES.find((p) => p.levelId === levelId) ?? PIRATES[1]!;
}

export function pickTaunt(p: Pirate, reaction: PirateReaction, rng: () => number = Math.random): string {
  const lines = p.taunts[reaction];
  return lines[Math.floor(rng() * lines.length)] ?? lines[0] ?? "";
}
