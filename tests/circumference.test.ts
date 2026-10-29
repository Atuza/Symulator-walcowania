import { describe, expect, it } from "vitest";
import { emptyMachine } from "../src/domain/calculate";
import { materials } from "../src/domain/materials/data";
import { surfaceDepth } from "../src/domain/types";
import { buildViews } from "../src/drawing/build";
import type { DimensionId } from "../src/drawing/model";
import { defaultProcess } from "../src/state/config";
import { derive, type Derived } from "../src/state/derive";
import { dimensionInputs, dimensionSpec, validDimensionResult } from "../src/state/dimensions";
import { defaultInputs, type Inputs } from "../src/state/inputs";
import { decodeInputs, encodeInputs } from "../src/state/share";

const run = (patch: Partial<Inputs> = {}) =>
  derive({ ...defaultInputs, ...patch }, emptyMachine, defaultProcess, materials);
const edit = (d: Derived, id: DimensionId, value: number) => {
  const inputs = dimensionInputs(d, id, value);
  if (!inputs) throw Error("No candidate");
  return run(inputs);
};

describe("circumference and blank edits", () => {
  it.each(["inner", "mid", "outer"] as const)(
    "uses the %s surface, not the neutral fibre or allowances, for cylinder circumference",
    (surface) => {
      const d = edit(
        run({
          surface,
          k: "0.38",
          flatEnds: true,
          flatLength: "35",
          mode: "fromLength",
          length: "4000",
        }),
        "cylinder.circumference",
        Math.PI * 1200,
      );
      if (d.output?.shape !== "cylinder") throw Error("No cylinder");
      const r = d.output.result;
      expect(r.dInner + 2 * surfaceDepth[surface] * 10).toBeCloseTo(1200, 9);
      expect(r.blankLength).toBeCloseTo(
        Math.PI * (1200 + 20 * (0.38 - surfaceDepth[surface])) + 70,
        8,
      );
      expect(dimensionSpec(d, "cylinder.circumference")?.value).toBeCloseTo(Math.PI * 1200, 8);
      expect(dimensionSpec(d, "r")?.value).toBeCloseTo(600, 9);
      expect(d.inputs).toMatchObject({ mode: "fromDiameter", dimension: "diameter", surface });
    },
  );
  it("switches drivers by editing the drawing and preserves full precision in saved links", () => {
    const blank = edit(
      run({ surface: "outer", k: "0.4", flatEnds: true, flatLength: "25" }),
      "cylinder.blankLength",
      4000,
    );
    expect(blank.inputs.mode).toBe("fromLength");
    expect(dimensionSpec(blank, "cylinder.blankLength")?.value).toBeCloseTo(4000, 8);
    const c = dimensionSpec(blank, "cylinder.circumference")!.value;
    expect(c).toBeCloseTo(3950 + 12 * Math.PI, 8);
    const circum = edit(blank, "cylinder.circumference", c);
    expect(circum.inputs.mode).toBe("fromDiameter");
    if (blank.output?.shape !== "cylinder" || circum.output?.shape !== "cylinder")
      throw Error("No cylinder");
    expect(circum.output.result.blankLength).toBeCloseTo(blank.output.result.blankLength, 8);
    const radius = edit(circum, "r", 650);
    expect(dimensionSpec(radius, "cylinder.circumference")?.value).toBeCloseTo(1300 * Math.PI, 8);
    const restored = run(decodeInputs(encodeInputs(radius.inputs))!);
    expect(restored.output).toEqual(radius.output);
    expect(blank.inputs.length).toBe("4000");
  });
  it.each(["cone", "eccentric"] as const)(
    "synchronizes both %s end circumferences and diameters on every reference surface",
    (shape) => {
      for (const surface of ["inner", "mid", "outer"] as const) {
        const before = run({ shape, surface, offset: shape === "eccentric" ? "300" : "" });
        const large = edit(before, "cone.circumference.large", Math.PI * 1500);
        expect(Number(large.inputs.dLarge)).toBeCloseTo(1500, 9);
        expect(large.inputs.dSmall).toBe(before.inputs.dSmall);
        expect(large.inputs.height).toBe(before.inputs.height);
        expect(large.inputs.offset).toBe(before.inputs.offset);
        expect(dimensionSpec(large, "cone.radius.large")?.value).toBeCloseTo(750, 9);
        const small = edit(large, "cone.circumference.small", Math.PI * 700);
        expect(Number(small.inputs.dSmall)).toBeCloseTo(700, 9);
        expect(dimensionSpec(small, "cone.circumference.small")?.value).toBeCloseTo(
          700 * Math.PI,
          8,
        );
        expect(validDimensionResult(small)).toBe(true);
        const diameter = edit(small, "dLarge", 1800);
        expect(dimensionSpec(diameter, "cone.circumference.large")?.value).toBeCloseTo(
          1800 * Math.PI,
          8,
        );
      }
    },
  );
  it.each([0, -1, NaN, Infinity])("rejects invalid cylinder circumference %s", (value) => {
    expect(dimensionInputs(run(), "cylinder.circumference", value)).toBeNull();
  });
  it("rejects a wall with no inner space, an impossible blank and reversed cone ends without changing the original", () => {
    const cylinder = run({ surface: "outer", thickness: "20", flatEnds: true, flatLength: "30" });
    expect(validDimensionResult(edit(cylinder, "cylinder.circumference", 30 * Math.PI))).toBe(
      false,
    );
    expect(validDimensionResult(edit(cylinder, "cylinder.blankLength", 60))).toBe(false);
    expect(cylinder.inputs.value).toBe(defaultInputs.value);
    expect(validDimensionResult(cylinder)).toBe(true);
    for (const shape of ["cone", "eccentric"] as const) {
      const cone = run({ shape, offset: shape === "eccentric" ? "300" : "" });
      expect(validDimensionResult(edit(cone, "cone.circumference.small", 1300 * Math.PI))).toBe(
        false,
      );
      expect(cone.inputs.dSmall).toBe("600");
    }
    expect(validDimensionResult(edit(run(), "cylinder.circumference", Number.MAX_VALUE))).toBe(
      false,
    );
  });
  it("permits a zero small-end circumference for a valid inner-surface apex cone", () => {
    const apex = edit(run({ shape: "cone" }), "cone.circumference.small", 0);
    expect(apex.inputs.dSmall).toBe("0");
    expect(validDimensionResult(apex)).toBe(true);
  });
  it.each(["cylinder", "cone", "eccentric"] as const)(
    "exposes %s circumference edits in its drawing",
    (shape) => {
      const d = run({ shape, offset: shape === "eccentric" ? "300" : "" });
      const views = buildViews(d.output!, d.width, d.inputs.surface);
      const ids = views.flatMap((v) =>
        v.notes.flatMap((n) => (typeof n === "string" || !n.edit ? [] : [n.edit])),
      );
      expect(ids).toContain(
        shape === "cylinder" ? "cylinder.circumference" : "cone.circumference.large",
      );
      if (shape !== "cylinder") expect(ids).toContain("cone.circumference.small");
      else
        expect(
          views[1]!.prims.some((p) => p.kind === "dim" && p.edit === "cylinder.blankLength"),
        ).toBe(true);
    },
  );
});
