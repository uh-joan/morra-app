import { describe, expect, it } from "vitest";
import { computeMicatioVerdict, createEmptyModel, createSeededRandomSource, NUMBER_TO_CATALAN_CALL, type PlayerModel, type PlayerModelStore, type SecureRandomSource } from "@morra/core";
import { FakeClock } from "@morra/platform-web";
import { GameStore, GAME_WIN_SCORE } from "../../src/game/gameStore.js";

// Fully in-memory PlayerModelStore — no localStorage needed for these tests.
function makeMemoryStore(): PlayerModelStore {
  let model: PlayerModel = createEmptyModel();
  return {
    load: () => model,
    save: (m) => {
      model = m;
      return true;
    },
    clear: () => {
      model = createEmptyModel();
      return true;
    },
  };
}

// A deterministic SecureRandomSource TEST DOUBLE — same rationale as
// packages/core/test/commit.test.ts's makeSeededSecureRandomSource: fine as
// a private, non-exported test fixture, never as a production factory
// (that's exactly what the SecureRandomSource/RandomSource split, security
// audit M6, prevents at the type level).
function makeFakeSecureRandomSource(seed: number): SecureRandomSource {
  let a = seed >>> 0;
  function nextUint32(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }
  return {
    nextSecureBytes(length: number): Uint8Array {
      const out = new Uint8Array(length);
      for (let i = 0; i < length; i++) out[i] = nextUint32() & 0xff;
      return out;
    },
  };
}

function makeStore(seed = 1, voskLoaded = true) {
  return new GameStore(
    {
      playerModelStore: makeMemoryStore(),
      random: createSeededRandomSource(seed),
      secureRandom: makeFakeSecureRandomSource(seed),
      clock: new FakeClock(),
      sessionId: "test-session",
    },
    // voskLoaded=true (the default the rest of this suite uses):
    // onHandOnset's throwEvent.wordLanded starts FALSE, so tryResolve()
    // correctly WAITS for an explicit onWordResult() call rather than
    // resolving prematurely on the audio-window result alone.
    voskLoaded
  );
}

describe("GameStore: construction", () => {
  it("starts in partida mode, L2, 0-0, ready, with a fresh commitment already minted", () => {
    const store = makeStore();
    const s = store.getSnapshot();
    expect(s.mode).toBe("partida");
    expect(s.aiLevel).toBe("L2");
    expect(s.gameScore).toEqual({ player: 0, ai: 0 });
    expect(s.handArmedForNextThrow).toBe(true);
    expect(s.currentAiMove).not.toBeNull();
    expect(s.currentCommitHash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.displayedAiMove).toBeNull(); // secret, not yet revealed
  });
});

describe("GameStore: onHandOnset returns a throwId", () => {
  it("returns a truthy, distinct id per throw — CRITICAL FIX plumbing: sensorPipeline.ts must thread this into the matching onAudioWindowResult/onWordResult calls (see gameStore.ts's ThrowEventState.id comment)", () => {
    const store = makeStore();
    const id1 = store.onHandOnset(3, 1000);
    store.onAudioWindowResult(1050, id1);
    store.onWordResult("cinc", id1);
    const id2 = store.onHandOnset(3, 2000);
    expect(id1).toBeGreaterThan(0);
    expect(id2).toBeGreaterThan(0);
    expect(id2).not.toBe(id1);
  });

  it("returns 0 (no throw created) when the game is already over in partida mode", () => {
    const store = makeStore(7);
    let guard = 0;
    while (!store.getSnapshot().gameOver && guard < 500) {
      guard++;
      const aiMove = store.getSnapshot().currentAiMove!;
      const total = 3 + aiMove.fingers;
      const id = store.onHandOnset(3, 1000 + guard * 10000);
      store.onAudioWindowResult(1050 + guard * 10000, id);
      store.onWordResult(NUMBER_TO_CATALAN_CALL[total]!, id);
    }
    expect(store.getSnapshot().gameOver).toBe(true);
    expect(store.onHandOnset(3, 999999)).toBe(0);
  });

  it("a stale/unknown throwId passed to onAudioWindowResult or onWordResult is a safe no-op", () => {
    const store = makeStore();
    expect(() => store.onAudioWindowResult(1234, 999999)).not.toThrow();
    expect(() => store.onWordResult("cinc", 999999)).not.toThrow();
    expect(store.getSnapshot().matchHistory.length).toBe(0);
  });
});

