import type { MachineLimits } from "../domain/calculate";
import { materialGroups, type Material } from "../domain/materials/schema";
import { saveFile } from "../export/download";
import { getLang, t, type Key } from "../i18n";
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
import { parseNumber } from "../state/inputs";
import { confirmDialog } from "./dialog";
import { h, segmented } from "./dom";

export interface EditorState {
  machine: MachineLimits;
  process: ProcessConfig;
  materials: Material[];
}

export interface EditorHost {
  root: HTMLElement;
  state(): EditorState;
  setMachine(machine: MachineLimits): void;
  setProcess(process: ProcessConfig): void;
  setMaterials(materials: Material[]): void;
  resetMaterials(): void;
  importAll(backup: Backup): void;
  resetAll(): void;
}

type Tab = "machine" | "process" | "materials" | "backup";

const machineKeys: (keyof MachineLimits)[] = [
  "topRollD",
  "bottomRollD",
  "sideRollD",
  "maxThickness",
  "maxWidth",
  "minDiameter",
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

  constructor(private host: EditorHost) {
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
            { value: "backup", label: t("edit.tab.backup") },
          ],
          this.tab,
          (tab) => {
            this.tab = tab;
            this.render();
          },
          "editor-tabs",
        ),
        this.tab === "machine"
          ? this.machineTab()
          : this.tab === "process"
            ? this.processTab()
            : this.tab === "materials"
              ? this.materialsTab()
              : this.backupTab(),
      ),
    );
  }

  // ---- machine & process ----------------------------------------------------

  private machineTab() {
    const draft: MachineLimits = { ...this.host.state().machine };
    const save = this.saveButton(() => this.host.setMachine(draft));
    return section(
      t("machine.title"),
      h("p", { class: "muted" }, t("machine.intro")),
      h(
        "div",
        { class: "field-grid" },
        ...machineKeys.map((k) =>
          numField(t(`machine.${k}` as Key), draft[k], t("unit.mm"), (n) => {
            draft[k] = n !== null && n > 0 ? n : null;
          }),
        ),
      ),
      h("div", { class: "editor-actions" }, save),
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
        ),
        numField(
          t("edit.process.calibration"),
          draft.calibration,
          "",
          (n) => (draft.calibration = n ?? NaN),
          t("edit.process.calibration.hint"),
        ),
        numField(
          t("edit.process.springbackWarn"),
          draft.springbackWarn * 100,
          t("unit.percent"),
          (n) => (draft.springbackWarn = n === null ? NaN : n / 100),
          t("edit.process.springbackWarn.hint"),
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
    const text = (label: string, value: string, set: (v: string) => void) =>
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
      );
    const groupSelect = h(
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
        text(t("edit.mat.name"), m.name, (v) => (m.name = v)),
        text(t("edit.mat.number"), m.number ?? "", (v) => (m.number = v.trim() || null)),
        groupSelect,
        text(t("edit.mat.standard"), m.standard, (v) => (m.standard = v)),
      ),
      h("h3", { class: "group-title" }, t("edit.mat.yield")),
      bands,
      h(
        "div",
        { class: "field-grid" },
        numField(t("edit.mat.rmMin"), m.rm[0], t("unit.mpa"), (n) => (m.rm = [n ?? NaN, m.rm[1]])),
        numField(t("edit.mat.rmMax"), m.rm[1], t("unit.mpa"), (n) => (m.rm = [m.rm[0], n ?? NaN])),
        numField(
          t("edit.mat.modulus"),
          m.modulus / 1000,
          t("unit.gpa"),
          (n) => (m.modulus = n === null ? NaN : n * 1000),
        ),
        numField(t("edit.mat.poisson"), m.poisson, "", (n) => (m.poisson = n ?? NaN)),
        numField(
          t("edit.mat.density"),
          m.density,
          t("unit.density"),
          (n) => (m.density = n ?? NaN),
        ),
        numField(t("edit.mat.minRt"), m.minRt, "", (n) => (m.minRt = n ?? NaN)),
        numField(
          t("edit.mat.strainLimit"),
          m.strainLimit === null ? null : m.strainLimit * 100,
          t("unit.percent"),
          (n) => (m.strainLimit = n === null ? null : n / 100),
          t("edit.mat.strainLimit.hint"),
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

function section(title: string, ...children: HTMLElement[]) {
  return h(
    "section",
    { class: "editor-section" },
    h("h2", { class: "editor-title" }, title),
    ...children,
  );
}

function numField(
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
