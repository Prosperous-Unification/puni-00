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
