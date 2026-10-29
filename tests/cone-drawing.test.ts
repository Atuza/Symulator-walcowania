import { describe, expect, it } from "vitest";
import { materials } from "../src/domain/materials/data";
import { buildViews } from "../src/drawing/build";
import { drawViews, type Sink } from "../src/drawing/layout";
import { bounds, type Pt } from "../src/drawing/model";
import { defaultProcess } from "../src/state/config";
import { derive } from "../src/state/derive";
import { withFixedMachine } from "../src/state/fixedMachine";
import { defaultInputs, type Inputs } from "../src/state/inputs";

const development = (patch: Partial<Inputs> = {}) => {
  const d = derive(
    {
      ...defaultInputs,
      shape: "cone",
      surface: "mid",
      thickness: "20",
      dLarge: "2405",
      dSmall: "2398",
      height: "3000",
      ...patch,
    },
    withFixedMachine(),
    defaultProcess,
    materials,
  );
  if (d.output?.shape !== "cone") throw Error("No cone");
  const view = buildViews(d.output, d.width, d.inputs.surface)[1]!;
  const cut = view.prims.find((p) => p.kind === "path" && p.fill);
  if (cut?.kind !== "path") throw Error("No cut contour");
  return { d, view, cut };
};

describe("cone development framing", () => {
  it.each([
    [720, 480, 12],
    [326, 600, 11],
    [90, 120, 3],
  ] as const)(
    "separates developed dimensions at %i × %i without an apex-angle annotation",
    (w, h, fontSize) => {
      const { view } = development();
      const labels: { text: string; minX: number; minY: number; maxX: number; maxY: number }[] = [];
      drawViews(
        [view],
        { x: 0, y: 0, w, h },
        {
          path() {},
          fill() {},
          text(x, y, text, o) {
            if (o.role !== "dim") return;
            const width = text.length * o.size * 0.62;
            const left = o.anchor === "middle" ? -width / 2 : o.anchor === "end" ? -width : 0;
            const a = ((o.angle ?? 0) * Math.PI) / 180;
            const points = [
              [left, -o.size],
              [left + width, -o.size],
              [left + width, 0],
              [left, 0],
            ].map(([dx, dy]) => [
              x + dx! * Math.cos(a) - dy! * Math.sin(a),
              y + dx! * Math.sin(a) + dy! * Math.cos(a),
            ]);
            labels.push({
              text,
              minX: Math.min(...points.map((p) => p[0]!)),
              maxX: Math.max(...points.map((p) => p[0]!)),
              minY: Math.min(...points.map((p) => p[1]!)),
              maxY: Math.max(...points.map((p) => p[1]!)),
            });
          },
        },
        {
          fontSize,
          arrow: fontSize * 0.6,
          pad: fontSize * 2.5,
          gap: fontSize,
          stacked: false,
          interactive: fontSize > 3,
          snapScale: fontSize === 3,
        },
      );
      expect(labels).toHaveLength(7);
      expect(labels.some((l) => l.text.includes("°"))).toBe(false);
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i]!,
            b = labels[j]!;
          expect(
            Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 0.1 &&
              Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > 0.1,
            `${a.text} / ${b.text}`,
          ).toBe(false);
        }
    },
  );
  it.each(["inner", "mid", "outer"] as const)(
    "frames the actual sheet rather than the distant apex on the %s surface",
    (surface) => {
      const { view, cut } = development({ surface });
      const b = bounds(view),
        part = bounds({ ...view, prims: [cut] });
      expect(b.maxX - b.minX).toBeCloseTo(part.maxX - part.minX, 4);
      expect(b.maxY - b.minY).toBeCloseTo(part.maxY - part.minY, 4);
    },
  );
  it.each([
    [720, 480, 12, false],
    [326, 600, 11, false],
    [90, 120, 3, true],
  ] as const)(
    "keeps the near-cylindrical blank visible at %i × %i",
    (w, h, fontSize, snapScale) => {
      const { view } = development();
      let sheet: Pt[] = [];
      const sink: Sink = {
        path(points, _closed, _stroke, fill) {
          if (fill) sheet = points;
        },
        fill() {},
        text() {},
      };
      drawViews([view], { x: 0, y: 0, w, h }, sink, {
        fontSize,
        arrow: fontSize * 0.6,
        pad: fontSize * 2.5,
        gap: fontSize,
        stacked: false,
        interactive: !snapScale,
        snapScale,
      });
      const width = Math.max(...sheet.map((p) => p[0])) - Math.min(...sheet.map((p) => p[0]));
      const height = Math.max(...sheet.map((p) => p[1])) - Math.min(...sheet.map((p) => p[1]));
      expect(width).toBeGreaterThan(w * 0.4);
      expect(height).toBeGreaterThan(h * 0.12);
    },
  );
  it.each([
    { dSmall: "2404.99" },
    { dSmall: "1200" },
    { dSmall: "0", surface: "inner" as const },
    { dSmall: "1200", flatEnds: true, flatLength: "30" },
  ])("retains correct bounds for $dSmall mm small ends", (patch) => {
    const { d, view, cut } = development(patch);
    if (d.output?.shape !== "cone") throw Error("No cone");
    const b = bounds(view),
      part = bounds({ ...view, prims: [cut] });
    // The sampled contour stays inside the exact sector envelope, rotated by 90 degrees.
    expect(b.maxY - b.minY).toBeLessThanOrEqual(d.output.result.box.width * (1 + 1e-8));
    expect(b.maxX - b.minX).toBeLessThanOrEqual(d.output.result.box.height * (1 + 1e-8));
    expect(b.minX).toBeLessThanOrEqual(part.minX);
    expect(b.maxX).toBeGreaterThanOrEqual(part.maxX);
    expect(b.minY).toBeLessThanOrEqual(part.minY);
    expect(b.maxY).toBeGreaterThanOrEqual(part.maxY);
  });
});
