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
import * as Mirror from "./mirror.mjs";

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

// ======================= ai.mjs — Phase G: the ladder =======================
check("LEVEL_ORDER has all four levels, L2 default", JSON.stringify(Ai.LEVEL_ORDER) === JSON.stringify(["L1", "L2", "L3", "L4"]) && Ai.DEFAULT_LEVEL === "L2");
for (const id of Ai.LEVEL_ORDER) {
  check(`LEVELS.${id} has a name and a description`, !!Ai.LEVELS[id] && typeof Ai.LEVELS[id].name === "string" && typeof Ai.LEVELS[id].description === "string");
}

// --- low-level math helpers ---
check("decayWeight: 0 throws back -> full weight 1", Ai.decayWeight(0, 20) === 1);
check("decayWeight: exactly one half-life back -> weight 0.5", Math.abs(Ai.decayWeight(20, 20) - 0.5) < 1e-9);
check("lambdaFromNEff: half-saturation — nEff===k -> lambda=0.5", Math.abs(Ai.lambdaFromNEff(8, 8) - 0.5) < 1e-9);
check("lambdaFromNEff: nEff=0 -> lambda=0 (no data, no confidence)", Ai.lambdaFromNEff(0, 8) === 0);
check("lambdaFromNEff: nEff->large -> lambda->1", Ai.lambdaFromNEff(10000, 8) > 0.99);
{
  const mixed = Ai.mixWithUniform({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 }, 0);
  check("mixWithUniform: lambda=0 -> exactly uniform regardless of the sharpened distribution", Object.values(mixed).every((p) => Math.abs(p - 0.2) < 1e-9), mixed);
}
{
  const mixed = Ai.mixWithUniform({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 }, 1);
  check("mixWithUniform: lambda=1 -> exactly the sharpened distribution, uniform ignored", mixed[1] === 1 && mixed[2] === 0, mixed);
}
{
  const inv = Ai.invertDistribution({ 1: 0.6, 2: 0.1, 3: 0.1, 4: 0.1, 5: 0.1 });
  check("invertDistribution: mass moves AWAY from the peak (anti-aim)", inv[1] < inv[2] && Math.abs(Object.values(inv).reduce((a, b) => a + b, 0) - 1) < 1e-9, inv);
}
{
  const combined = Ai.combineByWeight([{ dist: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 }, weight: 1 }, { dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 }, weight: 1 }]);
  check("combineByWeight: equal weights -> equal blend", Math.abs(combined[1] - 0.5) < 1e-9 && Math.abs(combined[5] - 0.5) < 1e-9, combined);
}
check("combineByWeight: no usable predictions -> null", Ai.combineByWeight([]) === null && Ai.combineByWeight([{ dist: null, weight: 5 }]) === null);
{
  // temperature=1 samples proportionally, never argmax: a deterministic rng
  // just above the peak's cumulative mass should land on the NEXT bucket,
  // not always on the peak — proves this isn't argmax in disguise.
  const dist = { 1: 0.9, 2: 0.025, 3: 0.025, 4: 0.025, 5: 0.025 };
  const pick = Ai.sampleWithTemperature(() => 0.95, dist, 1);
  check("sampleWithTemperature: draws from the CDF (not argmax) — a high rng() draw lands past the peak", pick !== 1, pick);
  const pickLow = Ai.sampleWithTemperature(() => 0.01, dist, 1);
  check("sampleWithTemperature: a low rng() draw lands on the peak (still probability-proportional)", pickLow === 1, pickLow);
}
{
  // sharper temperature (0.6) concentrates more mass on the peak than τ=1 would
  const dist = { 1: 0.4, 2: 0.15, 3: 0.15, 4: 0.15, 5: 0.15 };
  let hits1 = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const rng = mulberry32(i + 1);
    if (Ai.sampleWithTemperature(rng, dist, 0.6) === 1) hits1++;
  }
  check("sampleWithTemperature: τ=0.6 sharpens toward the peak (samples value-1 MORE than its raw 40% share)", hits1 / N > 0.45, hits1 / N);
}

