import { describe, expect, it } from "vitest";
import { eccentricPoint, solveEccentric, type EccentricInput } from "../src/domain/eccentric";
import { solveCone } from "../src/domain/cone";
import { defaultInputs, inputsSchema } from "../src/state/inputs";
import { decodeInputs, encodeInputs } from "../src/state/share";

type V3 = [number, number, number];
const subtract = (a: number[], b: number[]) => a.map((x, i) => x - b[i]!);
const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i]!, 0);
const cross = (a: number[], b: number[]): V3 => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const norm = (a: number[]) => Math.hypot(...a);
const cases: EccentricInput[] = [
  {
    dLarge: 2400,
    dSmall: 2200,
    height: 1250,
    offset: 100,
    thickness: 10,
    surface: "inner",
    flatEnds: 0,
    kOverride: 0.5,
  },
  {
    dLarge: 900,
    dSmall: 450,
    height: 400,
    offset: 400,
    thickness: 30,
    surface: "inner",
    flatEnds: 0,
    kOverride: 0.42,
  },
  {
    dLarge: 600,
    dSmall: 200,
    height: 180,
    offset: 160,
    thickness: 12,
    surface: "inner",
    flatEnds: 0,
    kOverride: 0.5,
  },
];
const solve = (input: EccentricInput) => {
  const r = solveEccentric(input);
  if (typeof r === "string") throw new Error(r);
  return r;
};

/** Independent construction of the user-defined cone, without the solver's offset helpers. */
function referencePoint(i: EccentricInput, phi: number, z: number): V3 {
  const radius = i.dLarge / 2 + (((i.dSmall - i.dLarge) / 2) * z) / i.height;
  return [radius * Math.sin(phi), (i.offset * z) / i.height + radius * Math.cos(phi), z];
}

describe("constant normal wall thickness", () => {
  for (const surface of ["inner", "mid", "outer"] as const)
    it.each(cases)(
      `preserves thickness and neutral depth for ${surface} reference: $dLarge / $dSmall`,
      (item) => {
        const input = { ...item, surface },
          r = solve(input);
        const depth = { inner: 0, mid: 0.5, outer: 1 }[surface];
        const z = input.height * 0.4,
          eps = 1e-5;
        for (let j = 0; j < 12; j++) {
          const phi = (j * Math.PI) / 6,
            p = referencePoint(input, phi, z);
          const tangent = subtract(
            referencePoint(input, phi + eps, z),
            referencePoint(input, phi - eps, z),
          );
          const ruling = subtract(
            referencePoint(input, phi, z + 0.1),
            referencePoint(input, phi, z - 0.1),
          );
          const raw = cross(ruling, tangent),
            normal = raw.map((v) => v / norm(raw));
          const points = ["inner", "neutral", "outer"].map((wall) => {
            const wallDepth = wall === "neutral" ? r.k : wall === "inner" ? 0 : 1;
            const delta = (wallDepth - depth) * input.thickness;
            const expected = p.map((v, axis) => v + delta * normal[axis]!);
            const point = eccentricPoint(
              r,
              phi,
              expected[2]! / input.height,
              wall as "inner" | "outer" | "neutral",
            );
            expect(norm(subtract(point, expected))).toBeLessThan(1e-6);
            return point;
          });
          expect(norm(subtract(points[2]!, points[0]!))).toBeCloseTo(input.thickness, 6);
          expect(norm(subtract(points[1]!, points[0]!))).toBeCloseTo(r.k * input.thickness, 6);
        }
      },
    );

  it("keeps the physical end planes fixed", () => {
    const r = solve(cases[1]!);
    for (let j = 0; j < 24; j++)
      for (const surface of ["inner", "mid", "outer", "neutral"] as const) {
        expect(eccentricPoint(r, (j * Math.PI) / 12, 0, surface)[2]).toBe(0);
        expect(eccentricPoint(r, (j * Math.PI) / 12, 1, surface)[2]).toBe(r.height);
      }
  });

  it("uses different end-plane correction on the flat and sloping sides", () => {
    const r = solve(cases[0]!);
    expect(r.endPlaneThickness.min).toBe(10);
    expect(r.endPlaneThickness.max).toBeCloseTo((Math.hypot(1250, 200) / 1250) * 10, 10);
    expect(r.large.dInner).toBeCloseTo(2400, 7);
    expect(r.small.dInner).toBeCloseTo(2200, 7);
  });
});

