import { describe, expect, it } from "vitest";
import { neutralFactor } from "../src/domain/neutralAxis";
import { solveCylinder, type CylinderResult } from "../src/domain/cylinder";
import { sectorBox, solveCone, type ConeResult } from "../src/domain/cone";
import { finalRadius, springback } from "../src/domain/springback";
import { calculate, emptyMachine } from "../src/domain/calculate";

const cyl = (r: ReturnType<typeof solveCylinder>) => {
  if (typeof r === "string") throw new Error(r);
  return r as CylinderResult;
};
const cone = (r: ReturnType<typeof solveCone>) => {
  if (typeof r === "string") throw new Error(r);
  return r as ConeResult;
};

describe("neutralFactor", () => {
  it("is mid-thickness for large radius ratios", () => {
    expect(neutralFactor(50, 10)).toBe(0.5);
    expect(neutralFactor(1000, 10)).toBe(0.5);
  });
  it("follows DIN 6935 below ri/t = 5", () => {
    // ri/t = 1 → k_DIN = 0.65 → 0.325
    expect(neutralFactor(10, 10)).toBeCloseTo(0.325, 10);
    // ri/t = 2 → (0.65 + 0.5·log10 2) / 2
    expect(neutralFactor(20, 10)).toBeCloseTo((0.65 + 0.5 * Math.log10(2)) / 2, 10);
  });
  it("is continuous at ri/t = 5 and clamped at the low end", () => {
    expect(neutralFactor(49.999, 10)).toBeCloseTo(0.5, 3);
    expect(neutralFactor(0.1, 10)).toBe(0.25);
  });
});

describe("cylinder from diameter", () => {
  it("uses the mid-thickness circumference for a typical shell", () => {
    const r = cyl(
      solveCylinder({
        mode: "fromDiameter",
        thickness: 10,
        value: 1000,
        isRadius: false,
        surface: "inner",
        flatEnds: 0,
        kOverride: null,
      }),
    );
    expect(r.dNeutral).toBeCloseTo(1010, 10);
    expect(r.ringLength).toBeCloseTo(Math.PI * 1010, 10);
    expect(r.dOuter).toBe(1020);
    expect(r.blankLength).toBe(r.ringLength);
  });
  it("gives the same result from the outer diameter", () => {
    const a = cyl(
      solveCylinder({
        mode: "fromDiameter",
        thickness: 10,
        value: 1000,
        isRadius: false,
        surface: "inner",
        flatEnds: 0,
        kOverride: null,
      }),
    );
    const b = cyl(
      solveCylinder({
        mode: "fromDiameter",
        thickness: 10,
        value: 1020,
        isRadius: false,
        surface: "outer",
        flatEnds: 0,
        kOverride: null,
      }),
    );
    expect(b.ringLength).toBeCloseTo(a.ringLength, 10);
  });
  it("accepts a radius and adds flat-end allowance", () => {
    const r = cyl(
      solveCylinder({
        mode: "fromDiameter",
        thickness: 8,
        value: 500,
        isRadius: true,
        surface: "inner",
        flatEnds: 12,
        kOverride: null,
      }),
    );
    expect(r.dInner).toBe(1000);
    expect(r.blankLength).toBeCloseTo(Math.PI * 1008 + 24, 10);
  });
  it("respects a k override", () => {
    const r = cyl(
      solveCylinder({
        mode: "fromDiameter",
        thickness: 10,
        value: 1000,
        isRadius: false,
        surface: "inner",
        flatEnds: 0,
        kOverride: 0.4,
      }),
    );
    expect(r.dNeutral).toBeCloseTo(1008, 10);
  });
  it("rejects impossible input", () => {
    expect(
      solveCylinder({
        mode: "fromDiameter",
        thickness: 0,
        value: 1000,
        isRadius: false,
        surface: "inner",
        flatEnds: 0,
        kOverride: null,
      }),
    ).toBe("thickness");
    expect(
      solveCylinder({
        mode: "fromDiameter",
        thickness: 10,
        value: 20,
        isRadius: false,
        surface: "outer",
        flatEnds: 0,
        kOverride: null,
      }),
    ).toBe("tooSmall");
  });
});

describe("cylinder from length", () => {
  it("round-trips with the diameter mode, including the shifted neutral fibre", () => {
    for (const [t, d] of [
      [10, 1000],
      [20, 60],
      [5, 25],
      [30, 100],
    ] as const) {
      const a = cyl(
        solveCylinder({
          mode: "fromDiameter",
          thickness: t,
          value: d,
          isRadius: false,
          surface: "inner",
          flatEnds: 15,
          kOverride: null,
        }),
      );
      const b = cyl(
        solveCylinder({
          mode: "fromLength",
          thickness: t,
          blankLength: a.blankLength,
          flatEnds: 15,
          kOverride: null,
        }),
      );
      expect(b.dInner).toBeCloseTo(d, 8);
      expect(b.k).toBeCloseTo(a.k, 10);
    }
  });
  it("rejects a blank shorter than the flat ends", () => {
    expect(
      solveCylinder({
        mode: "fromLength",
        thickness: 10,
        blankLength: 20,
        flatEnds: 10,
        kOverride: null,
      }),
    ).toBe("length");
  });
});

