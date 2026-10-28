import type { DimensionId } from "../drawing/model";
import type { Key } from "../i18n";
import { surfaceDepth } from "../domain/types";
import { formatFreeRows, parseFreeRows } from "./freeShape";
import { isConeShape, parseNumber, type Inputs, type TextField } from "./inputs";
import type { Derived } from "./derive";

export interface DimensionSpec {
  label: Key;
  value: number;
  unit: "mm" | "deg";
  /** Radius and diameter labels identify the surface whose dimensions are being edited. */
  surface?: Inputs["surface"];
  segment?: number;
}

const fields = {
  a: "sizeA",
  b: "sizeB",
  height: "height",
  offset: "offset",
  width: "width",
  thickness: "thickness",
  dLarge: "dLarge",
  dSmall: "dSmall",
  angle: "angle",
} as const satisfies Partial<Record<DimensionId, TextField>>;

export function dimensionSpec(d: Derived, id: DimensionId): DimensionSpec | null {
  const i = d.inputs;
  const spec = (
    label: Key,
    value: number | null,
    unit: "mm" | "deg" = "mm",
  ): DimensionSpec | null =>
    value !== null && Number.isFinite(value) ? { label, value, unit } : null;
  if (id.startsWith("segment.")) {
    if (i.shape !== "free") return null;
    const [, index, property] = id.split(".");
    const row = parseFreeRows(i.freeSegs)[Number(index)];
    if (!row || (property === "angle" && row.kind !== "arc")) return null;
    const s = spec(
      property === "angle" ? "free.angle" : row.kind === "arc" ? "free.radius" : "free.length",
      parseNumber(property === "angle" ? row.angle : row.size),
      property === "angle" ? "deg" : "mm",
    );
    return s
      ? {
          ...s,
          segment: Number(index) + 1,
          ...(row.kind === "arc" && property === "size" ? { surface: i.surface } : {}),
        }
      : null;
  }
  if (id === "diameter.inner" || id === "diameter.outer") {
    if (d.output?.shape !== "cylinder") return null;
    const inner = id === "diameter.inner";
    const s = spec(
      inner ? "result.dInner" : "result.dOuter",
      inner ? d.output.result.dInner : d.output.result.dOuter,
    );
    return s ? { ...s, surface: inner ? "inner" : "outer" } : null;
  }
  if (id === "r") {
    let value: number | null = null;
    if (d.output?.shape === "cylinder") {
      value = d.output.result.dInner / 2 + surfaceDepth[i.surface] * (d.thickness ?? 0);
    } else if (i.shape === "halfround") {
      const n = parseNumber(i.value);
      value = n === null ? null : n / (i.dimension === "diameter" ? 2 : 1);
    } else if (i.shape === "ushape" || i.shape === "obround") {
      const n = parseNumber(i.shape === "ushape" ? i.sizeA : i.sizeB);
      value = n === null ? null : n / 2;
    } else if (i.shape === "rect" || i.shape === "tank" || i.shape === "bucket") {
      value = parseNumber(i.sizeR);
    }
    const s = spec("field.value.radius", value);
    return s ? { ...s, surface: i.surface } : null;
  }
  if (id === "width" && isConeShape(i.shape)) return null;
  if (id === "offset" && i.shape !== "eccentric") return null;
  const field = fields[id as keyof typeof fields];
  if (!field) return null;
  const label =
    id === "a" || id === "b" || id === "angle"
      ? (`size.${i.shape}.${id === "angle" ? "angle" : id}` as Key)
      : (`field.${id}` as Key);
  return spec(label, parseNumber(i[field]), id === "angle" ? "deg" : "mm");
}

/** An atomic input change; the caller must validate the candidate through derive before committing. */
export function dimensionInputs(d: Derived, id: DimensionId, value: number): Inputs | null {
  if (!Number.isFinite(value) || !dimensionSpec(d, id)) return null;
  const zeroAllowed =
    id === "offset" ||
    id === "dSmall" ||
    (d.inputs.shape === "bucket" && (id === "a" || id === "b"));
  if (id.endsWith(".angle")) {
    if (value === 0) return null;
  } else if (value < 0 || (value === 0 && !zeroAllowed)) return null;
  const i = d.inputs,
    text = String(value);
  if (id.startsWith("segment.")) {
    const [, index, property] = id.split(".");
    const rows = parseFreeRows(i.freeSegs),
      row = rows[Number(index)];
    if (!row) return null;
    if (property === "angle") row.angle = text;
    else row.size = text;
    return { ...i, freeSegs: formatFreeRows(rows) };
  }
  if (id === "diameter.inner" || id === "diameter.outer")
    return {
      ...i,
      mode: "fromDiameter",
      dimension: "diameter",
      surface: id === "diameter.inner" ? "inner" : "outer",
      value: text,
    };
  if (id === "r") {
    if (i.shape === "cylinder" || i.shape === "halfround")
      return { ...i, mode: "fromDiameter", dimension: "radius", value: text };
    if (i.shape === "ushape") return { ...i, sizeA: String(2 * value) };
    if (i.shape === "obround") return { ...i, sizeB: String(2 * value) };
    return { ...i, sizeR: text };
  }
  const field = fields[id as keyof typeof fields];
  return field ? { ...i, [field]: text } : null;
}