// --- predictors ---
{
  const series = [1, 3, 1, 3, 1, 3, 1]; // strict alternation, last value 1 -> should predict 3 next
  const p = Ai.order1Predict(series, 20);
  check("order1Predict: catches a strict alternation", !!p && p.dist[3] > p.dist[1], p && p.dist);
}
check("order1Predict: too little data -> null", Ai.order1Predict([3], 20) === null);
{
  // series ends in (1,2); "1,2" has been followed by 3 twice before, with
  // enough decayed weight to clear ORDER2_MIN_WEIGHT (a single occurrence
  // near the threshold isn't enough — that's exactly what order2Predict's
  // backoff-on-insufficient-data guard is for, covered by the next check).
  const series = [1, 2, 3, 4, 4, 1, 2, 3, 5, 5, 1, 2];
  const p2 = Ai.order2Predict(series, 20);
  check("order2Predict: conditions on the last TWO values", !!p2 && p2.dist[3] > p2.dist[1], p2 && p2.dist);
}
check("order2Predict: below the min-weight threshold -> null (caller should back off)", Ai.order2Predict([1, 2, 3], 20) === null);
{
  const series = [5, 5, 5, 5, null, 5];
  const bo = Ai.ngramWithBackoff(series, 20);
  check("ngramWithBackoff: falls back to order-1 when order-2 has too little data", !!bo, bo);
}
{
  const series = [2, 2, 2, 2, 2];
  const g = Ai.globalFreqPredict(series, 20);
  check("globalFreqPredict: all-same series -> all mass on that value", !!g && g.dist[2] === 1, g && g.dist);
  const sm = Ai.stickyModePredict(series, 20);
  check("stickyModePredict: peaks fully on the mode", !!sm && sm.dist[2] === 1 && Object.values(sm.dist).reduce((a, b) => a + b, 0) === 1, sm);
}
check("globalFreqPredict: empty series -> null", Ai.globalFreqPredict([], 20) === null);
{
  // player repeats their fingers after winning, changes after losing
  const series = [3, 3, 4, 2, 2, 5];
  const verdicts = ["player", "player", "ai", "player", "player", "ai"];
  const wsls = Ai.winStayLoseShiftPredict(series, verdicts, 20);
  check("winStayLoseShiftPredict: needs a clean win/lose last-outcome signal", !!wsls, wsls);
}
check("winStayLoseShiftPredict: last outcome parata -> null (no clean signal)", Ai.winStayLoseShiftPredict([3, 4], ["player", "parata"], 20) === null);

// --- L1: designed to be read ---
{
  // deterministic fake rng always returning a value that lands in the {2,5} favored region for the fingers draw
  const seq = [0.2]; // cumulative: 1(.15) 2(.15+.30=.45) -> 0.2 lands in bucket 2
  let i = 0;
  const rng = () => seq[i++ % seq.length];
  const move = Ai.decideMove("L1", rng, []);
  check("L1: fingers sampled from the biased-toward-{2,5} distribution (not uniform)", move.fingers === 2, move);
}
{
  const rng = mulberry32(7);
  let twos = 0, fives = 0, N = 4000;
  for (let i = 0; i < N; i++) { const m = Ai.decideMove("L1", rng, []); if (m.fingers === 2) twos++; if (m.fingers === 5) fives++; }
  check("L1: over many draws, 2 and 5 together are favored well above the 40% a uniform split would give", (twos + fives) / N > 0.5, (twos + fives) / N);
}
{
  const history = [{ throwIndex: 1, playerFingers: 3, playerCall: 7, aiFingers: 4, aiCall: 6, verdictWinner: "ai" }];
  const rng = () => 0; // forces the repeat-after-score branch to fire when it rolls
  const move = Ai.decideMove("L1", rng, history);
  check("L1: repeats its last fingers after scoring, when the repeat-roll fires", move.fingers === 4, move);
}
{
  // AI LOST last round (verdictWinner: "player") — the repeat-after-score
  // branch must be skipped entirely, so with a rng() that's always 0, the
  // very first rng() call goes straight to the biased draw (which lands on
  // bucket 1 at r=0), never touching last.aiFingers (4) at all.
  const history = [{ throwIndex: 1, playerFingers: 3, playerCall: 7, aiFingers: 4, aiCall: 6, verdictWinner: "player" }];
  const rng = () => 0;
  const move = Ai.decideMove("L1", rng, history);
  check("L1: does NOT repeat after losing (only after scoring) — falls straight to the biased draw", move.fingers === 1, move);
}

