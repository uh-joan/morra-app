import { describe, expect, it } from "vitest";
import { computeMicatioVerdict, createEmptyModel, createSeededRandomSource, NUMBER_TO_CATALAN_CALL, type PlayerModel, type PlayerModelStore, type SecureRandomSource } from "@morra/core";
import { FakeClock } from "@morra/platform-web";
import {
  GameStore,
  GAME_WIN_SCORE,
  DEFAULT_SETTINGS,
  type GameSettings,
  type GameStoreDeps,
  type ProfileRegistry,
  type ProfileRegistryStore,
  type SettingsStore,
} from "../../src/game/gameStore.js";
import { emptyRegistry } from "../../src/profiles/profileTypes.js";

// Keyed in-memory PlayerModelStore — no localStorage needed for these
// tests. GameStore always passes an explicit profile-scoped key now
// (Feature 3), so this respects the `key` argument via a Map rather than a
// single shared model — which is also what makes it possible to construct
// TWO GameStore instances against the SAME underlying store and prove data
// really round-trips between them (the reload-persistence and
// profile-isolation suites below).
function makeMemoryStore(): PlayerModelStore {
  const models = new Map<string, PlayerModel>();
  return {
    load: (key = "default") => models.get(key) ?? createEmptyModel(),
    save: (m, key = "default") => {
      models.set(key, m);
      return true;
    },
    clear: (key = "default") => {
      models.delete(key);
      return true;
    },
  };
}

function makeMemorySettingsStore(): SettingsStore {
  const settings = new Map<string, GameSettings>();
  return {
    load: (profileId) => settings.get(profileId) ?? null,
    save: (profileId, s) => {
      settings.set(profileId, s);
      return true;
    },
  };
}

