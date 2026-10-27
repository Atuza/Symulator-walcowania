import { z } from "zod";
import { inputsSchema, type Inputs } from "./inputs";
import { load, remove, save } from "./storage";

export const HISTORY_LIMIT = 50;
const KEY = "rolling.history.v1";

const entrySchema = z.object({
  id: z.string(),
  savedAt: z.number(),
  inputs: inputsSchema,
  /** Short pre-formatted summary so the list renders without recomputing. */
  summary: z.string().max(200),
});

export type HistoryEntry = z.infer<typeof entrySchema>;

export function readHistory(): HistoryEntry[] {
  return load(KEY, z.array(entrySchema)) ?? [];
}

export function addHistory(inputs: Inputs, summary: string): HistoryEntry[] {
  const list = readHistory();
  const last = list[0];
  // Re-saving the same input (e.g. PDF then DXF) refreshes the entry instead of duplicating it.
  const same = last && JSON.stringify(last.inputs) === JSON.stringify(inputs);
  const entry: HistoryEntry = { id: crypto.randomUUID(), savedAt: Date.now(), inputs, summary };
  const next = [entry, ...(same ? list.slice(1) : list)].slice(0, HISTORY_LIMIT);
  save(KEY, next);
  return next;
}

export function deleteHistory(id: string): HistoryEntry[] {
  const next = readHistory().filter((e) => e.id !== id);
  save(KEY, next);
  return next;
}

export function clearHistory(): void {
  remove(KEY);
}
