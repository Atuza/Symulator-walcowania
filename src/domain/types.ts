export type Surface = "inner" | "mid" | "outer";

/** Share of the thickness between the inner surface and the given one. */
export const surfaceDepth: Record<Surface, number> = { inner: 0, mid: 0.5, outer: 1 };

export type Severity = "info" | "warn";

export interface Warning {
  code: WarningCode;
  severity: Severity;
  values?: Record<string, number>;
}

export type WarningCode =
  | "rtBelowMin"
  | "thicknessBeyondStandard"
  | "strainHigh"
  | "springbackLarge"
  | "reMinimum"
  | "elasticOnly"
  | "coneApex"
  | "machineThickness"
  | "machineWidth"
  | "machineDiameter"
  | "machineTopRoll"
  | "capacityRolling"
  | "capacityPrebending"
  | "capacityOutside"
  | "coneCapacity"
  | "diameterSmallForThickness"
  | "reFromCertificate"
  | "cutCalibrationExtrapolated";
