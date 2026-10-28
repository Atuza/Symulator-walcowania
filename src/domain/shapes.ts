import { develop, traceProfile, type Development, type Profile, type Segment } from "./profile";
import { surfaceDepth, type Surface } from "./types";
import { profileGeometry } from "./editableProfile";

/*
 * Shapes built from straight and circular segments. All dimensions are measured on the chosen surface
 * (like the inner/mid/outer reference of the cylinder); radii in the profile are inner bend radii.
 * Closed shapes start and end at the seam.
 */

export type ProfileShape =
  "halfround" | "ushape" | "obround" | "rect" | "tank" | "bucket" | "ellipse" | "free";

export const PROFILE_SHAPES: ProfileShape[] = [
  "halfround",
  "ushape",
  "obround",
  "rect",
  "tank",
  "bucket",
  "ellipse",
  "free",
];

/** One entry of a free shape: a straight, or an arc with its radius on the chosen surface. */
export type FreeSegment =
  { kind: "line"; length: number } | { kind: "arc"; radius: number; angle: number };

export interface ShapeInput {
  shape: ProfileShape;
  thickness: number;
  surface: Surface;
  /** Main size: width, length or overall size, depending on the shape [mm]. */
  a: number;
  /** Second size [mm]. */
  b: number;
  /** Radius on the chosen surface [mm]. */
  r: number;
  /** Bend angle [rad]. */
  angle: number;
  /** Segments of the free shape, in plate order. */
  free?: FreeSegment[];
  /** Independent feature dimensions, overriding the preset while preserving its selected tile. */
  override?: FreeSegment[];
  overrideClosed?: boolean;
  flatEnds: number;
  kOverride: number | null;
}

/** Which inputs a shape uses, in display order. */
export const SHAPE_FIELDS: Record<ProfileShape, ("a" | "b" | "r" | "angle")[]> = {
  halfround: ["r", "angle"],
  ushape: ["a", "b"],
  obround: ["a", "b"],
  rect: ["a", "b", "r"],
  tank: ["a", "b", "r"],
  bucket: ["a", "r", "angle", "b"],
  ellipse: ["a", "b"],
  free: [],
};

export interface ShapeResult {
  shape: ProfileShape;
  custom: boolean;
  profile: Profile;
  closed: boolean;
  dev: Development;
  /** Blank length on the neutral fibre, flat ends included [mm]. */
  blankLength: number;
  /** Neutral-fibre factor of the tightest bend. */
  k: number;
  /** Inner radius / thickness of the tightest bend. */
  rtMin: number;
  /** Outer-fibre strain of the tightest bend. */
  outerStrainMax: number;
  /** Distinct inner bend radii, smallest first [mm]. */
  radii: number[];
  /** Unbent allowance at each end, included in the blank length [mm]. */
  flatEnd: number;
  /** Largest tank radius when the shape has one; reported because it is derived [mm]. */
  derivedR: number | null;
  /** Overall width and height on the chosen surface when they are inputs, for exact labels [mm]. */
  sizes: [number, number] | null;
}

export type ShapeError = "thickness" | "a" | "b" | "r" | "angle" | "segments" | "closure";

