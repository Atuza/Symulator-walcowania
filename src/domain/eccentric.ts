import { neutralFactor } from "./neutralAxis";
import { surfaceDepth, type Surface } from "./types";

export interface EccentricInput {
  thickness: number;
  /** Circular ends on the selected reference surface, in parallel planes [mm]. */
  dLarge: number;
  dSmall: number;
  height: number;
  offset: number;
  surface: Surface;
  flatEnds: number;
  kOverride: number | null;
}

export type DevPt = [number, number];
type Point3 = [number, number, number];

export interface EccentricEnd {
  /** Perimeter-equivalent diameters (C / pi). Offset end curves need not be circles. */
  dInner: number;
  dOuter: number;
  dNeutral: number;
  innerCurvatureMin: number;
}

export interface EccentricResult {
  reference: EccentricInput;
  thickness: number;
  k: number;
  large: EccentricEnd;
  small: EccentricEnd;
  height: number;
  offset: number;
  outline: DevPt[];
  /** Neutral edges before adding flat-end strips, in the same frame as the outline. */
  net: { large: DevPt[]; small: DevPt[] };
  generators: { phi: number; a: DevPt; b: DevPt; length: number }[];
  slantMin: number;
  slantMax: number;
  arcLarge: number;
  arcSmall: number;
  box: { width: number; height: number };
  area: number;
  flatEnd: number;
  alphaMax: number;
  rtMin: number;
  outerStrainMax: number;
  /** Separation of end-plane support lines, not the normal wall thickness. */
  endPlaneThickness: { min: number; max: number };
  /** Numerical target for chord deviation and total developed-edge length error [mm]. */
  tolerance: number;
}

export type EccentricError =
  "thickness" | "dLarge" | "dSmall" | "height" | "offset" | "order" | "tooSmall" | "resolution";

const TAU = 2 * Math.PI;
const TOLERANCE = 0.01;
const INITIAL_STEPS = 720;
const MAX_STEPS = 46080;

interface Geometry {
  r1: number;
  r2: number;
  h: number;
  a: number;
  b: number;
}

function geometry(i: EccentricInput): Geometry {
  return {
    r1: i.dLarge / 2,
    r2: i.dSmall / 2,
    h: i.height,
    a: (i.dLarge - i.dSmall) / (2 * i.height),
    b: i.offset / i.height,
  };
}

/** The outward normal is (sin(phi), cos(phi), q) / w and is constant on each ruling. */
function frame(g: Geometry, phi: number) {
  const sin = Math.sin(phi),
    cos = Math.cos(phi);
  const q = g.a - g.b * cos;
  const w = Math.hypot(1, q);
  const ell = Math.hypot(1, g.a * sin, g.b - g.a * cos);
  return {
    sin,
    cos,
    q,
    w,
    ell,
    nz: q / w,
    nzPrime: (g.b * sin) / w ** 3,
    turn: (g.a * w) / ell ** 2,
    normalTurn: ell / w ** 2,
  };
}

function innerCurvature(g: Geometry, z: number, delta: number, phi: number): number {
  const f = frame(g, phi);
  const radius = g.r1 - g.a * (z - delta * f.nz);
  return (radius * f.w ** 3) / f.ell ** 2 + delta;
}

/** Refine every sampled local minimum, including the limiting generators. */
function minimumCurvature(g: Geometry, z: number, delta: number): number {
  const count = 256,
    step = Math.PI / count;
  const value = (phi: number) => innerCurvature(g, z, delta, phi);
  const values = Array.from({ length: count + 1 }, (_, i) => value(i * step));
  let min = Math.min(...values);
  for (let i = 1; i < count; i++) {
    if (values[i]! > values[i - 1]! || values[i]! > values[i + 1]!) continue;
    let left = (i - 1) * step,
      right = (i + 1) * step;
    for (let j = 0; j < 45; j++) {
      const x = left + (right - left) / 3,
        y = right - (right - left) / 3;
      if (value(x) < value(y)) right = y;
      else left = x;
    }
    min = Math.min(min, value((left + right) / 2));
  }
  return min;
}

interface Sweep {
  large: DevPt[];
  small: DevPt[];
  angles: number[];
  perimeters: number[][];
  area: number;
  valid: boolean;
}

/**
 * Isometric development of the parallel neutral surface. The two end planes stay at z=0 and z=H.
 * theta' rotates the ruling in the plane; base' develops the reference end; shift' develops n'.
 * No apex radius is used, which also keeps nearly cylindrical cones numerically stable.
 */