describe("GameStore: phase-1 reveal (fingerCount >= 2)", () => {
  it("reveals immediately on hand onset, verified, and mints a fresh secret commitment", () => {
    const store = makeStore();
    const priorHash = store.getSnapshot().currentCommitHash;
    store.onHandOnset(3, 1000);
    const s = store.getSnapshot();
    expect(s.displayedAiMove).not.toBeNull();
    expect(s.displayedVerified).toBe(true);
    expect(s.displayedCommitHash).toBe(priorHash); // the hash that was actually verified
    expect(s.currentCommitHash).not.toBe(priorHash); // burned + re-minted in the background
    expect(s.throwInProgress).toBe(true);
  });

  it("does NOT reveal for fingerCount <= 1 (waits for voice disambiguation)", () => {
    const store = makeStore();
    store.onHandOnset(1, 1000);
    expect(store.getSnapshot().displayedAiMove).toBeNull();
  });
});

describe("GameStore: a full synced round resolves with the correct verdict", () => {
  it("player wins, ai wins, or parata — matches core's own computeMicatioVerdict for the actual revealed move, across several seeds", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const store = makeStore(seed);
      const aiMove = store.getSnapshot().currentAiMove!;
      const id = store.onHandOnset(3, 1000); // phase-1 reveal fires (>=2)
      const revealed = store.getSnapshot().displayedAiMove!;
      expect(revealed).toEqual(aiMove); // the move actually revealed is the one that was committed

      const playerCall = 6; // fingers(3) + guess(3) — a fixed, legal call
      store.onAudioWindowResult(1050, id); // within the default 400ms co-occurrence window of handOnsetPerfTime=1000
      store.onWordResult(NUMBER_TO_CATALAN_CALL[playerCall]!, id);

      const expected = computeMicatioVerdict(3, playerCall, aiMove.fingers, aiMove.call);
      const s = store.getSnapshot();
      expect(s.roundPhase).toBe(expected.winner);
      expect(s.matchHistory[0]!.verdictWinner).toBe(expected.winner);
    }
  });
});

describe("GameStore: a genuinely synced round with a real Catalan word scores correctly", () => {
  it("computes the SAME verdict core's computeMicatioVerdict would for the real revealed AI move", () => {
    const store = makeStore(42);
    const aiMove = store.getSnapshot().currentAiMove!;
    const id = store.onHandOnset(4, 1000);
    store.onAudioWindowResult(1100, id); // 100ms after onset, well within 400ms co-occurrence
    store.onWordResult("cinc", id); // playerCall = 5
    const s = store.getSnapshot();
    const expected = computeMicatioVerdict(4, 5, aiMove.fingers, aiMove.call);
    expect(s.roundPhase).toBe(expected.winner);
    if (expected.winner === "player") expect(s.gameScore.player).toBe(1);
    else if (expected.winner === "ai") expect(s.gameScore.ai).toBe(1);
    else expect(s.gameScore).toEqual({ player: 0, ai: 0 });
    expect(s.matchHistory.length).toBe(1);
    expect(s.matchHistory[0]!.verdictWinner).toBe(expected.winner);
    expect(s.throwInProgress).toBe(false);
    expect(s.handArmedForNextThrow).toBe(false); // must return to fist before the next throw arms
    expect(s.lastThrownFingerCount).toBe(4);
  });
});

describe("GameStore: reset (fist retraction) never touches the game", () => {
  it("fingerCount <= 1 with no voice onset -> reset, no score/history change, ready pill re-arms immediately", () => {
    const store = makeStore();
    const id = store.onHandOnset(0, 1000);
    store.onAudioWindowResult(null, id); // no voice found anywhere in the window
    const s = store.getSnapshot();
    expect(s.matchHistory.length).toBe(0);
    expect(s.gameScore).toEqual({ player: 0, ai: 0 });
    expect(s.throwInProgress).toBe(false);
    expect(s.handArmedForNextThrow).toBe(true);
  });
});

