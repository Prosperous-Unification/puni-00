# Verify

Runs on 2026-10-18 in `/home/df/wd/puni/ui-table-toolbar` (branch `ui-review/table-toolbar` from
43ead5a10, the round-7 integration head), Chromium on Linux, `E2E_PORT_SHIFT=700`. Every command
ran under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

## Commands and results

- `bunx nx run-many -t typecheck lint:fast -p wbs-fe-01 --skip-nx-cache`: passed.
- `TZ=UTC bunx vitest run` on `gantt-bar-labels`, `plan-filter`, `toasts`, `saved-plans-panel`,
  `composition`, `plan-estimates`, `saved-plan-compare`, `saved-plan-save`, `saved-plans.feature`,
  `app-router`, `button`, `hint`, `plan-toolbar` and `plan-dependencies`: 14 files, 409 tests passed.
  `app`, `gantt-panel`, `plan-cards`, `project-page` and `plan-layout`: 5 files, 675 tests passed.
  The full fe-01 Vitest suites are left to CI.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 251 of 251 valid.
- Playwright, `--workers 2`:
  - `toolbar-panels, header, home, customize-editor, drop-cue, control-edge, gantt-legibility`: 64 passed.
  - `gantt.spec.ts -g "is one opaque hairline at every rung" --repeat-each 2`: 2 passed, `changedPixels=0 maxDelta=0` at rungs 28, 12 and 4.
  - `plan-table-review, deps-cell, chrome-frames, dark-mode, step-board, hints, layout`: 119 passed.
  - `mobile, project-settings, plan-import, page-states`: 46 passed.

## R5 proofs (observed failures)

Each new case ran against 43ead5a10's `src` with this change's tests (RED), then green. The
observed text is also in the adjacent `Proof:` comment.

| Finding     | Test                                                               | Observed on the old code                                                                                                                                   |
| ----------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-113       | `plan-table-review` `draws a resting trio and the o/r/p alike`     | light: placeholder `oklch(0.5 …)` vs trio `oklch(0.554 …)`; dark: `the placeholder told apart by its slant · Received: "normal"`                           |
| F-114       | same, contrast loop (trio put back on `--muted-foreground`)        | light: `Rate limiting trio, at rest · Expected: >= 4.5 · Received: 4.4775…`                                                                                |
| F-115       | `toolbar-panels` `names the bar and its end groups`                | `getByRole('toolbar', { name: 'Plan actions', exact: true })` not found                                                                                    |
| F-132       | `toasts.test.tsx` `takes the newest error off on Escape`           | `expected [ 'newest refusal', 'a note', …(1) ] to deeply equal [ 'a note', 'older refusal' ]`                                                              |
| F-135       | `saved-plans-panel.test.tsx` reconnect case; `composition.test.ts` | `Unable to find an element with the text: The connection dropped…`; `Cannot read properties of undefined (reading 'snapshot')`                             |
| F-136       | `plan-filter.test.tsx` Save hint                                   | `expected 'Save the Find box and the ticked filt…' to contain 'A name a view already has replaces th…'`                                                    |
| F-139       | `gantt-bar-labels.test.tsx`, `gantt-legibility` F-101              | `expected '010.3.06 · 3 steps · 2 no estimate' to be …`; e2e labels list `010 · 2 steps · 1 no estimate`                                                   |
| F-143       | `drop-cue` deep case                                               | `below 010.1.1.1 starts at its number · Expected: <= 1 · Received: 12`                                                                                     |
| F-147       | `header` pressed vs primary action                                 | light: `Expected: >= 1.5 · Received: 1`. Dark passed once while polled mid-transition, so the case now waits for the transitions to settle and reads once. |
| F-156       | `home` phone case                                                  | `drawn whole · Expected: false · Received: true`                                                                                                           |
| F-159       | `toolbar-panels` Export choice                                     | `a hint card after Download JSON · Expected: 0 · Received: 1`                                                                                              |
| F-169       | `header` Board case                                                | `Expected: 0 · Received: 1` (nav `Plan` beside unpressed `Plan`)                                                                                           |
| F-176/F-177 | `customize-editor`                                                 | `Cancel is reachable · Expected: true · Received: false`, both palettes                                                                                    |

## Not run locally

- The full fe-01 Vitest suites and the whole Playwright matrix: CI runs both.
