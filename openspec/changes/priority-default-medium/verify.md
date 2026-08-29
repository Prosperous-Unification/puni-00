# verify — `priority-default-medium`

Slices 1, 2 and 3 are implemented and verified. Slice 4's Chromium spec is
**written but not executed** and slice 5 is not run — see "Skipped or unavailable
checks".

## The colours, as shipped

`apps/fe-01/src/components/wbs/priority-band-style.ts`, `BAND_INKS`. Tints are
each ink at `14%`, unchanged as a rule.

| Rank | Before                 | After                  | Where the value came from                                              |
| ---- | ---------------------- | ---------------------- | ---------------------------------------------------------------------- |
| 0    | `oklch(0.55 0.21 27)`  | `oklch(0.55 0.21 27)`  | unchanged                                                              |
| 1    | `oklch(0.62 0.17 52)`  | `oklch(0.62 0.17 52)`  | unchanged                                                              |
| 2    | `oklch(0.62 0.13 92)`  | `oklch(0.58 0.02 265)` | copied from rank 4's pre-change value, per Dany's "same as Lowest now" |
| 3    | `oklch(0.58 0.11 205)` | `oklch(0.59 0.06 240)` | the cool hue's quieter step — `+0.01` lightness, see below             |
| 4    | `oklch(0.58 0.02 265)` | `oklch(0.58 0.12 240)` | the same hue, more saturated: the bluest thing is the least important  |

**One deviation from the delta spec's wording, recorded rather than hidden.** The
spec's scenario says ranks 3 and 4 "SHALL share a hue and a lightness"; the values
Dany gave differ in lightness by `0.01` (0.59 against 0.58). The values were taken
as given — the brief said to copy rather than re-pick — and the assertion is
written as _one lightness band_ (`|ΔL| ≤ 0.02`) rather than exact equality, with
the reason on the constant: the less saturated of a pair reads slightly darker, so
the nudge is what keeps them at one visual weight. The hue is exactly equal (240
and 240) and the chroma margin is the load-bearing assertion.

## Commands

Run from the worktree root, 2026-08-29.