describe("GameStore: void (RONDA ANUL·LADA) vs incomplete", () => {
  it("revealed but not synced -> void, recorded with verdictWinner null, does NOT touch score", () => {
    const store = makeStore();
    const id = store.onHandOnset(5, 1000); // >=2 -> phase-1 reveal fires
    store.onAudioWindowResult(2000, id); // 1000ms late — outside the 400ms co-occurrence window -> voice-late
    store.onWordResult("deu", id);
    const s = store.getSnapshot();
    expect(s.roundPhase).toBe("void");
    expect(s.voidOutcome).toBe("voice-late");
    expect(s.gameScore).toEqual({ player: 0, ai: 0 });
    expect(s.matchHistory.length).toBe(1);
    expect(s.matchHistory[0]!.verdictWinner).toBeNull();
  });

  it("NOT revealed (fingerCount<=1, no voice disambiguation reaching synced) and no word recognized -> incomplete, commitment stands", () => {
    const store = makeStore();
    const hashBefore = store.getSnapshot().currentCommitHash;
    const id = store.onHandOnset(1, 1000); // never phase-1 revealed
    store.onAudioWindowResult(2000, id); // late, and also no word
    store.onWordResult(null, id);
    const s = store.getSnapshot();
    expect(s.roundPhase).toBe("incomplete");
    expect(s.currentCommitHash).toBe(hashBefore); // same commitment stands — nothing was burned
  });

  it("an incomplete throw with a real (non-null) effectiveFingerCount is still RECORDED into matchHistory/playerModel, verdictWinner null, aiMove null — matches the spike's own recordMatchHistoryEntry call in the incomplete branch (playerFingers != null), found via the M5 live parity comparison against window.__s03, not assumed", () => {
    const store = makeStore();
    // fingerCount=1 with a (late, non-synced) voice onset present -> NOT a
    // reset (classifyHandSettleForSync forces effectiveFingerCount=1) —
    // never revealed (fingerCount never hit the phase-1 threshold) -> incomplete.
    const id = store.onHandOnset(1, 1000);
    store.onAudioWindowResult(2000, id); // 1000ms late — non-synced
    store.onWordResult(null, id);
    const s = store.getSnapshot();
    expect(s.roundPhase).toBe("incomplete");
    expect(s.matchHistory.length).toBe(1);
    expect(s.matchHistory[0]!.playerFingers).toBe(1);
    expect(s.matchHistory[0]!.verdictWinner).toBeNull();
    expect(s.matchHistory[0]!.aiFingers).toBeNull();
    expect(s.gameScore).toEqual({ player: 0, ai: 0 });
  });

  it("an incomplete throw with NO detected hand at all (effectiveFingerCount null) records NOTHING — matches the spike's `if (playerFingers != null)` guard", () => {
    const store = makeStore();
    const id = store.onHandOnset(null, 1000); // no hand detected
    store.onAudioWindowResult(2000, id);
    store.onWordResult(null, id);
    const s = store.getSnapshot();
    expect(s.roundPhase).toBe("incomplete");
    expect(s.matchHistory.length).toBe(0);
  });
});

