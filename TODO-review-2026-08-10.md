# classtimr — code review findings (2026-08-10)

Full read of `index.html` (1470 lines), `nginx.conf`, `Dockerfile`, `package.json`, `e2e/`.
Complements `TODO-static-analysis.md` (items 1 & 2 there stay WONTFIX per vault decision `du58`).

## Status — fix pass completed 2026-08-10

Findings **1–12 are fixed**. Findings **13–15 and the minor list are deferred** to a separate pass.
Full suite green: **28/28** (`npx playwright test --project=dev`).

Regression coverage lives in `e2e/regressions.spec.ts` — the old `_review-verify.spec.ts`, which
asserted the buggy behaviour, was inverted and replaced. Two existing tests in `interactions.spec.ts`
were updated because finding 5 deliberately changed their expectations.

**Verified by execution:** 1, 2, 3, 4, 5, 6, 7, 8, 10, 11 (e2e), plus stopwatch and clock modes by
manual script and all 11 themes by frozen-frame screenshot.
**Not verified locally: finding 9.** Neither Docker nor nginx is available on this machine, so the
header change could not be exercised. See the curl check below — it must be run after deploy.
**Judgement, not measurement:** 12 (contrast maths, not a rendered-pixel assertion).

---

## Fixed

1. **Space on the timer box was a net no-op** — the document `keydown` handler now skips
   `[role="button"]`, so the timer box's own inline handler is the only one that fires.
2. **Clock mode leaked an interval per click** — `clearInterval(clockInterval)` is unconditional at
   the top of `switchMode`.
3. **Custom `0:00` corrupted `initialTime`** — validated into a local before assigning, with a visible
   `#custom-time-error` message that clears on input.
4. **Enter on the modal Cancel button applied the time** — the Enter branch defers to native button
   activation when the target is a `BUTTON`.
5. **Presets auto-started the countdown** — `setPreset` and `applyCustomTime` both route through the
   new `applyDuration()`, which preserves running/stopped state.
6. **Cmd/Ctrl shortcuts collided with the browser** — the handler returns early on any modifier.
7. **The completion flash was invisible** — moved off `document.body` (which the canvas paints over)
   onto `#flash-overlay` at `z-index: 5`, above the canvas and below the digits.
8. **Pause handed back real time** — the root cause was deeper than first written up. A final tick on
   pause was not enough, because the stored value is floored to whole seconds. `remainingMs` /
   `elapsedMs` are now the source of truth and the whole-second values are derived for display only.
   Measured before: `14:55` after 9.5 s across five pauses. After: `14:51`, the honest value.
9. **nginx dropped headers on fonts and `/health`** — the six `add_header` lines moved to
   `security-headers.conf`, `include`d in all three blocks. `Dockerfile` has the matching `COPY`.
10. **No reduced-motion support** — `animate()` split into `drawFrame()` and a scheduler. Under
    `prefers-reduced-motion: reduce` the canvas paints a 30-frame warm-up and stops; the zero pulse
    becomes a solid red; the completion flash is suppressed. The warm-up (rather than a single frame)
    is what makes `cyber`, `biolum` and `magnetic` look like themselves — they build their image from
    translucent layers.
11. **Faded control bar stayed in the tab order** — now `inert` when hidden, and it will not fade
    while it contains focus. The fade-reset listener moved from `keypress` to `keydown` so Tab can
    still wake it; without that, `inert` would have made the controls permanently unreachable by
    keyboard.
12. **Unbounded contrast** — `.glass-panel` alpha 0.7 → 0.9 and the Quick Start label from
    `text-gray-400` to `text-gray-300`. Worst case (bright frame behind the panel) that moves the
    label from ~2.4:1 to ~7.8:1.

### Post-deploy check for finding 9

```
curl -sI https://timr.classhelpr.com/fonts/inter-latin.woff2 | grep -i content-security-policy
curl -sI https://timr.classhelpr.com/health | grep -i content-security-policy
```

Both must print the header. If the container fails to start, the `COPY` line for
`security-headers.conf` is the first thing to check.

---

## Deferred

13. **No devicePixelRatio scaling** — `resizeCanvas` sizes the backing store in CSS pixels, so the
    background is upscaled and blurry on retina laptops and 4K projectors. Measured at
    `deviceScaleFactor: 2`: backing store 1200px where 2400px is needed.

14. **Per-particle `shadowBlur`** in the `dna`, `magnetic`, `neural` and `quantum` draw paths, plus
    2500 individual arcs in `biolum`. Reasoned from the draw-call count, not profiled on target
    Chromebook hardware.

15. **`document.title` written 4×/sec** — measured 8 writes in 2 s for 2 distinct values. Only write
    when the string changes.

13 and 14 touch every theme's draw path, which is why they are held back for their own pass with a
visual sweep.

### Minor

- `setPreset` / `applyCustomTime` are unreachable in stopwatch and clock mode but unguarded.
- No favicon → 404 on every page load. No `<meta name="description">`.
- `npm test` is the npm-init stub that exits 1; the real entry point is `test:e2e`.
- `.transform` sets `translateX(0)` and is beaten only by source order against `.scale-95` /
  `.-translate-x-1/2`. Reordering that CSS silently breaks the modal and control-bar centering.
