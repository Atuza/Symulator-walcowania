import { t } from "../i18n";
import { h } from "./dom";

/** Modal dialog with a close button; removed from the DOM when closed. */
export function openDialog(
  root: HTMLElement,
  title: string,
  body: HTMLElement,
  ...actions: HTMLElement[]
): HTMLDialogElement {
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
  root.append(dialog);
  dialog.showModal();
  return dialog;
}

export function confirmDialog(
  root: HTMLElement,
  title: string,
  text: string,
  confirmLabel: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    let confirmed = false;
    const ok = h("button", { type: "button", class: "btn btn-danger" }, confirmLabel);
    const dialog = openDialog(
      root,
      title,
      h("div", { class: "dialog-body" }, h("p", {}, text)),
      ok,
    );
    ok.addEventListener("click", () => {
      confirmed = true;
      dialog.close();
    });
    dialog.addEventListener("close", () => resolve(confirmed));
  });
}
