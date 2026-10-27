/**
 * Neutral-fibre position as a fraction of thickness, measured from the inner surface.
 *
 * Based on the DIN 6935 correction factor k = 0.65 + 0.5 * log10(ri / t), valid for ri / t < 5.
 * DIN places the neutral fibre at k * t / 2 from the inner surface, so the fraction is k / 2.
 * Above ri / t = 5 the shift is negligible and the fibre sits at mid-thickness.
 */
export function neutralFactor(innerRadius: number, thickness: number): number {
  if (!(thickness > 0)) return 0.5;
  const ratio = innerRadius / thickness;
  if (!(ratio > 0)) return MIN_FACTOR;
  if (ratio >= 5) return 0.5;
  const k = (0.65 + 0.5 * Math.log10(ratio)) / 2;
  return Math.min(0.5, Math.max(MIN_FACTOR, k));
}

// Below ri/t ≈ 0.6 the DIN formula leaves its validity range; clamp instead of extrapolating.
const MIN_FACTOR = 0.25;
