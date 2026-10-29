import type { DimensionId } from "../drawing/model";
import { getLang, num, t } from "../i18n";
import { dimensionInputs, dimensionSpec, validDimensionResult } from "../state/dimensions";
import type { Derived } from "../state/derive";
import { parseNumber, type Inputs } from "../state/inputs";
import { openDialog } from "./dialog";
import { h } from "./dom";
import { editableSegments, profileDimensionSpec } from "../state/profileDimensions";

export function dimensionName(d: Derived, id: DimensionId): string | null {
  const s = dimensionSpec(d, id);
  if (!s) return null;
  return [
    s.marker ?? (s.segment ? `${t("drawing.segment")} ${s.segment}` : ""),
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
  const linked = h("div", { class: "dimension-linked", "aria-live": "polite" });
  let candidate: Inputs | null = null;
  const check = () => {
    const n = parseNumber(input.value);
    candidate = n === null ? null : dimensionInputs(initial, id, n);
    const derived = candidate ? validate(candidate) : null;
    const valid = !!derived && validDimensionResult(derived);
    error.textContent = valid
      ? ""
      : derived?.error
        ? t(derived.error.key)
        : n !== null
          ? t("geometry.constraint")
          : t("drawing.invalid");
    input.setAttribute("aria-invalid", String(!valid));
    save.disabled = !valid;
    const out = valid ? derived?.output : null;
    preview.textContent =
      out && (out.shape === "cylinder" || out.shape === "profile")
        ? `${t("result.blankLength")}: ${num(out.result.blankLength)} ${t("unit.mm")}`
        : "";
    linked.replaceChildren();
    if (valid && derived) {
      const before = editableSegments(initial),
        after = editableSegments(derived);
      const changes: string[] = [];
      let lineNumber = 0,
        arcNumber = 0;
      if (before && after)
        before.forEach((a, i) => {
          const marker = a.kind === "line" ? `L${++lineNumber}` : `R${++arcNumber}`;
          const b = after[i];
          if (!b || a.kind !== b.kind) return;
          const sizeA = a.kind === "line" ? a.length : a.radius,
            sizeB = b.kind === "line" ? b.length : b.radius;
          if (Math.abs(sizeA - sizeB) > 0.00001 && id !== `segment.${i}.size`)
            changes.push(`${marker}: ${num(sizeA)} → ${num(sizeB)} mm`);
          if (
            a.kind === "arc" &&
            b.kind === "arc" &&
            Math.abs(a.angle - b.angle) > 1e-8 &&
            id !== `segment.${i}.angle`
          )
            changes.push(
              `φ${arcNumber}: ${num((a.angle * 180) / Math.PI)}° → ${num((b.angle * 180) / Math.PI)}°`,
            );
        });
      for (const extent of ["extent.x", "extent.y"] as const) {
        const a = profileDimensionSpec(initial, extent),
          b = profileDimensionSpec(derived, extent);
        if (a && b && id !== extent && Math.abs(a.value - b.value) > 0.00001)
          changes.push(`${t(a.label)}: ${num(a.value)} → ${num(b.value)} mm`);
      }
      for (const [field, label] of [
        ["dLarge", "field.dLarge"],
        ["dSmall", "field.dSmall"],
        ["height", "field.height"],
        ["offset", "field.offset"],
        ["sizeA", "geometry.width"],
        ["sizeB", "geometry.height"],
      ] as const) {
        const a = parseNumber(initial.inputs[field]),
          b = parseNumber(derived.inputs[field]);
        if (a !== null && b !== null && Math.abs(a - b) > 0.00001)
          changes.push(`${t(label)}: ${num(a)} → ${num(b)} mm`);
      }
      for (const measure of [
        "diameter.inner",
        "diameter.outer",
        "r",
        "cylinder.circumference",
        "cone.radius.large",
        "cone.radius.small",
        "cone.circumference.large",
        "cone.circumference.small",
      ] as const) {
        if (measure === id) continue;
        const a = dimensionSpec(initial, measure),
          b = dimensionSpec(derived, measure);
        if (a && b && (Math.abs(a.value - b.value) > 0.00001 || a.surface !== b.surface))
          changes.push(`${dimensionName(derived, measure)}: ${num(b.value)} mm`);
      }
      if (changes.length)
        linked.append(
          h("p", {}, t("geometry.coupled")),
          h("ul", {}, ...changes.map((c) => h("li", {}, c))),
        );
    }
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
    id === "profile.blankLength" || id.startsWith("cone.box.")
      ? h("p", { class: "muted" }, t("drawing.scaleHint"))
      : id.startsWith("cone.arc.")
        ? h("p", { class: "muted" }, t("drawing.arcHint"))
        : id.includes("circumference")
          ? h("p", { class: "muted" }, t("drawing.circumferenceHint"))
          : id === "cylinder.blankLength"
            ? h("p", { class: "muted" }, t("drawing.blankHint"))
            : null,
    h("p", { class: "muted" }, t("drawing.commitHint")),
    preview,
    linked,
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
