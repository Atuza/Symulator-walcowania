import { bounds, type DimensionId, type Prim, type Pt, type Stroke, type View } from "./model";

/** Output surface in screen units (px for SVG, mm for PDF), y pointing down. */
export interface Sink {
  path(pts: Pt[], closed: boolean, stroke: Stroke | "dim", fill?: boolean): void;
  fill(pts: Pt[]): void;
  text(x: number, y: number, text: string, opts: TextOpts): void;
  /** Width in the sink's output units, using the drawing-note font. */
  textWidth?(text: string, size: number): number;
}

export interface TextOpts {
  size: number;
  anchor: "start" | "middle" | "end";
  /** Rotation in degrees, clockwise on screen. */
  angle?: number;
  role: "title" | "dim" | "note";
  edit?: DimensionId;
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
  /** Round each view down to a standard scale (1:5, 1:10, 1:20…) so the sheet states a true scale. */
  snapScale?: boolean;
  /** Explicit orientation for a scrollable interactive canvas. */
  stacked?: boolean;
  interactive?: boolean;
}

// Preferred scales for technical drawings (ISO 5455), as the denominator of 1:n.
const STANDARD_SCALES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/**
 * Places the views side by side (or stacked when the box is tall) and draws them.
 * Returns each view's scale as output units per model mm (for a PDF in mm: 1 / n of 1:n).
 */
export function drawViews(views: View[], box: Box, sink: Sink, style: LayoutStyle): number[] {
  const minimumFeatureCell = Math.max(
    0,
    ...views.map((view) => {
      const tags = view.prims.filter((p) => p.kind === "tag");
      if (!tags.length) return 0;
      const labelWidth = Math.max(
        ...tags.map(
          (p) =>
            sink.textWidth?.(p.label, style.fontSize) ?? p.label.length * style.fontSize * 0.62,
        ),
      );
      return (
        2 * (labelWidth + 3 * style.fontSize) + 2 * style.pad + style.gap + 12 * style.fontSize
      );
    }),
  );
  const stacked =
    style.stacked ??
    (box.h > box.w * 0.9 || (views.length > 1 && box.w / views.length < minimumFeatureCell));
  return views.map((view, i) => {
    const n = views.length;
    const cell: Box = stacked
      ? { x: box.x, y: box.y + (box.h / n) * i, w: box.w, h: box.h / n }
      : { x: box.x + (box.w / n) * i, y: box.y, w: box.w / n, h: box.h };
    return drawView(view, cell, sink, style);
  });
}

/** Largest standard scale that still fits: the denominator is rounded up. */
export function standardScale(fit: number): number {
  const n = 1 / fit;
  const std = STANDARD_SCALES.find((d) => d >= n - 1e-9);
  return std ? 1 / std : fit;
}

