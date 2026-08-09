// rules.mjs — pure morra rules: the (f,g) decomposition, the verdict, and
// the Catalan call vocabulary. No DOM, no randomness, no I/O — safe to unit
// test directly with plain `node`. See docs/rival-ai-design.md §1.
//
// A morra action is (f, g): fingers thrown, guess of the opponent's fingers.
// The spoken/heard CALL is c = f + g (both 1-5, so c is 2-10). Every
// existing caller in s03-beat.html deals in raw "fingers + call" numbers and
// keeps doing so unchanged; callFromFG/gFromCall are the (f,g)-space
// additions the AI ladder (Phase G) and the mirror (Phase H) build on.

export const CATALAN_NUMBER_WORDS = { dos: 2, tres: 3, quatre: 4, cinc: 5, sis: 6, set: 7, vuit: 8, nou: 9, deu: 10, tot: 10 };
export const NUMBER_TO_CATALAN_CALL = { 2: "dos", 3: "tres", 4: "quatre", 5: "cinc", 6: "sis", 7: "set", 8: "vuit", 9: "nou", 10: "deu" };

export function wordToNumber(word) {
  if (!word) return null;
  return CATALAN_NUMBER_WORDS[word.toLowerCase()] ?? null;
}

// step 11 (first playable round): micatio verdict. total = both hands'
// fingers; a player scores only if THEIR call matches the total AND the
// other player's call does NOT (both correct, or neither, is "parata" — no
// point, matching real morra's tie rule).
export function computeMicatioVerdict(playerFingers, playerCall, aiFingers, aiCall) {
  const total = playerFingers + aiFingers;
  const playerCorrect = playerCall === total;
  const aiCorrect = aiCall === total;
  let winner;
  if (playerCorrect && !aiCorrect) winner = "player";
  else if (aiCorrect && !playerCorrect) winner = "ai";
  else winner = "parata";
  return { total, playerCorrect, aiCorrect, winner };
}

// design doc §1: c = f + g — every action is "what I show, what I guess YOU
// show". callFromFG is how a policy turns its own (f,g) pair into the
// spoken/heard call; gFromCall recovers a THIRD PARTY's g from their known f
// and call (used by the mirror to read the player's own g habits from their
// f + recognized word, and by the AI's future joint (f,g) modeling in L4).
export function callFromFG(f, g) {
  return f + g;
}
export function gFromCall(call, f) {
  return call - f;
}
