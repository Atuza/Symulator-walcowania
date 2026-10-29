import { expect, test, type Page } from "@playwright/test";

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
