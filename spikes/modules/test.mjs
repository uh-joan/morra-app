// Node unit-test harness for the Phase F pure modules. Run with plain node:
//   node spikes/modules/test.mjs
// No build step, no test framework dependency — matches the project's
// existing convention (see the inline "Pure logic" tests run against
// s03-beat.html itself) of small hand-rolled check()/pass/fail counters.
import * as Rules from "./rules.mjs";
import * as Commit from "./commit.mjs";
import * as Scorer from "./scorer.mjs";
import * as Ai from "./ai.mjs";
import * as PlayerModel from "./playermodel.mjs";

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`ok   - ${name}`); }
  else { fail++; console.log(`FAIL - ${name}${detail !== undefined ? " :: " + JSON.stringify(detail) : ""}`); }
}

// ============================== rules.mjs ==============================
check("wordToNumber: known Catalan words map correctly", Rules.wordToNumber("vuit") === 8 && Rules.wordToNumber("dos") === 2);
check("wordToNumber: 'tot' and 'deu' both mean 10 (alternate calls)", Rules.wordToNumber("tot") === 10 && Rules.wordToNumber("deu") === 10);
check("wordToNumber: case-insensitive", Rules.wordToNumber("VUIT") === 8);
check("wordToNumber: unknown word -> null", Rules.wordToNumber("xxx") === null);
check("wordToNumber: null/empty -> null", Rules.wordToNumber(null) === null && Rules.wordToNumber("") === null);
check("NUMBER_TO_CATALAN_CALL: 10 always renders as 'deu' (not 'tot')", Rules.NUMBER_TO_CATALAN_CALL[10] === "deu");

{
  const v = Rules.computeMicatioVerdict(3, 7, 4, 5); // total=7, player correct, ai wrong
  check("computeMicatioVerdict: player wins when only they guess the total", v.winner === "player" && v.total === 7 && v.playerCorrect === true && v.aiCorrect === false, v);
}
{
  const v = Rules.computeMicatioVerdict(3, 5, 4, 7); // total=7, ai correct, player wrong
  check("computeMicatioVerdict: ai wins when only they guess the total", v.winner === "ai" && v.aiCorrect === true && v.playerCorrect === false, v);
}
{
  const v = Rules.computeMicatioVerdict(3, 7, 4, 7); // total=7, both correct -> parata
  check("computeMicatioVerdict: parata when both correct", v.winner === "parata", v);
}
{
  const v = Rules.computeMicatioVerdict(3, 5, 4, 6); // total=7, neither correct -> parata
  check("computeMicatioVerdict: parata when both wrong", v.winner === "parata", v);
}

check("callFromFG: c = f + g (design doc §1)", Rules.callFromFG(3, 4) === 7);
check("gFromCall: recovers g from call and known f (inverse of callFromFG)", Rules.gFromCall(7, 3) === 4);
for (const [f, g] of [[1, 1], [5, 5], [2, 4], [4, 2]]) {
  const call = Rules.callFromFG(f, g);
  check(`callFromFG/gFromCall round-trip for f=${f},g=${g}`, Rules.gFromCall(call, f) === g);
}

// ============================== commit.mjs ==============================
{
  const h1 = await Commit.sha256Hex("hello");
  const h2 = await Commit.sha256Hex("hello");
  const h3 = await Commit.sha256Hex("world");
  check("sha256Hex: deterministic (same input -> same hash)", h1 === h2, { h1, h2 });
  check("sha256Hex: different input -> different hash", h1 !== h3);
  check("sha256Hex: 64 lowercase hex chars", /^[0-9a-f]{64}$/.test(h1), h1);
}
{
  const n1 = Commit.randomNonceHex();
  const n2 = Commit.randomNonceHex();
  check("randomNonceHex: 32 hex chars by default (16 bytes)", /^[0-9a-f]{32}$/.test(n1), n1);
  check("randomNonceHex: not deterministic across calls", n1 !== n2);
}
{
  const fingers = 3, call = 7, nonce = "deadbeef";
  const hash = await Commit.computeCommitHash(fingers, call, nonce);
  const expected = await Commit.sha256Hex(`${fingers}|${call}|${nonce}`);
  check("computeCommitHash: matches the field-tested '${fingers}|${call}|${nonce}' format exactly (do not change)", hash === expected, { hash, expected });
  const okVerify = await Commit.verifyCommitment(fingers, call, nonce, hash);
  check("verifyCommitment: true for the real (fingers,call,nonce)", okVerify === true);
  const badVerify = await Commit.verifyCommitment(fingers, call + 1, nonce, hash);
  check("verifyCommitment: false for a tampered call", badVerify === false);
}

