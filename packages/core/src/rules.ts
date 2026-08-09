// rules.ts — ported verbatim from spikes/modules/rules.mjs. Pure morra
// rules: the (f,g) decomposition, the verdict, and the Catalan call
// vocabulary. No randomness, no I/O.
//
// A morra action is (f, g): fingers thrown, guess of the opponent's fingers.
// The spoken/heard CALL is c = f + g (both 1-5, so c is 2-10).
import type { VerdictWinner } from "./types.js";

export const CATALAN_NUMBER_WORDS: Readonly<Record<string, number>> = {
  dos: 2, tres: 3, quatre: 4, cinc: 5, sis: 6, set: 7, vuit: 8, nou: 9, deu: 10, tot: 10,
};
export const NUMBER_TO_CATALAN_CALL: Readonly<Record<number, string>> = {
  2: "dos", 3: "tres", 4: "quatre", 5: "cinc", 6: "sis", 7: "set", 8: "vuit", 9: "nou", 10: "deu",
};

export function wordToNumber(word: string | null | undefined): number | null {
  if (!word) return null;
  return CATALAN_NUMBER_WORDS[word.toLowerCase()] ?? null;
}

export interface MicatioVerdict {
  total: number;
  playerCorrect: boolean;
  aiCorrect: boolean;
  winner: VerdictWinner;
}

// step 11 (spike): micatio verdict. total = both hands' fingers; a player
// scores only if THEIR call matches the total AND the other player's call
// does NOT (both correct, or neither, is "parata" — no point, matching real
// morra's tie rule).
export function computeMicatioVerdict(
  playerFingers: number,
  playerCall: number,
  aiFingers: number,
  aiCall: number
): MicatioVerdict {
  const total = playerFingers + aiFingers;
  const playerCorrect = playerCall === total;
  const aiCorrect = aiCall === total;
  let winner: VerdictWinner;
  if (playerCorrect && !aiCorrect) winner = "player";
  else if (aiCorrect && !playerCorrect) winner = "ai";
  else winner = "parata";
  return { total, playerCorrect, aiCorrect, winner };
}

// design doc §1: c = f + g — every action is "what I show, what I guess YOU
// show". callFromFG is how a policy turns its own (f,g) pair into the
// spoken/heard call; gFromCall recovers a THIRD PARTY's g from their known f
// and call.
export function callFromFG(f: number, g: number): number {
  return f + g;
}
export function gFromCall(call: number, f: number): number {
  return call - f;
}
