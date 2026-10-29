import type { SetPoint, ThicknessLimits } from "../domain/calculate";
import type { DimensionId } from "../drawing/model";
import { SHAPE_FIELDS } from "../domain/shapes";
import { parseFreeRows } from "../state/freeShape";
import { num, percent, t, type Key } from "../i18n";
import type { Derived } from "../state/derive";
import { isConeShape, parseNumber } from "../state/inputs";

export interface Row {
  label: string;
  value: string;
  unit?: string;
  estimate?: boolean;
  /** Highlights values that include the flat-end allowance. */
  neon?: boolean;
  /** A list of values: label on its own line, values below, wrapping. */
  list?: boolean;
}

export interface Hero {
  label: string;
  value: string;
  unit: string;
  /** Plain number for copying. */
  raw: number;
  edit?: DimensionId;
}

const mm = (v: number) => num(v);
const deg = (rad: number) => num((rad * 180) / Math.PI);

export function heroes(d: Derived): Hero[] {
  const out = d.output;
  if (!out) return [];
  if (out.shape === "cylinder") {
    const r = out.result;
    return d.inputs.mode === "fromDiameter"
      ? [
          {
            label: t("result.blankLength"),
            value: mm(r.blankLength),
            unit: t("unit.mm"),
            raw: r.blankLength,
            edit: "cylinder.blankLength",
          },
        ]
      : [
          {
            label: t("result.dInner"),
            value: mm(r.dInner),
            unit: t("unit.mm"),
            raw: r.dInner,
            edit: "diameter.inner",
          },
          {
            label: t("result.dOuter"),
            value: mm(r.dOuter),
            unit: t("unit.mm"),
            raw: r.dOuter,
            edit: "diameter.outer",
          },
        ];
  }
  if (out.shape === "profile") {
    const r = out.result;
    return [
      {
        label: t("result.blankLength"),
        value: mm(r.blankLength),
        unit: t("unit.mm"),
        raw: r.blankLength,
        edit: r.shape === "ellipse" && !r.custom ? undefined : "profile.blankLength",
      },
    ];
  }
  if (out.shape === "eccentric") {
    const r = out.result;
    return [
      {
        label: t("result.slantMin"),
        value: mm(r.slantMin),
        unit: t("unit.mm"),
        raw: r.slantMin,
        edit: "cone.slant.short",
      },
      {
        label: t("result.slantMax"),
        value: mm(r.slantMax),
        unit: t("unit.mm"),
        raw: r.slantMax,
        edit: "cone.slant.long",
      },
    ];
  }
  const r = out.result;
  return [
    { label: "R1", value: mm(r.rOuter), unit: t("unit.mm"), raw: r.rOuter, edit: "cone.r1" },
    { label: "R2", value: mm(r.rInner), unit: t("unit.mm"), raw: r.rInner, edit: "cone.r2" },
    {
      label: t("result.angle"),
      value: deg(r.angle),
      unit: t("unit.deg"),
      raw: (r.angle * 180) / Math.PI,
      edit: "cone.sector",
    },
  ];
}

function springRows(set: SetPoint | null, label: Key): Row[] {
  if (!set || set.dInner <= 0) return [];
  return [
    { label: t(label), value: mm(set.dInner), unit: t("unit.mm"), estimate: true },
    { label: t("result.springback"), value: percent(set.ratio), estimate: true },
  ];
}

/** Secondary results, grouped. */
/** Maximum thickness from the machine's capacity charts, so the margin is visible before a warning. */
function limitRows(l: ThicknessLimits): Row[] {
  const tag = l.scaled ? ` (${t("result.limitScaled")})` : "";
  const row = (key: Key, v: number | null): Row[] =>
    v === null ? [] : [{ label: t(key) + tag, value: num(v, 1), unit: t("unit.mm") }];
  return [
    ...row("result.limitRolling", l.rolling),
    ...row("result.limitPrebending", l.prebending),
    ...(l.cone !== null && l.coneShare !== null
      ? [
          {
            label: t("result.limitCone", { share: percent(l.coneShare) }),
            value: num(l.cone, 1),
            unit: t("unit.mm"),
          },
        ]
      : []),
  ];
}

function calibrationRow(d: Derived): Row {
  const c = d.calibration;
  const source =
    c.source === "trials"
      ? t("result.cal.trials", { n: String(c.trials) })
      : t(c.source === "input" ? "result.cal.input" : "result.cal.default");
  return { label: `${t("result.calibration")} (${source})`, value: num(c.value, 3) };
}

