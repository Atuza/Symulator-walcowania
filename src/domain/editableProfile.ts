import type { FreeSegment, ProfileShape } from "./shapes";
import type { Profile } from "./profile";

export const profileTurn: Record<ProfileShape, number> = {
  halfround: -Math.PI / 2,
  ushape: -Math.PI / 2,
  obround: 0,
  rect: 0,
  tank: 0,
  bucket: Math.PI / 2,
  ellipse: 0,
  free: 0,
};

export type P2 = [number, number];
export interface Feature {
  index: number;
  start: P2;
  end: P2;
  middle: P2;
  heading: number;
  centre?: P2;
}

/** Exact straight/arc geometry, including extrema between the sampled drawing vertices. */
export function profileGeometry(
  segments: FreeSegment[],
  thickness: number,
  depth: number,
  rotation = 0,
) {
  let x = 0,
    y = 0,
    heading = 0;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  const c = Math.cos(rotation),
    s = Math.sin(rotation);
  const rot = (x: number, y: number): P2 => [x * c - y * s, x * s + y * c];
  const point = (x: number, y: number): P2 => {
    const p = rot(x, y);
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
    return p;
  };
  const features: Feature[] = [];
  for (const [index, seg] of segments.entries()) {
    const start = point(
      x + Math.sin(heading) * depth * thickness,
      y - Math.cos(heading) * depth * thickness,
    );
    if (seg.kind === "line") {
      x += Math.cos(heading) * seg.length;
      y += Math.sin(heading) * seg.length;
      const end = point(
        x + Math.sin(heading) * depth * thickness,
        y - Math.cos(heading) * depth * thickness,
      );
      features.push({
        index,
        start,
        end,
        middle: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
        heading: heading + rotation,
      });
      continue;
    }
    const dir = Math.sign(seg.angle) || 1;
    const ri = seg.radius - depth * thickness;
    const left = ri + (dir < 0 ? thickness : 0);
    const cx = x - Math.sin(heading) * left * dir,
      cy = y + Math.cos(heading) * left * dir;
    const a0 = heading - (dir * Math.PI) / 2,
      a1 = a0 + seg.angle;
    const referenceRadius = left + dir * depth * thickness;
    const at = (a: number) =>
      point(cx + referenceRadius * Math.cos(a), cy + referenceRadius * Math.sin(a));
    const between = (a: number) => {
      const delta = (((dir * (a - a0)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return delta <= Math.abs(seg.angle) + 1e-10 || Math.abs(seg.angle) >= 2 * Math.PI;
    };
    for (let j = 0; j < 4; j++) {
      const a = (j * Math.PI) / 2 - rotation;
      if (between(a)) at(a);
    }
    const middle = at((a0 + a1) / 2),
      end = at(a1);
    features.push({ index, start, end, middle, heading: heading + rotation, centre: rot(cx, cy) });
    x = cx + left * Math.cos(a1);
    y = cy + left * Math.sin(a1);
    heading += seg.angle;
  }
  return {
    end: rot(x, y),
    turn: heading,
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    features,
  };
}

export function referenceSegments(profile: Profile, depth: number, flatEnd = 0): FreeSegment[] {
  const parts = profile.segments.slice(flatEnd > 0 ? 1 : 0, flatEnd > 0 ? -1 : undefined);
  return parts.map((s) =>
    s.kind === "line" ? { ...s } : { ...s, radius: s.radius + depth * profile.thickness },
  );
}

export function withFlatEnds(segments: FreeSegment[], flatEnd = 0): FreeSegment[] {
  return flatEnd > 0
    ? [{ kind: "line", length: flatEnd }, ...segments, { kind: "line", length: flatEnd }]
    : segments;
}

/** Moore-Penrose solve for a small positive semidefinite matrix, including dependent constraints. */
function pseudoSolve(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length,
    a = matrix.map((r) => r.slice());
  const v = Array.from(
    { length: n },
    (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)) as number[],
  );
  for (let step = 0; step < 80; step++) {
    let p = 0,
      q = 0,
      max = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.abs(a[i]![j]!) > max) {
          max = Math.abs(a[i]![j]!);
          p = i;
          q = j;
        }
    if (max < Math.max(1e-18, ...a.map((r, i) => Math.abs(r[i]!))) * 1e-13) break;
    const theta = 0.5 * Math.atan2(2 * a[p]![q]!, a[q]![q]! - a[p]![p]!);
    const c = Math.cos(theta),
      s = Math.sin(theta);
    for (let k = 0; k < n; k++) {
      const ap = a[k]![p]!,
        aq = a[k]![q]!;
      a[k]![p] = c * ap - s * aq;
      a[k]![q] = s * ap + c * aq;
    }
    for (let k = 0; k < n; k++) {
      const ap = a[p]![k]!,
        aq = a[q]![k]!;
      a[p]![k] = c * ap - s * aq;
      a[q]![k] = s * ap + c * aq;
    }
    for (let k = 0; k < n; k++) {
      const vp = v[k]![p]!,
        vq = v[k]![q]!;
      v[k]![p] = c * vp - s * vq;
      v[k]![q] = s * vp + c * vq;
    }
  }
  const limit = Math.max(...a.map((r, i) => Math.abs(r[i]!)), 1e-18) * 1e-10;
  const out = Array(n).fill(0) as number[];
  for (let j = 0; j < n; j++)
    if (a[j]![j]! > limit) {
      const dot = rhs.reduce((sum, r, i) => sum + v[i]![j]! * r, 0) / a[j]![j]!;
      for (let i = 0; i < n; i++) out[i]! += v[i]![j]! * dot;
    }
  return out;
}

export interface FitOptions {
  thickness: number;
  depth: number;
  rotation: number;
  closed: boolean;
  turn?: number;
  flatEnd?: number;
  fixed?: { index: number; property: "size" | "angle" };
  extent?: { axis: "x" | "y"; value: number; other: number };
}

/**
 * Keep an edited driver fixed. Balance a neighbouring turn, then fit the remaining straight
 * lengths (and only when necessary radii) to close the contour. Tangency is inherent in the chain.
 */
export function fitProfile(source: FreeSegment[], options: FitOptions): FreeSegment[] | null {
  const base = source.map((s) => ({ ...s }));
  const { thickness, depth, rotation, closed, fixed, extent } = options;
  if (closed) {
    const turn = base.reduce((sum, s) => sum + (s.kind === "arc" ? s.angle : 0), 0);
    const target = Math.sign((options.turn ?? turn) || 1) * 2 * Math.PI;
    const delta = target - turn;
    if (Math.abs(delta) > 1e-10) {
      const start = fixed?.index ?? 0;
      let balanced = false;
      for (let k = 1; k <= base.length; k++) {
        const index = (start + k) % base.length,
          s = base[index]!;
        if (s.kind !== "arc" || (fixed?.index === index && fixed.property === "angle")) continue;
        const angle = s.angle + delta;
        if (
          Math.sign(angle) === Math.sign(s.angle) &&
          Math.abs(angle) > 1e-5 &&
          Math.abs(angle) < 2 * Math.PI + 1e-9
        ) {
          s.angle = angle;
          balanced = true;
          break;
        }
      }
      if (!balanced) return null;
    }
  }
  const norm = (v: number[]) => Math.hypot(...v);
  for (const holdOther of extent ? [true, false] : [false])
    for (const includeRadii of [false, true]) {
      const parts = base.map((s) => ({ ...s }));
      const vars = parts.flatMap((s, index) =>
        (fixed?.index === index && fixed.property === "size") || (s.kind === "arc" && !includeRadii)
          ? []
          : [
              {
                index,
                scale: Math.max(s.kind === "line" ? s.length : s.radius, thickness, 1),
                min: s.kind === "line" ? 0 : depth * thickness + 1e-6,
              },
            ],
      );
      const get = (index: number) => {
        const s = parts[index]!;
        return s.kind === "line" ? s.length : s.radius;
      };
      const set = (index: number, value: number) => {
        const s = parts[index]!;
        if (s.kind === "line") s.length = value;
        else s.radius = value;
      };
      const residual = () => {
        const g = profileGeometry(parts, thickness, depth, rotation),
          r = closed ? [...g.end] : [];
        if (extent) {
          const envelope = options.flatEnd
            ? profileGeometry(withFlatEnds(parts, options.flatEnd), thickness, depth, rotation)
            : g;
          r.push((extent.axis === "x" ? envelope.width : envelope.height) - extent.value);
          if (holdOther)
            r.push((extent.axis === "x" ? envelope.height : envelope.width) - extent.other);
        }
        return r;
      };
      for (let iteration = 0; iteration < 45; iteration++) {
        const r = residual();
        if (norm(r) < 1e-5) return parts;
        if (!vars.length) break;
        const columns = vars.map((v) => {
          const x = get(v.index),
            h = Math.max(1e-5, Math.abs(x) * 1e-6);
          set(v.index, x + h);
          const plus = residual();
          set(v.index, x);
          return plus.map((y, i) => ((y - r[i]!) / h) * v.scale);
        });
        const matrix = r.map((_, i) =>
          r.map((_, j) => columns.reduce((sum, col) => sum + col[i]! * col[j]!, 0)),
        );
        const lambda = pseudoSolve(
          matrix,
          r.map((x) => -x),
        );
        const changes = columns.map(
          (col, j) => col.reduce((sum, c, i) => sum + c * lambda[i]!, 0) * vars[j]!.scale,
        );
        const values = vars.map((v) => get(v.index));
        let accepted = false;
        for (let step = 1; step > 1e-5; step /= 2) {
          vars.forEach((v, j) => set(v.index, Math.max(v.min, values[j]! + step * changes[j]!)));
          if (norm(residual()) < norm(r) * (1 - 1e-7)) {
            accepted = true;
            break;
          }
        }
        if (!accepted) break;
      }
    }
  return null;
}
