# verify — sub-day-gantt-axis

## Slice 0 — spec

Written on `batch-10/020-11-outcome-packets` from `origin/main` `a3b1526b` (2026-10-11).
`bunx @fission-ai/openspec@1.12.0 validate --all --json`: recorded in the lane record
`puni-plan/batch-10/lanes/020-11-outcome-packets.md`. No application behaviour is verified by
this packet.

## Slices 1 and 3 — implementation checkpoint (2026-10-12)

Based on `origin/main` `99f588257a0a7014ec9271224f7900ed588e6053`, isolated worktree
`.worktrees/batch-10-020-11-subday-axis`, branch `batch-10/020-11-subday-axis`.
The numeric `DayPx` API stays compatible; `AXIS_RUNGS` owns the six records, with
`DAY_SCALES` derived for existing consumers. Stored legacy numbers are read without
rewriting; new picks store ids. The layout owner holds reset notices so explicit picks,
layout reset and project swap can clear them. Clock-cell words are shared by HTML and
standalone SVG. Scheduled elapsed span supplies bar width, including parallel capacity.

## Commands

All Vitest commands run from `apps/wbs/fe-01`; other commands run from the worktree root.
Logs named below were captured under `/tmp` during this checkpoint.

| Check                     | Command or scope                                                                                                                                                                                                                                                                                                               | Observed result                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup                     | `bun install --frozen-lockfile`                                                                                                                                                                                                                                                                                                | Passed: 1292 locked packages installed.                                                                                                                                           |
| Baseline                  | Geometry, panel and layout suites, unfiltered                                                                                                                                                                                                                                                                                  | 3 files, 513 tests passed.                                                                                                                                                        |
| Slice 1 red               | Sub-day geometry, controls and remembered selection cases                                                                                                                                                                                                                                                                      | Initial run: 6 failed. After correcting malformed fixture signatures, geometry/weekend run: 8 failed, missing scale and cells. Reset-title run: 2 failed, 1 existing case passed. |
| Slice 3 red               | Mark-count and offer-limit cases                                                                                                                                                                                                                                                                                               | 5 failed, 2 passed: missing counter, enabled dense rungs and absent fallback.                                                                                                     |
| Slice 1+3 green           | Four suites filtered to new cases                                                                                                                                                                                                                                                                                              | 25 passed, 521 intentionally skipped.                                                                                                                                             |
| Review red                | Clock export, same-width notice and layout reset                                                                                                                                                                                                                                                                               | 5 failed: three exports omitted clocks, stale same-width title and absent reset action.                                                                                           |
| Final regression          | `TZ=UTC bunx vitest run src/components/wbs/gantt-geometry.test.ts src/components/wbs/gantt-panel.test.tsx src/components/wbs/plan-layout.test.tsx src/components/wbs/plan-chart-input.test.ts src/components/wbs/remembered-layout.model.test.ts --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000` | 5 files, 554 tests passed in 77.49s. `/tmp/subday-regressions-final.log`.                                                                                                         |
| Final timezone regression | `TZ=Pacific/Auckland bunx vitest run --config vitest.zoned.config.ts src/components/wbs/gantt-panel.zoned.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000`                                                                                                                                                   | 1 file, 1 test passed. `/tmp/subday-zoned-final.log`.                                                                                                                             |
| Final typecheck           | `bunx nx run wbs-fe-01:typecheck`                                                                                                                                                                                                                                                                                              | Passed both module and app targets. `/tmp/subday-types-complete.log`.                                                                                                             |
| Final lint                | `bunx nx run wbs-fe-01:lint:fast`                                                                                                                                                                                                                                                                                              | Passed. `/tmp/subday-lint-complete.log`.                                                                                                                                          |
| Final formatting          | `bunx prettier --check` on every changed file, then `git diff --check`                                                                                                                                                                                                                                                         | Passed, including the new axis foundation file.                                                                                                                                   |
| Final OpenSpec            | `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                                                                                                                                                       | 183/183 passed (165 changes, 18 specs), 0 failed. `/tmp/subday-spec-final.log`. Version 1.13.0 also passed 183 earlier.                                                           |

Earlier verification exposed and fixed discriminant narrowing, a duplicate export, a
fixture import collision, import/export ordering, and two void-return callback lint
errors. The first expanded regression run had 547 passed and 1 failed because the empty
geometry expectation omitted the new `pxPerWorkday` field; its expectation now includes 28. Existing day pixel/text assertions remain unchanged.

The bare `openspec` executable was absent. Running its cached JS directly failed to resolve
`chalk`; `bunx @fission-ai/openspec@1.12.0` supplied the CLI and passed. One test invocation
from the repository root failed to collect aliases; it was rerun from fe-01. An initial
format command named nonexistent extension variants and exited 2; subsequent formatting
used actual changed paths. Shared-clock extraction briefly left a stale JSX closure; the
parse error was corrected before the final checks. Vitest reports existing native-config
warnings (`__dirname`, extensionless config import), and Nx lint reports the existing
NO_COLOR/FORCE_COLOR warning.

## Failure proofs

Each mutation was applied to production code, the named real suite was run with
`TZ=UTC bunx vitest run <suite> --testNamePattern='<case>' --no-file-parallelism
--maxWorkers=1`, and the source was restored in `finally`. Exact per-fault logs are
`/tmp/subday-proof-<fault>.log`. Adjacent `Proof:` comments name the observations.

| Check                           | Fault injected                                            | Test that observed it                                                    | Observed                                                                                                      |
| ------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Workday subdivision             | `1h.cellsPerWorkday` 8 → 24 (`cells`)                     | sub-day cells labelled from 09:00 at 224 px                              | 1 failed, 2 passed: 24 labels instead of eight. The independent 224px scale alone would not catch this fault. |
| Weekend paint                   | Exclude sub-day rungs from weekend bands (`weekends`)     | weekends stay greyed at a sub-day rung                                   | 1 failed: Saturday band absent.                                                                               |
| Offer/fallback                  | Remove `count > SUB_DAY_MARK_LIMIT` comparisons (`offer`) | 2501/3000 refusal, restored selection and filter fallback                | 4 failed, 2 passed: dense choices enabled and requested sub-day scale retained.                               |
| Fallback width                  | Use 56 instead of Days' 28 (`fallback`)                   | a filter past the limit moves to Days and says so                        | 1 failed: selected width 56 instead of 28.                                                                    |
| DOM selection limit             | Replace `count <= SUB_DAY_MARK_LIMIT` with true (`pick`)  | a restored sub-day selection above the limit opens at Days and says so   | 1 failed: injected disabled-option change produced `[28, 224]` instead of `[28]`.                             |
| Stored-rung guard               | Accept every number/string (`storage`)                    | refuses a width that is not one of the rungs, and drops the key          | 1 failed: invalid 9 reached the drawing rather than the rendered reset.                                       |
| Refusal reset/drop              | Replace refused predicate with false (`reset`)            | same production layout refusal case                                      | 1 failed: reset title absent and key retained.                                                                |
| Optional runtime classification | Remove no-live-runtime arm (`claim`)                      | classifies a preference with no live runtime as absent and not persisted | 1 failed: null.claim TypeError.                                                                               |
| Review memo                     | Omit new notice prop from comparator                      | clears a rung notice at the same day width                               | Red regression and removal mutation both failed (1 test) on stale title.                                      |
| Review SVG                      | Omit clock-cell rendering                                 | exports the clock cells at 56/224/896 px                                 | Red regressions and removal mutation both failed (3 tests), clocks absent.                                    |

Additional review mutations (same command pattern and restoration):

| Check                   | Fault injected                                      | Test that observed it                                 | Observed                                                          |
| ----------------------- | --------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| Layout notice clearing  | Remove owner notice reset (`layout-notice`)         | layout reset clears a rung refusal notice at Days     | 1 failed: title retained.                                         |
| Project notice clearing | Remove owner notice swap (`project-notice`)         | switching projects clears the old rung refusal notice | 1 failed: p1 refusal retained on p2.                              |
| Caller notice handoff   | Remove callback reason argument (`reported-notice`) | a filter past the limit moves to Days and says so     | 1 failed: callback notice null instead of 3000-marks explanation. |

The review-focused green run passed 17 tests with 342 intentionally skipped. Real SVG bar
widths are asserted at 56/224/896 px using the bar's user-space width and its canvas scale;
this complements the geometry arithmetic oracle. `pxPerWorkday` also sizes the production
canvas and axis container, rather than serving tests alone.

## Rereview — stable accessible scale name

Restored `aria-label="Day scale — how wide one day is drawn"` alongside the dynamic
width/refusal title. The role/name regression now checks the normal title, a refusal
notice and the cleared title at the same 28px scale.

- Red: `TZ=UTC bunx vitest run src/components/wbs/gantt-panel.test.tsx --testNamePattern='keeps the scale accessible name' --no-file-parallelism --maxWorkers=1`
  failed 1 test (277 intentionally skipped): no combobox with the stable name. This is
  also the production-path removal proof for the restored label; adjacent `Proof:` names it.
  Log: `/tmp/subday-accessible-red.log`.
- Green: the same command with pattern `keeps the scale accessible name|sub-day offer limit`
  passed 7 tests (271 intentionally skipped). Log: `/tmp/subday-accessible-green.log`.
- Full changed suite: `TZ=UTC bunx vitest run src/components/wbs/gantt-panel.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000`
  passed all 278 tests. Log: `/tmp/subday-accessible-panel.log`.
- `bunx nx run wbs-fe-01:typecheck` passed both targets. Log: `/tmp/subday-accessible-types.log`.
- Initial test-edit command used a root-relative path from the frontend package and failed
  before writing; its filtered run collected no matching case. The corrected command above
  supplied the observed red. Other suites, timezone, OpenSpec and full lint were not rerun
  for this two-file label correction; their checkpoint results above remain at `0940c8f03`.

## Measurement (slice 4)

| Fixture | Rung   | Experiment p95 (020.07) | Shipped p95 | Date |
| ------- | ------ | ----------------------- | ----------- | ---- |
| 500×5   | 15 min | ≤ 67 ms interaction     | —           | —    |
| 2000×5  | 15 min | 166–202 ms zoom/pan     | —           | —    |

## Not run

Slice 2 (4px ticks, 18px hit surfaces and collision list), slice 4 performance measurement,
and final task 5.1 remain open. Browser Gantt e2e shards, full frontend suite, build,
CI secrets/migration lint and the h2puni host gate have not run for this checkpoint.
This local host is `pop-os`; the eventual host gate must pin the reviewed checkpoint SHA
under its lock. No main release, merge, deployment, or readiness for slice 2 is claimed.

## Round 12 integration — 2026-10-12

Integrated PR #372 (`9b44b3eec`) and PR #373 (`87976f796`) over corrected
round 11 (`13977965d`), with merge checkpoint `636a220c4`. Both independent
design/task edits and all earlier verification entries are preserved. The only
conflict was in `gantt-attempt-marks/verify.md`; both historical entries were retained.
PR #374 (`2065563ca`) is not an ancestor and its attempt slice is excluded.

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: checked 1,573 installs, no changes.
  The initial sandboxed install failed because its temporary directory was read-only.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 184 passed
  (166 changes, 18 specs), 0 failed. Log: `/tmp/integration-12-openspec.log`.
- Changed-file `bunx prettier --check` and `git diff --check 13977965d..HEAD`: passed.
- The five-suite Final regression command above: 554 tests passed in five files.
  Log: `/tmp/integration-12-regressions.log`.
- The Final timezone regression command above: 1 test passed.
  Log: `/tmp/integration-12-zoned.log`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:typecheck`:
  both targets passed with no cache hits. Log: `/tmp/integration-12-types.log`.

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:lint:fast`: passed
  without a cache hit. Log: `/tmp/integration-12-lint.log`.

The bare OpenSpec executable is unavailable; the pinned Bun invocation supplied it.
Existing Vite native-loader warnings remain. No new behavior or safety check was
introduced by integration; previous mutation observations were preserved and not rerun.
Browser/e2e, performance, full frontend suite, full host gate, CI secrets and migration
lint remain unrun for this integration checkpoint. Final merge requires the host gate
and CI on the final published SHA.

## Slice 2 checkpoint — 2026-10-12

The architecture review resolved the narrow-mark rule: positive-span forecast bars at sub-day rungs receive the 4px paint floor; day-rung paint and zero-duration line ticks stay intact. Centered pointer rectangles are at least 18px in both dimensions at every rung. The shared collision model is `selectMarksAtPointer` in `gantt-detail.ts`; the existing `GanttChart` owns the list and card. Two minutes at 896px/workday is **3.733px** before the floor (the original task's 1.87px example describes one minute).

- Initial geometry/model RED: 14 failed because the new functions were absent (`/tmp/subday2-red.log`). Production-panel RED: 3 failed on missing tick/hit surfaces (`/tmp/subday2-panel-red.log`).
- Initial focused GREEN: 17 passed, 464 skipped (`/tmp/subday2-green.log`). Shared-helper renamed GREEN: 14 passed, 186 skipped (`/tmp/subday2-helper-green.log`).
- Full changed suites: 481 passed in three files (`/tmp/subday2-regression-final.log`). The preceding run had 480 passed and one touch-release failure: wrapping marks changed `currentTarget` to a group. Measuring the authored pointer target preserves the original tap-release behavior; the focused touch/tick rerun passed four cases (`/tmp/subday2-touch-green.log`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:typecheck` passed both targets (`/tmp/subday2-types-final.log`).
- Frozen install passed after the sandbox refused its temporary directory. One initial test-writing command used repository paths from the frontend directory and made no edits; one root-level Vitest invocation failed alias resolution. Correct invocations above used the frontend cwd. An extension-glob formatting attempt named nonexistent variants; subsequent formatting named real files. The first helper commit was refused by import-sort lint; imports were sorted and the normal commit hooks then passed. No hook was bypassed.

