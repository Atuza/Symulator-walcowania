/**
 * Springback of a wide plate bent to a constant radius (elastic / perfectly plastic material).
 *
 * Gardiner's relation, on the mid-surface radius:
 *   Ri / Rf = 4x³ − 3x + 1 = (2x − 1)²(x + 1),   x = Ri · Re / (E' · t)
 * Ri = radius under load (machine setting), Rf = radius after unloading.
 * E' = E / (1 − ν²) because a wide plate bends in plane strain.
 * For x ≥ 0.5 the plate stays elastic and springs back flat.
 */

export interface SpringbackInput {
  /** Target mid-surface radius after unloading [mm]. */
  targetRadius: number;
  thickness: number;
  /** Yield strength [MPa]. */
  yieldStrength: number;
  /** Young's modulus [MPa]. */
  modulus: number;
  poisson: number;
  /** Scales the predicted springback; 1 = model as-is. Tuned from shop trials. */
  calibration?: number;
}

export interface SpringbackResult {
  /** Radius to set under load [mm], mid-surface. */
  setRadius: number;
  /** (Rf − Ri) / Rf, share of radius lost to springback. */
  ratio: number;
}

export function finalRadius(
  setRadius: number,
  thickness: number,
  re: number,
  ePlane: number,
): number {
  const x = (setRadius * re) / (ePlane * thickness);
  if (x >= 0.5) return Infinity;
  return setRadius / ((2 * x - 1) ** 2 * (x + 1));
}

export function springback(input: SpringbackInput): SpringbackResult | null {
  const { targetRadius: rf, thickness: t, yieldStrength: re, modulus, poisson } = input;
  if (!(rf > 0 && t > 0 && re > 0 && modulus > 0)) return null;
  const ePlane = modulus / (1 - poisson * poisson);
  const elasticLimit = (ePlane * t) / (2 * re);

  // finalRadius() rises monotonically from 0 to ∞ on (0, elasticLimit), so bisection is safe.
  let lo = 0;
  let hi = Math.min(rf, elasticLimit);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (finalRadius(mid, t, re, ePlane) < rf) lo = mid;
    else hi = mid;
  }
  const model = (lo + hi) / 2;
  const calibration = input.calibration ?? 1;
  const setRadius = rf - calibration * (rf - model);
  return { setRadius, ratio: (rf - setRadius) / rf };
}
