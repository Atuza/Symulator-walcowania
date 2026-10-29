import { solveCone } from "../domain/cone";
import { solveEccentric } from "../domain/eccentric";
import type { DimensionId } from "../drawing/model";
import type { Derived } from "./derive";
import type { DimensionSpec } from "./dimensions";
import { isConeShape, parseNumber, type Inputs } from "./inputs";
import { invertMeasure } from "./invertMeasure";

export function coneDimensionSpec(d: Derived, id: DimensionId): DimensionSpec | null {
  const out = d.output;
  if (!out || !isConeShape(d.inputs.shape)) return null;
  if (out.shape !== "cone" && out.shape !== "eccentric") return null;
  if (id === "cone.arc.large" || id === "cone.arc.small")
    return {
      label: id === "cone.arc.large" ? "geometry.arcLarge" : "geometry.arcSmall",
      value:
        out.shape === "cone"
          ? id === "cone.arc.large"
            ? out.result.arcOuter
            : out.result.arcInner
          : id === "cone.arc.large"
            ? out.result.arcLarge
            : out.result.arcSmall,
      unit: "mm",
    };
  if (id === "cone.box.width" || id === "cone.box.height")
    return {
      label: id === "cone.box.width" ? "geometry.blankWidth" : "geometry.blankHeight",
      value:
        out.shape === "cone"
          ? id === "cone.box.width"
            ? out.result.box.height
            : out.result.box.width
          : id === "cone.box.width"
            ? out.result.box.width
            : out.result.box.height,
      unit: "mm",
    };
  if (id === "cone.circumference.large" || id === "cone.circumference.small") {
    const large = id === "cone.circumference.large";
    return {
      label: "field.circumference",
      value: Math.PI * (parseNumber(large ? d.inputs.dLarge : d.inputs.dSmall) ?? 0),
      unit: "mm",
      surface: d.inputs.surface,
      marker: large ? "C1" : "C2",
    };
  }
  if (id === "cone.radius.large" || id === "cone.radius.small")
    return {
      label: "field.value.radius",
      value: (parseNumber(id === "cone.radius.large" ? d.inputs.dLarge : d.inputs.dSmall) ?? 0) / 2,
      unit: "mm",
      surface: d.inputs.surface,
    };
  if (out.shape === "cone") {
    const r = out.result;
    if (id === "cone.r1" || id === "cone.r2")
      return {
        label: id === "cone.r1" ? "result.rOuter" : "result.rInner",
        value: id === "cone.r1" ? r.rOuter : r.rInner,
        unit: "mm",
      };
    if (id === "cone.sector")
      return { label: "result.angle", value: (r.angle * 180) / Math.PI, unit: "deg" };
    if (id === "cone.slant") return { label: "result.slant", value: r.slant, unit: "mm" };
  }
  if (out.shape === "eccentric") {
    const r = out.result;
    if (id === "cone.slant.short" || id === "cone.slant.long")
      return {
        label: id === "cone.slant.short" ? "result.slantMin" : "result.slantMax",
        value: id === "cone.slant.short" ? r.slantMin : r.slantMax,
        unit: "mm",
      };
  }
  return null;
}

