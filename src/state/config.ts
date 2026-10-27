import { z } from "zod";
import { materials as defaultMaterials } from "../domain/materials/data";
import { materialSchema, type Material } from "../domain/materials/schema";
import { machineSchema } from "./settings";
import { load, remove, save } from "./storage";

/*
 * Device-local overrides edited in edit mode. Built-in defaults stay in code; only changed values are
 * persisted, so clearing storage always returns to the shipped data.
 */

export const processSchema = z.object({
  /** Default flat end per side as a multiple of thickness. */
  flatEndFactor: z.number().min(0).max(20),
  /** Default springback calibration factor. */
  calibration: z.number().min(0).max(3),
  /** Springback share above which a warning is shown. */
  springbackWarn: z.number().gt(0).lt(1),
});

export type ProcessConfig = z.infer<typeof processSchema>;

export const defaultProcess: ProcessConfig = {
  flatEndFactor: 1.5,
  calibration: 1,
  springbackWarn: 0.3,
};

const PROCESS_KEY = "rolling.process.v1";
const MATERIALS_KEY = "rolling.materials.v1";

export function loadProcess(): ProcessConfig {
  return load(PROCESS_KEY, processSchema) ?? { ...defaultProcess };
}

export function saveProcess(p: ProcessConfig): void {
  save(PROCESS_KEY, p);
}

export function resetProcess(): ProcessConfig {
  remove(PROCESS_KEY);
  return { ...defaultProcess };
}

export function loadMaterials(): Material[] {
  return load(MATERIALS_KEY, z.array(materialSchema).min(1)) ?? structuredClone(defaultMaterials);
}

export function saveMaterials(list: Material[]): void {
  save(MATERIALS_KEY, list);
}

export function resetMaterials(): Material[] {
  remove(MATERIALS_KEY);
  return structuredClone(defaultMaterials);
}

export function defaultMaterial(id: string): Material | undefined {
  return defaultMaterials.find((m) => m.id === id);
}

/** "builtin" unchanged, "modified" built-in with edits, "user" added on this device. */
export function materialOrigin(m: Material): "builtin" | "modified" | "user" {
  const base = defaultMaterial(m.id);
  if (!base) return "user";
  return JSON.stringify(base) === JSON.stringify(m) ? "builtin" : "modified";
}

export interface MaterialProblem {
  /** i18n key of the message. */
  key: string;
  /** Material property the problem is about, for field-specific messages. */
  field?: string;
}

/** Checks the schema plus rules the schema cannot express. */
export function validateMaterial(m: Material, all: Material[]): MaterialProblem[] {
  const errors: MaterialProblem[] = [];
  const parsed = materialSchema.safeParse(m);
  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")));
    for (const field of fields) errors.push({ key: "edit.err.field", field });
  }
  if (all.some((x) => x.id !== m.id && x.name.trim() === m.name.trim()))
    errors.push({ key: "edit.err.duplicate" });
  for (let i = 0; i < m.yield.length; i++) {
    const band = m.yield[i]!;
    const last = i === m.yield.length - 1;
    if (band.maxT === null && !last) errors.push({ key: "edit.err.openBand" });
    const prev = m.yield[i - 1];
    if (prev && (prev.maxT === null || (band.maxT !== null && band.maxT <= prev.maxT)))
      errors.push({ key: "edit.err.bandOrder" });
  }
  if (m.rm[0] >= m.rm[1]) errors.push({ key: "edit.err.rm" });
  if (m.yield.some((b) => b.re >= m.rm[1])) errors.push({ key: "edit.err.reRm" });
  const seen = new Set<string>();
  return errors.filter((e) => {
    const id = `${e.key}:${e.field ?? ""}`;
    return seen.has(id) ? false : (seen.add(id), true);
  });
}

export function newMaterialId(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `user-${base || "material"}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---- backup -----------------------------------------------------------------

export const backupSchema = z.object({
  format: z.literal("rolling-simulator-config"),
  version: z.literal(1),
  machine: machineSchema,
  process: processSchema,
  materials: z.array(materialSchema).min(1),
});

export type Backup = z.infer<typeof backupSchema>;

export function parseBackup(text: string): Backup | null {
  try {
    const parsed = backupSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    const ids = parsed.data.materials.map((m) => m.id);
    return new Set(ids).size === ids.length ? parsed.data : null;
  } catch {
    return null;
  }
}
