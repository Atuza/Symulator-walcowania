import { describe, expect, it } from "vitest";
import { emptyMachine } from "../src/domain/calculate";
import { P460_CYLINDER_CALIBRATION as profile } from "../src/domain/cutCalibration";
import { solveCylinder } from "../src/domain/cylinder";
import { materials } from "../src/domain/materials/data";
import { buildViews } from "../src/drawing/build";
import { rectangleContour } from "../src/export/dxf";
import { num, t } from "../src/i18n";
import { defaultProcess } from "../src/state/config";
import { derive } from "../src/state/derive";
import { dimensionInputs, dimensionSpec, validDimensionResult } from "../src/state/dimensions";
import { defaultInputs, inputsSchema, type Inputs } from "../src/state/inputs";
import { decodeInputs, encodeInputs } from "../src/state/share";
import { heroes, resultGroups } from "../src/ui/rows";
import { feedLength, sceneModel } from "../src/viz/sceneModel";

const run = (patch: Partial<Inputs> = {}) =>
  derive(
    { ...defaultInputs, materialId: "p460nl2", value: "2380", ...patch },
    emptyMachine,
    defaultProcess,
    materials,
  );
const cylinder = (patch: Partial<Inputs> = {}) => {
  const d = run(patch);
  if (d.output?.shape !== "cylinder") throw new Error(JSON.stringify(d.error));
  return d.output;
};