export function buildShape(input: ShapeInput): ShapeResult | ShapeError {
  const t = input.thickness;
  if (!(t > 0)) return "thickness";
  // A size across the part loses the thickness twice on the way to the inner surface, a radius once.
  const depth = surfaceDepth[input.surface];
  const across = (v: number) => v - 2 * depth * t;
  const radius = (v: number) => v - depth * t;
  const line = (length: number): Segment => ({ kind: "line", length });
  const bend = (r: number, angle: number): Segment => ({ kind: "arc", radius: r, angle });
  const positive = (v: number) => Number.isFinite(v) && v > 0;

  let segments: Segment[];
  let closed = true;
  let derivedR: number | null = null;
  if (input.override) {
    if (!input.override.some((s) => s.kind === "arc")) return "segments";
    segments = [];
    for (const s of input.override) {
      if (s.kind === "line") {
        if (!Number.isFinite(s.length) || s.length < 0) return "segments";
        segments.push(line(s.length));
      } else {
        const r = radius(s.radius);
        if (
          !(r > 0) ||
          !Number.isFinite(s.angle) ||
          Math.abs(s.angle) < 1e-9 ||
          Math.abs(s.angle) > 2 * Math.PI + 1e-8
        )
          return "segments";
        segments.push(bend(r, s.angle));
      }
    }
    closed = input.overrideClosed ?? false;
    if (closed) {
      const g = profileGeometry(input.override, t, depth);
      if (Math.hypot(...g.end) > 0.01 || Math.abs(Math.abs(g.turn) - 2 * Math.PI) > 1e-7)
        return "closure";
    }
  } else
    switch (input.shape) {
      case "halfround": {
        if (!positive(input.r)) return "r";
        if (!positive(input.angle) || input.angle >= 2 * Math.PI) return "angle";
        const r = radius(input.r);
        if (!(r > 0)) return "r";
        segments = [bend(r, input.angle)];
        closed = false;
        break;
      }
      case "ushape": {
        // a: width across the legs, b: straight leg length; the bottom is a half circle.
        if (!positive(input.a)) return "a";
        if (!(input.b >= 0)) return "b";
        const r = across(input.a) / 2;
        if (!(r > 0)) return "a";
        segments = [line(input.b), bend(r, Math.PI), line(input.b)];
        closed = false;
        break;
      }
      case "obround": {
        // a: overall length, b: width; two half circles joined by straights. Seam mid-straight.
        if (!positive(input.b)) return "b";
        if (!positive(input.a) || input.a < input.b) return "a";
        const r = across(input.b) / 2;
        if (!(r > 0)) return "b";
        const s = input.a - input.b;
        segments = [line(s / 2), bend(r, Math.PI), line(s), bend(r, Math.PI), line(s / 2)];
        break;
      }
      case "rect": {
        // a × b with corner radius r. Seam in the middle of an a side.
        if (!positive(input.a)) return "a";
        if (!positive(input.b)) return "b";
        if (!positive(input.r)) return "r";
        const r = radius(input.r);
        let sa = across(input.a) - 2 * r;
        let sb = across(input.b) - 2 * r;
        if (!(r > 0)) return "r";
        if (sa < -1e-9) return "a";
        if (sb < -1e-9) return "b";
        // A side exactly 2 r long has no straight left; rounding must not make it negative.
        sa = Math.max(0, sa);
        sb = Math.max(0, sb);
        const q = Math.PI / 2;
        segments = [
          line(sa / 2),
          bend(r, q),
          line(sb),
          bend(r, q),
          line(sa),
          bend(r, q),
          line(sb),
          bend(r, q),
          line(sa / 2),
        ];
        break;
      }
      case "tank": {
        // Four-arc oval: width a, height b, side radius r; top and bottom radius R follows from
        // tangency, (a/2 − r)² + (R − b/2)² = (R − r)². Seam at the middle of the bottom.
        if (!positive(input.a)) return "a";
        if (!positive(input.b) || input.b >= input.a) return "b";
        if (!positive(input.r)) return "r";
        const A = across(input.a),
          B = across(input.b),
          r = radius(input.r);
        if (!(r > 0) || 2 * r >= B) return "r";
        const R = ((A / 2 - r) ** 2 + (B / 2) ** 2 - r ** 2) / (B - 2 * r);
        if (!(R > B / 2)) return "r";
        // Half-angle of each side arc, measured from the horizontal.
        const beta = Math.atan2(R - B / 2, A / 2 - r);
        const big = Math.PI - 2 * beta;
        segments = [
          bend(R, big / 2),
          bend(r, 2 * beta),
          bend(R, big),
          bend(r, 2 * beta),
          bend(R, big / 2),
        ];
        derivedR = R + depth * t;
        break;
      }
      case "bucket": {
        // Wrapper plate: straight back a, bend radius r through the angle, straight bottom b.
        if (!(input.a >= 0)) return "a";
        if (!(input.b >= 0)) return "b";
        if (!positive(input.r)) return "r";
        if (!positive(input.angle) || input.angle >= 2 * Math.PI) return "angle";
        const r = radius(input.r);
        if (!(r > 0)) return "r";
        segments = [line(input.a), bend(r, input.angle), line(input.b)];
        closed = false;
        break;
      }
      case "ellipse": {
        // a: width, b: height. Seam at the middle of the bottom, as for the tank.
        if (!positive(input.a)) return "a";
        if (!positive(input.b)) return "b";
        const A = across(input.a) / 2,
          B = across(input.b) / 2;
        if (!(A > 0)) return "a";
        if (!(B > 0)) return "b";
        segments = ellipseArcs(A, B);
        break;
      }
      case "free": {
        const list = input.free ?? [];
        if (!list.some((x) => x.kind === "arc")) return "segments";
        segments = [];
        for (const x of list) {
          if (x.kind === "line") {
            if (!(x.length > 0)) return "segments";
            segments.push(line(x.length));
            continue;
          }
          const r = radius(x.radius);
          if (!(r > 0) || !Number.isFinite(x.angle) || x.angle === 0) return "segments";
          segments.push(bend(r, x.angle));
        }
        // Closed when it turns once around and its ends meet; otherwise an open plate.
        const turn = segments.reduce((sum, x) => sum + (x.kind === "arc" ? x.angle : 0), 0);
        if (Math.abs(Math.abs(turn) - 2 * Math.PI) < 1e-6) {
          const pts = traceProfile({ segments, thickness: t, kOverride: null }, 0);
          const [x0, y0] = pts[0]!;
          const [x1, y1] = pts[pts.length - 1]!;
          closed = Math.hypot(x1 - x0, y1 - y0) < 0.5;
        } else closed = false;
        break;
      }
    }

  const flat = Math.max(0, input.flatEnds);
  if (flat > 0) segments = [line(flat), ...segments, line(flat)];
  const profile: Profile = { segments, thickness: t, kOverride: input.kOverride };
  const dev = develop(profile);
  if (typeof dev === "string") return dev === "thickness" ? "thickness" : "r";
  const arcs = dev.segments.filter((d) => d.segment.kind === "arc");
  const tightest = arcs.reduce((m, d) => (radiusOf(d.segment) < radiusOf(m.segment) ? d : m));
  let rMin = radiusOf(tightest.segment);
  let radii = [...new Set(arcs.map((d) => Math.round(radiusOf(d.segment) * 1e6) / 1e6))].sort(
    (x, y) => x - y,
  );
  if (input.shape === "ellipse" && !input.override) {
    // The arcs only approximate the varying curvature; report the ellipse's true extremes, and no
    // bend lines inside the blank, since the curvature changes continuously.
    const A = across(input.a) / 2,
      B = across(input.b) / 2;
    radii = [Math.min(A, B) ** 2 / Math.max(A, B), Math.max(A, B) ** 2 / Math.min(A, B)];
    rMin = radii[0]!;
    dev.bendLines = flat > 0 ? [flat, dev.length - flat] : [];
  }
  return {
    shape: input.shape,
    custom: !!input.override,
    profile,
    closed,
    dev,
    blankLength: dev.length,
    k: tightest.k!,
    rtMin: rMin / t,
    outerStrainMax: t / (2 * rMin + t),
    radii,
    flatEnd: flat,
    derivedR,
    sizes: input.shape === "ellipse" && !input.override ? [input.a, input.b] : null,
  };
}

