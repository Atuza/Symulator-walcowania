import { z } from "zod";

export const materialGroups = ["structural", "hsla", "pressure", "stainless", "aluminium"] as const;
export type MaterialGroup = (typeof materialGroups)[number];

const yieldBand = z.object({
  /** Upper thickness limit of the band [mm]; null = no limit. */
  maxT: z.number().positive().nullable(),
  /** Minimum yield strength ReH / Rp0.2 [MPa]. */
  re: z.number().positive(),
});

export const materialSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  number: z.string().nullable(),
  group: z.enum(materialGroups),
  standard: z.string().min(1),
  yield: z.array(yieldBand).min(1),
  /** Tensile strength range [MPa], lowest thickness band. */
  rm: z.tuple([z.number().positive(), z.number().positive()]),
  /** Young's modulus [MPa]. */
  modulus: z.number().positive(),
  poisson: z.number().gt(0).lt(0.5),
  /** Density [kg/m³]. */
  density: z.number().positive(),
  /** Indicative smallest inner radius / thickness for cold rolling. */
  minRt: z.number().positive(),
  /** Indicative outer-fibre strain above which heat treatment may be required; null = no limit. */
  strainLimit: z.number().positive().nullable(),
  /** Key of an i18n note shown with the material, if any. */
  note: z.string().nullable(),
});

export type Material = z.infer<typeof materialSchema>;

/** Minimum yield strength for the given thickness. */
export function yieldAt(material: Material, thickness: number): number {
  for (const band of material.yield) {
    if (band.maxT === null || thickness <= band.maxT) return band.re;
  }
  const last = material.yield[material.yield.length - 1];
  return last ? last.re : NaN;
}
