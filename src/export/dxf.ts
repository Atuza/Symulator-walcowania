/*
 * Minimal DXF R12 (AC1009) writer. R12 is used on purpose: every CAD/CAM package reads it and it needs
 * no object handles. The cut contour is one closed POLYLINE on layer "cut", colour 1 (red), units mm 1:1.
 */

export interface Vertex {
  x: number;
  y: number;
  /** Bulge of the segment starting at this vertex: tan(sweep / 4), positive = counter-clockwise. */
  bulge: number;
}

export const CUT_LAYER = "cut";
const RED = 1;

const n = (v: number) => {
  const s = v.toFixed(6).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
};

export function dxfDocument(contour: Vertex[]): string {
  const out: string[] = [];
  const g = (code: number, value: string | number) =>
    out.push(String(code), typeof value === "number" ? n(value) : value);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const v of contour) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }

  g(0, "SECTION");
  g(2, "HEADER");
  g(9, "$ACADVER");
  g(1, "AC1009");
  g(9, "$EXTMIN");
  g(10, minX);
  g(20, minY);
  g(30, 0);
  g(9, "$EXTMAX");
  g(10, maxX);
  g(20, maxY);
  g(30, 0);
  g(0, "ENDSEC");

  g(0, "SECTION");
  g(2, "TABLES");
  g(0, "TABLE");
  g(2, "LTYPE");
  g(70, "1");
  g(0, "LTYPE");
  g(2, "CONTINUOUS");
  g(70, "0");
  g(3, "Solid line");
  g(72, "65");
  g(73, "0");
  g(40, 0);
  g(0, "ENDTAB");
  g(0, "TABLE");
  g(2, "LAYER");
  g(70, "1");
  g(0, "LAYER");
  g(2, CUT_LAYER);
  g(70, "0");
  g(62, String(RED));
  g(6, "CONTINUOUS");
  g(0, "ENDTAB");
  g(0, "ENDSEC");

  g(0, "SECTION");
  g(2, "ENTITIES");
  g(0, "POLYLINE");
  g(8, CUT_LAYER);
  g(62, String(RED));
  g(66, "1");
  g(70, "1");
  g(10, 0);
  g(20, 0);
  g(30, 0);
  for (const v of contour) {
    g(0, "VERTEX");
    g(8, CUT_LAYER);
    g(62, String(RED));
    g(10, v.x);
    g(20, v.y);
    g(30, 0);
    if (v.bulge !== 0) g(42, v.bulge);
  }
  g(0, "SEQEND");
  g(8, CUT_LAYER);
  g(0, "ENDSEC");
  g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}

export function rectangleContour(length: number, width: number): Vertex[] {
  return [
    { x: 0, y: 0, bulge: 0 },
    { x: length, y: 0, bulge: 0 },
    { x: length, y: width, bulge: 0 },
    { x: 0, y: width, bulge: 0 },
  ];
}

/**
 * Annular sector symmetric about the y axis, shifted so its bounding box starts at (0, 0).
 * Each arc is split in two so no single bulge approaches the 180° singularity.
 */
export function sectorContour(rInner: number, rOuter: number, angle: number): Vertex[] {
  const a0 = Math.PI / 2 - angle / 2,
    a1 = Math.PI / 2 + angle / 2,
    am = Math.PI / 2;
  const half = Math.tan(angle / 2 / 4);
  const at = (r: number, a: number) => ({ x: r * Math.cos(a), y: r * Math.sin(a) });
  const pts: Vertex[] = [];
  const apex = rInner <= 1e-9;
  pts.push({ ...(apex ? { x: 0, y: 0 } : at(rInner, a0)), bulge: 0 });
  pts.push({ ...at(rOuter, a0), bulge: half });
  pts.push({ ...at(rOuter, am), bulge: half });
  pts.push({ ...at(rOuter, a1), bulge: 0 });
  if (!apex) {
    pts.push({ ...at(rInner, a1), bulge: -half });
    pts.push({ ...at(rInner, am), bulge: -half });
  }

  // Bounding box from the vertices plus the arc extremes (the top point is a vertex, sides may bulge).
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  if (angle > Math.PI) xs.push(-rOuter, rOuter);
  if (angle > Math.PI * 2 - 1e-12) ys.push(-rOuter);
  const minX = Math.min(...xs),
    minY = Math.min(...ys);
  return pts.map((p) => ({ x: p.x - minX, y: p.y - minY, bulge: p.bulge }));
}

/** Perimeter of a closed bulge polyline. */
export function contourLength(contour: Vertex[]): number {
  let total = 0;
  contour.forEach((v, i) => {
    const w = contour[(i + 1) % contour.length]!;
    const chord = Math.hypot(w.x - v.x, w.y - v.y);
    if (v.bulge === 0) total += chord;
    else {
      const sweep = 4 * Math.atan(Math.abs(v.bulge));
      total += (chord * sweep) / (2 * Math.sin(sweep / 2));
    }
  });
  return total;
}