function makeMemoryProfileRegistryStore(initial?: ProfileRegistry): ProfileRegistryStore {
  let registry = initial ?? emptyRegistry();
  return {
    load: () => registry,
    save: (r) => {
      registry = r;
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

function makeStore(seed = 1, voskLoaded = true, depsOverride: Partial<GameStoreDeps> = {}) {
  return new GameStore(
    {
      playerModelStore: makeMemoryStore(),
      settingsStore: makeMemorySettingsStore(),
      profileRegistryStore: makeMemoryProfileRegistryStore(),
      random: createSeededRandomSource(seed),
      secureRandom: makeFakeSecureRandomSource(seed),
      clock: new FakeClock(),
      sessionId: "test-session",
      ...depsOverride,
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

describe("GameStore: Feature 1 fix — fist(0)/count(1) with no voice is a visible INCOMPLETE, never a silent reset", () => {
  // BUG this guards against: 186 silent deletions of throws-of-1 in one
  // real session — a settle at count <=1 with no voice used to be
  // classified as a "reset" and discarded with zero trace. It's now
  // treated exactly like counts 2-5's own hand-only case: no score/history
  // TOUCH (never revealed — fingerCount<2 never triggers phase-1), but a
  // real, visible "incomplete" outcome, not an invisible reset.
  it("fingerCount=0 (fist) with no voice -> clamped to a throw of 1, resolves incomplete once the word lands too, recorded into matchHistory", () => {
    const store = makeStore();
    store.onHandOnset(0, 1000);
    store.onAudioWindowResult(null); // no voice found anywhere in the window
    expect(store.getSnapshot().roundPhase).toBe("analyzing"); // still waiting on wordLanded — no more fast-path reset exit
    store.onWordResult(null);
    const s = store.getSnapshot();
    expect(s.roundPhase).toBe("incomplete");
    expect(s.gameScore).toEqual({ player: 0, ai: 0 });
    expect(s.matchHistory.length).toBe(1);
    expect(s.matchHistory[0]!.playerFingers).toBe(1); // Micatio has no zero — clamped
    expect(s.matchHistory[0]!.syncOutcome).toBe("hand-only");
    expect(s.matchHistory[0]!.verdictWinner).toBeNull();
  });

  it("the OLD reset gesture (fist retraction) no longer re-arms the ready pill on its own — only onGestureReset (Feature 2) or the stillness backstop does", () => {
    const store = makeStore();
    store.onHandOnset(0, 1000);
    store.onAudioWindowResult(null);
    store.onWordResult(null);
    expect(store.getSnapshot().handArmedForNextThrow).toBe(false); // an incomplete throw does NOT auto re-arm
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

  it("NOT revealed (fingerCount<=1, no voice disambiguation reaching synced) and no word recognized -> incomplete, commitment stands", () => {
    const store = makeStore();
    const hashBefore = store.getSnapshot().currentCommitHash;
    store.onHandOnset(1, 1000); // never phase-1 revealed
    store.onAudioWindowResult(2000); // late, and also no word
    store.onWordResult(null);
    const s = store.getSnapshot();
    expect(s.roundPhase).toBe("incomplete");
    expect(s.currentCommitHash).toBe(hashBefore); // same commitment stands — nothing was burned
  });

  it("an incomplete throw with a real (non-null) effectiveFingerCount is still RECORDED into matchHistory/playerModel, verdictWinner null, aiMove null — matches the spike's own recordMatchHistoryEntry call in the incomplete branch (playerFingers != null), found via the M5 live parity comparison against window.__s03, not assumed", () => {
    const store = makeStore();
    // fingerCount=1 with a (late, non-synced) voice onset present -> NOT a
    // reset (classifyHandSettleForSync forces effectiveFingerCount=1) —
    // never revealed (fingerCount never hit the phase-1 threshold) -> incomplete.
    store.onHandOnset(1, 1000);
    store.onAudioWindowResult(2000); // 1000ms late — non-synced
    store.onWordResult(null);
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
    store.onHandOnset(null, 1000); // no hand detected
    store.onAudioWindowResult(2000);
    store.onWordResult(null);
    const s = store.getSnapshot();
    expect(s.roundPhase).toBe("incomplete");
    expect(s.matchHistory.length).toBe(0);
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

  it("Feature 1 fix: a fist(0)+silence settle is now a REAL recorded throw of 1 in Entrenament — the bug this fixed was training data silently vanishing", () => {
    const store = makeStore();
    store.setMode("entrenament");
    store.onHandOnset(0, 1000);
    store.onAudioWindowResult(null);
    store.onWordResult(null);
    const s = store.getSnapshot();
    expect(s.playerModel.throws.length).toBe(1);
    expect(s.playerModel.throws[0]!.playerFingers).toBe(1);
  });

  it("a genuine reset (Feature 2's onGestureReset) in Entrenament records nothing", () => {
    const store = makeStore();
    store.setMode("entrenament");
    store.onHandOnset(3, 1000);
    store.onGestureReset("out-of-frame");
    expect(store.getSnapshot().playerModel.throws.length).toBe(0);
    expect(store.getSnapshot().handArmedForNextThrow).toBe(true);
  });
});

describe("GameStore: Feature 2 — the reset palette (onGestureReset)", () => {
  it("resetting with no throw in flight is a safe no-op that just (re-)confirms armed", () => {
    const store = makeStore();
    store.onGestureReset("out-of-frame");
    const s = store.getSnapshot();
    expect(s.handArmedForNextThrow).toBe(true);
    expect(s.throwInProgress).toBe(false);
    expect(s.matchHistory.length).toBe(0);
  });

  it("resetting a throw that was NEVER revealed (fingerCount<2, still analyzing) is a clean cancel — no matchHistory entry, no telemetry burn, commitment stands", () => {
    const store = makeStore();
    const hashBefore = store.getSnapshot().currentCommitHash;
    store.onHandOnset(1, 1000); // <2 -> never phase-1 revealed
    expect(store.getSnapshot().throwInProgress).toBe(true);
    store.onGestureReset("below-zone");
    const s = store.getSnapshot();
    expect(s.throwInProgress).toBe(false);
    expect(s.handArmedForNextThrow).toBe(true);
    expect(s.matchHistory.length).toBe(0);
    expect(s.gameScore).toEqual({ player: 0, ai: 0 });
    expect(s.currentCommitHash).toBe(hashBefore); // nothing was burned — same commitment stands
  });

  // HARDENING (real-session bug — spikes/logs/session-acfcf6f6.ndjson: a
  // false-positive reset firing between reveal and resolution burned 4 real
  // commitments in one session). A gesture reset on a REVEALED, still-
  // pending throw must now be a COMPLETE NO-OP — never burn, never touch
  // the throwEvent — letting the round resolve through the ordinary
  // tryResolve pipeline instead (incomplete/void/synced, whichever the
  // hand/voice data actually supports).
  it("the IN-FLIGHT ROUND LOCKOUT: resetting a REVEALED throw (fingerCount>=2, phase-1 already fired) is suppressed entirely — commitment stands, throwEvent untouched, round still resolves normally afterward", () => {
    const store = makeStore();
    store.onHandOnset(4, 1000); // >=2 -> phase-1 reveal fires immediately
    const revealed = store.getSnapshot();
    expect(revealed.displayedAiMove).not.toBeNull();
    const hashBefore = revealed.currentCommitHash;

    store.onGestureReset("wave"); // must be a no-op — the lockout
    const afterReset = store.getSnapshot();
    expect(afterReset.roundPhase).toBe("analyzing"); // unchanged — NOT resolved by the reset
    expect(afterReset.matchHistory.length).toBe(0); // nothing recorded
    expect(afterReset.currentCommitHash).toBe(hashBefore); // nothing burned
    expect(afterReset.throwInProgress).toBe(true); // the throw is still genuinely in flight

    // The round still resolves normally afterward, through the ordinary
    // pipeline — proving the lockout didn't just silently drop the throw.
    store.onAudioWindowResult(1050);
    store.onWordResult("vuit");
    const resolved = store.getSnapshot();
    expect(resolved.matchHistory.length).toBe(1);
    expect(["player", "ai", "parata"]).toContain(resolved.roundPhase);
  });

  it("once a revealed throw is HANDLED (already resolved), a later gesture reset is a normal clean cancel again — the lockout only covers the pending window", () => {
    const store = makeStore();
    store.onHandOnset(4, 1000);
    store.onAudioWindowResult(1050);
    store.onWordResult("vuit"); // resolves the round one way or another
    expect(store.getSnapshot().throwInProgress).toBe(false);
    const historyBefore = store.getSnapshot().matchHistory.length;
    store.onGestureReset("wave"); // no throw in flight anymore -> safe no-op
    expect(store.getSnapshot().matchHistory.length).toBe(historyBefore);
    expect(store.getSnapshot().handArmedForNextThrow).toBe(true);
  });

  it.each(["out-of-frame", "below-zone", "wave", "stillness"] as const)("%s is a valid ResetReason accepted by onGestureReset", (reason) => {
    const store = makeStore();
    expect(() => store.onGestureReset(reason)).not.toThrow();
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

describe("GameStore: reload persistence regression (BUG — reload appeared to wipe training data)", () => {
  // Root cause (found via a live headless-Chrome repro against the built
  // app, not guessed): EventBusTelemetrySink minted a brand-new random
  // sessionId on every page load; gameStore.ts stamps that id onto every
  // HistoryEntry and getMirrorData("session") — the Entrenament panel's
  // DEFAULT scope — filters by it. So a plain reload never actually lost
  // any data (PlayerModel.throws stayed fully intact in localStorage), but
  // the mirror's default view went completely empty because no prior throw
  // could ever match the new load's session id again. Fix:
  // appSingletons.ts now persists the session id in sessionStorage
  // (survives reload, cleared on real tab close — see
  // packages/platform-web/src/ports/sessionId.ts) so the SAME sessionId is
  // reused across a reload. These two tests simulate that exact scenario —
  // two separate GameStore instances (a "reload" is a fresh module/store
  // instance) sharing one underlying PlayerModelStore — first with the
  // fix's contract (same sessionId reused), then documenting the pre-fix
  // failure mode for contrast (different sessionId).
  it("a fresh GameStore backed by the SAME stores + SAME persisted sessionId (post-fix reload) still shows prior throws under the mirror's default session scope", () => {
    const playerModelStore = makeMemoryStore();
    const settingsStore = makeMemorySettingsStore();
    const profileRegistryStore = makeMemoryProfileRegistryStore();
    const storeBeforeReload = new GameStore(
      { playerModelStore, settingsStore, profileRegistryStore, random: createSeededRandomSource(1), secureRandom: makeFakeSecureRandomSource(1), clock: new FakeClock(), sessionId: "persisted-session-id" },
      true
    );
    storeBeforeReload.setMode("entrenament");
    storeBeforeReload.onHandOnset(3, 1000);
    storeBeforeReload.onAudioWindowResult(1050);
    storeBeforeReload.onWordResult("cinc");
    expect(storeBeforeReload.getSnapshot().playerModel.throws.length).toBe(1);

    const storeAfterReload = new GameStore(
      { playerModelStore, settingsStore, profileRegistryStore, random: createSeededRandomSource(2), secureRandom: makeFakeSecureRandomSource(2), clock: new FakeClock(), sessionId: "persisted-session-id" },
      true
    );
    expect(storeAfterReload.getSnapshot().playerModel.throws.length).toBe(1); // write model -> simulate fresh load -> data present
    expect(storeAfterReload.getMirrorData("session").histograms.f.total).toBe(1);
    expect(storeAfterReload.getMirrorData("allTime").histograms.f.total).toBe(1);
  });

  it("documents the bug: a DIFFERENT sessionId across the 'reload' hides prior throws from session scope even though the underlying data survived", () => {
    const playerModelStore = makeMemoryStore();
    const settingsStore = makeMemorySettingsStore();
    const profileRegistryStore = makeMemoryProfileRegistryStore();
    const storeBeforeReload = new GameStore(
      { playerModelStore, settingsStore, profileRegistryStore, random: createSeededRandomSource(1), secureRandom: makeFakeSecureRandomSource(1), clock: new FakeClock(), sessionId: "session-1" },
      true
    );
    storeBeforeReload.setMode("entrenament");
    storeBeforeReload.onHandOnset(3, 1000);
    storeBeforeReload.onAudioWindowResult(1050);
    storeBeforeReload.onWordResult("cinc");

    const storeAfterReload = new GameStore(
      { playerModelStore, settingsStore, profileRegistryStore, random: createSeededRandomSource(2), secureRandom: makeFakeSecureRandomSource(2), clock: new FakeClock(), sessionId: "session-2" },
      true
    );
    expect(storeAfterReload.getSnapshot().playerModel.throws.length).toBe(1); // the underlying data was never actually lost...
    expect(storeAfterReload.getMirrorData("session").histograms.f.total).toBe(0); // ...but looks wiped under the default session scope...
    expect(storeAfterReload.getMirrorData("allTime").histograms.f.total).toBe(1); // ...while All Time proves it was there the whole time.
  });

  it("reload persistence extends to SETTINGS too (Feature 3) — the same profileId's tuning survives a reconstruction", () => {
    const playerModelStore = makeMemoryStore();
    const settingsStore = makeMemorySettingsStore();
    const profileRegistryStore = makeMemoryProfileRegistryStore();
    const storeBeforeReload = new GameStore(
      { playerModelStore, settingsStore, profileRegistryStore, random: createSeededRandomSource(1), secureRandom: makeFakeSecureRandomSource(1), clock: new FakeClock(), sessionId: "s1" },
      true
    );
    storeBeforeReload.setSetting("vadMult", 12);
    storeBeforeReload.setResetPaletteSetting("belowZoneHeightPct", 30);

    const storeAfterReload = new GameStore(
      { playerModelStore, settingsStore, profileRegistryStore, random: createSeededRandomSource(2), secureRandom: makeFakeSecureRandomSource(2), clock: new FakeClock(), sessionId: "s1" },
      true
    );
    const s = storeAfterReload.getSnapshot().settings;
    expect(s.vadMult).toBe(12);
    expect(s.resetPalette.belowZoneHeightPct).toBe(30);
  });
});

describe("GameStore: Feature 3 — player profiles", () => {
  it("boots with the DEFAULT profile when the registry has never been saved", () => {
    const store = makeStore();
    const s = store.getSnapshot();
    expect(s.profileId).toBe("default");
    expect(s.profiles).toEqual([{ id: "default", name: "Jugador" }]);
  });

  it("createProfile adds a new profile, switches to it immediately, and persists the registry", () => {
    const profileRegistryStore = makeMemoryProfileRegistryStore();
    const store = makeStore(1, true, { profileRegistryStore });
    const created = store.createProfile("Jani");
    const s = store.getSnapshot();
    expect(s.profileId).toBe(created.id);
    expect(s.profiles.map((p) => p.name)).toEqual(["Jugador", "Jani"]);
    expect(profileRegistryStore.load().lastPlayedProfileId).toBe(created.id);
  });

  it("switching profiles resets in-progress round state (score, history, displayed AI move)", () => {
    const store = makeStore();
    store.onHandOnset(4, 1000); // phase-1 reveal fires, throwInProgress=true
    expect(store.getSnapshot().throwInProgress).toBe(true);
    const jani = store.createProfile("Jani");
    const s = store.getSnapshot();
    expect(s.profileId).toBe(jani.id);
    expect(s.throwInProgress).toBe(false);
    expect(s.matchHistory).toEqual([]);
    expect(s.gameScore).toEqual({ player: 0, ai: 0 });
    expect(s.displayedAiMove).toBeNull();
  });

  it("two profiles do NOT cross-contaminate models or settings", () => {
    const playerModelStore = makeMemoryStore();
    const settingsStore = makeMemorySettingsStore();
    const profileRegistryStore = makeMemoryProfileRegistryStore();
    const store = makeStore(1, true, { playerModelStore, settingsStore, profileRegistryStore });

    // Jani trains a throw and tweaks a setting.
    const jani = store.createProfile("Jani");
    store.setMode("entrenament");
    store.onHandOnset(2, 1000);
    store.onAudioWindowResult(1050);
    store.onWordResult("quatre");
    store.setSetting("vadMult", 15);
    expect(store.getSnapshot().playerModel.throws.length).toBe(1);

    // Rafa is a brand-new profile — must start EMPTY, not see Jani's throw or setting.
    const rafa = store.createProfile("Rafa");
    expect(store.getSnapshot().playerModel.throws.length).toBe(0);
    expect(store.getSnapshot().settings.vadMult).toBe(DEFAULT_SETTINGS.vadMult);

    // Rafa trains a DIFFERENT throw and a different setting value.
    store.onHandOnset(5, 2000);
    store.onAudioWindowResult(2050);
    store.onWordResult("nou");
    store.setSetting("vadMult", 3);

    // Switch back to Jani — his data/settings must be exactly as he left them.
    store.switchProfile(jani.id);
    const janiState = store.getSnapshot();
    expect(janiState.playerModel.throws.length).toBe(1);
    expect(janiState.playerModel.throws[0]!.playerFingers).toBe(2);
    expect(janiState.settings.vadMult).toBe(15);

    // And Rafa's is untouched by switching away and back.
    store.switchProfile(rafa.id);
    const rafaState = store.getSnapshot();
    expect(rafaState.playerModel.throws.length).toBe(1);
    expect(rafaState.playerModel.throws[0]!.playerFingers).toBe(5);
    expect(rafaState.settings.vadMult).toBe(3);
  });

  it("switchProfile to the ALREADY-active profile is a no-op (doesn't reset in-progress round state)", () => {
    const store = makeStore();
    store.onHandOnset(4, 1000);
    expect(store.getSnapshot().throwInProgress).toBe(true);
    store.switchProfile(store.getSnapshot().profileId);
    expect(store.getSnapshot().throwInProgress).toBe(true); // unchanged — genuinely a no-op
  });

  it("last-played default (Feature 3a): a fresh GameStore against the SAME registry store boots into whoever played last, not the hardcoded default", () => {
    const playerModelStore = makeMemoryStore();
    const settingsStore = makeMemorySettingsStore();
    const profileRegistryStore = makeMemoryProfileRegistryStore();
    const first = makeStore(1, true, { playerModelStore, settingsStore, profileRegistryStore });
    const jani = first.createProfile("Jani");

    // Simulate an app reload: a brand-new GameStore against the SAME registry store.
    const second = makeStore(2, true, { playerModelStore, settingsStore, profileRegistryStore });
    expect(second.getSnapshot().profileId).toBe(jani.id);
    expect(second.getSnapshot().profiles.map((p) => p.name)).toContain("Jani");
  });

  it("resetProfile only clears the ACTIVE profile — other profiles are untouched", () => {
    const playerModelStore = makeMemoryStore();
    const store = makeStore(1, true, { playerModelStore });
    const jani = store.createProfile("Jani");
    store.setMode("entrenament");
    store.onHandOnset(3, 1000);
    store.onAudioWindowResult(1050);
    store.onWordResult("sis");
    const rafa = store.createProfile("Rafa");
    store.onHandOnset(2, 2000);
    store.onAudioWindowResult(2050);
    store.onWordResult("quatre");
    expect(store.getSnapshot().playerModel.throws.length).toBe(1);

    store.resetProfile(); // resets Rafa (the active profile), NOT Jani
    expect(store.getSnapshot().playerModel.throws.length).toBe(0);

    store.switchProfile(jani.id);
    expect(store.getSnapshot().playerModel.throws.length).toBe(1); // Jani's data survived Rafa's reset
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

  it("Feature 1 fix: a fist(0)+silence settle still resolves (to void, since fingerCount=0 never phase-1-reveals) even with voskLoaded=false — not a silent reset", () => {
    const store = makeStore(1, false);
    store.onHandOnset(0, 1000);
    store.onAudioWindowResult(null);
    const s = store.getSnapshot();
    expect(s.throwInProgress).toBe(false);
    expect(s.roundPhase).toBe("incomplete"); // never revealed (count<2) -> incomplete, not void
    expect(s.matchHistory.length).toBe(1);
    expect(s.matchHistory[0]!.playerFingers).toBe(1);
  });

  it("a genuine gesture reset (Feature 2) on an UNREVEALED throw still resolves immediately even with voskLoaded=false", () => {
    const store = makeStore(1, false);
    store.onHandOnset(1, 1000); // <2 -> never phase-1 revealed, so NOT subject to the in-flight lockout
    store.onGestureReset("wave");
    const s = store.getSnapshot();
    expect(s.throwInProgress).toBe(false);
    expect(s.handArmedForNextThrow).toBe(true);
  });

  it("a gesture reset on a REVEALED throw is locked out (suppressed) regardless of voskLoaded", () => {
    const store = makeStore(1, false);
    store.onHandOnset(4, 1000); // >=2 -> phase-1 reveal fires
    expect(store.getSnapshot().displayedAiMove).not.toBeNull();
    store.onGestureReset("wave");
    expect(store.getSnapshot().throwInProgress).toBe(true); // untouched by the suppressed reset
  });
});