function sweep(g: Geometry, deltas: number[], steps: number): Sweep {
  const neutral = deltas[1]!;
  const result: Sweep = {
    large: [],
    small: [],
    angles: [],
    perimeters: deltas.map(() => [0, 0]),
    area: 0,
    valid: true,
  };
  let theta = 0;
  const base: DevPt = [0, 0],
    shift: DevPt = [0, 0];
  const evaluate = (phi: number) => {
    const f = frame(g, phi);
    const speeds = deltas.map((delta) =>
      [0, g.h].map((z) => {
        const radius = g.r1 - g.a * (z - delta * f.nz);
        const principal = (radius * f.w ** 3) / f.ell ** 2 + delta;
        if (radius < -1e-8 || principal < -1e-8) result.valid = false;
        const along = (-radius * g.b * f.sin) / f.ell - delta * f.nzPrime * f.ell;
        const across = (radius * f.w) / f.ell + delta * f.normalTurn;
        return Math.hypot(along, across);
      }),
    );
    const area = g.h * (((g.r1 + g.r2) / 2) * f.w + neutral * (g.a * f.q + f.ell ** 2 / f.w ** 2));
    return { ...f, speeds, area };
  };
  const derivative = (f: ReturnType<typeof evaluate>, angle: number) => {
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const along = (-g.r1 * g.b * f.sin) / f.ell,
      across = (g.r1 * f.w) / f.ell;
    return [
      -along * cos - across * sin,
      -along * sin + across * cos,
      -f.normalTurn * sin,
      f.normalTurn * cos,
    ];
  };
  const push = (f: ReturnType<typeof evaluate>) => {
    const at = (z: number): DevPt => {
      const along = (z - neutral * f.nz) * f.ell;
      return [
        base[0] - along * Math.cos(theta) + neutral * shift[0],
        base[1] - along * Math.sin(theta) + neutral * shift[1],
      ];
    };
    result.large.push(at(0));
    result.small.push(at(g.h));
    result.angles.push(theta);
  };
  const h = TAU / steps;
  let start = evaluate(0);
  push(start);
  for (let i = 0; i < steps; i++) {
    const mid = evaluate((i + 0.5) * h),
      end = evaluate((i + 1) * h);
    const quarter = frame(g, (i + 0.25) * h);
    const middleAngle = theta + (h / 12) * (start.turn + 4 * quarter.turn + mid.turn);
    const endAngle = theta + (h / 6) * (start.turn + 4 * mid.turn + end.turn);
    const a = derivative(start, theta),
      b = derivative(mid, middleAngle),
      c = derivative(end, endAngle);
    base[0] += (h / 6) * (a[0]! + 4 * b[0]! + c[0]!);
    base[1] += (h / 6) * (a[1]! + 4 * b[1]! + c[1]!);
    shift[0] += (h / 6) * (a[2]! + 4 * b[2]! + c[2]!);
    shift[1] += (h / 6) * (a[3]! + 4 * b[3]! + c[3]!);
    result.area += (h / 6) * (start.area + 4 * mid.area + end.area);
    deltas.forEach((_, j) =>
      [0, 1].forEach((k) => {
        result.perimeters[j]![k]! +=
          (h / 6) * (start.speeds[j]![k]! + 4 * mid.speeds[j]![k]! + end.speeds[j]![k]!);
      }),
    );
    theta = endAngle;
    push(end);
    start = end;
  }
  return result;
}

function edgeLength(points: DevPt[]): number {
  return points
    .slice(1)
    .reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]), 0);
}

function converged(previous: Sweep, next: Sweep): boolean {
  if (!next.valid || !Number.isFinite(next.area)) return false;
  if (Math.abs(next.area - previous.area) > Math.max(1e-4, Math.abs(next.area) * 1e-10))
    return false;
  for (let j = 0; j < next.perimeters.length; j++)
    for (let i = 0; i < 2; i++)
      if (Math.abs(next.perimeters[j]![i]! - previous.perimeters[j]![i]!) > TOLERANCE / 10)
        return false;
  for (const key of ["large", "small"] as const) {
    const points = next[key];
    for (let i = 0; i < previous[key].length; i++) {
      const old = previous[key][i]!,
        current = points[2 * i]!;
      if (Math.hypot(old[0] - current[0], old[1] - current[1]) > TOLERANCE / 10) return false;
      if (i + 1 < previous[key].length) {
        const mid = points[2 * i + 1]!,
          end = points[2 * i + 2]!;
        if (
          Math.hypot(mid[0] - (current[0] + end[0]) / 2, mid[1] - (current[1] + end[1]) / 2) >
          TOLERANCE
        )
          return false;
      }
    }
  }
  return (
    Math.abs(edgeLength(next.large) - next.perimeters[1]![0]!) <= TOLERANCE &&
    Math.abs(edgeLength(next.small) - next.perimeters[1]![1]!) <= TOLERANCE
  );
}

