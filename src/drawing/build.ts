import type { CalcOutput } from "../domain/calculate";
import { num, t } from "../i18n";
import { surfaceDepth, type Surface } from "../domain/types";
import { arc, circle, type Prim, type View } from "./model";

// Dimension offset from the part, in multiples of the renderer font size.
const GAP = 1.8;

const mm = (v: number) => num(v);

/** Section and development views for the current result. */
export function buildViews(out: CalcOutput, width: number | null, surface: Surface): View[] {
  return out.shape === "cylinder" ? cylinderViews(out, width) : coneViews(out, surface);
}

function cylinderViews(
  out: Extract<CalcOutput, { shape: "cylinder" }>,
  width: number | null,
): View[] {
  const r = out.result;
  const ro = r.dOuter / 2,
    ri = r.dInner / 2,
    rn = r.dNeutral / 2;
  const section: Prim[] = [
    { kind: "path", pts: circle(0, 0, ro), closed: true, stroke: "part" },
    { kind: "path", pts: circle(0, 0, ri), closed: true, stroke: "part" },
    { kind: "path", pts: circle(0, 0, rn), closed: true, stroke: "center" },
    {
      kind: "path",
      pts: [
        [-ro * 1.08, 0],
        [ro * 1.08, 0],
      ],
      closed: false,
      stroke: "center",
    },
    {
      kind: "path",
      pts: [
        [0, -ro * 1.08],
        [0, ro * 1.08],
      ],
      closed: false,
      stroke: "center",
    },
    {
      kind: "dim",
      a: [-ro, 0],
      b: [ro, 0],
      offsetModel: -ro,
      offsetScreen: -GAP,
      label: `Ø ${mm(r.dOuter)}`,
    },
    {
      kind: "dim",
      a: [-ri, 0],
      b: [ri, 0],
      offsetModel: 0,
      offsetScreen: 0,
      label: `Ø ${mm(r.dInner)}`,
    },
  ];

  const L = r.blankLength;
  // Without a width the strip is drawn at a nominal height and left undimensioned.
  const W = width ?? L * 0.12;
  const dev: Prim[] = [
    {
      kind: "path",
      pts: [
        [0, 0],
        [L, 0],
        [L, W],
        [0, W],
      ],
      closed: true,
      stroke: "part",
      fill: true,
    },
    { kind: "dim", a: [0, W], b: [L, W], offsetModel: 0, offsetScreen: GAP, label: mm(L) },
  ];
  if (width !== null)
    dev.push({
      kind: "dim",
      a: [L, W],
      b: [L, 0],
      offsetModel: 0,
      offsetScreen: GAP,
      label: mm(W),
    });
  if (r.flatEnd > 0) {
    const f = r.flatEnd;
    dev.push(
      {
        kind: "path",
        pts: [
          [f, 0],
          [f, W],
        ],
        closed: false,
        stroke: "flat",
      },
      {
        kind: "path",
        pts: [
          [L - f, 0],
          [L - f, W],
        ],
        closed: false,
        stroke: "flat",
      },
    );
    // Chain dimension under the blank: flat end | ring | flat end, so the cut lines can be marked.
    dev.push(
      { kind: "dim", a: [0, 0], b: [f, 0], offsetModel: 0, offsetScreen: -GAP, label: mm(f) },
      {
        kind: "dim",
        a: [f, 0],
        b: [L - f, 0],
        offsetModel: 0,
        offsetScreen: -GAP,
        label: mm(r.ringLength),
      },
      { kind: "dim", a: [L - f, 0], b: [L, 0], offsetModel: 0, offsetScreen: -GAP, label: mm(f) },
    );
  }
  const notes = [`${t("result.ringLength")}: ${mm(r.ringLength)} ${t("unit.mm")}`];
  if (r.flatEnd > 0) notes.push(`${t("result.flatEnds")}: 2 × ${mm(r.flatEnd)} ${t("unit.mm")}`);
  const thickness = (r.dOuter - r.dInner) / 2;

  return [
    {
      title: t("result.diameters"),
      prims: section,
      notes: [
        `t = ${mm(thickness)} ${t("unit.mm")} · ${t("result.dNeutral")}: ${mm(r.dNeutral)} ${t("unit.mm")}`,
      ],
    },
    { title: t("result.development"), prims: dev, notes },
  ];
}

