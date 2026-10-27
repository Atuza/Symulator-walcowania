type Child = Node | string | null | undefined | false;
type Attrs = Record<string, unknown>;

/** Small element factory: `on*` keys become listeners, booleans toggle attributes. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "class") {
      el.className = String(value);
    } else if (key === "value" && "value" in el) {
      (el as HTMLInputElement).value = String(value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Segmented control; a radio group with large touch targets. */
export function segmented<T extends string>(
  label: string,
  options: SegmentOption<T>[],
  current: T,
  onChange: (value: T) => void,
  extraClass = "",
): HTMLElement {
  return h(
    "div",
    { class: `segmented ${extraClass}`, role: "radiogroup", "aria-label": label },
    ...options.map((o) =>
      h(
        "button",
        {
          type: "button",
          role: "radio",
          "aria-checked": String(o.value === current),
          class: o.value === current ? "is-on" : "",
          onClick: () => {
            if (o.value !== current) onChange(o.value);
          },
        },
        o.label,
      ),
    ),
  );
}
