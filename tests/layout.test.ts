import { describe, expect, it } from "vitest";
import { standardScale } from "../src/drawing/layout";

describe("standard drawing scales", () => {
  it("rounds the fitting scale down to the next standard ratio", () => {
    // Fits at 1:17.3 → 1:20; at exactly 1:50 stays 1:50; 1:2.2 has to go to 1:5.
    expect(1 / standardScale(1 / 17.3)).toBe(20);
    expect(1 / standardScale(1 / 50)).toBe(50);
    expect(1 / standardScale(1 / 2.2)).toBe(5);
  });

  it("never enlarges past the fitting scale", () => {
    for (const n of [1.2, 3, 7, 33, 120, 640])
      expect(standardScale(1 / n)).toBeLessThanOrEqual(1 / n);
  });
});