export function resultGroups(d: Derived): { title: string; rows: Row[] }[] {
  const out = d.output;
  if (!out || !d.props) return [];
  const mass: Row[] =
    out.massKg !== null
      ? [{ label: t("result.mass"), value: num(out.massKg, 1), unit: t("unit.kg") }]
      : [];
  if (out.shape === "cylinder") {
    const r = out.result;
    const geometry: Row[] = [
      { label: t("result.dInner"), value: mm(r.dInner), unit: t("unit.mm") },
      { label: t("result.dOuter"), value: mm(r.dOuter), unit: t("unit.mm") },
      { label: t("result.dNeutral"), value: mm(r.dNeutral), unit: t("unit.mm") },
      { label: t("result.ringLength"), value: mm(r.ringLength), unit: t("unit.mm") },
    ];
    // In length mode the diameters are already the headline values.
    if (d.inputs.mode === "fromLength") geometry.splice(0, 2);
    if (r.flatEnd > 0)
      geometry.push({
        label: t("result.flatEnds"),
        value: `2 × ${mm(r.flatEnd)}`,
        unit: t("unit.mm"),
        neon: true,
      });
    return [
      { title: t("section.geometry"), rows: [...geometry, ...mass] },
      {
        title: t("result.process"),
        rows: [
          ...limitRows(out.limits),
          { label: t("result.k"), value: num(r.k, 3) },
          { label: t("result.rt"), value: num(r.rt, 1) },
          { label: t("result.strain"), value: percent(r.outerStrain) },
          { label: t("result.re"), value: num(d.props.re, 0), unit: t("unit.mpa") },
          calibrationRow(d),
          ...springRows(out.set, "result.setDiameter"),
        ],
      },
    ];
  }
  if (out.shape === "profile") return profileGroups(d, out, mass);
  if (out.shape === "eccentric") return eccentricGroups(d, out, mass);
  const r = out.result;
  return [
    {
      title: t("result.development"),
      rows: [
        { label: t("result.arcOuter"), value: mm(r.arcOuter), unit: t("unit.mm") },
        { label: t("result.arcInner"), value: mm(r.arcInner), unit: t("unit.mm") },
        { label: t("result.chordOuter"), value: mm(r.chordOuter), unit: t("unit.mm") },
        { label: t("result.chordInner"), value: mm(r.chordInner), unit: t("unit.mm") },
        { label: t("result.slant"), value: mm(r.slant), unit: t("unit.mm") },
        ...(r.flatEnd > 0
          ? [
              {
                label: t("result.flatEnds"),
                value: `2 × ${mm(r.flatEnd)}`,
                unit: t("unit.mm"),
                neon: true,
              },
            ]
          : []),
        {
          label: t("result.box"),
          value: `${mm(r.box.width)} × ${mm(r.box.height)}`,
          unit: t("unit.mm"),
          list: true,
        },
        { label: t("result.alpha"), value: deg(r.alpha), unit: t("unit.deg") },
        ...mass,
      ],
    },
    {
      title: t("result.diameters"),
      rows: [
        {
          label: `${t("result.dInner")} · ${t("field.dLarge")}`,
          value: mm(r.large.dInner),
          unit: t("unit.mm"),
        },
        {
          label: `${t("result.dOuter")} · ${t("field.dLarge")}`,
          value: mm(r.large.dOuter),
          unit: t("unit.mm"),
        },
        {
          label: `${t("result.dInner")} · ${t("field.dSmall")}`,
          value: mm(r.small.dInner),
          unit: t("unit.mm"),
        },
        {
          label: `${t("result.dOuter")} · ${t("field.dSmall")}`,
          value: mm(r.small.dOuter),
          unit: t("unit.mm"),
        },
      ],
    },
    {
      title: t("result.process"),
      rows: [
        ...limitRows(out.limits),
        { label: t("result.k"), value: num(r.k, 3) },
        { label: `${t("result.rt")} min`, value: num(r.rtMin, 1) },
        { label: t("result.strain"), value: percent(r.outerStrainMax) },
        { label: t("result.re"), value: num(d.props.re, 0), unit: t("unit.mpa") },
        calibrationRow(d),
        ...springRows(out.setLarge, "result.setLarge"),
        ...(out.setSmall && out.setSmall.dInner > 0
          ? [
              {
                label: t("result.setSmall"),
                value: mm(out.setSmall.dInner),
                unit: t("unit.mm"),
                estimate: true,
              },
            ]
          : []),
      ],
    },
  ];
}

