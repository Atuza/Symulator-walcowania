import { z } from "zod";
import { chartIsValid } from "../domain/capacity";
import type { MachineLimits } from "../domain/calculate";
import { withFixedMachine } from "./fixedMachine";

const nullableNumber = z.number().positive().nullable();

const axis = z.array(z.number().positive()).min(1).max(40);

export const chartSchema = z
  .object({
    kind: z.enum(["rolling", "prebending"]),
    re: z.number().positive().max(3000),
    widths: axis,
    diameters: axis,
    thickness: z.array(z.array(z.number().positive().max(1000)).max(40)).max(40),
  })
  .refine(chartIsValid);

export const machineSchema = z
  .object({
    topRollD: nullableNumber,
    bottomRollD: nullableNumber,
    sideRollD: nullableNumber,
    maxThickness: nullableNumber,
    maxWidth: nullableNumber,
    minDiameter: nullableNumber,
    // Fields added in 1.1; settings saved earlier lack them.
    rollLength: nullableNumber.default(null),
    charts: z.array(chartSchema).max(16).default([]),
  })
  .transform(withFixedMachine) satisfies z.ZodType<MachineLimits>;

export const settingsSchema = z.object({
  lang: z.enum(["pl", "en"]),
  theme: z.enum(["system", "light", "dark"]),
  machine: machineSchema,
});

export type Settings = z.infer<typeof settingsSchema>;
export type Theme = Settings["theme"];