describe("parallel-surface development", () => {
  const references = cases.flatMap((item) =>
    (["inner", "mid", "outer"] as const).map((surface) => ({ ...item, surface })),
  );
  it.each(references)("preserves the surface metric: $surface $dLarge / $dSmall", (input) => {
    const r = solve(input),
      n = r.net.large.length - 1,
      h = (2 * Math.PI) / n;
    for (let j = 1; j < 12; j++) {
      const i = (j * n) / 12,
        phi = i * h;
      const p = r.net.large;
      // Fourth-order derivative of the exported development, compared with a 3D finite difference.
      const flat = [0, 1].map(
        (axis) =>
          (-p[i + 2]![axis]! + 8 * p[i + 1]![axis]! - 8 * p[i - 1]![axis]! + p[i - 2]![axis]!) /
          (12 * h),
      );
      const eps = 1e-5;
      const space = subtract(eccentricPoint(r, phi + eps, 0), eccentricPoint(r, phi - eps, 0)).map(
        (v) => v / (2 * eps),
      );
      const flatRuling = subtract(r.net.small[i]!, p[i]!);
      const spaceRuling = subtract(eccentricPoint(r, phi, 1), eccentricPoint(r, phi, 0));
      expect(norm(flat) / norm(space)).toBeCloseTo(1, 6);
      expect(norm(flatRuling)).toBeCloseTo(norm(spaceRuling), 7);
      expect(
        Math.abs(dot(flat, flatRuling) - dot(space, spaceRuling)) /
          (norm(space) * norm(spaceRuling)),
      ).toBeLessThan(5e-7);
    }
  });

  it.each(references)(
    "matches independently integrated 3D area: $surface $dLarge / $dSmall",
    (input) => {
      const r = solve(input),
        count = 512,
        eps = 1e-5;
      let area = 0;
      for (let j = 0; j < count; j++) {
        const phi = ((j + 0.5) * 2 * Math.PI) / count;
        const across = subtract(
          eccentricPoint(r, phi + eps, 0.5),
          eccentricPoint(r, phi - eps, 0.5),
        ).map((v) => v / (2 * eps));
        const along = subtract(eccentricPoint(r, phi, 1), eccentricPoint(r, phi, 0));
        area += (norm(cross(across, along)) * 2 * Math.PI) / count;
      }
      expect(r.area / area).toBeCloseTo(1, 7);
    },
  );

  it.each(["inner", "mid", "outer"] as const)(
    "matches the closed-form concentric cone for %s dimensions",
    (surface) => {
      const input = { ...cases[0]!, surface, offset: 0, kOverride: 0.42 };
      const e = solve(input),
        cone = solveCone(input);
      if (typeof cone === "string") throw new Error(cone);
      expect(e.arcLarge).toBeCloseTo(cone.arcOuter, 6);
      expect(e.arcSmall).toBeCloseTo(cone.arcInner, 6);
      expect(e.area / cone.area).toBeCloseTo(1, 9);
    },
  );

  it("remains stable for a nearly cylindrical cone", () => {
    const r = solve({ ...cases[0]!, dSmall: 2399.999999 });
    expect(r.area).toBeGreaterThan(0);
    expect(r.net.large.flat().every(Number.isFinite)).toBe(true);
    expect(r.box.width).toBeLessThan(20000);
    expect(r.box.height).toBeLessThan(20000);
  });

  it("rejects an inward wall offset that passes its curvature singularity", () => {
    expect(solveEccentric({ ...cases[2]!, surface: "outer", thickness: 300 })).toBe("tooSmall");
  });
});

describe("eccentric shape selection and saved inputs", () => {
  it("round trips the dedicated tile through a printed calculation link", () => {
    const inputs = { ...defaultInputs, shape: "eccentric" as const, offset: "100" };
    const link = encodeInputs(inputs);
    expect(link).toContain("s=ec");
    expect(decodeInputs(link)).toEqual(inputs);
  });

  it("migrates old cone links and templates while preserving their dimensions", () => {
    const old = {
      ...defaultInputs,
      shape: "cone",
      offset: "100",
      dLarge: "2400",
      dSmall: "2200",
      height: "1250",
    };
    expect(inputsSchema.parse(old)).toEqual({ ...old, shape: "eccentric" });
    expect(decodeInputs("#c=1;s=k;e=100;D=2400;d=2200;h=1250")).toEqual({
      ...old,
      shape: "eccentric",
      cylinderCalibration: false,
      cylinderCalibrationModel: "constant",
    });
    expect(decodeInputs("#c=1;s=k;e=0")?.shape).toBe("cone");
    expect(decodeInputs("#c=1;s=k")?.shape).toBe("cone");
  });
});
