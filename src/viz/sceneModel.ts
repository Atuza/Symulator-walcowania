import type { CalcOutput, MachineLimits } from "../domain/calculate";

export interface RollSizes {
  top: number;
  bottom: number;
  side: number;
}

export type SceneModel =
  | {
      shape: "cylinder";
      /** Neutral radius [mm]. */
      radius: number;
      thickness: number;
      width: number;
      /** Blank length including flat ends [mm]. */
      length: number;
      flatEnd: number;
      rolls: RollSizes;
      /** True when roll sizes come from the machine settings. */
      realRolls: boolean;
    }
  | {
      shape: "cone";
      rOuter: number;
      rInner: number;
      angle: number;
      alpha: number;
      thickness: number;
    };

export function sceneModel(
  out: CalcOutput,
  thickness: number,
  width: number | null,
  machine: MachineLimits,
): SceneModel {
  if (out.shape === "cone") {
    const r = out.result;
    return {
      shape: "cone",
      rOuter: r.rOuter,
      rInner: r.rInner,
      angle: r.angle,
      alpha: r.alpha,
      thickness,
    };
  }
  const r = out.result;
  const real = machine.topRollD !== null;
  // Symbolic rolls sized to fit inside the shell when the machine is unknown.
  const symbolicTop = Math.min(r.dInner * 0.42, Math.max(thickness * 12, r.dInner * 0.2));
  const top = machine.topRollD ?? symbolicTop;
  const rolls: RollSizes = {
    top,
    bottom: machine.bottomRollD ?? top * 0.92,
    side: machine.sideRollD ?? top * 0.8,
  };
  return {
    shape: "cylinder",
    radius: r.dNeutral / 2,
    thickness,
    width: width ?? Math.max(r.dOuter * 0.6, 200),
    length: r.blankLength,
    flatEnd: r.flatEnd,
    rolls,
    realRolls: real,
  };
}
