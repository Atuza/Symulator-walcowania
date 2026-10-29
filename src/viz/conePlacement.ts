import { Vector3, type BufferGeometry } from "three";
import { eccentricPoint } from "../domain/eccentric";
import type { SceneModel } from "./sceneModel";

type ConeModel = Extract<SceneModel, { shape: "cone" | "eccentric" }>;
const MM = 0.001;

/** Contact generator becomes the fixed roll axis, feed is +x and the inner normal is +y. */
export function coneContactFrame(m: ConeModel, progress: number) {
  if (m.shape === "cone") {
    const psi = (progress * m.angle) / Math.sin(m.alpha),
      sin = Math.sin(m.alpha),
      cos = Math.cos(m.alpha);
    const along = new Vector3(sin * Math.cos(psi), -cos, sin * Math.sin(psi));
    const inward = new Vector3(-cos * Math.cos(psi), -sin, -cos * Math.sin(psi));
    const feed = new Vector3(-Math.sin(psi), 0, Math.cos(psi));
    const mean = (m.rOuter + m.rInner) / 2;
    const origin = along
      .clone()
      .multiplyScalar(mean)
      .add(new Vector3(0, mean * cos, 0));
    return { origin, feed, inward, along };
  }
  const r = m.result,
    phi = Math.PI * 2 * Math.max(0.02, Math.min(1, progress));
  const point = (u: number, surface: "inner" | "outer" | "neutral") =>
    new Vector3(...eccentricPoint(r, phi, u, surface));
  const along = point(0, "neutral").sub(point(1, "neutral")).normalize();
  const outer = point(0.5, "outer"),
    inner = point(0.5, "inner");
  const inward = inner.clone().sub(outer);
  inward.addScaledVector(along, -inward.dot(along)).normalize();
  const feed = inward.clone().cross(along).normalize();
  const origin = inner
    .add(outer)
    .multiplyScalar(0.5)
    .sub(new Vector3(0, r.offset / 2, r.height / 2));
  return { origin, feed, inward, along };
}

// Gap between the drive-end housing face and the cone's large end [mm].
const DRIVE_END_GAP = 100;

/**
 * Where the contact generator lies along the rolls [mm]: as on the machine, the large end sits at the
 * fixed drive-end housing (−z) and the small end towards the yoke (+z).
 */
export function coneAlongRolls(m: ConeModel) {
  const slant = m.shape === "cone" ? m.rOuter - m.rInner : m.result.slantMax;
  const large = -m.machine.rollLength / 2 + DRIVE_END_GAP;
  return { large, small: large + slant, centre: large + slant / 2 };
}

export function placeConeOnMachine(geometry: BufferGeometry, m: ConeModel, progress: number) {
  const { origin, feed, inward, along } = coneContactFrame(m, progress);
  origin.multiplyScalar(MM);
  // The frame's `along` points from the small end to the large end; reversing it puts the large end
  // at the drive end. The mirror keeps feed and inner normal; the plate material is double-sided.
  const shift = coneAlongRolls(m).centre * MM;
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) - origin.x,
      y = positions.getY(i) - origin.y,
      z = positions.getZ(i) - origin.z;
    positions.setXYZ(
      i,
      x * feed.x + y * feed.y + z * feed.z,
      x * inward.x + y * inward.y + z * inward.z,
      shift - (x * along.x + y * along.y + z * along.z),
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}
