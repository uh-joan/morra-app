import { describe, expect, it } from "vitest";
import { roundResultText, voidDetail, SCOREBOARD_TEXT, GAME_END_TEXT } from "../../src/game/copy.js";

describe("copy — Catalan strings (ux-pirates: all-Catalan pass over the spike port)", () => {
  it("roundResultText covers every phase", () => {
    expect(roundResultText("idle")).toBe("–");
    expect(roundResultText("analyzing")).toBe("…");
    expect(roundResultText("incomplete")).toBe("INCOMPLETA — torna-hi");
    // FROZEN: the parity harness compares these against the untouched spike.
    expect(roundResultText("void")).toBe("RONDA ANUL·LADA");
    expect(roundResultText("player")).toBe("TU GUANYES!");
    expect(roundResultText("ai")).toBe("RIVAL GUANYA");
    // 2026-08-21 field verdict: «PARATA» is not living Catalan — the
    // context-free card says CAP PUNT (the banner picks EMPAT!/PER A NINGÚ)
    expect(roundResultText("parata")).toBe("CAP PUNT");
  });
  it("voidDetail maps outcomes to reasons, with a generic fallback", () => {
    expect(voidDetail("voice-late")).toContain("massa tard");
    expect(voidDetail("voice-early")).toContain("massa aviat");
    expect(voidDetail("hand-only")).toContain("cap crit sentit");
    expect(voidDetail("synced")).toContain("cap tirada de mà vista");
    expect(voidDetail("hand-only")).toContain("torna-hi");
  });
  it("scoreboard + end banner formats (FROZEN: harnesses parse these)", () => {
    expect(SCOREBOARD_TEXT(3, 7)).toBe("Tu 3 — 7 Rival");
    expect(GAME_END_TEXT("player", 10, 4)).toBe("Has guanyat 10-4!");
    expect(GAME_END_TEXT("ai", 3, 10)).toBe("Ha guanyat el rival 10-3.");
  });
});
