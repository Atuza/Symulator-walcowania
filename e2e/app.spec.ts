import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

/*
 * User-level checks of the built app. Every test starts from a fresh device (empty storage), so the
 * defaults apply: cylinder, S355J2, t = 10 mm, inner Ø 1000 mm, width 2000 mm.
 */

const hero = (page: Page) => page.locator(".hero").first();

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(hero(page)).toBeVisible();
});

test("shows the blank length of the default cylinder", async ({ page }) => {
  // π · (1000 + 2 · 0.5 · 10) = 3173.01 mm
  await expect(hero(page)).toContainText("3173,01");
});

test("recalculates when the thickness changes", async ({ page }) => {
  const thickness = page.locator("#f-thickness");
  await thickness.fill("20");
  // π · (1000 + 20) = 3204.42 mm
  await expect(hero(page)).toContainText("3204,42");
  await expect(
    page.locator(".result-group dt", { hasText: "Maks. grubość wg karty zwijania" }),
  ).toBeVisible();
});

test("rejects an invalid thickness with a message instead of a result", async ({ page }) => {
  await page.locator("#f-thickness").fill("-5");
  await expect(page.locator(".empty")).toBeVisible();
});

test("switches to a cone and shows the development radii", async ({ page }) => {
  await page.locator(".shape-option", { hasText: /^Stożek$/ }).click();
  await expect(page.locator(".heroes")).toContainText("R1");
  await expect(page.locator(".heroes")).toContainText("R2");
});

test("warns above the machine's capacity chart", async ({ page }) => {
  await page.locator("#f-thickness").fill("25");
  await expect(page.locator(".warning", { hasText: "kartę wydajności zwijania" })).toBeVisible();
});

test("the 3D view panel hides parts and closes on Escape", async ({ page }) => {
  const view = page.locator(".stage-controls button", { hasText: "Widok" });
  await expect(view).toBeVisible({ timeout: 15_000 });
  await view.click();
  const panel = page.locator(".stage-parts");
  await expect(panel).toBeVisible();
  await panel.getByLabel("Podpora pionowa V").uncheck();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  const stored = await page.evaluate(() => localStorage.getItem("rolling.view.v1"));
  expect(JSON.parse(stored ?? "{}").hidden).toContain("tower");
});

test("produces a PDF report and a DXF file", async ({ page }) => {
  const dxf = page.waitForEvent("download");
  await page.locator(".result-actions button", { hasText: "DXF" }).click();
  expect((await dxf).suggestedFilename()).toMatch(/\.dxf$/);

  await page.locator(".result-actions button", { hasText: "Raport PDF" }).click();
  const pdf = page.waitForEvent("download");
  await page.locator("dialog[open] button", { hasText: /Generuj|Generate/ }).click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
});

test("nothing overflows the page horizontally", async ({ page }) => {
  for (const shape of ["Walec", "Stożek", "Prostokąt"]) {
    await page.locator(".shape-option", { hasText: new RegExp(`^${shape}$`) }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow, shape).toBe(false);
  }
});

