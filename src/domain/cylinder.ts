import { neutralFactor } from "./neutralAxis";
import type { Surface } from "./types";

export interface CylinderFromDiameter {
  mode: "fromDiameter";
  thickness: number;
  /** Diameter, or radius when isRadius is set, on the chosen surface [mm]. */
  value: number;
  isRadius: boolean;
  surface: Surface;
  flatEnds: number;
  kOverride: number | null;
}

export interface CylinderFromLength {
  mode: "fromLength";
  thickness: number;
  /** Cut blank length, including flat-end allowance [mm]. */
  blankLength: number;
  flatEnds: number;
  kOverride: number | null;
}

export type CylinderInput = CylinderFromDiameter | CylinderFromLength;

export interface CylinderResult {
  k: number;
  dInner: number;
  dOuter: number;
  dNeutral: number;
  /** Circumference on the neutral fibre = closed ring length [mm]. */
  ringLength: number;
  /** Unbent length left at each end, trimmed after rolling [mm]. */
  flatEnd: number;
  /** Length to cut = ring length + both flat ends [mm]. */
  blankLength: number;
  /** Inner radius / thickness. */
  rt: number;
  /** Engineering strain of the outer fibre. */
  outerStrain: number;
}

export type CylinderError = "thickness" | "value" | "tooSmall" | "length";

export function solveCylinder(input: CylinderInput): CylinderResult | CylinderError {
  const t = input.thickness;
  if (!(t > 0)) return "thickness";
  const flat = Math.max(0, input.flatEnds);

  let dInner: number;
  let k: number;
  if (input.mode === "fromDiameter") {
    if (!(input.value > 0)) return "value";
    const d = input.isRadius ? input.value * 2 : input.value;
    dInner = input.surface === "inner" ? d : d - 2 * t;
    if (!(dInner > 0)) return "tooSmall";
    k = input.kOverride ?? neutralFactor(dInner / 2, t);
  } else {
    const ring = input.blankLength - 2 * flat;
    if (!(ring > 0)) return "length";
    const dNeutral = ring / Math.PI;
    // k depends on the inner radius, which depends on k; the fixed point converges in a few steps.
    k = input.kOverride ?? 0.5;
    dInner = dNeutral - 2 * k * t;
    for (let i = 0; i < 50 && input.kOverride == null; i++) {
      const next = neutralFactor(dInner / 2, t);
      dInner = dNeutral - 2 * next * t;
      if (Math.abs(next - k) < 1e-12) break;
      k = next;
    }
    if (!(dInner > 0)) return "tooSmall";
  }

  const dNeutral = dInner + 2 * k * t;
  const ringLength = Math.PI * dNeutral;
  return {
    k,
    dInner,
    dOuter: dInner + 2 * t,
    dNeutral,
    ringLength,
    flatEnd: flat,
    blankLength: ringLength + 2 * flat,
    rt: dInner / 2 / t,
    outerStrain: t / (dInner + t),
  };
}
