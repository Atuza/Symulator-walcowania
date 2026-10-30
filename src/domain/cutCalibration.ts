/** Empirical process calibration, separate from neutral-axis and springback models. */
export const CUT_CALIBRATION_MODELS = ["constant", "thickness"] as const;
export type CutCalibrationModel = (typeof CUT_CALIBRATION_MODELS)[number];

const FITTED_EFFECTIVE_K = 0.4345739832875726;

export const P460_CYLINDER_CALIBRATION = {
  id: "p460nl2-cylinder-2026-10-30",
  materialId: "p460nl2",
  trials: 5,
  /** Mean of C_outer - L_cut - pi*t in the five confirmed cylinder trials [mm]. */
  correction: 3.989383113250804,
  /** Least-squares fit from the same five cylinders; not a measured neutral-axis position. */
  effectiveK: FITTED_EFFECTIVE_K,
  /** Positive cut shortening per mm of thickness, equivalent to k above for baseline k=0.5. */
  correctionPerThickness: 2 * Math.PI * (0.5 - FITTED_EFFECTIVE_K),
  thicknessMin: 9.2,
  thicknessMax: 10,
  outerCircumferenceMin: 6916,
  outerCircumferenceMax: 7548,
  pressureSetpointBar: 55,
} as const;

export type CutCalibrationStatus = "applied" | "disabled" | "thickness" | "flatEnds" | "manualK";

export function cylinderCutCalibration(
  enabled: boolean,
  thickness: number,
  flatEnd: number,
  kOverride: number | null,
  model: CutCalibrationModel = "thickness",
): CutCalibrationStatus {
  if (!enabled) return "disabled";
  if (
    !Number.isFinite(thickness) ||
    thickness <= 0 ||
    (model === "constant" &&
      (thickness < P460_CYLINDER_CALIBRATION.thicknessMin ||
        thickness > P460_CYLINDER_CALIBRATION.thicknessMax))
  )
    return "thickness";
  if (flatEnd > 0) return "flatEnds";
  // A user-entered k may already encode the same trials. Never stack the two corrections.
  if (kOverride !== null) return "manualK";
  return "applied";
}

/** Keep the v1.1.10 model for saved cuts; the grade profile scales continuously with thickness. */
export function cylinderCutCorrection(thickness: number, model: CutCalibrationModel): number {
  return model === "constant"
    ? P460_CYLINDER_CALIBRATION.correction
    : P460_CYLINDER_CALIBRATION.correctionPerThickness * thickness;
}