// --- L2: aim ~20% vs a uniform simulated player (χ² sanity) ---
{
  const rng = mulberry32(42);
  const N = 3000;
  let hits = 0;
  for (let i = 0; i < N; i++) {
    const actualPlayerF = 1 + Math.floor(rng() * 5);
    const move = Ai.decideMove("L2", rng, []);
    if (move.guessPlayerFingers === actualPlayerF) hits++;
  }
  const rate = hits / N;
  check(`L2 aim rate is close to the 20% baseline against a uniform player (got ${(rate * 100).toFixed(1)}%)`, Math.abs(rate - 0.2) < 0.03, rate);
}

// --- L3/L4: aim >30% vs a scripted, strongly-biased player within 30 throws ---
function runScriptedMatch(level, scriptedPlayerF, throwsCount, seed) {
  const rng = mulberry32(seed);
  const history = [];
  let hits = 0;
  const hitsByThrow = [];
  for (let i = 0; i < throwsCount; i++) {
    const move = Ai.decideMove(level, rng, history);
    const actualPlayerF = typeof scriptedPlayerF === "function" ? scriptedPlayerF(i, history) : scriptedPlayerF;
    const hit = move.guessPlayerFingers === actualPlayerF;
    if (hit) hits++;
    hitsByThrow.push(hit);
    // simulate a verdict: if the AI's g hit the player's f, count it AS IF the AI's own f/aiCall don't matter for this sanity check — approximate outcome bookkeeping is enough for the predictor to have win/lose signal to chew on.
    const verdictWinner = hit ? "ai" : (rng() < 0.3 ? "player" : "parata");
    history.push({ throwIndex: i + 1, playerFingers: actualPlayerF, playerCall: actualPlayerF + (1 + Math.floor(rng() * 5)), aiFingers: move.fingers, aiCall: move.call, verdictWinner });
  }
  return { hits, rate: hits / throwsCount, hitsByThrow };
}
{
  const { rate, hitsByThrow } = runScriptedMatch("L3", 5, 30, 1); // player ALWAYS throws 5
  const lateRate = hitsByThrow.slice(15).filter(Boolean).length / hitsByThrow.slice(15).length; // warmed-up half
  check(`L3 aim vs an always-throws-5 player climbs above 30% within 30 throws (late-match rate ${(lateRate * 100).toFixed(0)}%)`, lateRate > 0.3, lateRate);
}
{
  const { hitsByThrow } = runScriptedMatch("L4", 5, 30, 2);
  const lateRate = hitsByThrow.slice(15).filter(Boolean).length / hitsByThrow.slice(15).length;
  check(`L4 aim vs an always-throws-5 player climbs above 30% within 30 throws (late-match rate ${(lateRate * 100).toFixed(0)}%)`, lateRate > 0.3, lateRate);
}

// --- L4 >= L2 vs a pure-random player (the equilibrium floor) ---
{
  const TRIALS = 6, THROWS = 400;
  let l2Total = 0, l4Total = 0;
  for (let t = 0; t < TRIALS; t++) {
    const rngPlayer = mulberry32(1000 + t);
    const rngL2 = mulberry32(2000 + t);
    const rngL4 = mulberry32(2000 + t); // SAME seed as L2 so both face the identical player sequence
    const playerSeq = [];
    for (let i = 0; i < THROWS; i++) playerSeq.push(1 + Math.floor(rngPlayer() * 5));

    let l2Hits = 0;
    for (let i = 0; i < THROWS; i++) { const m = Ai.decideMove("L2", rngL2, []); if (m.guessPlayerFingers === playerSeq[i]) l2Hits++; }

    let l4Hits = 0; const history = [];
    for (let i = 0; i < THROWS; i++) {
      const m = Ai.decideMove("L4", rngL4, history);
      const hit = m.guessPlayerFingers === playerSeq[i];
      if (hit) l4Hits++;
      history.push({ throwIndex: i + 1, playerFingers: playerSeq[i], playerCall: playerSeq[i] + 3, aiFingers: m.fingers, aiCall: m.call, verdictWinner: hit ? "ai" : "parata" });
    }
    l2Total += l2Hits; l4Total += l4Hits;
  }
  const l2Rate = l2Total / (TRIALS * THROWS), l4Rate = l4Total / (TRIALS * THROWS);
  check(`L4 aim rate (${(l4Rate * 100).toFixed(1)}%) is not meaningfully below L2's (${(l2Rate * 100).toFixed(1)}%) vs a pure-random player — the equilibrium floor`, l4Rate > l2Rate - 0.03, { l2Rate, l4Rate });
}

