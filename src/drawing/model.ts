/** Renderer-independent 2D drawing, in model millimetres with y pointing up. */

export type Pt = readonly [number, number];
export type Stroke = "part" | "thin" | "center";

export type Prim =
  | { kind: "path"; pts: Pt[]; closed: boolean; stroke: Stroke; fill?: boolean }
  | {
      kind: "dim";
      /** Feature points the dimension measures between. */
      a: Pt;
      b: Pt;
      /** Offset of the dimension line along the left normal of a→b: model mm plus font-size multiples. */
      offsetModel: number;
      offsetScreen: number;
      label: string;
    };

export interface View {
  title: string;
  prims: Prim[];
  /** Extra lines printed under the view (radii, angles). */
  notes: string[];
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
    if (p.kind === "path") p.pts.forEach(add);
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
