import type { jsPDF as JsPdf } from "jspdf";
import { drawViews, type Sink } from "../drawing/layout";
import type { View } from "../drawing/model";
import { t } from "../i18n";
import type { Row } from "../ui/rows";
import regularUrl from "./fonts/Poppins-Regular.ttf?url";
import mediumUrl from "./fonts/Poppins-Medium.ttf?url";

export interface ReportData {
  appName: string;
  date: string;
  fields: { label: string; value: string }[];
  inputs: Row[];
  heroes: Row[];
  groups: { title: string; rows: Row[] }[];
  warnings: string[];
  views: View[];
  /** Link back to this calculation, printed as a QR code. */
  qr: { matrix: boolean[][]; caption: string } | null;
  version: string;
  paper: Paper;
  /** Part identity for the title block. */
  part: { material: string; thickness: string; mass: string };
}

export type Paper = "a4" | "a3";

const PAPER: Record<Paper, { w: number; h: number; colW: number }> = {
  a4: { w: 297, h: 210, colW: 112 },
  a3: { w: 420, h: 297, colW: 130 },
};
const MARGIN = 12;
const INK = [20, 20, 22] as const;
const MUTED = [110, 108, 104] as const;
const LINE = [205, 202, 195] as const;
const ACCENT = [236, 103, 43] as const;
// Neon green on screen; a darker green keeps it legible when printed.
const FLAT = [0, 150, 40] as const;

