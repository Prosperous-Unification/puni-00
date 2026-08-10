# verify — `gantt-calendar-snap`

Branch `change/gantt-calendar-snap`, off `main` @ `e3eae84` (PR #36's merge).
`libs/domain`, be-01 and fe-01; no migration, no API shape change, no engine
arithmetic change.

## The gate

Run from the repo root on this branch, 2026-08-10.

| Command                                                 | Result                                                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | green, exit 0                                                                                                                       |
| `bunx nx run-many -t test lint typecheck --parallel=2`  | green — 21 projects, 63 tasks; domain: **40 tests** in 2 files; be-01: **581 tests** in 52 files; fe-01: **1078 tests** in 45 files |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | green — 21 items, 21 passed, 0 failed                                                                                               |

**`build` was not run on this host** — the standing rule and the `PreToolUse`
hook forbid local builds here; CI's `checks` job runs the full
`test lint typecheck build` gate and is the proof for `build`. **No browser
was run and no browser claims are made** — the PR's `pixels` CI job is the
only Chromium evidence.

`nx` marked two tasks flaky on one gate run, both green on retry and on every
later run. `gw-01:test` was flaky in the previous change's gate too; nothing
here touches gw-01. The `fe-01:test` flake was 17 cases of
`wbs-table.test.tsx` (`types a three-level breakdown…` and its neighbours,
all on `expected [ '010' ] to deeply equal [ '010', '020' ]`) — a file this
change does not touch; the whole fe-01 suite was then run twice more and the
panel file three times more, all green.

## What moved

- `@wbs/domain` `workday.ts`: `firstWorkdayOf` (snap, then floor),
  `lastWorkdayOf` (snap, then `ceil − 1`, clamped to the start's day),
  `wholeDaysCovering` (snap, then ceil) — the three discrete calendar
  readings, each snapping before its discrete step.
- be-01 `work-item.service.ts` `datesOf`: refactored onto
  `firstWorkdayOf`/`lastWorkdayOf` (same arithmetic, now shared; the drift
  and fraction suite green before and after).
- fe-01 `gantt-panel.tsx`: the local `lastWorkdayOf` copy deleted;
  `spanWords` reads `firstWorkdayOf`/`lastWorkdayOf`; both axis builders
  count cells with `wholeDaysCovering`.
- fe-01 `gantt-geometry.ts` `calendarScale`: `startOf` snaps before its floor
  and carries the snapped fraction; `endOf` decides whole-vs-fractional on
  the snapped value.
- be-01 `schedule-shapes.test.ts`: the drifted negative float past a
  `notBefore` floor pinned (see below), not endorsed, not fixed.

## The pinned engine behaviour

`answers a drifted negative float when a notBefore floor ends the project —
pinned, not endorsed`: a 23/6-day row floored at day 13 in a plan otherwise
done by day 3 ends the project and reports `float ≈ -1.8e-15`,
`critical: false` — `lateTimes` reconstructs `latestStart` as
`projectFinish - days` and `(13 + 23/6) - 23/6` is not 13 in doubles; the
tight-path rule that catches exactly this is deliberately scoped to plans
with resource queues (`lateTimes`' own JSDoc). The test asserts the bound
(negative, magnitude below the 1e-9 snap window), never the exact double.

## Failure-proof table

Every fault injected on this change, the file it was injected into, and what
was watched — all 2026-08-10, locally, each fault then reverted and the suite
watched green (final gate above).

| Injected fault                                                                          | Observed                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firstWorkdayOf` skips the snap (bare `Math.floor(offset)`)                             | domain `reads drift on either side of a whole day…` failed; be-01 `holds the calendar steady when a chained finish drifts below the whole day` failed, successor `startsOn "2026-08-20"` for `"2026-08-21"`; fe `reads a drifted schedule as the same days be-01 prints` failed, the sentence losing `13 Aug → 14 Aug` |
| `lastWorkdayOf` skips the snap (bare `Math.ceil(finish) - 1`)                           | domain `reads drift on either side…` failed; be-01 `ends a chain of PERT estimates…` and `…drifts above the whole day` failed, `endsOn "2026-08-31"` for `"2026-08-28"`; fe drifted test failed, `data-last-day` `'5'` for `'4'`                                                                                       |
| `lastWorkdayOf` drops the `- 1` (the clamp arithmetic moved from fe-01)                 | four domain cases failed; fe `reads the same dates under a bar as the row's Start and End cells` failed on `expected '2026-08-17' to be '2026-08-14'` — the 2026-08-09 fault, re-watched against the shared helper                                                                                                     |
| `wholeDaysCovering` skips the snap (bare `Math.ceil(span)`)                             | domain `counts the cells a span needs…` failed; fe `does not mint an axis cell from a drifted horizon` failed, `['0' … '6']` for `['0' … '5']`                                                                                                                                                                         |
| fe site bypasses the helper: `spanWords` floors inline before `addWorkdays`             | fe `reads a drifted schedule as the same days be-01 prints` failed alone — the sentence losing `13 Aug → 14 Aug` to a bare floor's 12 Aug                                                                                                                                                                              |
| `calendarScale.startOf` floors the raw offset (fraction `workday - whole`)              | geometry `reads a drifted whole offset exactly as the whole day it is` failed on `expected 10.999999999999998 to be 11`                                                                                                                                                                                                |
| `calendarScale.endOf` reads the raw offset (`!Number.isInteger(workday)`)               | same geometry test failed on `expected 21 to be 19` — a drifted whole finish handed the start reading, the far side of the weekend                                                                                                                                                                                     |
| **Pin non-vacuity**: tight-path scoping dropped (`hasQueues &&` removed in `lateTimes`) | the pin failed on `Expected: < 0, Received: 0` — the drifted float the test holds is gone the moment the rule covers every plan                                                                                                                                                                                        |

## The one injection with no reachable negative, named

`calendarAxis` counting with a bare `Math.ceil(horizon)` — the helper call
reverted in that one site — was injected and **the whole fe-01 suite stayed
green (1078 tests)**. It has to: the calendar axis's horizon is read off the
placed marks, and every path into it (`startOf`, `endOf`, bar widths,
brackets, flags) already snaps, so the value arriving there is exact or
genuinely fractional — there is no drifted input left for that one ceil to
misread. The site still calls `wholeDaysCovering` because the cell count is
one rule with the workday axis (where the drifted horizon is real and the
fault **was** watched), and the code comment on `calendarAxis` names this
file for why that call is a backstop rather than an independently observable
guard. No `Proof:` line claims otherwise.

## Not verified

- **`build`** — forbidden on this host; CI's `checks` job is the proof.
- **CI itself and the `pixels` browser job** — recorded on the PR after push,
  not here.
- **The exact drifted float value** in the pinned engine test — deliberately:
  the bound is asserted (negative, `> -1e-9`), the platform's exact double is
  not the contract.