// --- L4 anti-aim: own fingers avoid the player's predicted guess ---
{
  // player's call always implies g=3 (their guess of the AI's fingers) — feed
  // enough history for the anti-aim channel to build real confidence, then
  // check the AI's OWN fingers land on 3 much less than a uniform 20% would.
  const rng = mulberry32(9);
  const history = [];
  for (let i = 0; i < 25; i++) {
    const playerFingers = 1 + Math.floor(rng() * 5);
    history.push({ throwIndex: i + 1, playerFingers, playerCall: playerFingers + 3, aiFingers: 1, aiCall: 4, verdictWinner: "parata" });
  }
  let hitsOn3 = 0, N = 1500;
  const sampleRng = mulberry32(11);
  for (let i = 0; i < N; i++) {
    const m = Ai.decideMove("L4", sampleRng, history);
    if (m.fingers === 3) hitsOn3++;
  }
  check(`L4 anti-aim: own fingers avoid the player's well-established predicted guess (3) — landed there ${(hitsOn3 / N * 100).toFixed(1)}% of the time, well under uniform 20%`, hitsOn3 / N < 0.16, hitsOn3 / N);
}

// --- commit purity: identical (level, rng-sequence, history) -> identical decision, for every level ---
for (const level of Ai.LEVEL_ORDER) {
  const history = [
    { throwIndex: 1, playerFingers: 3, playerCall: 7, aiFingers: 2, aiCall: 5, verdictWinner: "player" },
    { throwIndex: 2, playerFingers: 5, playerCall: 8, aiFingers: 3, aiCall: 6, verdictWinner: "ai" },
  ];
  const makeRng = () => mulberry32(123);
  const m1 = Ai.decideMove(level, makeRng(), history, null);
  const m2 = Ai.decideMove(level, makeRng(), history, null);
  check(`decideMove is pure for ${level}: identical inputs -> identical decision`, JSON.stringify(m1) === JSON.stringify(m2), { m1, m2 });
}

// deterministic seeded PRNG for reproducible statistical tests (Math.random is not seedable)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Ai.predictPlayerF: the no-rng, replayable read each level would use (Phase H's exploitability meter reuses this exact function for L4) ---
check("predictPlayerF: L1 doesn't read the player -> uniform, no lambda", JSON.stringify(Ai.predictPlayerF("L1", [])) === JSON.stringify({ dist: Ai.UNIFORM_DIST, lambda: null, predictorWeights: null }));
check("predictPlayerF: L2 doesn't read the player -> uniform, no lambda", JSON.stringify(Ai.predictPlayerF("L2", [])) === JSON.stringify({ dist: Ai.UNIFORM_DIST, lambda: null, predictorWeights: null }));
{
  const history = [{ playerFingers: 5, verdictWinner: null }, { playerFingers: 5, verdictWinner: null }, { playerFingers: 5, verdictWinner: null }, { playerFingers: 5, verdictWinner: null }];
  const l3 = Ai.predictPlayerF("L3", history);
  check("predictPlayerF: L3 sharpens toward a consistent player's value", l3.dist[5] > 0.2 && l3.lambda > 0, l3);
  check("predictPlayerF: L3 never exposes predictorWeights (that's an L4-only concept)", l3.predictorWeights === null);
  const l4 = Ai.predictPlayerF("L4", history);
  check("predictPlayerF: L4 sharpens toward a consistent player's value too", l4.dist[5] > 0.2 && l4.lambda > 0, l4);
  check("predictPlayerF: L4 exposes non-empty predictorWeights", l4.predictorWeights && Object.keys(l4.predictorWeights).length > 0, l4.predictorWeights);
}
check("predictPlayerF: unknown level falls back to uniform (never throws)", JSON.stringify(Ai.predictPlayerF("bogus", [{ playerFingers: 3 }])) === JSON.stringify({ dist: Ai.UNIFORM_DIST, lambda: null, predictorWeights: null }));

// ============================== mirror.mjs — Phase H: "L'Espill" ==============================

// --- exploitability meter: replays the REAL L4 predictor, so this should
// track the same "climbs above baseline against a predictable player, stays
// near baseline against a random one" behavior already proven for L4's aim. ---
{
  const history = [];
  for (let i = 0; i < 25; i++) history.push({ throwIndex: i + 1, playerFingers: 5, playerCall: 5 + 2, playerWord: "set", verdictWinner: null });
  const exp = Mirror.computeExploitability(history);
  check("computeExploitability: climbs well above the 20% baseline against an always-5 player", exp.rate > 0.4, exp);
}
{
  const rng = mulberry32(55);
  const history = [];
  for (let i = 0; i < 300; i++) history.push({ throwIndex: i + 1, playerFingers: 1 + Math.floor(rng() * 5), verdictWinner: null });
  const exp = Mirror.computeExploitability(history);
  check(`computeExploitability: stays near the 20% baseline against a uniform-random player (got ${(exp.rate * 100).toFixed(1)}%)`, Math.abs(exp.rate - 0.2) < 0.08, exp.rate);
}
check("computeExploitability: too little history -> null rate, not a crash", Mirror.computeExploitability([{ playerFingers: 3 }]).rate === null);

