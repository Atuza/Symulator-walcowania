import { neutralFactor } from "./neutralAxis";
import type { Surface } from "./types";

export interface ConeInput {
  thickness: number;
  /** Diameters in the two end planes (perpendicular to the axis), on the chosen surface [mm]. */
  dLarge: number;
  dSmall: number;
  /** Axial distance between the end planes [mm]. */
  height: number;
  surface: Surface;
  flatEnds: number;
  kOverride: number | null;
}

export interface ConeEnd {
  dInner: number;
  dOuter: number;
  dNeutral: number;
}

export interface ConeResult {
  /** Half apex angle [rad]. */
  alpha: number;
  k: number;
  large: ConeEnd;
  small: ConeEnd;
  /** Generator length on the neutral surface [mm]. */
  slant: number;
  /** Development radii on the neutral surface [mm]. */
  rOuter: number;
  rInner: number;
  /** Sector angle of the closed cone [rad]. */
  angleNet: number;
  /** Sector angle including flat-end allowance [rad]. */
  angle: number;
  flatEnd: number;
  /** Bounding box of the development, i.e. the minimum plate to cut it from [mm]. */
  box: { width: number; height: number };
  /** Development area [mm²]. */
  area: number;
  /** Smallest inner principal radius / thickness (at the small end). */
  rtMin: number;
  outerStrainMax: number;
}

export type ConeError =
  "thickness" | "dLarge" | "dSmall" | "height" | "order" | "tooSmall" | "tooFlat";

export function solveCone(input: ConeInput): ConeResult | ConeError {
  const { thickness: t, dLarge, dSmall, height } = input;
  if (!(t > 0)) return "thickness";
  if (!(dLarge > 0)) return "dLarge";
  if (!(dSmall >= 0)) return "dSmall";
  if (!(height > 0)) return "height";
  if (!(dLarge > dSmall)) return "order";

  const alpha = Math.atan((dLarge - dSmall) / 2 / height);
  const cos = Math.cos(alpha);
  const sin = Math.sin(alpha);
  // Thickness is normal to the wall, so in an end plane it spans t / cos(α) radially.
  const radialT = t / cos;

  const toInner = (d: number) => (input.surface === "inner" ? d : d - 2 * radialT);
  const largeIn = toInner(dLarge);
  const smallIn = toInner(dSmall);
  if (!(largeIn > 0) || smallIn < -1e-9) return "tooSmall";

  // The principal curvature radius of a cone wall is r / cos(α); use it at mid-height for k.
  const midInnerPrincipal = (largeIn + smallIn) / 4 / cos;
  const k = input.kOverride ?? neutralFactor(midInnerPrincipal, t);

  const end = (dIn: number): ConeEnd => ({
    dInner: Math.max(0, dIn),
    dOuter: dIn + 2 * radialT,
    dNeutral: dIn + 2 * k * radialT,
  });
  const large = end(largeIn);
  const small = end(smallIn);

  const rOuter = large.dNeutral / 2 / sin;
  const rInner = small.dNeutral / 2 / sin;
  const angleNet = 2 * Math.PI * sin;
  const flat = Math.max(0, input.flatEnds);
  const rMean = (rOuter + rInner) / 2;
  const angle = angleNet + (2 * flat) / rMean;
  if (angle >= 2 * Math.PI) return "tooFlat";

  const smallPrincipal = Math.max(0, smallIn) / 2 / cos;
  return {
    alpha,
    k,
    large,
    small,
    slant: rOuter - rInner,
    rOuter,
    rInner,
    angleNet,
    angle,
    flatEnd: flat,
    box: sectorBox(rInner, rOuter, angle),
    area: (angle / 2) * (rOuter ** 2 - rInner ** 2),
    rtMin: smallPrincipal / t,
    outerStrainMax: t / (2 * smallPrincipal + t),
  };
}

/** Bounding box of an annular sector symmetric about the +x axis. */
export function sectorBox(
  rIn: number,
  rOut: number,
  angle: number,
): { width: number; height: number } {
  const half = angle / 2;
  const angles = [-half, half];
  // Arc extremes occur at the sector ends and at axis crossings inside the sweep.
  for (const a of [0, Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI])
    if (Math.abs(a) <= half) angles.push(a);
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const a of angles) {
    for (const r of [rIn, rOut]) {
      const x = r * Math.cos(a);
      const y = r * Math.sin(a);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { width: maxX - minX, height: maxY - minY };
}
