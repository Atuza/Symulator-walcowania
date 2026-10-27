import { describe, expect, it } from "vitest";
import { materials } from "../src/domain/materials/data";
import { emptyMachine } from "../src/domain/calculate";
import {
  defaultProcess,
  materialOrigin,
  newMaterialId,
  parseBackup,
  validateMaterial,
} from "../src/state/config";
import { materialSchema } from "../src/domain/materials/schema";

const s355 = materials.find((m) => m.id === "s355j2")!;

describe("material validation", () => {
  it("accepts every built-in material", () => {
    for (const m of materials) expect(validateMaterial(m, materials), m.id).toEqual([]);
  });

  it("reports the offending field", () => {
    const bad = { ...structuredClone(s355), density: NaN };
    expect(validateMaterial(bad, materials)).toContainEqual({
      key: "edit.err.field",
      field: "density",
    });
  });

  it("rejects duplicate names, unordered bands and inverted Rm", () => {
    const copy = { ...structuredClone(s355), id: "user-x" };
    expect(validateMaterial(copy, materials).map((p) => p.key)).toContain("edit.err.duplicate");

    const bands = {
      ...structuredClone(s355),
      yield: [
        { maxT: null, re: 355 },
        { maxT: 40, re: 345 },
      ],
    };
    const keys = validateMaterial(bands, materials).map((p) => p.key);
    expect(keys).toContain("edit.err.openBand");
    expect(keys).toContain("edit.err.bandOrder");

    const rm = { ...structuredClone(s355), rm: [630, 470] as [number, number] };
    expect(validateMaterial(rm, materials).map((p) => p.key)).toContain("edit.err.rm");
  });

  it("tells built-in, modified and user materials apart", () => {
    expect(materialOrigin(s355)).toBe("builtin");
    expect(materialOrigin({ ...s355, minRt: 2 })).toBe("modified");
    expect(materialOrigin({ ...s355, id: "user-a" })).toBe("user");
  });

  it("generates ids the schema accepts", () => {
    const id = newMaterialId("Stal Łódzka 1.4301");
    expect(materialSchema.shape.id.safeParse(id).success).toBe(true);
    expect(id.startsWith("user-stal-")).toBe(true);
  });
});

describe("backup", () => {
  const backup = {
    format: "rolling-simulator-config",
    version: 1,
    machine: { ...emptyMachine, topRollD: 450 },
    process: defaultProcess,
    materials,
  };

  it("round-trips a valid export", () => {
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed?.machine.topRollD).toBe(450);
    expect(parsed?.materials).toHaveLength(materials.length);
  });

  it("rejects foreign or broken files", () => {
    expect(parseBackup("not json")).toBeNull();
    expect(parseBackup(JSON.stringify({ ...backup, format: "other" }))).toBeNull();
    expect(parseBackup(JSON.stringify({ ...backup, materials: [] }))).toBeNull();
    expect(parseBackup(JSON.stringify({ ...backup, materials: [s355, s355] }))).toBeNull();
  });
});
