import { describe, expect, it } from "vitest";
import { traceProfile } from "../src/domain/profile";
import { buildShape, type ShapeInput } from "../src/domain/shapes";
import { formatFreeRows, freeSegments, parseFreeRows } from "../src/state/freeShape";
import { defaultInputs } from "../src/state/inputs";
import { decodeInputs, encodeInputs } from "../src/state/share";

const base: ShapeInput = {
  shape: "ellipse",
  thickness: 10,
  surface: "inner",
  a: NaN,
  b: NaN,
  r: NaN,
  angle: NaN,
  flatEnds: 0,
  kOverride: 0,
};

const build = (input: Partial<ShapeInput>) => {
  const r = buildShape({ ...base, ...input });
  if (typeof r === "string") throw new Error(r);
  return r;
};

/** Ramanujan's second approximation of an ellipse perimeter. */
const ramanujan = (a: number, b: number) => {
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
};

describe("ellipse", () => {
  it("has the exact inner perimeter (k = 0 reads the inner surface)", () => {
    // Close to a circle Ramanujan is exact to rounding; at 2:1 still to about 1e-9.
    expect(build({ a: 2000, b: 1990 }).blankLength).toBeCloseTo(ramanujan(1000, 995), 6);
    expect(build({ a: 2400, b: 1200 }).blankLength).toBeCloseTo(ramanujan(1200, 600), 4);
  });

  it("is a circle when both axes are equal", () => {
    expect(build({ a: 1000, b: 1000, kOverride: 0.5 }).blankLength).toBeCloseTo(Math.PI * 1010, 9);
  });

  it("adds the neutral shift once around: L = P_inner + 2π·k·t for a constant k", () => {
    const inner = build({ a: 2400, b: 1500 }).blankLength;
    expect(build({ a: 2400, b: 1500, kOverride: 0.5 }).blankLength).toBeCloseTo(
      inner + 2 * Math.PI * 5,
      9,
    );
  });

  it("closes and spans its axes; reports the true radius extremes", () => {
    const r = build({ a: 2400, b: 1500 });
    const pts = traceProfile(r.profile, 0, 1e-3);
    const xs = pts.map((p) => p[0]),
      ys = pts.map((p) => p[1]);
    // Arcs of constant radius stand in for the varying curvature: within 0.2 mm.
    expect(Math.abs(Math.max(...xs) - Math.min(...xs) - 2400)).toBeLessThan(0.2);
    expect(Math.abs(Math.max(...ys) - Math.min(...ys) - 1500)).toBeLessThan(0.2);
    const end = pts[pts.length - 1]!;
    expect(Math.hypot(end[0] - pts[0]![0], end[1] - pts[0]![1])).toBeLessThan(1e-6);
    expect(r.radii[0]).toBeCloseTo(750 ** 2 / 1200, 9);
    expect(r.radii[1]).toBeCloseTo(1200 ** 2 / 750, 9);
    expect(r.dev.bendLines).toEqual([]);
  });
});

describe("free shape", () => {
  it("reads and writes the compact text form", () => {
    const text = "L300_R400a90_L250,5_R200a-45";
    const rows = parseFreeRows(text);
    expect(rows).toEqual([
      { kind: "line", size: "300", angle: "" },
      { kind: "arc", size: "400", angle: "90" },
      { kind: "line", size: "250,5", angle: "" },
      { kind: "arc", size: "200", angle: "-45" },
    ]);
    expect(formatFreeRows(rows)).toBe(text);
    expect(freeSegments("L300_R400a")).toBeNull();
  });

  it("is open unless it turns once around and meets itself", () => {
    const open = build({ shape: "free", free: freeSegments("L300_R400a90_L300")!, kOverride: 0.5 });
    expect(open.closed).toBe(false);
    expect(open.blankLength).toBeCloseTo(600 + (Math.PI / 2) * 405, 9);
    // A rectangle 600 × 400 with R 50 corners, written out by hand.
    const square = "L250_R50a90_L300_R50a90_L500_R50a90_L300_R50a90_L250";
    expect(build({ shape: "free", free: freeSegments(square)! }).closed).toBe(true);
  });

  it("needs at least one arc", () => {
    expect(buildShape({ ...base, shape: "free", free: freeSegments("L300")! })).toBe("segments");
  });

  it("travels in a calculation link", () => {
    const inputs = { ...defaultInputs, shape: "free" as const, freeSegs: "L300_R400a90_L300" };
    expect(decodeInputs(encodeInputs(inputs))).toEqual(inputs);
  });
});
