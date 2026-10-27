import { emptyMachine, type MachineLimits } from "../domain/calculate";
import { CUSTOM_MATERIAL_ID, materials } from "../domain/materials/data";
import { materialGroups, yieldAt } from "../domain/materials/schema";
import type { Warning } from "../domain/types";
import { buildViews } from "../drawing/build";
import { dxfDocument, rectangleContour, sectorContour } from "../export/dxf";
import { saveFile, slug } from "../export/download";
import { getLang, num, percent, setLang, t, type Key, type Lang } from "../i18n";
import { derive, FLAT_END_FACTOR, type Derived } from "../state/derive";
import {
  addHistory,
  clearHistory,
  deleteHistory,
  HISTORY_LIMIT,
  readHistory,
} from "../state/history";
import {
  defaultInputs,
  inputsSchema,
  parseNumber,
  type Inputs,
  type TextField,
} from "../state/inputs";
import { settingsSchema, type Settings } from "../state/settings";
import { load, save } from "../state/storage";
import { sceneModel } from "../viz/sceneModel";
import { View2D } from "../viz/view2d";
import type { RollingScene } from "../viz/scene3d";
import { h, segmented } from "./dom";
import { heroes, inputRows, resultGroups, type Row } from "./rows";

const INPUTS_KEY = "rolling.inputs.v1";
const SETTINGS_KEY = "rolling.settings.v1";

const defaultSettings: Settings = {
  lang: navigator.language.toLowerCase().startsWith("pl") ? "pl" : "en",
  theme: "system",
  machine: emptyMachine,
};

export class App {
  private inputs: Inputs = load(INPUTS_KEY, inputsSchema) ?? { ...defaultInputs };
  private settings: Settings = load(SETTINGS_KEY, settingsSchema) ?? defaultSettings;
  private derived!: Derived;

  private inputsPanel = h("section", { class: "panel inputs", "aria-label": "inputs" });
  private resultsPanel = h("aside", { class: "panel results", "aria-live": "polite" });
  private stage3d = h("div", { class: "stage-3d" });
  private stage2d = h("div", { class: "stage-2d" });
  private header = h("header", { class: "topbar" });
  private fieldEls = new Map<TextField, HTMLElement>();
  private view2d: View2D;
  private scene: RollingScene | null = null;
  private sceneStatus = h("div", { class: "stage-status" });
  private progress = 1;
  private playing = 0;
  private playBtn!: HTMLButtonElement;
  private slider!: HTMLInputElement;
  private pending = 0;
  private persistTimer = 0;