describe("cone", () => {
  it("develops into the textbook annular sector", () => {
    // Thin-wall limit: the neutral diameters equal the given ones plus t/cos(α).
    const r = cone(
      solveCone({
        thickness: 1e-9,
        dLarge: 1000,
        dSmall: 500,
        height: 433.0127,
        surface: "inner",
        flatEnds: 0,
        kOverride: null,
      }),
    );
    const alpha = Math.atan(250 / 433.0127);
    expect(r.alpha).toBeCloseTo(alpha, 10);
    expect(r.rOuter).toBeCloseTo(500 / Math.sin(alpha), 4);
    expect(r.rInner).toBeCloseTo(250 / Math.sin(alpha), 4);
    expect(r.slant).toBeCloseTo(Math.hypot(250, 433.0127), 4);
    expect(r.angleNet).toBeCloseTo(2 * Math.PI * Math.sin(alpha), 10);
    // Arc length of the large edge equals the large circumference.
    expect(r.rOuter * r.angleNet).toBeCloseTo(Math.PI * r.large.dNeutral, 6);
  });
  it("offsets thickness normal to the wall", () => {
    const r = cone(
      solveCone({
        thickness: 10,
        dLarge: 1000,
        dSmall: 400,
        height: 300,
        surface: "inner",
        flatEnds: 0,
        kOverride: 0.5,
      }),
    );
    const radialT = 10 / Math.cos(r.alpha);
    expect(r.large.dOuter - r.large.dInner).toBeCloseTo(2 * radialT, 10);
    expect(r.slant).toBeCloseTo(300 / Math.cos(r.alpha), 8);
  });
  it("handles a full cone to the apex", () => {
    const r = cone(
      solveCone({
        thickness: 1e-9,
        dLarge: 600,
        dSmall: 0,
        height: 400,
        surface: "inner",
        flatEnds: 0,
        kOverride: null,
      }),
    );
    expect(r.rInner).toBeCloseTo(0, 6);
  });
  it("validates input", () => {
    const base = {
      thickness: 5,
      dLarge: 1000,
      dSmall: 500,
      height: 400,
      surface: "inner" as const,
      flatEnds: 0,
      kOverride: null,
    };
    expect(solveCone({ ...base, dSmall: 1000 })).toBe("order");
    expect(solveCone({ ...base, height: 0 })).toBe("height");
    expect(solveCone({ ...base, dLarge: 1000, dSmall: 0, height: 100, flatEnds: 5000 })).toBe(
      "tooFlat",
    );
  });
  it("computes the sector bounding box", () => {
    expect(sectorBox(0, 100, Math.PI)).toEqual({ width: 100, height: 200 });
    const half = sectorBox(50, 100, Math.PI / 2);
    expect(half.width).toBeCloseTo(100 - 50 * Math.cos(Math.PI / 4), 10);
    expect(half.height).toBeCloseTo(2 * 100 * Math.sin(Math.PI / 4), 10);
  });
});

describe("springback", () => {
  const steel = { thickness: 10, yieldStrength: 355, modulus: 210_000, poisson: 0.3 };
  it("inverts the forward Gardiner relation", () => {
    const sb = springback({ targetRadius: 1500, ...steel });
    expect(sb).not.toBeNull();
    const ePlane = 210_000 / (1 - 0.09);
    expect(finalRadius(sb!.setRadius, 10, 355, ePlane)).toBeCloseTo(1500, 6);
    expect(sb!.setRadius).toBeLessThan(1500);
  });
  it("grows with radius and yield strength", () => {
    const small = springback({ targetRadius: 300, ...steel })!;
    const large = springback({ targetRadius: 3000, ...steel })!;
    const strong = springback({ targetRadius: 3000, ...steel, yieldStrength: 700 })!;
    expect(large.ratio).toBeGreaterThan(small.ratio);
    expect(strong.ratio).toBeGreaterThan(large.ratio);
  });
  it("scales with the calibration factor", () => {
    const base = springback({ targetRadius: 2000, ...steel })!;
    const none = springback({ targetRadius: 2000, ...steel, calibration: 0 })!;
    expect(none.setRadius).toBe(2000);
    const half = springback({ targetRadius: 2000, ...steel, calibration: 0.5 })!;
    expect(half.setRadius).toBeCloseTo((2000 + base.setRadius) / 2, 8);
  });
});

describe("calculate", () => {
  const material = {
    re: 355,
    modulus: 210_000,
    poisson: 0.3,
    density: 7850,
    minRt: 1,
    strainLimit: 0.05,
  };
  it("computes mass and warns about strain and machine limits", () => {
    const out = calculate({
      shape: "cylinder",
      material,
      reFromCertificate: false,
      calibration: 1,
      machine: { ...emptyMachine, maxThickness: 8, topRollD: 300 },
      width: 2000,
      cylinder: {
        mode: "fromDiameter",
        thickness: 10,
        value: 150,
        isRadius: false,
        surface: "inner",
        flatEnds: 0,
        kOverride: null,
      },
    });
    if ("error" in out || out.shape !== "cylinder") throw new Error("unexpected");
    expect(out.massKg).toBeCloseTo(out.result.blankLength * 2000 * 10 * 1e-9 * 7850, 10);
    const codes = out.warnings.map((w) => w.code);
    expect(codes).toContain("strainHigh");
    expect(codes).toContain("machineThickness");
    expect(codes).toContain("machineTopRoll");
  });
});
