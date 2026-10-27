import { z } from "zod";
import type { MachineLimits } from "../domain/calculate";

const nullableNumber = z.number().positive().nullable();

export const machineSchema = z.object({
  topRollD: nullableNumber,
  bottomRollD: nullableNumber,
  sideRollD: nullableNumber,
  maxThickness: nullableNumber,
  maxWidth: nullableNumber,
  minDiameter: nullableNumber,
}) satisfies z.ZodType<MachineLimits>;

export const settingsSchema = z.object({
  lang: z.enum(["pl", "en"]),
  theme: z.enum(["system", "light", "dark"]),
  machine: machineSchema,
});

export type Settings = z.infer<typeof settingsSchema>;
export type Theme = Settings["theme"];
