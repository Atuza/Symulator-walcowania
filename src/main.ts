import "@fontsource/poppins/latin-ext-300.css";
import "@fontsource/poppins/latin-ext-400.css";
import "@fontsource/poppins/latin-ext-500.css";
import "@fontsource/poppins/latin-300.css";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource-variable/geist-mono/index.css";
import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import { t } from "./i18n";
import { App } from "./ui/app";

const root = document.getElementById("app");
if (root) new App(root);

const updateSW = registerSW({
  onNeedRefresh() {
    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = "update-bar";
    bar.textContent = t("action.update");
    bar.addEventListener("click", () => void updateSW(true));
    document.body.append(bar);
  },
});
