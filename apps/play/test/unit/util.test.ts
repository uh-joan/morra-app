import { describe, expect, it } from "vitest";
import { median } from "../../src/util.js";

describe("median (spike L683–688)", () => {
  it("empty -> null", () => {
    expect(median([])).toBeNull();
  });
  it("odd length -> middle element", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("even length -> mean of the two middle elements", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it("does not mutate its input", () => {
    const arr = [3, 1, 2];
    median(arr);
    expect(arr).toEqual([3, 1, 2]);
  });
  it("handles negatives (signed sync deltas)", () => {
    expect(median([-400, 50, 60])).toBe(50);
  });
});
