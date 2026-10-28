import type { CalcOutput, MachineLimits } from "../domain/calculate";
import type { EccentricResult } from "../domain/eccentric";
import type { Development, Profile } from "../domain/profile";

export interface RollSizes {
  top: number;
  bottom: number;
  side: number;
}

/** The plate roll drawn around the plate. */
export interface MachineView {
  rolls: RollSizes;
  /** Roll barrel length [mm]. */
  rollLength: number;
  /** True when roll sizes come from the machine settings. */
  realRolls: boolean;
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
      machine: MachineView;
    }
  | {
      shape: "cone";
      rOuter: number;
      rInner: number;
      angle: number;
      alpha: number;
      thickness: number;
    }
  | { shape: "eccentric"; result: EccentricResult }
  | {
      shape: "profile";
      profile: Profile;
      dev: Development;
      thickness: number;
      width: number;
      machine: MachineView;
    };

/**
 * Real roll sizes from the machine settings, or symbolic ones that fit inside the tightest bend.
 * The barrel is the machine's working length, or a little longer than the plate.
 */
function machineView(
  machine: MachineLimits,
  tightInnerD: number,
  thickness: number,
  width: number,
): MachineView {
  const symbolicTop = Math.min(tightInnerD * 0.42, Math.max(thickness * 12, tightInnerD * 0.2));
  const top = machine.topRollD ?? symbolicTop;
  return {
    rolls: {
      top,
      bottom: machine.bottomRollD ?? top * 0.92,
      side: machine.sideRollD ?? top * 0.8,
    },
    rollLength: Math.max(machine.rollLength ?? 0, width * 1.15),
    realRolls: machine.topRollD !== null,
  };
}

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
  if (out.shape === "eccentric") return { shape: "eccentric", result: out.result };
  if (out.shape === "profile") {
    const r = out.result;
    const w = width ?? Math.max(r.blankLength * 0.2, 200);
    return {
      shape: "profile",
      profile: r.profile,
      dev: r.dev,
      thickness,
      width: w,
      machine: machineView(machine, 2 * r.radii[0]!, thickness, w),
    };
  }
  const r = out.result;
  const w = width ?? Math.max(r.dOuter * 0.6, 200);
  return {
    shape: "cylinder",
    radius: r.dNeutral / 2,
    thickness,
    width: w,
    length: r.blankLength,
    flatEnd: r.flatEnd,
    machine: machineView(machine, r.dInner, thickness, w),
  };
}
