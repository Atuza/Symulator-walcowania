import { z } from "zod";
import type { CapacityChart } from "../domain/capacity";
import type { MachineLimits } from "../domain/calculate";
import { parseNumber } from "./inputs";
import { machineSchema } from "./settings";
import { withFixedMachine } from "./fixedMachine";

/*
 * Machine file: the machine's limits and capacity charts on their own, so one machine can be set up
 * on several devices without touching their materials or trials.
 */

export const machineFileSchema = z.object({
  format: z.literal("rolling-simulator-machine"),
  version: z.literal(1),
  name: z.string().max(80).optional(),
  machine: machineSchema,
});

export type MachineFile = z.infer<typeof machineFileSchema>;

export function parseMachineFile(text: string): MachineFile | null {
  try {
    const parsed = machineFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function machineFileText(machine: MachineLimits): string {
  const file: MachineFile = {
    format: "rolling-simulator-machine",
    version: 1,
    machine: withFixedMachine(machine),
  };
  return JSON.stringify(file, null, 2);
}

/** Grid only: the kind and yield strength are edited separately. */
export type ChartGrid = Pick<CapacityChart, "widths" | "diameters" | "thickness">;

/**
 * Chart as plain text, one row per line: the first line lists the diameters, every next line starts
 * with the width followed by the thicknesses. Tabs separate cells, so a table copied from a
 * spreadsheet pastes as it is.
 */
export function chartToText(c: ChartGrid, decimalComma: boolean): string {
  const f = (n: number) => (decimalComma ? String(n).replace(".", ",") : String(n));
  const head = ["B \\ Ø", ...c.diameters.map(f)].join("\t");
  const rows = c.widths.map((w, i) => [f(w), ...(c.thickness[i] ?? []).map(f)].join("\t"));
  return [head, ...rows].join("\n");
}

/** Reads the text form back; tabs, spaces or semicolons separate cells. Null when malformed. */
export function parseChartText(text: string): ChartGrid | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  if (lines.length < 2) return null;
  // Numbers never contain spaces (decimal comma or dot), so any whitespace separates cells.
  const cells = lines.map((l) => l.split(/[\s;]+/).filter((c) => c !== ""));
  const head = cells[0]!;
  // The corner cell is a label, unless the header was pasted without one.
  while (head.length > 0 && parseNumber(head[0]!) === null) head.shift();
  const diameters = head.map(parseNumber);
  const widths: (number | null)[] = [];
  const thickness: (number | null)[][] = [];
  for (const row of cells.slice(1)) {
    const values = row.map(parseNumber);
    widths.push(values[0] ?? null);
    thickness.push(values.slice(1));
  }
  const all = [...diameters, ...widths, ...thickness.flat()];
  if (all.some((n) => n === null)) return null;
  const grid = {
    widths: widths as number[],
    diameters: diameters as number[],
    thickness: thickness as number[][],
  };
  return grid.thickness.every((r) => r.length === grid.diameters.length) ? grid : null;
}
