import { describe, expect, it } from "vitest";
import { emptyMachine } from "../src/domain/calculate";
import { materials } from "../src/domain/materials/data";
import { buildViews } from "../src/drawing/build";
import { drawViews } from "../src/drawing/layout";
import { bounds } from "../src/drawing/model";
import { num } from "../src/i18n";
import { defaultProcess } from "../src/state/config";
import { derive } from "../src/state/derive";
import { defaultInputs, type Inputs } from "../src/state/inputs";

const run = (patch: Partial<Inputs> = {}) => {
  const d = derive(
    { ...defaultInputs, shape: "eccentric", offset: "300", ...patch },
    emptyMachine,
    defaultProcess,
    materials,
  );
  if (d.output?.shape !== "eccentric") throw Error(d.error?.key ?? "No eccentric cone");
  return { r: d.output.result, view: buildViews(d.output, null, d.inputs.surface)[1]! };
};

describe("eccentric developed arc dimensions", () => {
  it.each(["inner", "mid", "outer"] as const)(
    "measures both actual numerical edges on the %s reference",
    (surface) => {
      const { r, view } = run({ surface });
      const curves = view.prims.filter((p) => p.kind === "curveDim");
      expect(curves).toHaveLength(2);
      for (const [i, name] of ["large", "small"].entries()) {
        const points = name === "large" ? r.net.large : r.net.small;
        const length = name === "large" ? r.arcLarge : r.arcSmall;
        expect(curves[i]!.pts).toBe(points);
        expect(curves[i]!.label).toBe(`L${i + 1} ${num(length)}`);
        const polyline = points
          .slice(1)
          .reduce((sum, p, j) => sum + Math.hypot(p[0] - points[j]![0], p[1] - points[j]![1]), 0);
        expect(Math.abs(polyline - length)).toBeLessThanOrEqual(r.tolerance);
        const chord = Math.hypot(
          points.at(-1)![0] - points[0]![0],
          points.at(-1)![1] - points[0]![1],
        );
        expect(length - chord).toBeGreaterThan(100);
      }
      const contour = view.prims.find((p) => p.kind === "path" && p.fill)!;
      expect(bounds(view)).toEqual(bounds({ ...view, prims: [contour] }));
    },
  );
  it("keeps arc dimensions net and shows separate flat allowances", () => {
    const plain = run(),
      flat = run({ flatEnds: true, flatLength: "35" });
    expect(flat.r.arcLarge).toBe(plain.r.arcLarge);
    expect(flat.r.arcSmall).toBe(plain.r.arcSmall);
    expect(flat.r.box.height).toBeGreaterThan(plain.r.box.height);
    expect(flat.view.notes.some((n) => typeof n === "string" && n.includes("L1/L2"))).toBe(true);
  });
  it.each([
    {},
    {
      dLarge: "2405",
      dSmall: "2398",
      height: "3000",
      offset: "3.5",
      thickness: "20",
      surface: "mid" as const,
    },
    { height: "8000" },
    {
      dSmall: "1199.99999",
      height: "10",
      offset: "0.000001",
      thickness: "0.1",
      surface: "mid" as const,
      k: "0.5",
    },
  ])("separates arc and bounding dimensions on screen and paper: %j", (patch) => {
    const { view } = run(patch);
    for (const [w, h, fontSize] of [
      [700, 600, 12],
      [326, 600, 11],
      [92, 140, 3],
    ]) {
      const labels: { text: string; minX: number; minY: number; maxX: number; maxY: number }[] = [];
      drawViews(
        [view],
        { x: 0, y: 0, w: w!, h: h! },
        {
          path() {},
          fill() {},
          text(x, y, text, o) {
            if (o.role !== "dim") return;
            const width = text.length * o.size * 0.62,
              angle = ((o.angle ?? 0) * Math.PI) / 180;
            const pts = [
              [-width / 2, -o.size],
              [width / 2, -o.size],
              [width / 2, 0],
              [-width / 2, 0],
            ].map(([dx, dy]) => [
              x + dx! * Math.cos(angle) - dy! * Math.sin(angle),
              y + dx! * Math.sin(angle) + dy! * Math.cos(angle),
            ]);
            labels.push({
              text,
              minX: Math.min(...pts.map((p) => p[0]!)),
              maxX: Math.max(...pts.map((p) => p[0]!)),
              minY: Math.min(...pts.map((p) => p[1]!)),
              maxY: Math.max(...pts.map((p) => p[1]!)),
            });
          },
        },
        {
          fontSize: fontSize!,
          arrow: fontSize! * 0.6,
          pad: fontSize! * 2.5,
          gap: fontSize!,
          stacked: false,
          interactive: fontSize! > 3,
          snapScale: fontSize === 3,
        },
      );
      expect(labels).toHaveLength(4);
      for (const a of labels) {
        expect(a.minX, a.text).toBeGreaterThanOrEqual(0);
        expect(a.minY, a.text).toBeGreaterThanOrEqual(0);
        expect(a.maxX, a.text).toBeLessThanOrEqual(w!);
        expect(a.maxY, a.text).toBeLessThanOrEqual(h!);
        for (const b of labels.filter((b) => b !== a))
          expect(
            Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 0.1 &&
              Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > 0.1,
            `${a.text} / ${b.text}, w=${w}`,
          ).toBe(false);
      }
    }
  });
});