test("P460NL2 cylinder calibration stays synchronized after Enter edits and reload", async ({
  page,
}, testInfo) => {
  await page.locator("#f-material").selectOption("p460nl2");
  const calibration = () =>
    page.getByLabel("Kalibracja długości P460NL2 (5 prób walców)", { exact: true });
  await expect(calibration()).toBeChecked();
  await expect(page.locator(".warning", { hasText: "ekstrapolowana" })).toBeVisible();
  const edit = async (id: string, value: string) => {
    await page.locator(`svg.drawing [data-dimension="${id}"]`).first().click();
    await page.locator("#drawing-dimension-value").fill(value);
    await page.locator("#drawing-dimension-value").press("Enter");
    await expect(page.locator(".dimension-dialog[open]")).toHaveCount(0);
  };
  await edit("diameter.inner", "2380");
  await expect(hero(page)).toContainText("7504,42");
  await expect(page.locator(".warning", { hasText: "ekstrapolowana" })).toHaveCount(0);
  await expect(page.locator(".result-group dd", { hasText: "-3,989" })).toBeVisible();

  await edit("diameter.outer", "2400");
  await edit("cylinder.circumference", String(Math.PI * 2400));
  await expect(hero(page)).toContainText("7504,42");
  await edit("cylinder.blankLength", "7500");
  const expectedInner = ((7500 + 3.989383113250804) / Math.PI - 10).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  await expect(hero(page)).toContainText(expectedInner);
  await edit("radius.inner", "1190");
  await expect(hero(page)).toContainText("7504,42");

  await page.locator('svg.drawing [data-dimension="cylinder.blankLength"]').first().click();
  await page.locator("#drawing-dimension-value").fill("-10");
  await page.locator("#drawing-dimension-value").press("Enter");
  await expect(page.locator("#drawing-dimension-value")).toHaveAttribute("aria-invalid", "true");
  await expect(hero(page)).toContainText("7504,42");
  await page.keyboard.press("Escape");

  await calibration().uncheck();
  await expect(hero(page)).toContainText("7508,41");
  await calibration().check();
  await expect(hero(page)).toContainText("7504,42");
  await expect
    .poll(
      async () =>
        JSON.parse((await page.evaluate(() => localStorage.getItem("rolling.inputs.v1"))) ?? "{}")
          .cylinderCalibration,
    )
    .toBe(true);
  await page.reload();
  await expect(calibration()).toBeChecked();
  await expect(hero(page)).toContainText("7504,42");
  await page
    .locator(".panel.results")
    .screenshot({ path: testInfo.outputPath("calibrated-results.png") });

  const dxfEvent = page.waitForEvent("download");
  await page.locator(".result-actions button", { hasText: "DXF" }).click();
  const dxf = await dxfEvent;
  const data = await readFile((await dxf.path())!, "utf8");
  expect(data).toContain("7504.417059");
  expect(data).not.toContain("7508.406442");
  await page.locator(".result-actions button", { hasText: "Raport PDF" }).click();
  const pdfEvent = page.waitForEvent("download");
  await page.locator("dialog[open] button", { hasText: /Generuj|Generate/ }).click();
  await (await pdfEvent).saveAs(testInfo.outputPath("calibrated-a4.pdf"));
  await page.locator(".result-actions button", { hasText: "Raport PDF" }).click();
  await page.locator('dialog[open] button[role="radio"]', { hasText: "A3" }).click();
  const a3Event = page.waitForEvent("download");
  await page.locator("dialog[open] button", { hasText: /Generuj|Generate/ }).click();
  await (await a3Event).saveAs(testInfo.outputPath("calibrated-a3.pdf"));
});

test("P460NL2 cone geometries and old calculation links retain their original model", async ({
  page,
}) => {
  test.setTimeout(60_000);
  for (const shape of ["k", "ec"]) {
    const base = `./#c=2;mi=p460nl2;s=${shape};D=2400;d=2200;h=1000;e=${shape === "ec" ? 100 : 0}`;
    await page.goto(base);
    await page.reload();
    await expect(hero(page)).toBeVisible();
    const enabled = await page.locator(".hero").allTextContents();
    await expect(
      page.getByLabel("Kalibracja długości P460NL2 (5 prób walców)", { exact: true }),
    ).toHaveCount(0);
    await page.goto(`${base};lc=0`);
    await page.reload();
    await expect(page.locator(".hero")).toHaveText(enabled);
  }
  await page.goto("./#c=1;mi=p460nl2;v=2380");
  await page.reload();
  await expect(hero(page)).toContainText("7508,41");
  await expect(
    page.getByLabel("Kalibracja długości P460NL2 (5 prób walców)", { exact: true }),
  ).not.toBeChecked();
});
