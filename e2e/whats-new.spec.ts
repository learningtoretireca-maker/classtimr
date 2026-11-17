import { test, expect, Page } from "@playwright/test";

// The What's new card (index.html, section 7). A returning teacher is a
// browser that already holds one of Timr's own keys; a picked theme is the
// simplest to fake.

const SEEN_KEY = "classtimr:whats-new-seen";

async function visitAsReturningTeacher(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("classtimr-theme", "space");
  });
  await page.goto("/");
}

async function newestEntryId(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).TimrWhatsNew.ENTRIES[0].id);
}

test.describe("What's new card", () => {
  test("a returning teacher sees what's new", async ({ page }) => {
    await visitAsReturningTeacher(page);
    const card = page.locator("#whats-new");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: "New in Timr" })).toBeVisible();
    await expect(card.locator("li")).toHaveCount(3);
    await expect(card.getByRole("button", { name: "Got it" })).toBeVisible();
    // Never takes focus from the page.
    await expect(page.locator("#whats-new-done")).not.toBeFocused();
  });

  test("Got it closes it for good", async ({ page }) => {
    await visitAsReturningTeacher(page);
    await page.locator("#whats-new").getByRole("button", { name: "Got it" }).click();
    await expect(page.locator("#whats-new")).toBeHidden();
    expect(await page.evaluate((key) => localStorage.getItem(key), SEEN_KEY)).toBe(await newestEntryId(page));

    await page.reload();
    await page.locator("#island").hover();
    await expect(page.locator("#control-bar")).toBeVisible();
    await expect(page.locator("#whats-new")).toBeHidden();
  });

  test("a first-time visitor sees nothing and the list is marked seen", async ({ page }) => {
    await page.goto("/");
    await page.locator("#island").hover();
    await expect(page.locator("#control-bar")).toBeVisible();
    await expect(page.locator("#whats-new")).toBeHidden();
    expect(await page.evaluate((key) => localStorage.getItem(key), SEEN_KEY)).toBe(await newestEntryId(page));
  });

  test("starting a timer hides it, pausing brings it back", async ({ page }) => {
    await visitAsReturningTeacher(page);
    await expect(page.locator("#whats-new")).toBeVisible();
    await page.locator("#island").hover();
    await page.locator("#btn-play").click();
    await expect(page.locator("#btn-play")).toHaveAttribute("aria-label", /Pause/);
    await expect(page.locator("#whats-new")).toBeHidden();

    await page.locator("#btn-play").click();
    await expect(page.locator("#btn-play")).toHaveAttribute("aria-label", /Play/);
    await expect(page.locator("#whats-new")).toBeVisible();
  });

  test("folding the controls away hides it", async ({ page }) => {
    await visitAsReturningTeacher(page);
    await expect(page.locator("#whats-new")).toBeVisible();
    // The island folds 3s after load when nobody is at the controls.
    await expect(page.locator("#control-bar")).toBeHidden({ timeout: 6000 });
    await expect(page.locator("#whats-new")).toBeHidden();

    await page.locator("#island").hover();
    await expect(page.locator("#whats-new")).toBeVisible();
  });

  test("shows nothing when the browser can't remember a dismissal", async ({ page }) => {
    await page.goto("/");
    const decision = await page.evaluate(() => {
      const whatsNew = (window as any).TimrWhatsNew;
      return whatsNew.decide({ entries: whatsNew.ENTRIES, seenId: null, hasUsedTimr: true, canPersist: false });
    });
    expect(decision).toEqual({ show: [], markSeen: null });
  });

  test("entries use date-led ids, newest first, no repeats", async ({ page }) => {
    await page.goto("/");
    const { ids, pattern } = await page.evaluate(() => {
      const whatsNew = (window as any).TimrWhatsNew;
      return { ids: whatsNew.ENTRIES.map((entry: { id: string }) => entry.id), pattern: whatsNew.ENTRY_ID_PATTERN.source };
    });
    for (const id of ids) expect(id).toMatch(new RegExp(pattern));
    expect([...ids].sort().reverse()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
