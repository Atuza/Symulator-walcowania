import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { materials } from "../src/domain/materials/data";
import { defaultProcess } from "../src/state/config";
import { derive } from "../src/state/derive";
import { defaultInputs } from "../src/state/inputs";
import { withFixedMachine } from "../src/state/fixedMachine";
import { sceneModel, feedLength } from "../src/viz/sceneModel";
import { coneAlongRolls, coneContactFrame } from "../src/viz/conePlacement";
import { plateGeometry, towerLift } from "../src/viz/scene3d";

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
  it("rolls next to the yoke: small end at the yoke, large end towards the drive housing", () => {
    const d = derive(
      { ...defaultInputs, shape: "cone", dLarge: "1200", dSmall: "600", height: "800" },
      withFixedMachine(),
      defaultProcess,
      materials,
    );
    const m = sceneModel(d.output!, d.thickness!, d.width, withFixedMachine());
    if (m.shape !== "cone") throw Error("No cone");
    const at = coneAlongRolls(m);
    expect(at.small).toBeLessThan(1550 - 100);
    expect(at.small).toBeGreaterThan(1550 - 100 - 300);
    expect(at.small - at.large).toBeCloseTo(m.rOuter - m.rInner, 9);
    // No point of the plate may enter the housings or the yoke at any stage: beyond the barrel ends
    // the plate may only lie in front of them, over the feed table. Housing half-widths from the
    // machine model: drive end 0.78 m, drop end 0.55 m.
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const geometry = plateGeometry(m, p);
      const pos = geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        if (Math.abs(z) <= 1.55) continue;
        expect(pos.getX(i), `progress ${p}, z ${z.toFixed(2)}`).toBeGreaterThan(
          z > 0 ? 0.55 : 0.78,
        );
      }
      geometry.dispose();
    }
  });
});

describe("vertical support clears the part", () => {
  it.each(["600", "1500", "2380"])("arm rides above a Ø%s shell all through the run", (value) => {
    const d = derive(
      { ...defaultInputs, thickness: "10", value, width: "2480" },
      withFixedMachine(),
      defaultProcess,
      materials,
    );
    const m = sceneModel(d.output!, d.thickness!, d.width, withFixedMachine());
    for (const p of [0, 0.5, 1]) {
      const geometry = plateGeometry(m, p);
      geometry.computeBoundingBox();
      const top = geometry.boundingBox!.max.y;
      // Arm underside at rest is 0.823 m above the pinch; after the lift it stays above the part.
      expect(0.823 + towerLift(top)).toBeGreaterThan(top);
      geometry.dispose();
    }
  });

  it("stays at rest for parts below the arm", () => {
    expect(towerLift(0.5)).toBe(0);
  });
});

describe("eccentric cone stays clear of the housings", () => {
  it("never enters the drive housing or the yoke", () => {
    const d = derive(
      {
        ...defaultInputs,
        shape: "cone",
        thickness: "8",
        dLarge: "2400",
        dSmall: "2200",
        height: "1250",
        offset: "100",
      },
      withFixedMachine(),
      defaultProcess,
      materials,
    );
    const m = sceneModel(d.output!, d.thickness!, d.width, withFixedMachine());
    if (m.shape !== "eccentric") throw Error("No eccentric cone");
    for (const p of [0.25, 0.5, 0.75, 1]) {
      const geometry = plateGeometry(m, p);
      const pos = geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        if (Math.abs(z) <= 1.55) continue;
        expect(pos.getX(i), `progress ${p}, z ${z.toFixed(2)}`).toBeGreaterThan(
          z > 0 ? 0.55 : 0.78,
        );
      }
      geometry.dispose();
    }
  });
});
