import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

// Noise mode: the maths runs through window.TimrNoise, so none of these need
// a real microphone. The one live-mic test uses Chrome's built-in fake device.

async function openNoise(page: Page) {
  await page.locator("#island").hover();
  await page.locator("#btn-mode-noise").click();
  await expect(page.locator("body")).toHaveClass(/mode-noise/);
}

test.describe("Noise mode maths", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("dB maps onto the 0-100 scale and clamps at both ends", async ({ page }) => {
    const levels = await page.evaluate(() => {
      const noise = (window as any).TimrNoise;
      return [
        noise.levelFromDb(-59, -55, 42), // baseline - 4: the bottom of the scale
        noise.levelFromDb(-38, -55, 42), // halfway up
        noise.levelFromDb(-17, -55, 42), // the top
        noise.levelFromDb(-90, -55, 42), // far below: clamps to 0
        noise.levelFromDb(0, -55, 42) // far above: clamps to 100
      ];
    });
    expect(levels[0]).toBeCloseTo(0);
    expect(levels[1]).toBeCloseTo(50);
    expect(levels[2]).toBeCloseTo(100);
    expect(levels[3]).toBe(0);
    expect(levels[4]).toBe(100);
  });

  test("smoothing rises fast and falls slowly", async ({ page }) => {
    const [rising, falling] = await page.evaluate(() => {
      const noise = (window as any).TimrNoise;
      return [noise.smoothLevel(0, 100), noise.smoothLevel(100, 0)];
    });
    expect(rising).toBeCloseTo(45);
    expect(falling).toBeCloseTo(90);
  });

  test("a short spike does not change the zone; a sustained one does", async ({ page }) => {
    const result = await page.evaluate(() => {
      const noise = (window as any).TimrNoise;
      const spike = noise.createZoneHold();
      spike.update("green", 0, 1.5);
      spike.update("red", 1000, 1.5);
      spike.update("red", 1400, 1.5); // 0.4 s of red
      const afterSpike = spike.update("green", 1450, 1.5);

      const sustained = noise.createZoneHold();
      sustained.update("red", 1000, 1.5);
      const beforeHold = sustained.update("red", 2400, 1.5); // 1.4 s
      const afterHold = sustained.update("red", 2500, 1.5); // 1.5 s

      return { afterSpike, beforeHold, afterHold };
    });
    expect(result.afterSpike).toBe("green");
    expect(result.beforeHold).toBe("green");
    expect(result.afterHold).toBe("red");
  });

  test("a quieter zone waits one second, whatever the hold time", async ({ page }) => {
    const result = await page.evaluate(() => {
      const noise = (window as any).TimrNoise;
      const hold = noise.createZoneHold();
      hold.update("red", 0, 0); // hold 0: red shows at once
      const loud = hold.update("red", 0, 0);
      const early = hold.update("green", 100, 0);
      const stillRed = hold.update("green", 1050, 0); // 0.95 s of green
      const quiet = hold.update("green", 1100, 0); // 1 s
      return { loud, early, stillRed, quiet };
    });
    expect(result.loud).toBe("red");
    expect(result.early).toBe("red");
    expect(result.stillRed).toBe("red");
    expect(result.quiet).toBe("green");
  });

  test("wear builds and recovers at the specified rates", async ({ page }) => {
    const wear = await page.evaluate(() => {
      const noise = (window as any).TimrNoise;
      return {
        red: noise.stepWear(0, "red", 3, 15), // 3 / 15
        yellow: noise.stepWear(0.4, "yellow", 30, 15), // holds steady: only red does damage
        green: noise.stepWear(0.5, "green", 4.5, 15), // 0.5 - 4.5 / 22.5
        capped: noise.stepWear(0.95, "red", 5, 15),
        floored: noise.stepWear(0.05, "green", 10, 15)
      };
    });
    expect(wear.red).toBeCloseTo(0.2);
    expect(wear.yellow).toBe(0.4);
    expect(wear.green).toBeCloseTo(0.3);
    expect(wear.capped).toBe(1);
    expect(wear.floored).toBe(0);
  });

  test("the baseline is the median, so one cough doesn't skew it", async ({ page }) => {
    const medians = await page.evaluate(() => {
      const noise = (window as any).TimrNoise;
      return [
        noise.medianOf([-50, -52, -12, -51, -49]), // a cough at -12
        noise.medianOf([-50, -52, -48, -46]),
        noise.medianOf([])
      ];
    });
    expect(medians[0]).toBe(-50);
    expect(medians[1]).toBe(-49);
    expect(medians[2]).toBeNull();
  });

  test("seasonal looks only show in their month, or with #preview", async ({ page }) => {
    const seasons = await page.evaluate(() => {
      const noise = (window as any).TimrNoise;
      const months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      return months.map((month) => {
        const date = new Date(2026, month, 15);
        return {
          month,
          tree: noise.lookAvailable("tree", date, false),
          snowman: noise.lookAvailable("snowman", date, false),
          bars: noise.lookAvailable("bars", date, false),
          previewTree: noise.lookAvailable("tree", date, true),
          previewSnowman: noise.lookAvailable("snowman", date, true)
        };
      });
    });
    for (const season of seasons) {
      expect(season.tree).toBe(season.month === 10);
      expect(season.snowman).toBe(season.month === 11);
      expect(season.bars).toBe(true);
      expect(season.previewTree).toBe(true);
      expect(season.previewSnowman).toBe(true);
    }
  });

  test("a saved look that is out of season or unknown falls back to Bars", async ({ page }) => {
    const looks = await page.evaluate(() => {
      const noise = (window as any).TimrNoise;
      const october = new Date(2026, 9, 23);
      const november = new Date(2026, 10, 2);
      return {
        treeInOctober: noise.resolveLook("tree", october, false),
        treeInNovember: noise.resolveLook("tree", november, false),
        snowmanInNovember: noise.resolveLook("snowman", november, false),
        face: noise.resolveLook("face", october, false),
        junk: noise.resolveLook("toString", october, false),
        missing: noise.resolveLook(null, october, false)
      };
    });
    expect(looks.treeInOctober).toBe("bars");
    expect(looks.treeInNovember).toBe("tree");
    expect(looks.snowmanInNovember).toBe("bars");
    expect(looks.face).toBe("face");
    expect(looks.junk).toBe("bars");
    expect(looks.missing).toBe("bars");
  });

  test("status words follow the look and zone", async ({ page }) => {
    const words = await page.evaluate(() => {
      const noise = (window as any).TimrNoise;
      return [
        noise.statusWord("bars", "green", 0),
        noise.statusWord("face", "red", 0),
        noise.statusWord("tree", "green", 0),
        noise.statusWord("tree", "green", 0.4),
        noise.statusWord("tree", "yellow", 0.4),
        noise.statusWord("snowman", "yellow", 0.4),
        noise.statusWord("snowman", "green", 0)
      ];
    });
    expect(words).toEqual(["Working voices", "Too loud", "Full and green", "Growing back", "Getting breezy", "Getting warm", "Frozen solid"]);
  });
});

