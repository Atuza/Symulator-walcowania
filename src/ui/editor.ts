import { calibrationFactor, meanFactor } from "../domain/calibration";
import type { CapacityChart } from "../domain/capacity";
import type { MachineLimits } from "../domain/calculate";
import { materialGroups, yieldAt, type Material } from "../domain/materials/schema";
import { saveFile } from "../export/download";
import { getLang, num, percent, t, type Key } from "../i18n";
import { paramDoc, type DocId } from "../i18n/docs";
import { mathElement } from "./math";
import {
  defaultMaterial,
  defaultProcess,
  materialOrigin,
  newMaterialId,
  parseBackup,
  validateMaterial,
  type Backup,
  type ProcessConfig,
} from "../state/config";
import { z } from "zod";
import { parseNumber } from "../state/inputs";
import { load, save } from "../state/storage";
import {
  chartToText,
  machineFileText,
  parseChartText,
  parseMachineFile,
} from "../state/machineFile";
import { chartSchema } from "../state/settings";
import { TRIALS_LIMIT, type Template, type Trial } from "../state/library";
import { confirmDialog } from "./dialog";
import { h, segmented } from "./dom";

export interface EditorState {
  machine: MachineLimits;
  process: ProcessConfig;
  materials: Material[];
  trials: Trial[];
  templates: Template[];
}

export interface EditorHost {
  root: HTMLElement;
  /** Material selected in the calculator; preselected for calibration trials. */
  currentMaterialId: string;
  state(): EditorState;
  setMachine(machine: MachineLimits): void;
  setProcess(process: ProcessConfig): void;
  setMaterials(materials: Material[]): void;
  setTrials(trials: Trial[]): void;
  setTemplates(templates: Template[]): void;
  resetMaterials(): void;
  importAll(backup: Backup): void;
  resetAll(): void;
}

const DOCS_KEY = "rolling.editor.docs.v1";

type Tab = "machine" | "process" | "materials" | "calibration" | "templates" | "backup";

type MachineKey = Exclude<keyof MachineLimits, "charts">;

const machineKeys: MachineKey[] = [
  "topRollD",
  "bottomRollD",
  "sideRollD",
  "maxThickness",
  "maxWidth",
  "minDiameter",
  "rollLength",
];

/** Locale-formatted number for editing, without forced decimals. */
function plain(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "";
  const s = String(Math.round(n * 1e6) / 1e6);
  return getLang() === "pl" ? s.replace(".", ",") : s;
}

/** Settings editor shown in edit mode. Saves are explicit per section. */
export class Editor {
  readonly el = h("main", { class: "editor" });
  private tab: Tab = "machine";
  private selectedId: string | null = null;
  private draft: Material | null = null;
  private draftIsNew = false;
  private filter = "";
  /** Index of the capacity chart open for editing. */
  private chartEdit: number | null = null;

  private showDocs = load(DOCS_KEY, z.boolean()) ?? true;

  constructor(private host: EditorHost) {
    this.el.classList.toggle("hide-docs", !this.showDocs);
    this.render();
  }

  render() {
    this.el.replaceChildren(
      h(
        "div",
        { class: "editor-inner" },
        h(
          "p",
          { class: "editor-banner", role: "note" },
          h("span", { class: "editor-banner-mark", "aria-hidden": "true" }, "!"),
          t("edit.banner"),
        ),
        segmented<Tab>(
          t("edit.title"),
          [
            { value: "machine", label: t("edit.tab.machine") },
            { value: "process", label: t("edit.tab.process") },
            { value: "materials", label: t("edit.tab.materials") },
            { value: "calibration", label: t("edit.tab.calibration") },
            { value: "templates", label: t("edit.tab.templates") },
            { value: "backup", label: t("edit.tab.backup") },
          ],
          this.tab,
          (tab) => {
            this.tab = tab;
            this.render();
          },
          "editor-tabs",
        ),
        h(
          "label",
          { class: "switch editor-docs-toggle" },
          h("input", {
            type: "checkbox",
            role: "switch",
            checked: this.showDocs,
            onChange: (ev: Event) => {
              this.showDocs = (ev.target as HTMLInputElement).checked;
              save(DOCS_KEY, this.showDocs);
              this.el.classList.toggle("hide-docs", !this.showDocs);
            },
          }),
          h("span", { class: "switch-track", "aria-hidden": "true" }),
          h("span", {}, t("edit.showDocs")),
        ),
        this.tab === "machine"
          ? this.machineTab()
          : this.tab === "process"
            ? this.processTab()
            : this.tab === "materials"
              ? this.materialsTab()
              : this.tab === "calibration"
                ? this.calibrationTab()
                : this.tab === "templates"
                  ? this.templatesTab()
                  : this.backupTab(),
      ),
    );
  }

  // ---- machine & process ----------------------------------------------------

  private machineTab() {
    const draft: Pick<MachineLimits, MachineKey> = { ...this.host.state().machine };
    // Charts are saved on their own, so merge into the stored machine instead of overwriting it.
    const save = this.saveButton(() =>
      this.host.setMachine({ ...this.host.state().machine, ...draft }),
    );
    return section(
      t("machine.title"),
      h("p", { class: "muted" }, t("machine.intro")),
      h(
        "div",
        { class: "field-grid" },
        ...machineKeys.map((k) =>
          numField(
            t(`machine.${k}` as Key),
            draft[k],
            t("unit.mm"),
            (n) => {
              draft[k] = n !== null && n > 0 ? n : null;
            },
            undefined,
            "",
            `machine.${k}`,
          ),
        ),
      ),
      h("div", { class: "editor-actions" }, save),
      h("hr", { class: "editor-rule" }),
      this.chartsBlock(),
    );
  }

