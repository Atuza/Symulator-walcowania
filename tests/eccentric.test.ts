import { describe, expect, it } from "vitest";
import { solveCone } from "../src/domain/cone";
import { solveEccentric, type EccentricInput } from "../src/domain/eccentric";

// The example part: Ø 2400 / Ø 2200, 1250 long, flat on one side.
const base: EccentricInput = {
  thickness: 10,
  dLarge: 2400,
  dSmall: 2200,
  height: 1250,
  offset: 100,
  surface: "inner",
  flatEnds: 0,
  kOverride: null,
};

const solve = (input: Partial<EccentricInput>) => {
  const r = solveEccentric({ ...base, ...input });
  if (typeof r === "string") throw new Error(r);
  return r;
};

const polyLength = (pts: [number, number][]) =>
  pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);

describe("eccentric cone", () => {
  it("flat side: the shortest generator is the length, the longest leans by 2e", () => {
    const r = solve({});
    expect(r.slantMin).toBeCloseTo(1250, 6);
    expect(r.slantMax).toBeCloseTo(Math.hypot(1250, 200), 6);
    expect(r.generators[0]!.length).toBeCloseTo(1250, 6);
    expect(r.generators[6]!.length).toBeCloseTo(Math.hypot(1250, 200), 6);
  });

  it("develops the large end to its full circumference", () => {
    const r = solve({});
    const outer = r.net.large;
    expect(polyLength(outer)).toBeCloseTo(Math.PI * r.large.dNeutral, 2);
  });

  it("matches the ordinary cone when the offset is zero", () => {
    const e = solve({ offset: 0 });
    const c = solveCone({ ...base });
    if (typeof c === "string") throw new Error(c);
    expect(e.slantMin).toBeCloseTo(c.slant, 6);
    expect(e.slantMax).toBeCloseTo(c.slant, 6);
    expect(e.area).toBeCloseTo(c.area, -1);
    expect(e.area / c.area).toBeCloseTo(1, 7);
  });

  it("is symmetric about the shortest generator", () => {
    const r = solve({});
    // Generators at ±60° from the flat side have equal lengths.
    expect(r.generators[2]!.length).toBeCloseTo(r.generators[10]!.length, 6);
  });

  it("adds the flat-end strips to the area", () => {
    const plain = solve({});
    const flat = solve({ flatEnds: 30 });
    expect(flat.area - plain.area).toBeCloseTo(30 * 2 * 1250, 3);
  });

  it("rejects ends in the wrong order", () => {
    expect(solveEccentric({ ...base, dLarge: 2200, dSmall: 2400 })).toBe("order");
  });

  it("rejects offsets that cannot describe the documented shortest-generator seam", () => {
    for (const offset of [-100, NaN, Infinity])
      expect(solveEccentric({ ...base, offset })).toBe("offset");
  });
});
