import { describe, expect, it } from "vitest";
import { drawViews, standardScale, type Sink, type TextOpts } from "../src/drawing/layout";
import { emptyMachine } from "../src/domain/calculate";
import { materials } from "../src/domain/materials/data";
import { buildViews } from "../src/drawing/build";
import { defaultInputs, shapeDefaults } from "../src/state/inputs";
import { derive } from "../src/state/derive";
import { defaultProcess } from "../src/state/config";
import type { Pt } from "../src/drawing/model";

describe("standard drawing scales", () => {
  it("fits both dense rectangle views on a full A4 drawing page", () => {
    const d = derive(
      { ...defaultInputs, shape: "rect", ...shapeDefaults.rect, thickness: "9.9", width: "2500" },
      emptyMachine,
      defaultProcess,
      materials,
    );
    let blanks = 0;
    const scales = drawViews(
      buildViews(d.output!, d.width, d.inputs.surface),
      { x: 12, y: 30, w: 273, h: 160 },
      {
        path(_p, _c, _s, fill) {
          if (fill) blanks++;
        },
        fill() {},
        text() {},
      },
      { fontSize: 3, arrow: 2.2, pad: 9, gap: 4, snapScale: true },
    );
    expect(scales).toHaveLength(2);
    expect(scales.every((s) => s > 0)).toBe(true);
    expect(blanks).toBe(1);
  });
  it("rounds the fitting scale down to the next standard ratio", () => {
    // Fits at 1:17.3 → 1:20; at exactly 1:50 stays 1:50; 1:2.2 has to go to 1:5.
    expect(1 / standardScale(1 / 17.3)).toBe(20);
    expect(1 / standardScale(1 / 50)).toBe(50);
    expect(1 / standardScale(1 / 2.2)).toBe(5);
  });

  it("never enlarges past the fitting scale", () => {
    for (const n of [1.2, 3, 7, 33, 120, 640])
      expect(standardScale(1 / n)).toBeLessThanOrEqual(1 / n);
  });
});

