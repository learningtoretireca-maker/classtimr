import { test, expect } from "@playwright/test";

const TITLE = "Timr — Free Full-Screen Classroom Timer (No Ads)";
const URL = "https://timr.classhelpr.com/";

test.describe("search and share metadata", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("head carries title, description, canonical and share tags", async ({ page }) => {
    await expect(page).toHaveTitle(TITLE);
    const content = (selector: string) =>
      page.locator(selector).getAttribute("content");

    expect(await content('meta[name="description"]')).toMatch(/full-screen classroom timer/);
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(URL);
    expect(await content('meta[property="og:title"]')).toBe(TITLE);
    expect(await content('meta[property="og:url"]')).toBe(URL);
    expect(await content('meta[property="og:image"]')).toBe(`${URL}og.png`);
    expect(await content('meta[property="og:description"]')).toBeTruthy();
    expect(await content('meta[name="twitter:card"]')).toBe("summary_large_image");
  });

  test("JSON-LD parses as a free WebApplication", async ({ page }) => {
    const raw = await page.locator('script[type="application/ld+json"]').textContent();
    const data = JSON.parse(raw ?? "");
    expect(data["@type"]).toBe("WebApplication");
    expect(data.offers.price).toBe("0");
    expect(data.publisher.url).toBe("https://classhelpr.com");
  });

  test("exactly one h1", async ({ page }) => {
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("the page is the timer only: no text below it, no scrolling", async ({ page }) => {
    await expect(page.locator("#about")).toHaveCount(0);
    const overflow = await page.evaluate(() => getComputedStyle(document.body).overflowY);
    expect(overflow).toBe("hidden");
  });
});
