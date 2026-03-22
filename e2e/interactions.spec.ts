import { test, expect } from "@playwright/test";

test.describe("ClassTimr interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("clicking a preset changes the timer display", async ({ page }) => {
    // Click the 5 Min preset
    await page.getByRole("button", { name: "5 Min", exact: true }).click();

    // Timer should now show 5:00
    await expect(page.locator("#time-display")).toContainText("5:00");
  });

  test("clicking Play starts the countdown", async ({ page }) => {
    // Set to 1 Min so changes are visible quickly
    await page.getByRole("button", { name: "1 Min" }).click();
    await expect(page.locator("#time-display")).toContainText("1:00");

    // Click Play
    await page.locator("#btn-play").click();

    // Wait a moment, then check the timer has changed from 1:00
    await page.waitForTimeout(1500);
    const text = await page.locator("#time-display").textContent();
    expect(text?.trim()).not.toBe("1:00");
  });

  test("switching to Stopwatch mode works", async ({ page }) => {
    await page.locator("#btn-mode-stopwatch").click();

    // Stopwatch should show 0:00 or 00:00
    await expect(page.locator("#time-display")).toContainText("0:00");

    // Quick Start section should be hidden in stopwatch mode
    await expect(page.locator("#quick-start-section")).toBeHidden();
  });

  test("switching back to Timer mode restores presets", async ({ page }) => {
    // Go to stopwatch then back to timer
    await page.locator("#btn-mode-stopwatch").click();
    await page.locator("#btn-mode-timer").click();

    // Quick Start section should be visible again
    await expect(page.locator("#quick-start-section")).toBeVisible();
    await expect(page.getByRole("button", { name: "1 Min" })).toBeVisible();
  });

  test("reset button resets the timer", async ({ page }) => {
    // Change to 5 min, start, then reset
    await page.getByRole("button", { name: "5 Min", exact: true }).click();
    await page.locator("#btn-play").click();
    await page.waitForTimeout(1500);

    // Click Reset (the button next to play with the reset icon)
    await page.locator('button[title="Reset Timer"]').click();

    // Should be back to 5:00
    await expect(page.locator("#time-display")).toContainText("5:00");
  });
});