  private chartsBlock() {
    const charts = this.host.state().machine.charts;
    const status = h("p", { class: "editor-status", role: "status" });
    const setCharts = (next: CapacityChart[]) => {
      this.host.setMachine({ ...this.host.state().machine, charts: next });
      this.render();
    };
    const file = h("input", {
      type: "file",
      accept: "application/json,.json",
      class: "visually-hidden",
      onChange: async (e: Event) => {
        const input = e.target as HTMLInputElement;
        const f = input.files?.[0];
        input.value = "";
        if (!f) return;
        const parsed = f.size < 2_000_000 ? parseMachineFile(await f.text()) : null;
        if (!parsed) {
          status.textContent = t("edit.machineFile.bad");
          status.dataset.tone = "error";
          return;
        }
        const ok = await confirmDialog(
          this.host.root,
          t("edit.machineFile.import"),
          t("edit.machineFile.confirm"),
          t("edit.machineFile.import"),
        );
        if (!ok) return;
        this.host.setMachine(parsed.machine);
        this.chartEdit = null;
        this.render();
      },
    });
    const exportBtn = h(
      "button",
      {
        type: "button",
        class: "btn",
        onClick: () =>
          void saveFile(
            new Blob([machineFileText(this.host.state().machine)], { type: "application/json" }),
            `rolling-machine_${new Date().toISOString().slice(0, 10)}.json`,
          ),
      },
      t("edit.machineFile.export"),
    );
    const addBtn = h(
      "button",
      {
        type: "button",
        class: "btn btn-primary",
        onClick: () => {
          // Start from the last chart's grid: charts of one machine share their axes.
          const last = charts[charts.length - 1];
          const chart: CapacityChart = last
            ? structuredClone(last)
            : {
                kind: "rolling",
                re: 260,
                widths: [1000, 2000],
                diameters: [500, 1000],
                thickness: [
                  [10, 12],
                  [8, 10],
                ],
              };
          setCharts([...charts, chart]);
          this.chartEdit = charts.length;
          this.render();
        },
      },
      t("edit.chart.add"),
    );
    return withDoc(
      h(
        "div",
        { class: "charts" },
        h("h3", { class: "editor-subtitle" }, t("edit.chart.title")),
        h("p", { class: "muted" }, t("edit.chart.intro")),
        ...charts.map((c, i) =>
          this.chartEdit === i
            ? this.chartForm(c, i, charts, setCharts)
            : this.chartCard(c, i, charts, setCharts),
        ),
        h(
          "div",
          { class: "editor-actions editor-actions-start" },
          addBtn,
          h(
            "button",
            { type: "button", class: "btn", onClick: () => file.click() },
            t("edit.machineFile.import"),
          ),
          exportBtn,
          file,
        ),
        status,
      ),
      "machine.charts",
    );
  }

  private chartTitle(c: CapacityChart) {
    return `${t(c.kind === "rolling" ? "edit.chart.rolling" : "edit.chart.prebending")} · Re ${num(c.re, 0)} MPa`;
  }

  private chartCard(
    c: CapacityChart,
    i: number,
    charts: CapacityChart[],
    setCharts: (next: CapacityChart[]) => void,
  ) {
    return h(
      "div",
      { class: "chart-card" },
      h(
        "div",
        { class: "chart-head" },
        h("strong", {}, this.chartTitle(c)),
        h(
          "span",
          { class: "chart-actions" },
          h(
            "button",
            {
              type: "button",
              class: "btn btn-ghost btn-small",
              onClick: () => {
                this.chartEdit = i;
                this.render();
              },
            },
            t("edit.chart.edit"),
          ),
          h(
            "button",
            {
              type: "button",
              class: "btn btn-ghost btn-small btn-danger-text",
              onClick: async () => {
                const ok = await confirmDialog(
                  this.host.root,
                  t("edit.chart.delete"),
                  this.chartTitle(c),
                  t("edit.chart.delete"),
                );
                if (ok) setCharts(charts.filter((_, j) => j !== i));
              },
            },
            t("edit.chart.delete"),
          ),
        ),
      ),
      chartTable(c),
    );
  }

