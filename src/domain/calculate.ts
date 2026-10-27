import { solveCone, type ConeError, type ConeInput, type ConeResult } from "./cone";
import {
  solveCylinder,
  type CylinderError,
  type CylinderInput,
  type CylinderResult,
} from "./cylinder";
import { springback } from "./springback";
import type { Warning } from "./types";

export interface MaterialProps {
  re: number;
  modulus: number;
  poisson: number;
  density: number;
  minRt: number | null;
  strainLimit: number | null;
}

export interface MachineLimits {
  topRollD: number | null;
  bottomRollD: number | null;
  sideRollD: number | null;
  maxThickness: number | null;
  maxWidth: number | null;
  minDiameter: number | null;
}

export const emptyMachine: MachineLimits = {
  topRollD: null,
  bottomRollD: null,
  sideRollD: null,
  maxThickness: null,
  maxWidth: null,
  minDiameter: null,
};

interface Common {
  material: MaterialProps;
  reFromCertificate: boolean;
  calibration: number;
  machine: MachineLimits;
  /** Springback share above which an info warning is shown; default 0.3. */
  springbackWarn?: number;
}

export type CalcInput =
  | (Common & { shape: "cylinder"; cylinder: CylinderInput; width: number | null })
  | (Common & { shape: "cone"; cone: ConeInput });

/** Machine setting that compensates springback, expressed on the inner surface. */
export interface SetPoint {
  dInner: number;
  ratio: number;
}

export type CalcOutput =
  | {
      shape: "cylinder";
      result: CylinderResult;
      set: SetPoint | null;
      massKg: number | null;
      warnings: Warning[];
    }
  | {
      shape: "cone";
      result: ConeResult;
      setLarge: SetPoint | null;
      setSmall: SetPoint | null;
      massKg: number;
      warnings: Warning[];
    };

export type CalcError = { error: CylinderError | ConeError };

const DEFAULT_SPRINGBACK_WARN = 0.3;

export function calculate(input: CalcInput): CalcOutput | CalcError {
  return input.shape === "cylinder" ? calcCylinder(input) : calcCone(input);
}

function setPoint(
  input: Common,
  neutralPrincipalR: number,
  thickness: number,
  k: number,
  cosAlpha: number,
): SetPoint | null {
  const m = input.material;
  const sb = springback({
    targetRadius: neutralPrincipalR,
    thickness,
    yieldStrength: m.re,
    modulus: m.modulus,
    poisson: m.poisson,
    calibration: input.calibration,
  });
  if (!sb) return null;
  // Back from the mid/neutral principal radius to a diameter on the inner surface in the end plane.
  const dInner = 2 * (sb.setRadius - k * thickness) * cosAlpha;
  return { dInner, ratio: sb.ratio };
}

function commonWarnings(
  input: Common,
  thickness: number,
  rt: number,
  strain: number,
  w: Warning[],
) {
  const m = input.material;
  if (m.minRt !== null && rt < m.minRt)
    w.push({ code: "rtBelowMin", severity: "warn", values: { rt, min: m.minRt } });
  if (m.strainLimit !== null && strain > m.strainLimit)
    w.push({ code: "strainHigh", severity: "warn", values: { strain, limit: m.strainLimit } });
  const mc = input.machine;
  if (mc.maxThickness !== null && thickness > mc.maxThickness)
    w.push({ code: "machineThickness", severity: "warn", values: { max: mc.maxThickness } });
  if (input.reFromCertificate)
    w.push({ code: "reFromCertificate", severity: "info", values: { re: m.re } });
}

function springbackWarnings(set: SetPoint | null, limit: number, w: Warning[]) {
  if (!set) return;
  if (set.dInner <= 0 || set.ratio >= 0.999) w.push({ code: "elasticOnly", severity: "warn" });
  else if (set.ratio > limit)
    w.push({ code: "springbackLarge", severity: "info", values: { ratio: set.ratio } });
}

function calcCylinder(input: Extract<CalcInput, { shape: "cylinder" }>): CalcOutput | CalcError {
  const result = solveCylinder(input.cylinder);
  if (typeof result === "string") return { error: result };
  const t = input.cylinder.thickness;
  const set = setPoint(input, result.dNeutral / 2, t, result.k, 1);
  const w: Warning[] = [];
  commonWarnings(input, t, result.rt, result.outerStrain, w);
  springbackWarnings(set, input.springbackWarn ?? DEFAULT_SPRINGBACK_WARN, w);
  const mc = input.machine;
  if (mc.maxWidth !== null && input.width !== null && input.width > mc.maxWidth)
    w.push({ code: "machineWidth", severity: "warn", values: { max: mc.maxWidth } });
  if (mc.minDiameter !== null && result.dInner < mc.minDiameter)
    w.push({ code: "machineDiameter", severity: "warn", values: { min: mc.minDiameter } });
  if (mc.topRollD !== null && result.dInner <= mc.topRollD)
    w.push({ code: "machineTopRoll", severity: "warn", values: { d: mc.topRollD } });

  const massKg =
    input.width !== null && input.width > 0
      ? result.blankLength * input.width * t * 1e-9 * input.material.density
      : null;
  return { shape: "cylinder", result, set, massKg, warnings: w };
}

function calcCone(input: Extract<CalcInput, { shape: "cone" }>): CalcOutput | CalcError {
  const result = solveCone(input.cone);
  if (typeof result === "string") return { error: result };
  const t = input.cone.thickness;
  const cos = Math.cos(result.alpha);
  const setLarge = setPoint(input, result.large.dNeutral / 2 / cos, t, result.k, cos);
  const setSmall =
    result.small.dNeutral > 0
      ? setPoint(input, result.small.dNeutral / 2 / cos, t, result.k, cos)
      : null;
  const w: Warning[] = [];
  if (input.cone.dSmall === 0) w.push({ code: "coneApex", severity: "warn" });
  commonWarnings(input, t, result.rtMin, result.outerStrainMax, w);
  springbackWarnings(setLarge, input.springbackWarn ?? DEFAULT_SPRINGBACK_WARN, w);
  const mc = input.machine;
  // The generator lies along the rolls, so the slant length is the working width.
  if (mc.maxWidth !== null && result.slant > mc.maxWidth)
    w.push({ code: "machineWidth", severity: "warn", values: { max: mc.maxWidth } });
  if (mc.minDiameter !== null && result.small.dInner < mc.minDiameter)
    w.push({ code: "machineDiameter", severity: "warn", values: { min: mc.minDiameter } });
  if (mc.topRollD !== null && result.small.dInner <= mc.topRollD)
    w.push({ code: "machineTopRoll", severity: "warn", values: { d: mc.topRollD } });

  const massKg = result.area * t * 1e-9 * input.material.density;
  return { shape: "cone", result, setLarge, setSmall, massKg, warnings: w };
}
