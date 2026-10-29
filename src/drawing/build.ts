import type { CalcOutput } from "../domain/calculate";
import { num, t } from "../i18n";
import { eccentricPoint } from "../domain/eccentric";
import { surfaceDepth, type Surface } from "../domain/types";
import { traceProfile } from "../domain/profile";
import { profileGeometry, profileTurn, referenceSegments } from "../domain/editableProfile";
import type { ProfileShape } from "../domain/shapes";
import { arc, circle, type Annotation, type Prim, type Pt, type View } from "./model";

// Dimension offset from the part, in multiples of the renderer font size.
const GAP = 1.8;

const mm = (v: number) => num(v);

/** Section and development views for the current result. */
export function buildViews(out: CalcOutput, width: number | null, surface: Surface): View[] {
  return out.shape === "cylinder"
    ? cylinderViews(out, width, surface)
    : out.shape === "cone"
      ? coneViews(out, surface)
      : out.shape === "eccentric"
        ? eccentricViews(out)
        : profileViews(out, width, surface);
}

/** Side view as the part is usually drawn (offset shown by the slanted edge) and the development. */
function eccentricViews(out: Extract<CalcOutput, { shape: "eccentric" }>): View[] {
  const r = out.result;
  const e = r.offset,
    H = r.height;
  const D1 = r.reference.dLarge,
    D2 = r.reference.dSmall;
  const sidePoints = (wall: "inner" | "outer") =>
    [
      [0, 1],
      [0, 0],
      [Math.PI, 0],
      [Math.PI, 1],
    ].map(([phi, u]) => {
      const [, y, z] = eccentricPoint(r, phi!, u!, wall);
      return [H - z, y] as const;
    });
  const top = Math.max(...sidePoints("outer").map((p) => p[1]));

  // Small end on the left, large end on the right; y up, offset towards +y.
  const side: Prim[] = [
    {
      kind: "path",
      pts: sidePoints("outer"),
      closed: true,
      stroke: "part",
    },
    { kind: "path", pts: sidePoints("inner"), closed: true, stroke: "thin" },
    {
      kind: "dim",
      a: [0, top],
      b: [H, top],
      offsetModel: 0,
      offsetScreen: GAP * 3.5,
      label: mm(H),
      edit: "height",
    },
    {
      kind: "dim",
      a: [H, D1 / 2],
      b: [H, -D1 / 2],
      offsetModel: 0,
      offsetScreen: GAP,
      label: `Ø ${mm(D1)}`,
      edit: "dLarge",
      extra: [
        { label: `R ${mm(D1 / 2)}`, edit: "cone.radius.large" },
        { label: `C1 ${mm(Math.PI * D1)}`, edit: "cone.circumference.large" },
      ],
    },
    {
      kind: "dim",
      a: [0, e + D2 / 2],
      b: [0, e - D2 / 2],
      offsetModel: 0,
      offsetScreen: -GAP,
      label: `Ø ${mm(D2)}`,
      edit: "dSmall",
      extra: [
        { label: `R ${mm(D2 / 2)}`, edit: "cone.radius.small" },
        { label: `C2 ${mm(Math.PI * D2)}`, edit: "cone.circumference.small" },
      ],
    },
    {
      kind: "dim",
      a: [0, e + D2 / 2],
      b: [H, D1 / 2],
      offsetModel: 0,
      offsetScreen: GAP,
      label: `S1 ${mm(r.slantMin)}`,
      edit: "cone.slant.short",
    },
    {
      kind: "dim",
      a: [0, e - D2 / 2],
      b: [H, -D1 / 2],
      offsetModel: 0,
      offsetScreen: -GAP,
      label: `S2 ${mm(r.slantMax)}`,
      edit: "cone.slant.long",
    },
    {
      kind: "path",
      pts: [
        [0, 0],
        [H, 0],
      ],
      closed: false,
      stroke: "center",
    },
    {
      kind: "path",
      pts: [
        [0, e],
        [H, e],
      ],
      closed: false,
      stroke: "center",
    },
    {
      kind: "dim",
      a: [H * 0.45, 0],
      b: [H * 0.45, e],
      offsetModel: 0,
      offsetScreen: 0,
      label: `e ${mm(e)}`,
      edit: "offset",
    },
  ];

  const W = r.box.width,
    Hb = r.box.height;
  const dev: Prim[] = [
    { kind: "path", pts: r.outline, closed: true, stroke: "part", fill: true },
    ...r.generators.map((g): Prim => ({
      kind: "path",
      pts: [g.a, g.b],
      closed: false,
      stroke: "center",
    })),
    {
      kind: "path",
      pts: [
        [0, 0],
        [W, 0],
        [W, Hb],
        [0, Hb],
      ],
      closed: true,
      stroke: "thin",
    },
    // Leave the first lane below the blank for its small-edge arc dimension.
    {
      kind: "dim",
      a: [0, 0],
      b: [W, 0],
      offsetModel: 0,
      offsetScreen: -GAP * 2.5,
      label: mm(W),
      edit: "cone.box.width",
    },
    {
      kind: "dim",
      a: [0, Hb],
      b: [0, 0],
      offsetModel: 0,
      offsetScreen: -GAP,
      label: mm(Hb),
      edit: "cone.box.height",
    },
    {
      kind: "curveDim",
      pts: r.net.large,
      offsetScreen: -GAP,
      label: `L1 ${mm(r.arcLarge)}`,
      edit: "cone.arc.large",
    },
    ...(r.arcSmall > 1e-8
      ? [
          {
            kind: "curveDim" as const,
            pts: r.net.small,
            offsetScreen: GAP,
            label: `L2 ${mm(r.arcSmall)}`,
            edit: "cone.arc.small" as const,
          },
        ]
      : []),
  ];
  const devNotes: (string | Annotation)[] = [t("drawing.netEdges")];
  return [
    {
      title: t("result.sideView"),
      prims: side,
      notes: [],
    },
    { title: t("result.development"), prims: dev, notes: devNotes },
  ];
}

