import { test, expect, Page } from "@playwright/test";

// The real "Use mic" path, with getUserMedia answered by a generated tone
// instead of a device. Chrome's --use-fake-device-for-media-stream hung here
// (2026-10-23, every headless/headed variant), and a generated tone has a
// known loudness, which a test can lean on. Everything after getUserMedia
// (AudioContext, analyser, RMS, baseline, zones) is Timr's own code.
async function openNoiseWithTone(page: Page, gain: number) {
  await page.addInitScript((toneGain) => {
    (window as any).__micRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      (window as any).__micRequests += 1;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      volume.gain.value = toneGain;
      const destination = context.createMediaStreamDestination();
      oscillator.connect(volume).connect(destination);
      oscillator.start();
      (window as any).__toneVolume = volume;
      (window as any).__toneStream = destination.stream;
      return destination.stream;
    };
  }, gain);
  await page.goto("/");
  await page.locator("#island").hover();
  await page.locator("#btn-mode-noise").click();
  await page.locator("#island").hover();
  await page.locator("#btn-noise-mic").click();
  await expect(page.locator("#noise-mic-label")).toHaveText("Mic on · nothing recorded");
}

test("Use mic goes live, and leaving Noise mode lets go of the mic", async ({ page }) => {
  await openNoiseWithTone(page, 0.001);
  await expect(page.locator("#island-label")).toHaveText("Voice level · Listening");
  await expect(page.locator("#noise-note")).toContainText("Listening");
  expect(await page.evaluate(() => (window as any).TimrNoise.isMicOn())).toBe(true);

  await page.locator("#island").hover();
  await page.locator("#btn-mode-clock").click();
  expect(await page.evaluate(() => (window as any).TimrNoise.isMicOn())).toBe(false);
});

test("pressing the mic button again turns the mic off", async ({ page }) => {
  await openNoiseWithTone(page, 0.001);
  await page.locator("#island").hover();
  await page.locator("#btn-noise-mic").click();
  await expect(page.locator("#noise-mic-label")).toHaveText("Use mic");
  await expect(page.locator("#noise-note")).toContainText("Demo classroom");
  expect(await page.evaluate(() => (window as any).TimrNoise.isMicOn())).toBe(false);
});

test("a quiet room reads green and a loud one turns the screen red", async ({ page }) => {
  // 0.001 gain is about -63 dBFS, under the default -55 baseline.
  await openNoiseWithTone(page, 0.001);
  await expect(page.locator("#noise-stage")).toHaveAttribute("data-zone", "green", { timeout: 4000 });
  await expect(page.locator("#noise-status")).toHaveText("Working voices");

  // 0.5 gain is about -9 dBFS: far past red. The default hold is 1.5 s.
  await page.evaluate(() => { (window as any).__toneVolume.gain.value = 0.5; });
  await expect(page.locator("#noise-stage")).toHaveAttribute("data-zone", "red", { timeout: 5000 });
  await expect(page.locator("#noise-status")).toHaveText("Too loud");
  await expect(page.locator("#sr-status")).toHaveText("Too loud");
});

test("the quiet baseline counts down and saves what the mic heard", async ({ page }) => {
  await openNoiseWithTone(page, 0.01); // about -43 dBFS
  await page.locator("#island").hover();
  await page.locator("#btn-noise-settings").click();
  await page.locator("#btn-noise-baseline").click();
  await expect(page.locator("#noise-calibrate-box")).toBeVisible();
  await expect(page.locator("#noise-note")).toHaveText("Baseline set for this room.", { timeout: 6000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("classtimr-noise") || "{}"));
  // A sine at amplitude 0.01 has an RMS of 0.00707, which is -43 dBFS.
  expect(saved.baseline).toBeGreaterThan(-46);
  expect(saved.baseline).toBeLessThan(-40);
});