describe("P460NL2 cylinder cut-length calibration", () => {
  it("uses the observed mean excess circumference, not a second k or springback fit", () => {
    // Independent aggregate calculation from the five cylinders in report R2.
    // Keep individual production cut lists and the private report outside the repository.
    const circumferenceExcessTotal = 34 + 32 + 35 + 34 + 37;
    const thicknessTotal = 10 + 9.2 + 10 + 9.2 + 10;
    const mean = (circumferenceExcessTotal - Math.PI * thicknessTotal) / 5;
    expect(profile.correction).toBeCloseTo(mean, 12);
    // A zero-intercept least-squares fit of excess length against thickness, independently aggregated.
    const thicknessSquaredTotal = 100 + 84.64 + 100 + 84.64 + 100;
    const weightedExcessTotal = 340 + 294.4 + 350 + 312.8 + 370;
    const slope = weightedExcessTotal / thicknessSquaredTotal - Math.PI;
    expect(profile.correctionPerThickness).toBeCloseTo(slope, 12);
    expect(profile.effectiveK).toBeCloseTo(0.5 - slope / (2 * Math.PI), 12);
    expect(profile.trials).toBe(5);
    expect(profile.pressureSetpointBar).toBe(55);
  });

  it("shortens the report's example once while preserving k, target geometry and springback", () => {
    const base = cylinder({ cylinderCalibration: false });
    const calibrated = cylinder();
    expect(calibrated.result.blankLength).toBeCloseTo(7504.295604, 6);
    expect(base.result.blankLength - calibrated.result.blankLength).toBeCloseTo(
      profile.correctionPerThickness * 10,
      10,
    );
    expect(calibrated.result.k).toBe(0.5);
    expect(calibrated.result.ringLength).toBe(base.result.ringLength);
    expect(calibrated.result.dInner).toBe(2380);
    expect(calibrated.result.dOuter).toBe(2400);
    expect(calibrated.set).toEqual(base.set);
    expect(calibrated.limits).toEqual(base.limits);
  });

  it.each([0.5, 1, 5, 9.19, 9.2, 9.6, 10, 10.01, 12, 20, 40, 100, 500])(
    "round-trips cut length and every Ø/R/C reference at t=%s",
    (thickness) => {
      for (const surface of ["inner", "mid", "outer"] as const) {
        const d = run({ thickness: String(thickness), surface });
        expect(d.cutCalibration).toBe("applied");
        const r = cylinder({ thickness: String(thickness), surface }).result;
        expect(r.cutCorrection).toBeCloseTo(profile.correctionPerThickness * thickness, 10);
        const back = cylinder({
          thickness: String(thickness),
          mode: "fromLength",
          length: String(r.blankLength),
        });
        expect(back.result.dInner).toBeCloseTo(r.dInner, 9);
        expect(back.result.blankLength).toBeCloseTo(r.blankLength, 9);
        for (const id of [
          "diameter.inner",
          "diameter.outer",
          "radius.inner",
          "radius.outer",
          "cylinder.circumference",
          "cylinder.blankLength",
        ] as const) {
          const spec = dimensionSpec(d, id)!;
          const candidate = dimensionInputs(d, id, spec.value)!;
          const edited = run(candidate);
          expect(validDimensionResult(edited), id).toBe(true);
          if (edited.output?.shape !== "cylinder") throw new Error(id);
          expect(edited.output.result.dInner, id).toBeCloseTo(r.dInner, 8);
          expect(edited.output.result.blankLength, id).toBeCloseTo(r.blankLength, 8);
        }
      }
    },
  );

  it.each([
    [{ cylinderCalibration: false }, "disabled"],
    [{ flatEnds: true }, "flatEnds"],
    [{ k: "0.434574" }, "manualK"],
    [{ k: "0.5" }, "manualK"],
  ] as const)("explains inactive profile %j", (patch, status) => {
    expect(run(patch).cutCalibration).toBe(status);
    expect(cylinder(patch).result.cutCorrection).toBe(0);
    expect(cylinder(patch).result.blankLength).toBeCloseTo(
      cylinder({ ...patch, cylinderCalibration: false }).result.blankLength,
      10,
    );
  });

  it("flags extrapolation without a discontinuity in the length/diameter inverse", () => {
    for (const value of ["1000", "2181.43", "2382.6", "4000"]) {
      const out = cylinder({ value });
      const reverse = cylinder({ mode: "fromLength", length: String(out.result.blankLength) });
      expect(reverse.result.dInner).toBeCloseTo(Number(value), 9);
      const outside = Math.PI * out.result.dOuter < 6916 || Math.PI * out.result.dOuter > 7548;
      expect(out.warnings.some((w) => w.code === "cutCalibrationExtrapolated")).toBe(outside);
    }
    expect(cylinder().warnings.some((w) => w.code === "cutCalibrationExtrapolated")).toBe(false);
    for (const thickness of ["5", "12", "20", "40"])
      expect(
        cylinder({ thickness }).warnings.some((w) => w.code === "cutCalibrationExtrapolated"),
      ).toBe(true);
  });

  it.each([
    "cone",
    "eccentric",
    "halfround",
    "ushape",
    "obround",
    "rect",
    "bucket",
    "tank",
    "ellipse",
    "free",
  ] as const)("does not affect %s, even with P460NL2 selected", (shape) => {
    const patch = {
      shape,
      offset: shape === "eccentric" ? "100" : "",
      sizeA: "1000",
      sizeB: "600",
      sizeR: "100",
      angle: "120",
      freeSegs: "L300_R400a90_L300",
    };
    const enabled = run({ ...patch, cylinderCalibration: true });
    const disabled = run({ ...patch, cylinderCalibration: false });
    expect(enabled.output).not.toBeNull();
    expect(enabled.cutCalibration).toBeNull();
    expect(enabled.output).toEqual(disabled.output);
  });

  it.each(["s355j2", "p355nl1", "custom"])("does not affect another material: %s", (materialId) => {
    const patch = { materialId, customRe: "460" };
    const d = run(patch);
    expect(d.cutCalibration).toBeNull();
    expect(d.output).not.toBeNull();
    expect(d.output).toEqual(run({ ...patch, cylinderCalibration: false }).output);
  });

  it("keeps the drawing, PDF rows, mass, DXF and closed 3D target consistent", () => {
    const d = run();
    const out = cylinder();
    const r = out.result;
    const dev = buildViews(out, d.width, "inner")[1]!;
    expect(
      dev.prims.some(
        (p) =>
          p.kind === "dim" && p.edit === "cylinder.blankLength" && p.label === num(r.blankLength),
      ),
    ).toBe(true);
    expect(dev.notes).toEqual([
      t("drawing.cutCalibration", { correction: num(r.cutCorrection, 3) }),
    ]);
    expect(heroes(d)[0]!.raw).toBe(r.blankLength);
    expect(resultGroups(d).flatMap((g) => g.rows)).toContainEqual({
      label: t("result.cutCorrection"),
      value: num(-r.cutCorrection, 3),
      unit: "mm",
      estimate: true,
    });
    expect(rectangleContour(r.blankLength, d.width!)[1]!.x).toBe(r.blankLength);
    expect(out.massKg).toBeCloseTo(r.blankLength * 2000 * 10 * 1e-9 * 7850, 9);
    const scene = sceneModel(out, 10, 2000, emptyMachine);
    if (scene.shape !== "cylinder") throw new Error("shape");
    expect(feedLength(scene)).toBe(r.blankLength);
    expect(scene.formedLength).toBeCloseTo(2 * Math.PI * scene.radius, 9);
  });

  it("rejects invalid cut lengths and corrections", () => {
    for (const length of ["0", "-1", "Infinity", "NaN", "0.1"])
      expect(run({ mode: "fromLength", length }).output).toBeNull();
    for (const cutCorrection of [-1, NaN, Infinity, 10000])
      expect(
        solveCylinder({
          mode: "fromDiameter",
          thickness: 10,
          value: 2380,
          isRadius: false,
          surface: "inner",
          flatEnds: 0,
          kOverride: null,
          cutCorrection,
        }),
      ).toBe("length");
  });
});

