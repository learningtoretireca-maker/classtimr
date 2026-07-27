# classtimr — static analysis findings (2026-07-25)

Source: `npm audit` / `knip` / `tsc --noEmit` / `eslint` / `ruff`+`bandit` sweep.

## 1. `eslint .` cannot run in this repo
- `classtimr/` (no local eslint config, no local `eslint` dep)
- Repro: `cd classtimr && npx eslint .` → `ERR_MODULE_NOT_FOUND: Cannot find package 'eslint' imported from /Users/tomwhyte/Desktop/Projects/ClassHelpr-Dev/eslint.config.mjs`
- Cause: ESLint walks up to the monorepo flat config, which imports `eslint` from a `node_modules` classtimr doesn't have.
- Fix: add `classtimr/eslint.config.mjs` (flat, browser globals) + `eslint` + `@eslint/js` + `globals` to devDependencies. Inline `<script>` in `index.html` needs `@html-eslint` or an extract step to be linted in place.

## 2. `tsc --noEmit` cannot run in this repo
- `classtimr/playwright.config.ts:6,7,8,33`
- Repro: `cd classtimr && npx tsc --noEmit` → loads parent `ClassHelpr-Dev/tsconfig.json`; with a scoped config: `error TS2591: Cannot find name 'process'`
- Cause: no `classtimr/tsconfig.json`, no `@types/node` devDependency.
- Fix: add `tsconfig.json` (target ES2022, `"types": ["node"]`, include `e2e/**/*.ts` + `playwright.config.ts`) and `npm i -D @types/node`.

## 3. Dead `animationId` — no rAF cancel or visibility pause — **FIXED**
- Was: `let animationId` declared and assigned but never read; no `cancelAnimationFrame` anywhere.
- Fixed by the `visibilitychange` handler added near the bottom of the `<script>` in `index.html`.
- Correction to the original write-up: browsers already suspend `requestAnimationFrame` in hidden tabs, so the CPU saving here is small. The real win was item 4.

## 4. Countdown could sit expired while the tab was hidden — **FIXED**
- Was: hidden tabs throttle `setInterval` to ~once a minute, so a timer reaching zero in the background wouldn't run its completion branch until the next throttled tick — up to a minute late.
- Fix: completion logic extracted to `handleTimerComplete()`; tick bodies extracted to `tickCountdown()` / `tickStopwatch()`; the `visibilitychange` handler re-syncs from the wall clock on becoming visible and fires completion immediately if the deadline has passed.
- Verified with a throwaway Playwright spec using `page.clock`: display stays stale at `15:00` while hidden (interval never fires), snaps to `00:00` with `timer-zero` the moment visibility returns. Spec was removed after verifying; a copy is in the session scratchpad if it's wanted as permanent regression coverage.
- Still true and not fixed: nothing can make the visual flash land on time *while* the tab is hidden — browsers deliberately prevent that.

## Not applicable to this repo
- `ruff` / `bandit` — no Python files (`find . -name '*.py'` outside node_modules → empty). Neither tool installed.

## Clean
- `npm audit --omit=dev` → 0 vulnerabilities
- `knip` → no unused files/deps/exports
- ESLint (run out-of-tree on extracted inline JS): 4 "unused function" warnings are false positives — `switchMode`, `setPreset`, `showCustomTimeModal`, `toggleThemeMenu` are all bound via inline `onclick=` in the HTML.
