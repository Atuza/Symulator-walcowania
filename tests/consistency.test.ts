import { describe, expect, it } from "vitest";
import { emptyMachine } from "../src/domain/calculate";
import { materials } from "../src/domain/materials/data";
import { finalRadius } from "../src/domain/springback";
import { buildViews } from "../src/drawing/build";
import type { View } from "../src/drawing/model";
import { contourLength, rectangleContour, sectorContour } from "../src/export/dxf";
import { num } from "../src/i18n";
import { defaultProcess } from "../src/state/config";
import { derive } from "../src/state/derive";
import { defaultInputs, type Inputs } from "../src/state/inputs";
import { heroes, resultGroups } from "../src/ui/rows";
import { sceneModel } from "../src/viz/sceneModel";

/*
 * End-to-end checks from the typed inputs (as the user enters them) to every output: headline values,
 * result rows, drawing labels, DXF contour and the 3D model must all describe the same part.
 */

const run = (patch: Partial<Inputs>) =>
  derive({ ...defaultInputs, ...patch }, emptyMachine, defaultProcess, materials);

describe("cone offset input", () => {
  it.each(["-100", "not a number", "Infinity"])(
    "rejects invalid offset %s instead of silently using a concentric cone",
    (offset) => {
      const d = run({ shape: "cone", offset });
      expect(d.output).toBeNull();
      expect(d.error).toEqual({ key: "error.offset", field: "offset" });
    },
  );
});

function labels(view: View): string[] {
  return view.prims.flatMap((p) => (p.kind === "path" ? [] : [p.label]));
}

describe("cylinder: one part, every output", () => {
  const d = run({ thickness: "12", value: "1500", width: "2500", flatEnds: true });
  const out = d.output;
  if (!out || out.shape !== "cylinder") throw new Error("no result");
  const r = out.result;

  it("headline equals the computed blank length", () => {
    expect(heroes(d)[0]!.value).toBe(num(r.blankLength));
    expect(r.blankLength).toBeCloseTo(Math.PI * (1500 + 12) + 2 * 1.5 * 12, 9);
  });

  it("drawing dimensions match the results", () => {
    const [section, dev] = buildViews(out, d.width, "inner");
    expect(labels(dev!)).toContain(num(r.blankLength));
    expect(labels(dev!)).toContain(num(2500));
    expect(labels(section!)).toContain(`Ø ${num(r.dInner)}`);
    expect(labels(section!)).toContain(`Ø ${num(r.dOuter)}`);
  });

  it("DXF contour is the blank rectangle", () => {
    const c = rectangleContour(r.blankLength, d.width!);
    expect(contourLength(c)).toBeCloseTo(2 * (r.blankLength + 2500), 9);
  });

  it("3D model uses the same blank and radius", () => {
    const m = sceneModel(out, 12, d.width, emptyMachine);
    if (m.shape !== "cylinder") throw new Error("shape");
    expect(m.length).toBe(r.blankLength);
    expect(m.radius).toBe(r.dNeutral / 2);
  });

  it("set diameter springs back to the target", () => {
    const set = out.set!;
    const ePlane = 210_000 / (1 - 0.09);
    const rn = (set.dInner + 2 * r.k * 12) / 2;
    expect(2 * finalRadius(rn, 12, 355, ePlane) - 12).toBeCloseTo(1500, 6);
  });

  it("the blank length typed back in gives the same diameter", () => {
    // Users copy the rounded value, so the round trip only has to hold to display precision.
    const back = run({
      thickness: "12",
      mode: "fromLength",
      length: num(r.blankLength).replace(/\s/g, ""),
      width: "2500",
      flatEnds: true,
    });
    if (!back.output || back.output.shape !== "cylinder") throw new Error("no result");
    expect(back.output.result.dInner).toBeCloseTo(1500, 2);
  });

  it("mass agrees with the blank size", () => {
    expect(out.massKg).toBeCloseTo(r.blankLength * 2500 * 12 * 1e-9 * 7850, 9);
    const massRow = resultGroups(d)[0]!.rows.find((row) => row.unit === "kg");
    expect(massRow?.value).toBe(num(out.massKg!, 1));
  });
});

describe("cone: one part, every output", () => {
  const d = run({
    shape: "cone",
    thickness: "8",
    dLarge: "1400",
    dSmall: "500",
    height: "900",
    surface: "outer",
  });
  const out = d.output;
  if (!out || out.shape !== "cone") throw new Error("no result");
  const r = out.result;

  it("headline radii and angle come from the result", () => {
    const h = heroes(d);
    expect(h.map((x) => x.value)).toEqual([
      num(r.rOuter),
      num(r.rInner),
      num((r.angle * 180) / Math.PI),
    ]);
  });

  it("closed cone: arcs equal the neutral circumferences", () => {
    expect(r.arcOuter).toBeCloseTo(Math.PI * r.large.dNeutral, 6);
    expect(r.arcInner).toBeCloseTo(Math.PI * r.small.dNeutral, 6);
  });

  it("outer surface input reproduces the given diameters", () => {
    expect(r.large.dOuter).toBeCloseTo(1400, 9);
    expect(r.small.dOuter).toBeCloseTo(500, 9);
  });

  it("drawing shows arc lengths and input diameters without an apex-angle annotation", () => {
    const [side, dev] = buildViews(out, null, "outer");
    expect(labels(side!)).toEqual(
      expect.arrayContaining([`Ø ${num(1400)}`, `Ø ${num(500)}`, num(900)]),
    );
    expect(labels(dev!)).toEqual(
      expect.arrayContaining([num(r.arcOuter), num(r.arcInner), num(r.slant)]),
    );
    expect(labels(dev!)).not.toContain(`${num((r.angle * 180) / Math.PI)}°`);
  });

  it("DXF sector perimeter equals arcs plus both seams", () => {
    const c = sectorContour(r.rInner, r.rOuter, r.angle);
    expect(contourLength(c)).toBeCloseTo(r.arcOuter + r.arcInner + 2 * r.slant, 6);
  });

  it("mass agrees with the development area", () => {
    expect(out.massKg).toBeCloseTo(r.area * 8 * 1e-9 * 7850, 9);
  });

  it("flat-end allowance widens the sector by 2f at the mean radius", () => {
    const withFlats = run({
      shape: "cone",
      thickness: "8",
      dLarge: "1400",
      dSmall: "500",
      height: "900",
      surface: "outer",
      flatEnds: true,
    });
    if (!withFlats.output || withFlats.output.shape !== "cone") throw new Error("no result");
    const w = withFlats.output.result;
    const rMean = (w.rOuter + w.rInner) / 2;
    expect((w.angle - w.angleNet) * rMean).toBeCloseTo(2 * 1.5 * 8, 9);
  });
});

describe("machine checks use the diameter the machine has to roll", () => {
  it("warns when the set diameter, not the final one, is below the minimum", () => {
    // Final inner Ø 1000 passes a 950 mm minimum, but the springback-compensated setting does not.
    const d = derive(
      { ...defaultInputs, thickness: "10", value: "1000" },
      { ...emptyMachine, minDiameter: 950 },
      defaultProcess,
      materials,
    );
    const out = d.output!;
    if (out.shape !== "cylinder") throw new Error("shape");
    expect(out.set!.dInner).toBeLessThan(950);
    expect(out.warnings.map((w) => w.code)).toContain("machineDiameter");
  });
});
