import type { CapacityChart } from "../domain/capacity";
import type { MachineLimits } from "../domain/calculate";
import { saveFile } from "../export/download";
import { getLang, num, t } from "../i18n";
import type { DocId } from "../i18n/docs";
import {
  chartToText,
  machineFileText,
  parseChartText,
  parseMachineFile,
} from "../state/machineFile";
import { chartSchema } from "../state/settings";
import { confirmDialog } from "./dialog";
import { h, segmented } from "./dom";

/** What the chart editor needs from the settings editor around it. */
export interface ChartsContext {
  root: HTMLElement;
  machine(): MachineLimits;
  setMachine(machine: MachineLimits): void;
  /** Re-renders the whole editor after a change. */
  render(): void;
  saveButton(action: () => boolean | void): HTMLButtonElement;
  withDoc(field: HTMLElement, doc: DocId): HTMLElement;
  numInput(
    label: string,
    value: number | null,
    unit: string,
    onValue: (n: number | null) => void,
  ): HTMLElement;
}

/** Capacity charts in the machine tab: list, grid editor and machine file import/export. */
export class ChartsEditor {
  /** Index of the chart open for editing. */
  private chartEdit: number | null = null;

  constructor(private ctx: ChartsContext) {}

  block() {
    const charts = this.ctx.machine().charts;
    const status = h("p", { class: "editor-status", role: "status" });
    const setCharts = (next: CapacityChart[]) => {
      this.ctx.setMachine({ ...this.ctx.machine(), charts: next });
      this.ctx.render();
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
          this.ctx.root,
          t("edit.machineFile.import"),
          t("edit.machineFile.confirm"),
          t("edit.machineFile.import"),
        );
        if (!ok) return;
        this.ctx.setMachine(parsed.machine);
        this.chartEdit = null;
        this.ctx.render();
      },
    });
    const exportBtn = h(
      "button",
      {
        type: "button",
        class: "btn",
        onClick: () =>
          void saveFile(
            new Blob([machineFileText(this.ctx.machine())], { type: "application/json" }),
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
          this.ctx.render();
        },
      },
      t("edit.chart.add"),
    );
    return this.ctx.withDoc(
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
                this.ctx.render();
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
                  this.ctx.root,
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
    const save = this.ctx.saveButton(() => {
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
          this.ctx.render();
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
        this.ctx.numInput(t("edit.chart.re"), draft.re, t("unit.mpa"), (n) => (draft.re = n)),
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
}

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
