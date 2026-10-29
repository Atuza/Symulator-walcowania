/** Renderer-independent 2D drawing, in model millimetres with y pointing up. */

export type Pt = readonly [number, number];
export type Stroke = "part" | "thin" | "center" | "flat";

/** Editable geometric measures; inverse edits use explicit, previewed geometry drivers. */
export type DimensionId =
  | "a"
  | "b"
  | "r"
  | "angle"
  | "height"
  | "offset"
  | "width"
  | "thickness"
  | "dLarge"
  | "dSmall"
  | "diameter.inner"
  | "diameter.outer"
  | "radius.inner"
  | "radius.outer"
  | "flatEnd"
  | "profile.blankLength"
  | "cylinder.circumference"
  | "cylinder.blankLength"
  | "cylinder.ringLength"
  | "extent.x"
  | "extent.y"
  | "ellipse.min"
  | "ellipse.max"
  | "cone.r1"
  | "cone.r2"
  | "cone.sector"
  | "cone.slant"
  | "cone.radius.large"
  | "cone.radius.small"
  | "cone.circumference.large"
  | "cone.circumference.small"
  | "cone.slant.short"
  | "cone.slant.long"
  | "cone.arc.large"
  | "cone.arc.small"
  | "cone.box.width"
  | "cone.box.height"
  | `segment.${number}.size`
  | `segment.${number}.developed`
  | `segment.${number}.diameter`
  | `segment.${number}.angle`;

export interface Annotation {
  text: string;
  edit?: DimensionId;
}

export interface DimensionLabel {
  label: string;
  edit?: DimensionId;
}

export type Prim =
  | { kind: "path"; pts: Pt[]; closed: boolean; stroke: Stroke; fill?: boolean }
  | { kind: "tag"; at: Pt; direction: Pt; label: string; edit: DimensionId; row?: number }
  | {
      /** Length along a numerically developed edge, not the chord between its ends. */
      kind: "curveDim";
      pts: Pt[];
      /** Offset along the curve's left model-space normal, in font-size multiples. */
      offsetScreen: number;
      label: string;
      edit?: DimensionId;
      extra?: DimensionLabel[];
    }
  | {
      /** Arc length or angle dimension around centre c, from angle a0 to a1 (radians, CCW). */
      kind: "arcDim";
      c: Pt;
      /** Radius of the measured feature. */
      r: number;
      a0: number;
      a1: number;
      /** Radial offset of the dimension arc, in font-size multiples (positive = outwards). */
      offsetScreen: number;
      label: string;
      edit?: DimensionId;
      extra?: DimensionLabel[];
    }
  | {
      kind: "dim";
      /** Feature points the dimension measures between. */
      a: Pt;
      b: Pt;
      /** Offset of the dimension line along the left normal of a→b: model mm plus font-size multiples. */
      offsetModel: number;
      offsetScreen: number;
      label: string;
      edit?: DimensionId;
      extra?: DimensionLabel[];
      /** Caption for the compact fallback when a chain of dimensions cannot fit. */
      chain?: string;
    };

export interface View {
  title: string;
  prims: Prim[];
  /** Extra lines printed under the view (radii, angles). */
  notes: (string | Annotation)[];
}

export function arc(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  segments?: number,
): Pt[] {
  const n = segments ?? Math.max(8, Math.ceil((Math.abs(a1 - a0) / (2 * Math.PI)) * 160));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

export function circle(cx: number, cy: number, r: number): Pt[] {
  return arc(cx, cy, r, 0, 2 * Math.PI, 160).slice(0, -1);
}

export function bounds(view: View) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const add = ([x, y]: Pt) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const p of view.prims) {
    if (p.kind === "path" || p.kind === "curveDim") p.pts.forEach(add);
    else if (p.kind === "tag") add(p.at);
    else if (p.kind === "arcDim") arc(p.c[0], p.c[1], p.r, p.a0, p.a1, 32).forEach(add);
    else {
      add(p.a);
      add(p.b);
      // Model-space offsets move the dimension line outside the part; include them in the fit.
      const dx = p.b[0] - p.a[0],
        dy = p.b[1] - p.a[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * p.offsetModel,
        ny = (dx / len) * p.offsetModel;
      add([p.a[0] + nx, p.a[1] + ny]);
      add([p.b[0] + nx, p.b[1] + ny]);
    }
  }
  return { minX, minY, maxX, maxY };
}
