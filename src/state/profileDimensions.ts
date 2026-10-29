import {
  fitProfile,
  profileGeometry,
  profileTurn,
  referenceSegments,
  withFlatEnds,
} from "../domain/editableProfile";
import type { FreeSegment } from "../domain/shapes";
import { surfaceDepth } from "../domain/types";
import { develop } from "../domain/profile";
import { neutralFactor } from "../domain/neutralAxis";
import type { DimensionId } from "../drawing/model";
import type { Derived } from "./derive";
import type { DimensionSpec } from "./dimensions";
import { freeSegments, formatFreeRows } from "./freeShape";
import { parseNumber, type Inputs } from "./inputs";
import { invertMeasure } from "./invertMeasure";

export function editableSegments(d: Derived): FreeSegment[] | null {
  if (d.output?.shape !== "profile" || (d.inputs.shape === "ellipse" && !d.inputs.profileSegs))
    return null;
  if (d.inputs.profileSegs) return freeSegments(d.inputs.profileSegs);
  if (d.inputs.shape === "free") return freeSegments(d.inputs.freeSegs);
  return referenceSegments(d.output.result.profile, surfaceDepth[d.inputs.surface], d.flatEnd);
}

export function profileDimensionSpec(d: Derived, id: DimensionId): DimensionSpec | null {
  if (d.output?.shape !== "profile") return null;
  if (id === "profile.blankLength")
    return { label: "field.length", value: d.output.result.blankLength, unit: "mm" };
  const depth = surfaceDepth[d.inputs.surface],
    t = d.thickness ?? 0;
  if (id === "ellipse.min" || id === "ellipse.max") {
    if (d.inputs.shape !== "ellipse" || d.inputs.profileSegs) return null;
    return {
      label: id === "ellipse.min" ? "geometry.radiusMin" : "geometry.radiusMax",
      value: d.output.result.radii[id === "ellipse.min" ? 0 : 1]!,
      unit: "mm",
      surface: "inner",
    };
  }
  const segments = editableSegments(d);
  if (id === "extent.x" || id === "extent.y") {
    if (!segments) {
      if (d.inputs.shape === "ellipse")
        return {
          label: id === "extent.x" ? "geometry.width" : "geometry.height",
          value: parseNumber(id === "extent.x" ? d.inputs.sizeA : d.inputs.sizeB) ?? NaN,
          unit: "mm",
        };
      return null;
    }
    const g = profileGeometry(
      withFlatEnds(segments, d.flatEnd),
      t,
      depth,
      profileTurn[d.output.result.shape],
    );
    return {
      label: id === "extent.x" ? "geometry.width" : "geometry.height",
      value: id === "extent.x" ? g.width : g.height,
      unit: "mm",
    };
  }
  if (!id.startsWith("segment.") || !segments) return null;
  const [, indexText, property] = id.split("."),
    index = Number(indexText),
    seg = segments[index];
  if (!seg || (property === "angle" && seg.kind !== "arc")) return null;
  if (property === "diameter" && seg.kind !== "arc") return null;
  if (property === "developed")
    return {
      label: "geometry.arcLength",
      value: d.output.result.dev.segments[index + (d.flatEnd > 0 ? 1 : 0)]!.length,
      unit: "mm",
      segment: index + 1,
    };
  const value =
    property === "angle" && seg.kind === "arc"
      ? (seg.angle * 180) / Math.PI
      : seg.kind === "line"
        ? seg.length
        : seg.radius * (property === "diameter" ? 2 : 1);
  return {
    label:
      property === "angle"
        ? "free.angle"
        : property === "diameter"
          ? "field.value.diameter"
          : seg.kind === "arc"
            ? "free.radius"
            : "free.length",
    value,
    unit: property === "angle" ? "deg" : "mm",
    segment: index + 1,
    marker: `${property === "angle" ? "φ" : property === "diameter" ? "Ø" : seg.kind === "arc" ? "R" : "L"}${segments.slice(0, index + 1).filter((s) => s.kind === seg.kind).length}`,
    ...(seg.kind === "arc" && (property === "size" || property === "diameter")
      ? { surface: d.inputs.surface }
      : {}),
  };
}

function store(d: Derived, segments: FreeSegment[], closed: boolean): Inputs | null {
  const number = (n: number, decimals: number) => Number(n.toFixed(decimals)).toString();
  const text = formatFreeRows(
    segments.map((s) =>
      s.kind === "line"
        ? { kind: "line", size: number(s.length, 6), angle: "" }
        : { kind: "arc", size: number(s.radius, 6), angle: number((s.angle * 180) / Math.PI, 9) },
    ),
  );
  if (text.length > 3200) return null;
  if (
    d.inputs.shape === "free" &&
    !d.inputs.profileSegs &&
    text.length <= 600 &&
    segments.every((s) => s.kind !== "line" || s.length > 0)
  )
    return { ...d.inputs, freeSegs: text };
  return { ...d.inputs, profileSegs: text, profileClosed: closed };
}

