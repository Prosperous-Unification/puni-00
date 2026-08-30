# verify — `priority-default-medium`

All five slices are implemented and verified. Slices 1–3 were verified on
2026-08-29; slice 4's Chromium spec and slice 5's whole browser gate were run on
2026-08-30 and are recorded in "The browser, 2026-08-30" below. What is still
**not** run is named in "Skipped or unavailable checks".

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

## The browser, 2026-08-30 (slices 4.1 and 5.1)

Run from this worktree, ports shifted by 700 (be-01 3800, gw-01 3900, fe-01 4900)
so the gate never reuses the dev server holding 3100/3200/4200 —
`LLM_README.md`'s landmine, R5 #18.

| Command                                                                                          | Result                                                                                   |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `CI=1 E2E_PORT_SHIFT=700 nx run fe-01:e2e -- --repeat-each=5 …/priority-ramp.spec.ts`            | **pass** — `10 passed (19.3s)`                                                           |
| `HEAVY_LOCK_WAIT_SECONDS=3600 bin/with-heavy-lock.sh -- env CI=1 E2E_PORT_SHIFT=700 … fe-01:e2e` | **228 passed / 3 failed (6.3m)** — the three named below, none of them this change's     |
| `bunx openspec validate --all --json`                                                            | **pass** — `items: 91, passed: 91, failed: 0`                                            |
| `bunx nx run-many -t test -p fe-01 be-01`                                                        | **pass** — be-01 `1203 pass / 0 fail`; fe-01 `Test Files 60 passed`, `Tests 1885 passed` |
| `bunx nx run fe-01:lint` / `be-01:lint`                                                          | **pass** — both `Successfully ran target lint`                                           |
| `bunx nx run fe-01:typecheck` / `be-01:typecheck`                                                | **pass** — both `Successfully ran target typecheck`                                      |
| `bunx prettier --check` on every changed file                                                    | **pass** — `All matched files use Prettier code style!`                                  |

The three reds in the whole gate are pre-existing and were **not** touched:

```
  ✘   19 …deps-cell.spec.ts:432:3 › picks the add button up off the row it is hovered on, in both palettes
       Expected: 0 / Received: 42            (an animation poll; fails identically on main)
  ✘  110 …keyboard.spec.ts:516:3 › Escape leaves the stored day alone, blur and all
  ✘  114 …keyboard.spec.ts:660:3 › saves only the year that was typed, digit by digit, in a real Chrome
```

The keyboard pair is the host-locale date-typing case `AGENTS.md` and
`playwright.config.ts` both record; `deps-cell.spec.ts:432` was re-run against
`main` by the coordinator overnight and fails there with the same
`Expected: 0 / Received: 42`.

### The `Received: 0` that was the spec's fault and not the ramp's

An overnight whole-gate run on a machine at **load average 555** failed _both_
palettes of `diverges around the middle rung` on
`expected 0 to be greater than or equal to 0.05` — byte-for-byte the red this
spec's own injected fault produces — and the same spec then passed 10/10 alone on
a quiet machine. Neither result could be believed, so the cause was reproduced
rather than argued about.

**It was the spec.** `setPriority` waited for `toHaveValue`, which reads the
box's own draft and is true the instant Enter is pressed; the colour arrives one
round trip later, off the priority the server answered with. Measured in that
window, all three cells are unpainted, so the margin between two of them is `0` —
the fault's number, with the colour table perfectly correct. Reproduced on an
idle machine by holding `POST …/commands` for 3s with a `page.route` handler:

```
Expected: >= 0.05
Received:    0                     ← both palettes, colour table untouched
```

`setPriority` now waits for the cell's `title`, which is built from the **stored**
priority (`${label} — priority ${n}`), and the same delayed run passes — 8.3s per
case rather than 1.6s, which is the wait doing its work.

**The first fix for it was a check that cannot fail, and this change is why.**
`font-weight: 600` was the obvious signal — `priority-cell.tsx` sets it from
`paint !== null` alone — but a created work item now carries the ladder's rank 2
default, so every row is painted a band from birth and 600 is already there
before anything is typed. Watched: with the write held 3s and that wait in place,
both palettes still failed, in 1.6s, having waited for nothing. Nineteenth of the
kind, caught before it shipped.

Two assertions were added beside it so that a `0` can never again mean two
things: each cool rung's own chroma is asserted above the neutral ceiling
_before_ the two are compared, so an unpainted cell fails on its own line with
its own words (`the Low rung was never painted its band`, `Received:
0.021185341837755327` — the table's inherited ink) rather than on the margin.

### Failure proofs (R5), in Chromium, both palettes

| Check                         | Fault injected                           | Watched                                                                                                                                                                                                                                          |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ranks 3 and 4 are told apart  | rank 3's ink set to rank 4's             | **yes, both palettes** — `Expected: >= 0.05` / `Received: 0`, `priority-ramp.spec.ts:289`                                                                                                                                                        |
| the middle rank is neutral    | rank 2 put back to `oklch(0.62 0.13 92)` | **yes, both palettes** — `Expected: < 0.03` / `Received: 0.12659194333338525`, line 268                                                                                                                                                          |
| all three rungs are legible   | rank 2 set to `oklch(0.85 0.02 265)`     | **yes, light palette** — `Expected: >= 3` / `Received: 1.5813443452229643`, line 300. Dark passes, and must: no one ink can fail 3:1 against a near-white _and_ a near-black surface, so this is watched in the palette the fault is a fault in. |
| the paint is waited for       | the `title` wait deleted, write held 3s  | **yes, both palettes** — `Expected: >= 0.05` / `Received: 0`                                                                                                                                                                                     |
| the paint wait is not vacuous | that wait written as `font-weight: 600`  | **yes** — the delayed run failed anyway, in 1.6s: every row carries a default priority now, so 600 is free                                                                                                                                       |

### One fixture repaired

`seedPlan` clicked `New project` directly. A create arms a rename that lands one
round trip after the table appears, and `create-project.ts` is the one place that
knows it — this file was written the day before that fixture existed and was the
one create site `d2024a3` did not reach. It now goes through `createProject`.
This closes a documented race rather than a red that was observed.

## Skipped or unavailable checks

- **`bin/h2puni-gate.sh` is not run.** It is the h2puni host gate and this work
  was done on a Mac; the per-project Nx targets it wraps (`test`, `lint`,
  `typecheck` for `fe-01` and `be-01`) were run individually and are in the table
  above. `format:check`, the secrets scan and the migration lint were **not**
  run here — CI runs all three on push.
- **The three reds above were not re-measured against `main` in this session.**
  The keyboard pair is documented in `AGENTS.md` as environmental; the
  `deps-cell` one is the coordinator's overnight measurement against `main`,
  quoted rather than repeated.
- **`fe-01:test` needs `TZ=UTC` on this machine**, which its Nx target now
  supplies (`TZ=UTC bunx vitest run` in `project.json`). Two cases in
  `plan-mermaid.test.ts` fail under `Europe/Kyiv` on a three-hour offset;
  pre-existing, unrelated, and neither touches a priority.
