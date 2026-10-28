import { emptyMachine, type MachineLimits } from "../domain/calculate";

/** The installed machine's geometry [mm], including the configured roll radii converted to diameters. */
export const fixedMachineGeometry = Object.freeze({
  topRollD: 338.38,
  bottomRollD: 310.12,
  sideRollD: 240.02,
  rollLength: 3100,
  maxWidth: 3000,
});

/** Older settings and imported files may supply limits/charts, but never replace the installed rolls. */
export function withFixedMachine(machine: MachineLimits = emptyMachine): MachineLimits {
  return { ...machine, ...fixedMachineGeometry };
}
