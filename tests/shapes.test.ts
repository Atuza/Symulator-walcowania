import { describe, expect, it } from "vitest";
import { calculate, emptyMachine } from "../src/domain/calculate";
import { bendAt, partlyRolled, traceProfile } from "../src/domain/profile";
import { buildShape, type ShapeInput, type ShapeResult } from "../src/domain/shapes";
import { dxfDocument, rectangleContour } from "../src/export/dxf";
import { defaultInputs } from "../src/state/inputs";
import { decodeInputs, encodeInputs } from "../src/state/share";

const base: Omit<ShapeInput, "shape"> = {
  thickness: 10,
  surface: "inner",
  a: NaN,
  b: NaN,
  r: NaN,
  angle: NaN,
  flatEnds: 0,
  kOverride: 0.5,
};

const build = (input: Partial<ShapeInput> & Pick<ShapeInput, "shape">): ShapeResult => {
  const r = buildShape({ ...base, ...input });
  if (typeof r === "string") throw new Error(r);
  return r;
};

const box = (pts: [number, number][]) => {
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};

describe("shape blanks", () => {
  it("rectangle: straights plus one full turn of corners on the neutral fibre", () => {
    const r = build({ shape: "rect", a: 1000, b: 600, r: 60 });
    expect(r.blankLength).toBeCloseTo(2 * 880 + 2 * 480 + 2 * Math.PI * 65, 9);
    expect(r.dev.bendLines).toHaveLength(8);
    expect(r.radii).toEqual([60]);
  });

  it("converts sizes given on the outer surface", () => {
    const inner = build({ shape: "rect", a: 1000, b: 600, r: 60 });
    const outer = build({ shape: "rect", a: 1020, b: 620, r: 70, surface: "outer" });
    expect(outer.blankLength).toBeCloseTo(inner.blankLength, 9);
  });

  it("obround, U and half round", () => {
    expect(build({ shape: "obround", a: 2000, b: 800 }).blankLength).toBeCloseTo(
      2400 + 2 * Math.PI * 405,
      9,
    );
    expect(build({ shape: "ushape", a: 600, b: 400 }).blankLength).toBeCloseTo(
      800 + Math.PI * 305,
      9,
    );
    expect(build({ shape: "halfround", r: 500, angle: Math.PI }).blankLength).toBeCloseTo(
      Math.PI * 505,
      9,
    );
  });

  it("tank: the four arcs close and span A × B on the inner surface", () => {
    const r = build({ shape: "tank", a: 2400, b: 1500, r: 400 });
    expect(r.derivedR).toBeGreaterThan(750);
    // Fine step: the trace is a chord polyline, so extremes are only hit when sampled.
    const inner = traceProfile(r.profile, 0, 1e-4) as [number, number][];
    const [w, h] = box(inner);
    expect(w).toBeCloseTo(2400, 3);
    expect(h).toBeCloseTo(1500, 3);
    const end = inner[inner.length - 1]!;
    expect(Math.hypot(end[0] - inner[0]![0], end[1] - inner[0]![1])).toBeLessThan(1e-6);
  });

  it("rejects sizes that cannot make the shape", () => {
    const bad = (input: Partial<ShapeInput> & Pick<ShapeInput, "shape">) =>
      buildShape({ ...base, ...input });
    expect(bad({ shape: "rect", a: 100, b: 600, r: 60 })).toBe("a");
    expect(bad({ shape: "tank", a: 2400, b: 1500, r: 800 })).toBe("r");
    expect(bad({ shape: "tank", a: 1000, b: 1500, r: 100 })).toBe("b");
    expect(bad({ shape: "obround", a: 500, b: 800 })).toBe("a");
    expect(bad({ shape: "halfround", r: 500, angle: 2 * Math.PI })).toBe("angle");
  });

  it("adds flat ends as straights and keeps the bends between them", () => {
    const r = build({ shape: "ushape", a: 600, b: 400, flatEnds: 20 });
    expect(r.blankLength).toBeCloseTo(840 + Math.PI * 305, 9);
    expect(r.dev.bendLines[0]).toBeCloseTo(420, 9);
  });
});

describe("partly rolled plate", () => {
  const r = build({ shape: "rect", a: 1000, b: 600, r: 60 });
  it("is a straight strip before rolling", () => {
    const p = partlyRolled(r.profile, r.dev, 0);
    const [w, h] = box(traceProfile(p, 0) as [number, number][]);
    expect(w).toBeCloseTo(r.blankLength, 9);
    expect(h).toBeCloseTo(0, 9);
  });

  it("is the finished shape after rolling", () => {
    const [w, h] = box(
      traceProfile(partlyRolled(r.profile, r.dev, r.blankLength), 0.5) as [number, number][],
    );
    // Mid fibre: inner sizes plus one thickness.
    expect(w).toBeCloseTo(1010, 6);
    expect(h).toBeCloseTo(610, 6);
  });
});

describe("bend under the rolls", () => {
  it("follows straights and corners as the plate passes", () => {
    const r = build({ shape: "rect", a: 1000, b: 600, r: 60 });
    // First straight is 440 mm, then a corner with neutral radius 65.
    expect(bendAt(r.profile, r.dev, 200)).toBeNull();
    expect(bendAt(r.profile, r.dev, 460)).toBeCloseTo(65, 9);
    expect(bendAt(r.profile, r.dev, 0)).toBeNull();
  });
});

describe("profile calculation", () => {
  it("reports mass and springback per radius", () => {
    const out = calculate({
      shape: "profile",
      material: {
        re: 355,
        modulus: 210_000,
        poisson: 0.3,
        density: 7850,
        minRt: null,
        strainLimit: null,
      },
      reFromCertificate: false,
      calibration: 1,
      machine: emptyMachine,
      width: 2000,
      profile: { ...base, shape: "tank", a: 2400, b: 1500, r: 400, kOverride: null },
    });
    if ("error" in out || out.shape !== "profile") throw new Error("expected a profile");
    expect(out.sets.map((s) => s.rInner)[0]).toBe(400);
    expect(out.sets.every((s) => s.set !== null && s.set.dInner / 2 < s.rInner)).toBe(true);
    expect(out.massKg).toBeCloseTo(out.result.blankLength * 2000 * 10 * 1e-9 * 7850, 9);
  });
});

describe("profile exports", () => {
  it("puts bend lines on their own layer", () => {
    const doc = dxfDocument(rectangleContour(3000, 1000), [{ x1: 500, y1: 0, x2: 500, y2: 1000 }]);
    expect(doc).toContain("\r\nbend\r\n");
    expect(doc.match(/\r\nLINE\r\n/g)).toHaveLength(1);
  });

  it("round-trips a shape through a calculation link", () => {
    const inputs = {
      ...defaultInputs,
      shape: "tank" as const,
      sizeA: "2400",
      sizeB: "1500",
      sizeR: "400",
    };
    expect(decodeInputs(encodeInputs(inputs))).toEqual(inputs);
  });
});
