import { describe, expect, it } from "vitest";
import { solveCylinder } from "../src/domain/cylinder";
import { neutralFactor } from "../src/domain/neutralAxis";
import { develop, totalTurn, traceProfile, type Profile } from "../src/domain/profile";

const dev = (p: Profile) => {
  const d = develop(p);
  if (typeof d === "string") throw new Error(d);
  return d;
};

describe("profile development", () => {
  it("adds straight lengths and neutral arc lengths with a k per arc", () => {
    // U shape: two legs and a half circle, inner radius 20, t 10 → R/t 2, DIN k below 0.5.
    const d = dev({
      thickness: 10,
      kOverride: null,
      segments: [
        { kind: "line", length: 100 },
        { kind: "arc", radius: 20, angle: Math.PI },
        { kind: "line", length: 100 },
      ],
    });
    const k = neutralFactor(20, 10);
    expect(k).toBeLessThan(0.5);
    expect(d.segments[1]!.k).toBe(k);
    expect(d.length).toBeCloseTo(200 + Math.PI * (20 + k * 10), 12);
    expect(d.bendLines).toEqual([100, 100 + Math.PI * (20 + k * 10)]);
    expect(d.minRt).toBe(2);
  });

  it("merges touching bends and drops lines on the blank edges", () => {
    const d = dev({
      thickness: 5,
      kOverride: 0.5,
      segments: [
        { kind: "arc", radius: 100, angle: Math.PI / 2 },
        { kind: "arc", radius: 50, angle: Math.PI / 2 },
        { kind: "line", length: 80 },
      ],
    });
    const a = 102.5 * (Math.PI / 2);
    expect(d.bendLines).toHaveLength(2);
    expect(d.bendLines[0]).toBeCloseTo(a, 9);
    expect(d.bendLines[1]).toBeCloseTo(a + 52.5 * (Math.PI / 2), 9);
  });

  it("rejects bad input", () => {
    expect(develop({ thickness: 0, kOverride: null, segments: [] })).toBe("thickness");
    expect(
      develop({ thickness: 1, kOverride: null, segments: [{ kind: "arc", radius: 0, angle: 1 }] }),
    ).toBe("segment");
  });
});

describe("profile tracing", () => {
  const square = (r: number, side: number, t: number): Profile => ({
    thickness: t,
    kOverride: null,
    segments: Array.from({ length: 4 }, () => [
      { kind: "line" as const, length: side },
      { kind: "arc" as const, radius: r, angle: Math.PI / 2 },
    ]).flat(),
  });

  it("closes a shape that turns a full circle, on every fibre", () => {
    const p = square(30, 200, 8);
    expect(totalTurn(p)).toBeCloseTo(2 * Math.PI, 12);
    for (const depth of [0, 0.5, 1]) {
      const pts = traceProfile(p, depth);
      const [x0, y0] = pts[0]!;
      const [x1, y1] = pts[pts.length - 1]!;
      expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(1e-9);
    }
  });

  it("puts the inner surface of left turns at depth 0", () => {
    // Inner width of the square: side + 2 × inner radius.
    const xs = traceProfile(square(30, 200, 8), 0).map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(260, 2);
    const outer = traceProfile(square(30, 200, 8), 1).map((p) => p[0]);
    expect(Math.max(...outer) - Math.min(...outer)).toBeCloseTo(276, 2);
  });

  it("keeps the inner radius on the concave side of right turns", () => {
    // S-bend, both mid-fibre radii 55: starts at (0, −5), left turn about (0, 50), right turn about
    // (110, 50), ends at (110, 105).
    const p: Profile = {
      thickness: 10,
      kOverride: null,
      segments: [
        { kind: "arc", radius: 50, angle: Math.PI / 2 },
        { kind: "arc", radius: 50, angle: -Math.PI / 2 },
      ],
    };
    const mid = traceProfile(p, 0.5);
    const [x, y] = mid[mid.length - 1]!;
    expect(x).toBeCloseTo(110, 9);
    expect(y).toBeCloseTo(105, 9);
  });
});

describe("cylinder on the profile engine", () => {
  // Closed-form results of 1.0, kept here as the regression reference.
  const reference = (dInner: number, t: number, k: number, flat: number) => ({
    ringLength: Math.PI * (dInner + 2 * k * t),
    blankLength: Math.PI * (dInner + 2 * k * t) + 2 * flat,
  });

  it("matches the closed-form blank length across sizes", () => {
    for (const t of [0.8, 3, 10, 25, 60])
      for (const d of [100, 380, 1000, 2380, 6000])
        for (const flat of [0, 15])
          for (const kOverride of [null, 0.42]) {
            const r = solveCylinder({
              mode: "fromDiameter",
              thickness: t,
              value: d,
              isRadius: false,
              surface: "inner",
              flatEnds: flat,
              kOverride,
            });
            if (typeof r === "string") throw new Error(r);
            const ref = reference(d, t, kOverride ?? neutralFactor(d / 2, t), flat);
            expect(r.ringLength).toBeCloseTo(ref.ringLength, 9);
            expect(r.blankLength).toBeCloseTo(ref.blankLength, 9);
          }
  });

  it("reproduces a production program's blank: Ø 2380 inner, t 10 → 7508 mm", () => {
    const r = solveCylinder({
      mode: "fromDiameter",
      thickness: 10,
      value: 1190,
      isRadius: true,
      surface: "inner",
      flatEnds: 0,
      kOverride: null,
    });
    expect(typeof r !== "string" && Math.round(r.blankLength)).toBe(7508);
  });
});