export function changeConeDimension(d: Derived, id: DimensionId, value: number): Inputs | null {
  if (!Number.isFinite(value) || !coneDimensionSpec(d, id)) return null;
  const i = d.inputs;
  if (id === "cone.circumference.large" || id === "cone.circumference.small")
    return value > 0 || (id === "cone.circumference.small" && value === 0)
      ? { ...i, [id === "cone.circumference.large" ? "dLarge" : "dSmall"]: String(value / Math.PI) }
      : null;
  if (id === "cone.radius.large" || id === "cone.radius.small")
    return value >= 0
      ? { ...i, [id === "cone.radius.large" ? "dLarge" : "dSmall"]: String(2 * value) }
      : null;
  const D1 = parseNumber(i.dLarge)!,
    D2 = parseNumber(i.dSmall)!,
    H = parseNumber(i.height)!,
    e = parseNumber(i.offset) ?? 0,
    delta = (D1 - D2) / 2;
  if (id.startsWith("cone.arc.") || id.startsWith("cone.box.")) {
    if (value < 0 || (value === 0 && id !== "cone.arc.small")) return null;
    const k = parseNumber(i.k),
      kOverride = k !== null && k > 0 && k <= 1 ? k : null;
    const scaling = id.startsWith("cone.box.");
    const large = id === "cone.arc.large";
    const candidate = (driver: number): Inputs =>
      scaling
        ? {
            ...i,
            dLarge: String(D1 * driver),
            dSmall: String(D2 * driver),
            height: String(H * driver),
            offset: i.shape === "eccentric" ? String(e * driver) : i.offset,
          }
        : { ...i, [large ? "dLarge" : "dSmall"]: String(driver) };
    const measure = (driver: number) => {
      const c = candidate(driver),
        base = {
          dLarge: Number(c.dLarge),
          dSmall: Number(c.dSmall),
          height: Number(c.height),
          thickness: d.thickness!,
          surface: i.surface,
          flatEnds: d.flatEnd,
          kOverride,
        };
      if (i.shape === "eccentric") {
        const r = solveEccentric({ ...base, offset: parseNumber(c.offset) ?? 0 });
        if (typeof r === "string") return null;
        return id === "cone.arc.large"
          ? r.arcLarge
          : id === "cone.arc.small"
            ? r.arcSmall
            : id === "cone.box.width"
              ? r.box.width
              : r.box.height;
      }
      const r = solveCone(base);
      if (typeof r === "string") return null;
      return id === "cone.arc.large"
        ? r.arcOuter
        : id === "cone.arc.small"
          ? r.arcInner
          : id === "cone.box.width"
            ? r.box.height
            : r.box.width;
    };
    const driver = invertMeasure(
      scaling ? 1 : large ? D1 : D2,
      value,
      measure,
      scaling ? {} : { min: large ? D2 + 1e-8 : 0, max: large ? Number.MAX_VALUE : D1 - 1e-8 },
    );
    return driver === null ? null : candidate(driver);
  }
  if (id === "cone.slant.short" || id === "cone.slant.long") {
    const run = delta + (id === "cone.slant.short" ? -e : e),
      h = Math.sqrt(value * value - run * run);
    return value > 0 && h > 0 ? { ...i, height: String(h) } : null;
  }
  if (d.output?.shape !== "cone" || !(value > 0)) return null;
  const base = {
    dLarge: D1,
    dSmall: D2,
    thickness: d.thickness!,
    surface: i.surface,
    flatEnds: d.flatEnd,
    kOverride: parseNumber(i.k),
  };
  const measure = (height: number) => {
    const r = solveCone({ ...base, height });
    if (typeof r === "string") return null;
    return id === "cone.r1"
      ? r.rOuter
      : id === "cone.r2"
        ? r.rInner
        : id === "cone.sector"
          ? (r.angle * 180) / Math.PI
          : r.slant;
  };
  const current = measure(H);
  if (current !== null && Math.abs(current - value) < 1e-8) return { ...i };
  let previous: { h: number; y: number } | null = null;
  const brackets: { a: number; b: number; distance: number }[] = [];
  for (let j = -70; j <= 100; j++) {
    const h = H * 2 ** (j / 5),
      y = measure(h);
    if (y === null || !Number.isFinite(y)) continue;
    if (previous && (previous.y - value) * (y - value) <= 0)
      brackets.push({
        a: previous.h,
        b: h,
        distance: Math.abs(Math.log(Math.sqrt(previous.h * h) / H)),
      });
    previous = { h, y };
  }
  const bracket = brackets.sort((a, b) => a.distance - b.distance)[0];
  if (!bracket) return null;
  let a = bracket.a,
    b = bracket.b,
    fa = measure(a)! - value;
  for (let n = 0; n < 55; n++) {
    const h = Math.sqrt(a * b),
      y = measure(h);
    if (y === null) return null;
    const f = y - value;
    if (Math.abs(f) < 1e-7) return { ...i, height: String(h) };
    if (f * fa <= 0) b = h;
    else {
      a = h;
      fa = f;
    }
  }
  return { ...i, height: String((a + b) / 2) };
}
