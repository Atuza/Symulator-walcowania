import { BoxGeometry, CylinderGeometry, Group, Mesh, type Material } from "three";
import type { MachineView } from "./sceneModel";

/*
 * Plate roll frame around the rolls, in model millimetres scaled by `mm`. Proportions follow the roll
 * sizes, so a machine with real roll data gets a frame of matching size. Layout, as on the shop
 * floor: fixed housing at the far end (−z), drop-end yoke at the near end (+z) where the shell comes
 * off, bed beam between them and the feed table on the entry side (+x).
 */

export interface FrameMaterials {
  frame: Material;
  yoke: Material;
  steel: Material;
}

/** Room each roll journal needs inside a housing, beyond the barrel [mm]. */
export function housingDepth(m: MachineView): number {
  return Math.max(m.rolls.bottom * 0.55, 120);
}

export function buildFrame(
  m: MachineView,
  thickness: number,
  feedLength: number,
  mats: FrameMaterials,
  mm: number,
): Group {
  const g = new Group();
  const t = thickness;
  const rt = m.rolls.top / 2,
    rb = m.rolls.bottom / 2,
    rs = m.rolls.side / 2;
  const box = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    mat: Material,
  ) => {
    const mesh = new Mesh(new BoxGeometry((x1 - x0) * mm, (y1 - y0) * mm, (z1 - z0) * mm), mat);
    mesh.position.set(((x0 + x1) / 2) * mm, ((y0 + y1) / 2) * mm, ((z0 + z1) / 2) * mm);
    g.add(mesh);
  };

  const halfW = (rb + rs) * 1.08 + rs + rb * 0.35;
  const yLow = -t / 2 - 2 * rb - rs * 0.9;
  const yHigh = t / 2 + 2 * rt + rb * 0.35;
  const d = housingDepth(m);
  const zEnd = m.rollLength / 2 + 20;

  // Fixed housing.
  box(-halfW, halfW, yLow, yHigh, -zEnd - d, -zEnd, mats.frame);
  // Drop end: lower housing plus the yoke that swings open over the top roll journal.
  const yokeSplit = t / 2 + rt * 0.4;
  box(-halfW, halfW, yLow, yokeSplit, zEnd, zEnd + d, mats.frame);
  box(-halfW * 0.62, halfW * 0.62, yokeSplit, yHigh, zEnd + d * 0.1, zEnd + d * 0.9, mats.yoke);
  // Bed beam joining the housings.
  const bedH = rb * 0.45;
  box(-halfW * 0.85, halfW * 0.85, yLow - bedH, yLow, -zEnd - d, zEnd + d, mats.frame);

  // Feed table: rollers across the plate's path on two side beams, top level with the plate.
  const x0 = halfW + 60;
  const pitch = 260;
  const n = Math.max(3, Math.round(feedLength / pitch));
  const rr = 45;
  const tableLen = n * pitch;
  const span = m.rollLength * 0.9;
  for (let i = 0; i < n; i++) {
    const roller = new Mesh(new CylinderGeometry(rr * mm, rr * mm, span * mm, 20, 1), mats.steel);
    roller.rotation.x = Math.PI / 2;
    roller.position.set((x0 + pitch * (i + 0.5)) * mm, (-t / 2 - rr) * mm, 0);
    g.add(roller);
  }
  const beamTop = -t / 2 - rr;
  for (const z of [-span / 2 - 40, span / 2 + 40])
    box(x0, x0 + tableLen, beamTop - 160, beamTop, z - 40, z + 40, mats.frame);
  return g;
}
