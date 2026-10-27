import type { SetPoint } from "../domain/calculate";
import { num, percent, t, type Key } from "../i18n";
import type { Derived } from "../state/derive";

export interface Row {
  label: string;
  value: string;
  unit?: string;
  estimate?: boolean;
  /** Highlights values that include the flat-end allowance. */
  neon?: boolean;
}

export interface Hero {
  label: string;
  value: string;
  unit: string;
  /** Plain number for copying. */
  raw: number;
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
          },
        ]
      : [
          { label: t("result.dInner"), value: mm(r.dInner), unit: t("unit.mm"), raw: r.dInner },
          { label: t("result.dOuter"), value: mm(r.dOuter), unit: t("unit.mm"), raw: r.dOuter },
        ];
  }
  const r = out.result;
  return [
    { label: "R1", value: mm(r.rOuter), unit: t("unit.mm"), raw: r.rOuter },
    { label: "R2", value: mm(r.rInner), unit: t("unit.mm"), raw: r.rInner },
    {
      label: t("result.angle"),
      value: deg(r.angle),
      unit: t("unit.deg"),
      raw: (r.angle * 180) / Math.PI,
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
          { label: t("result.k"), value: num(r.k, 3) },
          { label: t("result.rt"), value: num(r.rt, 1) },
          { label: t("result.strain"), value: percent(r.outerStrain) },
          { label: t("result.re"), value: num(d.props.re, 0), unit: t("unit.mpa") },
          ...springRows(out.set, "result.setDiameter"),
        ],
      },
    ];
  }
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
        { label: t("result.k"), value: num(r.k, 3) },
        { label: `${t("result.rt")} min`, value: num(r.rtMin, 1) },
        { label: t("result.strain"), value: percent(r.outerStrainMax) },
        { label: t("result.re"), value: num(d.props.re, 0), unit: t("unit.mpa") },
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

/** Echo of the inputs for the report. */
export function inputRows(d: Derived, materialName: string): Row[] {
  const i = d.inputs;
  const rows: Row[] = [
    {
      label: t("section.shape"),
      value: t(i.shape === "cylinder" ? "shape.cylinder" : "shape.cone"),
    },
    { label: t("result.material"), value: materialName },
    { label: t("field.thickness"), value: mm(d.thickness ?? 0), unit: t("unit.mm") },
  ];
  const surface = t(i.surface === "inner" ? "surface.inner" : "surface.outer");
  const v = (text: string) => {
    const n = Number(text.replace(",", "."));
    return Number.isFinite(n) ? mm(n) : text;
  };
  if (i.shape === "cylinder") {
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
  }
  if (d.flatEnd > 0)
    rows.push({ label: t("field.flatLength"), value: mm(d.flatEnd), unit: t("unit.mm") });
  return rows;
}
