import { z } from "zod";
import { num, t, type Key } from "../i18n";
import { load, save } from "../state/storage";
import type { MachinePart, ViewPreset } from "../viz/scene3d";
import { h } from "./dom";

/*
 * Controls laid over the 3D view: play/pause, progress slider, playback speed, the machine parts
 * panel and view reset. Speed and hidden parts are kept on this device.
 */

export interface StageTarget {
  setProgress(p: number): void;
  setHidden(parts: MachinePart[]): void;
  resetView(): void;
  setViewPreset(preset: ViewPreset): void;
}

const VIEWS: ViewPreset[] = ["iso", "front", "side", "top"];

const VIEW_KEY = "rolling.view.v1";
const SPEEDS = [1, 2, 4, 0.5];
const PARTS: MachinePart[] = [
  "rolls",
  "housings",
  "tower",
  "ejector",
  "supports",
  "posts",
  "table",
];
const viewSchema = z.object({
  speed: z.number().refine((v) => SPEEDS.includes(v)),
  hidden: z
    .array(z.enum(["housings", "tower", "ejector", "supports", "posts", "table", "rolls"]))
    .max(7),
});

// A full roll takes this long at 1×.
const ROLL_MS = 6000;

function speedLabel(v: number): string {
  return `${num(v, v < 1 ? 1 : 0)}×`;
}

export class StageControls {
  readonly bar: HTMLElement;
  readonly panel: HTMLElement;
  private view = load(VIEW_KEY, viewSchema) ?? { speed: 1, hidden: [] };
  private progressValue = 1;
  private playing = 0;
  private playBtn: HTMLButtonElement;
  private slider: HTMLInputElement;
  private reset: HTMLButtonElement;
  private partsBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;

  /** `target` returns the scene once it has loaded, or null before that. */
  constructor(private target: () => StageTarget | null) {
    this.playBtn = h(
      "button",
      { type: "button", class: "btn btn-small", onClick: () => this.togglePlay() },
      t("action.play"),
    );
    this.slider = h("input", {
      type: "range",
      min: "0",
      max: "1000",
      value: "1000",
      class: "progress",
      onInput: (e: Event) => {
        this.stop();
        this.setProgress(Number((e.target as HTMLInputElement).value) / 1000);
      },
    });
    this.reset = h(
      "button",
      {
        type: "button",
        class: "btn btn-small btn-ghost",
        onClick: () => this.target()?.resetView(),
      },
      "⟲",
    );
    this.speedBtn = h(
      "button",
      {
        type: "button",
        class: "btn btn-small btn-ghost stage-speed",
        onClick: () => {
          const i = SPEEDS.indexOf(this.view.speed);
          this.view = { ...this.view, speed: SPEEDS[(i + 1) % SPEEDS.length]! };
          save(VIEW_KEY, this.view);
          this.speedBtn.textContent = speedLabel(this.view.speed);
        },
      },
      speedLabel(this.view.speed),
    );
    this.panel = h("div", { class: "stage-parts", hidden: true, role: "group" });
    this.partsBtn = h(
      "button",
      {
        type: "button",
        class: "btn btn-small btn-ghost",
        "aria-expanded": "false",
        onClick: () => this.showPanel(this.panel.hidden !== false),
      },
      t("view.partsButton"),
    );
    // The panel closes on a click anywhere else or on Escape, like a menu.
    document.addEventListener("pointerdown", (e) => {
      const at = e.target as Node;
      if (!this.panel.hidden && !this.panel.contains(at) && !this.partsBtn.contains(at))
        this.showPanel(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.panel.hidden) {
        this.showPanel(false);
        this.partsBtn.focus();
      }
    });
    this.bar = h(
      "div",
      { class: "stage-controls" },
      this.playBtn,
      this.slider,
      this.speedBtn,
      this.partsBtn,
      this.reset,
    );
    this.renderPanel();
    this.updateLabels();
  }

  get progress(): number {
    return this.progressValue;
  }

  get hidden(): MachinePart[] {
    return this.view.hidden;
  }

  setProgress(p: number) {
    this.progressValue = p;
    this.slider.value = String(Math.round(p * 1000));
    this.target()?.setProgress(p);
  }

  togglePlay() {
    if (this.playing) return this.stop();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return this.setProgress(1);
    // Progress advances by the frame time, so changing the speed while rolling takes effect at once
    // without a jump; resuming continues from the slider position.
    let p = this.progressValue >= 0.999 ? 0 : this.progressValue;
    let last = performance.now();
    const step = (now: number) => {
      p = Math.min(1, p + ((now - last) / ROLL_MS) * this.view.speed);
      last = now;
      this.setProgress(p);
      if (p < 1) this.playing = requestAnimationFrame(step);
      else this.stop();
    };
    this.playing = requestAnimationFrame(step);
    this.playBtn.textContent = t("action.pause");
  }

  stop() {
    cancelAnimationFrame(this.playing);
    this.playing = 0;
    this.playBtn.textContent = t("action.play");
  }

  /** Refreshes texts after a language change. */
  updateLabels() {
    this.playBtn.textContent = this.playing ? t("action.pause") : t("action.play");
    this.slider.setAttribute("aria-label", t("view.progress"));
    for (const [el, key] of [
      [this.reset, "action.resetView"],
      [this.speedBtn, "view.speed"],
    ] as const) {
      el.setAttribute("title", t(key));
      el.setAttribute("aria-label", t(key));
    }
    this.partsBtn.textContent = t("view.partsButton");
    this.renderPanel();
  }

  private showPanel(open: boolean) {
    this.panel.hidden = !open;
    this.partsBtn.setAttribute("aria-expanded", String(open));
  }

  private renderPanel() {
    this.panel.replaceChildren(
      h("p", { class: "stage-parts-title" }, t("view.camera")),
      h(
        "div",
        { class: "stage-views" },
        ...VIEWS.map((v) =>
          h(
            "button",
            {
              type: "button",
              class: "btn btn-small btn-ghost",
              onClick: () => this.target()?.setViewPreset(v),
            },
            t(`view.preset.${v}` as Key),
          ),
        ),
      ),
      h("p", { class: "stage-parts-hint" }, t("view.cameraHint")),
      h("p", { class: "stage-parts-title" }, t("view.parts")),
      ...PARTS.map((part) =>
        h(
          "label",
          { class: "check" },
          h("input", {
            type: "checkbox",
            checked: !this.view.hidden.includes(part),
            onChange: (e: Event) => {
              const on = (e.target as HTMLInputElement).checked;
              const hidden = this.view.hidden.filter((x) => x !== part);
              this.view = { ...this.view, hidden: on ? hidden : [...hidden, part] };
              save(VIEW_KEY, this.view);
              this.target()?.setHidden(this.view.hidden);
            },
          }),
          h("span", {}, t(`part.${part}` as Key)),
        ),
      ),
    );
  }
}