  private chartForm(
    c: CapacityChart,
    i: number,
    charts: CapacityChart[],
    setCharts: (next: CapacityChart[]) => void,
  ) {
    const draft = { kind: c.kind, re: c.re as number | null };
    const error = h("p", { class: "editor-errors", role: "alert" });
    const area = h("textarea", {
      class: "chart-text",
      rows: String(Math.min(16, c.widths.length + 2)),
      spellcheck: false,
      "aria-label": t("edit.chart.grid"),
      value: chartToText(c, getLang() === "pl"),
    }) as HTMLTextAreaElement;
    const save = this.saveButton(() => {
      const grid = parseChartText(area.value);
      const chart: CapacityChart | null =
        grid && draft.re !== null && draft.re > 0
          ? { kind: draft.kind, re: draft.re, ...grid }
          : null;
      const ok = chart !== null && chartSchema.safeParse(chart).success;
      error.textContent = ok ? "" : t("edit.chart.bad");
      if (!ok || !chart) return false;
      this.chartEdit = null;
      setCharts(charts.map((x, j) => (j === i ? chart : x)));
    });
    const cancel = h(
      "button",
      {
        type: "button",
        class: "btn btn-ghost",
        onClick: () => {
          this.chartEdit = null;
          this.render();
        },
      },
      t("action.cancel"),
    );
    return h(
      "div",
      { class: "chart-card is-editing" },
      h(
        "div",
        { class: "field-grid" },
        h(
          "div",
          { class: "field" },
          h("span", { class: "field-label" }, t("edit.chart.kind")),
          segmented<CapacityChart["kind"]>(
            t("edit.chart.kind"),
            [
              { value: "rolling", label: t("edit.chart.rolling") },
              { value: "prebending", label: t("edit.chart.prebending") },
            ],
            draft.kind,
            (v) => (draft.kind = v),
          ),
        ),
        numInput(t("edit.chart.re"), draft.re, t("unit.mpa"), (n) => (draft.re = n)),
      ),
      h(
        "label",
        { class: "field" },
        h("span", { class: "field-label" }, t("edit.chart.grid")),
        area,
        h("span", { class: "field-msg" }, t("edit.chart.gridHint")),
      ),
      error,
      h("div", { class: "editor-actions" }, cancel, save),
    );
  }

  private processTab() {
    const draft: ProcessConfig = { ...this.host.state().process };
    const error = h("p", { class: "editor-errors", role: "alert" });
    const save = this.saveButton(() => {
      const ok =
        draft.flatEndFactor >= 0 &&
        draft.flatEndFactor <= 20 &&
        draft.calibration >= 0 &&
        draft.calibration <= 3 &&
        draft.springbackWarn > 0 &&
        draft.springbackWarn < 1;
      error.textContent = ok ? "" : t("edit.err.fields");
      if (ok) this.host.setProcess(draft);
      return ok;
    });
    const reset = h(
      "button",
      {
        type: "button",
        class: "btn btn-ghost",
        onClick: () => {
          this.host.setProcess({ ...defaultProcess });
          this.render();
        },
      },
      t("edit.reset"),
    );
    return section(
      t("edit.tab.process"),
      h("p", { class: "muted" }, t("edit.process.intro")),
      h(
        "div",
        { class: "field-grid" },
        numField(
          t("edit.process.flatEndFactor"),
          draft.flatEndFactor,
          t("unit.xt"),
          (n) => (draft.flatEndFactor = n ?? NaN),
          t("edit.process.flatEndFactor.hint"),
          "",
          "process.flatEndFactor",
        ),
        numField(
          t("edit.process.calibration"),
          draft.calibration,
          "",
          (n) => (draft.calibration = n ?? NaN),
          t("edit.process.calibration.hint"),
          "",
          "process.calibration",
        ),
        numField(
          t("edit.process.springbackWarn"),
          draft.springbackWarn * 100,
          t("unit.percent"),
          (n) => (draft.springbackWarn = n === null ? NaN : n / 100),
          t("edit.process.springbackWarn.hint"),
          "",
          "process.springbackWarn",
        ),
      ),
      error,
      h("div", { class: "editor-actions" }, reset, save),
    );
  }

  // ---- materials ------------------------------------------------------------

  private materialsTab() {
    const list = this.host.state().materials;
    if (!this.draft && this.selectedId) {
      const m = list.find((x) => x.id === this.selectedId);
      this.draft = m ? structuredClone(m) : null;
    }
    const q = this.filter.trim().toLowerCase();
    const visible = list.filter(
      (m) => !q || `${m.name} ${m.number ?? ""} ${m.standard}`.toLowerCase().includes(q),
    );
    const listEl = h(
      "div",
      { class: "mat-list" },
      h(
        "div",
        { class: "input-wrap" },
        h("input", {
          type: "search",
          placeholder: t("edit.mat.search"),
          value: this.filter,
          "aria-label": t("edit.mat.search"),
          onInput: (e: Event) => {
            this.filter = (e.target as HTMLInputElement).value;
            const pos = (e.target as HTMLInputElement).selectionStart;
            this.render();
            const input = this.el.querySelector<HTMLInputElement>(".mat-list input");
            input?.focus();
            if (pos !== null) input?.setSelectionRange(pos, pos);
          },
        }),
      ),
      ...materialGroups.flatMap((g) => {
        const items = visible.filter((m) => m.group === g);
        if (!items.length) return [];
        return [
          h("h3", { class: "mat-group" }, t(`group.${g}` as Key)),
          ...items.map((m) => {
            const origin = materialOrigin(m);
            return h(
              "button",
              {
                type: "button",
                class: `mat-item${m.id === this.selectedId ? " is-on" : ""}`,
                onClick: () => {
                  this.selectedId = m.id;
                  this.draft = structuredClone(m);
                  this.draftIsNew = false;
                  this.render();
                },
              },
              h("span", { class: "mat-name" }, m.name),
              origin !== "builtin"
                ? h(
                    "span",
                    { class: `tag tag-${origin}` },
                    t(origin === "user" ? "edit.mat.user" : "edit.mat.modified"),
                  )
                : null,
            );
          }),
        ];
      }),
      h(
        "div",
        { class: "mat-list-actions" },
        h(
          "button",
          {
            type: "button",
            class: "btn",
            onClick: () => {
              this.selectedId = null;
              this.draft = blankMaterial();
              this.draftIsNew = true;
              this.render();
            },
          },
          "+ ",
          t("edit.mat.add"),
        ),
        h(
          "button",
          {
            type: "button",
            class: "btn btn-ghost",
            onClick: async () => {
              const ok = await confirmDialog(
                this.host.root,
                t("edit.mat.resetAll"),
                t("edit.mat.resetConfirm"),
                t("edit.mat.resetAll"),
              );
              if (!ok) return;
              this.host.resetMaterials();
              this.draft = null;
              this.selectedId = null;
              this.render();
            },
          },
          t("edit.mat.resetAll"),
        ),
      ),
    );
    const form = this.draft
      ? this.materialForm(this.draft)
      : h("div", { class: "mat-empty muted" }, t("edit.mat.empty"));
    return h("div", { class: "mat-layout" }, listEl, form);
  }