function eccentricGroups(
  d: Derived,
  out: Extract<NonNullable<Derived["output"]>, { shape: "eccentric" }>,
  mass: Row[],
): { title: string; rows: Row[] }[] {
  const r = out.result;
  const flat: Row[] =
    r.flatEnd > 0
      ? [
          {
            label: t("result.flatEnds"),
            value: `2 × ${mm(r.flatEnd)}`,
            unit: t("unit.mm"),
            neon: true,
          },
        ]
      : [];
  return [
    {
      title: t("result.development"),
      rows: [
        { label: t("result.arcLarge"), value: mm(r.arcLarge), unit: t("unit.mm") },
        { label: t("result.arcSmall"), value: mm(r.arcSmall), unit: t("unit.mm") },
        {
          label: t("result.generators"),
          value: r.generators
            .slice(0, -1)
            .map((g) => mm(g.length))
            .join(" · "),
          unit: t("unit.mm"),
          list: true,
        },
        ...flat,
        {
          label: t("result.box"),
          value: `${mm(r.box.width)} × ${mm(r.box.height)}`,
          unit: t("unit.mm"),
          list: true,
        },
        { label: t("result.offset"), value: mm(r.offset), unit: t("unit.mm") },
        {
          label: t("result.endPlaneThickness"),
          value: `${mm(r.endPlaneThickness.min)}–${mm(r.endPlaneThickness.max)}`,
          unit: t("unit.mm"),
          list: true,
        },
        { label: t("result.alphaMax"), value: deg(r.alphaMax), unit: t("unit.deg") },
        ...mass,
      ],
    },
    {
      title: t("result.equivalentDiameters"),
      rows: [
        {
          label: `${t("result.dInner")} · ${t("field.dLarge")}`,
          value: mm(r.large.dInner),
          unit: t("unit.mm"),
        },
        {
          label: `${t("result.dOuter")} · ${t("field.dLarge")}`,
          value: mm(r.large.dOuter),
          unit: t("unit.mm"),
        },
        {
          label: `${t("result.dInner")} · ${t("field.dSmall")}`,
          value: mm(r.small.dInner),
          unit: t("unit.mm"),
        },
        {
          label: `${t("result.dOuter")} · ${t("field.dSmall")}`,
          value: mm(r.small.dOuter),
          unit: t("unit.mm"),
        },
      ],
    },
    {
      title: t("result.process"),
      rows: [
        ...limitRows(out.limits),
        { label: t("result.k"), value: num(r.k, 3) },
        { label: `${t("result.rt")} min`, value: num(r.rtMin, 1) },
        { label: t("result.strain"), value: percent(r.outerStrainMax) },
        { label: t("result.re"), value: num(d.props!.re, 0), unit: t("unit.mpa") },
        calibrationRow(d),
        ...springRows(out.setLarge, "result.setLarge"),
        ...(out.setSmall && out.setSmall.dInner > 0
          ? [
              {
                label: t("result.setSmall"),
                value: mm(out.setSmall.dInner),
                unit: t("unit.mm"),
                estimate: true,
              },
            ]
          : []),
      ],
    },
  ];
}

function profileGroups(
  d: Derived,
  out: Extract<NonNullable<Derived["output"]>, { shape: "profile" }>,
  mass: Row[],
): { title: string; rows: Row[] }[] {
  const r = out.result;
  const radii = r.radii.map((x) => mm(x)).join(" · ");
  const geometry: Row[] = [
    {
      label: t(r.shape === "ellipse" ? "result.radiusRange" : "result.bendRadii"),
      value: radii,
      unit: t("unit.mm"),
      list: r.radii.length > 1,
    },
  ];
  if (r.derivedR !== null)
    geometry.push({ label: t("result.tankR"), value: mm(r.derivedR), unit: t("unit.mm") });
  if (r.dev.bendLines.length)
    geometry.push({
      label: t("result.bendLines"),
      value: r.dev.bendLines.map((x) => mm(x)).join(" · "),
      unit: t("unit.mm"),
      list: true,
    });
  if (r.flatEnd > 0)
    geometry.push({
      label: t("result.flatEnds"),
      value: `2 × ${mm(r.flatEnd)}`,
      unit: t("unit.mm"),
      neon: true,
    });
  const sets: Row[] = out.sets.flatMap((x) =>
    x.set && x.set.dInner > 0
      ? [
          {
            label: t("result.setRadius", { r: mm(x.rInner) }),
            value: mm(x.set.dInner / 2),
            unit: t("unit.mm"),
            estimate: true,
          },
        ]
      : [],
  );
  const tight = out.sets[0]?.set;
  return [
    { title: t("section.geometry"), rows: [...geometry, ...mass] },
    {
      title: t("result.process"),
      rows: [
        ...limitRows(out.limits),
        { label: t("result.k"), value: num(r.k, 3) },
        { label: `${t("result.rt")} min`, value: num(r.rtMin, 1) },
        { label: t("result.strain"), value: percent(r.outerStrainMax) },
        { label: t("result.re"), value: num(d.props!.re, 0), unit: t("unit.mpa") },
        calibrationRow(d),
        ...sets,
        ...(tight && tight.dInner > 0
          ? [{ label: t("result.springback"), value: percent(tight.ratio), estimate: true }]
          : []),
      ],
    },
  ];
}

