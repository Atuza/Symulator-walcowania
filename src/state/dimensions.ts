import type { DimensionId } from "../drawing/model";
import type { Key } from "../i18n";
import { surfaceDepth } from "../domain/types";
import { isConeShape, parseNumber, type Inputs, type TextField } from "./inputs";
import type { Derived } from "./derive";
import { profileDimensionSpec, changeProfileDimension } from "./profileDimensions";
import { coneDimensionSpec, changeConeDimension } from "./coneDimensions";

export interface DimensionSpec {
  label: Key;
  value: number;
  unit: "mm" | "deg";
  /** Radius and diameter labels identify the surface whose dimensions are being edited. */
  surface?: Inputs["surface"];
  segment?: number;
  marker?: string;
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
  if (id.startsWith("cone.")) return coneDimensionSpec(d, id);
  if (id.startsWith("segment.") || id.startsWith("extent.") || id.startsWith("ellipse."))
    return profileDimensionSpec(d, id);
  const i = d.inputs;
  const spec = (
    label: Key,
    value: number | null,
    unit: "mm" | "deg" = "mm",
  ): DimensionSpec | null =>
    value !== null && Number.isFinite(value) ? { label, value, unit } : null;
  if (id === "cylinder.circumference" || id === "cylinder.blankLength") {
    if (d.output?.shape !== "cylinder") return null;
    const r = d.output.result;
    return id === "cylinder.blankLength"
      ? spec("field.length", r.blankLength)
      : {
          label: "field.circumference",
          value: Math.PI * (r.dInner + 2 * surfaceDepth[i.surface] * (d.thickness ?? 0)),
          unit: "mm",
          surface: i.surface,
          marker: "C",
        };
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
  if (id.startsWith("cone.")) return changeConeDimension(d, id, value);
  if (id.startsWith("segment.") || id.startsWith("extent.") || id.startsWith("ellipse."))
    return changeProfileDimension(d, id, value);
  const zeroAllowed =
    id === "offset" ||
    id === "dSmall" ||
    (d.inputs.shape === "bucket" && (id === "a" || id === "b"));
  if (id.endsWith(".angle")) {
    if (value === 0) return null;
  } else if (value < 0 || (value === 0 && !zeroAllowed)) return null;
  const i = d.inputs,
    text = String(value);
  if (id === "cylinder.blankLength") return { ...i, mode: "fromLength", length: text };
  if (id === "cylinder.circumference")
    return { ...i, mode: "fromDiameter", dimension: "diameter", value: String(value / Math.PI) };
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

/** An editor transaction must produce finite geometry before it can replace the last valid part. */
export function validDimensionResult(d: Derived): boolean {
  const finite = (value: unknown): boolean =>
    typeof value === "number"
      ? Number.isFinite(value)
      : value !== null && typeof value === "object"
        ? Object.values(value).every(finite)
        : true;
  return d.output !== null && finite(d.output);
}