// --- randomness score (Shannon redundancy) ---
{
  const allSame = Array.from({ length: 20 }, () => ({ playerFingers: 3 }));
  const r = Mirror.computeRandomnessScore(allSame);
  check("computeRandomnessScore: always the same value -> 100% redundancy (zero entropy)", Math.abs(r.redundancyPct - 100) < 1e-6, r);
}
{
  const perfectlyUniform = [];
  for (const v of [1, 2, 3, 4, 5]) for (let i = 0; i < 40; i++) perfectlyUniform.push({ playerFingers: v });
  const r = Mirror.computeRandomnessScore(perfectlyUniform);
  check("computeRandomnessScore: perfectly uniform counts -> ~0% redundancy", r.redundancyPct < 1, r);
}
check("computeRandomnessScore: no data -> null", Mirror.computeRandomnessScore([]) === null);

// --- histograms ---
{
  const history = [
    { playerFingers: 1, playerCall: 4, playerWord: "quatre" }, // g=3
    { playerFingers: 1, playerCall: 3, playerWord: "tres" },   // g=2
    { playerFingers: 2, playerCall: 4, playerWord: "quatre" }, // g=2
    { playerFingers: 3, playerCall: null, playerWord: null },
  ];
  const h = Mirror.computeHistograms(history);
  check("computeHistograms: f counts are exact", h.f.list.find((x) => x.value === 1).count === 2 && h.f.list.find((x) => x.value === 3).count === 1, h.f.list);
  check("computeHistograms: f percentages sum to 100", Math.abs(h.f.list.reduce((s, x) => s + x.pct, 0) - 100) < 1e-6);
  check("computeHistograms: g derived correctly (call-f), skips entries missing a call", h.g.total === 3 && h.g.list.find((x) => x.value === 2).count === 2, h.g.list);
  check("computeHistograms: top words sorted by count desc", h.topWords[0].word === "quatre" && h.topWords[0].count === 2, h.topWords);
}
check("computeHistograms: empty history -> zeroed totals, no crash", Mirror.computeHistograms([]).f.total === 0);

// --- bigram heatmap ---
{
  const history = [{ playerFingers: 1 }, { playerFingers: 2 }, { playerFingers: 1 }, { playerFingers: 2 }, { playerFingers: 1 }, { playerFingers: 3 }];
  const heat = Mirror.computeBigramHeatmap(history);
  check("computeBigramHeatmap: counts transitions correctly (1->2 happened twice)", heat.counts[1][2] === 2, heat.counts[1]);
  check("computeBigramHeatmap: row probabilities sum to 1 for a row with data", Math.abs(Object.values(heat.probabilities[1]).reduce((a, b) => a + b, 0) - 1) < 1e-9, heat.probabilities[1]);
  check("computeBigramHeatmap: a from-value never seen has null probabilities, not NaN", heat.probabilities[5][1] === null, heat.probabilities[5]);
}

// --- sync stats ---
{
  const history = [
    { syncOutcome: "synced", syncDeltaMs: 50 },
    { syncOutcome: "synced", syncDeltaMs: -30 },
    { syncOutcome: "voice-late", syncDeltaMs: 600 },
    { syncOutcome: "hand-only", syncDeltaMs: null },
  ];
  const s = Mirror.computeSyncStats(history);
  check("computeSyncStats: sync rate is synced/total-with-outcome", Math.abs(s.syncRate - 0.5) < 1e-9, s);
  check("computeSyncStats: median |Δ| computed only over entries with a delta", s.medianAbsDeltaMs != null, s);
}
check("computeSyncStats: no data -> nulls, not a crash", Mirror.computeSyncStats([]).syncRate === null);