export function solveEccentric(input: EccentricInput): EccentricResult | EccentricError {
  const { thickness: t, dLarge, dSmall, height: H, offset: e } = input;
  if (!Number.isFinite(t) || !(t > 0)) return "thickness";
  if (!Number.isFinite(dLarge) || !(dLarge > 0)) return "dLarge";
  if (!Number.isFinite(dSmall) || !(dSmall >= 0)) return "dSmall";
  if (!Number.isFinite(H) || !(H > 0)) return "height";
  if (!Number.isFinite(e) || e < 0) return "offset";
  if (!(dLarge > dSmall)) return "order";
  const g = geometry(input),
    depth = surfaceDepth[input.surface];
  const innerDelta = -depth * t;
  const largeMin = minimumCurvature(g, 0, innerDelta),
    smallMin = minimumCurvature(g, H, innerDelta);
  const minRadius = Math.min(largeMin, smallMin);
  if (minRadius < -1e-8) return "tooSmall";
  const k = input.kOverride ?? neutralFactor(Math.max(0, minRadius), t);
  if (!(k > 0 && k <= 1)) return "thickness";
  const deltas = [innerDelta, (k - depth) * t, (1 - depth) * t];
  let steps = INITIAL_STEPS,
    current = sweep(g, deltas, steps);
  if (!current.valid) return "tooSmall";
  while (true) {
    const next = sweep(g, deltas, steps * 2);
    if (!next.valid) return "tooSmall";
    steps *= 2;
    if (converged(current, next)) {
      current = next;
      break;
    }
    if (steps >= MAX_STEPS) return "resolution";
    current = next;
  }
  const total = current.angles[steps]!;
  if (!(total > 0 && total < TAU)) return "tooSmall";
  const f = Math.max(0, input.flatEnds),
    outer = current.large,
    inner = current.small;
  const shift = (p: DevPt, angle: number, sign: number): DevPt => [
    p[0] - sign * f * Math.sin(angle),
    p[1] + sign * f * Math.cos(angle),
  ];
  const ring: DevPt[] = [];
  if (f > 0) ring.push(shift(inner[0]!, 0, -1), shift(outer[0]!, 0, -1));
  ring.push(...outer);
  if (f > 0) ring.push(shift(outer[steps]!, total, 1), shift(inner[steps]!, total, 1));
  ring.push(...inner.slice().reverse());
  const turn = Math.PI / 2 - total / 2,
    c = Math.cos(turn),
    sn = Math.sin(turn);
  const rotate = ([x, y]: DevPt): DevPt => [x * c - y * sn, x * sn + y * c];
  const rotated = ring.map(rotate);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of rotated) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const place = (p: DevPt): DevPt => {
    const [x, y] = rotate(p);
    return [x - minX, y - minY];
  };
  const net = { large: outer.map(place), small: inner.map(place) };
  const generators = Array.from({ length: 13 }, (_, j) => {
    const i = (j * steps) / 12,
      phi = (j * TAU) / 12;
    return { phi, a: net.large[i]!, b: net.small[i]!, length: H * frame(g, phi).ell };
  });
  const slantMin = Math.hypot(H, (dLarge - dSmall) / 2 - e);
  const slantMax = Math.hypot(H, (dLarge - dSmall) / 2 + e);
  const end = (j: number, radius: number): EccentricEnd => ({
    dInner: current.perimeters[0]![j]! / Math.PI,
    dNeutral: current.perimeters[1]![j]! / Math.PI,
    dOuter: current.perimeters[2]![j]! / Math.PI,
    innerCurvatureMin: radius,
  });
  return {
    reference: { ...input },
    thickness: t,
    k,
    large: end(0, largeMin),
    small: end(1, smallMin),
    height: H,
    offset: e,
    outline: rotated.map(([x, y]) => [x - minX, y - minY]),
    net,
    generators,
    slantMin,
    slantMax,
    arcLarge: current.perimeters[1]![0]!,
    arcSmall: current.perimeters[1]![1]!,
    box: { width: maxX - minX, height: maxY - minY },
    area: current.area + 2 * f * slantMin,
    flatEnd: f,
    alphaMax: Math.acos(H / slantMax),
    rtMin: Math.max(0, minRadius) / t,
    outerStrainMax: t / (2 * Math.max(0, minRadius) + t),
    endPlaneThickness: {
      min: t * Math.hypot(1, Math.max(0, g.a - g.b)),
      max: t * Math.hypot(1, g.a + g.b),
    },
    tolerance: TOLERANCE,
  };
}

/** Parallel wall surface, trimmed by the physical end planes (u=0 and u=1). */
export function eccentricPoint(
  r: EccentricResult,
  phi: number,
  u: number,
  surface: Surface | "neutral" = "neutral",
): Point3 {
  const g = geometry(r.reference),
    f = frame(g, phi);
  const depth = surface === "neutral" ? r.k : surfaceDepth[surface];
  const delta = (depth - surfaceDepth[r.reference.surface]) * r.thickness;
  const z = u * r.height,
    referenceZ = z - delta * f.nz;
  const radius = g.r1 - g.a * referenceZ;
  return [
    radius * f.sin + (delta * f.sin) / f.w,
    g.b * referenceZ + radius * f.cos + (delta * f.cos) / f.w,
    z,
  ];
}
