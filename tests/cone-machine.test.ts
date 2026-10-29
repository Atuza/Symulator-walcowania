import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { materials } from "../src/domain/materials/data";
import { defaultProcess } from "../src/state/config";
import { derive } from "../src/state/derive";
import { defaultInputs } from "../src/state/inputs";
import { withFixedMachine } from "../src/state/fixedMachine";
import { sceneModel, feedLength } from "../src/viz/sceneModel";
import { coneAlongRolls, coneContactFrame } from "../src/viz/conePlacement";
import { plateGeometry } from "../src/viz/scene3d";

describe("cones at the installed machine", () => {
  it.each(["cone", "eccentric"] as const)(
    "keeps real roll dimensions and a fixed contact generator for %s",
    (shape) => {
      const d = derive(
        { ...defaultInputs, shape, offset: shape === "eccentric" ? "300" : "" },
        withFixedMachine(),
        defaultProcess,
        materials,
      );
      const m = sceneModel(d.output!, d.thickness!, d.width, withFixedMachine());
      if (m.shape !== "cone" && m.shape !== "eccentric") throw Error("No cone");
      expect(m.machine).toMatchObject({
        rolls: { top: 338.38, bottom: 310.12, side: 240.02 },
        rollLength: 3100,
        realRolls: true,
      });
      expect(feedLength(m)).toBeGreaterThan(0);
      for (const p of [0, 0.25, 0.5, 1]) {
        const { feed, inward, along } = coneContactFrame(m, p);
        expect(feed.length()).toBeCloseTo(1, 10);
        expect(inward.dot(along)).toBeCloseTo(0, 10);
        expect(feed.clone().cross(inward).dot(along)).toBeCloseTo(1, 10);
        const geometry = plateGeometry(m, p),
          positions = geometry.getAttribute("position");
        const nPhi = m.shape === "cone" ? 160 : Math.max(2, Math.round(160 * Math.max(0.02, p)));
        const nR = m.shape === "cone" ? 12 : 6;
        const front = m.shape === "cone" ? Math.round(p * nPhi) : nPhi;
        for (let i = 0; i <= nR; i++) {
          const index = front * (nR + 1) + i;
          expect(Math.abs(positions.getX(index))).toBeLessThan(0.00002);
          expect(positions.getY(index)).toBeCloseTo(
            m.shape === "cone" ? 0 : (m.thickness * 0.001) / 2,
            5,
          );
        }
        geometry.computeBoundingBox();
        const size = geometry.boundingBox!.getSize(new Vector3());
        expect(Number.isFinite(size.length())).toBe(true);
        expect(Math.max(size.x, size.y, size.z)).toBeLessThan((feedLength(m) + m.width) * 0.002);
        geometry.dispose();
      }
    },
  );
});

describe("cone along the rolls", () => {
  it("puts the large end at the drive-end housing and the small end towards the yoke", () => {
    const d = derive(
      { ...defaultInputs, shape: "cone", dLarge: "1200", dSmall: "600", height: "800" },
      withFixedMachine(),
      defaultProcess,
      materials,
    );
    const m = sceneModel(d.output!, d.thickness!, d.width, withFixedMachine());
    if (m.shape !== "cone") throw Error("No cone");
    const at = coneAlongRolls(m);
    expect(at.large).toBeCloseTo(-1550 + 100, 9);
    expect(at.small - at.large).toBeCloseTo(m.rOuter - m.rInner, 9);
    // Large end at −z: the plate's far point on the large edge lies behind the barrel middle.
    const geometry = plateGeometry(m, 1);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.z).toBeLessThan(0);
    geometry.dispose();
  });
});