describe("drawing annotations", () => {
  it("breaks crowded interval guides around numeric labels instead of crossing their text", () => {
    const d = derive(
      { ...defaultInputs, shape: "rect", ...shapeDefaults.rect, surface: "outer", thickness: "20" },
      emptyMachine,
      defaultProcess,
      materials,
    );
    const view = buildViews(d.output!, d.width, d.inputs.surface)[1]!;
    const paths: Pt[][] = [],
      labels: { x: number; y: number; w: number; h: number }[] = [];
    drawViews(
      [view],
      { x: 0, y: 0, w: 600, h: 450 },
      {
        fill() {},
        path(pts, _closed, stroke) {
          if (stroke === "dim") paths.push(pts);
        },
        text(x, y, text, o) {
          if (o.role !== "dim") return;
          const w = text.length * o.size * 0.62,
            a = ((o.angle ?? 0) * Math.PI) / 180;
          const corners = [
            [-w / 2, -o.size],
            [w / 2, -o.size],
            [w / 2, 0],
            [-w / 2, 0],
          ].map(([dx, dy]) => [
            x + dx! * Math.cos(a) - dy! * Math.sin(a),
            y + dx! * Math.sin(a) + dy! * Math.cos(a),
          ]);
          const xs = corners.map((p) => p[0]!),
            ys = corners.map((p) => p[1]!);
          labels.push({
            x: Math.min(...xs),
            y: Math.min(...ys),
            w: Math.max(...xs) - Math.min(...xs),
            h: Math.max(...ys) - Math.min(...ys),
          });
        },
      },
      { fontSize: 12, arrow: 7, pad: 30, gap: 16, interactive: true },
    );
    expect(labels).toHaveLength(view.prims.filter((p) => p.kind === "dim").length);
    for (const pts of paths)
      for (let i = 1; i < pts.length; i++)
        for (let j = 1; j < 60; j++) {
          const a = pts[i - 1]!,
            b = pts[i]!,
            x = a[0] + ((b[0] - a[0]) * j) / 60,
            y = a[1] + ((b[1] - a[1]) * j) / 60;
          expect(
            labels.some(
              (l) =>
                x > l.x + 0.01 && x < l.x + l.w - 0.01 && y > l.y + 0.01 && y < l.y + l.h - 0.01,
            ),
          ).toBe(false);
        }
  });
  it("retains crowded developed intervals at their dimension lines in separate lanes", () => {
    const d = derive(
      { ...defaultInputs, shape: "ushape", ...shapeDefaults.ushape },
      emptyMachine,
      defaultProcess,
      materials,
    );
    if (!d.output) throw Error("No output");
    const view = buildViews(d.output, d.width, d.inputs.surface)[1]!;
    const chains = view.prims.filter((p) => p.kind === "dim").filter((p) => p.chain);
    expect(chains.length).toBeGreaterThan(1);
    const notes: string[] = [],
      dims: string[] = [];
    drawViews(
      [view],
      { x: 0, y: 0, w: 300, h: 300 },
      {
        path() {},
        fill() {},
        text(_x, _y, text, o) {
          if (o.role === "note") notes.push(text);
          else if (o.role === "dim") dims.push(text);
        },
      },
      { fontSize: 12, arrow: 7, pad: 30, gap: 16, interactive: true },
    );
    for (const p of chains) {
      expect(dims).toContain(p.label);
    }
    expect(notes).toEqual([]);
  });
  it("stacks a crowded A4 drawing instead of shrinking the part between its labels", () => {
    const d = derive(
      { ...defaultInputs, shape: "rect", ...shapeDefaults.rect },
      emptyMachine,
      defaultProcess,
      materials,
    );
    if (!d.output) throw Error("No output");
    const scales = drawViews(
      buildViews(d.output, d.width, d.inputs.surface),
      { x: 0, y: 0, w: 150, h: 125 },
      { path() {}, fill() {}, text() {} },
      { fontSize: 3, arrow: 2, pad: 9, gap: 4, snapScale: true },
    );
    expect(scales[0]).toBeGreaterThanOrEqual(1 / 50);
  });
  it.each(["rect", "ushape", "obround", "tank", "halfround", "bucket", "free"] as const)(
    "keeps every %s feature label separate on screen and paper",
    (shape) => {
      const d = derive(
        { ...defaultInputs, shape, ...shapeDefaults[shape] },
        emptyMachine,
        defaultProcess,
        materials,
      );
      if (!d.output) throw Error("No output");
      const view = buildViews(d.output, d.width, d.inputs.surface)[0]!;
      const features = view.prims.filter((p) => p.kind === "tag");
      expect(features.length).toBeGreaterThan(0);
      if (["rect", "ushape", "obround", "tank"].includes(shape))
        expect(
          features.some((p) => p.edit.endsWith(".angle") || p.edit.endsWith(".interior")),
        ).toBe(false);
      for (const [w, h, fontSize] of [
        [700, 600, 12],
        [326, 600, 11],
        [92, 140, 3],
      ]) {
        const text: { x: number; y: number; w: number; h: number; feature: boolean }[] = [];
        const paths: { pts: Pt[]; leader: boolean }[] = [];
        let ordinaryDimensions = 0;
        const sink: Sink = {
          path(pts, _closed, stroke) {
            paths.push({ pts, leader: ordinaryDimensions >= 2 && stroke === "thin" });
          },
          fill() {},
          text(x, y, label, o) {
            if (o.role !== "dim") return;
            const feature = !!o.edit?.startsWith("segment.");
            if (!feature) ordinaryDimensions++;
            const width = label.length * o.size * 0.62,
              height = o.size;
            const a = ((o.angle ?? 0) * Math.PI) / 180;
            const bw = Math.abs(width * Math.cos(a)) + Math.abs(height * Math.sin(a));
            const bh = Math.abs(width * Math.sin(a)) + Math.abs(height * Math.cos(a));
            text.push({ x: x - bw / 2, y: y - bh * 0.8, w: bw, h: bh, feature });
          },
        };
        drawViews([view], { x: 0, y: 0, w: w!, h: h! }, sink, {
          fontSize: fontSize!,
          arrow: fontSize! * 0.6,
          pad: fontSize! * 2.5,
          gap: fontSize!,
          stacked: false,
          interactive: fontSize! > 3,
        });
        const rendered = text.filter((t) => t.feature);
        expect(rendered).toHaveLength(features.length);
        for (const a of rendered) {
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.y).toBeGreaterThanOrEqual(0);
          expect(a.x + a.w).toBeLessThanOrEqual(w!);
          expect(a.y + a.h).toBeLessThanOrEqual(h!);
          for (const b of text.filter((b) => b !== a))
            expect(
              Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 &&
                Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01,
            ).toBe(false);
        }
        // Leader sampling tests the rendered path against every actual text rectangle.
        for (const path of paths.filter((p) => p.leader))
          for (let j = 1; j < path.pts.length; j++) {
            const a = path.pts[j - 1]!,
              b = path.pts[j]!;
            for (let k = 1; k < 100; k++) {
              const x = a[0] + ((b[0] - a[0]) * k) / 100,
                y = a[1] + ((b[1] - a[1]) * k) / 100;
              const hit = text.find(
                (t) =>
                  x > t.x + 0.01 && x < t.x + t.w - 0.01 && y > t.y + 0.01 && y < t.y + t.h - 0.01,
              );
              expect(hit, JSON.stringify({ shape, w, fontSize, a, b, x, y, hit })).toBeUndefined();
            }
          }
      }
    },
  );
  it("wraps long notes inside each view without changing their content", () => {
    const notes: { x: number; text: string; options: TextOpts }[] = [];
    const sink: Sink = {
      path() {},
      fill() {},
      text(x, _y, text, options) {
        if (options.role === "note") notes.push({ x, text, options });
      },
      textWidth(text, size) {
        return text.length * size * 0.6;
      },
    };
    const text = "Shortest generator 1250.00 mm · Longest generator 1265.90 mm";
    drawViews(
      [0, 1].map(() => ({
        title: "Development",
        prims: [
          {
            kind: "path",
            pts: [
              [0, 0],
              [100, 50],
            ],
            closed: false,
            stroke: "part",
          },
        ],
        notes: [text],
      })),
      { x: 10, y: 10, w: 180, h: 120 },
      sink,
      { fontSize: 3, arrow: 2, pad: 9, gap: 4 },
    );
    for (const x of [10, 100]) {
      const lines = notes.filter((n) => n.x === x);
      expect(lines.length).toBeGreaterThan(1);
      expect(lines.map((n) => n.text).join(" ")).toBe(text);
      for (const line of lines)
        expect(sink.textWidth!(line.text, line.options.size)).toBeLessThanOrEqual(86);
    }
  });
});
