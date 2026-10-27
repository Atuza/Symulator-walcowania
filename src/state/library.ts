import { z } from "zod";
import { inputsSchema, type Inputs } from "./inputs";
import { load, save } from "./storage";

/*
 * Device-local collections managed from edit mode: calibration trials and input templates.
 */

// ---- calibration trials ------------------------------------------------------

export const trialSchema = z.object({
  id: z.string(),
  materialId: z.string(),
  thickness: z.number().positive(),
  /** Actual Re from the certificate used for this trial; null = material minimum. */
  reActual: z.number().positive().nullable(),
  setInnerD: z.number().positive(),
  measuredInnerD: z.number().positive(),
  /** Factor computed when the trial was saved. */
  factor: z.number().positive(),
  savedAt: z.number(),
});

export type Trial = z.infer<typeof trialSchema>;

const TRIALS_KEY = "rolling.calibration.v1";
export const TRIALS_LIMIT = 200;

export function loadTrials(): Trial[] {
  return load(TRIALS_KEY, z.array(trialSchema)) ?? [];
}

export function saveTrials(list: Trial[]): void {
  save(TRIALS_KEY, list.slice(0, TRIALS_LIMIT));
}

// ---- templates ---------------------------------------------------------------

export const templateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(40),
  inputs: inputsSchema,
});

export type Template = z.infer<typeof templateSchema>;

const TEMPLATES_KEY = "rolling.templates.v1";
export const TEMPLATES_LIMIT = 24;

export function loadTemplates(): Template[] {
  return load(TEMPLATES_KEY, z.array(templateSchema)) ?? [];
}

export function saveTemplates(list: Template[]): void {
  save(TEMPLATES_KEY, list.slice(0, TEMPLATES_LIMIT));
}

export function newTemplate(name: string, inputs: Inputs): Template {
  // Optional fields of the moment (certificate Re, overrides) are kept; the allowance never is.
  return {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 40),
    inputs: { ...inputs, flatEnds: false },
  };
}
