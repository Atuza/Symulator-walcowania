import { describe, expect, it } from "vitest";
import { allDocs } from "../src/i18n/docs";
import { allGeometryDocs } from "../src/i18n/geometry";
import { parseMath } from "../src/ui/math";

describe("formula notation", () => {
  it("parses fractions, scripts and roots", () => {
    expect(parseMath("\\frac{a}{b}")).toEqual({
      t: "frac",
      a: { t: "i", v: "a" },
      b: { t: "i", v: "b" },
    });
    expect(parseMath("R_s")).toEqual({ t: "sub", base: { t: "i", v: "R" }, s: { t: "i", v: "s" } });
    expect(parseMath("x_i^2")).toEqual({
      t: "subsup",
      base: { t: "i", v: "x" },
      s: { t: "i", v: "i" },
      p: { t: "n", v: "2" },
    });
    expect(parseMath("\\sqrt{2}")).toEqual({ t: "sqrt", a: { t: "n", v: "2" } });
  });

  it("keeps decimal commas inside numbers", () => {
    expect(parseMath("1,1")).toEqual({ t: "n", v: "1,1" });
  });

  it("rejects malformed input", () => {
    expect(() => parseMath("\\frac{a}")).toThrow();
    expect(() => parseMath("{a")).toThrow();
    expect(() => parseMath("\\unknown")).toThrow();
  });

  it("parses every formula and symbol in the parameter reference", () => {
    for (const doc of [...allDocs(), ...allGeometryDocs()]) {
      for (const f of doc.formula ?? []) expect(() => parseMath(f), f).not.toThrow();
      for (const [sym] of doc.symbols ?? []) expect(() => parseMath(sym), sym).not.toThrow();
    }
  });
});