describe("GameStore: CRITICAL FIX — the throwEvent overwrite race (real-session bug)", () => {
  // Root cause (confirmed via a failing-test-first repro before this fix
  // landed): gameStore.ts used to track ONE mutable `this.throwEvent`
  // field, unconditionally overwritten by every onHandOnset() call.
  // sensorPipeline.ts schedules a throw's own audio/word recognition
  // ~700ms+ in the future; if the player's hand naturally retracted (a
  // completely normal motion after ANY throw) before that window closed, a
  // NEW onHandOnset() call replaced this.throwEvent — so when the ORIGINAL
  // throw's recognition finally landed, it silently corrupted whatever
  // throw happened to be current by then: wrong player fingers, a
  // prematurely-revealed NEXT round's still-secret AI commitment, a
  // fabricated verdict. Not just "burns the commitment" — actual game-state
  // corruption. Fixed by threading a throwId through the public API so each
  // throw's own recognition can only ever resolve ITSELF.
  it("(a) a synced throw whose hand retracts 100ms later (before its own recognition lands) still resolves correctly on its OWN data — verdict lands, score updates, zero corruption", () => {
    const store = makeStore(7);
    const aiMoveBefore = store.getSnapshot().currentAiMove!;
    const idA = store.onHandOnset(4, 1000); // real throw, phase-1 reveals
    const revealedA = store.getSnapshot().displayedAiMove!;
    expect(revealedA).toEqual(aiMoveBefore);

    // 100ms later: the player's hand naturally retracts to a fist — exactly
    // what sensorPipeline's velocity-based onset detector fires a NEW
    // onHandOnset for in real use, well before round A's own audio window
    // (scheduled for ~700ms+ after t=1000) has resolved.
    const idB = store.onHandOnset(0, 1100);
    expect(idB).not.toBe(idA);

    // Round A's OWN recognition lands now, using its OWN throwId — this
    // must resolve A, not whatever throw happens to be "current".
    store.onAudioWindowResult(1050, idA); // 50ms after A's real onset — genuinely synced for A
    store.onWordResult("vuit", idA); // A's real spoken word (8 = fingers(4)+guess(4))

    const s = store.getSnapshot();
    expect(s.matchHistory.length).toBe(1);
    expect(s.matchHistory[0]!.playerFingers).toBe(4); // A's REAL fingers, not the fist's
    expect(s.matchHistory[0]!.aiFingers).toBe(revealedA.fingers); // the move ACTUALLY revealed to the player, never a later still-secret one
    expect(s.matchHistory[0]!.verdictWinner).not.toBeNull();
    expect(["player", "ai", "parata"]).toContain(s.roundPhase);

    // B (the fist) can still independently resolve too, once its own
    // window lands — it must never be silently dropped either.
    store.onAudioWindowResult(null, idB);
    expect(store.getSnapshot().handArmedForNextThrow).toBe(true); // B's own reset resolution
  });

  it("(b) a hand-only throw whose hand retracts before recognition lands resolves as its OWN honest outcome (void/incomplete), never corrupted by the retraction, and the commitment burn (if any) is based on A's OWN true data", () => {
    const store = makeStore(3);
    const idA = store.onHandOnset(5, 1000); // >=2 -> revealed
    const revealedA = store.getSnapshot().displayedAiMove!;
    const idB = store.onHandOnset(0, 1100); // retraction, a totally separate throw now

    // A's own window finds NO voice at all — a genuine hand-only outcome
    // for A, nothing to do with B.
    store.onAudioWindowResult(null, idA);
    store.onWordResult(null, idA);

    const s = store.getSnapshot();
    expect(s.roundPhase).toBe("void"); // A was revealed but never synced -> void
    expect(s.voidOutcome).toBe("hand-only");
    expect(s.matchHistory.length).toBe(1);
    expect(s.matchHistory[0]!.playerFingers).toBe(5); // A's own real raw count — count>=2 passes through classifyHandSettleForSync unaffected by voice
    expect(s.matchHistory[0]!.aiFingers).toBe(revealedA.fingers); // burned the move that was ACTUALLY revealed, not a later one
    expect(s.gameScore).toEqual({ player: 0, ai: 0 }); // never scores from a burn

    // B (the retraction) still resolves independently and cleanly.
    store.onAudioWindowResult(null, idB);
    expect(store.getSnapshot().handArmedForNextThrow).toBe(true);
  });

  it("(c) starting a genuinely NEW throw does not prevent the OLD unresolved revealed round from resolving correctly when its own recognition later lands", () => {
    const store = makeStore(11);
    const idA = store.onHandOnset(3, 1000);
    const revealedA = store.getSnapshot().displayedAiMove!;
    // A NEW throw starts while A is still unresolved.
    const idC = store.onHandOnset(4, 1200);
    const revealedC = store.getSnapshot().displayedAiMove!;
    expect(revealedC).not.toEqual(revealedA); // C got its OWN, later commitment revealed

    // A's own recognition lands late, with A's own genuinely synced data.
    store.onAudioWindowResult(1050, idA);
    store.onWordResult("sis", idA); // 6 = fingers(3)+guess(3)

    const afterA = store.getSnapshot();
    expect(afterA.matchHistory.length).toBe(1);
    expect(afterA.matchHistory[0]!.playerFingers).toBe(3);
    expect(afterA.matchHistory[0]!.aiFingers).toBe(revealedA.fingers);

    // C then resolves independently too, on its OWN data.
    store.onAudioWindowResult(1250, idC);
    store.onWordResult("vuit", idC); // 8 = fingers(4)+guess(4)
    const afterC = store.getSnapshot();
    expect(afterC.matchHistory.length).toBe(2);
    expect(afterC.matchHistory[1]!.playerFingers).toBe(4);
    expect(afterC.matchHistory[1]!.aiFingers).toBe(revealedC.fingers);
  });
});

describe("GameStore: first-to-10 scoreboard and resetGame", () => {
  it("gameOver fires once a side reaches GAME_WIN_SCORE, and resetGame() clears it", () => {
    const store = makeStore(7);
    // Always throw a fixed 3 fingers and call the REAL total (3 + AI's
    // fingers) — the player is therefore correct every round by
    // construction; the AI is only ALSO correct (forcing a parata) on the
    // rounds where its own guess happens to be exactly 3, so the player
    // steadily accumulates wins and the loop is guaranteed to terminate
    // well before the guard trips.
    let guard = 0;
    while (!store.getSnapshot().gameOver && guard < 500) {
      guard++;
      const aiMove = store.getSnapshot().currentAiMove!;
      const total = 3 + aiMove.fingers;
      const id = store.onHandOnset(3, 1000 + guard * 10000);
      store.onAudioWindowResult(1050 + guard * 10000, id);
      store.onWordResult(NUMBER_TO_CATALAN_CALL[total]!, id);
    }
    expect(guard).toBeLessThan(500); // sanity: the loop actually terminated
    const s = store.getSnapshot();
    expect(s.gameOver).toBe(true);
    expect(s.gameEndWinner).not.toBeNull();
    expect(Math.max(s.gameScore.player, s.gameScore.ai)).toBeGreaterThanOrEqual(GAME_WIN_SCORE);

    store.resetGame();
    const reset = store.getSnapshot();
    expect(reset.gameScore).toEqual({ player: 0, ai: 0 });
    expect(reset.gameOver).toBe(false);
    expect(reset.matchHistory).toEqual([]);
    expect(reset.gameEndWinner).toBeNull();
  });
});

