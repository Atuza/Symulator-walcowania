import { describe, it, expect } from "vitest";
import { emptyMachine } from "../src/domain/calculate";
import { materials } from "../src/domain/materials/data";
import { profileGeometry, profileTurn, withFlatEnds } from "../src/domain/editableProfile";
import { buildViews } from "../src/drawing/build";
import { defaultProcess } from "../src/state/config";
import { derive } from "../src/state/derive";
import { defaultInputs, shapeDefaults, type Inputs } from "../src/state/inputs";
import { dimensionInputs, dimensionSpec } from "../src/state/dimensions";
import { editableSegments } from "../src/state/profileDimensions";
import { surfaceDepth } from "../src/domain/types";
import { encodeInputs, decodeInputs } from "../src/state/share";
const run = (patch: Partial<Inputs>) =>
  derive({ ...defaultInputs, ...patch }, emptyMachine, defaultProcess, materials);
const base = (shape: keyof typeof shapeDefaults = "rect", surface: Inputs["surface"] = "inner") =>
  run({ shape, ...shapeDefaults[shape], surface });
const change = (
  d: ReturnType<typeof run>,
  id: Parameters<typeof dimensionInputs>[1],
  value: number,
) => {
  const input = dimensionInputs(d, id, value);
  expect(input).not.toBeNull();
  const next = run(input!);
  expect(next.error).toBeNull();
  return next;
};
const closed = (d: ReturnType<typeof run>) => {
  const parts = editableSegments(d)!;
  const g = profileGeometry(parts, d.thickness!, surfaceDepth[d.inputs.surface]);
  expect(Math.hypot(...g.end)).toBeLessThan(0.01);
  expect(Math.abs(g.turn)).toBeCloseTo(2 * Math.PI, 7);
  expect(d.output?.shape === "profile" && d.output.result.closed).toBe(true);
};
describe("independent features with closure constraints", () => {
  it("keeps flat allowances in overall dimensions and translates the feature anchors", () => {
    const initial = run({ ...base("ushape").inputs, flatEnds: true, flatLength: "100" });
    const d = change(initial, "extent.y", 950);
    expect(dimensionSpec(d, "extent.y")?.value).toBeCloseTo(950, 4);
    const g = profileGeometry(
      withFlatEnds(editableSegments(d)!, 100),
      d.thickness!,
      0,
      profileTurn.ushape,
    );
    expect(g.height).toBeCloseTo(950, 4);
    const view = buildViews(d.output!, d.width, d.inputs.surface)[0]!;
    const tag = view.prims.find((p) => p.kind === "tag" && p.edit === "segment.0.size");
    const baseFeature = profileGeometry(editableSegments(d)!, d.thickness!, 0, profileTurn.ushape)
      .features[0]!;
    expect(tag?.kind === "tag" && tag.at[1]).toBeCloseTo(baseFeature.middle[1] - 100, 5);
  });
  it("allows a zero-length bucket straight without losing the valid profile", () => {
    const d = change(base("bucket"), "segment.0.size", 0);
    expect(dimensionSpec(d, "segment.0.size")?.value).toBe(0);
    expect(d.output?.shape).toBe("profile");
  });
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])(
    "keeps every edited rectangle feature %i fixed and closes",
    (index) => {
      const initial = base(),
        part = editableSegments(initial)![index]!;
      const size = part.kind === "line" ? part.length : part.radius;
      const d = change(initial, `segment.${index}.size`, size * 1.1);
      expect(dimensionSpec(d, `segment.${index}.size`)?.value).toBeCloseTo(size * 1.1, 5);
      closed(d);
    },
  );
  it.each(["inner", "mid", "outer"] as const)(
    "edits one rectangle corner radius on %s",
    (surface) => {
      const d = change(base("rect", surface), "segment.1.size", 120);
      const parts = editableSegments(d)!;
      expect(parts[1]).toMatchObject({ radius: 120 });
      for (const i of [3, 5, 7]) expect(parts[i]).toMatchObject({ radius: 60 });
      closed(d);
    },
  );
  it("changes a 90-degree corner to 100 degrees without opening the rectangle", () => {
    const d = change(base(), "segment.1.angle", 80);
    expect(dimensionSpec(d, "segment.1.angle")?.value).toBeCloseTo(80, 7);
    expect(d.inputs.profileSegs).not.toBe("");
    closed(d);
  });
  it("edits one straight and keeps its requested length fixed", () => {
    const d = change(base(), "segment.2.size", 650);
    expect(editableSegments(d)![2]).toMatchObject({ length: 650 });
    closed(d);
  });
  it("changes the overall width while preserving height and corner radii", () => {
    const d = change(base(), "extent.x", 1200);
    const g = profileGeometry(editableSegments(d)!, 10, 0, profileTurn.rect);
    expect(g.width).toBeCloseTo(1200, 5);
    expect(g.height).toBeCloseTo(600, 5);
    closed(d);
    expect(
      editableSegments(d)!
        .filter((s) => s.kind === "arc")
        .map((s) => s.kind === "arc" && s.radius),
    ).toEqual([60, 60, 60, 60]);
  });
  it("supports asymmetric open U legs and their opening angle", () => {
    let d = change(base("ushape"), "segment.0.size", 500);
    expect(editableSegments(d)![2]).toMatchObject({ length: 400 });
    d = change(d, "segment.1.angle", 160);
    expect(dimensionSpec(d, "segment.1.angle")?.value).toBeCloseTo(160, 7);
    expect(d.output?.shape === "profile" && d.output.result.closed).toBe(false);
  });
  it("fits a tank with independently edited arc radius and turn", () => {
    let d = change(base("tank"), "segment.1.size", 450);
    closed(d);
    d = change(d, "segment.2.angle", 30);
    closed(d);
  });
  it("preserves closure when an obround semicircle radius changes", () => {
    const d = change(base("obround"), "segment.1.size", 450);
    closed(d);
    expect(dimensionSpec(d, "segment.1.size")?.value).toBe(450);
  });
  it("round trips independent corners and the closure lock through QR", () => {
    const d = change(base(), "segment.1.angle", 75);
    const decoded = decodeInputs(encodeInputs(d.inputs));
    expect(decoded).toEqual(d.inputs);
    closed(run(decoded!));
  });
  it("edits ellipse curvature radii through exact semi-axis relations", () => {
    const d = change(base("ellipse"), "ellipse.min", 600);
    expect(dimensionSpec(d, "ellipse.min")?.value).toBeCloseTo(600, 5);
    expect(dimensionSpec(d, "ellipse.max")?.value).toBeCloseTo(
      dimensionSpec(base("ellipse"), "ellipse.max")!.value,
      5,
    );
  });
});

describe("cone inverse dimensions", () => {
  it.each(["cone.r1", "cone.r2", "cone.sector", "cone.slant"] as const)(
    "edits %s through the exact cone model",
    (id) => {
      const initial = run({ shape: "cone" });
      const target = dimensionSpec(initial, id)!.value * 1.1;
      const d = change(initial, id, target);
      expect(dimensionSpec(d, id)!.value).toBeCloseTo(target, 5);
    },
  );
  it.each(["cone.slant.short", "cone.slant.long"] as const)(
    "edits %s on the eccentric cone",
    (id) => {
      const initial = run({ shape: "eccentric", offset: "100" });
      const target = dimensionSpec(initial, id)!.value * 1.1;
      const d = change(initial, id, target);
      expect(dimensionSpec(d, id)!.value).toBeCloseTo(target, 5);
    },
  );
});
