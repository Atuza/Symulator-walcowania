import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { qrMatrix } from "../src/export/qr";
import { defaultInputs } from "../src/state/inputs";
import { decodeInputs, shareUrl } from "../src/state/share";

/** Rasterises a module matrix with a 4-module quiet zone, like the printed report. */
function raster(matrix: boolean[][], px: number) {
  const n = matrix.length + 8;
  const size = n * px;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return;
      for (let y = 0; y < px; y++)
        for (let x = 0; x < px; x++) {
          const i = (((r + 4) * px + y) * size + (c + 4) * px + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }),
  );
  return { data, size };
}

describe("report QR code", () => {
  const url = shareUrl("https://atuza.github.io/Symulator-walcowania/", {
    ...defaultInputs,
    shape: "cone",
    materialId: "1-4404",
    thickness: "12,5",
    dLarge: "2400",
    dSmall: "850",
    height: "1250",
    surface: "outer",
    flatEnds: true,
    reActual: "305",
  });

  it("stays a coarse code for a busy calculation", () => {
    // Version 5 (37 modules) or less at level L keeps modules near 0.9 mm in a 32 mm print.
    expect(qrMatrix(url).length).toBeLessThanOrEqual(37);
  });

  it("decodes back to the same calculation, even at 3 px per module", () => {
    for (const px of [6, 3]) {
      const { data, size } = raster(qrMatrix(url), px);
      const read = jsQR(data, size, size);
      expect(read?.data, `${px} px/module`).toBe(url);
      expect(decodeInputs(read!.data)?.dLarge).toBe("2400");
    }
  });
});