async function fontBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Landscape rolling sheet (A4 or A3) with a title block. jsPDF is loaded only on request. */
export async function buildPdf(data: ReportData): Promise<Blob> {
  const [{ jsPDF }, regular, medium] = await Promise.all([
    import("jspdf"),
    fontBase64(regularUrl),
    fontBase64(mediumUrl),
  ]);
  const PAGE = { ...PAPER[data.paper], m: MARGIN };
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: data.paper,
    compress: true,
  });
  // The built-in PDF fonts lack Polish glyphs, so an embedded TrueType font is required.
  doc.addFileToVFS("Poppins-Regular.ttf", regular);
  doc.addFont("Poppins-Regular.ttf", "Poppins", "normal");
  doc.addFileToVFS("Poppins-Medium.ttf", medium);
  doc.addFont("Poppins-Medium.ttf", "Poppins", "bold");
  doc.setFont("Poppins", "normal");
  doc.setProperties({ title: t("pdf.heading"), creator: data.appName });

  const { m } = PAGE;
  // Header
  doc.setFillColor(...ACCENT);
  doc.circle(m + 1.2, m + 2.6, 1.2, "F");
  doc.setFont("Poppins", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(t("pdf.heading"), m + 4.5, m + 4);
  doc.setFont("Poppins", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(data.appName, m + 4.5, m + 8.5);
  doc.text(`${t("pdf.date")}: ${data.date}`, PAGE.w - m, m + 4, { align: "right" });
  // Order, operator and notes live in the title block, not in the header.
  const top = m + 14;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(m, top, PAGE.w - m, top);

  // Left column: tables
  const colW = PAGE.colW;
  let y = top + 7;
  // Shrink the row pitch when the tables would otherwise run into the footer.
  const rowCount =
    data.inputs.length +
    data.groups.reduce((n, g) => n + g.rows.reduce((k, r) => k + (r.list ? 3 : 1), 0), 0);
  const fixed =
    (data.groups.length + 1) * 9 +
    22 +
    (data.warnings.length ? 6.5 + data.warnings.length * 8.2 : 0);
  const available = PAGE.h - m - 8 - y;
  const pitch = Math.min(4.4, Math.max(3.3, (available - fixed) / rowCount));
  const rowFont = pitch < 4 ? 7.2 : 8;
  y = section(doc, t("pdf.inputs"), data.inputs, m, y, colW, pitch, rowFont);
  y = heroBlock(doc, data.heroes, m, y + 2, colW);
  for (const g of data.groups) y = section(doc, g.title, g.rows, m, y + 1, colW, pitch, rowFont);
  if (data.warnings.length) {
    y += 2;
    doc.setFont("Poppins", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(t("pdf.warnings"), m, y);
    y += 4.5;
    doc.setFont("Poppins", "normal");
    doc.setFontSize(7.8);
    for (const w of data.warnings) {
      const lines = doc.splitTextToSize(w, colW - 4) as string[];
      doc.setFillColor(...ACCENT);
      doc.circle(m + 0.8, y - 1, 0.6, "F");
      doc.text(lines, m + 3, y);
      y += lines.length * 3.6 + 1;
    }
  }

  // Right column: drawing at standard scales, then QR code and title block along the bottom.
  const dx = m + colW + 10;
  const footerTop = PAGE.h - m - 4;
  const blockTop = footerTop - 3 - BLOCK_H;
  const box = { x: dx, y: top + 4, w: PAGE.w - m - dx, h: blockTop - 4 - (top + 4) };
  const scales = drawViews(data.views, box, pdfSink(doc), {
    fontSize: 3,
    arrow: 2.2,
    pad: 9,
    gap: 4,
    snapScale: true,
  });
  const blockX = PAGE.w - m - BLOCK_W;
  titleBlock(doc, data, scales, blockX, blockTop);
  if (data.qr) drawQr(doc, data.qr, blockX - 8 - QR_SIZE, footerTop - 3 - QR_SIZE);

  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([], 0);
  doc.line(m, PAGE.h - m - 4, PAGE.w - m, PAGE.h - m - 4);
  doc.text(t("pdf.disclaimer"), m, PAGE.h - m);
  doc.text(`v${data.version} · 1 / 1`, PAGE.w - m, PAGE.h - m, { align: "right" });

  return doc.output("blob");
}

// About 0.8 mm per module for typical links: large enough for phone cameras on paper and on screen.
const QR_SIZE = 32;
const BLOCK_W = 116;
const BLOCK_H = 32;

/** Title block: who, what, which scale. Two columns of label/value cells plus a notes row. */
function titleBlock(doc: JsPdf, data: ReportData, scales: number[], x: number, y: number) {
  const field = (label: string) => data.fields.find((f) => f.label === label)?.value ?? "";
  const scaleText =
    scales
      .filter((s) => s > 0)
      .map((s) => `1:${Math.round((1 / s) * 10) / 10}`.replace(".", ","))
      .join(" · ") || "—";
  const cells: [string, string][] = [
    [t("pdf.order"), field(t("pdf.order")) || "—"],
    [t("pdf.date"), data.date],
    [t("result.material"), data.part.material],
    [t("field.thickness"), data.part.thickness],
    [t("result.mass"), data.part.mass],
    [t("pdf.scale"), scaleText],
    [t("pdf.operator"), field(t("pdf.operator")) || "—"],
    [t("pdf.paper"), data.paper.toUpperCase()],
  ];
  const rowH = 5.6;
  const colW = BLOCK_W / 2;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.35);
  doc.rect(x, y, BLOCK_W, BLOCK_H);
  doc.setLineWidth(0.15);
  cells.forEach(([label, value], i) => {
    const cx = x + (i % 2) * colW;
    const cy = y + Math.floor(i / 2) * rowH;
    doc.rect(cx, cy, colW, rowH);
    doc.setFontSize(5.5);
    doc.setTextColor(...MUTED);
    doc.text(label, cx + 1.2, cy + 2);
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text(value, cx + 1.2, cy + 4.8, { maxWidth: colW - 2.4 });
  });
  const notesY = y + 4 * rowH;
  doc.setFontSize(5.5);
  doc.setTextColor(...MUTED);
  doc.text(t("pdf.notes"), x + 1.2, notesY + 2);
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  const notes = doc.splitTextToSize(field(t("pdf.notes")) || "—", BLOCK_W - 2.4) as string[];
  doc.text(notes.slice(0, 2), x + 1.2, notesY + 4.8);
}

function drawQr(doc: JsPdf, qr: { matrix: boolean[][]; caption: string }, x: number, y: number) {
  const n = qr.matrix.length;
  const cell = QR_SIZE / n;
  // Explicit white quiet zone (4 modules), in case the page is printed on a tinted background.
  const quiet = cell * 4;
  doc.setFillColor(255, 255, 255);
  doc.rect(x - quiet, y - quiet, QR_SIZE + 2 * quiet, QR_SIZE + 2 * quiet, "F");
  doc.setFillColor(0, 0, 0);
  qr.matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      // Slight overlap avoids hairline gaps between modules in some viewers.
      if (dark) doc.rect(x + c * cell, y + r * cell, cell + 0.03, cell + 0.03, "F");
    }),
  );
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  const lines = doc.splitTextToSize(qr.caption, 70) as string[];
  doc.text(lines, x - quiet - 2, y + QR_SIZE - (lines.length - 1) * 3.4, { align: "right" });
}

