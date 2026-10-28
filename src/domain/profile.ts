import { neutralFactor } from "./neutralAxis";

/*
 * Cross-section as a chain of straight and circular segments, walked along the plate from its first
 * edge (the seam on closed shapes). Every shape the calculator rolls is built from these, so the blank
 * length, the bend lines and the drawings all come from one model.
 *
 * Straight segments keep their length on every fibre. An arc is given by its radius on the inner
 * (concave) surface and its turning angle; positive angles turn left, negative right.
 */

export type Segment =
  { kind: "line"; length: number } | { kind: "arc"; radius: number; angle: number };

export interface Profile {
  segments: Segment[];
  thickness: number;
  /** Fixed neutral-fibre factor for every arc; null picks it per arc from its R/t. */
  kOverride: number | null;
}

export interface DevelopedSegment {
  segment: Segment;
  /** Distance from the first edge of the blank to the segment's start [mm]. */
  start: number;
  /** Length on the neutral fibre [mm]. */
  length: number;
  /** Neutral-fibre factor of an arc; null for straight segments. */
  k: number | null;
}

export interface Development {
  /** Blank length on the neutral fibre [mm]. */
  length: number;
  segments: DevelopedSegment[];
  /** Positions along the blank where bending starts or stops, without duplicates [mm]. */
  bendLines: number[];
  /** Smallest inner radius / thickness among the arcs; null when there are none. */
  minRt: number | null;
}

export type ProfileError = "thickness" | "segment";

export function develop(profile: Profile): Development | ProfileError {
  const t = profile.thickness;
  if (!(t > 0)) return "thickness";
  const out: DevelopedSegment[] = [];
  const lines: number[] = [];
  let pos = 0;
  let minRt: number | null = null;
  const mark = (x: number) => {
    if (lines.length === 0 || Math.abs(lines[lines.length - 1]! - x) > 1e-9) lines.push(x);
  };
  for (const s of profile.segments) {
    if (s.kind === "line") {
      if (!(s.length >= 0)) return "segment";
      out.push({ segment: s, start: pos, length: s.length, k: null });
      pos += s.length;
      continue;
    }
    if (!(s.radius > 0) || !Number.isFinite(s.angle)) return "segment";
    const k = profile.kOverride ?? neutralFactor(s.radius, t);
    const length = (s.radius + k * t) * Math.abs(s.angle);
    mark(pos);
    out.push({ segment: s, start: pos, length, k });
    pos += length;
    mark(pos);
    const rt = s.radius / t;
    minRt = minRt === null ? rt : Math.min(minRt, rt);
  }
  // Bending that runs into either edge of the blank has no line there to mark.
  const bendLines = lines.filter((x) => x > 1e-9 && x < pos - 1e-9);
  return { length: pos, segments: out, bendLines, minRt };
}

export type Pt = [number, number];

/**
 * Points of one fibre of the profile, starting at the origin heading along +x. `depth` is the share
 * of the thickness measured from the plate's left surface (the inner surface of left turns) to the
 * right: 0 is the left surface, 1 the right one. Arcs are split so no chord turns more than `step`.
 */
export function traceProfile(profile: Profile, depth: number, step = Math.PI / 90): Pt[] {
  const t = profile.thickness;
  const offset = depth * t;
  let x = 0,
    y = 0,
    heading = 0;
  const pts: Pt[] = [];
  const push = (px: number, py: number, h: number) =>
    pts.push([px + Math.sin(h) * offset, py - Math.cos(h) * offset]);
  push(x, y, heading);
  for (const s of profile.segments) {
    if (s.kind === "line") {
      x += Math.cos(heading) * s.length;
      y += Math.sin(heading) * s.length;
      push(x, y, heading);
      continue;
    }
    const dir = Math.sign(s.angle) || 1;
    // The reference path is the left surface: inner on a left turn, outer (radius + t) on a right one.
    const r = dir > 0 ? s.radius : s.radius + t;
    const cx = x - Math.sin(heading) * r * dir;
    const cy = y + Math.cos(heading) * r * dir;
    const n = Math.max(1, Math.ceil(Math.abs(s.angle) / step));
    const a0 = heading - (dir * Math.PI) / 2;
    for (let i = 1; i <= n; i++) {
      const a = a0 + (s.angle * i) / n;
      const h = heading + (s.angle * i) / n;
      push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, h);
    }
    x = cx + Math.cos(a0 + s.angle) * r;
    y = cy + Math.sin(a0 + s.angle) * r;
    heading += s.angle;
  }
  return pts;
}

/** Total turning angle [rad]; ±2π for a closed shape walked once around. */
export function totalTurn(profile: Profile): number {
  return profile.segments.reduce((sum, s) => sum + (s.kind === "arc" ? s.angle : 0), 0);
}

/**
 * The plate part-way through the rolls, walked from its free (not yet rolled) end: a straight tail
 * up to the pinch, then the formed part in reverse order. The leading edge entered first, so the
 * material next to the pinch is the latest formed. Walking backwards flips every turn's direction.
 */
export function partlyRolled(profile: Profile, dev: Development, rolled: number): Profile {
  const done = Math.min(dev.length, Math.max(0, rolled));
  const formed: Segment[] = [];
  for (const d of dev.segments) {
    if (d.start >= done) break;
    const share = Math.min(1, (done - d.start) / (d.length || 1));
    const s = d.segment;
    formed.push(
      s.kind === "line"
        ? { kind: "line", length: s.length * share }
        : { kind: "arc", radius: s.radius, angle: s.angle * share },
    );
  }
  const reversed = formed
    .reverse()
    .map((s): Segment => (s.kind === "arc" ? { ...s, angle: -s.angle } : s));
  return {
    ...profile,
    segments: [{ kind: "line", length: dev.length - done }, ...reversed],
  };
}
