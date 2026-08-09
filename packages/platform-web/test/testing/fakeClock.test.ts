import { describe, expect, it } from "vitest";
import { FakeClock } from "../../src/testing/fakeClock.js";

describe("FakeClock", () => {
  it("starts at 0 by default", () => {
    expect(new FakeClock().now()).toBe(0);
  });
  it("starts at a given time", () => {
    expect(new FakeClock(500).now()).toBe(500);
  });
  it("advance() moves time forward by a delta", () => {
    const clock = new FakeClock(100);
    clock.advance(50);
    expect(clock.now()).toBe(150);
    clock.advance(50);
    expect(clock.now()).toBe(200);
  });
  it("set() jumps to an absolute time", () => {
    const clock = new FakeClock(100);
    clock.set(9999);
    expect(clock.now()).toBe(9999);
  });
  it("never advances on its own — deterministic across repeated now() calls", () => {
    const clock = new FakeClock(42);
    expect(clock.now()).toBe(42);
    expect(clock.now()).toBe(42);
  });
});
