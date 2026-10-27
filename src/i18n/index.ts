import { en, type Dict } from "./en";
import { pl } from "./pl";

export type Lang = "pl" | "en";
export type Key = keyof Dict;

const dicts: Record<Lang, Dict> = { pl, en };

let current: Lang = "pl";

export function setLang(lang: Lang) {
  current = lang;
  document.documentElement.lang = lang;
}

export function getLang(): Lang {
  return current;
}

export function t(key: Key, values?: Record<string, string>): string {
  const text = dicts[current][key] ?? key;
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? `{${name}}`);
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Locale-aware number with a fixed number of decimals. */
export function num(value: number, decimals = 2): string {
  const key = `${current}:${decimals}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(current === "pl" ? "pl-PL" : "en-GB", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(key, f);
  }
  return f.format(value);
}

export function percent(value: number): string {
  return `${num(value * 100, 1)} %`;
}