| Production fault                          | Observing test                                                                 | Observed                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Remove the positive tick floor            | panel: paints a two-minute tick at 4px                                         | 1 failed: 3.733px rather than 4px                        |
| Remove the 18px hit floor                 | same panel test                                                                | 1 failed: 4px pointer width rather than 18px             |
| Bypass the collision list                 | panel: two overlapping surfaces open a list and the chosen line opens its card | 1 failed: direct card instead of the first choice button |
| Floor zero-duration marks                 | geometry: preserves the zero-day milestone at each rung                        | 3 failed, 3 passed                                       |
| Floor day-rung bars                       | geometry: positive mark under 4px at each rung                                 | 3 failed, 3 passed                                       |
| Change the strict floor boundary to <=4px | geometry: exactly 4px bar is untagged                                          | 1 failed                                                 |

Each fault was applied individually to production code, run through the real suite and restored in `finally`; logs are `/tmp/subday2-proof-{floor,hit,collision,zero,day,boundary}.log`. Adjacent `Proof:` comments name these observations.

This is an implementation checkpoint. The two-minute browser scenario, export-specific narrow-mark assertion, full frontend/e2e runs, measurement task 4 and host gate task 5 remain unverified; slice 2 task checkboxes remain open until their full evidence exists.

### Browser fixture and pointer correction