  constructor(private root: HTMLElement) {
    setLang(this.settings.lang);
    this.applyTheme();
    root.append(
      this.header,
      h(
        "main",
        { class: "layout" },
        this.inputsPanel,
        h("section", { class: "stage" }, this.stage3d, this.stage2d),
        this.resultsPanel,
      ),
    );
    this.view2d = new View2D(this.stage2d);
    this.buildStageControls();
    this.renderAll();
    void this.loadScene();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.applyTheme());
  }

  // ---- state ---------------------------------------------------------------

  private set<K extends keyof Inputs>(key: K, value: Inputs[K], structural: boolean) {
    this.inputs = { ...this.inputs, [key]: value };
    this.schedulePersist();
    if (structural) this.renderAll();
    else this.scheduleCompute();
  }

  private schedulePersist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => save(INPUTS_KEY, this.inputs), 400);
  }

  private saveSettings() {
    save(SETTINGS_KEY, this.settings);
  }

  private scheduleCompute() {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      this.compute();
    });
  }

  private compute() {
    this.derived = derive(this.inputs, this.settings.machine);
    this.renderResults();
    this.markErrors();
    this.renderViews();
    this.refreshPlaceholders();
  }

  private renderAll() {
    this.renderHeader();
    this.renderInputs();
    this.compute();
    this.updateStageLabels();
  }

  // ---- header --------------------------------------------------------------

  private renderHeader() {
    const iconBtn = (label: string, onClick: () => void, text: string) =>
      h("button", { type: "button", class: "btn btn-ghost", onClick, "aria-label": label }, text);
    this.header.replaceChildren(
      h(
        "div",
        { class: "brand" },
        h("span", { class: "brand-dot", "aria-hidden": "true" }),
        h("span", { class: "brand-name" }, t("appName")),
        h("span", { class: "brand-tag" }, t("appTagline")),
      ),
      h(
        "nav",
        { class: "top-actions" },
        iconBtn(t("action.machine"), () => this.openMachine(), t("action.machine")),
        iconBtn(t("action.history"), () => this.openHistory(), t("action.history")),
        h(
          "button",
          {
            type: "button",
            class: "btn btn-ghost btn-icon",
            "aria-label": t("action.theme"),
            title: t("action.theme"),
            onClick: () => this.toggleTheme(),
          },
          h("span", { class: "theme-glyph", "aria-hidden": "true" }),
        ),
        segmented<Lang>(
          "Language",
          [
            { value: "pl", label: "PL" },
            { value: "en", label: "EN" },
          ],
          this.settings.lang,
          (lang) => {
            this.settings = { ...this.settings, lang };
            this.saveSettings();
            setLang(lang);
            this.renderAll();
          },
          "segmented-compact",
        ),
      ),
    );
  }

  // ---- inputs --------------------------------------------------------------

  private renderInputs() {
    const i = this.inputs;
    this.fieldEls.clear();
    const panel = this.inputsPanel;
    panel.replaceChildren();

    panel.append(
      group(
        t("section.shape"),
        segmented(
          t("section.shape"),
          [
            { value: "cylinder", label: t("shape.cylinder") },
            { value: "cone", label: t("shape.cone") },
          ],
          i.shape,
          (v) => this.set("shape", v, true),
        ),
        i.shape === "cylinder"
          ? segmented(
              t("section.shape"),
              [
                { value: "fromDiameter", label: t("mode.fromDiameter") },
                { value: "fromLength", label: t("mode.fromLength") },
              ],
              i.mode,
              (v) => this.set("mode", v, true),
            )
          : null,
      ),
    );

    // Material
    const select = h(
      "select",
      {
        id: "f-material",
        onChange: (e: Event) => this.set("materialId", (e.target as HTMLSelectElement).value, true),
      },
      ...materialGroups.map((g) =>
        h(
          "optgroup",
          { label: t(`group.${g}` as Key) },
          ...materials
            .filter((m) => m.group === g)
            .map((m) =>
              h(
                "option",
                { value: m.id, selected: m.id === i.materialId },
                m.number && !m.name.includes(m.number) ? `${m.name} · ${m.number}` : m.name,
              ),
            ),
        ),
      ),
      h(
        "option",
        { value: CUSTOM_MATERIAL_ID, selected: i.materialId === CUSTOM_MATERIAL_ID },
        t("material.custom"),
      ),
    );
    const materialInfo = h("p", { class: "field-hint", id: "material-info" });
    const materialGroup = group(
      t("section.material"),
      h(
        "label",
        { class: "field" },
        h("span", { class: "field-label" }, t("field.material")),
        h("span", { class: "select-wrap" }, select),
      ),
      materialInfo,
      this.numberField("thickness", t("field.thickness"), t("unit.mm")),
    );
    if (i.materialId === CUSTOM_MATERIAL_ID) {
      materialGroup.append(
        h(
          "div",
          { class: "field-row" },
          this.numberField("customRe", t("field.customRe"), t("unit.mpa")),
          this.numberField("customE", t("field.customE"), t("unit.gpa"), "210"),
        ),
        this.numberField("customDensity", t("field.customDensity"), t("unit.density"), "7850"),
      );
    }
    panel.append(materialGroup);

    // Geometry
    const geo = group(t("section.geometry"));
    if (i.shape === "cylinder" && i.mode === "fromDiameter") {
      geo.append(
        h(
          "div",
          { class: "field-row field-row-dim" },
          labelled(
            t("field.dimension"),
            segmented(
              t("field.dimension"),
              [
                { value: "diameter", label: t("dim.diameter") },
                { value: "radius", label: t("dim.radius") },
              ],
              i.dimension,
              (v) => this.set("dimension", v, true),
            ),
          ),
          labelled(t("field.surface"), this.surfaceControl()),
        ),
        this.numberField(
          "value",
          t(i.dimension === "radius" ? "field.value.radius" : "field.value.diameter"),
          t("unit.mm"),
          undefined,
          true,
        ),
      );
    } else if (i.shape === "cylinder") {
      geo.append(this.numberField("length", t("field.length"), t("unit.mm"), undefined, true));
    } else {
      geo.append(
        labelled(t("field.surface"), this.surfaceControl()),
        h(
          "div",
          { class: "field-row" },
          this.numberField("dLarge", t("field.dLarge"), t("unit.mm"), undefined, true),
          this.numberField("dSmall", t("field.dSmall"), t("unit.mm")),
        ),
        this.numberField("height", t("field.height"), t("unit.mm")),
      );
    }
    if (i.shape === "cylinder")
      geo.append(this.numberField("width", t("field.width"), t("unit.mm")));
    panel.append(geo);

    // Advanced
    const flatToggle = h(
      "label",
      { class: "switch" },
      h("input", {
        type: "checkbox",
        role: "switch",
        checked: i.flatEnds,
        onChange: (e: Event) => this.set("flatEnds", (e.target as HTMLInputElement).checked, true),
      }),
      h("span", { class: "switch-track", "aria-hidden": "true" }),
      h("span", {}, t("field.flatEnds")),
    );
    const adv = h(
      "details",
      { class: "advanced", open: this.advancedOpen },
      h("summary", {}, t("section.advanced")),
      h(
        "div",
        { class: "group-body" },
        flatToggle,
        i.flatEnds
          ? this.numberField(
              "flatLength",
              t("field.flatLength"),
              t("unit.mm"),
              "",
              false,
              t("hint.flat"),
            )
          : null,
        this.numberField("k", t("field.k"), "", "", false, t("hint.k")),
        this.numberField(
          "reActual",
          t("field.reActual"),
          t("unit.mpa"),
          "",
          false,
          t("hint.reActual"),
        ),
        this.numberField(
          "calibration",
          t("field.calibration"),
          "",
          "1",
          false,
          t("hint.calibration"),
        ),
      ),
    );
    adv.addEventListener("toggle", () => (this.advancedOpen = adv.open));
    panel.append(adv);
    this.updateMaterialInfo();
  }

  private advancedOpen = false;

  private surfaceControl() {
    return segmented(
      t("field.surface"),
      [
        { value: "inner", label: t("surface.inner") },
        { value: "outer", label: t("surface.outer") },
      ],
      this.inputs.surface,
      (v) => this.set("surface", v, true),
    );
  }

  private numberField(
    field: TextField,
    label: string,
    unit: string,
    placeholder = "",
    primary = false,
    hint?: string,
  ) {
    const id = `f-${field}`;
    const input = h("input", {
      id,
      class: "num",
      type: "text",
      inputmode: "decimal",
      autocomplete: "off",
      spellcheck: "false",
      enterkeyhint: "done",
      placeholder,
      value: this.inputs[field],
      "aria-describedby": `${id}-msg`,
      onInput: (e: Event) => this.set(field, (e.target as HTMLInputElement).value, false),
      onFocus: (e: Event) => (e.target as HTMLInputElement).select(),
      onKeydown: (e: KeyboardEvent) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      },
    });
    const wrap = h(
      "label",
      { class: `field${primary ? " field-primary" : ""}`, for: id },
      h("span", { class: "field-label" }, label),
      h("span", { class: "input-wrap" }, input, unit ? h("span", { class: "unit" }, unit) : null),
      h("span", { class: "field-msg", id: `${id}-msg` }, hint ?? ""),
    );
    wrap.dataset.hint = hint ?? "";
    this.fieldEls.set(field, wrap);
    return wrap;
  }

  private markErrors() {
    const err = this.derived.error;
    for (const [field, wrap] of this.fieldEls) {
      const bad = err?.field === field && this.inputs[field].trim() !== "";
      wrap.classList.toggle("is-invalid", bad);
      wrap.querySelector("input")?.setAttribute("aria-invalid", String(bad));
      const msg = wrap.querySelector(".field-msg");
      if (msg) msg.textContent = bad && err ? t(err.key) : (wrap.dataset.hint ?? "");
    }
  }

  private refreshPlaceholders() {
    const d = this.derived;
    const flat = this.fieldEls.get("flatLength")?.querySelector("input");
    if (flat && d.thickness)
      flat.placeholder = `${t("hint.auto")} ${num(FLAT_END_FACTOR * d.thickness)}`;
    const k = this.fieldEls.get("k")?.querySelector("input");
    if (k) {
      const out = d.output;
      k.placeholder = out ? `${t("hint.auto")} ${num(out.result.k, 3)}` : t("hint.auto");
    }
    const re = this.fieldEls.get("reActual")?.querySelector("input");
    if (re && d.material && d.thickness)
      re.placeholder = `min ${num(yieldAt(d.material, d.thickness), 0)}`;
    this.updateMaterialInfo();
  }

  private updateMaterialInfo() {
    const el = this.inputsPanel.querySelector("#material-info");
    if (!el) return;
    const m = materials.find((x) => x.id === this.inputs.materialId);
    if (!m) {
      el.textContent = "";
      return;
    }
    const th = parseNumber(this.inputs.thickness);
    const re = th && th > 0 ? yieldAt(m, th) : m.yield[0]!.re;
    const props = t("material.props", {
      re: num(re, 0),
      rm: `${m.rm[0]}–${m.rm[1]}`,
      e: num(m.modulus / 1000, 0),
    });
    el.replaceChildren(h("span", {}, props), h("span", { class: "muted" }, ` · ${m.standard}`));
    if (m.note) el.append(h("span", { class: "note" }, t(`note.${m.note}` as Key)));
  }

  // ---- results -------------------------------------------------------------

  private renderResults() {
    const d = this.derived;
    const panel = this.resultsPanel;
    panel.replaceChildren();
    if (!d.output) {
      panel.append(
        h(
          "div",
          { class: "empty" },
          h("span", { class: "empty-mark", "aria-hidden": "true" }),
          h("p", {}, d.error ? t(d.error.key) : t("view.empty")),
        ),
      );
      panel.append(this.actions(false));
      return;
    }

    const hs = heroes(d);
    panel.append(
      h(
        "div",
        { class: `heroes heroes-${hs.length}` },
        ...hs.map((x) =>
          h(
            "button",
            {
              type: "button",
              class: "hero",
              title: "Copy",
              onClick: (e: Event) => copyValue(e.currentTarget as HTMLElement, x.raw),
            },
            h("span", { class: "hero-label" }, x.label),
            h("span", { class: "hero-value" }, x.value, h("span", { class: "hero-unit" }, x.unit)),
          ),
        ),
      ),
    );

    const warnings = d.output.warnings;
    if (warnings.length) {
      panel.append(
        h(
          "ul",
          { class: "warnings" },
          ...warnings.map((w) => h("li", { class: `warning sev-${w.severity}` }, warningText(w))),
        ),
      );
    }

    for (const g of resultGroups(d)) {
      panel.append(
        h(
          "section",
          { class: "result-group" },
          h("h3", {}, g.title),
          h("dl", {}, ...g.rows.flatMap((r) => rowEls(r))),
        ),
      );
    }
    panel.append(this.actions(true));
  }

  private actions(enabled: boolean) {
    const d = this.derived;
    const canDxf = enabled && !(d.output?.shape === "cylinder" && d.width === null);
    const saveBtn = h(
      "button",
      {
        type: "button",
        class: "btn btn-ghost",
        disabled: !enabled,
        onClick: () => {
          this.saveToHistory();
          saveBtn.textContent = t("action.saved");
          setTimeout(() => (saveBtn.textContent = t("action.save")), 1400);
        },
      },
      t("action.save"),
    );
    return h(
      "div",
      { class: "result-actions" },
      h(
        "button",
        {
          type: "button",
          class: "btn btn-primary",
          disabled: !enabled,
          onClick: () => this.openPdf(),
        },
        h("span", { class: "btn-dot", "aria-hidden": "true" }),
        t("action.pdf"),
      ),
      h(
        "button",
        {
          type: "button",
          class: "btn",
          disabled: !canDxf,
          title: canDxf ? "" : t("field.width"),
          onClick: () => this.exportDxf(),
        },
        t("action.dxf"),
      ),
      saveBtn,
    );
  }

  // ---- views ---------------------------------------------------------------

  private renderViews() {
    const d = this.derived;
    const views = d.output ? buildViews(d.output, d.width, this.inputs.surface) : [];
    this.view2d.set(views, t("result.development"));
    this.stage2d.classList.toggle("is-empty", !d.output);
    if (this.scene) {
      this.scene.setModel(
        d.output && d.thickness
          ? sceneModel(d.output, d.thickness, d.width, this.settings.machine)
          : null,
      );
    }
    this.stage3d.classList.toggle("is-empty", !d.output);
  }

  private buildStageControls() {
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
        this.stopPlay();
        this.setProgress(Number((e.target as HTMLInputElement).value) / 1000);
      },
    });
    const reset = h(
      "button",
      {
        type: "button",
        class: "btn btn-small btn-ghost",
        id: "reset-view",
        onClick: () => this.scene?.resetView(),
      },
      t("action.resetView"),
    );
    this.stage3d.append(
      this.sceneStatus,
      h("div", { class: "stage-controls" }, this.playBtn, this.slider, reset),
    );
  }

  private updateStageLabels() {
    this.playBtn.textContent = this.playing ? t("action.pause") : t("action.play");
    this.slider.setAttribute("aria-label", t("view.progress"));
    const reset = this.stage3d.querySelector("#reset-view");
    if (reset) reset.textContent = t("action.resetView");
    if (!this.scene && this.sceneStatus.dataset.state !== "error")
      this.sceneStatus.textContent = t("view.loading");
    if (this.sceneStatus.dataset.state === "error")
      this.sceneStatus.textContent = t("view.noWebgl");
  }

  private setProgress(p: number) {
    this.progress = p;
    this.slider.value = String(Math.round(p * 1000));
    this.scene?.setProgress(p);
  }

  private togglePlay() {
    if (this.playing) return this.stopPlay();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return this.setProgress(1);
    let from = this.progress >= 0.999 ? 0 : this.progress;
    const duration = 6000 * (1 - from);
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, from + ((now - start) / duration) * (1 - from));
      this.setProgress(p);
      if (p < 1) this.playing = requestAnimationFrame(step);
      else this.stopPlay();
    };
    from = Math.max(0, from);
    this.playing = requestAnimationFrame(step);
    this.playBtn.textContent = t("action.pause");
  }

  private stopPlay() {
    cancelAnimationFrame(this.playing);
    this.playing = 0;
    this.playBtn.textContent = t("action.play");
  }

  private async loadScene() {
    if (!hasWebgl()) {
      this.sceneStatus.dataset.state = "error";
      this.sceneStatus.textContent = t("view.noWebgl");
      return;
    }
    try {
      const { RollingScene } = await import("../viz/scene3d");
      this.scene = new RollingScene(this.stage3d);
      this.sceneStatus.textContent = "";
      this.sceneStatus.dataset.state = "ready";
      this.applyScenePalette();
      this.scene.setProgress(this.progress);
      this.renderViews();
    } catch {
      this.sceneStatus.dataset.state = "error";
      this.sceneStatus.textContent = t("view.noWebgl");
    }
  }

  // ---- theme ---------------------------------------------------------------

  private effectiveTheme(): "light" | "dark" {
    if (this.settings.theme !== "system") return this.settings.theme;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  private applyTheme() {
    const theme = this.effectiveTheme();
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0a0a0b" : "#f6f3ec");
    this.applyScenePalette();
  }

  private toggleTheme() {
    this.settings = {
      ...this.settings,
      theme: this.effectiveTheme() === "dark" ? "light" : "dark",
    };
    this.saveSettings();
    this.applyTheme();
  }

  private applyScenePalette() {
    if (!this.scene) return;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    this.scene.setPalette({ plate: v("--plate"), roll: v("--roll"), accent: v("--accent") });
  }

  // ---- exports -------------------------------------------------------------

  private materialName(): string {
    const m = materials.find((x) => x.id === this.inputs.materialId);
    if (m) return m.number && !m.name.includes(m.number) ? `${m.name} (${m.number})` : m.name;
    return t("material.custom").replace("…", "");
  }

  private fileBase(): string {
    const d = this.derived;
    const out = d.output!;
    const shape =
      out.shape === "cylinder"
        ? getLang() === "pl"
          ? "walec"
          : "cylinder"
        : getLang() === "pl"
          ? "stozek"
          : "cone";
    const m = materials.find((x) => x.id === this.inputs.materialId);
    const n = (v: number) => String(Math.round(v * 100) / 100).replace(".", "-");
    const main =
      out.shape === "cylinder" ? `L${n(out.result.blankLength)}` : `R${n(out.result.rOuter)}`;
    return slug(`${shape}_${m?.id.toUpperCase() ?? "custom"}_t${n(d.thickness ?? 0)}_${main}`);
  }

  private summary(): string {
    const d = this.derived;
    const out = d.output!;
    const shape = t(out.shape === "cylinder" ? "shape.cylinder" : "shape.cone");
    const main = heroes(d)
      .map((x) => `${x.label} ${x.value}`)
      .join(" · ");
    return `${shape} · ${this.materialName()} · t ${num(d.thickness ?? 0)} · ${main}`.slice(0, 200);
  }

  private saveToHistory() {
    if (!this.derived.output) return;
    addHistory(this.inputs, this.summary());
  }

  private async exportDxf() {
    const d = this.derived;
    const out = d.output;
    if (!out) return;
    let contour;
    if (out.shape === "cylinder") {
      if (d.width === null) return;
      contour = rectangleContour(out.result.blankLength, d.width);
    } else {
      contour = sectorContour(out.result.rInner, out.result.rOuter, out.result.angle);
    }
    this.saveToHistory();
    await saveFile(
      new Blob([dxfDocument(contour)], { type: "application/dxf" }),
      `${this.fileBase()}.dxf`,
    );
  }

  private openPdf() {
    const fields: [string, Key][] = [
      ["order", "pdf.order"],
      ["operator", "pdf.operator"],
    ];
    const inputs = fields.map(([name, key]) =>
      h(
        "label",
        { class: "field" },
        h("span", { class: "field-label" }, t(key)),
        h(
          "span",
          { class: "input-wrap" },
          h("input", { name, type: "text", maxlength: "80", autocomplete: "off" }),
        ),
      ),
    );
    const notes = h("textarea", { name: "notes", rows: "3", maxlength: "400" });
    const form = h(
      "form",
      { method: "dialog", class: "dialog-body" },
      h("p", { class: "muted" }, t("pdf.optional")),
      ...inputs,
      h("label", { class: "field" }, h("span", { class: "field-label" }, t("pdf.notes")), notes),
    );
    const generate = h(
      "button",
      { type: "button", class: "btn btn-primary" },
      h("span", { class: "btn-dot", "aria-hidden": "true" }),
      t("action.generate"),
    );
    const dialog = this.dialog(t("pdf.title"), form, generate);
    generate.addEventListener("click", async () => {
      const data = new FormData(form);
      const value = (k: string) => String(data.get(k) ?? "").trim();
      generate.disabled = true;
      try {
        await this.exportPdf(
          [
            { label: t("pdf.order"), value: value("order") },
            { label: t("pdf.operator"), value: value("operator") },
            { label: t("pdf.notes"), value: value("notes") },
          ].filter((f) => f.value),
        );
        dialog.close();
      } finally {
        generate.disabled = false;
      }
    });
  }

  private async exportPdf(fields: { label: string; value: string }[]) {
    const d = this.derived;
    if (!d.output) return;
    const { buildPdf } = await import("../export/pdf");
    const date = new Intl.DateTimeFormat(getLang() === "pl" ? "pl-PL" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
    const blob = await buildPdf({
      appName: t("appName"),
      date,
      fields,
      inputs: inputRows(d, this.materialName()),
      heroes: heroes(d).map((x) => ({ label: x.label, value: x.value, unit: x.unit })),
      groups: resultGroups(d),
      warnings: d.output.warnings.map(warningText),
      views: buildViews(d.output, d.width, this.inputs.surface),
    });
    this.saveToHistory();
    await saveFile(blob, `${this.fileBase()}.pdf`);
  }

  // ---- dialogs -------------------------------------------------------------

  private dialog(title: string, body: HTMLElement, ...actions: HTMLElement[]): HTMLDialogElement {
    const close = h("button", { type: "button", class: "btn btn-ghost" }, t("action.close"));
    const dialog = h(
      "dialog",
      { class: "dialog", "aria-label": title },
      h("header", { class: "dialog-head" }, h("h2", {}, title)),
      body,
      h("footer", { class: "dialog-foot" }, close, ...actions),
    );
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove());
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    this.root.append(dialog);
    dialog.showModal();
    return dialog;
  }

  private openMachine() {
    const keys: (keyof MachineLimits)[] = [
      "topRollD",
      "bottomRollD",
      "sideRollD",
      "maxThickness",
      "maxWidth",
      "minDiameter",
    ];
    const draft: MachineLimits = { ...this.settings.machine };
    const body = h(
      "div",
      { class: "dialog-body" },
      h("p", { class: "muted" }, t("machine.intro")),
      h(
        "div",
        { class: "field-grid" },
        ...keys.map((k) =>
          h(
            "label",
            { class: "field" },
            h("span", { class: "field-label" }, t(`machine.${k}` as Key)),
            h(
              "span",
              { class: "input-wrap" },
              h("input", {
                class: "num",
                type: "text",
                inputmode: "decimal",
                value:
                  draft[k] === null
                    ? ""
                    : String(draft[k]).replace(".", getLang() === "pl" ? "," : "."),
                onInput: (e: Event) => {
                  const n = parseNumber((e.target as HTMLInputElement).value);
                  draft[k] = n !== null && n > 0 ? n : null;
                },
              }),
              h("span", { class: "unit" }, t("unit.mm")),
            ),
          ),
        ),
      ),
    );
    const apply = h("button", { type: "button", class: "btn btn-primary" }, t("action.save"));
    const dialog = this.dialog(t("machine.title"), body, apply);
    apply.addEventListener("click", () => {
      this.settings = { ...this.settings, machine: draft };
      this.saveSettings();
      this.compute();
      dialog.close();
    });
  }

  private openHistory() {
    const list = h("ul", { class: "history" });
    const fmt = new Intl.DateTimeFormat(getLang() === "pl" ? "pl-PL" : "en-GB", {
      dateStyle: "short",
      timeStyle: "short",
    });
    const render = () => {
      const entries = readHistory();
      list.replaceChildren(
        ...(entries.length
          ? entries.map((e) =>
              h(
                "li",
                { class: "history-item" },
                h(
                  "button",
                  {
                    type: "button",
                    class: "history-load",
                    onClick: () => {
                      this.inputs = { ...e.inputs };
                      save(INPUTS_KEY, this.inputs);
                      this.renderAll();
                      dialog.close();
                    },
                  },
                  h("span", { class: "history-date" }, fmt.format(e.savedAt)),
                  h("span", { class: "history-summary" }, e.summary),
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class: "btn btn-ghost btn-small",
                    "aria-label": t("action.delete"),
                    onClick: () => {
                      deleteHistory(e.id);
                      render();
                    },
                  },
                  "×",
                ),
              ),
            )
          : [h("li", { class: "muted history-empty" }, t("history.empty"))]),
      );
      clear.disabled = entries.length === 0;
    };
    const clear = h(
      "button",
      {
        type: "button",
        class: "btn btn-ghost",
        onClick: () => {
          clearHistory();
          render();
        },
      },
      t("action.clearHistory"),
    );
    const body = h(
      "div",
      { class: "dialog-body" },
      list,
      h("p", { class: "muted small" }, t("history.limit", { n: String(HISTORY_LIMIT) })),
    );
    const dialog = this.dialog(t("history.title"), body, clear);
    render();
  }
}