function coneViews(out: Extract<CalcOutput, { shape: "cone" }>, surface: Surface): View[] {
  const r = out.result;
  const H = r.slant * Math.cos(r.alpha);
  const L = r.large,
    S = r.small;
  const side: Prim[] = [
    {
      kind: "path",
      pts: [
        [-L.dOuter / 2, 0],
        [L.dOuter / 2, 0],
        [S.dOuter / 2, H],
        [-S.dOuter / 2, H],
      ],
      closed: true,
      stroke: "part",
    },
    {
      kind: "path",
      pts: [
        [-L.dInner / 2, 0],
        [-S.dInner / 2, H],
      ],
      closed: false,
      stroke: "thin",
    },
    {
      kind: "path",
      pts: [
        [L.dInner / 2, 0],
        [S.dInner / 2, H],
      ],
      closed: false,
      stroke: "thin",
    },
    {
      kind: "path",
      pts: [
        [0, -H * 0.06],
        [0, H * 1.06],
      ],
      closed: false,
      stroke: "center",
    },
  ];
  const onSurface = (e: { dInner: number; dOuter: number }) =>
    e.dInner + (e.dOuter - e.dInner) * surfaceDepth[surface];
  const dl = onSurface(L);
  const ds = onSurface(S);
  side.push(
    {
      kind: "dim",
      a: [-dl / 2, 0],
      b: [dl / 2, 0],
      offsetModel: 0,
      offsetScreen: -GAP,
      label: `Ø ${mm(dl)}`,
    },
    {
      kind: "dim",
      a: [-ds / 2, H],
      b: [ds / 2, H],
      offsetModel: 0,
      offsetScreen: GAP,
      label: `Ø ${mm(ds)}`,
    },
    {
      kind: "dim",
      a: [L.dOuter / 2, H],
      b: [L.dOuter / 2, 0],
      offsetModel: 0,
      offsetScreen: GAP,
      label: mm(H),
    },
  );

  // Sector opening upwards, symmetric about the y axis.
  const a0 = Math.PI / 2 - r.angle / 2,
    a1 = Math.PI / 2 + r.angle / 2;
  const outer = arc(0, 0, r.rOuter, a0, a1);
  const inner = r.rInner > 1e-9 ? arc(0, 0, r.rInner, a1, a0) : [[0, 0] as const];
  const edge = (rad: number, a: number) => [rad * Math.cos(a), rad * Math.sin(a)] as const;
  const dev: Prim[] = [
    { kind: "path", pts: [...outer, ...inner], closed: true, stroke: "part", fill: true },
    { kind: "path", pts: [[0, 0], edge(r.rInner, a0)], closed: false, stroke: "center" },
    { kind: "path", pts: [[0, 0], edge(r.rInner, a1)], closed: false, stroke: "center" },
    {
      kind: "dim",
      a: edge(r.rInner, a1),
      b: edge(r.rOuter, a1),
      offsetModel: 0,
      offsetScreen: GAP,
      label: mm(r.slant),
    },
    { kind: "arcDim", c: [0, 0], r: r.rOuter, a0, a1, offsetScreen: GAP, label: mm(r.arcOuter) },
    {
      kind: "arcDim",
      c: [0, 0],
      // Angle between the apex and the inner edge; with a tiny inner radius it moves onto the plate.
      r: r.rInner > r.rOuter * 0.25 ? r.rInner * 0.5 : r.rOuter * 0.32,
      a0,
      a1,
      offsetScreen: 0,
      label: `${num((r.angle * 180) / Math.PI)}°`,
    },
  ];
  if (r.rInner > 1e-9)
    dev.push({
      kind: "arcDim",
      c: [0, 0],
      r: r.rInner,
      a0,
      a1,
      // On the plate side, so it stays clear of the angle dimension near the apex.
      offsetScreen: GAP,
      label: mm(r.arcInner),
    });
  // Smallest plate the development fits in, dimensioned below and on the left.
  const pts = [...outer, ...inner];
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  dev.push(
    {
      kind: "path",
      pts: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      closed: true,
      stroke: "thin",
    },
    {
      kind: "dim",
      a: [x0, y0],
      b: [x1, y0],
      offsetModel: 0,
      offsetScreen: -GAP,
      label: mm(x1 - x0),
    },
    {
      kind: "dim",
      a: [x0, y1],
      b: [x0, y0],
      offsetModel: 0,
      offsetScreen: -GAP,
      label: mm(y1 - y0),
    },
  );
  if (r.flatEnd > 0) {
    // Allowance is the extra angle beyond the closed cone, split between both seams.
    const d = (r.angle - r.angleNet) / 2;
    for (const a of [a0 + d, a1 - d])
      dev.push({
        kind: "path",
        pts: [edge(r.rInner, a), edge(r.rOuter, a)],
        closed: false,
        stroke: "flat",
      });
  }
  return [
    {
      title: t("section.geometry"),
      prims: side,
      notes: [
        `t = ${mm(((L.dOuter - L.dInner) / 2) * Math.cos(r.alpha))} ${t("unit.mm")} · ${t("result.alpha")}: ${num((r.alpha * 180) / Math.PI)}°`,
      ],
    },
    {
      title: t("result.development"),
      prims: dev,
      notes: [
        `R1 ${mm(r.rOuter)} · R2 ${mm(r.rInner)} ${t("unit.mm")}`,
        `${t("result.angle")}: ${num((r.angle * 180) / Math.PI)}°`,
      ],
    },
  ];
}