  private materialForm(m: Material) {
    const errors = h("ul", { class: "editor-errors", role: "alert" });
    const text = (label: string, value: string, set: (v: string) => void, doc: DocId) =>
      withDoc(
        h(
          "label",
          { class: "field" },
          h("span", { class: "field-label" }, label),
          h(
            "span",
            { class: "input-wrap" },
            h("input", {
              type: "text",
              value,
              autocomplete: "off",
              onInput: (e: Event) => set((e.target as HTMLInputElement).value),
            }),
          ),
        ),
        doc,
      );
    const groupSelect = withDoc(
      h(
        "label",
        { class: "field" },
        h("span", { class: "field-label" }, t("edit.mat.group")),
        h(
          "span",
          { class: "select-wrap" },
          h(
            "select",
            {
              onChange: (e: Event) =>
                (m.group = (e.target as HTMLSelectElement).value as Material["group"]),
            },
            ...materialGroups.map((g) =>
              h("option", { value: g, selected: g === m.group }, t(`group.${g}` as Key)),
            ),
          ),
        ),
      ),
      "mat.group",
    );

    const bands = h("div", { class: "bands" });
    const renderBands = () => {
      bands.replaceChildren(
        ...m.yield.map((band, i) =>
          h(
            "div",
            { class: "band" },
            numField(
              t("edit.mat.maxT"),
              band.maxT,
              t("unit.mm"),
              (n) => (band.maxT = n),
              undefined,
              t("edit.mat.maxT.open"),
            ),
            numField(t("edit.mat.re"), band.re, t("unit.mpa"), (n) => (band.re = n ?? NaN)),
            h(
              "button",
              {
                type: "button",
                class: "btn btn-ghost btn-icon band-remove",
                "aria-label": t("edit.mat.removeBand"),
                title: t("edit.mat.removeBand"),
                disabled: m.yield.length === 1,
                onClick: () => {
                  m.yield.splice(i, 1);
                  renderBands();
                },
              },
              "×",
            ),
          ),
        ),
        h(
          "button",
          {
            type: "button",
            class: "btn btn-small btn-ghost",
            onClick: () => {
              const last = m.yield[m.yield.length - 1];
              m.yield.push({ maxT: null, re: last ? last.re : NaN });
              renderBands();
            },
          },
          "+ ",
          t("edit.mat.addBand"),
        ),
      );
    };
    renderBands();

    const list = () => this.host.state().materials;
    const save = this.saveButton(() => {
      const candidate = { ...m, name: m.name.trim(), standard: m.standard.trim() };
      if (this.draftIsNew) candidate.id = newMaterialId(candidate.name);
      const problems = validateMaterial(candidate, list());
      errors.replaceChildren(
        ...problems.map((p) =>
          h(
            "li",
            {},
            p.field
              ? t("edit.err.field", { field: t((fieldLabels[p.field] ?? "edit.mat.name") as Key) })
              : t(p.key as Key),
          ),
        ),
      );
      if (problems.length) return false;
      const next = this.draftIsNew
        ? [...list(), candidate]
        : list().map((x) => (x.id === candidate.id ? candidate : x));
      this.host.setMaterials(next);
      this.selectedId = candidate.id;
      this.draft = structuredClone(candidate);
      this.draftIsNew = false;
      // Re-render after the "saved" feedback so list badges update.
      setTimeout(() => this.render(), 900);
      return true;
    }, t("edit.mat.save"));

    const origin = this.draftIsNew ? "user" : materialOrigin(m);
    const secondary: HTMLElement[] = [];
    if (!this.draftIsNew) {
      secondary.push(
        h(
          "button",
          {
            type: "button",
            class: "btn btn-ghost",
            onClick: () => {
              this.draft = {
                ...structuredClone(m),
                name: `${m.name} (${t("edit.mat.copy")})`,
                note: null,
              };
              this.draftIsNew = true;
              this.selectedId = null;
              this.render();
            },
          },
          t("edit.mat.duplicate"),
        ),
      );
      const base = defaultMaterial(m.id);
      if (base && origin === "modified") {
        secondary.push(
          h(
            "button",
            {
              type: "button",
              class: "btn btn-ghost",
              onClick: () => {
                this.host.setMaterials(
                  list().map((x) => (x.id === m.id ? structuredClone(base) : x)),
                );
                this.draft = structuredClone(base);
                this.render();
              },
            },
            t("edit.mat.restore"),
          ),
        );
      }
      secondary.push(
        h(
          "button",
          {
            type: "button",
            class: "btn btn-ghost btn-danger-text",
            disabled: list().length <= 1,
            onClick: async () => {
              const ok = await confirmDialog(
                this.host.root,
                t("edit.mat.delete"),
                t("edit.mat.deleteConfirm", { name: m.name }),
                t("edit.mat.delete"),
              );
              if (!ok) return;
              this.host.setMaterials(list().filter((x) => x.id !== m.id));
              this.draft = null;
              this.selectedId = null;
              this.render();
            },
          },
          t("edit.mat.delete"),
        ),
      );
    }

    return h(
      "form",
      { class: "mat-form", onSubmit: (e: Event) => e.preventDefault() },
      h("h2", { class: "mat-title" }, this.draftIsNew ? t("edit.mat.new") : m.name),
      h(
        "div",
        { class: "field-grid" },
        text(t("edit.mat.name"), m.name, (v) => (m.name = v), "mat.name"),
        text(
          t("edit.mat.number"),
          m.number ?? "",
          (v) => (m.number = v.trim() || null),
          "mat.number",
        ),
        groupSelect,
        text(t("edit.mat.standard"), m.standard, (v) => (m.standard = v), "mat.standard"),
      ),
      paramRow([h("h3", { class: "group-title" }, t("edit.mat.yield")), bands], "mat.yield"),
      h(
        "div",
        { class: "field-grid" },
        paramRow(
          [
            h(
              "div",
              { class: "field-pair" },
              numField(
                t("edit.mat.rmMin"),
                m.rm[0],
                t("unit.mpa"),
                (n) => (m.rm = [n ?? NaN, m.rm[1]]),
              ),
              numField(
                t("edit.mat.rmMax"),
                m.rm[1],
                t("unit.mpa"),
                (n) => (m.rm = [m.rm[0], n ?? NaN]),
              ),
            ),
          ],
          "mat.rm",
        ),
        numField(
          t("edit.mat.modulus"),
          m.modulus / 1000,
          t("unit.gpa"),
          (n) => (m.modulus = n === null ? NaN : n * 1000),
          undefined,
          "",
          "mat.modulus",
        ),
        numField(
          t("edit.mat.poisson"),
          m.poisson,
          "",
          (n) => (m.poisson = n ?? NaN),
          undefined,
          "",
          "mat.poisson",
        ),
        numField(
          t("edit.mat.density"),
          m.density,
          t("unit.density"),
          (n) => (m.density = n ?? NaN),
          undefined,
          "",
          "mat.density",
        ),
        numField(
          t("edit.mat.minRt"),
          m.minRt,
          "",
          (n) => (m.minRt = n ?? NaN),
          undefined,
          "",
          "mat.minRt",
        ),
        numField(
          t("edit.mat.strainLimit"),
          m.strainLimit === null ? null : m.strainLimit * 100,
          t("unit.percent"),
          (n) => (m.strainLimit = n === null ? null : n / 100),
          t("edit.mat.strainLimit.hint"),
          "",
          "mat.strainLimit",
        ),
      ),
      errors,
      h(
        "div",
        { class: "editor-actions" },
        h("div", { class: "editor-actions-secondary" }, ...secondary),
        save,
      ),
    );
  }

