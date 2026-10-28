import {
  calculate,
  type CalcInput,
  type CalcOutput,
  type MachineLimits,
  type MaterialProps,
} from "../domain/calculate";
import { CUSTOM_MATERIAL_ID } from "../domain/materials/data";
import { yieldAt, type Material } from "../domain/materials/schema";
import type { Key } from "../i18n";
import type { ProcessConfig } from "./config";
import { parseNumber, type Inputs, type TextField } from "./inputs";

export interface Derived {
  inputs: Inputs;
  material: Material | null;
  props: MaterialProps | null;
  thickness: number | null;
  width: number | null;
  /** Effective flat end per side, 0 when disabled. */
  flatEnd: number;
  /** Springback factor in use and where it came from. */
  calibration: { value: number; source: "input" | "trials" | "default"; trials: number };
  output: CalcOutput | null;
  error: { key: Key; field: TextField } | null;
}

const errorFields: Record<string, TextField> = {
  thickness: "thickness",
  value: "value",
  tooSmall: "value",
  length: "length",
  dLarge: "dLarge",
  dSmall: "dSmall",
  height: "height",
  order: "dSmall",
  tooFlat: "height",
  a: "sizeA",
  b: "sizeB",
  r: "sizeR",
  angle: "angle",
};

export function derive(
  inputs: Inputs,
  machine: MachineLimits,
  process: ProcessConfig,
  materials: Material[],
  /** Mean trial factor and trial count per material id. */
  trialFactors: Map<string, { factor: number; count: number }> = new Map(),
): Derived {
  const num = (field: TextField) => parseNumber(inputs[field]);
  const thickness = num("thickness");
  const width = num("width");
  const material =
    inputs.materialId === CUSTOM_MATERIAL_ID
      ? null
      : (materials.find((m) => m.id === inputs.materialId) ?? null);
  const reActual = num("reActual");
  const typed = num("calibration");
  const fromTrials = trialFactors.get(inputs.materialId);
  const calibration: Derived["calibration"] =
    typed !== null && typed >= 0
      ? { value: typed, source: "input", trials: 0 }
      : fromTrials
        ? { value: fromTrials.factor, source: "trials", trials: fromTrials.count }
        : { value: process.calibration, source: "default", trials: 0 };
  const base: Omit<Derived, "output" | "error" | "props"> = {
    inputs,
    material,
    thickness,
    width: width !== null && width > 0 ? width : null,
    flatEnd: 0,
    calibration,
  };

  if (thickness === null || thickness <= 0) {
    return {
      ...base,
      props: null,
      output: null,
      error: { key: "error.thickness", field: "thickness" },
    };
  }

  const props = materialProps(inputs, material, thickness, reActual);
  if (!props)
    return {
      ...base,
      props: null,
      output: null,
      error: { key: "error.material", field: "customRe" },
    };

  const flatEnd = inputs.flatEnds ? (num("flatLength") ?? process.flatEndFactor * thickness) : 0;
  const k = num("k");
  const kOverride = k !== null && k > 0 && k <= 1 ? k : null;
  const common = {
    material: props,
    reFromCertificate: reActual !== null && reActual > 0,
    calibration: calibration.value,
    machine,
    springbackWarn: process.springbackWarn,
  };

  let calc: CalcInput;
  if (inputs.shape === "cylinder") {
    calc =
      inputs.mode === "fromDiameter"
        ? {
            ...common,
            shape: "cylinder",
            width: base.width,
            cylinder: {
              mode: "fromDiameter",
              thickness,
              value: num("value") ?? NaN,
              isRadius: inputs.dimension === "radius",
              surface: inputs.surface,
              flatEnds: flatEnd,
              kOverride,
            },
          }
        : {
            ...common,
            shape: "cylinder",
            width: base.width,
            cylinder: {
              mode: "fromLength",
              thickness,
              blankLength: num("length") ?? NaN,
              flatEnds: flatEnd,
              kOverride,
            },
          };
  } else if (inputs.shape === "cone") {
    calc = {
      ...common,
      shape: "cone",
      cone: {
        thickness,
        dLarge: num("dLarge") ?? NaN,
        dSmall: num("dSmall") ?? NaN,
        height: num("height") ?? NaN,
        surface: inputs.surface,
        flatEnds: flatEnd,
        kOverride,
      },
    };
  } else {
    const shape = inputs.shape;
    // The half round is sized like the cylinder: diameter or radius in the main field.
    const main = num("value");
    const r =
      shape === "halfround"
        ? main === null
          ? NaN
          : inputs.dimension === "radius"
            ? main
            : main / 2
        : (num("sizeR") ?? NaN);
    calc = {
      ...common,
      shape: "profile",
      width: base.width,
      profile: {
        shape,
        thickness,
        surface: inputs.surface,
        a: num("sizeA") ?? NaN,
        b: num("sizeB") ?? NaN,
        r,
        angle: ((num("angle") ?? NaN) * Math.PI) / 180,
        flatEnds: flatEnd,
        kOverride,
      },
    };
  }

  const out = calculate(calc);
  if ("error" in out) {
    const field =
      inputs.shape === "halfround" && out.error === "r"
        ? "value"
        : (errorFields[out.error] ?? "thickness");
    return {
      ...base,
      flatEnd,
      props,
      output: null,
      error: { key: `error.${out.error}` as Key, field },
    };
  }
  return { ...base, flatEnd, props, output: out, error: null };
}

function materialProps(
  inputs: Inputs,
  material: Material | null,
  thickness: number,
  reActual: number | null,
): MaterialProps | null {
  const re = reActual !== null && reActual > 0 ? reActual : null;
  if (material) {
    return {
      re: re ?? yieldAt(material, thickness),
      modulus: material.modulus,
      poisson: material.poisson,
      density: material.density,
      minRt: material.minRt,
      strainLimit: material.strainLimit,
    };
  }
  const customRe = re ?? parseNumber(inputs.customRe);
  const customE = parseNumber(inputs.customE);
  const density = parseNumber(inputs.customDensity);
  if (customRe === null || customRe <= 0) return null;
  return {
    re: customRe,
    modulus: customE !== null && customE > 0 ? customE * 1000 : 210_000,
    poisson: 0.3,
    density: density !== null && density > 0 ? density : 7850,
    minRt: null,
    strainLimit: null,
  };
}