describe("GameStore: Entrenament mode records training throws, no opponent/score", () => {
  it("records a non-reset throw into playerModel without touching matchHistory/gameScore", () => {
    const store = makeStore();
    store.setMode("entrenament");
    const id = store.onHandOnset(2, 1000);
    store.onAudioWindowResult(1050, id);
    store.onWordResult("quatre", id);
    const s = store.getSnapshot();
    expect(s.matchHistory.length).toBe(0);
    expect(s.gameScore).toEqual({ player: 0, ai: 0 });
    expect(s.playerModel.throws.length).toBe(1);
    expect(s.playerModel.throws[0]!.playerFingers).toBe(2);
    expect(s.playerModel.throws[0]!.aiFingers).toBeNull();
    expect(s.playerModel.throws[0]!.verdictWinner).toBeNull();
    expect(s.displayedAiMove).toBeNull(); // no opponent/commitment in Entrenament
  });

  it("a reset in Entrenament records nothing", () => {
    const store = makeStore();
    store.setMode("entrenament");
    const id = store.onHandOnset(0, 1000);
    store.onAudioWindowResult(null, id);
    expect(store.getSnapshot().playerModel.throws.length).toBe(0);
  });
});

describe("GameStore: settings.coOccurrenceMs affects synced classification", () => {
  it("a voice onset that's synced under a widened window but late under the default is honored", () => {
    const store = makeStore();
    store.setSetting("coOccurrenceMs", 1000);
    const id = store.onHandOnset(3, 1000); // phase-1 reveal
    store.onAudioWindowResult(1900, id); // 900ms late — within the widened 1000ms window
    store.onWordResult("cinc", id);
    expect(store.getSnapshot().roundPhase).not.toBe("void");
  });
});

describe("GameStore: mirror data and profile export/reset", () => {
  it("getMirrorData reflects recorded Entrenament throws, session-scoped by sessionId", () => {
    const store = makeStore();
    store.setMode("entrenament");
    const id = store.onHandOnset(3, 1000);
    store.onAudioWindowResult(1050, id);
    store.onWordResult("cinc", id);
    const mirror = store.getMirrorData("session");
    expect(mirror.histograms.f.total).toBe(1);
    expect(mirror.histograms.f.list.find((e) => e.value === 3)?.count).toBe(1);
  });

  it("exportProfileJson round-trips the current playerModel", () => {
    const store = makeStore();
    const json = store.exportProfileJson();
    expect(JSON.parse(json)).toEqual(store.getSnapshot().playerModel);
  });

  it("resetProfile wipes ALL-TIME data via the injected store", () => {
    const store = makeStore();
    store.setMode("entrenament");
    const id = store.onHandOnset(2, 1000);
    store.onAudioWindowResult(1050, id);
    store.onWordResult("dos", id);
    expect(store.getSnapshot().playerModel.throws.length).toBe(1);
    store.resetProfile();
    expect(store.getSnapshot().playerModel.throws.length).toBe(0);
  });
});

describe("GameStore: vosk not loaded — an honest degrade, not a silent one", () => {
  it("with voskLoaded=false, wordLanded starts true and every round resolves WITHOUT waiting for a word — since no word can ever be recognized, every round ends up void/incomplete rather than scoring, exactly as a real session with no working voice model would", () => {
    const store = makeStore(1, false);
    const id = store.onHandOnset(3, 1000); // phase-1 reveal fires
    store.onAudioWindowResult(1050, id); // synced timing-wise, but no word ever lands
    const s = store.getSnapshot();
    expect(s.roundPhase).toBe("void"); // rivalRevealed was true, so this is a void, not a bare incomplete
    expect(s.matchHistory[0]!.verdictWinner).toBeNull();
    expect(s.gameScore).toEqual({ player: 0, ai: 0 });
  });

  it("a reset still resolves immediately even with voskLoaded=false", () => {
    const store = makeStore(1, false);
    const id = store.onHandOnset(0, 1000);
    store.onAudioWindowResult(null, id);
    const s = store.getSnapshot();
    expect(s.throwInProgress).toBe(false);
    expect(s.handArmedForNextThrow).toBe(true);
  });
});