test("Escape cancels the quiet baseline without saving one", async ({ page }) => {
  await openNoiseWithTone(page, 0.01);
  await page.locator("#island").hover();
  await page.locator("#btn-noise-settings").click();
  await page.locator("#btn-noise-baseline").click();
  await expect(page.locator("#noise-calibrate-box")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#noise-calibrate-modal")).toBeHidden();
  await page.waitForTimeout(3500);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("classtimr-noise") || "{}"));
  // Settings are saved whole, so the untouched default is what remains.
  expect(saved.baseline).toBe(-55);
});

// --- Noise bar under Timer, Stopwatch and Clock ---

async function stubTone(page: Page, gain: number) {
  await page.addInitScript((toneGain) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      volume.gain.value = toneGain;
      const destination = context.createMediaStreamDestination();
      oscillator.connect(volume).connect(destination);
      oscillator.start();
      (window as any).__toneVolume = volume;
      return destination.stream;
    };
  }, gain);
}

test("the noise bar shows a live meter under the countdown", async ({ page }) => {
  await stubTone(page, 0.5); // loud
  await page.goto("/");
  await page.locator("#island").hover();
  await page.locator("#btn-noise-bar").click();
  await expect(page.locator("#btn-noise-bar")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#noise-strip")).toBeVisible();
  await expect(page.locator(".timer-box")).toBeVisible();
  await expect(page.locator("#noise-strip")).toHaveAttribute("data-zone", "red", { timeout: 5000 });
  await expect(page.locator("#noise-strip-status")).toHaveText("Too loud");
  expect(await page.locator("#noise-strip-meter .noise-seg.is-on").count()).toBeGreaterThan(20);
  // The timer still works with the bar on.
  await page.locator("#island").hover();
  await page.locator("#btn-play").click();
  await expect(page.locator("#time-display")).not.toHaveText("15:00", { timeout: 3000 });
});

test("the noise bar keeps listening across Timer, Stopwatch, Clock and Noise", async ({ page }) => {
  await stubTone(page, 0.001);
  await page.goto("/");
  await page.locator("#island").hover();
  await page.locator("#btn-noise-bar").click();
  await expect.poll(() => page.evaluate(() => (window as any).TimrNoise.isMicOn())).toBe(true);

  for (const mode of ["stopwatch", "clock", "noise", "timer"]) {
    await page.locator("#island").hover();
    await page.locator(`#btn-mode-${mode}`).click();
    expect(await page.evaluate(() => (window as any).TimrNoise.isMicOn())).toBe(true);
  }
  await expect(page.locator("#noise-strip")).toBeVisible();

  await page.locator("#island").hover();
  await page.locator("#btn-noise-bar").click();
  await expect(page.locator("#noise-strip")).toBeHidden();
  expect(await page.evaluate(() => (window as any).TimrNoise.isMicOn())).toBe(false);
});

test("turning the mic off in Noise mode also takes the noise bar down", async ({ page }) => {
  await stubTone(page, 0.001);
  await page.goto("/");
  await page.locator("#island").hover();
  await page.locator("#btn-noise-bar").click();
  await expect.poll(() => page.evaluate(() => (window as any).TimrNoise.isMicOn())).toBe(true);
  await page.locator("#island").hover();
  await page.locator("#btn-mode-noise").click();
  await page.locator("#island").hover();
  await page.locator("#btn-noise-mic").click();
  expect(await page.evaluate(() => (window as any).TimrNoise.isMicOn())).toBe(false);
  await page.locator("#island").hover();
  await page.locator("#btn-mode-timer").click();
  await expect(page.locator("#noise-strip")).toBeHidden();
  await expect(page.locator("#btn-noise-bar")).toHaveAttribute("aria-pressed", "false");
});

test("an unplugged mic says so instead of reading silence as quiet", async ({ page }) => {
  await openNoiseWithTone(page, 0.001);
  // A real unplug fires "ended" on the track; track.stop() doesn't, so fire it directly.
  await page.evaluate(() => (window as any).__toneStream.getAudioTracks()[0].dispatchEvent(new Event("ended")));
  await expect(page.locator("#noise-note")).toContainText("The microphone was disconnected");
  await expect(page.locator("#noise-mic-label")).toHaveText("Use mic");
  expect(await page.evaluate(() => (window as any).TimrNoise.isMicOn())).toBe(false);
});

// --- Microphone picker ---

async function stubTwoMics(page: Page, allowed: boolean) {
  await page.addInitScript((isAllowed) => {
    (window as any).__constraints = [];
    navigator.mediaDevices.enumerateDevices = async () => {
      if (!isAllowed && (window as any).__constraints.length === 0) {
        // Before the mic is allowed, browsers hide ids and names.
        return [{ kind: "audioinput", deviceId: "", label: "", groupId: "" } as MediaDeviceInfo];
      }
      return [
        { kind: "audioinput", deviceId: "default", label: "Default - Laptop Microphone", groupId: "a" },
        { kind: "audioinput", deviceId: "laptop-1", label: "Laptop Microphone", groupId: "a" },
        { kind: "audioinput", deviceId: "usb-1", label: "USB Classroom Mic", groupId: "b" },
        { kind: "audiooutput", deviceId: "speakers-1", label: "Speakers", groupId: "c" }
      ] as MediaDeviceInfo[];
    };
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      (window as any).__constraints.push(JSON.parse(JSON.stringify(constraints)));
      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator();
      oscillator.connect(destination);
      oscillator.start();
      return destination.stream;
    };
  }, allowed);
}