The isolated entry `apps/wbs/fe-01/benchmarks/subday-axis.html` mounts the shipped panel through `src/testing/subday-axis-benchmark.tsx`; `e2e/subday-axis-benchmark.ts` drives local Chromium. Start from the frontend cwd with `VITE_BE_URL=http://127.0.0.1:3100 VITE_GW_URL=http://127.0.0.1:3200 bunx vite --host 127.0.0.1 --port 4337`, then run `bun apps/wbs/fe-01/e2e/subday-axis-benchmark.ts` from the repository root. This fixture supplies synthetic fractional-workday slices directly to the panel; it does **not** prove the still-missing minutes-input stack.

The first browser run exposed a real SVG hit bug: `pointer-events=all` includes an unpainted one-unit stroke, which becomes 896px wide at this rung. The second mark intercepted x183 despite its fill rectangle beginning at x187. Forecast hit rectangles now use `fill`; pointer movement also recomputes membership after the same hover delay. The new same-surface movement test failed before `onPointerMove` existed (`/tmp/subday2-move-red.log`); the attribute test failed before `fill` (`/tmp/subday2-hit-fill-red.log`). Export, list reachability, Escape, scrolling, movement and touch-focused checks passed 8 cases (`/tmp/subday2-hit-fix-green.log`).

