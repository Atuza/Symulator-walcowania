import { describe, expect, it } from "vitest";
import { drawViews, standardScale, type Sink, type TextOpts } from "../src/drawing/layout";

describe("standard drawing scales", () => {
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