/** Echo of the inputs for the report. */
export function inputRows(d: Derived, materialName: string): Row[] {
  const i = d.inputs;
  const rows: Row[] = [
    {
      label: t("section.shape"),
      value: `${t(`shape.${i.shape}` as Key)}${i.profileSegs ? ` · ${t("geometry.modified")}` : ""}`,
    },
    { label: t("result.material"), value: materialName },
    { label: t("field.thickness"), value: mm(d.thickness ?? 0), unit: t("unit.mm") },
  ];
  const surface = t(`surface.${i.surface}` as Key);
  const v = (text: string) => {
    const n = parseNumber(text);
    return n === null ? text : mm(n);
  };
  if (i.profileSegs) {
    rows.push({
      label: `${t("free.title")} (${surface.toLowerCase()})`,
      value: parseFreeRows(i.profileSegs)
        .map(
          (r, j) =>
            `${j + 1}: ${r.kind === "line" ? `L ${v(r.size)}` : `R ${v(r.size)} / φ ${v(r.angle)}°`}`,
        )
        .join(" · "),
      list: true,
    });
    if (d.width !== null)
      rows.push({ label: t("field.width"), value: mm(d.width), unit: t("unit.mm") });
  } else if (i.shape === "cylinder") {
    if (i.mode === "fromDiameter") {
      const label = t(i.dimension === "radius" ? "field.value.radius" : "field.value.diameter");
      rows.push({
        label: `${label} (${surface.toLowerCase()})`,
        value: v(i.value),
        unit: t("unit.mm"),
      });
    } else rows.push({ label: t("field.length"), value: v(i.length), unit: t("unit.mm") });
    if (d.width !== null)
      rows.push({ label: t("field.width"), value: mm(d.width), unit: t("unit.mm") });
  } else if (!isConeShape(i.shape)) {
    const shape = i.shape;
    for (const f of SHAPE_FIELDS[shape]) {
      if (shape === "halfround" && f === "r") {
        const label = t(i.dimension === "radius" ? "field.value.radius" : "field.value.diameter");
        rows.push({
          label: `${label} (${surface.toLowerCase()})`,
          value: v(i.value),
          unit: t("unit.mm"),
        });
        continue;
      }
      const text = { a: i.sizeA, b: i.sizeB, r: i.sizeR, angle: i.angle }[f];
      rows.push({
        label:
          f === "angle"
            ? t(`size.${shape}.${f}` as Key)
            : `${t(`size.${shape}.${f}` as Key)} (${surface.toLowerCase()})`,
        value: v(text),
        unit: t(f === "angle" ? "unit.deg" : "unit.mm"),
      });
    }
    if (shape === "free")
      rows.push({
        label: t("free.title"),
        value: parseFreeRows(i.freeSegs)
          .map((r) => (r.kind === "line" ? `L ${v(r.size)}` : `R ${v(r.size)} / ${v(r.angle)}°`))
          .join(" · "),
        list: true,
      });
    if (d.width !== null)
      rows.push({ label: t("field.width"), value: mm(d.width), unit: t("unit.mm") });
  } else {
    rows.push(
      {
        label: `${t("field.dLarge")} (${surface.toLowerCase()})`,
        value: v(i.dLarge),
        unit: t("unit.mm"),
      },
      {
        label: `${t("field.dSmall")} (${surface.toLowerCase()})`,
        value: v(i.dSmall),
        unit: t("unit.mm"),
      },
      { label: t("field.height"), value: v(i.height), unit: t("unit.mm") },
    );
    const e = parseNumber(i.offset);
    if (e !== null && e !== 0)
      rows.push({ label: t("field.offset"), value: mm(e), unit: t("unit.mm") });
  }
  if (d.flatEnd > 0)
    rows.push({ label: t("field.flatLength"), value: mm(d.flatEnd), unit: t("unit.mm") });
  return rows;
}
