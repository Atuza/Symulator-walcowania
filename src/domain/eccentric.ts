import { neutralFactor } from "./neutralAxis";
import { surfaceDepth, type Surface } from "./types";

/*
 * Eccentric (oblique) cone: two circular ends in parallel planes a height H apart, their centres
 * offset by e across the axis. With e = (D1 − D2) / 2 one generator runs straight across (flat side),
 * as in an eccentric reducer. Points at the same angle φ on both circles lie on one generator, and all
 * generators meet in the apex, so the surface is a cone and develops without stretching.
 *
 * Model frame: large end in z = 0 centred on the origin, small end in z = H centred on (0, e).
 * φ is measured from the +y direction (the offset side), where the generator is shortest.
 */

export interface EccentricInput {
  thickness: number;
  /** End diameters on the chosen surface [mm]. */
  dLarge: number;
  dSmall: number;
  /** Distance between the end planes [mm]. */
  height: number;
  /** Offset between the end centres [mm]. */
  offset: number;
  surface: Surface;
  flatEnds: number;
  kOverride: number | null;
}

export type DevPt = [number, number];

export interface EccentricResult {
  k: number;
  large: { dInner: number; dOuter: number; dNeutral: number };
  small: { dInner: number; dOuter: number; dNeutral: number };
  height: number;
  offset: number;
  /** Development outline, closed, with the bounding box starting at (0, 0) [mm]. */
  outline: DevPt[];
  /** Generator lines on the development every 30°, for marking out; each from large to small end. */
  generators: { phi: number; a: DevPt; b: DevPt; length: number }[];
  /** Shortest and longest generator between the ends, on the neutral surface [mm]. */
  slantMin: number;
  slantMax: number;
  /** Developed edge lengths: large and small end, allowance excluded [mm]. */
  arcLarge: number;
  arcSmall: number;
  box: { width: number; height: number };
  area: number;
  flatEnd: number;
  /** Largest angle between a generator and the axis [rad]. */
  alphaMax: number;
  rtMin: number;
  outerStrainMax: number;
}

export type EccentricError =
  "thickness" | "dLarge" | "dSmall" | "height" | "offset" | "order" | "tooSmall";

// φ steps around the circles; the development is accurate far below 0.01 mm at this density.
const STEPS = 1440;