export function changeProfileDimension(d: Derived, id: DimensionId, value: number): Inputs | null {
  if (d.output?.shape !== "profile" || !Number.isFinite(value)) return null;
  if (id === "ellipse.min" || id === "ellipse.max") {
    if (!(value > 0) || d.inputs.shape !== "ellipse" || d.inputs.profileSegs) return null;
    const old = d.output.result.radii;
    const lo = id === "ellipse.min" ? value : Math.min(old[0]!, value),
      hi = id === "ellipse.max" ? value : Math.max(old[1]!, value);
    const major = Math.cbrt(hi * hi * lo),
      minor = Math.cbrt(lo * lo * hi);
    const c = surfaceDepth[d.inputs.surface] * (d.thickness ?? 0);
    const wide = (parseNumber(d.inputs.sizeA) ?? 0) >= (parseNumber(d.inputs.sizeB) ?? 0);
    return {
      ...d.inputs,
      sizeA: String(2 * ((wide ? major : minor) + c)),
      sizeB: String(2 * ((wide ? minor : major) + c)),
    };
  }
  if (
    d.inputs.shape === "ellipse" &&
    !d.inputs.profileSegs &&
    (id === "extent.x" || id === "extent.y")
  )
    return value > 0
      ? { ...d.inputs, [id === "extent.x" ? "sizeA" : "sizeB"]: String(value) }
      : null;
  const source = editableSegments(d);
  if (!source) return null;
  const typedK = parseNumber(d.inputs.k),
    kOverride = typedK !== null && typedK > 0 && typedK <= 1 ? typedK : null;
  if (id === "profile.blankLength") {
    if (!(value > 2 * d.flatEnd)) return null;
    const t = d.thickness!,
      depth = surfaceDepth[d.inputs.surface];
    const minimum = Math.max(
      1e-9,
      ...source.filter((s) => s.kind === "arc").map((s) => (depth * t) / s.radius + 1e-9),
    );
    const scaled = (scale: number) =>
      source.map((s) =>
        s.kind === "line" ? { ...s, length: s.length * scale } : { ...s, radius: s.radius * scale },
      );
    const measure = (scale: number) => {
      const inner = withFlatEnds(scaled(scale), d.flatEnd).map((s) =>
        s.kind === "arc" ? { ...s, radius: s.radius - depth * t } : s,
      );
      const result = develop({ segments: inner, thickness: t, kOverride });
      return typeof result === "string" ? null : result.length;
    };
    const factor = invertMeasure(1, value, measure, { min: minimum });
    return factor === null ? null : store(d, scaled(factor), d.output.result.closed);
  }
  if (id.endsWith(".diameter"))
    return changeProfileDimension(d, id.replace(".diameter", ".size") as DimensionId, value / 2);
  if (id.endsWith(".developed")) {
    const index = Number(id.split(".")[1]),
      seg = source[index];
    if (!seg || !(value > 0)) return null;
    if (seg.kind === "line") return changeProfileDimension(d, `segment.${index}.size`, value);
    const t = d.thickness!,
      depth = surfaceDepth[d.inputs.surface];
    const radius = invertMeasure(
      seg.radius,
      value,
      (r) => {
        const ri = r - depth * t;
        return ri > 0 ? (ri + (kOverride ?? neutralFactor(ri, t)) * t) * Math.abs(seg.angle) : null;
      },
      { min: depth * t + 1e-8 },
    );
    return radius === null ? null : changeProfileDimension(d, `segment.${index}.size`, radius);
  }
  const segments = source.map((s) => ({ ...s }));
  const depth = surfaceDepth[d.inputs.surface],
    thickness = d.thickness ?? 0,
    rotation = profileTurn[d.output.result.shape];
  const before = profileGeometry(withFlatEnds(source, d.flatEnd), thickness, depth, rotation),
    closed = d.output.result.closed;
  const opts = { depth, thickness, rotation, closed, turn: before.turn, flatEnd: d.flatEnd };
  if (id === "extent.x" || id === "extent.y") {
    if (!(value > 0)) return null;
    const fit = fitProfile(segments, {
      ...opts,
      extent: {
        axis: id === "extent.x" ? "x" : "y",
        value,
        other: id === "extent.x" ? before.height : before.width,
      },
    });
    return fit ? store(d, fit, closed) : null;
  }
  if (!id.startsWith("segment.")) return null;
  const [, indexText, property] = id.split("."),
    index = Number(indexText),
    seg = segments[index];
  if (!seg) return null;
  if (property === "size") {
    if (value < 0 || (value === 0 && seg.kind === "arc")) return null;
    if (seg.kind === "line") seg.length = value;
    else seg.radius = value;
  } else {
    if (seg.kind !== "arc") return null;
    const angle = (value * Math.PI) / 180;
    if (!Number.isFinite(angle) || Math.abs(angle) < 1e-7 || Math.abs(angle) > 2 * Math.PI)
      return null;
    seg.angle = angle;
  }
  const fit = fitProfile(segments, {
    ...opts,
    fixed: { index, property: property === "size" ? "size" : "angle" },
  });
  return fit ? store(d, fit, closed) : null;
}
