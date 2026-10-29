import { describe, expect, it } from "vitest";
import { materials } from "../src/domain/materials/data";
import { buildViews } from "../src/drawing/build";
import { drawViews } from "../src/drawing/layout";
import type { DimensionId } from "../src/drawing/model";
import { defaultProcess } from "../src/state/config";
import { derive, type Derived } from "../src/state/derive";
import { dimensionInputs, dimensionSpec, validDimensionResult } from "../src/state/dimensions";
import { defaultInputs, selectableShapes, shapeDefaults, type Inputs } from "../src/state/inputs";
import { withFixedMachine } from "../src/state/fixedMachine";
import { decodeInputs, encodeInputs } from "../src/state/share";
import { heroes } from "../src/ui/rows";

const run = (patch: Partial<Inputs> = {}) =>
  derive({ ...defaultInputs, ...patch }, withFixedMachine(), defaultProcess, materials);
const change = (before: Derived, id: DimensionId, value: number) => {
  const candidate = dimensionInputs(before, id, value);
  if (!candidate) throw Error(`No candidate for ${id}`);
  const after = run(candidate);
  expect(validDimensionResult(after), `${id}: ${after.error?.key}`).toBe(true);
  return after;
};

describe("direct drawing inputs", () => {
  it("keeps a small positive inner development radius editable when the dimension offset reaches its apex", () => {
    const d = run({ shape: "cone", dSmall: "10", surface: "inner" }),
      ids: DimensionId[] = [];
    drawViews(
      buildViews(d.output!, null, "inner"),
      { x: 0, y: 0, w: 1200, h: 900 },
      {
        path() {},
        fill() {},
        text(_x, _y, _l, o) {
          if (o.edit) ids.push(o.edit);
        },
      },
      { fontSize: 12, pad: 40, arrow: 7, gap: 16, interactive: true },
    );
    expect(ids).toContain("cone.r2");
    expect(ids).toContain("cone.arc.small");
  });
  it("offers only the eight requested shapes while preserving legacy saved shape inputs", () => {
    expect(selectableShapes).toEqual([
      "cylinder",
      "cone",
      "eccentric",
      "halfround",
      "ushape",
      "obround",
      "rect",
      "bucket",
    ]);
    for (const shape of ["tank", "ellipse", "free"] as const) {
      const d = run({ shape, ...shapeDefaults[shape] });
      expect(run(decodeInputs(encodeInputs(d.inputs))!).output).toEqual(d.output);
    }
  });
  it.each(selectableShapes)(
    "every displayed %s measure has a valid input binding, including Ø/R pairs",
    (shape) => {
      const d = run({
        shape,
        ...(shape in shapeDefaults ? shapeDefaults[shape as keyof typeof shapeDefaults] : {}),
        offset: shape === "eccentric" ? "300" : "",
      });
      const views = buildViews(d.output!, d.width, d.inputs.surface);
      for (const view of views)
        for (const p of view.prims) {
          if (p.kind === "path") continue;
          expect(p.edit, `${shape}: ${p.label}`).toBeDefined();
          expect(dimensionSpec(d, p.edit!)).not.toBeNull();
          if ("extra" in p)
            for (const e of p.extra ?? []) expect(dimensionSpec(d, e.edit!)).not.toBeNull();
        }
      expect(views.flatMap((v) => v.notes).filter((n) => typeof n !== "string" && n.edit)).toEqual(
        [],
      );
      const ids: DimensionId[] = [];
      drawViews(
        views,
        { x: 0, y: 0, w: 1400, h: 1400 },
        {
          path() {},
          fill() {},
          text(_x, _y, _t, o) {
            if (o.edit) ids.push(o.edit);
          },
        },
        { fontSize: 12, pad: 40, gap: 16, arrow: 7, interactive: true },
      );
      expect(ids).not.toContain("thickness");
      for (const hero of heroes(d)) {
        expect(hero.edit).toBeDefined();
        expect(dimensionSpec(d, hero.edit!)).not.toBeNull();
      }
      if (shape === "cylinder")
        expect(ids).toEqual(
          expect.arrayContaining([
            "radius.inner",
            "radius.outer",
            "diameter.inner",
            "diameter.outer",
          ]),
        );
      if (shape === "cone" || shape === "eccentric")
        expect(ids).toEqual(
          expect.arrayContaining([
            "cone.radius.large",
            "cone.radius.small",
            "dLarge",
            "dSmall",
            "cone.circumference.large",
            "cone.circumference.small",
          ]),
        );
    },
  );
  it.each(["halfround", "ushape", "obround", "rect", "bucket"] as const)(
    "inverts the %s blank length by scaling the reference section with thickness and width fixed",
    (shape) => {
      for (const surface of ["inner", "mid", "outer"] as const) {
        const before = run({
          shape,
          ...shapeDefaults[shape],
          surface,
          flatEnds: true,
          flatLength: "25",
        });
        const target = dimensionSpec(before, "profile.blankLength")!.value * 1.1;
        const after = change(before, "profile.blankLength", target);
        expect(dimensionSpec(after, "profile.blankLength")!.value).toBeCloseTo(target, 4);
        expect(after.inputs.thickness).toBe(before.inputs.thickness);
        expect(after.inputs.width).toBe(before.inputs.width);
        expect(after.flatEnd).toBe(25);
        if (after.output?.shape !== "profile" || before.output?.shape !== "profile")
          throw Error("No profile");
        expect(after.output.result.closed).toBe(before.output.result.closed);
      }
    },
  );
  it.each(["halfround", "ushape", "rect", "bucket"] as const)(
    "inverts the neutral arc interval for %s while preserving closure",
    (shape) => {
      const before = run({ shape, ...shapeDefaults[shape], surface: "outer" });
      if (before.output?.shape !== "profile") throw Error("No profile");
      const index = before.output.result.profile.segments.findIndex((s) => s.kind === "arc");
      const id = `segment.${index}.developed` as const,
        target = dimensionSpec(before, id)!.value * 1.05;
      const after = change(before, id, target);
      expect(dimensionSpec(after, id)!.value).toBeCloseTo(target, 4);
    },
  );
  it.each(["cone", "eccentric"] as const)(
    "inverts both %s developed edge lengths and both blank extents",
    (shape) => {
      for (const surface of ["inner", "mid", "outer"] as const)
        for (const id of [
          "cone.arc.large",
          "cone.arc.small",
          "cone.box.width",
          "cone.box.height",
        ] as const) {
          const before = run({ shape, surface, offset: shape === "eccentric" ? "300" : "" });
          const target = dimensionSpec(before, id)!.value * 1.04;
          const after = change(before, id, target);
          expect(dimensionSpec(after, id)!.value, `${shape}/${surface}/${id}`).toBeCloseTo(
            target,
            3,
          );
          if (id.startsWith("cone.arc")) {
            expect(after.inputs.height).toBe(before.inputs.height);
            expect(after.inputs.offset).toBe(before.inputs.offset);
            expect(after.inputs[id === "cone.arc.large" ? "dSmall" : "dLarge"]).toBe(
              before.inputs[id === "cone.arc.large" ? "dSmall" : "dLarge"],
            );
          } else {
            expect(Number(after.inputs.dLarge) / Number(after.inputs.dSmall)).toBeCloseTo(2, 8);
            expect(Number(after.inputs.height) / Number(after.inputs.dLarge)).toBeCloseTo(2 / 3, 8);
          }
        }
    },
  );
  it("retains zero-end controls on a valid apex and rejects impossible changes without mutating its inputs", () => {
    const before = run({ shape: "cone", dSmall: "0" });
    const drawn: DimensionId[] = [];
    drawViews(
      buildViews(before.output!, null, "inner"),
      { x: 0, y: 0, w: 1500, h: 1000 },
      {
        path() {},
        fill() {},
        text(_x, _y, _l, o) {
          if (o.edit) drawn.push(o.edit);
        },
      },
      { fontSize: 12, pad: 40, arrow: 7, gap: 16, interactive: true },
    );
    expect(drawn).toContain("dSmall");
    expect(drawn).toContain("cone.radius.small");
    expect(dimensionInputs(before, "cone.arc.large", 0)).toBeNull();
    expect(before.inputs.dSmall).toBe("0");
  });
});