export function solveEccentric(input: EccentricInput): EccentricResult | EccentricError {
  const { thickness: t, dLarge, dSmall, height: H, offset: e } = input;
  if (!(t > 0)) return "thickness";
  if (!(dLarge > 0)) return "dLarge";
  if (!(dSmall >= 0)) return "dSmall";
  if (!(H > 0)) return "height";
  if (!Number.isFinite(e) || e < 0) return "offset";
  if (!(dLarge > dSmall)) return "order";

  // Thickness is normal to the wall; across an end plane it spans about t / cos α of the mean slope.
  const alphaMean = Math.atan((dLarge - dSmall) / 2 / H);
  const radialT = t / Math.cos(alphaMean);
  const depth = surfaceDepth[input.surface];
  const largeIn = dLarge - 2 * depth * radialT;
  const smallIn = dSmall - 2 * depth * radialT;
  if (!(largeIn > 0) || smallIn < -1e-9) return "tooSmall";
  const k = input.kOverride ?? neutralFactor((largeIn + smallIn) / 4 / Math.cos(alphaMean), t);
  const end = (dIn: number) => ({
    dInner: Math.max(0, dIn),
    dOuter: dIn + 2 * radialT,
    dNeutral: Math.max(0, dIn + 2 * k * radialT),
  });
  const large = end(largeIn),
    small = end(smallIn);
  const R1 = large.dNeutral / 2,
    R2 = small.dNeutral / 2;

  // Apex: the homothety centre that maps the large circle onto the small one.
  const s = R1 / (R1 - R2);
  const apex = [0, e * s, H * s] as const;
  const rel = (phi: number) => {
    const x = R1 * Math.sin(phi) - apex[0],
      y = R1 * Math.cos(phi) - apex[1],
      z = -apex[2];
    return [x, y, z] as const;
  };
  const rho = (phi: number) => Math.hypot(...rel(phi));
  // Developed angle grows with the part of the base tangent that is square to the generator.
  const dTheta = (phi: number) => {
    const [x, y, z] = rel(phi);
    const tx = R1 * Math.cos(phi),
      ty = -R1 * Math.sin(phi);
    const cx = -z * ty,
      cy = z * tx,
      cz = x * ty - y * tx;
    return Math.hypot(cx, cy, cz) / (x * x + y * y + z * z);
  };

  const h = (2 * Math.PI) / STEPS;
  const ratio = R2 / R1;
  const outer: DevPt[] = [],
    inner: DevPt[] = [];
  const thetas: number[] = [];
  let theta = 0,
    area = 0,
    prevF = dTheta(0);
  for (let i = 0; i <= STEPS; i++) {
    const phi = i * h;
    if (i > 0) {
      // Simpson on each step, with the midpoint.
      const fm = dTheta(phi - h / 2),
        f1 = dTheta(phi);
      const dth = (h / 6) * (prevF + 4 * fm + f1);
      const rm = rho(phi - h / 2);
      area += 0.5 * rm * rm * (1 - ratio * ratio) * dth;
      theta += dth;
      prevF = f1;
    }
    thetas.push(theta);
    const r = rho(phi);
    outer.push([r * Math.cos(theta), r * Math.sin(theta)]);
    inner.push([r * ratio * Math.cos(theta), r * ratio * Math.sin(theta)]);
  }
  const total = theta;
  if (!(total < 2 * Math.PI)) return "tooSmall";

  // Flat-end allowance: a strip of width f beyond each seam generator.
  const f = Math.max(0, input.flatEnds);
  const shift = (p: DevPt, th: number, sign: number): DevPt => [
    p[0] - sign * f * Math.sin(th),
    p[1] + sign * f * Math.cos(th),
  ];
  const ring: DevPt[] = [];
  if (f > 0) ring.push(shift(inner[0]!, 0, -1), shift(outer[0]!, 0, -1));
  ring.push(...outer);
  if (f > 0) ring.push(shift(outer[STEPS]!, total, 1), shift(inner[STEPS]!, total, 1));
  ring.push(...inner.slice().reverse());

  // Turn the development to open upwards, symmetric about the vertical, then move it to (0, 0).
  const turn = Math.PI / 2 - total / 2;
  const c = Math.cos(turn),
    sn = Math.sin(turn);
  const rot = ([x, y]: DevPt): DevPt => [x * c - y * sn, x * sn + y * c];
  const turned = ring.map(rot);
  const minX = Math.min(...turned.map((p) => p[0])),
    minY = Math.min(...turned.map((p) => p[1]));
  const place = (p: DevPt): DevPt => {
    const [x, y] = rot(p);
    return [x - minX, y - minY];
  };
  const outline = turned.map(([x, y]): DevPt => [x - minX, y - minY]);

  const generators: EccentricResult["generators"] = [];
  for (let deg = 0; deg <= 360; deg += 30) {
    const i = Math.round((deg / 360) * STEPS);
    const r = rho(i * h);
    generators.push({
      phi: (deg * Math.PI) / 180,
      a: place(outer[i]!),
      b: place(inner[i]!),
      length: r * (1 - ratio),
    });
  }
  let slantMin = Infinity,
    slantMax = 0;
  for (let i = 0; i < STEPS; i++) {
    const g = rho(i * h) * (1 - ratio);
    slantMin = Math.min(slantMin, g);
    slantMax = Math.max(slantMax, g);
  }
  const xs = outline.map((p) => p[0]),
    ys = outline.map((p) => p[1]);
  // Generators meet the axis direction at most where they lean the furthest.
  const alphaMax = Math.acos(H / slantMax);
  const smallPrincipal = Math.max(0, small.dInner) / 2;
  return {
    k,
    large,
    small,
    height: H,
    offset: e,
    outline,
    generators,
    slantMin,
    slantMax,
    arcLarge: Math.PI * large.dNeutral,
    arcSmall: Math.PI * small.dNeutral,
    box: { width: Math.max(...xs), height: Math.max(...ys) },
    area: area + f * (generators[0]!.length + generators[generators.length - 1]!.length),
    flatEnd: f,
    alphaMax,
    rtMin: smallPrincipal / t,
    outerStrainMax: t / (2 * smallPrincipal + t),
  };
}

/** Point of the neutral surface at angle φ and share u of the way from the large to the small end. */
export function eccentricPoint(
  r: EccentricResult,
  phi: number,
  u: number,
): [number, number, number] {
  const R1 = r.large.dNeutral / 2,
    R2 = r.small.dNeutral / 2;
  const R = R1 + (R2 - R1) * u;
  return [R * Math.sin(phi), r.offset * u + R * Math.cos(phi), r.height * u];
}
