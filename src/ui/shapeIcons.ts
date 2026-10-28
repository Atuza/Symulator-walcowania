import type { Inputs } from "../state/inputs";

/** Line icons on a 32 × 32 grid, drawn as cross-sections (the cone as a side view). */
export const SHAPE_ICONS: Record<Inputs["shape"], string> = {
  cylinder: "M16 5a11 11 0 1 0 0.01 0Z",
  cone: "M5 8h22l-6 17H11Z",
  halfround: "M5 12a11 11 0 0 0 22 0",
  ushape: "M8 5v11a8 8 0 0 0 16 0V5",
  obround: "M11 8h10a8 8 0 0 1 0 16H11a8 8 0 0 1 0-16Z",
  rect: "M9 6h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z",
  tank: "M16 8c7 0 11 3 11 8s-4 8-11 8S5 21 5 16s4-8 11-8Z",
  bucket: "M24 5v9a11 11 0 0 1-11 11H5",
};

const NS = "http://www.w3.org/2000/svg";

export function shapeIcon(shape: Inputs["shape"]): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", SHAPE_ICONS[shape]);
  svg.append(path);
  return svg;
}