// --- top tells ---
{
  // heavy repeater: same value most of the time
  const history = [];
  for (let i = 0; i < 20; i++) history.push({ playerFingers: i % 4 === 0 ? 2 : 3 }); // mostly 3s, repeating heavily
  const tells = Mirror.computeTopTells(history);
  check("computeTopTells: detects a repeat-rate tell for a heavily-repeating sequence", tells.some((t) => t.id === "repeatRate"), tells);
  check("computeTopTells: returns at most 3, sorted by strength descending", tells.length <= 3 && tells.every((t, i) => i === 0 || tells[i - 1].strength >= t.strength), tells);
}
{
  // win-stay: always repeats the same fingers right after winning
  const history = [];
  for (let i = 0; i < 10; i++) {
    history.push({ playerFingers: (i % 5) + 1, verdictWinner: "player" });
    history.push({ playerFingers: (i % 5) + 1, verdictWinner: "ai" }); // "stay" — repeats after the win above
  }
  const tells = Mirror.computeTopTells(history, 4);
  check("computeTopTells: detects a win-stay tell", tells.some((t) => t.id === "winStay"), tells);
}
{
  // strong finger->word correlation
  const history = [];
  for (let i = 0; i < 10; i++) history.push({ playerFingers: 5, playerWord: "vuit" });
  const tells = Mirror.computeTopTells(history, 4);
  check("computeTopTells: detects a finger-call correlation tell", tells.some((t) => t.id === "fingerCallCorrelation" && t.sentence.includes("vuit")), tells);
}
{
  // strong sequence habit: after 3, always 5
  const history = [];
  for (let i = 0; i < 10; i++) { history.push({ playerFingers: 3 }); history.push({ playerFingers: 5 }); }
  const tells = Mirror.computeTopTells(history, 4);
  check("computeTopTells: detects a sequence-habit tell", tells.some((t) => t.id === "sequenceHabit"), tells);
}
check("computeTopTells: no/insufficient data -> empty array, not a crash", Mirror.computeTopTells([]).length === 0);
check("computeTopTells: a genuinely uniform-random-looking short history yields few or no tells", Mirror.computeTopTells([{ playerFingers: 1 }, { playerFingers: 3 }]).length === 0);

// ============================== playermodel.mjs ==============================
{
  const m = PlayerModel.createEmptyModel();
  check("createEmptyModel: starts with zero throws", Array.isArray(m.throws) && m.throws.length === 0, m);
  const m2 = PlayerModel.recordThrow(m, { f: 3, g: 4 });
  check("recordThrow: appends without mutating the original model", m.throws.length === 0 && m2.throws.length === 1, { m, m2 });
  check("snapshotModel: reflects the throw count", PlayerModel.snapshotModel(m2).throwCount === 1);
  check("snapshotModel: empty model -> zero", PlayerModel.snapshotModel(PlayerModel.createEmptyModel()).throwCount === 0);
  check("toHistoryArray: returns the plain throws array (the shape ai.mjs expects)", PlayerModel.toHistoryArray(m2).length === 1 && PlayerModel.toHistoryArray(m2)[0].f === 3);
}
{
  // localStorage persistence — Node has a native localStorage (v22+), so
  // this exercises the real IO path, not a mock. Uses a throwaway key.
  const TEST_KEY = "morra-s03-playermodel-TEST-phaseG";
  PlayerModel.clearModel(TEST_KEY);
  check("loadModel: no stored data -> a fresh empty model", PlayerModel.loadModel(TEST_KEY).throws.length === 0);
  let m = PlayerModel.createEmptyModel();
  m = PlayerModel.recordThrow(m, { throwIndex: 1, playerFingers: 4 });
  m = PlayerModel.recordThrow(m, { throwIndex: 2, playerFingers: 2 });
  const saved = PlayerModel.saveModel(m, TEST_KEY);
  check("saveModel: reports success", saved === true);
  const reloaded = PlayerModel.loadModel(TEST_KEY);
  check("loadModel: round-trips exactly what was saved", reloaded.throws.length === 2 && reloaded.throws[1].playerFingers === 2, reloaded);
  PlayerModel.clearModel(TEST_KEY);
  check("clearModel: removes it (a fresh load is empty again)", PlayerModel.loadModel(TEST_KEY).throws.length === 0);
}
{
  const many = Array.from({ length: 3 }, (_, i) => ({ throwIndex: i }));
  let m = PlayerModel.createEmptyModel();
  for (const e of many) m = PlayerModel.recordThrow(m, e);
  check("recordThrow: does not exceed HISTORY_CAP behavior sanity (small case, no truncation yet)", m.throws.length === 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
