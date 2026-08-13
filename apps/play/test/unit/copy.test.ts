import { describe, expect, it } from "vitest";
import { roundResultText, voidDetail, SCOREBOARD_TEXT, GAME_END_TEXT } from "../../src/game/copy.js";

describe("copy — Catalan strings (verbatim spike port)", () => {
  it("roundResultText covers every phase", () => {
    expect(roundResultText("idle")).toBe("–");
    expect(roundResultText("analyzing")).toBe("…");
    expect(roundResultText("incomplete")).toBe("INCOMPLETE — try again");
    expect(roundResultText("void")).toBe("RONDA ANUL·LADA");
    expect(roundResultText("player")).toBe("TU GUANYES!");
    expect(roundResultText("ai")).toBe("RIVAL GUANYA");
    expect(roundResultText("parata")).toBe("PARATA");
  });
  it("voidDetail maps outcomes to reasons, with a generic fallback", () => {
    expect(voidDetail("voice-late")).toContain("too late");
    expect(voidDetail("voice-early")).toContain("too early");
    expect(voidDetail("hand-only")).toContain("no call word heard");
    expect(voidDetail("synced")).toContain("no hand onset seen");
    expect(voidDetail("hand-only")).toContain("torna-hi");
  });
  it("scoreboard + end banner formats", () => {
    expect(SCOREBOARD_TEXT(3, 7)).toBe("Tu 3 — 7 Rival");
    expect(GAME_END_TEXT("player", 10, 4)).toBe("Has guanyat 10-4!");
    expect(GAME_END_TEXT("ai", 3, 10)).toBe("Ha guanyat el rival 10-3.");
  });
});
