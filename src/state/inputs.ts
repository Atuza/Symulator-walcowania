import { z } from "zod";

// Numeric fields are kept as typed text so that "12,5" and partial input survive re-renders.
export const inputsSchema = z.object({
  shape: z.enum(["cylinder", "cone"]),
  mode: z.enum(["fromDiameter", "fromLength"]),
  materialId: z.string(),
  thickness: z.string(),
  dimension: z.enum(["diameter", "radius"]),
  surface: z.enum(["inner", "outer"]),
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
  flatEnds: true,
  flatLength: "",
  k: "",
  reActual: "",
  calibration: "",
  customRe: "",
  customE: "",
  customDensity: "",
};

/** Parses user text; accepts both decimal comma and dot. Empty or invalid → null. */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
