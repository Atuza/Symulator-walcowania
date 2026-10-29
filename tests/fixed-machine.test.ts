import { describe, expect, it } from "vitest";
import { emptyMachine } from "../src/domain/calculate";
import type { CapacityChart } from "../src/domain/capacity";
import { materials } from "../src/domain/materials/data";
import { buildViews } from "../src/drawing/build";
import { defaultProcess, parseBackup } from "../src/state/config";
import { derive } from "../src/state/derive";
import {
  documentedCharts,
  fixedMachineGeometry,
  withFixedMachine,
} from "../src/state/fixedMachine";
import { defaultInputs, shapeDefaults, type Inputs } from "../src/state/inputs";
import { machineFileText, parseMachineFile } from "../src/state/machineFile";
import { machineSchema, settingsSchema } from "../src/state/settings";
import { sceneModel } from "../src/viz/sceneModel";

const expected = {
  topRollD: 338.38,
  bottomRollD: 310.12,
  sideRollD: 240.02,
  rollLength: 3100,
  maxWidth: 3000,
};
const chart: CapacityChart = {
  kind: "rolling",
  re: 260,
  widths: [1000, 3000],
  diameters: [500, 1000],
  thickness: [
    [15, 20],
    [10, 15],
  ],
};
const run = (patch: Partial<Inputs>, fixed = true) =>
  derive(
    { ...defaultInputs, ...patch },
    fixed ? withFixedMachine() : emptyMachine,
    defaultProcess,
    materials,
  );

describe("installed machine geometry", () => {
  it("starts with the documented roll geometry", () => {
    expect(withFixedMachine()).toMatchObject(expected);
    expect(fixedMachineGeometry).toEqual(expected);
  });
  it.each([
    emptyMachine,
    {
      ...emptyMachine,
      topRollD: 999,
      bottomRollD: 800,
      sideRollD: 700,
      rollLength: 9000,
      maxWidth: 8000,
    },
  ])("normalizes old saved settings while preserving preferences and limits", (old) => {
    const settings = settingsSchema.parse({
      lang: "en",
      theme: "dark",
      machine: { ...old, maxThickness: 20, minDiameter: 380, charts: [chart] },
    });
    expect(settings).toMatchObject({
      lang: "en",
      theme: "dark",
      machine: { ...expected, maxThickness: 20, minDiameter: 380, charts: [chart] },
    });
  });
  it("migrates settings without a roll-length field", () => {
    const old = Object.fromEntries(
      Object.entries(emptyMachine).filter(([key]) => !["rollLength", "charts"].includes(key)),
    );
    expect(machineSchema.parse(old)).toMatchObject({ ...expected, charts: documentedCharts });
  });
  it("cannot replace fixed dimensions through a machine file or exported snapshot", () => {
    const foreign = {
      ...emptyMachine,
      topRollD: 500,
      rollLength: 4000,
      maxWidth: 4000,
      maxThickness: 25,
      charts: [chart],
    };
    const parsed = parseMachineFile(
      JSON.stringify({ format: "rolling-simulator-machine", version: 1, machine: foreign }),
    );
    expect(parsed?.machine).toMatchObject({ ...expected, maxThickness: 25, charts: [chart] });
    expect(JSON.parse(machineFileText(foreign)).machine).toMatchObject(expected);
    expect(foreign.topRollD).toBe(500);
  });
  it("preserves configuration contents when importing a legacy backup", () => {
    const backup = parseBackup(
      JSON.stringify({
        format: "rolling-simulator-config",
        version: 1,
        machine: { ...emptyMachine, maxThickness: 20, charts: [chart] },
        process: defaultProcess,
        materials,
        trials: [],
        templates: [],
      }),
    );
    expect(backup?.machine).toMatchObject({ ...expected, maxThickness: 20, charts: [chart] });
    expect(backup?.materials).toEqual(materials);
    expect(backup?.process).toEqual(defaultProcess);
    expect(backup?.templates).toEqual([]);
    expect(backup?.trials).toEqual([]);
  });
  it.each([500, 2500, 3000, 3500])(
    "keeps actual roll dimensions for a %i mm wide plate",
    (width) => {
      const d = run({ width: String(width) });
      if (!d.output) throw Error("No output");
      const model = sceneModel(d.output, d.thickness!, d.width, withFixedMachine());
      if (model.shape !== "cylinder") throw Error("No cylinder model");
      expect(model.machine).toMatchObject({
        rolls: { top: 338.38, bottom: 310.12, side: 240.02 },
        rollLength: 3100,
        realRolls: true,
      });
    },
  );
  it.each([
    "cylinder",
    "cone",
    "eccentric",
    "halfround",
    "ushape",
    "obround",
    "rect",
    "tank",
    "bucket",
    "ellipse",
    "free",
  ] as const)("preserves %s geometry, mass, springback and drawings", (shape) => {
    const inputs: Partial<Inputs> = {
      shape,
      ...(shape in shapeDefaults ? shapeDefaults[shape as keyof typeof shapeDefaults] : {}),
      ...(shape === "eccentric" ? { offset: "150" } : {}),
    };
    const before = run(inputs, false),
      after = run(inputs);
    expect(before.error).toBeNull();
    expect(after.error).toBeNull();
    expect({ ...after.output, warnings: [] }).toEqual({ ...before.output, warnings: [] });
    expect(buildViews(after.output!, after.width, after.inputs.surface)).toEqual(
      buildViews(before.output!, before.width, before.inputs.surface),
    );
  });
  it("warns about a bend smaller than the top roll without changing the valid geometric result", () => {
    const d = run({ shape: "rect", ...shapeDefaults.rect });
    expect(d.output?.warnings).toContainEqual(
      expect.objectContaining({
        code: "machineTopRoll",
        values: expect.objectContaining({ roll: 338.38 }),
      }),
    );
    expect(d.output?.shape).toBe("profile");
    const model = sceneModel(d.output!, d.thickness!, d.width, withFixedMachine());
    if (model.shape !== "profile") throw Error("No profile model");
    expect(model.machine.rolls.top).toBe(338.38);
  });
  it.each([3000, 3001])("checks the fixed plate-width limit at %i mm", (width) => {
    const d = run({ width: String(width) });
    expect(d.output?.warnings.some((w) => w.code === "machineWidth")).toBe(width > 3000);
    expect(d.output).not.toBeNull();
  });
});