describe("cut calibration persistence and old calculations", () => {
  it.each([true, false])(
    "keeps the selected model in calculation links: %s",
    (cylinderCalibration) => {
      const inputs = {
        ...defaultInputs,
        materialId: "p460nl2",
        value: "2380",
        cylinderCalibration,
      };
      expect(decodeInputs(encodeInputs(inputs))).toEqual(inputs);
      expect(inputsSchema.parse(inputs)).toEqual(inputs);
    },
  );

  it("keeps old links, saved jobs and templates on their original geometric model", () => {
    const link = decodeInputs("#c=1;mi=p460nl2;v=2380")!;
    expect(link.cylinderCalibration).toBe(false);
    const old = { ...defaultInputs } as Partial<Inputs>;
    delete old.cylinderCalibration;
    delete old.cylinderCalibrationModel;
    expect(inputsSchema.parse(old).cylinderCalibration).toBe(false);
    expect(inputsSchema.parse(old).cylinderCalibrationModel).toBe("constant");
    expect(run(link).cutCalibration).toBe("disabled");
  });

  it("preserves v2 links and saved constant corrections until an explicit profile upgrade", () => {
    const previous = decodeInputs("#c=2;mi=p460nl2;v=2380")!;
    expect(previous.cylinderCalibration).toBe(true);
    expect(previous.cylinderCalibrationModel).toBe("constant");
    expect(cylinder(previous).result.blankLength).toBeCloseTo(7504.417059, 6);
    expect(decodeInputs(encodeInputs(previous))).toEqual(previous);
    const stored = { ...previous } as Partial<Inputs>;
    delete stored.cylinderCalibrationModel;
    expect(inputsSchema.parse(stored).cylinderCalibrationModel).toBe("constant");
    expect(run({ ...previous, thickness: "20" }).cutCalibration).toBe("thickness");
    const updated = {
      ...previous,
      thickness: "20",
      cylinderCalibrationModel: "thickness" as const,
    };
    expect(run(updated).cutCalibration).toBe("applied");
    expect(cylinder(updated).result.cutCorrection).toBeCloseTo(8.221675738, 9);
    expect(decodeInputs(encodeInputs(updated))).toEqual(updated);
  });
});
