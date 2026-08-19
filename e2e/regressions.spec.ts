import { test, expect } from "@playwright/test";

// Regression coverage for the 2026-08-10 code review (TODO-review-2026-08-10.md).
// Each test previously asserted the buggy behaviour and passed; the assertions
// are inverted here, so a failure means a fix regressed.

test.describe("review regressions", () => {
  test("#1 Space on the timer box starts the countdown exactly once", async ({ page }) => {
    await page.goto("/");
    await page.locator(".timer-box").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#icon-pause"), "pause icon showing => running").not.toHaveClass(/hidden/);
    await page.waitForTimeout(1500);
    await expect(page.locator("#time-display")).not.toHaveText("15:00");
  });

  test("#2 re-clicking Clock does not leak an interval", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__live = new Set<number>();
      const si = window.setInterval.bind(window);
      const ci = window.clearInterval.bind(window);
      (window as any).setInterval = (...a: any[]) => {
        const id = si(...(a as [any, any]));
        (window as any).__live.add(id);
        return id;
      };
      (window as any).clearInterval = (id: number) => {
        (window as any).__live.delete(id);
        return ci(id);
      };
    });
    await page.goto("/");
    const count = async () => page.evaluate(() => (window as any).__live.size);
    await page.getByRole("button", { name: "Clock" }).click();
    const afterFirst = await count();
    await page.getByRole("button", { name: "Clock" }).click();
    await page.getByRole("button", { name: "Clock" }).click();
    expect(await count(), "extra Clock clicks must not add intervals").toBe(afterFirst);
  });

  test("#3 custom 0:00 is rejected with an error and leaves Reset intact", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Custom" }).click();
    await page.locator("#custom-min").fill("0");
    await page.locator("#custom-sec").fill("0");
    await page.getByRole("button", { name: "Set Time" }).click();
    await expect(page.locator("#custom-time-error")).toHaveText("Enter at least one second.");
    await expect(page.locator("#custom-time-modal")).not.toHaveClass(/hidden/);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    // initialTime must be untouched, so Reset still returns to the default.
    await page.getByRole("button", { name: "Reset timer" }).click();
    await expect(page.locator("#time-display")).toHaveText("15:00");
  });

  test("#3b the error clears when the value is corrected", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Custom" }).click();
    await page.getByRole("button", { name: "Set Time" }).click(); // 20:00 default, valid
    await page.getByRole("button", { name: "Custom" }).click();
    await page.locator("#custom-min").fill("0");
    await page.locator("#custom-sec").fill("0");
    await page.getByRole("button", { name: "Set Time" }).click();
    await expect(page.locator("#custom-time-error")).not.toBeEmpty();
    await page.locator("#custom-sec").fill("30");
    await expect(page.locator("#custom-time-error")).toBeEmpty();
  });

  test("#4 Enter on the modal Cancel button cancels", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Custom" }).click();
    await page.locator("#custom-min").fill("3");
    await page.locator("#custom-sec").fill("0");
    await page.getByRole("button", { name: "Cancel" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await expect(page.locator("#custom-time-modal")).toHaveClass(/hidden/);
    await expect(page.locator("#time-display")).toHaveText("15:00");
    await expect(page.locator("#icon-pause"), "must not have started").toHaveClass(/hidden/);
  });

  test("#5 a preset on a stopped timer sets the time without starting it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "5 Min", exact: true }).click();
    await expect(page.locator("#time-display")).toHaveText("05:00");
    await expect(page.locator("#icon-pause"), "must still be stopped").toHaveClass(/hidden/);
    await page.waitForTimeout(1500);
    await expect(page.locator("#time-display")).toHaveText("05:00");
  });

  test("#5b a preset on a running timer restarts it running", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-play").click();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "5 Min", exact: true }).click();
    await expect(page.locator("#icon-pause"), "must still be running").not.toHaveClass(/hidden/);
    await page.waitForTimeout(1500);
    await expect(page.locator("#time-display")).toHaveText(/^04:5\d$/);
  });

  test("#6 modifier keys do not trigger the shortcuts", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "5 Min", exact: true }).click();
    await page.locator("#btn-play").click();
    await page.waitForTimeout(1500);
    const running = await page.locator("#time-display").textContent();
    expect(running).not.toBe("05:00");
    await page.evaluate(() => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyR", key: "r", metaKey: true, bubbles: true })
      );
    });
    await expect(page.locator("#time-display"), "Cmd+R must not reset").not.toHaveText("05:00");
  });

  test("#7 the completion flash renders above the canvas", async ({ page }) => {
    await page.goto("/");
    const overlay = page.locator("#flash-overlay");
    // Above the canvas (z-0), below the digits (z-10), and click-through.
    const style = await overlay.evaluate((el) => {
      const s = getComputedStyle(el);
      return { z: s.zIndex, pointer: s.pointerEvents, opacity: s.opacity };
    });
    expect(Number(style.z)).toBeGreaterThan(0);
    expect(Number(style.z)).toBeLessThan(10);
    expect(style.pointer).toBe("none");
    expect(style.opacity).toBe("0");

    // The flash only lasts 400ms, so watch for it rather than polling for it.
    await page.evaluate(() => {
      (window as any).__flashed = false;
      new MutationObserver(() => {
        if (document.getElementById("flash-overlay")!.classList.contains("flash-active")) {
          (window as any).__flashed = true;
        }
      }).observe(document.getElementById("flash-overlay")!, { attributes: true });
    });

    await page.getByRole("button", { name: "Custom" }).click();
    await page.locator("#custom-min").fill("0");
    await page.locator("#custom-sec").fill("2");
    await page.keyboard.press("Enter");
    await page.locator("#btn-play").click();
    await expect(page.locator("#time-display")).toHaveClass(/timer-zero/, { timeout: 4000 });
    expect(await page.evaluate(() => (window as any).__flashed)).toBe(true);
  });

  test("#8 pause/resume does not hand back real time", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    const play = page.locator("#btn-play");
    for (let i = 0; i < 5; i++) {
      await play.click({ force: true });
      await page.clock.fastForward(1900);
      await play.click({ force: true });
    }
    const shown = await page.locator("#time-display").textContent();
    const [m, s] = shown!.split(":").map(Number);
    // 9.5s of running from 15:00 leaves 890.5s. The display ceils (a fresh
    // 15:00 shows 15:00 for its first full second), so 891 => "14:51".
    // Before the fix this read 895 — five pauses, ~0.9s handed back each time.
    expect(m * 60 + s, `display ${shown} after 9.5s of running`).toBe(891);
  });

  test("#11 the faded control bar is inert and not keyboard reachable", async ({ page }) => {
    await page.goto("/");
    await page.mouse.move(400, 200);
    await page.waitForTimeout(4200); // 3000ms fade + 700ms transition
    await expect(page.locator("#control-bar")).toHaveJSProperty("inert", true);
    const opacity = await page
      .locator("#control-bar")
      .evaluate((el) => getComputedStyle(el).opacity);
    expect(opacity).toBe("0");
  });

  test("#11b Tab wakes the bar back up so it stays keyboard reachable", async ({ page }) => {
    await page.goto("/");
    await page.mouse.move(400, 200);
    await page.waitForTimeout(4200);
    await expect(page.locator("#control-bar")).toHaveJSProperty("inert", true);
    let landedInBar = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      landedInBar = await page.evaluate(
        () => !!document.activeElement?.closest("#control-bar")
      );
      if (landedInBar) break;
    }
    await expect(page.locator("#control-bar")).toHaveJSProperty("inert", false);
    expect(landedInBar, "keyboard must still be able to reach the controls").toBe(true);
  });
});