Browser GREEN measured fill width 3.99992px (the existing 1px outline makes its outer browser bounds 4.99992px), hit width 17.99992px and height 18px, exact `2 min` card, and explicit selection of the second overlapping mark, with no browser errors. Screenshot `/tmp/subday2-browser.png`; browser log `/tmp/subday2-browser.log`. Replacing `fill` with `all` in production again made the black-box `elementFromPoint` assertion fail: expected first mark, received second (`/tmp/subday2-proof-browser-hit.log`); source restored in `finally`. This is the browser proof missing from the original component-only checkpoint.

The runner recorded five fresh 500×5 mounts after one warmup, switching Days→15min between two animation frames: mount p95 **395.1ms**, interaction p95 **405.0ms**, Chromium 153.0.8010.12 at 1440×900 on pop-os. Raw samples are retained in `evidence/panel-500x5-development.json`. These are **Vite development-mode panel measurements**, compared with the experiment's ≤67ms interaction figure only as a coarse warning: they include React development behavior and the production panel's richer content, so they establish neither a production regression ratio nor grounds to raise the limit. The same runner separately verified all three sub-day choices disabled at 2000×5 and the selected rung moved to Days. No oversized-renderer bypass was added; the dedicated 2000×5 renderer-only mount/interaction measurement in task 4 remains OPEN.

Initial fixture attempts lacked the required application provider, then compared outer SVG stroke bounds with fill width; the provider and metric were corrected. A benchmark driver outside any tsconfig was refused by lint, so it now lives beside the browser drivers under `e2e/`. The fixture's CSS side-effect import was refused by TypeScript; CSS is loaded by its HTML entry instead. Existing Vite native-loader warnings persist.

Real minutes-input Gantt e2e acceptance, the full frontend/e2e suite, renderer-only 2000×5 measurement, packaged measurement and host gate remain OPEN. No merge or release readiness is claimed.

Final focused checkpoint: the three changed suites passed **485 tests** (`/tmp/subday2-final-regression.log`); frontend module+app typecheck passed (`/tmp/subday2-final-types.log`). OpenSpec validation passed **184** artifacts (`/tmp/subday2-spec.log`). Task 2.2 implementation and 2.3 mutation proofs are complete; 2.1 retains its real minutes-input browser acceptance and remains open, alongside tasks 4.1 and 5.1.
