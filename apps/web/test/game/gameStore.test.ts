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
      store.onHandOnset(3, 1000); // phase-1 reveal fires (>=2)
      const revealed = store.getSnapshot().displayedAiMove!;
      expect(revealed).toEqual(aiMove); // the move actually revealed is the one that was committed

      const playerCall = 6; // fingers(3) + guess(3) — a fixed, legal call
      store.onAudioWindowResult(1050); // within the default 400ms co-occurrence window of handOnsetPerfTime=1000
      store.onWordResult(NUMBER_TO_CATALAN_CALL[playerCall]!);

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
    store.onHandOnset(4, 1000);
    store.onAudioWindowResult(1100); // 100ms after onset, well within 400ms co-occurrence
    store.onWordResult("cinc"); // playerCall = 5
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
    store.onHandOnset(0, 1000);
    store.onAudioWindowResult(null); // no voice found anywhere in the window
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
    store.onHandOnset(5, 1000); // >=2 -> phase-1 reveal fires
    store.onAudioWindowResult(2000); // 1000ms late — outside the 400ms co-occurrence window -> voice-late
    store.onWordResult("deu");
    const s = store.getSnapshot();
    expect(s.roundPhase).toBe("void");
    expect(s.voidOutcome).toBe("voice-late");
    expect(s.gameScore).toEqual({ player: 0, ai: 0 });
    expect(s.matchHistory.length).toBe(1);
    expect(s.matchHistory[0]!.verdictWinner).toBeNull();
  });

  it("NOT revealed (fingerCount<=1, no voice disambiguation reaching synced) and no word recognized -> incomplete, commitment stands, nothing recorded", () => {
    const store = makeStore();
    const hashBefore = store.getSnapshot().currentCommitHash;
    store.onHandOnset(1, 1000); // never phase-1 revealed
    store.onAudioWindowResult(2000); // late, and also no word
    store.onWordResult(null);
    const s = store.getSnapshot();
    expect(s.roundPhase).toBe("incomplete");
    expect(s.matchHistory.length).toBe(0);
    expect(s.currentCommitHash).toBe(hashBefore); // same commitment stands — nothing was burned
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
      store.onHandOnset(3, 1000 + guard * 10000);
      store.onAudioWindowResult(1050 + guard * 10000);
      store.onWordResult(NUMBER_TO_CATALAN_CALL[total]!);
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
    store.onHandOnset(2, 1000);
    store.onAudioWindowResult(1050);
    store.onWordResult("quatre");
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
    store.onHandOnset(0, 1000);
    store.onAudioWindowResult(null);
    expect(store.getSnapshot().playerModel.throws.length).toBe(0);
  });
});

describe("GameStore: settings.coOccurrenceMs affects synced classification", () => {
  it("a voice onset that's synced under a widened window but late under the default is honored", () => {
    const store = makeStore();
    store.setSetting("coOccurrenceMs", 1000);
    store.onHandOnset(3, 1000); // phase-1 reveal
    store.onAudioWindowResult(1900); // 900ms late — within the widened 1000ms window
    store.onWordResult("cinc");
    expect(store.getSnapshot().roundPhase).not.toBe("void");
  });
});

describe("GameStore: mirror data and profile export/reset", () => {
  it("getMirrorData reflects recorded Entrenament throws, session-scoped by sessionId", () => {
    const store = makeStore();
    store.setMode("entrenament");
    store.onHandOnset(3, 1000);
    store.onAudioWindowResult(1050);
    store.onWordResult("cinc");
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
    store.onHandOnset(2, 1000);
    store.onAudioWindowResult(1050);
    store.onWordResult("dos");
    expect(store.getSnapshot().playerModel.throws.length).toBe(1);
    store.resetProfile();
    expect(store.getSnapshot().playerModel.throws.length).toBe(0);
  });
});

describe("GameStore: vosk not loaded — an honest degrade, not a silent one", () => {
  it("with voskLoaded=false, wordLanded starts true and every round resolves WITHOUT waiting for a word — since no word can ever be recognized, every round ends up void/incomplete rather than scoring, exactly as a real session with no working voice model would", () => {
    const store = makeStore(1, false);
    store.onHandOnset(3, 1000); // phase-1 reveal fires
    store.onAudioWindowResult(1050); // synced timing-wise, but no word ever lands
    const s = store.getSnapshot();
    expect(s.roundPhase).toBe("void"); // rivalRevealed was true, so this is a void, not a bare incomplete
    expect(s.matchHistory[0]!.verdictWinner).toBeNull();
    expect(s.gameScore).toEqual({ player: 0, ai: 0 });
  });

  it("a reset still resolves immediately even with voskLoaded=false", () => {
    const store = makeStore(1, false);
    store.onHandOnset(0, 1000);
    store.onAudioWindowResult(null);
    const s = store.getSnapshot();
    expect(s.throwInProgress).toBe(false);
    expect(s.handArmedForNextThrow).toBe(true);
  });
});
