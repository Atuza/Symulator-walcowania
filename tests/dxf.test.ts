import { describe, expect, it } from "vitest";
import { contourLength, dxfDocument, rectangleContour, sectorContour } from "../src/export/dxf";

function pairs(doc: string): [string, string][] {
  const lines = doc.split("\r\n").filter((l, i, all) => i < all.length - 1 || l !== "");
  expect(lines.length % 2).toBe(0);
  const out: [string, string][] = [];
  for (let i = 0; i < lines.length; i += 2) out.push([lines[i]!.trim(), lines[i + 1]!]);
  return out;
}

describe("dxf", () => {
  it("writes one closed red polyline on layer cut", () => {
    const doc = dxfDocument(rectangleContour(3173.01, 2000));
    const p = pairs(doc);
    expect(p.at(-1)).toEqual(["0", "EOF"]);
    expect(p.filter(([c, v]) => c === "0" && v === "POLYLINE")).toHaveLength(1);
    expect(p.filter(([c, v]) => c === "0" && v === "VERTEX")).toHaveLength(4);
    const layer = p.findIndex(([c, v]) => c === "0" && v === "LAYER");
    expect(p[layer + 1]).toEqual(["2", "cut"]);
    expect(p.slice(layer, layer + 6)).toContainEqual(["62", "1"]);
    const poly = p.findIndex(([c, v]) => c === "0" && v === "POLYLINE");
    expect(p.slice(poly, poly + 6)).toContainEqual(["70", "1"]);
    expect(doc).toContain("3173.01");
    expect(doc).toContain("AC1009");
  });

  it("keeps the rectangle perimeter", () => {
    expect(contourLength(rectangleContour(3000, 1500))).toBeCloseTo(9000, 9);
  });

  it("builds an exact sector perimeter with bulges", () => {
    for (const [r2, r1, a] of [
      [300, 900, 2.1],
      [0, 800, 1.2],
      [1000, 1400, 5.9],
    ] as const) {
      const c = sectorContour(r2, r1, a);
      const expected = r1 * a + r2 * a + 2 * (r1 - r2);
      expect(contourLength(c)).toBeCloseTo(expected, 6);
      expect(Math.min(...c.map((v) => v.x))).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.min(...c.map((v) => v.y))).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});
