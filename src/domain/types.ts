export type Surface = "inner" | "outer";

export type Severity = "info" | "warn";

export interface Warning {
  code: WarningCode;
  severity: Severity;
  values?: Record<string, number>;
}

export type WarningCode =
  | "rtBelowMin"
  | "strainHigh"
  | "springbackLarge"
  | "elasticOnly"
  | "coneApex"
  | "machineThickness"
  | "machineWidth"
  | "machineDiameter"
  | "machineTopRoll"
  | "reFromCertificate";
