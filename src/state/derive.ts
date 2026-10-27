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
};

export function derive(
  inputs: Inputs,
  machine: MachineLimits,
  process: ProcessConfig,
  materials: Material[],
): Derived {
  const num = (field: TextField) => parseNumber(inputs[field]);
  const thickness = num("thickness");
  const width = num("width");
  const material =
    inputs.materialId === CUSTOM_MATERIAL_ID
      ? null
      : (materials.find((m) => m.id === inputs.materialId) ?? null);
  const reActual = num("reActual");
  const base: Omit<Derived, "output" | "error" | "props"> = {
    inputs,
    material,
    thickness,
    width: width !== null && width > 0 ? width : null,
    flatEnd: 0,
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
  const calibration = num("calibration") ?? process.calibration;
  const common = {
    material: props,
    reFromCertificate: reActual !== null && reActual > 0,
    calibration: calibration >= 0 ? calibration : process.calibration,
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
  } else {
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
  }

  const out = calculate(calc);
  if ("error" in out) {
    const field = errorFields[out.error] ?? "thickness";
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
