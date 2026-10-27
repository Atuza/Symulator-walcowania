import { bounds, type Prim, type Pt, type Stroke, type View } from "./model";

/** Output surface in screen units (px for SVG, mm for PDF), y pointing down. */
export interface Sink {
  path(pts: Pt[], closed: boolean, stroke: Stroke | "dim", fill?: boolean): void;
  fill(pts: Pt[]): void;
  text(x: number, y: number, text: string, opts: TextOpts): void;
}

export interface TextOpts {
  size: number;
  anchor: "start" | "middle" | "end";
  /** Rotation in degrees, clockwise on screen. */
  angle?: number;
  role: "title" | "dim" | "note";
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutStyle {
  fontSize: number;
  arrow: number;
  /** Space reserved around the part for dimensions. */
  pad: number;
  gap: number;
}

/** Places the views side by side (or stacked when the box is tall) and draws them. */
export function drawViews(views: View[], box: Box, sink: Sink, style: LayoutStyle) {
  const stacked = box.h > box.w * 0.9;
  views.forEach((view, i) => {
    const n = views.length;
    const cell: Box = stacked
      ? { x: box.x, y: box.y + (box.h / n) * i, w: box.w, h: box.h / n }
      : { x: box.x + (box.w / n) * i, y: box.y, w: box.w / n, h: box.h };
    drawView(view, cell, sink, style);
  });
}

function drawView(view: View, cell: Box, sink: Sink, s: LayoutStyle) {
  const titleH = s.fontSize * 1.8;
  const notesH = view.notes.length * s.fontSize * 1.5;
  const area: Box = {
    x: cell.x + s.pad,
    y: cell.y + titleH + s.pad,
    w: cell.w - 2 * s.pad - s.gap,
    h: cell.h - titleH - notesH - 2 * s.pad,
  };
  sink.text(cell.x, cell.y + s.fontSize, view.title, {
    size: s.fontSize,
    anchor: "start",
    role: "title",
  });
  view.notes.forEach((note, i) =>
    sink.text(cell.x, cell.y + cell.h - notesH + s.fontSize * (1.1 + 1.5 * i), note, {
      size: s.fontSize * 0.92,
      anchor: "start",
      role: "note",
    }),
  );
  if (area.w <= 0 || area.h <= 0) return;

  const b = bounds(view);
  const bw = Math.max(b.maxX - b.minX, 1e-6),
    bh = Math.max(b.maxY - b.minY, 1e-6);
  const scale = Math.min(area.w / bw, area.h / bh);
  const ox = area.x + (area.w - bw * scale) / 2;
  const oy = area.y + (area.h - bh * scale) / 2;
  const map = ([x, y]: Pt): Pt => [ox + (x - b.minX) * scale, oy + (b.maxY - y) * scale];

  for (const p of view.prims) {
    if (p.kind === "path") {
      sink.path(p.pts.map(map), p.closed, p.stroke, p.fill);
      continue;
    }
    if (p.kind === "arcDim") {
      drawArcDim(p, map, scale, sink, s);
      continue;
    }
    const a = map(p.a),
      bb = map(p.b);
    const dx = bb[0] - a[0],
      dy = bb[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ux = dx / len,
      uy = dy / len;
    // Left normal of a→b in model space becomes (uy, -ux) once y is flipped for the screen.
    const nx = uy,
      ny = -ux;
    const off = p.offsetModel * scale + p.offsetScreen * s.fontSize;
    const a2: Pt = [a[0] + nx * off, a[1] + ny * off];
    const b2: Pt = [bb[0] + nx * off, bb[1] + ny * off];
    if (Math.abs(off) > 0.5) {
      const over = Math.sign(off) * s.arrow * 0.8;
      sink.path([a, [a2[0] + nx * over, a2[1] + ny * over]], false, "dim");
      sink.path([bb, [b2[0] + nx * over, b2[1] + ny * over]], false, "dim");
    }
    sink.path([a2, b2], false, "dim");
    arrowHead(sink, a2, -ux, -uy, s.arrow);
    arrowHead(sink, b2, ux, uy, s.arrow);
    // The label goes on the side of the line facing away from the part (the offset direction).
    const side = off >= 0 ? 1 : -1;
    placeLabel(
      sink,
      s,
      [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2],
      ux,
      uy,
      nx * side,
      ny * side,
      p.label,
    );
  }
}

function drawArcDim(
  p: Extract<Prim, { kind: "arcDim" }>,
  map: (pt: Pt) => Pt,
  scale: number,
  sink: Sink,
  s: LayoutStyle,
) {
  const rr = p.r + (p.offsetScreen * s.fontSize) / scale;
  if (!(rr > 0)) return;
  const at = (r: number, a: number): Pt =>
    map([p.c[0] + r * Math.cos(a), p.c[1] + r * Math.sin(a)]);
  const n = 64;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) pts.push(at(rr, p.a0 + ((p.a1 - p.a0) * i) / n));
  if (Math.abs(rr - p.r) * scale > 0.5) {
    const over = (Math.sign(rr - p.r) * s.arrow * 0.8) / scale;
    for (const a of [p.a0, p.a1]) sink.path([at(p.r, a), at(rr + over, a)], false, "dim");
  }
  sink.path(pts, false, "dim");
  const dir = (from: Pt, to: Pt): [number, number] => {
    const dx = to[0] - from[0],
      dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };
  const [sx, sy] = dir(pts[1]!, pts[0]!);
  const [ex, ey] = dir(pts[n - 1]!, pts[n]!);
  arrowHead(sink, pts[0]!, sx, sy, s.arrow);
  arrowHead(sink, pts[n]!, ex, ey, s.arrow);
  const mid = pts[n / 2]!;
  const [ux, uy] = dir(pts[n / 2 - 1]!, pts[n / 2 + 1]!);
  const centre = map(p.c);
  // Labels sit on the outer side of the arc unless the dimension was pushed inwards.
  const [ox, oy] = dir(centre, mid);
  const side = p.offsetScreen < 0 ? -1 : 1;
  placeLabel(sink, s, mid, ux, uy, ox * side, oy * side, p.label);
}

/** Puts a dimension label along direction (ux, uy) on the side given by the unit vector (ax, ay). */
function placeLabel(
  sink: Sink,
  s: LayoutStyle,
  mid: Pt,
  ux: number,
  uy: number,
  ax: number,
  ay: number,
  label: string,
) {
  let angle = (Math.atan2(uy, ux) * 180) / Math.PI;
  // Keep labels readable: vertical text reads bottom-to-top, as on drawings.
  if (angle >= 90 || angle < -90) angle += angle > 0 ? -180 : 180;
  const rad = (angle * Math.PI) / 180;
  // Screen direction of "up" for the rotated text.
  const upx = Math.sin(rad),
    upy = -Math.cos(rad);
  const awayIsUp = upx * ax + upy * ay >= 0;
  // Text grows upwards from its baseline, so below-the-line labels shift by a full line height.
  const lift = awayIsUp ? s.fontSize * 0.35 : -s.fontSize * 1.05;
  sink.text(mid[0] + upx * lift, mid[1] + upy * lift, label, {
    size: s.fontSize,
    anchor: "middle",
    angle,
    role: "dim",
  });
}

function arrowHead(sink: Sink, tip: Pt, dx: number, dy: number, size: number) {
  const bx = tip[0] - dx * size,
    by = tip[1] - dy * size;
  const w = size * 0.32;
  sink.fill([tip, [bx - dy * w, by + dx * w], [bx + dy * w, by - dx * w]]);
}