// Turns the traced section so open shapes stand the way they are usually drawn (opening upwards).
const SECTION_TURN: Record<ProfileShape, number> = {
  halfround: -Math.PI / 2,
  ushape: -Math.PI / 2,
  obround: 0,
  rect: 0,
  tank: 0,
  bucket: Math.PI / 2,
  ellipse: 0,
  free: 0,
};

function profileViews(
  out: Extract<CalcOutput, { shape: "profile" }>,
  width: number | null,
  surface: Surface,
): View[] {
  const r = out.result;
  const turn = SECTION_TURN[r.shape];
  const c = Math.cos(turn),
    sn = Math.sin(turn);
  const rot = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x * c - y * sn, x * sn + y * c] as const);
  const inner = rot(traceProfile(r.profile, 0));
  const outer = rot(traceProfile(r.profile, 1));
  const ring = r.closed && r.flatEnd === 0;
  const section: Prim[] = ring
    ? [
        { kind: "path", pts: outer, closed: true, stroke: "part" },
        { kind: "path", pts: inner, closed: true, stroke: "part" },
      ]
    : [{ kind: "path", pts: [...outer, ...inner.slice().reverse()], closed: true, stroke: "part" }];
  // Overall sizes measured on the surface the dimensions were given on.
  const envelope = profileGeometry(
    referenceSegments(r.profile, surfaceDepth[surface]),
    r.profile.thickness,
    surfaceDepth[surface],
    turn,
  );
  const { minX: x0, maxX: x1, minY: y0, maxY: y1 } = envelope;
  const all = [...inner, ...outer];
  const bx0 = Math.min(...all.map((p) => p[0])),
    by0 = Math.min(...all.map((p) => p[1]));
  section.push(
    {
      kind: "dim",
      a: [x0, by0],
      b: [x1, by0],
      offsetModel: 0,
      offsetScreen: -GAP,
      label: mm(r.sizes?.[0] ?? x1 - x0),
      edit: "extent.x",
    },
    {
      kind: "dim",
      a: [bx0, y1],
      b: [bx0, y0],
      offsetModel: 0,
      offsetScreen: -GAP,
      label: mm(r.sizes?.[1] ?? y1 - y0),
      edit: "extent.y",
    },
  );

  const L = r.blankLength;
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
    {
      kind: "dim",
      a: [0, W],
      b: [L, W],
      offsetModel: 0,
      offsetScreen: GAP,
      label: mm(L),
      edit: "profile.blankLength",
    },
  ];
  if (width !== null)
    dev.push({
      kind: "dim",
      a: [L, W],
      b: [L, 0],
      offsetModel: 0,
      offsetScreen: GAP,
      label: mm(W),
      edit: "width",
    });
  for (const x of r.dev.bendLines)
    dev.push({
      kind: "path",
      pts: [
        [x, 0],
        [x, W],
      ],
      closed: false,
      stroke: "center",
    });
  if (r.flatEnd > 0)
    for (const x of [r.flatEnd, L - r.flatEnd])
      dev.push({
        kind: "path",
        pts: [
          [x, 0],
          [x, W],
        ],
        closed: false,
        stroke: "flat",
      });
  // Chain dimension under the blank between all marked lines, so they can be scribed from one edge.
  const marks = [
    0,
    ...new Set([...(r.flatEnd > 0 ? [r.flatEnd, L - r.flatEnd] : []), ...r.dev.bendLines]),
    L,
  ].sort((a, b) => a - b);
  // Dense intervals become editable rows in the renderer rather than losing their input binding.
  if (marks.length > 2 && (r.shape !== "ellipse" || r.custom))
    for (let i = 0; i + 1 < marks.length; i++) {
      const a = marks[i]!,
        b = marks[i + 1]!;
      if (b - a < 1e-6) continue;
      const segmentIndex = r.dev.segments.findIndex(
        (s) => Math.abs(s.start - a) < 1e-5 && Math.abs(s.start + s.length - b) < 1e-5,
      );
      const segment = r.dev.segments[segmentIndex];
      const allowance =
        r.flatEnd > 0 && (segmentIndex === 0 || segmentIndex === r.dev.segments.length - 1);
      if (!segment) continue;
      dev.push({
        kind: "dim",
        a: [a, 0],
        b: [b, 0],
        offsetModel: 0,
        offsetScreen: -GAP,
        label: mm(b - a),
        chain: t("drawing.chain"),
        edit: allowance
          ? "flatEnd"
          : `segment.${segmentIndex - (r.flatEnd > 0 ? 1 : 0)}.${segment.segment.kind === "line" ? "size" : "developed"}`,
      });
    }

  const sectionNotes: (string | Annotation)[] = [];
  if (r.shape === "ellipse" && !r.custom)
    sectionNotes.push(
      {
        text: `R min ${mm(r.radii[0]!)} (${t("surface.inner").toLowerCase()})`,
        edit: "ellipse.min",
      },
      {
        text: `R max ${mm(r.radii[1]!)} (${t("surface.inner").toLowerCase()})`,
        edit: "ellipse.max",
      },
    );
  if (r.derivedR !== null)
    sectionNotes.push(`${t("result.tankR")}: ${mm(r.derivedR)} ${t("unit.mm")}`);
  if (r.shape !== "ellipse" || r.custom) {
    const editable = referenceSegments(r.profile, surfaceDepth[surface], r.flatEnd);
    const geometry = profileGeometry(
      editable,
      r.profile.thickness,
      surfaceDepth[surface],
      profileTurn[r.shape],
    );
    let lineNumber = 0,
      arcNumber = 0;
    for (const f of geometry.features) {
      const featureAt: Pt = [f.middle[0] + r.flatEnd * c, f.middle[1] + r.flatEnd * sn];
      const segment = editable[f.index]!;
      if (segment.kind === "line") {
        lineNumber++;
        section.push({
          kind: "tag",
          at: featureAt,
          direction: [Math.sin(f.heading), -Math.cos(f.heading)],
          label: `L${lineNumber} ${mm(segment.length)}`,
          edit: `segment.${f.index}.size`,
        });
      } else {
        arcNumber++;
        const dx = f.middle[0] - f.centre![0],
          dy = f.middle[1] - f.centre![1],
          length = Math.hypot(dx, dy) || 1;
        const direction: Pt = [dx / length, dy / length];
        section.push({
          kind: "tag",
          at: featureAt,
          direction,
          label: `R${arcNumber} ${mm(segment.radius)}`,
          edit: `segment.${f.index}.size`,
        });
        if (r.shape === "halfround")
          section.push({
            kind: "tag",
            at: featureAt,
            direction,
            row: 1,
            label: `Ø ${mm(2 * segment.radius)}`,
            edit: `segment.${f.index}.diameter`,
          });
        if (["halfround", "bucket", "free"].includes(r.shape))
          section.push({
            kind: "tag",
            at: featureAt,
            direction,
            row: r.shape === "halfround" ? 2 : 1,
            label: `φ${arcNumber} ${mm((segment.angle * 180) / Math.PI)}°`,
            edit: `segment.${f.index}.angle`,
          });
      }
    }
  }
  // Three positions per line keep the notes inside the view.
  const devNotes: string[] = [];
  return [
    {
      title: `${t("result.section")}${r.custom ? ` · ${t("geometry.modified")}` : ""}`,
      prims: section,
      notes: sectionNotes,
    },
    { title: t("result.development"), prims: dev, notes: devNotes },
  ];
}