  // ---- calibration ----------------------------------------------------------

  private calibrationTab() {
    const state = this.host.state();
    const materials = state.materials;
    const first = materials[0];
    const draft = {
      materialId:
        this.calMaterial ??
        (materials.some((m) => m.id === this.host.currentMaterialId)
          ? this.host.currentMaterialId
          : (first?.id ?? "")),
      thickness: NaN,
      reActual: null as number | null,
      setInnerD: NaN,
      measuredInnerD: NaN,
    };
    const preview = h("div", { class: "cal-preview", role: "status" });
    const material = () => materials.find((m) => m.id === draft.materialId);
    const compute = () => {
      const m = material();
      if (!m) return null;
      const re = draft.reActual ?? (draft.thickness > 0 ? yieldAt(m, draft.thickness) : NaN);
      return calibrationFactor({
        thickness: draft.thickness,
        setInnerD: draft.setInnerD,
        measuredInnerD: draft.measuredInnerD,
        yieldStrength: re,
        modulus: m.modulus,
        poisson: m.poisson,
      });
    };
    const refresh = () => {
      const r = compute();
      if (r === null || r === "input") {
        preview.replaceChildren(h("span", { class: "muted" }, t("cal.fill")));
        return;
      }
      if (typeof r === "string") {
        preview.replaceChildren(h("span", { class: "cal-error" }, t(`cal.err.${r}` as Key)));
        return;
      }
      const odd = r.factor < 0.5 || r.factor > 1.5;
      preview.replaceChildren(
        h(
          "span",
          { class: "cal-factor" },
          t("cal.factor"),
          h("strong", { class: odd ? "cal-odd" : "" }, ` c = ${num(r.factor, 3)}`),
        ),
        h(
          "span",
          { class: "muted" },
          `${t("cal.measured")} ${percent(r.measuredRatio)} · ${t("cal.model")} ${percent(r.modelRatio)}`,
        ),
        ...(odd ? [h("span", { class: "cal-error" }, t("cal.odd"))] : []),
      );
    };
    const select = withDoc(
      h(
        "label",
        { class: "field" },
        h("span", { class: "field-label" }, t("result.material")),
        h(
          "span",
          { class: "select-wrap" },
          h(
            "select",
            {
              onChange: (e: Event) => {
                draft.materialId = (e.target as HTMLSelectElement).value;
                this.calMaterial = draft.materialId;
                refresh();
              },
            },
            ...materials.map((m) =>
              h("option", { value: m.id, selected: m.id === draft.materialId }, m.name),
            ),
          ),
        ),
      ),
      "cal.material",
    );
    const save = this.saveButton(() => {
      const r = compute();
      if (r === null || typeof r === "string") {
        refresh();
        return false;
      }
      const trial: Trial = {
        id: crypto.randomUUID(),
        materialId: draft.materialId,
        thickness: draft.thickness,
        reActual: draft.reActual,
        setInnerD: draft.setInnerD,
        measuredInnerD: draft.measuredInnerD,
        factor: r.factor,
        savedAt: Date.now(),
      };
      this.host.setTrials([trial, ...this.host.state().trials].slice(0, TRIALS_LIMIT));
      setTimeout(() => this.render(), 900);
      return true;
    }, t("cal.save"));

    const form = section(
      t("edit.tab.calibration"),
      h("p", { class: "muted" }, t("cal.intro")),
      h(
        "ol",
        { class: "cal-steps" },
        h("li", {}, t("cal.step1")),
        h("li", {}, t("cal.step2")),
        h("li", {}, t("cal.step3")),
      ),
      h(
        "div",
        { class: "field-grid" },
        select,
        numField(
          t("field.thickness"),
          null,
          t("unit.mm"),
          (n) => ((draft.thickness = n ?? NaN), refresh()),
          undefined,
          "",
          "cal.thickness",
        ),
        numField(
          t("cal.setInnerD"),
          null,
          t("unit.mm"),
          (n) => ((draft.setInnerD = n ?? NaN), refresh()),
          undefined,
          "",
          "cal.setInnerD",
        ),
        numField(
          t("cal.measuredInnerD"),
          null,
          t("unit.mm"),
          (n) => ((draft.measuredInnerD = n ?? NaN), refresh()),
          undefined,
          "",
          "cal.measuredInnerD",
        ),
        numField(
          t("field.reActual"),
          null,
          t("unit.mpa"),
          (n) => ((draft.reActual = n !== null && n > 0 ? n : null), refresh()),
          undefined,
          "",
          "cal.reActual",
        ),
      ),
      paramRow([preview], "cal.factor"),
      h("div", { class: "editor-actions" }, save),
    );
    refresh();

    // Per-material summary and the trial log.
    const byMaterial = new Map<string, Trial[]>();
    for (const tr of state.trials)
      byMaterial.set(tr.materialId, [...(byMaterial.get(tr.materialId) ?? []), tr]);
    const name = (id: string) => materials.find((m) => m.id === id)?.name ?? id;
    const fmt = new Intl.DateTimeFormat(getLang() === "pl" ? "pl-PL" : "en-GB", {
      dateStyle: "short",
    });
    const summary = section(
      t("cal.summary"),
      state.trials.length
        ? h(
            "div",
            { class: "table-wrap" },
            h(
              "table",
              { class: "data-table" },
              h(
                "thead",
                {},
                h(
                  "tr",
                  {},
                  h("th", {}, t("result.material")),
                  h("th", {}, t("cal.count")),
                  h("th", {}, t("cal.mean")),
                ),
              ),
              h(
                "tbody",
                {},
                ...[...byMaterial].map(([id, list]) =>
                  h(
                    "tr",
                    {},
                    h("td", {}, name(id)),
                    h("td", { class: "num" }, String(list.length)),
                    h("td", { class: "num" }, num(meanFactor(list.map((x) => x.factor)) ?? NaN, 3)),
                  ),
                ),
              ),
            ),
          )
        : h("p", { class: "muted" }, t("cal.none")),
      state.trials.length
        ? h(
            "div",
            { class: "table-wrap" },
            h(
              "table",
              { class: "data-table" },
              h(
                "thead",
                {},
                h(
                  "tr",
                  {},
                  h("th", {}, t("pdf.date")),
                  h("th", {}, t("result.material")),
                  h("th", {}, "t"),
                  h("th", {}, t("cal.setShort")),
                  h("th", {}, t("cal.measuredShort")),
                  h("th", {}, "c"),
                  h("th", {}, ""),
                ),
              ),
              h(
                "tbody",
                {},
                ...state.trials.map((tr) =>
                  h(
                    "tr",
                    {},
                    h("td", {}, fmt.format(tr.savedAt)),
                    h("td", {}, name(tr.materialId)),
                    h("td", { class: "num" }, num(tr.thickness)),
                    h("td", { class: "num" }, num(tr.setInnerD)),
                    h("td", { class: "num" }, num(tr.measuredInnerD)),
                    h("td", { class: "num" }, num(tr.factor, 3)),
                    h(
                      "td",
                      {},
                      h(
                        "button",
                        {
                          type: "button",
                          class: "btn btn-ghost btn-small btn-danger-text",
                          "aria-label": t("action.delete"),
                          onClick: () => {
                            this.host.setTrials(
                              this.host.state().trials.filter((x) => x.id !== tr.id),
                            );
                            this.render();
                          },
                        },
                        "×",
                      ),
                    ),
                  ),
                ),
              ),
            ),
          )
        : h("span"),
    );
    return h("div", { class: "editor-stack" }, form, summary);
  }

