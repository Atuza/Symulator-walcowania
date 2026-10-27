import { springback } from "./springback";

/**
 * Springback calibration from a trial part.
 *
 * The calculator sets the machine to  Rs = Rf − c · (Rf − Rm),  where Rm is the uncalibrated model
 * setting for target Rf. A trial rolled at a known setting Rs that came out at a measured Rf gives
 *
 *   c = (Rf − Rs) / (Rf − Rm)
 *
 * c = 1: the model is right; c < 1: the real springback is smaller; c > 1: larger.
 * All radii are mid-surface (neutral) radii.
 */

export interface TrialInput {
  thickness: number;
  /** Inner diameter set on the machine [mm]. */
  setInnerD: number;
  /** Inner diameter measured after rolling [mm]. */
  measuredInnerD: number;
  yieldStrength: number;
  modulus: number;
  poisson: number;
}

export type TrialError = "input" | "noSpringback" | "model";

export interface TrialResult {
  factor: number;
  /** Real springback share (Rf − Rs) / Rf. */
  measuredRatio: number;
  /** Model springback share for the same target. */
  modelRatio: number;
}

export function calibrationFactor(trial: TrialInput): TrialResult | TrialError {
  const { thickness: t, setInnerD, measuredInnerD } = trial;
  if (!(t > 0 && setInnerD > 0 && measuredInnerD > 0)) return "input";
  // Springback always opens the shell: a measured diameter not above the setting is a measuring error.
  if (!(measuredInnerD > setInnerD)) return "noSpringback";
  const rf = (measuredInnerD + t) / 2;
  const rs = (setInnerD + t) / 2;
  const model = springback({
    targetRadius: rf,
    thickness: t,
    yieldStrength: trial.yieldStrength,
    modulus: trial.modulus,
    poisson: trial.poisson,
  });
  if (!model || !(rf - model.setRadius > 1e-9)) return "model";
  return {
    factor: (rf - rs) / (rf - model.setRadius),
    measuredRatio: (rf - rs) / rf,
    modelRatio: model.ratio,
  };
}

/** Plain mean of trial factors; outliers are the operator's call, shown in the list. */
export function meanFactor(factors: number[]): number | null {
  const valid = factors.filter((f) => Number.isFinite(f) && f > 0);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
