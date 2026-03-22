import { test, expect } from "@playwright/test";

test.describe("ClassTimr smoke tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("timer display shows default 15:00", async ({ page }) => {
    await expect(page.getByText("15:00")).toBeVisible();
  });

  test("Play/Pause button is visible", async ({ page }) => {
    const playPauseButton = page.getByRole("button", { name: /play|pause/i });
    await expect(playPauseButton).toBeVisible();
  });

  test("mode toggle shows Timer and Stopwatch options", async ({ page }) => {
    await expect(page.getByText("Timer", { exact: true })).toBeVisible();
    await expect(page.getByText("Stopwatch", { exact: true })).toBeVisible();
  });

  test("quick start preset buttons are visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: "1 Min" })).toBeVisible();
    await expect(page.getByRole("button", { name: "5 Min" })).toBeVisible();
    await expect(page.getByRole("button", { name: "10 Min" })).toBeVisible();
    await expect(page.getByRole("button", { name: "15 Min" })).toBeVisible();
  });

  test("theme selector is visible", async ({ page }) => {
    const themeSelector = page.locator('[class*="theme"], [id*="theme"], [aria-label*="theme" i]');
    await expect(themeSelector.first()).toBeVisible();
  });
});
