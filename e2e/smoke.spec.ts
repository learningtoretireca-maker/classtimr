import { test, expect } from "@playwright/test";

test.describe("ClassTimr smoke tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("timer display shows default 15:00", async ({ page }) => {
    await expect(page.getByText("15:00")).toBeVisible();
  });

  test("Play/Pause button is visible", async ({ page }) => {
    // The play button uses an SVG icon, not text — find by its id or the button element
    const playButton = page.locator("#btn-play");
    await expect(playButton).toBeVisible();
  });

  test("mode toggle shows Timer and Stopwatch options", async ({ page }) => {
    await expect(page.getByText("Timer", { exact: true })).toBeVisible();
    await expect(page.getByText("Stopwatch", { exact: true })).toBeVisible();
  });

  test("quick start preset buttons are visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: "1 Min" })).toBeVisible();
    await expect(page.getByRole("button", { name: "5 Min", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "10 Min" })).toBeVisible();
    await expect(page.getByRole("button", { name: "15 Min" })).toBeVisible();
  });

  test("theme selector is visible", async ({ page }) => {
    const themeSelector = page.locator("select, [class*='theme'], [id*='theme']").first();
    await expect(themeSelector).toBeVisible();
  });
});
