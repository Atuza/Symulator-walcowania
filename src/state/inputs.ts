import { z } from "zod";
import { PROFILE_SHAPES, type ProfileShape } from "../domain/shapes";

// Numeric fields are kept as typed text so that "12,5" and partial input survive re-renders.
export const inputsSchema = z.object({
  shape: z.enum(["cylinder", "cone", ...PROFILE_SHAPES]),
  mode: z.enum(["fromDiameter", "fromLength"]),
  materialId: z.string(),
  thickness: z.string(),
  dimension: z.enum(["diameter", "radius"]),
  surface: z.enum(["inner", "mid", "outer"]),
  value: z.string(),
  length: z.string(),
  width: z.string(),
  dLarge: z.string(),
  dSmall: z.string(),
  height: z.string(),
  flatEnds: z.boolean(),
  flatLength: z.string(),
  k: z.string(),
  reActual: z.string(),
  calibration: z.string(),
  customRe: z.string(),
  customE: z.string(),
  customDensity: z.string(),
  // Profile shapes (1.1); inputs saved before them lack these fields.
  sizeA: z.string().default(""),
  sizeB: z.string().default(""),
  sizeR: z.string().default(""),
  angle: z.string().default(""),
  freeSegs: z.string().max(600).default(""),
  /** Offset between the cone end centres; empty or 0 is a concentric cone. */
  offset: z.string().default(""),
});

export type Inputs = z.infer<typeof inputsSchema>;
export type TextField = { [K in keyof Inputs]: Inputs[K] extends string ? K : never }[keyof Inputs];

export const defaultInputs: Inputs = {
  shape: "cylinder",
  mode: "fromDiameter",
  materialId: "s355j2",
  thickness: "10",
  dimension: "diameter",
  surface: "inner",
  value: "1000",
  length: "",
  width: "2000",
  dLarge: "1200",
  dSmall: "600",
  height: "800",
  flatEnds: false,
  flatLength: "",
  k: "",
  reActual: "",
  calibration: "",
  customRe: "",
  customE: "",
  customDensity: "",
  sizeA: "",
  sizeB: "",
  sizeR: "",
  angle: "",
  freeSegs: "",
  offset: "",
};

/** Starting sizes when a profile shape is picked and the current ones do not fit it. */
export const shapeDefaults: Record<
  ProfileShape,
  Partial<Pick<Inputs, "sizeA" | "sizeB" | "sizeR" | "angle" | "value" | "dimension" | "freeSegs">>
> = {
  halfround: { value: "1000", dimension: "diameter", angle: "180" },
  ushape: { sizeA: "600", sizeB: "400" },
  obround: { sizeA: "2000", sizeB: "800" },
  rect: { sizeA: "1000", sizeB: "600", sizeR: "60" },
  tank: { sizeA: "2400", sizeB: "1500", sizeR: "400" },
  bucket: { sizeA: "400", sizeR: "500", angle: "120", sizeB: "500" },
  ellipse: { sizeA: "2400", sizeB: "1500" },
  free: { freeSegs: "L300_R400a90_L300_R200a-45_L200" },
};

/** Parses user text; accepts both decimal comma and dot. Empty or invalid → null. */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
