import { describe, expect, it } from "vitest";
import { calculate, emptyMachine, type CalcInput } from "../src/domain/calculate";
import {
  capacity,
  chartIsValid,
  coneThicknessShare,
  readChart,
  type CapacityChart,
} from "../src/domain/capacity";
import { solveCylinder } from "../src/domain/cylinder";
import { chartToText, parseChartText, parseMachineFile } from "../src/state/machineFile";
import { machineSchema } from "../src/state/settings";
import { documentedCharts, documentedMinDiameter } from "../src/state/fixedMachine";

// Generic example grid, not any particular machine.
const rolling = (re: number, scale = 1): CapacityChart => ({
  kind: "rolling",
  re,
  widths: [1000, 2000, 3000],
  diameters: [400, 800, 1600],
  thickness: [
    [20 * scale, 24 * scale, 28 * scale],
    [16 * scale, 20 * scale, 24 * scale],
    [12 * scale, 16 * scale, 20 * scale],
  ],
});

describe("capacity chart reading", () => {
  it("reads grid points and interpolates between them", () => {
    const c = rolling(260);
    expect(readChart(c, 2000, 800)).toBe(20);
    expect(readChart(c, 1500, 800)).toBeCloseTo(22, 9);
    expect(readChart(c, 1500, 1200)).toBeCloseTo(24, 9);
  });

  it("clamps on the safe side and refuses outside the stated range", () => {
    const c = rolling(260);
    expect(readChart(c, 500, 800)).toBe(24); // narrower than the first row
    expect(readChart(c, 2000, 3000)).toBe(24); // larger than the last column
    expect(readChart(c, 3100, 800)).toBe("width");
    expect(readChart(c, 2000, 300)).toBe("diameter");
  });

  it("interpolates in Re between charts and scales above the strongest", () => {
    const charts = [rolling(260), rolling(360, 0.8)];
    const at = (re: number) => capacity(charts, "rolling", re, 2000, 800);
    expect(at(200)).toEqual({ ok: true, tMax: 20, scaled: false });
    expect(at(310)).toMatchObject({ ok: true, tMax: 18 });
    const high = at(460);
    expect(high.ok && high.scaled).toBe(true);
    expect(high.ok && high.tMax).toBeCloseTo(16 * Math.sqrt(360 / 460), 9);
    expect(capacity(charts, "prebending", 260, 2000, 800)).toEqual({
      ok: false,
      reason: "noChart",
    });
  });

  it("rejects incomplete grids", () => {
    const c = rolling(260);
    expect(chartIsValid(c)).toBe(true);
    expect(chartIsValid({ ...c, diameters: [400, 300, 1600] })).toBe(false);
    expect(chartIsValid({ ...c, thickness: c.thickness.slice(1) })).toBe(false);
  });
});

describe("cone thickness share", () => {
  it("drops with the slant's share of the roll length", () => {
    expect(coneThicknessShare(1000, 3000)).toBe(0.5);
    expect(coneThicknessShare(2000, 3000)).toBe(0.4);
    expect(coneThicknessShare(2500, 3000)).toBe(0.3);
    expect(coneThicknessShare(2500, null)).toBe(0.5);
  });
});

describe("capacity warnings", () => {
  const material = {
    re: 260,
    modulus: 210_000,
    poisson: 0.3,
    density: 7850,
    minRt: null,
    strainLimit: null,
  };
  const prebend: CapacityChart = { ...rolling(260, 0.75), kind: "prebending" };
  const machine = { ...emptyMachine, charts: [rolling(260), prebend], rollLength: 3000 };
  const cylinder = (t: number, flatEnds = 0): CalcInput => ({
    shape: "cylinder",
    material,
    reFromCertificate: false,
    calibration: 0,
    machine,
    width: 2000,
    cylinder: {
      mode: "fromDiameter",
      thickness: t,
      value: 1600,
      isRadius: false,
      surface: "inner",
      flatEnds,
      kOverride: null,
    },
  });
  const codes = (input: CalcInput) => {
    const out = calculate(input);
    if ("error" in out) throw new Error(out.error);
    return out.warnings.map((w) => `${w.code}:${w.severity}`);
  };

  it("passes inside both charts", () => {
    expect(codes(cylinder(16))).toEqual([]);
  });

  it("warns above the pre-bending chart, softer with a flat-end allowance", () => {
    expect(codes(cylinder(20))).toEqual(["capacityPrebending:warn"]);
    expect(codes(cylinder(20, 30))).toEqual(["capacityPrebending:info"]);
  });

  it("warns above the rolling chart", () => {
    expect(codes(cylinder(25))).toContain("capacityRolling:warn");
  });

  it("limits cones to a share of the chart at the small end", () => {
    const cone = (t: number): CalcInput => ({
      shape: "cone",
      material,
      reFromCertificate: false,
      calibration: 0,
      machine,
      cone: {
        thickness: t,
        dLarge: 1600,
        dSmall: 800,
        height: 1000,
        surface: "inner",
        flatEnds: 0,
        kOverride: null,
      },
    });
    // Slant ≈ 1077 mm (< ½ of 3000) → 50 % of the chart at Ø 800 and width 1077 (≈ 23.7 mm).
    expect(codes(cone(10))).toEqual([]);
    expect(codes(cone(13))).toEqual(["coneCapacity:warn"]);
  });
});

describe("mid surface", () => {
  it("measures the diameter at mid-thickness", () => {
    const r = solveCylinder({
      mode: "fromDiameter",
      thickness: 10,
      value: 1010,
      isRadius: false,
      surface: "mid",
      flatEnds: 0,
      kOverride: null,
    });
    expect(typeof r !== "string" && r.dInner).toBeCloseTo(1000, 9);
  });
});

describe("machine file", () => {
  it("round-trips a chart through its text form, with decimal commas", () => {
    const c = { ...rolling(260), thickness: [[20.5, 24, 28], ...rolling(260).thickness.slice(1)] };
    const text = chartToText(c, true);
    expect(text.split("\n")[1]).toBe("1000\t20,5\t24\t28");
    expect(parseChartText(text)).toEqual({
      widths: c.widths,
      diameters: c.diameters,
      thickness: c.thickness,
    });
    expect(parseChartText("x 400 800\n1000 20")).toBeNull();
  });

  it("accepts settings saved before charts existed", () => {
    const old = {
      topRollD: 300,
      bottomRollD: null,
      sideRollD: null,
      maxThickness: null,
      maxWidth: null,
      minDiameter: null,
    };
    // Without charts of their own, the documented charts and minimum diameter apply.
    expect(machineSchema.parse(old)).toMatchObject({
      rollLength: 3100,
      minDiameter: documentedMinDiameter,
      charts: documentedCharts,
    });
  });

  it("parses a machine file and rejects other JSON", () => {
    const file = {
      format: "rolling-simulator-machine",
      version: 1,
      machine: { ...emptyMachine, charts: [rolling(260)] },
    };
    expect(parseMachineFile(JSON.stringify(file))?.machine.charts).toHaveLength(1);
    expect(parseMachineFile(JSON.stringify({ ...file, format: "other" }))).toBeNull();
    expect(parseMachineFile("{")).toBeNull();
  });
});
