import { describe, expect, it } from "vitest";
import { emptyMachine } from "../src/domain/calculate";
import { materials } from "../src/domain/materials/data";
import { PROFILE_SHAPES } from "../src/domain/shapes";
import { buildViews } from "../src/drawing/build";
import { drawViews, type Sink } from "../src/drawing/layout";
import type { DimensionId } from "../src/drawing/model";
import { defaultProcess } from "../src/state/config";
import { derive, type Derived } from "../src/state/derive";
import { dimensionInputs, dimensionSpec, validDimensionResult } from "../src/state/dimensions";
import { defaultInputs, shapeDefaults, type Inputs } from "../src/state/inputs";
import { sceneModel } from "../src/viz/sceneModel";
import { rectangleContour, contourLength } from "../src/export/dxf";

const run = (patch: Partial<Inputs> = {}) =>
  derive({ ...defaultInputs, ...patch }, emptyMachine, defaultProcess, materials);
const change = (d: Derived, id: DimensionId, value: number) => {
  const inputs = dimensionInputs(d, id, value);
  if (!inputs) throw Error("No input change");
  return run(inputs);
};
const rectangle = () =>
  run({ shape: "rect", ...shapeDefaults.rect, thickness: "9.9", width: "2500" });

describe("drawing dimension changes", () => {
  it("updates blank, mass, drawing and 3D from one rectangle A edit", () => {
    const before = rectangle(),
      after = change(before, "a", 1200);
    expect(before.inputs.sizeA).toBe("1000");
    expect(after.inputs.sizeA).toBe("1200");
    const a = before.output,
      b = after.output;
    if (a?.shape !== "profile" || b?.shape !== "profile") throw Error("No profile");
    expect(b.result.blankLength - a.result.blankLength).toBeCloseTo(400, 7);
    expect(b.massKg! - a.massKg!).toBeCloseTo((400 * 2500 * 9.9 * 7850) / 1e9, 8);
    const model = sceneModel(b, 9.9, 2500, emptyMachine);
    if (model.shape !== "profile") throw Error("No profile scene");
    expect(model.dev.length).toBe(b.result.blankLength);
    expect(contourLength(rectangleContour(b.result.blankLength, 2500))).toBeCloseTo(
      2 * (b.result.blankLength + 2500),
      7,
    );
    expect(
      buildViews(b, 2500, "inner")[0]!.prims.some(
        (p) => p.kind !== "path" && p.edit === "extent.x",
      ),
    ).toBe(true);
  });
  it("changes width independently of section and developed length", () => {
    const before = rectangle(),
      after = change(before, "width", 3000);
    if (before.output?.shape !== "profile" || after.output?.shape !== "profile")
      throw Error("No profile");
    expect(after.output.result.blankLength).toBe(before.output.result.blankLength);
    expect(after.output.massKg! / before.output.massKg!).toBeCloseTo(1.2, 10);
  });
  it.each(["inner", "mid", "outer"] as const)(
    "edits radius on the %s reference without adding thickness twice",
    (surface) => {
      const after = change(run({ ...rectangle().inputs, surface }), "r", 80);
      if (after.output?.shape !== "profile") throw Error("No profile");
      expect(after.inputs.sizeR).toBe("80");
      expect(after.output.result.radii[0]).toBeCloseTo(
        80 - { inner: 0, mid: 0.5, outer: 1 }[surface] * 9.9,
        6,
      );
    },
  );
  it("rejects an impossible corner without mutating original inputs", () => {
    const before = rectangle(),
      after = change(before, "r", 400);
    expect(after.output).toBeNull();
    expect(before.inputs.sizeR).toBe("60");
    expect(before.output?.shape).toBe("profile");
  });
  it.each(["inner", "outer"] as const)(
    "edits the actual %s cylinder diameter from reverse/radius mode",
    (surface) => {
      const after = change(
        run({ mode: "fromLength", length: "3500", dimension: "radius", surface: "mid" }),
        `diameter.${surface}`,
        1200,
      );
      expect(after.inputs).toMatchObject({
        mode: "fromDiameter",
        dimension: "diameter",
        surface,
        value: "1200",
      });
      if (after.output?.shape !== "cylinder") throw Error("No cylinder");
      expect(
        surface === "inner" ? after.output.result.dInner : after.output.result.dOuter,
      ).toBeCloseTo(1200, 8);
    },
  );
  it.each(["cylinder", "halfround"] as const)(
    "changes the %s radius using the selected surface",
    (shape) => {
      const after = change(run({ shape, ...shapeDefaults.halfround, surface: "outer" }), "r", 700);
      expect(after.inputs).toMatchObject({ dimension: "radius", value: "700", surface: "outer" });
      expect(dimensionSpec(after, "r")?.value).toBe(700);
    },
  );
  it.each(["ushape", "obround"] as const)(
    "keeps the %s radius tied to its semicircle diameter",
    (shape) => {
      const after = change(run({ shape, ...shapeDefaults[shape] }), "r", 450);
      expect(shape === "ushape" ? after.inputs.sizeA : after.inputs.sizeB).toBe("900");
      expect(after.output?.shape).toBe("profile");
    },
  );
  it("changes a single free segment and preserves other segments and negative turns", () => {
    const before = run({ shape: "free", freeSegs: "L300_R400a90_L200_R100a-45" });
    const radius = change(before, "segment.1.size", 500);
    expect(radius.inputs.freeSegs).toBe("L300_R500a90_L200_R100a-45");
    const angle = change(radius, "segment.3.angle", -60);
    expect(angle.inputs.freeSegs).toBe("L300_R500a90_L200_R100a-60");
    expect(angle.output?.shape).toBe("profile");
  });
  it("keeps eccentric input dimensions independent", () => {
    const before = run({ shape: "eccentric", offset: "100" });
    const after = change(before, "height", 1000);
    expect(after.inputs).toMatchObject({
      shape: "eccentric",
      height: "1000",
      offset: "100",
      dLarge: before.inputs.dLarge,
      dSmall: before.inputs.dSmall,
    });
    expect(after.output?.shape).toBe("eccentric");
  });
  it("rejects non-finite, zero-width and missing-segment edits", () => {
    expect(dimensionInputs(rectangle(), "a", Infinity)).toBeNull();
    expect(dimensionInputs(rectangle(), "width", 0)).toBeNull();
    expect(dimensionInputs(rectangle(), "thickness", -1)).toBeNull();
    expect(dimensionInputs(rectangle(), "segment.999.size", 200)).toBeNull();
  });
});

