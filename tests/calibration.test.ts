import { describe, expect, it } from "vitest";
import { calibrationFactor, meanFactor } from "../src/domain/calibration";
import { springback } from "../src/domain/springback";
import { defaultInputs } from "../src/state/inputs";
import { decodeInputs, encodeInputs, shareUrl } from "../src/state/share";

const steel = { yieldStrength: 355, modulus: 210_000, poisson: 0.3 };

describe("calibration factor", () => {
  it("is 1 when the trial behaves exactly like the model", () => {
    const t = 10;
    const measured = 1000;
    const rf = (measured + t) / 2;
    const model = springback({ targetRadius: rf, thickness: t, ...steel })!;
    const setInnerD = 2 * model.setRadius - t;
    const r = calibrationFactor({ thickness: t, setInnerD, measuredInnerD: measured, ...steel });
    if (typeof r === "string") throw new Error(r);
    expect(r.factor).toBeCloseTo(1, 9);
    expect(r.measuredRatio).toBeCloseTo(r.modelRatio, 9);
  });

  it("is below 1 when the part springs back less than predicted", () => {
    const t = 10;
    const rf = 505;
    const model = springback({ targetRadius: rf, thickness: t, ...steel })!;
    const halfWay = rf - 0.5 * (rf - model.setRadius);
    const r = calibrationFactor({
      thickness: t,
      setInnerD: 2 * halfWay - t,
      measuredInnerD: 2 * rf - t,
      ...steel,
    });
    if (typeof r === "string") throw new Error(r);
    expect(r.factor).toBeCloseTo(0.5, 9);
  });

  it("feeds back into the setting the calculator uses", () => {
    // Calibrating with a trial and then asking for that trial's diameter returns its setting.
    const t = 8;
    const trial = { thickness: t, setInnerD: 700, measuredInnerD: 860, ...steel };
    const r = calibrationFactor(trial);
    if (typeof r === "string") throw new Error(r);
    const again = springback({
      targetRadius: (860 + t) / 2,
      thickness: t,
      ...steel,
      calibration: r.factor,
    })!;
    expect(2 * again.setRadius - t).toBeCloseTo(700, 6);
  });

  it("rejects impossible measurements", () => {
    expect(
      calibrationFactor({ thickness: 10, setInnerD: 900, measuredInnerD: 880, ...steel }),
    ).toBe("noSpringback");
    expect(
      calibrationFactor({ thickness: 0, setInnerD: 900, measuredInnerD: 1000, ...steel }),
    ).toBe("input");
  });

  it("averages valid factors", () => {
    expect(meanFactor([0.9, 1.1, NaN])).toBeCloseTo(1, 12);
    expect(meanFactor([])).toBeNull();
  });
});

describe("calculation link", () => {
  it("round-trips inputs, including Polish decimals", () => {
    const inputs = {
      ...defaultInputs,
      shape: "cone" as const,
      thickness: "12,5",
      dLarge: "1500",
      flatEnds: true,
    };
    expect(decodeInputs(encodeInputs(inputs))).toEqual(inputs);
  });

  it("round-trips every field, including characters the format uses", () => {
    const inputs = {
      ...defaultInputs,
      mode: "fromLength" as const,
      dimension: "radius" as const,
      surface: "outer" as const,
      materialId: "custom",
      length: "3 203,01",
      customRe: "a;b=c%#",
      customE: "200",
      customDensity: "7900",
      k: "0,45",
      calibration: "0,9",
      reActual: "410",
      flatLength: "12",
      width: "",
    };
    expect(decodeInputs(encodeInputs(inputs))).toEqual(inputs);
  });

  it("keeps links short by writing only changed fields", () => {
    expect(encodeInputs(defaultInputs)).toBe("#c=2");
    const url = shareUrl("https://example.test/app/#old", { ...defaultInputs, value: "1200" });
    expect(url).toBe("https://example.test/app/#c=2;v=1200");
  });

  it("still reads links printed by version 0.9", () => {
    const legacy =
      "#c=eyJtb2RlIjoiZnJvbUxlbmd0aCIsIm1hdGVyaWFsSWQiOiJzMjM1anIiLCJsZW5ndGgiOiIzMjAzLDAxIn0";
    const inputs = decodeInputs(legacy);
    expect(inputs?.mode).toBe("fromLength");
    expect(inputs?.materialId).toBe("s235jr");
    expect(inputs?.length).toBe("3203,01");
  });

  it("accepts a whole scanned URL", () => {
    expect(decodeInputs("https://example.test/app/#c=1;t=8")?.thickness).toBe("8");
  });

  it("ignores foreign or malformed fragments", () => {
    expect(decodeInputs("")).toBeNull();
    expect(decodeInputs("#section")).toBeNull();
    expect(decodeInputs("#c=%%%")).toBeNull();
    expect(decodeInputs("#c=1;zz=1")).toBeNull();
    expect(decodeInputs("#c=1;s=sphere")).toBeNull();
    expect(decodeInputs("#c=" + btoa('{"shape":"sphere"}'))).toBeNull();
  });
});