  private calMaterial: string | null = null;

  // ---- templates ------------------------------------------------------------

  private templatesTab() {
    const list = this.host.state().templates;
    const rows = list.map((tpl) => {
      let name = tpl.name;
      const save = this.saveButton(() => {
        const clean = name.trim().slice(0, 40);
        if (!clean) return false;
        this.host.setTemplates(
          this.host.state().templates.map((x) => (x.id === tpl.id ? { ...x, name: clean } : x)),
        );
        return true;
      });
      return h(
        "div",
        { class: "tpl-row" },
        h(
          "span",
          { class: "input-wrap" },
          h("input", {
            type: "text",
            value: tpl.name,
            maxlength: "40",
            "aria-label": t("tpl.name"),
            onInput: (e: Event) => (name = (e.target as HTMLInputElement).value),
          }),
        ),
        h("span", { class: "tpl-meta muted" }, describeTemplate(tpl)),
        save,
        h(
          "button",
          {
            type: "button",
            class: "btn btn-ghost btn-danger-text",
            onClick: () => {
              this.host.setTemplates(this.host.state().templates.filter((x) => x.id !== tpl.id));
              this.render();
            },
          },
          t("action.delete"),
        ),
      );
    });
    return section(
      t("edit.tab.templates"),
      h("p", { class: "muted" }, t("tpl.intro")),
      ...(rows.length ? rows : [h("p", { class: "muted" }, t("tpl.none"))]),
      docBlock("tpl.name"),
    );
  }

