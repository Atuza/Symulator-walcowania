/*
 * Capacity charts from the machine maker: maximum plate thickness for a plate width (rows) and an
 * inner diameter (columns), for one material yield strength. Rolling and pre-bending (end bending)
 * have separate charts; pre-bending needs more force, so its values are lower.
 */

export type CapacityKind = "rolling" | "prebending";

export interface CapacityChart {
  kind: CapacityKind;
  /** Yield strength of the material the chart was made for [MPa]. */
  re: number;
  /** Plate widths, ascending [mm]. */
  widths: number[];
  /** Inner diameters, ascending [mm]. */
  diameters: number[];
  /** Maximum thickness [mm]; one row per width, one column per diameter. */
  thickness: number[][];
}

export type CapacityResult =
  | {
      ok: true;
      /** Maximum thickness for the material's yield strength [mm]. */
      tMax: number;
      /** Yield strength above every chart: the value was scaled by √(Re_chart / Re). */
      scaled: boolean;
    }
  | { ok: false; reason: "noChart" | "width" | "diameter" };

/** Checks that the grid is complete and both axes ascend. */
export function chartIsValid(c: CapacityChart): boolean {
  const ascending = (a: number[]) => a.every((v, i) => v > 0 && (i === 0 || v > a[i - 1]!));
  return (
    c.re > 0 &&
    c.widths.length > 0 &&
    c.diameters.length > 0 &&
    ascending(c.widths) &&
    ascending(c.diameters) &&
    c.thickness.length === c.widths.length &&
    c.thickness.every((row) => row.length === c.diameters.length && row.every((v) => v > 0))
  );
}

/** Position of x on an ascending axis as (lower index, fraction); clamped at both ends. */
function locate(axis: number[], x: number): [number, number] {
  if (x <= axis[0]!) return [0, 0];
  const last = axis.length - 1;
  if (x >= axis[last]!) return [last, 0];
  let i = 0;
  while (axis[i + 1]! < x) i++;
  return [i, (x - axis[i]!) / (axis[i + 1]! - axis[i]!)];
}

/**
 * Bilinear reading of one chart. A width beyond the last row or a diameter below the first column is
 * outside what the maker states, so there is no value. A narrower plate reads the first row and a
 * larger diameter the last column, both on the safe side.
 */
export function readChart(
  c: CapacityChart,
  width: number,
  dInner: number,
): number | "width" | "diameter" {
  if (width > c.widths[c.widths.length - 1]! + 1e-9) return "width";
  if (dInner < c.diameters[0]! - 1e-9) return "diameter";
  const [i, fi] = locate(c.widths, width);
  const [j, fj] = locate(c.diameters, dInner);
  const at = (r: number, col: number) =>
    c.thickness[Math.min(r, c.widths.length - 1)]![Math.min(col, c.diameters.length - 1)]!;
  const top = at(i, j) * (1 - fj) + at(i, j + 1) * fj;
  const bottom = at(i + 1, j) * (1 - fj) + at(i + 1, j + 1) * fj;
  return top * (1 - fi) + bottom * fi;
}

/**
 * Maximum thickness for a material. Between two charts the value is interpolated linearly in Re;
 * below the weakest chart that chart is used as it is (no extrapolation upwards); above the
 * strongest it is scaled with √(Re_chart / Re), because the bending moment a plate needs grows with
 * Re·t² while the machine's moment stays the same.
 */
export function capacity(
  charts: CapacityChart[],
  kind: CapacityKind,
  re: number,
  width: number,
  dInner: number,
): CapacityResult {
  const list = charts.filter((c) => c.kind === kind && chartIsValid(c)).sort((a, b) => a.re - b.re);
  if (list.length === 0 || !(re > 0)) return { ok: false, reason: "noChart" };
  const values: number[] = [];
  for (const c of list) {
    const v = readChart(c, width, dInner);
    if (typeof v === "string") return { ok: false, reason: v };
    values.push(v);
  }
  const first = list[0]!;
  const last = list[list.length - 1]!;
  if (re <= first.re) return { ok: true, tMax: values[0]!, scaled: false };
  if (re >= last.re) {
    const tLast = values[values.length - 1]!;
    return re > last.re
      ? { ok: true, tMax: tLast * Math.sqrt(last.re / re), scaled: true }
      : { ok: true, tMax: tLast, scaled: false };
  }
  let i = 0;
  while (list[i + 1]!.re < re) i++;
  const f = (re - list[i]!.re) / (list[i + 1]!.re - list[i]!.re);
  return { ok: true, tMax: values[i]! * (1 - f) + values[i + 1]! * f, scaled: false };
}

/**
 * Share of the nominal thickness allowed for a cone, by the slant length's share of the roll length:
 * the force concentrates at the small end near the yoke. Up to ½ of the rolls 50 %, up to ¾ 40 %,
 * longer 30 %.
 */
export function coneThicknessShare(slant: number, rollLength: number | null): number {
  if (rollLength === null || !(rollLength > 0)) return 0.5;
  const share = slant / rollLength;
  return share <= 0.5 ? 0.5 : share <= 0.75 ? 0.4 : 0.3;
}