function drawView(view: View, cell: Box, sink: Sink, s: LayoutStyle): number {
  const occupied: Box[] = [];
  const original = sink;
  sink = {
    ...original,
    text(x, y, text, o) {
      if (o.role === "dim") {
        const w = (original.textWidth?.(text, o.size) ?? text.length * o.size * 0.62) + o.size,
          h = s.interactive && o.edit ? Math.max(24, o.size * 1.8) : o.size * 1.8,
          a = ((o.angle ?? 0) * Math.PI) / 180;
        const width = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)),
          height = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
        occupied.push({ x: x - width / 2, y: y - height * 0.8, w: width, h: height });
      }
      original.text(x, y, text, o);
    },
  };
  const titleH = s.fontSize * 1.8;
  const noteSize = s.fontSize * 0.92;
  const measure = (text: string) =>
    sink.textWidth?.(text, noteSize) ?? text.length * noteSize * 0.62;
  const notes = view.notes.flatMap((note) => {
    const { text, edit } = typeof note === "string" ? { text: note, edit: undefined } : note;
    return wrapNote(text, cell.w - s.gap, measure).map((text) => ({ text, edit }));
  });
  const pitch = (edit?: DimensionId) =>
    s.interactive && edit ? Math.max(28, s.fontSize * 1.5) : s.fontSize * 1.5;
  let notesH = notes.reduce((sum, n) => sum + pitch(n.edit), 0);
  const tags = view.prims.filter((p): p is Extract<Prim, { kind: "tag" }> => p.kind === "tag");
  const tagWidth = Math.max(
    0,
    ...tags.map(
      (p) =>
        (sink.textWidth?.(p.label, s.fontSize) ?? p.label.length * s.fontSize * 0.62) + s.fontSize,
    ),
  );
  // Dedicated gutters keep every feature value away from the part and its overall dimensions.
  const gutter = tags.length ? tagWidth + s.fontSize * 2 : 0;
  const dimensionOffset = Math.max(
    1.8,
    ...view.prims.map((p) => ("offsetScreen" in p ? Math.abs(p.offsetScreen) : 0)),
  );
  const padY = Math.max(s.pad, s.fontSize * (dimensionOffset + 1.6));
  const padX = Math.max(s.pad, s.fontSize * 3.4);
  const area: Box = {
    x: cell.x + padX + gutter,
    y: cell.y + titleH + padY,
    w: cell.w - 2 * padX - s.gap - 2 * gutter,
    h: cell.h - titleH - notesH - 2 * padY,
  };
  const b = bounds(view);
  const bw = Math.max(b.maxX - b.minX, 1e-6),
    bh = Math.max(b.maxY - b.minY, 1e-6);
  const chains = view.prims.filter(
    (p): p is Extract<Prim, { kind: "dim" }> => p.kind === "dim" && !!p.chain,
  );
  const trialFit = Math.min(area.w / bw, area.h / bh);
  const trialScale = s.snapScale ? standardScale(trialFit) : trialFit;
  const showChains = chains.every(
    (p) =>
      Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) * trialScale >=
      (sink.textWidth?.(p.label, s.fontSize) ?? p.label.length * s.fontSize * 0.62) +
        s.fontSize * 1.5,
  );
  if (!showChains) {
    const caption = `${chains[0]!.chain}: ${chains.map((p) => p.label).join(" · ")}`;
    notes.push(
      ...wrapNote(caption, cell.w - s.gap, measure).map((text) => ({ text, edit: undefined })),
    );
    notesH = notes.reduce((sum, n) => sum + pitch(n.edit), 0);
    area.h = cell.h - titleH - notesH - 2 * padY;
  }
  sink.text(cell.x, cell.y + s.fontSize, view.title, {
    size: s.fontSize,
    anchor: "start",
    role: "title",
  });
  let noteY = cell.y + cell.h - notesH;
  notes.forEach((note) => {
    sink.text(cell.x, noteY + s.fontSize * 1.1, note.text, {
      size: noteSize,
      anchor: "start",
      role: "note",
      edit: note.edit,
    });
    noteY += pitch(note.edit);
  });
  if (area.w <= 0 || area.h <= 0) return 0;

  const fit = Math.min(area.w / bw, area.h / bh);
  const scale = s.snapScale ? standardScale(fit) : fit;
  const ox = area.x + (area.w - bw * scale) / 2;
  const oy = area.y + (area.h - bh * scale) / 2;
  const map = ([x, y]: Pt): Pt => [ox + (x - b.minX) * scale, oy + (b.maxY - y) * scale];

  for (const p of view.prims) {
    if (p.kind === "tag") continue;
    if (p.kind === "dim" && p.chain && !showChains) continue;
    if (p.kind === "path") {
      sink.path(p.pts.map(map), p.closed, p.stroke, p.fill);
      continue;
    }
    if (p.kind === "arcDim") {
      drawArcDim(p, map, scale, sink, s);
      continue;
    }
    if (p.kind === "curveDim") {
      drawCurveDim(p, map, sink, s);
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
      p.edit,
    );
  }
  if (tags.length) {
    const groups = new Map<string, { at: Pt; tags: typeof tags; box: Box; left: boolean }>();
    const centreX = (b.minX + b.maxX) / 2;
    let leftCount = 0,
      rightCount = 0;
    for (const tag of tags) {
      const key = tag.at.map((n) => n.toFixed(6)).join(",");
      const existing = groups.get(key);
      if (existing) {
        existing.tags.push(tag);
        continue;
      }
      const left =
        Math.abs(tag.at[0] - centreX) < 1e-6 ? leftCount <= rightCount : tag.at[0] < centreX;
      if (left) leftCount++;
      else rightCount++;
      groups.set(key, {
        at: map(tag.at),
        tags: [tag],
        box: { x: 0, y: 0, w: tagWidth, h: 0 },
        left,
      });
    }
    const top = cell.y + titleH + s.fontSize;
    const bottom = cell.y + cell.h - notesH - s.fontSize;
    const row = s.interactive ? Math.max(28, s.fontSize * 2.2) : s.fontSize * 1.8;
    const arranged = [...groups.values()];
    for (const left of [true, false]) {
      const column = arranged.filter((g) => g.left === left).sort((a, b) => a.at[1] - b.at[1]);
      let cursor = top;
      for (const group of column) {
        group.box.h = group.tags.length * row;
        group.box.x = left
          ? cell.x + s.fontSize * 0.5
          : cell.x + cell.w - s.gap - tagWidth - s.fontSize * 0.5;
        group.box.y = Math.max(
          cursor,
          Math.min(bottom - group.box.h, group.at[1] - group.box.h / 2),
        );
        cursor = group.box.y + group.box.h + s.fontSize * 0.5;
      }
      cursor = bottom;
      for (const group of [...column].reverse()) {
        group.box.y = Math.min(group.box.y, cursor - group.box.h);
        cursor = group.box.y - s.fontSize * 0.5;
      }
    }
    const obstacles = [...occupied, ...arranged.map((g) => g.box)];
    const leaders: Pt[][] = [];
    for (const group of arranged) {
      const box = group.box;
      const edge: Pt = [group.left ? box.x + box.w : box.x, box.y + box.h / 2];
      const path = routeLeader(
        group.at,
        edge,
        obstacles.filter((o) => o !== box),
        leaders,
        s.fontSize * 0.25,
      );
      sink.path(path, false, "thin");
      leaders.push(path);
    }
    for (const group of arranged)
      group.tags.forEach((tag, i) => {
        original.text(group.box.x + group.box.w / 2, group.box.y + row * (i + 0.7), tag.label, {
          size: s.fontSize,
          anchor: "middle",
          role: "dim",
          edit: tag.edit,
        });
      });
  }
  return scale;
}

