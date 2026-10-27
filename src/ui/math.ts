/*
 * Minimal TeX-like notation rendered as native MathML, for the formulas in edit mode.
 * Supported: x_i, x^2, x_{ab}, \frac{a}{b}, \sqrt{x}, \text{...}, \mathrm{...}, groups {...},
 * Greek letters and a few operators. Formulas are static strings from the app, never user input.
 */

export type MathNode =
  | { t: "i"; v: string } // identifier
  | { t: "n"; v: string } // number
  | { t: "o"; v: string } // operator
  | { t: "x"; v: string } // upright text
  | { t: "row"; c: MathNode[] }
  | { t: "frac"; a: MathNode; b: MathNode }
  | { t: "sqrt"; a: MathNode }
  | { t: "sub"; base: MathNode; s: MathNode }
  | { t: "sup"; base: MathNode; s: MathNode }
  | { t: "subsup"; base: MathNode; s: MathNode; p: MathNode }
  | { t: "space" };

const SYMBOLS: Record<string, MathNode> = {
  cdot: { t: "o", v: "·" },
  times: { t: "o", v: "×" },
  approx: { t: "o", v: "≈" },
  le: { t: "o", v: "≤" },
  ge: { t: "o", v: "≥" },
  ldots: { t: "o", v: "…" },
  to: { t: "o", v: "→" },
  pm: { t: "o", v: "±" },
  infty: { t: "i", v: "∞" },
  pi: { t: "i", v: "π" },
  alpha: { t: "i", v: "α" },
  theta: { t: "i", v: "θ" },
  nu: { t: "i", v: "ν" },
  rho: { t: "i", v: "ρ" },
  sigma: { t: "i", v: "σ" },
  varepsilon: { t: "i", v: "ε" },
  Delta: { t: "o", v: "Δ" },
  quad: { t: "space" },
  sin: { t: "x", v: "sin" },
  cos: { t: "x", v: "cos" },
  tan: { t: "x", v: "tan" },
  log: { t: "x", v: "log" },
  lg: { t: "x", v: "lg" },
  min: { t: "x", v: "min" },
  max: { t: "x", v: "max" },
};

export function parseMath(src: string): MathNode {
  let i = 0;

  const skip = () => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
  };

  const braced = (): string => {
    // Raw text up to the matching brace, for \text and \mathrm.
    skip();
    if (src[i] !== "{") throw new Error(`"{" expected at ${i}`);
    let depth = 0;
    const start = ++i;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        if (depth === 0) return src.slice(start, i++);
        depth--;
      }
    }
    throw new Error("unclosed {");
  };

  const group = (): MathNode => {
    skip();
    if (src[i] === "{") {
      i++;
      const inner = row("}");
      i++;
      return inner;
    }
    const a = atom();
    if (!a) throw new Error(`argument expected at ${i}`);
    return a;
  };

  const atom = (): MathNode | null => {
    skip();
    const ch = src[i];
    if (ch === undefined || ch === "}") return null;
    if (ch === "{") return group();
    if (ch === "\\") {
      const m = /^\\([A-Za-z]+)/.exec(src.slice(i));
      if (!m) {
        i += 2;
        return { t: "o", v: src[i - 1]! };
      }
      i += m[0].length;
      const name = m[1]!;
      if (name === "frac") return { t: "frac", a: group(), b: group() };
      if (name === "sqrt") return { t: "sqrt", a: group() };
      if (name === "text" || name === "mathrm") return { t: "x", v: braced() };
      const sym = SYMBOLS[name];
      if (!sym) throw new Error(`unknown \\${name}`);
      return sym;
    }
    const num = /^\d+(?:[.,]\d+)?/.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      return { t: "n", v: num[0] };
    }
    i++;
    if (/\p{L}/u.test(ch)) return { t: "i", v: ch };
    if (ch === "'") return { t: "o", v: "′" };
    if (ch === "-") return { t: "o", v: "−" };
    if (ch === "*") return { t: "o", v: "·" };
    return { t: "o", v: ch };
  };

  const term = (): MathNode | null => {
    let base = atom();
    if (!base) return null;
    for (;;) {
      skip();
      const c = src[i];
      if (c !== "_" && c !== "^") return base;
      i++;
      const script = group();
      if (c === "_") {
        if (base.t === "sup") base = { t: "subsup", base: base.base, s: script, p: base.s };
        else base = { t: "sub", base, s: script };
      } else if (base.t === "sub") base = { t: "subsup", base: base.base, s: base.s, p: script };
      else base = { t: "sup", base, s: script };
    }
  };

  const row = (end?: string): MathNode => {
    const c: MathNode[] = [];
    for (;;) {
      skip();
      if (i >= src.length || (end && src[i] === end)) break;
      const n = term();
      if (!n) break;
      c.push(n);
    }
    if (end && src[i] !== end) throw new Error(`"${end}" expected`);
    return c.length === 1 ? c[0]! : { t: "row", c };
  };

  const out = row();
  if (i < src.length) throw new Error(`unexpected "${src[i]}" at ${i}`);
  return out;
}

const NS = "http://www.w3.org/1998/Math/MathML";

function el(tag: string, ...children: (Element | string)[]): Element {
  const e = document.createElementNS(NS, tag);
  for (const c of children) e.append(c);
  return e;
}

function render(n: MathNode): Element {
  switch (n.t) {
    case "i": {
      // Multi-letter identifiers would render upright anyway; single letters stay italic.
      return el("mi", n.v);
    }
    case "n":
      return el("mn", n.v);
    case "o":
      return el("mo", n.v);
    case "x": {
      const e = el("mi", n.v);
      e.setAttribute("mathvariant", "normal");
      return e;
    }
    case "space": {
      const e = el("mspace");
      e.setAttribute("width", "1em");
      return e;
    }
    case "row":
      return el("mrow", ...n.c.map(render));
    case "frac":
      return el("mfrac", render(n.a), render(n.b));
    case "sqrt":
      return el("msqrt", render(n.a));
    case "sub":
      return el("msub", render(n.base), render(n.s));
    case "sup":
      return el("msup", render(n.base), render(n.s));
    case "subsup":
      return el("msubsup", render(n.base), render(n.s), render(n.p));
  }
}

/** A <math> element for the formula; block formulas are centred display math. */
export function mathElement(src: string, block = false): Element {
  const math = el("math", render(parseMath(src)));
  if (block) math.setAttribute("display", "block");
  return math;
}
