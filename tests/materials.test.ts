import { describe, expect, it } from "vitest";
import { materials } from "../src/domain/materials/data";
import { materialSchema, yieldAt } from "../src/domain/materials/schema";

describe("material database", () => {
  it("matches the schema", () => {
    for (const m of materials) expect(() => materialSchema.parse(m), m.id).not.toThrow();
  });
  it("has unique ids", () => {
    expect(new Set(materials.map((m) => m.id)).size).toBe(materials.length);
  });
  it("has yield bands in ascending thickness with non-increasing strength", () => {
    for (const m of materials) {
      for (let i = 1; i < m.yield.length; i++) {
        const prev = m.yield[i - 1]!;
        const cur = m.yield[i]!;
        expect(prev.maxT, m.id).not.toBeNull();
        if (cur.maxT !== null) expect(cur.maxT, m.id).toBeGreaterThan(prev.maxT!);
        expect(cur.re, m.id).toBeLessThanOrEqual(prev.re);
      }
      expect(m.rm[0], m.id).toBeLessThan(m.rm[1]);
      expect(m.rm[0], m.id).toBeGreaterThan(m.yield[0]!.re);
    }
  });
  it("picks the band for a thickness", () => {
    const s355 = materials.find((m) => m.id === "s355j2")!;
    expect(yieldAt(s355, 10)).toBe(355);
    expect(yieldAt(s355, 16)).toBe(355);
    expect(yieldAt(s355, 16.1)).toBe(345);
    expect(yieldAt(s355, 500)).toBe(295);
  });
});