/** Pieces per quarter of the ellipse; each turns 90° / ELLIPSE_STEPS. */
// 64 keeps the drawn outline within about 0.15 mm of the true ellipse at 2.4 m.
const ELLIPSE_STEPS = 64;

/**
 * Ellipse with semi-axes a (x) and b (y) as circular arcs of equal turning angle, walked from the
 * bottom middle. Each arc has the exact inner-surface length of its piece of the ellipse, so the
 * perimeter is exact; its radius is that length over the turning angle.
 */
export function ellipseArcs(a: number, b: number): Segment[] {
  // Point on the ellipse whose outward normal points at angle psi, as the parameter angle.
  // The outward normal at parameter θ is along (b·cos θ, a·sin θ).
  const theta = (psi: number) => Math.atan2(b * Math.sin(psi), a * Math.cos(psi));
  const speed = (th: number) => Math.hypot(a * Math.sin(th), b * Math.cos(th));
  const arcLength = (t0: number, t1: number) => {
    // Simpson's rule; the integrand is smooth, 32 panels give far below 1 µm.
    const n = 32;
    const h = (t1 - t0) / n;
    let sum = speed(t0) + speed(t1);
    for (let i = 1; i < n; i++) sum += speed(t0 + i * h) * (i % 2 ? 4 : 2);
    return (sum * h) / 3;
  };
  const step = Math.PI / 2 / ELLIPSE_STEPS;
  const out: Segment[] = [];
  // Normal angle runs from straight down (−π/2) once around.
  for (let i = 0; i < 4 * ELLIPSE_STEPS; i++) {
    const p0 = -Math.PI / 2 + i * step;
    let t0 = theta(p0),
      t1 = theta(p0 + step);
    if (t1 < t0) t1 += 2 * Math.PI;
    if (t1 - t0 > Math.PI) t0 += 2 * Math.PI;
    const len = arcLength(t0, t1);
    out.push({ kind: "arc", radius: len / step, angle: step });
  }
  return out;
}

function radiusOf(s: Segment): number {
  return s.kind === "arc" ? s.radius : Infinity;
}