// ============================== scorer.mjs ==============================
{
  const cls = Scorer.classifySyncThrow(1000, 1050, 400);
  check("classifySyncThrow: within co-occurrence window -> synced", cls.outcome === "synced" && cls.synced === true, cls);
}
{
  const cls = Scorer.classifySyncThrow(1000, 1600, 400);
  check("classifySyncThrow: voice well after hand -> voice-late", cls.outcome === "voice-late" && cls.syncDeltaMs === 600, cls);
}
{
  const cls = Scorer.classifySyncThrow(1000, 400, 400);
  check("classifySyncThrow: voice well before hand -> voice-early", cls.outcome === "voice-early" && cls.syncDeltaMs === -600, cls);
}
{
  const cls = Scorer.classifySyncThrow(1000, null, 400);
  check("classifySyncThrow: no voice found -> hand-only", cls.outcome === "hand-only" && cls.synced === false, cls);
}
check("isOrphanVoiceOnset: no nearby hand onset -> orphan (true)", Scorer.isOrphanVoiceOnset(5000, [1000, 2000], 500) === true);
check("isOrphanVoiceOnset: a hand onset within the partner window -> not orphan (false)", Scorer.isOrphanVoiceOnset(2100, [1000, 2000], 500) === false);

check("classifyHandSettleForSync: fist(0)+silence -> reset", Scorer.classifyHandSettleForSync(0, null).isReset === true);
check("classifyHandSettleForSync: fist(0)+voice -> throw of 1, not reset", (() => { const r = Scorer.classifyHandSettleForSync(0, 123); return r.isReset === false && r.effectiveFingerCount === 1; })());
check("classifyHandSettleForSync: count>=2 unchanged regardless of voice", (() => { const a = Scorer.classifyHandSettleForSync(4, null), b = Scorer.classifyHandSettleForSync(4, 123); return a.effectiveFingerCount === 4 && b.effectiveFingerCount === 4 && !a.isReset && !b.isReset; })());

for (const n of [2, 3, 4, 5]) check(`shouldRevealPhase1(${n}) -> true`, Scorer.shouldRevealPhase1(n) === true);
for (const n of [0, 1, null]) check(`shouldRevealPhase1(${n}) -> false`, Scorer.shouldRevealPhase1(n) === false);

// ============================== ai.mjs ==============================
check("ai.mjs: DEFAULT_LEVEL is L2 (today's only live behavior — the equilibrium wall)", Ai.DEFAULT_LEVEL === "L2");
check("ai.mjs: LEVELS.L2 exists with a name/description", !!Ai.LEVELS.L2 && typeof Ai.LEVELS.L2.name === "string");
{
  // deterministic fake rng: fixed sequence of [0, 1) values
  const seq = [0, 0.99, 0.5, 0.2];
  let i = 0;
  const fakeRng = () => seq[i++ % seq.length];
  const move = Ai.decideMove("L2", fakeRng, [], null);
  // fingers = 1+floor(0*5)=1, guessPlayerFingers = 1+floor(0.99*5)=5, call=6
  check("decideMove: fingers derived from rng() -> floor(rng()*5)+1", move.fingers === 1, move);
  check("decideMove: guessPlayerFingers derived from the NEXT rng() call", move.guessPlayerFingers === 5, move);
  check("decideMove: call = fingers + guessPlayerFingers (design doc §1: c = f+g)", move.call === move.fingers + move.guessPlayerFingers, move);
  check("decideMove: echoes back the requested level", move.level === "L2", move);
}
{
  // range check over many draws with the real default rng
  let allInRange = true;
  for (let i = 0; i < 500; i++) {
    const m = Ai.decideMove();
    if (m.fingers < 1 || m.fingers > 5 || m.guessPlayerFingers < 1 || m.guessPlayerFingers > 5 || m.call !== m.fingers + m.guessPlayerFingers) { allInRange = false; break; }
  }
  check("decideMove: fingers/guessPlayerFingers always in [1,5], call always their sum (500 draws)", allInRange);
}
{
  // purity: same rng SEQUENCE (fresh generator each time) -> same decision (design doc §4 commit purity)
  const makeRng = () => { const seq = [0.1, 0.6]; let i = 0; return () => seq[i++ % seq.length]; };
  const m1 = Ai.decideMove("L2", makeRng(), [], null);
  const m2 = Ai.decideMove("L2", makeRng(), [], null);
  check("decideMove: pure — identical (rng-sequence, history, model) -> identical decision", JSON.stringify(m1) === JSON.stringify(m2), { m1, m2 });
}

// ============================== playermodel.mjs ==============================
{
  const m = PlayerModel.createEmptyModel();
  check("createEmptyModel: starts with zero throws", Array.isArray(m.throws) && m.throws.length === 0, m);
  const m2 = PlayerModel.recordThrow(m, { f: 3, g: 4 });
  check("recordThrow: appends without mutating the original model", m.throws.length === 0 && m2.throws.length === 1, { m, m2 });
  check("snapshotModel: reflects the throw count", PlayerModel.snapshotModel(m2).throwCount === 1);
  check("snapshotModel: empty model -> zero", PlayerModel.snapshotModel(PlayerModel.createEmptyModel()).throwCount === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
