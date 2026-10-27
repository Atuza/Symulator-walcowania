import { drawViews, type Sink } from "../drawing/layout";
import type { Pt, View } from "../drawing/model";

const NS = "http://www.w3.org/2000/svg";

/** Responsive SVG rendering of the drawing views. */
export class View2D {
  readonly el: SVGSVGElement;
  private views: View[] = [];
  private observer: ResizeObserver;

  constructor(private host: HTMLElement) {
    this.el = document.createElementNS(NS, "svg");
    this.el.classList.add("drawing");
    this.el.setAttribute("role", "img");
    host.append(this.el);
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(host);
  }

  set(views: View[], label: string) {
    this.views = views;
    this.el.setAttribute("aria-label", label);
    this.render();
  }

  private render() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.el.replaceChildren();
    if (w < 10 || h < 10) return;
    this.el.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const fontSize = w < 520 ? 11 : 12;
    drawViews(this.views, { x: 16, y: 12, w: w - 32, h: h - 24 }, svgSink(this.el), {
      fontSize,
      arrow: 7,
      pad: 30,
      gap: 16,
    });
  }
}

const fmt = (n: number) => n.toFixed(2);
const points = (pts: Pt[]) => pts.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");

function svgSink(svg: SVGSVGElement): Sink {
  const add = (tag: string, attrs: Record<string, string>, text?: string) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    svg.append(el);
  };
  return {
    path(pts, closed, stroke, fill) {
      add(closed ? "polygon" : "polyline", {
        points: points(pts),
        class: `s-${stroke}${fill ? " is-fill" : ""}`,
      });
    },
    fill(pts) {
      add("polygon", { points: points(pts), class: "s-arrow" });
    },
    text(x, y, text, o) {
      const attrs: Record<string, string> = {
        x: fmt(x),
        y: fmt(y),
        class: `t-${o.role}`,
        "font-size": String(o.size),
        "text-anchor": o.anchor,
      };
      if (o.angle) attrs.transform = `rotate(${fmt(o.angle)} ${fmt(x)} ${fmt(y)})`;
      add("text", attrs, text);
    },
  };
}