| Command                                                              | Result                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `bunx nx run be-01:test`                                             | **pass** — `1172 pass / 0 fail`, 29 895 expect() calls, 86 files, 26.13s                               |
| `bunx nx run fe-01:test`                                             | **pass** — `Test Files 57 passed (57)`, `Tests 1810 passed (1810)`, 241.39s, with `TZ=UTC` (see below) |
| `bunx nx run be-01:lint`                                             | **pass** — `Successfully ran target lint for project be-01`                                            |
| `bunx nx run fe-01:lint`                                             | **pass** — `Successfully ran target lint for project fe-01`                                            |
| `bunx nx run be-01:typecheck`                                        | **pass** — `bunx tsc --build --force apps/be-01/tsconfig.lib.json`                                     |
| `bunx nx run fe-01:typecheck`                                        | **pass** — `tsconfig.app.json` and `tsconfig.e2e.json`, both clean (so the new e2e spec compiles)      |
| `bunx openspec validate priority-default-medium --json`              | **pass** — `items: 1, passed: 1, failed: 0`                                                            |
| `bunx prettier --check` on every changed file                        | **pass** — `All matched files use Prettier code style!`                                                |
| `bin/h2puni-gate.sh`                                                 | **not run** — out of scope for this session                                                            |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` | **not run** — see below                                                                                |

`apps/be-01/openapi.json` was regenerated with
`bun apps/be-01/src/openapi/emit-openapi-cli.ts`, because the create variant gained
a `priority` property. The case `the committed OpenAPI document / is what the app
serves right now` was red before that regeneration and is green after it.

## Failure proofs (R5)

Every fault below was injected into the production path, the named case watched
going red, and the fault then reverted.

| Check                                      | Fault injected                                                                                                                    | Test that saw it fail                                          | Watched                                                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the default is the ladder's rank 2         | `ordinary.defaultValue` → the constant `50`                                                                                       | `a re-cut ladder moves the default`                            | **yes** — `expect(received).toBe(expected)` / `Expected: 200` / `Received: 50` (2 fail, 17 pass)                                                                    |
| the default is keyed on rank, not label    | lookup → `bands.find((band) => band.label === 'Medium')`                                                                          | `a renamed middle band still supplies the default`             | **yes** — `error: project b6d2f832-… has a priority ladder of 5 bands, so it has no rank 2 rung to create work items at` (1 fail, 18 pass)                          |
| explicit null differs from absent          | `input.priority === undefined ? … : …` → `input.priority ?? …`                                                                    | `an explicit null creates an unprioritised item`               | **yes** — `expect(received).toBeNull()` / `Received: 50` (also took 4 other cases red)                                                                              |
| the ladder is read per project             | `ordinaryPriorityOf` memoised on the service, ignoring `projectId`                                                                | `the default priority comes from the project being written to` | **yes** — `Expected: 50` / `Received: 200` (1 fail, 18 pass)                                                                                                        |
| a short ladder is refused, never defaulted | the throw → `?? DEFAULT_PRIORITY_BANDS[ORDINARY_BAND_RANK]`                                                                       | `refuses to create against a ladder with no middle rung`       | **yes** — `expect(received).toMatch(expected)` / `Received: "(resolved without throwing)"`                                                                          |
| nothing existing was backfilled            | scratch `20260830000000_backfill_priority` — `UPDATE work_item SET priority = 50 WHERE priority IS NULL;` with a no-op `down.sql` | `an existing plan is unchanged`                                | **yes** — `- "priority": null` / `+ "priority": 50` on both rows; folder then **deleted**                                                                           |
| ranks 3 and 4 are distinguishable          | rank 3's entry set to rank 4's value                                                                                              | `the two cool ranks are told apart`                            | **yes** — `AssertionError: expected 0 to be greater than or equal to 0.05` (and `expected 4 to be 5` on the pre-existing five-distinct-inks case)                   |
| the middle rank is the approved grey       | rank 2 put back to `oklch(0.62 0.13 92)`                                                                                          | `the middle rank is neutral`                                   | **yes** — `expected 'oklch(0.62 0.13 92)' to be 'oklch(0.58 0.02 265)'`, and `a plan of ordinary work carries no warm chip` on `expected 0.13 to be less than 0.03` |

The chroma margin is measured, not shaped like `toBeDefined`: the test parses each
`oklch(L C H)` literal back into three numbers and asserts
`chroma(rank 4) − chroma(rank 3) ≥ 0.05` against a constant stated in the test
rather than read off the table. Setting the two ranks equal makes that difference
`0`, which is what the watched red says.

## What this change moved that the proposal did not name

**A phase's priority no longer reaches a leaf created after this change.**
`priorityByLeaf` (`be-01/src/service/schedule.ts`) resolves by the _most specific_
statement, so a leaf carrying its own priority is one a parent's priority does not
override. Every leaf now carries one, so a priority written on a phase reaches only
leaves that are explicitly unprioritised — rows written before this change, and
rows created with `priority: null`. Three existing cases were the ones that saw it:

- `work-item.service.test.ts` › `reaches every leaf beneath a parent somebody gave a
priority` — the leaf is now created unprioritised, with the reason written beside it.
- `undo.test.ts` › `takes a first priority away again, rather than leaving a 1 behind`
  and › `re-applies a priority, and a first one that was undone to nothing` — both use a
  new `unranked()` create, because "the first priority this row ever had" is a state
  only an explicit-null create can now produce.

Nothing else in 1172 be-01 cases or 1810 fe-01 cases changed behaviour.

## Skipped or unavailable checks

- **Slice 4.1's Chromium spec is written and never executed.**
  `apps/fe-01/e2e/priority-ramp.spec.ts` measures the Prio cell's painted ink in
  both palettes — rank 2 neutral, ranks 3 and 4 apart by a chroma margin, all
  three at 3:1 or better against the composited surface. It was **not run**:
  ports 3100/3200/4200 are held by a dev server, and `reuseExistingServer:
!isCi` would have measured a different checkout (`LLM_README.md`'s landmine,
  R5 #18). It typechecks and lints; nothing else about it is verified, and its
  thresholds — in particular the `READABLE = 3` contrast floor — are **claims
  until a browser reads them**.
- **Slice 4.1's negative is therefore unwatched in a browser.** The same fault
  (ranks 3 and 4 set equal) was watched red in jsdom on the chroma margin, which
  is the same quantity the browser spec asserts, but jsdom cannot see a Chromium
  parse failure or a contrast ratio.
- **The whole `CI=1` Playwright gate is not run** — same reason. A change that
  edits a shared colour table owes the _whole_ browser gate (`AGENTS.md`,
  `linked-row-hover`), not a filtered run, and that is slice 5.1.
- **`bin/h2puni-gate.sh` is not run** — this session was scoped to the four Nx
  targets above.
- **`fe-01:test` needs `TZ=UTC` on this machine.** Two cases in
  `plan-mermaid.test.ts` (`leaves a bar crossing a weekend exactly where it was
told, manualEndTime true` and `still parses a point (unestimated/zero) as a
real milestone with equal dates`) fail under `Europe/Kyiv` on
  `expected '2026-09-03T21:00:00.000Z' to be '2026-09-04T00:00:00.000Z'` — a
  three-hour offset. **Pre-existing and unrelated**: confirmed by running that
  file alone both ways, 2 fail local / 49 pass with `TZ=UTC`, and neither case
  touches a priority.
