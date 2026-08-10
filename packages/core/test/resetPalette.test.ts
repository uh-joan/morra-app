import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESET_PALETTE_CONFIG,
  INITIAL_RESET_PALETTE_STATE,
  stepResetPalette,
  type ResetPaletteConfig,
  type ResetPaletteTrackerState,
} from "../src/resetPalette.js";

const HAND_PRESENT_STATE: ResetPaletteTrackerState = { wasHandPresent: true, wasBelowZone: false };

describe("resetPalette: out-of-frame", () => {
  it("hand present -> absent fires 'out-of-frame' exactly once (edge-triggered)", () => {
    const first = stepResetPalette(HAND_PRESENT_STATE, { count: null, handCenterY: null, lateralVelocity: null });
    expect(first.reason).toBe("out-of-frame");
    const second = stepResetPalette(first.state, { count: null, handCenterY: null, lateralVelocity: null });
    expect(second.reason).toBeNull(); // still gone, but already fired — no repeat spam
  });

  it("hand present the whole time never fires", () => {
    const r = stepResetPalette(HAND_PRESENT_STATE, { count: 3, handCenterY: 0.4, lateralVelocity: 0.1 });
    expect(r.reason).toBeNull();
  });

  it("disabled via config -> no reason even on a real transition", () => {
    const config: ResetPaletteConfig = { ...DEFAULT_RESET_PALETTE_CONFIG, outOfFrameEnabled: false };
    const r = stepResetPalette(HAND_PRESENT_STATE, { count: null, handCenterY: null, lateralVelocity: null }, config);
    expect(r.reason).toBeNull();
  });

  it("hand never present -> no false fire on the very first frame", () => {
    const r = stepResetPalette(INITIAL_RESET_PALETTE_STATE, { count: null, handCenterY: null, lateralVelocity: null });
    expect(r.reason).toBeNull();
  });
});

describe("resetPalette: below-zone", () => {
  const config: ResetPaletteConfig = { ...DEFAULT_RESET_PALETTE_CONFIG, belowZoneHeightPct: 15 };

  it("hand crossing into the bottom 15% fires 'below-zone' exactly once", () => {
    const above = stepResetPalette(INITIAL_RESET_PALETTE_STATE, { count: 3, handCenterY: 0.5, lateralVelocity: 0.1 }, config);
    expect(above.reason).toBeNull();
    const crossing = stepResetPalette(above.state, { count: 3, handCenterY: 0.9, lateralVelocity: 0.1 }, config);
    expect(crossing.reason).toBe("below-zone");
    const staying = stepResetPalette(crossing.state, { count: 3, handCenterY: 0.95, lateralVelocity: 0.1 }, config);
    expect(staying.reason).toBeNull(); // still below, but already fired
  });

  it("leaving and re-entering the zone fires again", () => {
    const crossing = stepResetPalette(INITIAL_RESET_PALETTE_STATE, { count: 3, handCenterY: 0.9, lateralVelocity: 0.1 }, config);
    expect(crossing.reason).toBe("below-zone");
    const leaving = stepResetPalette(crossing.state, { count: 3, handCenterY: 0.3, lateralVelocity: 0.1 }, config);
    expect(leaving.reason).toBeNull();
    const reentering = stepResetPalette(leaving.state, { count: 3, handCenterY: 0.92, lateralVelocity: 0.1 }, config);
    expect(reentering.reason).toBe("below-zone");
  });

  it("exactly at the boundary (1 - pct/100) counts as below", () => {
    const r = stepResetPalette(INITIAL_RESET_PALETTE_STATE, { count: 3, handCenterY: 0.85, lateralVelocity: 0.1 }, config);
    expect(r.reason).toBe("below-zone");
  });

  it("disabled via config -> no reason", () => {
    const disabled: ResetPaletteConfig = { ...config, belowZoneEnabled: false };
    const r = stepResetPalette(INITIAL_RESET_PALETTE_STATE, { count: 3, handCenterY: 0.99, lateralVelocity: 0.1 }, disabled);
    expect(r.reason).toBeNull();
  });

  it("a smaller configured zone height moves the boundary", () => {
    const tighterZone: ResetPaletteConfig = { ...config, belowZoneHeightPct: 5 };
    const r = stepResetPalette(INITIAL_RESET_PALETTE_STATE, { count: 3, handCenterY: 0.97, lateralVelocity: 0.1 }, tighterZone);
    expect(r.reason).toBe("below-zone"); // 0.97 >= 1 - 0.05
    const notYet = stepResetPalette(INITIAL_RESET_PALETTE_STATE, { count: 3, handCenterY: 0.9, lateralVelocity: 0.1 }, tighterZone);
    expect(notYet.reason).toBeNull(); // 0.9 < 1 - 0.05
  });
});

describe("resetPalette: wave-to-cancel", () => {
  it("lateral velocity above the threshold fires 'wave' immediately — no settle/edge needed", () => {
    const r = stepResetPalette(INITIAL_RESET_PALETTE_STATE, { count: 3, handCenterY: 0.4, lateralVelocity: 2.0 }, DEFAULT_RESET_PALETTE_CONFIG);
    expect(r.reason).toBe("wave");
  });

  it("fires again on a SECOND sustained-high-velocity frame — a wave doesn't debounce like out-of-frame/below-zone", () => {
    const first = stepResetPalette(INITIAL_RESET_PALETTE_STATE, { count: 3, handCenterY: 0.4, lateralVelocity: 2.0 });
    expect(first.reason).toBe("wave");
    const second = stepResetPalette(first.state, { count: 3, handCenterY: 0.4, lateralVelocity: 2.0 });
    expect(second.reason).toBe("wave");
  });

  it("lateral velocity at or below the threshold does not fire", () => {
    const r = stepResetPalette(INITIAL_RESET_PALETTE_STATE, { count: 3, handCenterY: 0.4, lateralVelocity: 1.4 }, DEFAULT_RESET_PALETTE_CONFIG);
    expect(r.reason).toBeNull();
  });

  it("null lateral velocity (no prior frame yet) never fires", () => {
    const r = stepResetPalette(INITIAL_RESET_PALETTE_STATE, { count: 3, handCenterY: 0.4, lateralVelocity: null });
    expect(r.reason).toBeNull();
  });

  it("disabled via config -> no reason even above threshold", () => {
    const config: ResetPaletteConfig = { ...DEFAULT_RESET_PALETTE_CONFIG, waveEnabled: false };
    const r = stepResetPalette(INITIAL_RESET_PALETTE_STATE, { count: 3, handCenterY: 0.4, lateralVelocity: 5.0 }, config);
    expect(r.reason).toBeNull();
  });

  it("wave takes priority over a simultaneous out-of-frame/below-zone signal", () => {
    const r = stepResetPalette(HAND_PRESENT_STATE, { count: null, handCenterY: 0.95, lateralVelocity: 3.0 });
    expect(r.reason).toBe("wave");
  });
});
