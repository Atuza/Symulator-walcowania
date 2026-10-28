import type { FreeSegment } from "../domain/shapes";
import { parseNumber } from "./inputs";

/*
 * Free shape as text, kept short for calculation links: segments joined by "_", a straight as
 * "L<length>", an arc as "R<radius>a<angle in degrees>" (negative angle turns the other way).
 * Example: L300_R400a90_L300. Decimal commas are accepted.
 */

export interface FreeRow {
  kind: "line" | "arc";
  /** Length of a straight or radius of an arc, as typed. */
  size: string;
  /** Angle in degrees, as typed; unused for straights. */
  angle: string;
}

export function parseFreeRows(text: string): FreeRow[] {
  return text
    .split("_")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part): FreeRow => {
      if (/^r/i.test(part)) {
        const [size = "", angle = ""] = part.slice(1).split(/a/i);
        return { kind: "arc", size, angle };
      }
      return { kind: "line", size: part.replace(/^l/i, ""), angle: "" };
    });
}

export function formatFreeRows(rows: FreeRow[]): string {
  // Underscores and the letters are the format's own separators; keep them out of the values.
  const clean = (v: string) => v.replace(/[_a-z\s]/gi, "");
  return rows
    .map((r) => (r.kind === "line" ? `L${clean(r.size)}` : `R${clean(r.size)}a${clean(r.angle)}`))
    .join("_");
}

/** Segments for the calculation, or null when a row is incomplete. */
export function freeSegments(text: string): FreeSegment[] | null {
  const out: FreeSegment[] = [];
  for (const row of parseFreeRows(text)) {
    const size = parseNumber(row.size);
    if (size === null) return null;
    if (row.kind === "line") {
      out.push({ kind: "line", length: size });
      continue;
    }
    const angle = parseNumber(row.angle);
    if (angle === null) return null;
    out.push({ kind: "arc", radius: size, angle: (angle * Math.PI) / 180 });
  }
  return out;
}
