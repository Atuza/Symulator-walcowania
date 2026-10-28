import { drawViews, type Sink } from "../drawing/layout";
import type { DimensionId, Pt, View } from "../drawing/model";
import { t } from "../i18n";

const NS = "http://www.w3.org/2000/svg";

/** Responsive SVG rendering of the drawing views. */
export class View2D {
  readonly el: SVGSVGElement;
  private views: View[] = [];
  private observer: ResizeObserver;
  private hint = document.createElement("p");

  constructor(
    private host: HTMLElement,
    private onEdit: (id: DimensionId) => void,
    private describe: (id: DimensionId) => string | null,
  ) {
    this.el = document.createElementNS(NS, "svg");
    this.el.classList.add("drawing");
    this.el.setAttribute("role", "group");
    this.hint.className = "drawing-hint";
    host.append(this.hint, this.el);
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(host);
  }

  set(views: View[], label: string) {
    this.views = views;
    this.hint.textContent = t("drawing.hint");
    this.hint.hidden = !views.length;
    this.el.setAttribute("aria-label", label);
    this.render();
  }

  focusDimension(id: DimensionId) {
    const target = Array.from(this.el.querySelectorAll<SVGGElement>("[data-dimension]")).find(
      (el) => el.dataset.dimension === id,
    );
    target?.focus({ preventScroll: true });
  }

  private render() {
    const w = this.host.clientWidth;
    const stacked = w < 520;
    const cellWidth = (w - 32) / (stacked ? 1 : Math.max(1, this.views.length));
    // Keep the part visible even with a long free-profile dimension list. The canvas can scroll.
    const minCell = Math.max(
      200,
      ...this.views.map(
        (v) =>
          180 +
          v.notes.reduce((sum, note) => {
            const text = typeof note === "string" ? note : note.text;
            const editable = typeof note !== "string" && note.edit;
            const lines = Math.max(1, Math.ceil((text.length * 7) / Math.max(80, cellWidth - 16)));
            return sum + lines * (editable ? 28 : 18);
          }, 0),
      ),
    );
    const h = Math.max(this.host.clientHeight, 52 + minCell * (stacked ? this.views.length : 1));
    this.el.replaceChildren();
    if (w < 10 || h < 10) return;
    this.el.setAttribute("viewBox", `0 0 ${w} ${h}`);
    this.el.style.height = `${h}px`;
    const fontSize = w < 520 ? 11 : 12;
    drawViews(
      this.views,
      { x: 16, y: 38, w: w - 32, h: h - 50 },
      svgSink(this.el, this.onEdit, this.describe),
      {
        fontSize,
        arrow: 7,
        pad: 30,
        gap: 16,
        stacked,
        interactive: true,
      },
    );
  }
}

const fmt = (n: number) => n.toFixed(2);
const points = (pts: Pt[]) => pts.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");

function svgSink(
  svg: SVGSVGElement,
  onEdit: (id: DimensionId) => void,
  describe: (id: DimensionId) => string | null,
): Sink {
  const add = (tag: string, attrs: Record<string, string>, text?: string) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    svg.append(el);
    return el;
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
      const name = o.edit ? describe(o.edit) : null;
      const transform = o.angle ? `rotate(${fmt(o.angle)} ${fmt(x)} ${fmt(y)})` : "";
      if (!o.edit || !name) {
        if (transform) attrs.transform = transform;
        add("text", attrs, text);
        return;
      }
      const id = o.edit;
      const group = add("g", {
        role: "button",
        tabindex: "0",
        class: "dimension-edit",
        "data-dimension": id,
        "aria-label": t("drawing.edit", { name, value: text }),
        ...(transform ? { transform } : {}),
      });
      const width = Math.max(24, text.length * o.size * 0.62);
      const left = x - (o.anchor === "middle" ? width / 2 : o.anchor === "end" ? width : 0);
      const hit = document.createElementNS(NS, "rect");
      for (const [k, v] of Object.entries({
        x: fmt(left - 5),
        y: fmt(y - o.size - 4),
        width: fmt(width + 10),
        height: fmt(Math.max(24, o.size + 10)),
        rx: "3",
        class: "dimension-hit",
      }))
        hit.setAttribute(k, v);
      const label = document.createElementNS(NS, "text");
      for (const [k, v] of Object.entries(attrs)) label.setAttribute(k, v);
      label.textContent = text;
      group.append(hit, label);
      group.addEventListener("click", () => onEdit(id));
      group.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit(id);
        }
      });
    },
  };
}