function section(
  doc: JsPdf,
  title: string,
  rows: Row[],
  x: number,
  y: number,
  w: number,
  pitch: number,
  fontSize: number,
): number {
  doc.setFont("Poppins", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(title, x, y);
  y += 2;
  doc.setFont("Poppins", "normal");
  doc.setFontSize(fontSize);
  for (const r of rows) {
    y += pitch;
    doc.setTextColor(...MUTED);
    doc.text(r.label + (r.estimate ? ` (${t("result.estimate")})` : ""), x, y, {
      maxWidth: w * 0.62,
    });
    const c = r.neon ? FLAT : INK;
    doc.setTextColor(c[0], c[1], c[2]);
    const value = r.unit ? `${r.value} ${r.unit}` : r.value;
    if (r.list) {
      // Lists go under their label, wrapped to the column.
      for (const line of doc.splitTextToSize(value, w) as string[]) {
        y += pitch;
        doc.text(line, x, y);
      }
    } else doc.text(value, x + w, y, { align: "right" });
    doc.setDrawColor(...LINE);
    doc.line(x, y + pitch * 0.32, x + w, y + pitch * 0.32);
  }
  return y + pitch + 1.6;
}

function heroBlock(doc: JsPdf, heroes: Row[], x: number, y: number, w: number): number {
  if (!heroes.length) return y;
  const cw = w / heroes.length;
  heroes.forEach((h, i) => {
    const cx = x + cw * i;
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(h.label, cx, y + 3);
    doc.setFont("Poppins", "bold");
    doc.setFontSize(heroes.length > 1 ? 13 : 17);
    doc.setTextColor(...INK);
    doc.text(`${h.value}${h.unit ? ` ${h.unit}` : ""}`, cx, y + 10.5);
    doc.setFont("Poppins", "normal");
  });
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(x, y + 13.5, x + 14, y + 13.5);
  doc.setLineWidth(0.2);
  return y + 20;
}

function pdfSink(doc: JsPdf): Sink {
  return {
    path(pts, closed, stroke) {
      if (pts.length < 2) return;
      const c = stroke === "part" ? INK : stroke === "flat" ? FLAT : MUTED;
      doc.setDrawColor(c[0], c[1], c[2]);
      doc.setLineWidth(stroke === "part" ? 0.35 : stroke === "flat" ? 0.3 : 0.15);
      doc.setLineDashPattern(
        stroke === "center" ? [2.5, 0.8, 0.4, 0.8] : stroke === "flat" ? [1.5, 0.8] : [],
        0,
      );
      const all = closed ? [...pts, pts[0]!] : pts;
      for (let i = 1; i < all.length; i++)
        doc.line(all[i - 1]![0], all[i - 1]![1], all[i]![0], all[i]![1]);
      doc.setLineDashPattern([], 0);
    },
    fill(pts) {
      const [a, b, c] = pts;
      if (!a || !b || !c) return;
      doc.setFillColor(...MUTED);
      doc.triangle(a[0], a[1], b[0], b[1], c[0], c[1], "F");
    },
    text(x, y, text, o) {
      const pt = o.size / 0.3528;
      doc.setFont("Poppins", o.role === "title" ? "bold" : "normal");
      doc.setFontSize(pt);
      const c = o.role === "note" ? MUTED : INK;
      doc.setTextColor(c[0], c[1], c[2]);
      const angle = o.angle ?? 0;
      const width = doc.getTextWidth(text);
      const shift = o.anchor === "middle" ? width / 2 : o.anchor === "end" ? width : 0;
      const rad = (angle * Math.PI) / 180;
      // jsPDF rotates counter-clockwise about the start point, so anchor manually.
      doc.text(text, x - Math.cos(rad) * shift, y - Math.sin(rad) * shift, { angle: -angle });
    },
  };
}