/** Visibility routing keeps a leader out of every label, including labels in the other gutter. */
function routeLeader(start: Pt, end: Pt, labels: Box[], previous: Pt[][], margin: number): Pt[] {
  const boxes = labels.map((b) => ({
    x: b.x - margin,
    y: b.y - margin,
    w: b.w + margin * 2,
    h: b.h + margin * 2,
  }));
  const inside = (p: Pt, b: Box) =>
    p[0] > b.x + 1e-6 && p[0] < b.x + b.w - 1e-6 && p[1] > b.y + 1e-6 && p[1] < b.y + b.h - 1e-6;
  const blocked = (a: Pt, b: Pt, box: Box) => {
    let low = 0,
      high = 1;
    for (const [origin, delta, min, max] of [
      [a[0], b[0] - a[0], box.x, box.x + box.w],
      [a[1], b[1] - a[1], box.y, box.y + box.h],
    ]) {
      if (Math.abs(delta!) < 1e-9) {
        if (origin! <= min! + 1e-6 || origin! >= max! - 1e-6) return false;
      } else {
        const t0 = (min! - origin!) / delta!,
          t1 = (max! - origin!) / delta!;
        low = Math.max(low, Math.min(t0, t1) + 1e-8);
        high = Math.min(high, Math.max(t0, t1) - 1e-8);
      }
    }
    return low < high;
  };
  const cross = (a: Pt, b: Pt, c: Pt, d: Pt) => {
    const side = (p: Pt, q: Pt, r: Pt) =>
      (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return side(a, b, c) * side(a, b, d) < -1e-8 && side(c, d, a) * side(c, d, b) < -1e-8;
  };
  const nodes: Pt[] = [
    start,
    end,
    ...boxes.flatMap(
      (b) =>
        [
          [b.x, b.y],
          [b.x + b.w, b.y],
          [b.x, b.y + b.h],
          [b.x + b.w, b.y + b.h],
        ] as Pt[],
    ),
  ].filter((p, i) => i < 2 || !boxes.some((b) => inside(p, b)));
  const distance = nodes.map(() => Infinity),
    parent = nodes.map(() => -1),
    done = new Set<number>();
  distance[0] = 0;
  while (!done.has(1)) {
    let next = -1;
    for (let i = 0; i < nodes.length; i++)
      if (!done.has(i) && (next < 0 || distance[i]! < distance[next]!)) next = i;
    if (next < 0 || !Number.isFinite(distance[next])) return [start, end];
    done.add(next);
    for (let i = 0; i < nodes.length; i++) {
      if (done.has(i)) continue;
      const a = nodes[next]!,
        b = nodes[i]!;
      if (boxes.some((box) => blocked(a, b, box))) continue;
      const crossings = previous.reduce(
        (sum, path) => sum + path.slice(1).filter((p, j) => cross(a, b, path[j]!, p)).length,
        0,
      );
      const cost =
        distance[next]! + Math.hypot(b[0] - a[0], b[1] - a[1]) + crossings * margin * 100;
      if (cost < distance[i]!) {
        distance[i] = cost;
        parent[i] = next;
      }
    }
  }
  const path: Pt[] = [];
  for (let i = 1; i >= 0; i = parent[i]!) path.unshift(nodes[i]!);
  return path;
}

/** Wrap annotations to their own view so they cannot run into another view or the sheet edge. */
function wrapNote(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && measure(`${line} ${word}`) > width) {
      lines.push(line);
      line = "";
    }
    if (measure(word) > width) {
      for (const char of word) {
        if (line && measure(line + char) > width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    } else line += `${line ? " " : ""}${word}`;
  }
  if (line) lines.push(line);
  return lines;
}

/** Follow the actual numerical edge and put its value halfway along its length. */
function drawCurveDim(
  p: Extract<Prim, { kind: "curveDim" }>,
  map: (pt: Pt) => Pt,
  sink: Sink,
  s: LayoutStyle,
) {
  const edge = p.pts.map(map);
  if (edge.length < 2) return;
  const direction = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy) || 1;
    return [dx / length, dy / length];
  };
  const off = p.offsetScreen * s.fontSize;
  const normal = edge.map((_pt, i): Pt => {
    const [ux, uy] = direction(edge[Math.max(0, i - 1)]!, edge[Math.min(edge.length - 1, i + 1)]!);
    return [uy, -ux];
  });
  const pts = edge.map(([x, y], i): Pt => [x + normal[i]![0] * off, y + normal[i]![1] * off]);
  const lengths = [0];
  for (let i = 1; i < pts.length; i++)
    lengths.push(
      lengths[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]),
    );
  const total = lengths.at(-1)!;
  if (total < 1e-6) return;
  for (const i of [0, edge.length - 1]) {
    const over = off + Math.sign(off) * s.arrow * 0.8;
    sink.path(
      [edge[i]!, [edge[i]![0] + normal[i]![0] * over, edge[i]![1] + normal[i]![1] * over]],
      false,
      "dim",
    );
  }
  sink.path(pts, false, "dim");
  const [sx, sy] = direction(pts[1]!, pts[0]!),
    [ex, ey] = direction(pts.at(-2)!, pts.at(-1)!);
  arrowHead(sink, pts[0]!, sx, sy, s.arrow);
  arrowHead(sink, pts.at(-1)!, ex, ey, s.arrow);
  const j = Math.max(
    1,
    lengths.findIndex((v) => v >= total / 2),
  );
  const a = pts[j - 1]!,
    b = pts[j]!,
    fraction = (total / 2 - lengths[j - 1]!) / (lengths[j]! - lengths[j - 1]! || 1);
  const mid: Pt = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
  const [ux, uy] = direction(a, b),
    side = off < 0 ? -1 : 1;
  placeLabel(sink, s, mid, ux, uy, uy * side, -ux * side, p.label, p.edit);
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
  placeLabel(sink, s, mid, ux, uy, ox * side, oy * side, p.label, p.edit);
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
  edit?: DimensionId,
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
    edit,
  });
}

function arrowHead(sink: Sink, tip: Pt, dx: number, dy: number, size: number) {
  const bx = tip[0] - dx * size,
    by = tip[1] - dy * size;
  const w = size * 0.32;
  sink.fill([tip, [bx - dy * w, by + dx * w], [bx + dy * w, by - dx * w]]);
}