async function openSettingsInVoiceLevel(page: Page) {
  await page.goto("/");
  await page.locator("#island").hover();
  await page.locator("#btn-mode-noise").click();
  await page.locator("#island").hover();
  await page.locator("#btn-noise-settings").click();
  await expect(page.locator("#noise-settings-box")).toBeVisible();
}

test("before the mic is allowed, the picker offers only the computer default", async ({ page }) => {
  await stubTwoMics(page, false);
  await openSettingsInVoiceLevel(page);
  await expect(page.locator("#noise-mic-select option")).toHaveText(["Computer default"]);
  await expect(page.locator("#noise-mic-hint")).toContainText("Turn the mic on once");
});

test("picking a mic lists real inputs only, switches to it live, and is remembered", async ({ page }) => {
  await stubTwoMics(page, true);
  await page.goto("/");
  await page.locator("#island").hover();
  await page.locator("#btn-mode-noise").click();
  await page.locator("#island").hover();
  await page.locator("#btn-noise-mic").click();
  await expect(page.locator("#noise-mic-label")).toHaveText("Mic on · nothing recorded");
  // The first request asks for the default: no device named.
  expect(await page.evaluate(() => (window as any).__constraints[0].audio.deviceId)).toBeUndefined();

  await page.locator("#island").hover();
  await page.locator("#btn-noise-settings").click();
  // "Default - ..." and speakers are left out; Computer default covers the first.
  await expect(page.locator("#noise-mic-select option")).toHaveText(["Computer default", "Laptop Microphone", "USB Classroom Mic"]);

  await page.locator("#noise-mic-select").selectOption("usb-1");
  await expect.poll(() => page.evaluate(() => (window as any).__constraints.length)).toBe(2);
  const switched = await page.evaluate(() => (window as any).__constraints[1].audio);
  expect(switched.deviceId).toEqual({ ideal: "usb-1" });
  // Browser processing stays off on the new mic too.
  expect(switched.autoGainControl).toBe(false);
  await expect(page.locator("#noise-mic-hint")).toContainText("Set the quiet baseline again");
  await expect(page.locator("#noise-mic-label")).toHaveText("Mic on · nothing recorded");

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("classtimr-noise") || "{}"));
  expect(saved.micId).toBe("usb-1");
});

test("a remembered mic that isn't plugged in falls back to the default and says so", async ({ page }) => {
  await stubTwoMics(page, true);
  await page.addInitScript(() => {
    localStorage.setItem("classtimr-noise", JSON.stringify({ micId: "unplugged-mic" }));
  });
  await openSettingsInVoiceLevel(page);
  await expect(page.locator("#noise-mic-select")).toHaveValue("");
  await expect(page.locator("#noise-mic-hint")).toContainText("isn't plugged in");
});
