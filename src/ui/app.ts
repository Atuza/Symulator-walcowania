import { z } from "zod";
import { withFixedMachine } from "../state/fixedMachine";
import { CUSTOM_MATERIAL_ID } from "../domain/materials/data";
import { materialGroups, yieldAt, type Material } from "../domain/materials/schema";
import type { Warning } from "../domain/types";
import { buildViews } from "../drawing/build";
import { dxfDocument, rectangleContour, sectorContour } from "../export/dxf";
import { saveFile, slug } from "../export/download";
import { getLang, num, percent, setLang, t, type Key, type Lang } from "../i18n";
import {
  loadMaterials,
  loadProcess,
  resetMaterials,
  resetProcess,
  saveMaterials,
  saveProcess,
  type ProcessConfig,
} from "../state/config";
import { meanFactor } from "../domain/calibration";
import { derive, type Derived } from "../state/derive";
import {
  loadTemplates,
  loadTrials,
  newTemplate,
  saveTemplates,
  saveTrials,
  TEMPLATES_LIMIT,
  type Template,
  type Trial,
} from "../state/library";
import { decodeInputs, shareUrl } from "../state/share";
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
  shapeDefaults,
  type Inputs,
  type TextField,
} from "../state/inputs";
import { SHAPE_FIELDS, type ProfileShape } from "../domain/shapes";
import { shapeIcon } from "./shapeIcons";
import { formatFreeRows, parseFreeRows } from "../state/freeShape";
import { settingsSchema, type Settings } from "../state/settings";
import { load, save } from "../state/storage";
import { sceneModel } from "../viz/sceneModel";
import { View2D } from "../viz/view2d";
import type { MachinePart, RollingScene } from "../viz/scene3d";
import { openDialog } from "./dialog";
import { dimensionName, openDimensionEditor } from "./dimensionEditor";
import type { DimensionId } from "../drawing/model";
import { h, segmented } from "./dom";
import { Editor } from "./editor";
import { openScanner } from "./scanner";
import { heroes, inputRows, resultGroups, type Row } from "./rows";

const INPUTS_KEY = "rolling.inputs.v1";
const SETTINGS_KEY = "rolling.settings.v1";

const defaultSettings: Settings = {
  lang: navigator.language.toLowerCase().startsWith("pl") ? "pl" : "en",
  theme: "system",
  machine: withFixedMachine(),
};

export class App {
  // The flat-end allowance changes the cut length, so every session starts with it off.
  private inputs: Inputs = {
    ...(load(INPUTS_KEY, inputsSchema) ?? defaultInputs),
    flatEnds: false,
  };
  private settings: Settings = load(SETTINGS_KEY, settingsSchema) ?? defaultSettings;
  private process: ProcessConfig = loadProcess();
  private materials: Material[] = loadMaterials();
  private trials: Trial[] = loadTrials();
  private templates: Template[] = loadTemplates();
  private derived!: Derived;
  private layout!: HTMLElement;
  private editor: Editor | null = null;

  private inputsPanel = h("section", { class: "panel inputs", "aria-label": "inputs" });
  private resultsPanel = h("aside", { class: "panel results", "aria-live": "polite" });
  private stage3d = h("div", { class: "stage-3d" });
  private stage2d = h("div", { class: "stage-2d" });
  private header = h("header", { class: "topbar" });
  private fieldEls = new Map<TextField, HTMLElement>();
  private view2d: View2D;
  private largeDrawing: View2D | null = null;
  private scene: RollingScene | null = null;
  private sceneStatus = h("div", { class: "stage-status" });
  private progress = 1;
  private playing = 0;
  /** Playback speed factor and machine parts hidden in the 3D view; kept on this device. */
  private view = load(VIEW_KEY, viewSchema) ?? { speed: 1, hidden: [] };
  private playBtn!: HTMLButtonElement;
  private slider!: HTMLInputElement;
  private pending = 0;
  private persistTimer = 0;