test.describe("Noise mode screen", () => {
  test.beforeEach(async ({ page }) => {
    // Count every microphone request, and refuse it, so no test can reach a real mic.
    await page.addInitScript(() => {
      (window as any).__micRequests = 0;
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async () => {
          (window as any).__micRequests += 1;
          throw new DOMException("blocked in test", "NotAllowedError");
        };
      }
    });
  });

  test("the mic is never requested on load or on entering Noise mode", async ({ page }) => {
    await page.goto("/");
    await openNoise(page);
    await expect(page.locator("#noise-note")).toContainText("Demo classroom");
    expect(await page.evaluate(() => (window as any).__micRequests)).toBe(0);

    await page.locator("#btn-noise-mic").click();
    await expect.poll(() => page.evaluate(() => (window as any).__micRequests)).toBe(1);
    await expect(page.locator("#noise-note")).toContainText("The mic is blocked");
  });

  test("the noise bar never shows the demo, and explains a blocked mic", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#btn-noise-bar")).toBeVisible();
    await expect(page.locator("#noise-strip")).toBeHidden();
    await page.locator("#btn-noise-bar").click();
    await expect(page.locator("#noise-strip")).toBeVisible();
    await expect(page.locator("#noise-strip-note")).toContainText("The mic is blocked");
    await expect(page.locator("#noise-strip-note")).not.toContainText("Demo");
    await expect(page.locator("#noise-strip-meter .noise-seg.is-on")).toHaveCount(0);
    await expect(page.locator("#noise-strip-status")).toHaveText("");
  });

  test("modes you're not in dim but stay clickable; Noise never dims", async ({ page }) => {
    await page.goto("/");
    const dimmed = () => page.evaluate(() =>
      ["timer", "stopwatch", "clock", "noise"].filter((mode) =>
        document.getElementById(`btn-mode-${mode}`)!.classList.contains("mode-dimmed")));
    expect(await dimmed()).toEqual(["stopwatch", "clock"]);
    await page.locator("#btn-mode-clock").click();
    expect(await dimmed()).toEqual(["timer", "stopwatch"]);
    await page.locator("#island").hover();
    await page.locator("#btn-mode-noise").click();
    expect(await dimmed()).toEqual(["timer", "stopwatch", "clock"]);
    await page.locator("#island").hover();
    await page.locator("#btn-mode-stopwatch").click();
    expect(await dimmed()).toEqual(["timer", "clock"]);
  });

  test("the Noise bar button hides in Noise mode", async ({ page }) => {
    await page.goto("/");
    await openNoise(page);
    await expect(page.locator("#btn-noise-bar")).toBeHidden();
    await expect(page.locator("#btn-noise-mic")).toBeVisible();
  });

  test("Noise replaces the timer, and leaving brings it back", async ({ page }) => {
    await page.goto("/");
    await openNoise(page);
    await expect(page.locator("#noise-stage")).toBeVisible();
    await expect(page.locator(".timer-box")).toBeHidden();
    await expect(page.locator("#btn-mode-noise")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#island-label")).toHaveText("Voice level · Demo");
    await expect(page.locator("#noise-status")).toHaveText(/Working voices|Getting loud|Too loud/);

    await page.locator("#island").hover();
    await page.locator("#btn-mode-timer").click();
    await expect(page.locator("#noise-stage")).toBeHidden();
    await expect(page.locator(".timer-box")).toBeVisible();
    await expect(page.getByRole("button", { name: "1 Min" })).toBeVisible();
  });

  test("Space does not start a hidden timer in Noise mode", async ({ page }) => {
    await page.goto("/");
    await openNoise(page);
    await page.locator("body").click({ position: { x: 20, y: 400 } });
    await page.keyboard.press("Space");
    await page.waitForTimeout(1300);
    // isRunning is a top-level let, so it isn't on window; evaluate it by name.
    expect(await page.evaluate("isRunning")).toBe(false);
    await expect(page.locator("#time-display")).toHaveText("15:00");
  });

  test("settings open in a modal, keep five points between yellow and red, and close on Escape", async ({ page }) => {
    await page.goto("/");
    await openNoise(page);
    await page.locator("#island").hover();
    await page.locator("#btn-noise-settings").click();
    await expect(page.locator("#noise-settings-box")).toBeVisible();
    // No mic yet, so the baseline can't be set and the box says why.
    await expect(page.locator("#btn-noise-baseline")).toBeDisabled();
    await expect(page.locator("#noise-baseline-hint")).toContainText("Turn the mic on first");

    await page.locator("#noise-yellow-at").fill("78");
    await expect(page.locator("#noise-red-at-out")).toHaveText("83");

    await page.keyboard.press("Escape");
    await expect(page.locator("#noise-settings-modal")).toBeHidden();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("classtimr-noise") || "{}"));
    expect(saved.yellowAt).toBe(78);
    expect(saved.redAt).toBe(83);
  });

  test("the look picker hides Tree and Snowman in October, and #preview shows them", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 23, 10, 0));
    await page.goto("/");
    await openNoise(page);
    await page.locator("#island").hover();
    await page.locator("#noise-look-button").click();
    await expect(page.locator("#noise-look-menu button")).toHaveText(["Bars", "Face"]);
    await page.keyboard.press("Escape");

    await page.goto("/#preview");
    await openNoise(page);
    await page.locator("#island").hover();
    await page.locator("#noise-look-button").click();
    await expect(page.locator("#noise-look-menu button")).toHaveText(["Bars", "Face", /^Tree/, /^Snowman/]);
    await page.locator("#noise-look-menu button", { hasText: "Snowman" }).click();
    await expect(page.locator("#noise-snowman")).toBeVisible();
    await expect(page.locator("#noise-meter")).toBeHidden();
  });

  test("a saved Tree look falls back to Bars once November is over", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 11, 1, 9, 0));
    await page.addInitScript(() => {
      localStorage.setItem("classtimr-noise", JSON.stringify({ look: "tree" }));
    });
    await page.goto("/");
    await openNoise(page);
    await expect(page.locator("#noise-meter")).toBeVisible();
    await expect(page.locator("#noise-tree")).toBeHidden();
  });
});

test("nginx lets the page use its own microphone", () => {
  const headers = readFileSync(join(__dirname, "..", "security-headers.conf"), "utf8");
  expect(headers).toContain("microphone=(self)");
  expect(headers).not.toContain("microphone=()");
});