describe("interactive drawing contract", () => {
  it.each(["cylinder", "cone", "eccentric", ...PROFILE_SHAPES] as const)(
    "all %s targets resolve and only uniquely invertible developed measures are editable",
    (shape) => {
      const d = run({
        shape,
        ...(shape in shapeDefaults ? shapeDefaults[shape as keyof typeof shapeDefaults] : {}),
        offset: shape === "eccentric" ? "100" : "",
      });
      if (!d.output) throw Error("No output");
      expect(validDimensionResult(d)).toBe(true);
      const views = buildViews(d.output, d.width, d.inputs.surface);
      const ids: DimensionId[] = [];
      const sink: Sink = {
        path() {},
        fill() {},
        text(_x, _y, _text, o) {
          if (o.edit) ids.push(o.edit);
        },
      };
      drawViews(views, { x: 0, y: 0, w: 1200, h: 900 }, sink, {
        fontSize: 12,
        arrow: 7,
        pad: 30,
        gap: 16,
        interactive: true,
      });
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(dimensionSpec(d, id), id).not.toBeNull();
      for (const p of views[1]!.prims) {
        if (p.kind !== "path")
          expect(
            p.edit === undefined ||
              p.edit === "width" ||
              p.edit === "cylinder.blankLength" ||
              p.edit.startsWith("cone."),
          ).toBe(true);
      }
    },
  );
});
