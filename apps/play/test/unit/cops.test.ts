// cops.test.ts — the named-move mapping (docs/cops-amb-nom-2026-08-25.md).
// Pure names only; the DOM choreography is exercised by the integration
// harness playing real rounds.
import { describe, expect, it } from "vitest";
import { COP_DEL_CORSARI, COP_DEL_GRUMET, copName } from "../../src/pirate/cops.js";

describe("cops: every verdict slams a NAME (the Gomu-Gomu insight)", () => {
  it("your win is the broadside, whoever the rival is", () => {
    expect(copName("guanyes", "L1")).toBe("BORDADA!");
    expect(copName("guanyes", "L4")).toBe(COP_DEL_GRUMET);
    expect(copName("guanyes", null)).toBe(COP_DEL_GRUMET);
  });
  it("each corsari lands his OWN signature move", () => {
    expect(copName("perds", "L1")).toBe("GANXO!");
    expect(copName("perds", "L2")).toBe("COP DE TIMÓ!");
    expect(copName("perds", "L3")).toBe("TALL DE MAREA!");
    expect(copName("perds", "L4")).toBe("L'ONADA NEGRA");
  });
  it("an unknown rival still gets a generic corsair blow (never a blank slam)", () => {
    expect(copName("perds", "L9")).toBe("COP DE CORSARI!");
    expect(copName("perds", null)).toBe("COP DE CORSARI!");
  });
  it("the tie wears two faces: the clash and the deflation", () => {
    expect(copName("empat")).toBe("EMPAT!");
    expect(copName("ningu")).toBe("PER A NINGÚ");
  });
  it("El Rei's move alone carries no exclamation — the deep doesn't shout", () => {
    for (const [level, name] of Object.entries(COP_DEL_CORSARI)) {
      if (level === "L4") expect(name.endsWith("!")).toBe(false);
      else expect(name.endsWith("!")).toBe(true);
    }
  });
});