// ---- helpers ---------------------------------------------------------------

function group(title: string, ...children: (HTMLElement | null)[]) {
  return h(
    "div",
    { class: "group" },
    h("h2", { class: "group-title" }, title),
    h("div", { class: "group-body" }, ...children),
  );
}

function labelled(label: string, control: HTMLElement) {
  return h("div", { class: "field" }, h("span", { class: "field-label" }, label), control);
}

function rowEls(r: Row): HTMLElement[] {
  return [
    h("dt", {}, r.label, r.estimate ? h("span", { class: "tag" }, t("result.estimate")) : null),
    h("dd", {}, r.value, r.unit ? h("span", { class: "unit" }, ` ${r.unit}`) : null),
  ];
}

function warningText(w: Warning): string {
  const v = w.values ?? {};
  const values: Record<string, string> = {};
  for (const [k, n] of Object.entries(v)) {
    values[k] =
      k === "strain" || k === "limit" || k === "ratio"
        ? percent(n)
        : k === "re"
          ? num(n, 0)
          : k === "rt" || k === "min"
            ? num(n, 1)
            : num(n, 0);
  }
  return t(`warn.${w.code}` as Key, values);
}

function hasWebgl(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

async function copyValue(el: HTMLElement, value: number) {
  const text = num(value).replace(/\s/g, "");
  try {
    await navigator.clipboard.writeText(text);
    el.classList.add("is-copied");
    setTimeout(() => el.classList.remove("is-copied"), 900);
  } catch {
    // Clipboard may be blocked; the value stays visible anyway.
  }
}