function cylinderViews(
  out: Extract<CalcOutput, { shape: "cylinder" }>,
  width: number | null,
  surface: Surface,
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
      edit: "diameter.outer",
      extra: [{ label: `R ${mm(ro)}`, edit: "radius.outer" }],
    },
    {
      kind: "dim",
      a: [-ri, 0],
      b: [ri, 0],
      offsetModel: 0,
      offsetScreen: 0,
      label: `Ø ${mm(r.dInner)}`,
      edit: "diameter.inner",
      extra: [{ label: `R ${mm(ri)}`, edit: "radius.inner" }],
    },
    {
      kind: "arcDim",
      c: [0, 0],
      r: ri + surfaceDepth[surface] * (ro - ri),
      a0: -Math.PI / 2,
      a1: Math.PI * 1.5,
      offsetScreen: GAP,
      label: `C ${mm(Math.PI * (r.dInner + surfaceDepth[surface] * (r.dOuter - r.dInner)))}`,
      edit: "cylinder.circumference",
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
    {
      kind: "dim",
      a: [0, W],
      b: [L, W],
      offsetModel: 0,
      offsetScreen: GAP,
      label: mm(L),
      edit: "cylinder.blankLength",
    },
  ];
  if (width !== null)
    dev.push({
      kind: "dim",
      a: [L, W],
      b: [L, 0],
      offsetModel: 0,
      offsetScreen: GAP,
      label: mm(W),
      edit: "width",
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
      {
        kind: "dim",
        a: [0, 0],
        b: [f, 0],
        offsetModel: 0,
        offsetScreen: -GAP,
        label: mm(f),
        chain: t("drawing.chain"),
        edit: "flatEnd",
      },
      {
        kind: "dim",
        a: [f, 0],
        b: [L - f, 0],
        offsetModel: 0,
        offsetScreen: -GAP,
        label: mm(r.ringLength),
        chain: t("drawing.chain"),
        edit: "cylinder.ringLength",
      },
      {
        kind: "dim",
        a: [L - f, 0],
        b: [L, 0],
        offsetModel: 0,
        offsetScreen: -GAP,
        label: mm(f),
        chain: t("drawing.chain"),
        edit: "flatEnd",
      },
    );
  }
  const notes: string[] = [];

  return [
    {
      title: t("result.diameters"),
      prims: section,
      notes: [],
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
      edit: "dLarge",
      extra: [
        { label: `R ${mm(dl / 2)}`, edit: "cone.radius.large" },
        { label: `C1 ${mm(Math.PI * dl)}`, edit: "cone.circumference.large" },
      ],
    },
    {
      kind: "dim",
      a: [-ds / 2, H],
      b: [ds / 2, H],
      offsetModel: 0,
      offsetScreen: GAP,
      label: `Ø ${mm(ds)}`,
      edit: "dSmall",
      extra: [
        { label: `R ${mm(ds / 2)}`, edit: "cone.radius.small" },
        { label: `C2 ${mm(Math.PI * ds)}`, edit: "cone.circumference.small" },
      ],
    },
    {
      kind: "dim",
      a: [L.dOuter / 2, H],
      b: [L.dOuter / 2, 0],
      offsetModel: 0,
      offsetScreen: GAP,
      label: mm(H),
      edit: "height",
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
    // Frame the sheet itself. The virtual apex can be kilometres away for a shallow taper.
    {
      kind: "dim",
      a: edge(r.rInner, a0),
      b: edge(r.rOuter, a0),
      offsetModel: 0,
      // Opposite the bounding-height dimension, so near-vertical values cannot overlap.
      offsetScreen: -GAP,
      label: mm(r.slant),
      edit: "cone.slant",
    },
    {
      kind: "arcDim",
      c: [0, 0],
      r: r.rOuter,
      a0,
      a1,
      offsetScreen: GAP,
      label: `L1 ${mm(r.arcOuter)}`,
      edit: "cone.arc.large",
      extra: [{ label: `R1 ${mm(r.rOuter)}`, edit: "cone.r1" }],
    },
  ];
  if (r.rInner > 1e-9)
    dev.push({
      kind: "arcDim",
      c: [0, 0],
      r: r.rInner,
      a0,
      a1,
      offsetScreen: -GAP,
      label: `L2 ${mm(r.arcInner)}`,
      edit: "cone.arc.small",
      extra: [{ label: `R2 ${mm(r.rInner)}`, edit: "cone.r2" }],
    });
  // Smallest plate the development fits in, dimensioned below and on the left.
  const x0 = -r.box.height / 2,
    x1 = r.box.height / 2,
    y1 = r.rOuter,
    y0 = y1 - r.box.width;
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
      offsetScreen: -GAP * 4,
      label: mm(x1 - x0),
      edit: "cone.box.width",
    },
    {
      kind: "dim",
      a: [x0, y1],
      b: [x0, y0],
      offsetModel: 0,
      offsetScreen: -GAP,
      label: mm(y1 - y0),
      edit: "cone.box.height",
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
      notes: [],
    },
    {
      title: t("result.development"),
      prims: dev,
      notes: [],
    },
  ];
}