test.describe("reduced motion", () => {
  // emulateMedia rather than test.use({ reducedMotion }) — the fixture form
  // did not take effect here, and a silently-unemulated run makes both of
  // these tests pass for the wrong reason. Must run before goto so the very
  // first animate() call sees it.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("#10 the canvas loop stops and the zero pulse is disabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(500);
    expect(
      await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
      "emulation must be active or this test proves nothing"
    ).toBe(true);

    const painted = await page.evaluate(() => {
      const c = document.getElementById("bg-canvas") as HTMLCanvasElement;
      const g = c.getContext("2d")!;
      const before = Array.from(g.getImageData(0, 0, 40, 40).data);
      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          const after = Array.from(g.getImageData(0, 0, 40, 40).data);
          resolve(before.some((v, i) => v !== after[i]));
        }, 700);
      });
    });
    expect(painted, "canvas must be frozen under reduced motion").toBe(false);

    const anim = await page.evaluate(() => {
      const el = document.getElementById("time-display")!;
      el.classList.add("timer-zero");
      return getComputedStyle(el).animationName;
    });
    expect(anim).toBe("none");
  });

  test("#7b no flash overlay under reduced motion", async ({ page }) => {
    await page.goto("/");
    expect(
      await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
    ).toBe(true);
    // Watch for the class, don't sample for it — the flash is only 400ms, so
    // a plain check after the fact passes whether or not it fired.
    await page.evaluate(() => {
      (window as any).__flashed = false;
      new MutationObserver(() => {
        if (document.getElementById("flash-overlay")!.classList.contains("flash-active")) {
          (window as any).__flashed = true;
        }
      }).observe(document.getElementById("flash-overlay")!, { attributes: true });
    });
    await page.getByRole("button", { name: "Custom" }).click();
    await page.locator("#custom-min").fill("0");
    await page.locator("#custom-sec").fill("2");
    await page.keyboard.press("Enter");
    await page.locator("#btn-play").click();
    await expect(page.locator("#time-display")).toHaveClass(/timer-zero/, { timeout: 4000 });
    expect(await page.evaluate(() => (window as any).__flashed)).toBe(false);
  });
});
