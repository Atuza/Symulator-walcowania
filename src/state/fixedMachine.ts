import { emptyMachine, type MachineLimits } from "../domain/calculate";
import type { CapacityChart } from "../domain/capacity";

/** The installed machine's geometry [mm], including the configured roll radii converted to diameters. */
export const fixedMachineGeometry = Object.freeze({
  topRollD: 338.38,
  bottomRollD: 310.12,
  sideRollD: 240.02,
  rollLength: 3100,
  maxWidth: 3000,
});

/** Smallest inner diameter in the maker's capacity charts [mm]. */
export const documentedMinDiameter = 380;

const WIDTHS = [1200, 1350, 1500, 1650, 1800, 1950, 2100, 2250, 2400, 2550, 2700, 2850, 3000];
const DIAMETERS = [380, 510, 680, 1020, 1700];

/**
 * Maximum plate thickness [mm] from the machine's capacity charts: rows are plate widths, columns
 * inner diameters, one chart per operation and yield strength (260 MPa for UTS up to 400, 360 MPa for
 * UTS up to 500).
 */
export const documentedCharts: readonly CapacityChart[] = Object.freeze([
  {
    kind: "rolling",
    re: 260,
    widths: WIDTHS,
    diameters: DIAMETERS,
    thickness: [
      [18, 20, 22, 25, 27],
      [17, 19, 21, 24, 26],
      [17, 19, 21, 23, 25],
      [16, 18, 20, 22, 24],
      [16, 18, 20, 22, 23],
      [15, 17, 19, 21, 23],
      [15, 17, 19, 21, 23],
      [15, 17, 19, 21, 23],
      [14, 16, 18, 20, 22],
      [14, 16, 18, 20, 22],
      [14, 16, 18, 20, 22],
      [14, 16, 18, 20, 22],
      [14, 16, 18, 20, 22],
    ],
  },
  {
    kind: "rolling",
    re: 360,
    widths: WIDTHS,
    diameters: DIAMETERS,
    thickness: [
      [16, 18, 20, 22, 23],
      [15, 17, 19, 21, 22],
      [15, 17, 18, 20, 21],
      [14, 16, 18, 19, 20],
      [14, 16, 17, 19, 20],
      [13, 15, 17, 18, 19],
      [13, 15, 16, 18, 19],
      [13, 15, 16, 18, 19],
      [13, 14, 16, 17, 18],
      [13, 14, 16, 17, 18],
      [12, 14, 16, 17, 18],
      [12, 14, 15, 17, 18],
      [12, 14, 15, 17, 18],
    ],
  },
  {
    kind: "prebending",
    re: 260,
    widths: WIDTHS,
    diameters: DIAMETERS,
    thickness: [
      [17, 19, 21, 23, 25],
      [16, 18, 19, 20, 24],
      [16, 17, 18, 19, 23],
      [15, 16, 17, 18, 22],
      [15, 15, 16, 17, 21],
      [14, 14, 15, 16, 21],
      [13, 14, 14, 15, 20],
      [13, 14, 14, 14, 20],
      [12, 13, 14, 14, 19],
      [12, 13, 13, 14, 19],
      [12, 13, 13, 13, 18],
      [12, 13, 13, 13, 18],
      [12, 13, 13, 13, 18],
    ],
  },
  {
    kind: "prebending",
    re: 360,
    widths: WIDTHS,
    diameters: DIAMETERS,
    thickness: [
      [15, 16, 17, 17, 20],
      [14, 15, 15, 15, 18],
      [13, 14, 14, 14, 17],
      [12, 13, 13, 13, 16],
      [12, 12, 12, 12, 15],
      [11, 11, 11, 12, 14],
      [11, 11, 11, 11, 13],
      [10, 11, 11, 11, 13],
      [10, 10, 11, 11, 12],
      [10, 10, 10, 11, 12],
      [9, 10, 10, 10, 12],
      [9, 10, 10, 10, 12],
      [9, 10, 10, 10, 12],
    ],
  },
]);

/**
 * Older settings and imported files may supply limits/charts, but never replace the installed rolls.
 * Without charts of their own the documented ones apply, and the minimum diameter defaults to the
 * smallest diameter they cover.
 */
export function withFixedMachine(machine: MachineLimits = emptyMachine): MachineLimits {
  return {
    ...machine,
    ...fixedMachineGeometry,
    minDiameter: machine.minDiameter ?? documentedMinDiameter,
    charts: machine.charts.length
      ? machine.charts
      : documentedCharts.map((c) => structuredClone(c)),
  };
}