  // ---- backup ---------------------------------------------------------------

  private backupTab() {
    const status = h("p", { class: "editor-status", role: "status" });
    const file = h("input", {
      type: "file",
      accept: "application/json,.json",
      class: "visually-hidden",
      onChange: async (e: Event) => {
        const input = e.target as HTMLInputElement;
        const f = input.files?.[0];
        input.value = "";
        if (!f) return;
        // Settings exports are tiny; anything large is not one.
        const backup = f.size < 2_000_000 ? parseBackup(await f.text()) : null;
        if (!backup) {
          status.textContent = t("edit.backup.importBad");
          status.dataset.tone = "error";
          return;
        }
        const ok = await confirmDialog(
          this.host.root,
          t("edit.backup.import"),
          t("edit.backup.importConfirm"),
          t("edit.backup.import"),
        );
        if (!ok) return;
        this.host.importAll(backup);
        this.draft = null;
        this.selectedId = null;
        status.textContent = t("edit.backup.importOk");
        status.dataset.tone = "ok";
      },
    });
    const exportBtn = h(
      "button",
      {
        type: "button",
        class: "btn btn-primary",
        onClick: () => {
          const s = this.host.state();
          const backup: Backup = {
            format: "rolling-simulator-config",
            version: 1,
            machine: s.machine,
            process: s.process,
            materials: s.materials,
            trials: s.trials,
            templates: s.templates,
          };
          const date = new Date().toISOString().slice(0, 10);
          void saveFile(
            new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
            `rolling-settings_${date}.json`,
          );
        },
      },
      h("span", { class: "btn-dot", "aria-hidden": "true" }),
      t("edit.backup.export"),
    );
    const importBtn = h(
      "button",
      { type: "button", class: "btn", onClick: () => file.click() },
      t("edit.backup.import"),
    );
    const resetBtn = h(
      "button",
      {
        type: "button",
        class: "btn btn-ghost btn-danger-text",
        onClick: async () => {
          const ok = await confirmDialog(
            this.host.root,
            t("edit.backup.resetAll"),
            t("edit.backup.resetConfirm"),
            t("edit.backup.resetAll"),
          );
          if (!ok) return;
          this.host.resetAll();
          this.draft = null;
          this.selectedId = null;
          this.render();
        },
      },
      t("edit.backup.resetAll"),
    );
    return section(
      t("edit.tab.backup"),
      h("p", { class: "muted" }, t("edit.backup.intro")),
      h("div", { class: "editor-actions editor-actions-start" }, exportBtn, importBtn, file),
      status,
      h("hr", { class: "editor-rule" }),
      h("div", { class: "editor-actions editor-actions-start" }, resetBtn),
      h("p", { class: "muted small" }, `${t("edit.version")} ${__APP_VERSION__}`),
    );
  }

  // ---- shared ---------------------------------------------------------------

  /** Primary save button with short confirmation feedback. The action returns false on invalid input. */
  private saveButton(action: () => boolean | void, label = t("action.save")) {
    const btn: HTMLButtonElement = h(
      "button",
      {
        type: "button",
        class: "btn btn-primary",
        onClick: () => {
          if (action() === false) return;
          btn.textContent = t("edit.saved");
          btn.classList.add("is-done");
          setTimeout(() => {
            btn.textContent = label;
            btn.classList.remove("is-done");
          }, 900);
        },
      },
      label,
    );
    return btn;
  }
}