  constructor(private root: HTMLElement) {
    setLang(this.settings.lang);
    this.applyTheme();
    // A calculation link (e.g. scanned from a report) replaces the stored inputs once.
    const shared = decodeInputs(location.hash);
    if (shared) {
      this.inputs = shared;
      save(INPUTS_KEY, this.inputs);
    }
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    if (shared) queueMicrotask(() => toast(t("share.loaded")));
    this.layout = h(
      "main",
      { class: "layout" },
      this.inputsPanel,
      h("section", { class: "stage" }, this.stage3d, this.stage2d),
      this.resultsPanel,
    );
    root.append(this.header, this.layout);
    this.view2d = new View2D(
      this.stage2d,
      (id) => this.editDimension(id),
      (id) => dimensionName(this.derived, id),
    );
    this.buildStageControls();
    this.renderAll();
    void this.loadScene();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.applyTheme());
  }

  // ---- state ---------------------------------------------------------------

  private set<K extends keyof Inputs>(key: K, value: Inputs[K], structural: boolean) {
    this.inputs = { ...this.inputs, [key]: value };
    if (key === "shape") this.fitShapeSizes();
    this.schedulePersist();
    if (structural) this.renderAll();
    else this.scheduleCompute();
  }

  /**
   * Loads a profile shape's starting sizes. The size fields are shared between shapes but mean
   * different things in each (A is a width in one, a length in another), so they never carry over.
   */
  private fitShapeSizes() {
    this.inputs = { ...this.inputs, profileSegs: "", profileClosed: false };
    const shape = this.inputs.shape;
    if (shape === "cylinder") return;
    if (shape === "cone") {
      this.inputs = { ...this.inputs, offset: "" };
      return;
    }
    if (shape === "eccentric") {
      if ((parseNumber(this.inputs.offset) ?? 0) <= 0) {
        const large = parseNumber(this.inputs.dLarge),
          small = parseNumber(this.inputs.dSmall);
        const offset =
          large !== null && small !== null && large > small ? (large - small) / 2 : 100;
        this.inputs = { ...this.inputs, offset: String(offset) };
      }
      return;
    }
    this.inputs = { ...this.inputs, ...shapeDefaults[shape] };
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
    // A material deleted in edit mode must not leave the calculator without one.
    const id = this.inputs.materialId;
    if (id !== CUSTOM_MATERIAL_ID && !this.materials.some((m) => m.id === id) && this.materials[0])
      this.inputs = { ...this.inputs, materialId: this.materials[0].id };
    this.derived = derive(
      this.inputs,
      this.settings.machine,
      this.process,
      this.materials,
      this.trialFactors(),
    );
    this.renderResults();
    this.markErrors();
    this.renderViews();
    this.refreshPlaceholders();
  }

  private trialFactors(): Map<string, { factor: number; count: number }> {
    const groups = new Map<string, number[]>();
    for (const tr of this.trials)
      groups.set(tr.materialId, [...(groups.get(tr.materialId) ?? []), tr.factor]);
    const out = new Map<string, { factor: number; count: number }>();
    for (const [id, list] of groups) {
      const factor = meanFactor(list);
      if (factor !== null) out.set(id, { factor, count: list.length });
    }
    return out;
  }

  private renderAll() {
    this.renderHeader();
    if (this.editor) {
      this.editor.render();
      return;
    }
    this.renderInputs();
    this.compute();
    this.updateStageLabels();
  }

  // ---- header --------------------------------------------------------------

  private renderHeader() {
    // Long label on wide screens, short one on phones.
    const iconBtn = (label: string, onClick: () => void, text: string, short = text) =>
      h(
        "button",
        { type: "button", class: "btn btn-ghost", onClick, "aria-label": label },
        h("span", { class: "label-long" }, text),
        h("span", { class: "label-short" }, short),
      );
    const editing = this.editor !== null;
    this.header.replaceChildren(
      h(
        "div",
        { class: "brand" },
        h("span", { class: "brand-dot", "aria-hidden": "true" }),
        h("span", { class: "brand-name" }, t("appName")),
        editing
          ? h("span", { class: "edit-badge" }, t("edit.badge"))
          : h("span", { class: "brand-tag" }, t("appTagline")),
      ),
      h(
        "nav",
        { class: "top-actions" },
        editing
          ? h(
              "button",
              {
                type: "button",
                class: "btn btn-primary btn-small",
                onClick: () => this.exitEdit(),
              },
              t("edit.exit"),
            )
          : iconBtn(t("action.scan"), () => this.scan(), t("action.scan"), t("action.scanShort")),
        editing
          ? null
          : iconBtn(
              t("action.edit"),
              () => this.openEditGate(),
              t("action.edit"),
              t("action.editShort"),
            ),
        editing
          ? null
          : iconBtn(t("action.history"), () => this.openHistory(), t("action.history")),
        editing
          ? null
          : h(
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
    const geometry = derive(
      i,
      this.settings.machine,
      this.process,
      this.materials,
      this.trialFactors(),
    );
    const onDrawing = !!geometry.output;
    this.fieldEls.clear();
    const panel = this.inputsPanel;
    panel.replaceChildren();

    panel.append(this.templateBar());
    panel.append(group(t("section.shape"), this.shapePicker()));

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
          ...this.materials
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
      onDrawing ? null : this.numberField("thickness", t("field.thickness"), t("unit.mm")),
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
    const geo = group(t(onDrawing ? "field.surface" : "geometry.correct"));
    if (onDrawing) {
      geo.append(this.surfaceControl());
    } else if (i.shape === "cylinder" && i.mode === "fromDiameter") {
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
    } else if (i.shape === "cone" || i.shape === "eccentric") {
      geo.append(
        labelled(t("field.surface"), this.surfaceControl()),
        h(
          "div",
          { class: "field-row" },
          this.numberField("dLarge", t("field.dLarge"), t("unit.mm"), undefined, true),
          this.numberField("dSmall", t("field.dSmall"), t("unit.mm")),
        ),
        this.numberField("height", t("field.height"), t("unit.mm")),
        ...(i.shape === "eccentric"
          ? [
              h(
                "div",
                { class: "field-action" },
                this.numberField(
                  "offset",
                  t("field.offset"),
                  t("unit.mm"),
                  "0",
                  false,
                  t("hint.offset"),
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class: "chip",
                    onClick: () => {
                      // Flat side: the end circles touch one common line, e = (D1 − D2) / 2.
                      const d1 = parseNumber(this.inputs.dLarge),
                        d2 = parseNumber(this.inputs.dSmall);
                      if (d1 === null || d2 === null) return;
                      const e = Math.round(((d1 - d2) / 2) * 100) / 100;
                      this.set(
                        "offset",
                        getLang() === "pl" ? String(e).replace(".", ",") : String(e),
                        true,
                      );
                    },
                  },
                  t("action.flatSide"),
                ),
              ),
            ]
          : []),
      );
    } else {
      geo.append(...this.profileFields(i.shape));
    }
    if (i.shape !== "cone" && i.shape !== "eccentric" && (!onDrawing || geometry.width === null))
      geo.append(this.numberField("width", t("field.width"), t("unit.mm")));
    if (i.profileSegs)
      geo.append(
        h("p", { class: "field-hint" }, t("geometry.modified")),
        h(
          "button",
          {
            type: "button",
            class: "chip",
            onClick: () => {
              this.inputs = { ...this.inputs, profileSegs: "", profileClosed: false };
              this.schedulePersist();
              this.renderAll();
            },
          },
          t("geometry.reset"),
        ),
      );
    panel.append(geo);

    // Advanced
    const flatToggle = h(
      "label",
      { class: `switch${i.flatEnds ? " is-neon" : ""}` },
      h("input", {
        type: "checkbox",
        role: "switch",
        checked: i.flatEnds,
        onChange: (e: Event) => this.set("flatEnds", (e.target as HTMLInputElement).checked, true),
      }),
      h("span", { class: "switch-track", "aria-hidden": "true" }),
      h("span", {}, t("field.flatEnds")),
    );
    // Always open: these fields change the result, so they must never hide behind a toggle.
    const adv = h(
      "div",
      { class: "group" },
      h(
        "h2",
        { class: "group-title" },
        t("section.advanced"),
        i.flatEnds ? h("span", { class: "neon-chip" }, t("flat.on")) : null,
      ),
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
    panel.append(adv);
    this.updateMaterialInfo();
  }

  private shapePicker() {
    const shapes: Inputs["shape"][] = [
      "cylinder",
      "cone",
      "eccentric",
      "halfround",
      "ushape",
      "obround",
      "rect",
      "tank",
      "bucket",
      "ellipse",
      "free",
    ];
    return h(
      "div",
      { class: "shape-grid", role: "radiogroup", "aria-label": t("section.shape") },
      ...shapes.map((s) => {
        const on = s === this.inputs.shape;
        return h(
          "button",
          {
            type: "button",
            role: "radio",
            class: `shape-option${s === "eccentric" ? " shape-option-wide" : ""}${on ? " is-on" : ""}`,
            "aria-checked": String(on),
            onClick: () => {
              if (s !== this.inputs.shape) this.set("shape", s, true);
            },
          },
          shapeIcon(s),
          h("span", {}, t(`shape.${s}` as Key)),
        );
      }),
    );
  }

  private profileFields(shape: ProfileShape): HTMLElement[] {
    const out: HTMLElement[] = [labelled(t("field.surface"), this.surfaceControl())];
    if (shape === "free") return [...out, this.freeEditor()];
    const fields: Record<"a" | "b" | "r" | "angle", TextField> = {
      a: "sizeA",
      b: "sizeB",
      r: "sizeR",
      angle: "angle",
    };
    SHAPE_FIELDS[shape].forEach((f, idx) => {
      if (shape === "halfround" && f === "r") {
        out.push(
          labelled(
            t("field.dimension"),
            segmented(
              t("field.dimension"),
              [
                { value: "diameter", label: t("dim.diameter") },
                { value: "radius", label: t("dim.radius") },
              ],
              this.inputs.dimension,
              (v) => this.set("dimension", v, true),
            ),
          ),
          this.numberField(
            "value",
            t(this.inputs.dimension === "radius" ? "field.value.radius" : "field.value.diameter"),
            t("unit.mm"),
            undefined,
            true,
          ),
        );
        return;
      }
      out.push(
        this.numberField(
          fields[f],
          t(`size.${shape}.${f}` as Key),
          t(f === "angle" ? "unit.deg" : "unit.mm"),
          undefined,
          idx === 0,
          t(`size.${shape}.${f}.hint` as Key),
        ),
      );
    });
    return out;
  }

  /** Row editor for the free shape; the rows live in one text field so links and history carry them. */
  private freeEditor() {
    const rows = parseFreeRows(this.inputs.freeSegs);
    const commit = (structural: boolean) => this.set("freeSegs", formatFreeRows(rows), structural);
    const cell = (
      value: string,
      label: string,
      unit: string,
      onValue: (v: string) => void,
      extra = "",
    ) =>
      h(
        "label",
        { class: `free-cell ${extra}` },
        h("span", { class: "visually-hidden" }, label),
        h(
          "span",
          { class: "input-wrap" },
          h("input", {
            class: "num",
            type: "text",
            inputmode: "decimal",
            autocomplete: "off",
            spellcheck: "false",
            placeholder: label,
            value,
            onInput: (e: Event) => {
              onValue((e.target as HTMLInputElement).value);
              commit(false);
            },
            onFocus: (e: Event) => (e.target as HTMLInputElement).select(),
          }),
          h("span", { class: "unit" }, unit),
        ),
      );
    const list = h(
      "ol",
      { class: "free-list" },
      ...rows.map((row, i) =>
        h(
          "li",
          { class: "free-row" },
          h(
            "button",
            {
              type: "button",
              class: "free-kind",
              title: t(row.kind === "line" ? "free.line" : "free.arc"),
              onClick: () => {
                row.kind = row.kind === "line" ? "arc" : "line";
                if (row.kind === "arc" && !row.angle) row.angle = "90";
                commit(true);
              },
            },
            row.kind === "line" ? "L" : "R",
          ),
          cell(
            row.size,
            t(row.kind === "line" ? "free.length" : "free.radius"),
            t("unit.mm"),
            (v) => (row.size = v),
          ),
          h(
            "button",
            {
              type: "button",
              class: "btn btn-ghost btn-small",
              "aria-label": t("free.remove"),
              onClick: () => {
                rows.splice(i, 1);
                commit(true);
              },
            },
            "×",
          ),
          row.kind === "arc"
            ? cell(row.angle, t("free.angle"), t("unit.deg"), (v) => (row.angle = v), "free-angle")
            : null,
        ),
      ),
    );
    const add = (kind: "line" | "arc") =>
      h(
        "button",
        {
          type: "button",
          class: "chip",
          disabled: rows.length >= 40,
          onClick: () => {
            rows.push(
              kind === "line"
                ? { kind, size: "200", angle: "" }
                : { kind, size: "300", angle: "90" },
            );
            commit(true);
          },
        },
        t(kind === "line" ? "free.addLine" : "free.addArc"),
      );
    const wrap = h(
      "div",
      { class: "field free" },
      h("span", { class: "field-label" }, t("free.title")),
      list,
      h("div", { class: "chips" }, add("line"), add("arc")),
      h("span", { class: "field-msg" }, t("free.hint")),
    );
    wrap.dataset.hint = t("free.hint");
    this.fieldEls.set("freeSegs", wrap);
    return wrap;
  }

  private templateBar() {
    const saveBtn = h(
      "button",
      { type: "button", class: "chip chip-add", onClick: () => this.saveTemplate() },
      "+ ",
      t("tpl.save"),
    );
    return h(
      "div",
      { class: "group templates" },
      h("h2", { class: "group-title" }, t("tpl.title")),
      h(
        "div",
        { class: "chips" },
        ...this.templates.map((tpl) =>
          h(
            "button",
            {
              type: "button",
              class: "chip",
              onClick: () => {
                this.inputs = { ...tpl.inputs, flatEnds: false };
                save(INPUTS_KEY, this.inputs);
                this.renderAll();
              },
            },
            tpl.name,
          ),
        ),
        saveBtn,
      ),
    );
  }

  private saveTemplate() {
    if (this.templates.length >= TEMPLATES_LIMIT) {
      this.dialog(
        t("tpl.title"),
        h(
          "div",
          { class: "dialog-body" },
          h("p", {}, t("tpl.full", { n: String(TEMPLATES_LIMIT) })),
        ),
      );
      return;
    }
    const input = h("input", { type: "text", maxlength: "40", autocomplete: "off" });
    const ok = h("button", { type: "button", class: "btn btn-primary" }, t("action.save"));
    const dialog = this.dialog(
      t("tpl.save"),
      h(
        "div",
        { class: "dialog-body" },
        h(
          "label",
          { class: "field" },
          h("span", { class: "field-label" }, t("tpl.name")),
          h("span", { class: "input-wrap" }, input),
        ),
      ),
      ok,
    );
    const submit = () => {
      const name = input.value.trim();
      if (!name) return input.focus();
      this.templates = [...this.templates, newTemplate(name, this.inputs)];
      saveTemplates(this.templates);
      dialog.close();
      this.renderInputs();
      this.compute();
    };
    ok.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    input.focus();
  }

  private surfaceControl() {
    return segmented(
      t("field.surface"),
      [
        { value: "inner", label: t("surface.inner") },
        { value: "mid", label: t("surface.mid") },
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
      {
        class: `field${primary ? " field-primary" : ""}${field === "flatLength" ? " is-neon" : ""}`,
        for: id,
      },
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
      flat.placeholder = `${t("hint.auto")} ${num(this.process.flatEndFactor * d.thickness)}`;
    const k = this.fieldEls.get("k")?.querySelector("input");
    if (k) {
      const out = d.output;
      k.placeholder = out ? `${t("hint.auto")} ${num(out.result.k, 3)}` : t("hint.auto");
    }
    const cal = this.fieldEls.get("calibration")?.querySelector("input");
    if (cal && d.calibration.source !== "input") cal.placeholder = num(d.calibration.value, 3);
    const re = this.fieldEls.get("reActual")?.querySelector("input");
    if (re && d.material && d.thickness)
      re.placeholder = `min ${num(yieldAt(d.material, d.thickness), 0)}`;
    this.updateMaterialInfo();
  }

  private updateMaterialInfo() {
    const el = this.inputsPanel.querySelector("#material-info");
    if (!el) return;
    const m = this.materials.find((x) => x.id === this.inputs.materialId);
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

    if (d.flatEnd > 0)
      panel.append(
        h("p", { class: "neon-chip neon-chip-block" }, t("flat.chip", { f: num(d.flatEnd) })),
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
    const needsWidth = d.output?.shape === "cylinder" || d.output?.shape === "profile";
    const canDxf = enabled && !(needsWidth && d.width === null);
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

  private editDimension(id: DimensionId) {
    const dialog = openDimensionEditor(
      this.root,
      this.derived,
      id,
      (inputs) =>
        derive(inputs, this.settings.machine, this.process, this.materials, this.trialFactors()),
      (inputs) => {
        this.inputs = inputs;
        this.schedulePersist();
        this.renderAll();
      },
    );
    dialog?.addEventListener("close", () => (this.largeDrawing ?? this.view2d).focusDimension(id));
  }

  private enlargeDrawing() {
    const host = h("div", { class: "stage-2d drawing-large" });
    const view = new View2D(
      host,
      (id) => this.editDimension(id),
      (id) => dimensionName(this.derived, id),
    );
    this.largeDrawing = view;
    const dialog = openDialog(this.root, t("geometry.expand"), host);
    dialog.classList.add("drawing-dialog");
    dialog.addEventListener("close", () => {
      view.dispose();
      this.largeDrawing = null;
    });
    if (this.derived.output)
      view.set(
        buildViews(this.derived.output, this.derived.width, this.inputs.surface),
        t("result.development"),
      );
  }

  private renderViews() {
    const d = this.derived;
    const views = d.output ? buildViews(d.output, d.width, this.inputs.surface) : [];
    this.view2d.set(views, t("result.development"));
    this.largeDrawing?.set(views, t("result.development"));
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
        title: t("action.resetView"),
        "aria-label": t("action.resetView"),
        onClick: () => this.scene?.resetView(),
      },
      "⟲",
    );
    const speed: HTMLButtonElement = h(
      "button",
      {
        type: "button",
        class: "btn btn-small btn-ghost stage-speed",
        title: t("view.speed"),
        "aria-label": t("view.speed"),
        onClick: () => {
          const i = SPEEDS.indexOf(this.view.speed);
          this.view = { ...this.view, speed: SPEEDS[(i + 1) % SPEEDS.length]! };
          save(VIEW_KEY, this.view);
          speed.textContent = speedLabel(this.view.speed);
        },
      },
      speedLabel(this.view.speed),
    );
    const panel = h("div", { class: "stage-parts", hidden: true, role: "group" });
    const renderPanel = () =>
      panel.replaceChildren(
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
                this.scene?.setHidden(this.view.hidden);
              },
            }),
            h("span", {}, t(`part.${part}` as Key)),
          ),
        ),
      );
    renderPanel();
    const parts: HTMLButtonElement = h(
      "button",
      {
        type: "button",
        class: "btn btn-small btn-ghost",
        "aria-expanded": "false",
        onClick: () => {
          panel.hidden = !panel.hidden;
          parts.setAttribute("aria-expanded", String(!panel.hidden));
        },
      },
      t("view.partsButton"),
    );
    this.stage3d.append(
      this.sceneStatus,
      panel,
      h("div", { class: "stage-controls" }, this.playBtn, this.slider, speed, parts, reset),
    );
    this.stage2d.append(
      h(
        "button",
        {
          type: "button",
          class: "drawing-expand",
          "aria-label": t("geometry.expand"),
          title: t("geometry.expand"),
          onClick: () => this.enlargeDrawing(),
        },
        "↗",
      ),
    );
  }

  private updateStageLabels() {
    this.playBtn.textContent = this.playing ? t("action.pause") : t("action.play");
    this.slider.setAttribute("aria-label", t("view.progress"));
    const reset = this.stage3d.querySelector("#reset-view");
    reset?.setAttribute("title", t("action.resetView"));
    reset?.setAttribute("aria-label", t("action.resetView"));
    this.stage2d.querySelector(".drawing-expand")?.setAttribute("aria-label", t("geometry.expand"));
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
    // A full roll takes 6 s at 1×. Progress advances by the frame time, so changing the speed while
    // rolling takes effect at once without a jump; resuming continues from the slider position.
    let p = this.progress >= 0.999 ? 0 : this.progress;
    let last = performance.now();
    const step = (now: number) => {
      p = Math.min(1, p + ((now - last) / 6000) * this.view.speed);
      last = now;
      this.setProgress(p);
      if (p < 1) this.playing = requestAnimationFrame(step);
      else this.stopPlay();
    };
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
      this.scene.setHidden(this.view.hidden);
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
    const m = this.materials.find((x) => x.id === this.inputs.materialId);
    if (m) return m.number && !m.name.includes(m.number) ? `${m.name} (${m.number})` : m.name;
    return t("material.custom").replace("…", "");
  }

  private fileBase(): string {
    const d = this.derived;
    const out = d.output!;
    const shape = t(`shape.${this.inputs.shape}` as Key);
    const m = this.materials.find((x) => x.id === this.inputs.materialId);
    const n = (v: number) => String(Math.round(v * 100) / 100).replace(".", "-");
    const main =
      out.shape === "cone"
        ? `R${n(out.result.rOuter)}`
        : out.shape === "eccentric"
          ? `e${n(out.result.offset)}`
          : `L${n(out.result.blankLength)}`;
    return slug(`${shape}_${m?.id.toUpperCase() ?? "custom"}_t${n(d.thickness ?? 0)}_${main}`);
  }

  private summary(): string {
    const d = this.derived;
    const shape = t(`shape.${this.inputs.shape}` as Key);
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
    let bends: [number, number][] = [];
    if (out.shape === "cone") {
      contour = sectorContour(out.result.rInner, out.result.rOuter, out.result.angle);
    } else if (out.shape === "eccentric") {
      contour = out.result.outline.map(([x, y]) => ({ x, y, bulge: 0 }));
    } else {
      if (d.width === null) return;
      contour = rectangleContour(out.result.blankLength, d.width);
      const w = d.width;
      if (out.shape === "profile") bends = out.result.dev.bendLines.map((x) => [x, w]);
    }
    const lines = bends.map(([x, w]) => ({ x1: x, y1: 0, x2: x, y2: w }));
    this.saveToHistory();
    await saveFile(
      new Blob([dxfDocument(contour, lines)], { type: "application/dxf" }),
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
    const notes = h("textarea", { name: "notes", rows: "3", maxlength: "200" });
    let paper: "a4" | "a3" = "a4";
    const paperControl = segmented<"a4" | "a3">(
      t("pdf.paper"),
      [
        { value: "a4", label: "A4" },
        { value: "a3", label: "A3" },
      ],
      paper,
      (v) => {
        paper = v;
        paperControl.querySelectorAll("button").forEach((b, i) => {
          const on = (i === 0 ? "a4" : "a3") === v;
          b.classList.toggle("is-on", on);
          b.setAttribute("aria-checked", String(on));
        });
      },
    );
    const form = h(
      "form",
      { method: "dialog", class: "dialog-body" },
      h(
        "div",
        { class: "field" },
        h("span", { class: "field-label" }, t("pdf.paper")),
        paperControl,
      ),
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
          paper,
        );
        dialog.close();
      } finally {
        generate.disabled = false;
      }
    });
  }

  private async exportPdf(fields: { label: string; value: string }[], paper: "a4" | "a3") {
    const d = this.derived;
    if (!d.output) return;
    const [{ buildPdf }, { qrMatrix }] = await Promise.all([
      import("../export/pdf"),
      import("../export/qr"),
    ]);
    let qr: { matrix: boolean[][]; caption: string } | null = null;
    try {
      qr = { matrix: qrMatrix(shareUrl(location.href, this.inputs)), caption: t("pdf.qr") };
    } catch {
      // A link too long for a QR code only costs the code, not the report.
    }
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
      qr,
      version: __APP_VERSION__,
      paper,
      part: {
        material: this.materialName(),
        thickness: `${num(d.thickness ?? 0)} ${t("unit.mm")}`,
        mass: d.output.massKg !== null ? `${num(d.output.massKg, 1)} ${t("unit.kg")}` : "—",
      },
    });
    this.saveToHistory();
    await saveFile(blob, `${this.fileBase()}.pdf`);
  }

  // ---- dialogs -------------------------------------------------------------

  private dialog(title: string, body: HTMLElement, ...actions: HTMLElement[]): HTMLDialogElement {
    return openDialog(this.root, title, body, ...actions);
  }

  private scan() {
    this.stopPlay();
    openScanner(this.root, (inputs) => {
      this.inputs = inputs;
      save(INPUTS_KEY, this.inputs);
      this.renderAll();
      toast(t("scan.loaded"));
    });
  }

  // ---- edit mode -------------------------------------------------------------

  private openEditGate() {
    const enter = h(
      "button",
      { type: "button", class: "btn btn-danger", disabled: true },
      t("edit.gate.enter"),
    );
    const check = h("input", {
      type: "checkbox",
      onChange: (e: Event) => (enter.disabled = !(e.target as HTMLInputElement).checked),
    });
    const body = h(
      "div",
      { class: "dialog-body" },
      h("p", { class: "gate-warning" }, t("edit.gate.text")),
      h("p", { class: "muted" }, t("edit.gate.storage")),
      h("label", { class: "check" }, check, h("span", {}, t("edit.gate.confirm"))),
    );
    const dialog = this.dialog(t("edit.gate.title"), body, enter);
    dialog.classList.add("dialog-warning");
    enter.addEventListener("click", () => {
      dialog.close();
      this.enterEdit();
    });
  }

  private enterEdit() {
    this.stopPlay();
    this.editor = new Editor({
      root: this.root,
      currentMaterialId: this.inputs.materialId,
      currentShape: this.inputs.shape,
      state: () => ({
        machine: this.settings.machine,
        process: this.process,
        materials: this.materials,
        trials: this.trials,
        templates: this.templates,
      }),
      setTrials: (list) => {
        this.trials = list;
        saveTrials(list);
      },
      setTemplates: (list) => {
        this.templates = list;
        saveTemplates(list);
      },
      setMachine: (machine) => {
        this.settings = { ...this.settings, machine: withFixedMachine(machine) };
        this.saveSettings();
      },
      setProcess: (process) => {
        this.process = process;
        saveProcess(process);
      },
      setMaterials: (list) => {
        this.materials = list;
        saveMaterials(list);
      },
      resetMaterials: () => {
        this.materials = resetMaterials();
      },
      importAll: (backup) => {
        this.settings = { ...this.settings, machine: withFixedMachine(backup.machine) };
        this.saveSettings();
        this.process = backup.process;
        saveProcess(backup.process);
        this.materials = backup.materials;
        saveMaterials(backup.materials);
        if (backup.trials) {
          this.trials = backup.trials;
          saveTrials(backup.trials);
        }
        if (backup.templates) {
          this.templates = backup.templates;
          saveTemplates(backup.templates);
        }
      },
      resetAll: () => {
        this.settings = { ...this.settings, machine: withFixedMachine() };
        this.saveSettings();
        this.process = resetProcess();
        this.materials = resetMaterials();
        this.trials = [];
        saveTrials([]);
        this.templates = [];
        saveTemplates([]);
      },
    });
    document.documentElement.dataset.mode = "edit";
    this.layout.replaceWith(this.editor.el);
    this.renderHeader();
    window.scrollTo(0, 0);
  }

  private exitEdit() {
    if (!this.editor) return;
    this.editor.el.replaceWith(this.layout);
    this.editor = null;
    delete document.documentElement.dataset.mode;
    this.applyTheme();
    this.renderAll();
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

const VIEW_KEY = "rolling.view.v1";
const SPEEDS = [1, 2, 4, 0.5];
const PARTS: MachinePart[] = ["rolls", "housings", "tower", "ejector", "supports", "table"];
const viewSchema = z.object({
  speed: z.number().refine((v) => SPEEDS.includes(v)),
  hidden: z.array(z.enum(["housings", "tower", "ejector", "supports", "table", "rolls"])).max(6),
});

function speedLabel(v: number): string {
  return `${num(v, v < 1 ? 1 : 0)}×`;
}

function toast(text: string) {
  const el = h("div", { class: "toast", role: "status" }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 2800);
}

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
    h(
      "dt",
      { class: `${r.neon ? "is-neon" : ""}${r.list ? " is-list" : ""}` },
      r.label,
      r.estimate ? h("span", { class: "tag" }, t("result.estimate")) : null,
    ),
    h(
      "dd",
      { class: `${r.neon ? "is-neon" : ""}${r.list ? " is-list" : ""}` },
      r.value,
      r.unit ? h("span", { class: "unit" }, ` ${r.unit}`) : null,
    ),
  ];
}

function warningText(w: Warning): string {
  const v = w.values ?? {};
  const values: Record<string, string> = {};
  for (const [k, n] of Object.entries(v)) {
    values[k] =
      k === "strain" || k === "limit" || k === "ratio" || k === "share"
        ? percent(n)
        : k === "tmax" || k === "nominal" || k === "dt"
          ? num(n, 1)
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
