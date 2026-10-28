import type { DimensionId } from "../drawing/model";
import { getLang, num, t } from "../i18n";
import { dimensionInputs, dimensionSpec } from "../state/dimensions";
import type { Derived } from "../state/derive";
import { parseNumber, type Inputs } from "../state/inputs";
import { openDialog } from "./dialog";
import { h } from "./dom";

export function dimensionName(d: Derived, id: DimensionId): string | null {
  const s = dimensionSpec(d, id);
  if (!s) return null;
  return [
    s.segment ? `${t("drawing.segment")} ${s.segment}` : "",
    t(s.label),
    s.surface ? t(`surface.${s.surface}`) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Validate a complete candidate before replacing any of the calculator's inputs. */
export function openDimensionEditor(
  root: HTMLElement,
  initial: Derived,
  id: DimensionId,
  validate: (inputs: Inputs) => Derived,
  commit: (inputs: Inputs) => void,
): HTMLDialogElement | null {
  const spec = dimensionSpec(initial, id),
    name = dimensionName(initial, id);
  if (!spec || !name) return null;
  const input = h("input", {
    id: "drawing-dimension-value",
    class: "num",
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    spellcheck: "false",
    enterkeyhint: "done",
    value: getLang() === "pl" ? String(spec.value).replace(".", ",") : String(spec.value),
    "aria-describedby": "drawing-dimension-error drawing-dimension-preview",
  });
  const error = h("p", {
    id: "drawing-dimension-error",
    class: "dimension-error",
    "aria-live": "polite",
  });
  const preview = h("p", {
    id: "drawing-dimension-preview",
    class: "muted",
    "aria-live": "polite",
  });
  const save = h("button", { type: "button", class: "btn btn-primary" }, t("drawing.apply"));
  let candidate: Inputs | null = null;
  const check = () => {
    const n = parseNumber(input.value);
    candidate = n === null ? null : dimensionInputs(initial, id, n);
    const derived = candidate ? validate(candidate) : null;
    const valid = !!derived?.output;
    error.textContent = valid ? "" : derived?.error ? t(derived.error.key) : t("drawing.invalid");
    input.setAttribute("aria-invalid", String(!valid));
    save.disabled = !valid;
    const out = derived?.output;
    preview.textContent =
      out && (out.shape === "cylinder" || out.shape === "profile")
        ? `${t("result.blankLength")}: ${num(out.result.blankLength)} ${t("unit.mm")}`
        : "";
    return valid;
  };
  const body = h(
    "div",
    { class: "dialog-body" },
    h(
      "label",
      { class: "field", for: input.id },
      h("span", { class: "field-label" }, name),
      h(
        "span",
        { class: "input-wrap" },
        input,
        h("span", { class: "unit" }, t(`unit.${spec.unit}`)),
      ),
    ),
    h("p", { class: "muted" }, t("drawing.commitHint")),
    preview,
    error,
  );
  const dialog = openDialog(root, t("drawing.title"), body, save);
  dialog.classList.add("dimension-dialog");
  const apply = () => {
    if (!check() || !candidate) return;
    commit(candidate);
    dialog.close();
  };
  input.addEventListener("input", check);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      apply();
    }
  });
  save.addEventListener("click", apply);
  check();
  input.focus();
  input.select();
  return dialog;
}
