import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

// Daily tallies (index.html, section 0). Every test intercepts the Supabase
// URL, so none of them reach the live table. ?countlocal=1 is the dev flag
// that lets localhost count at all.

const SUPABASE = "https://wngamnvtotzuyiohtakc.supabase.co";
const RPC = `${SUPABASE}/rest/v1/rpc/bump_suite_usage`;
const COUNTING = "/?countlocal=1";

interface Tally {
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST, OPTIONS",
};

// Records every tally the page sends and answers like PostgREST would.
async function recordTallies(page: Page): Promise<Tally[]> {
  const tallies: Tally[] = [];
  await page.route(`${SUPABASE}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      tallies.push({ body: request.postDataJSON(), headers: await request.allHeaders() });
    }
    await route.fulfill({ status: 200, headers: corsHeaders, contentType: "application/json", body: "true" });
  });
  return tallies;
}

function events(tallies: Tally[]): string[] {
  return tallies.map((tally) => String(tally.body.p_event));
}

// The island folds away after a modal closes, so hover it back open first.
async function startTimer(page: Page) {
  await expect(page.locator("#custom-time-modal")).toBeHidden();
  await page.locator("#island").hover();
  await page.locator("#btn-play").click();
  await expect(page.locator("#btn-play")).toHaveAttribute("aria-label", /Pause/);
}

async function pauseTimer(page: Page) {
  await page.locator("#island").hover();
  await page.locator("#btn-play").click();
  await expect(page.locator("#btn-play")).toHaveAttribute("aria-label", /Play/);
}

// Lets a fire-and-forget fetch reach the route before the test looks.
async function settle(page: Page) {
  await page.waitForTimeout(300);
}

test.describe("Daily tallies: what is sent", () => {
  test("a first visit counts the browser active for the day, week and month", async ({ page }) => {
    const tallies = await recordTallies(page);
    await page.goto(COUNTING);
    await expect.poll(() => tallies.length).toBe(3);
    expect(events(tallies).sort()).toEqual(["active-day", "active-month", "active-week"]);
    for (const tally of tallies) {
      // The event name and the app, nothing else.
      expect(Object.keys(tally.body).sort()).toEqual(["p_app", "p_event"]);
      expect(tally.body.p_app).toBe("timr");
      expect(tally.headers.apikey).toMatch(/^sb_publishable_/);
      expect(tally.headers.cookie).toBeUndefined();
      expect(tally.headers.referer).toBeUndefined();
    }

    // Same day, same browser: counted already.
    await page.reload();
    await settle(page);
    expect(tallies.length).toBe(3);
  });

  test("the note in storage holds only dates and event names", async ({ page }) => {
    await recordTallies(page);
    await page.goto(COUNTING);
    await startTimer(page);
    const note = await page.evaluate(() => JSON.parse(localStorage.getItem("classtimr:usage") || "{}"));
    expect(Object.keys(note).sort()).toEqual(["day", "done", "doneDay", "month", "week"]);
    expect(note.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(note.doneDay).toBe(note.day);
    expect(note.week).toMatch(/^\d{4}-W\d{2}$/);
    expect(note.month).toMatch(/^\d{4}-\d{2}$/);
    expect(note.done).toEqual(["timer-started-preset"]);
    // Nothing else under a classtimr usage key, and no cookies at all.
    expect(await page.evaluate(() => document.cookie)).toBe("");
  });

  test("an action counts once per day however often it happens", async ({ page }) => {
    const tallies = await recordTallies(page);
    await page.goto(COUNTING);
    await page.getByRole("button", { name: "5 Min", exact: true }).click();
    await startTimer(page);
    await pauseTimer(page);
    await startTimer(page);
    await settle(page);
    expect(events(tallies).filter((event) => event === "timer-started-preset")).toHaveLength(1);
  });

  test("a custom time and a preset count separately", async ({ page }) => {
    const tallies = await recordTallies(page);
    await page.goto(COUNTING);
    await page.getByRole("button", { name: "Custom" }).click();
    await page.locator("#custom-min").fill("7");
    await page.getByRole("button", { name: "Set Time" }).click();
    await startTimer(page);
    await pauseTimer(page);
    await page.getByRole("button", { name: "1 Min", exact: true }).click();
    await startTimer(page);
    await settle(page);
    expect(events(tallies)).toContain("timer-started-custom");
    expect(events(tallies)).toContain("timer-started-preset");
  });

  test("stopwatch, clock, theme and a finished countdown each count", async ({ page }) => {
    const tallies = await recordTallies(page);
    await page.goto(COUNTING);
    await page.locator("#btn-mode-stopwatch").click();
    await startTimer(page);
    await page.locator("#btn-mode-clock").click();
    await page.locator("#island").hover();
    await page.locator("#theme-button").click();
    await page.getByRole("menuitemradio", { name: /Deep Ocean/ }).click();
    await page.locator("#btn-mode-timer").click();
    await page.getByRole("button", { name: "Custom" }).click();
    await page.locator("#custom-min").fill("0");
    await page.locator("#custom-sec").fill("1");
    await page.getByRole("button", { name: "Set Time" }).click();
    await startTimer(page);
    await expect.poll(() => events(tallies), { timeout: 5000 }).toContain("timer-finished");
    expect(events(tallies)).toEqual(
      expect.arrayContaining(["stopwatch-started", "clock-shown", "theme-ocean", "timer-started-custom"])
    );
  });
});

test.describe("Daily tallies: when nothing is sent", () => {
  test("localhost without the dev flag sends nothing", async ({ page }) => {
    const tallies = await recordTallies(page);
    await page.goto("/");
    await startTimer(page);
    await settle(page);
    expect(tallies).toHaveLength(0);
  });

  test("Do Not Track stops every tally", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "doNotTrack", { get: () => "1" });
    });
    const tallies = await recordTallies(page);
    await page.goto(COUNTING);
    await startTimer(page);
    await settle(page);
    expect(tallies).toHaveLength(0);
  });

  test("Global Privacy Control stops every tally", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true });
    });
    const tallies = await recordTallies(page);
    await page.goto(COUNTING);
    await startTimer(page);
    await settle(page);
    expect(tallies).toHaveLength(0);
  });

  test("?nocount=1 turns counting off with a notice, and ?nocount=0 turns it back on", async ({ page }) => {
    const tallies = await recordTallies(page);
    await page.goto(`${COUNTING}&nocount=1`);
    await expect(page.locator("#usage-notice")).toHaveText("Counting is off in this browser.");
    await startTimer(page);
    await settle(page);
    expect(tallies).toHaveLength(0);

    // It stays off on later visits, and the notice doesn't come back.
    await page.goto(COUNTING);
    await expect(page.locator("#usage-notice")).toHaveCount(0);
    await startTimer(page);
    await settle(page);
    expect(tallies).toHaveLength(0);

    await page.goto(`${COUNTING}&nocount=0`);
    await expect(page.locator("#usage-notice")).toHaveText("Counting is back on in this browser.");
    await expect.poll(() => events(tallies).sort()).toEqual(["active-day", "active-month", "active-week"]);
  });

  test("offline: nothing is sent, nothing breaks, and it counts once back online", async ({ page, context }) => {
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    const tallies = await recordTallies(page);
    await page.goto(COUNTING);
    await expect.poll(() => tallies.length).toBe(3);
    // The classroom wifi drops with the page already open.
    await context.setOffline(true);
    await page.getByRole("button", { name: "1 Min", exact: true }).click();
    await startTimer(page);
    await page.waitForTimeout(1500);
    await expect(page.locator("#time-display")).not.toHaveText("1:00");
    expect(tallies).toHaveLength(3);
    expect(errors).toHaveLength(0);
    // Not written to the note while offline, so the next start counts it.
    await context.setOffline(false);
    await pauseTimer(page);
    await startTimer(page);
    await expect.poll(() => events(tallies)).toContain("timer-started-preset");
  });

  test("a failed request is silent and the timer keeps running", async ({ page }) => {
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    let attempts = 0;
    await page.route(`${SUPABASE}/**`, (route) => {
      attempts += 1;
      return route.abort("internetdisconnected");
    });
    await page.goto(COUNTING);
    await page.getByRole("button", { name: "1 Min", exact: true }).click();
    await startTimer(page);
    await page.waitForTimeout(1500);
    await expect(page.locator("#time-display")).not.toHaveText("1:00");
    expect(attempts).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });
});

test.describe("Daily tallies: lists and calendar", () => {
  test("the event list matches the migration's allowlist and covers every theme", async ({ page }) => {
    await page.goto("/");
    const { events: pageEvents, themes } = await page.evaluate(() => ({
      events: (window as any).TimrUsage.events as string[],
      // THEMES is a top-level const in the main script, out of TypeScript's sight.
      themes: (eval("THEMES") as { v: string }[]).map((theme) => theme.v),
    }));
    for (const theme of themes) expect(pageEvents).toContain(`theme-${theme}`);

    const migration = readFileSync(
      join(__dirname, "..", "supabase", "migrations", "20261027120000_timr_usage_events.sql"),
      "utf8"
    );
    const timrBranch = migration.slice(migration.indexOf("p_app = 'timr'"), migration.indexOf("else\n"));
    const allowed = [...timrBranch.matchAll(/'([a-z-]+)'/g)]
      .map((match) => match[1])
      .filter((name) => name !== "timr");
    expect(allowed.sort()).toEqual([...pageEvents].sort());
  });

  test("days are Edmonton days and weeks are ISO weeks starting Monday", async ({ page }) => {
    await page.goto("/");
    const periods = await page.evaluate(() => {
      const usage = (window as any).TimrUsage;
      return {
        // 05:59 UTC on a Tuesday is still Monday evening in Edmonton (MDT, UTC-6).
        lateMonday: usage.periodOf(new Date("2026-10-27T05:59:00Z")),
        sunday: usage.isoWeek("2026-11-01"),
        monday: usage.isoWeek("2026-11-02"),
        // 1 January 2027 is a Friday, so it belongs to 2026's last week.
        newYear: usage.isoWeek("2027-01-01"),
      };
    });
    expect(periods.lateMonday).toEqual({ day: "2026-10-26", week: "2026-W44", month: "2026-10" });
    expect(periods.sunday).toBe("2026-W44");
    expect(periods.monday).toBe("2026-W45");
    expect(periods.newYear).toBe("2026-W53");
  });
});

test.describe("Content-Security-Policy", () => {
  // The header as nginx sends it in production, read from the file it ships.
  const policy = (() => {
    const conf = readFileSync(join(__dirname, "..", "security-headers.conf"), "utf8");
    const match = conf.match(/Content-Security-Policy "([^"]+)"/);
    if (!match) throw new Error("No CSP in security-headers.conf");
    return match[1];
  })();

  test("connect-src names the Supabase project and nothing else", () => {
    const connect = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith("connect-src"));
    expect(connect).toBe(`connect-src ${SUPABASE}`);
  });

  test("the page can reach Supabase and is blocked from everywhere else", async ({ page }) => {
    await page.route("http://localhost:8080/**", async (route) => {
      const request = route.request();
      if (request.resourceType() !== "document") return route.continue();
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": policy } });
    });
    const tallies = await recordTallies(page);
    const blocked: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Content Security Policy")) blocked.push(message.text());
    });

    await page.goto(COUNTING);
    // The page's own tallies get through.
    await expect.poll(() => tallies.length).toBe(3);

    const results = await page.evaluate(async (rpc) => {
      async function tryFetch(url: string, init?: RequestInit) {
        try {
          await fetch(url, init);
          return "ok";
        } catch {
          return "blocked";
        }
      }
      return {
        supabase: await tryFetch(rpc, { method: "POST", body: "{}" }),
        elsewhere: await tryFetch("https://example.com/"),
        otherSupabase: await tryFetch("https://lbzpbjcvjgpkfblpdsuz.supabase.co/rest/v1/"),
        sameOrigin: await tryFetch("/robots.txt"),
      };
    }, RPC);
    expect(results).toEqual({ supabase: "ok", elsewhere: "blocked", otherSupabase: "blocked", sameOrigin: "blocked" });
    expect(blocked.length).toBeGreaterThanOrEqual(3);
  });
});

test.describe("Privacy modal", () => {
  test("opens from the island, names Supabase and Canada, and closes with Escape", async ({ page }) => {
    await page.goto("/");
    await page.locator("#island").hover();
    await page.locator("#btn-privacy").click();
    const modal = page.locator("#privacy-box");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Supabase, in Canada (Montreal)");
    await expect(modal).toContainText("The microphone's sound never leaves your computer.");
    await expect(page.locator("#privacy-done")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#privacy-modal")).toBeHidden();
  });
});