const fieldLabels: Record<string, string> = {
  name: "edit.mat.name",
  number: "edit.mat.number",
  group: "edit.mat.group",
  standard: "edit.mat.standard",
  yield: "edit.mat.yield",
  rm: "edit.mat.rm",
  modulus: "edit.mat.modulus",
  poisson: "edit.mat.poisson",
  density: "edit.mat.density",
  minRt: "edit.mat.minRt",
  strainLimit: "edit.mat.strainLimit",
};

/** Read-only view of a capacity chart: widths down, diameters across. */
function chartTable(c: CapacityChart) {
  return h(
    "div",
    { class: "chart-scroll" },
    h(
      "table",
      { class: "chart-table" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", { scope: "col" }, "B \\ Ø"),
          ...c.diameters.map((d) => h("th", { scope: "col" }, num(d, 0))),
        ),
      ),
      h(
        "tbody",
        {},
        ...c.widths.map((w, i) =>
          h(
            "tr",
            {},
            h("th", { scope: "row" }, num(w, 0)),
            ...(c.thickness[i] ?? []).map((v) => h("td", {}, num(v, Number.isInteger(v) ? 0 : 1))),
          ),
        ),
      ),
    ),
  );
}

function section(title: string, ...children: HTMLElement[]) {
  return h(
    "section",
    { class: "editor-section" },
    h("h2", { class: "editor-title" }, title),
    ...children,
  );
}

/** Reference text: what the parameter is, what it affects, valid range, formula with symbols. */
function docBlock(id: DocId) {
  const d = paramDoc(id);
  const fact = (label: Key, text: string, cls = "") =>
    h(
      "div",
      { class: `doc-fact ${cls}` },
      h("span", { class: "doc-label" }, t(label)),
      h("p", {}, text),
    );
  return h(
    "div",
    { class: "param-doc" },
    h("p", { class: "doc-what" }, d.what),
    h("div", { class: "doc-facts" }, fact("doc.effect", d.effect), fact("doc.range", d.range)),
    d.formula?.length
      ? h(
          "figure",
          { class: "doc-formula" },
          h("figcaption", {}, t("doc.formula")),
          ...d.formula.map((f) => formula(f, true)),
          d.symbols?.length
            ? h(
                "dl",
                { class: "doc-symbols" },
                ...d.symbols.flatMap(([sym, text]) => [
                  h("dt", {}, formula(sym)),
                  h("dd", {}, text),
                ]),
              )
            : null,
        )
      : null,
    d.example ? fact("doc.example", d.example, "doc-example") : null,
    d.tip ? fact("doc.tip", d.tip, "doc-tip") : null,
    d.source ? h("p", { class: "doc-source" }, `${t("doc.source")}: ${d.source}`) : null,
  );
}

function formula(src: string, block = false): Node {
  try {
    return mathElement(src, block);
  } catch {
    // A notation error must not hide the parameter; show the source instead.
    return h("code", {}, src);
  }
}

/** Field(s) on the left, reference on the right; stacks on narrow screens. */
function paramRow(fields: HTMLElement[], doc: DocId): HTMLElement {
  return h(
    "div",
    { class: "param-row" },
    h("div", { class: "param-field" }, ...fields),
    docBlock(doc),
  );
}

function withDoc(field: HTMLElement, doc?: DocId): HTMLElement {
  return doc ? paramRow([field], doc) : field;
}

function describeTemplate(tpl: Template): string {
  const i = tpl.inputs;
  const shape = t(i.shape === "cylinder" ? "shape.cylinder" : "shape.cone");
  const main =
    i.shape === "cone"
      ? `Ø ${i.dLarge} / ${i.dSmall} · H ${i.height}`
      : i.mode === "fromDiameter"
        ? `${i.dimension === "radius" ? "R" : "Ø"} ${i.value}`
        : `L ${i.length}`;
  return `${shape} · t ${i.thickness} · ${main}`;
}

function numField(
  label: string,
  value: number | null,
  unit: string,
  onValue: (n: number | null) => void,
  hint?: string,
  placeholder = "",
  doc?: DocId,
) {
  return withDoc(numInput(label, value, unit, onValue, hint, placeholder), doc);
}

function numInput(
  label: string,
  value: number | null,
  unit: string,
  onValue: (n: number | null) => void,
  hint?: string,
  placeholder = "",
) {
  return h(
    "label",
    { class: "field" },
    h("span", { class: "field-label" }, label),
    h(
      "span",
      { class: "input-wrap" },
      h("input", {
        class: "num",
        type: "text",
        inputmode: "decimal",
        autocomplete: "off",
        placeholder,
        value: plain(value),
        onInput: (e: Event) => {
          const raw = (e.target as HTMLInputElement).value;
          const n = parseNumber(raw);
          // Non-empty text that does not parse must fail validation, not read as "empty".
          onValue(raw.trim() === "" ? null : (n ?? NaN));
        },
      }),
      unit ? h("span", { class: "unit" }, unit) : null,
    ),
    hint ? h("span", { class: "field-msg" }, hint) : null,
  );
}

function blankMaterial(): Material {
  return {
    id: "user-new",
    name: "",
    number: null,
    group: "structural",
    standard: "",
    yield: [{ maxT: null, re: NaN }],
    rm: [NaN, NaN],
    modulus: 210_000,
    poisson: 0.3,
    density: 7850,
    minRt: 1,
    strainLimit: 0.05,
    note: null,
  };
}
