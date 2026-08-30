# verify — `gantt-calendar-snap`

Branch `change/gantt-calendar-snap`, off `main` @ `e3eae84` (PR #36's merge).
`libs/domain`, be-01 and fe-01; no migration, no API shape change, no engine
arithmetic change.

## The gate

Run from the repo root on this branch. The figures below are the 2026-08-11
re-run, after the cross-review fixes; the 2026-08-10 run they replace differed
only in be-01's count (581, before the zero-length row test).

| Command                                                 | Result                                                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | green, exit 0                                                                                                                       |
| `bunx nx run-many -t test lint typecheck --parallel=2`  | green — 21 projects, 63 tasks; domain: **40 tests** in 2 files; be-01: **582 tests** in 52 files; fe-01: **1078 tests** in 45 files |
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
panel file three times more, all green. `gw-01:test` was marked flaky again on
the 2026-08-11 re-run, the run itself green.

## What moved

- `@wbs/domain` `workday.ts`: `firstWorkdayOf` (snap, then floor),
  `lastWorkdayOf` (snap, then `ceil − 1`, clamped to the start's day),
  `wholeDaysCovering` (snap, then ceil) — the three discrete calendar
  readings, each snapping before its discrete step.
- be-01 `work-item.service.ts` `datesOf`: refactored onto
  `firstWorkdayOf`/`lastWorkdayOf` (same arithmetic, now shared; the drift
  and fraction suite green before and after).
- fe-01 `gantt-panel.tsx`: the local `lastWorkdayOf` copy deleted;
  `spanWords` reads `firstWorkdayOf`/`lastWorkdayOf`; `workdayAxis` counts
  cells with `wholeDaysCovering`. `calendarAxis` keeps a bare `Math.ceil` and
  says why — see "no reachable negative" below.
- fe-01 `gantt-geometry.ts` `calendarScale`: `startOf` snaps before its floor
  and carries the snapped fraction; `endOf` decides whole-vs-fractional on
  the snapped value.
- be-01 `schedule-shapes.test.ts`: the drifted negative float past a
  `notBefore` floor pinned (see below), not endorsed, not fixed.
- be-01 `work-item.service.test.ts`: the clamp asserted on the production
  path, at a whole start and a fractional one — added 2026-08-11, after the
  cross-review found only the domain helper's own test covering it.

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
was watched — 2026-08-10 unless dated otherwise, locally, each fault then
reverted and the suite watched green (final gate above).

| Injected fault                                                                                                   | Observed                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firstWorkdayOf` skips the snap (bare `Math.floor(offset)`)                                                      | domain `reads drift on either side of a whole day…` failed; be-01 `holds the calendar steady when a chained finish drifts below the whole day` failed, successor `startsOn "2026-08-20"` for `"2026-08-21"`; fe `reads a drifted schedule as the same days be-01 prints` failed, the sentence losing `13 Aug → 14 Aug` |
| `lastWorkdayOf` skips the snap (bare `Math.ceil(finish) - 1`)                                                    | domain `reads drift on either side…` failed; be-01 `ends a chain of PERT estimates…` and `…drifts above the whole day` failed, `endsOn "2026-08-31"` for `"2026-08-28"`; fe drifted test failed, `data-last-day` `'5'` for `'4'`                                                                                       |
| `lastWorkdayOf` drops the `- 1` (the clamp arithmetic moved from fe-01)                                          | four domain cases failed; fe `reads the same dates under a bar as the row's Start and End cells` failed on `expected '2026-08-17' to be '2026-08-14'` — the 2026-08-09 fault, re-watched against the shared helper                                                                                                     |
| `wholeDaysCovering` skips the snap (bare `Math.ceil(span)`)                                                      | domain `counts the cells a span needs…` failed; fe `does not mint an axis cell from a drifted horizon` failed, `['0' … '6']` for `['0' … '5']`                                                                                                                                                                         |
| fe site bypasses the helper: `spanWords` floors inline before `addWorkdays`                                      | fe `reads a drifted schedule as the same days be-01 prints` failed alone — the sentence losing `13 Aug → 14 Aug` to a bare floor's 12 Aug                                                                                                                                                                              |
| `calendarScale.startOf` floors the raw offset (fraction `workday - whole`)                                       | geometry `reads a drifted whole offset exactly as the whole day it is` failed on `expected 10.999999999999998 to be 11`                                                                                                                                                                                                |
| `calendarScale.endOf` reads the raw offset (`!Number.isInteger(workday)`)                                        | same geometry test failed on `expected 21 to be 19` — a drifted whole finish handed the start reading, the far side of the weekend                                                                                                                                                                                     |
| **Pin non-vacuity**: tight-path scoping dropped (`hasQueues &&` removed in `lateTimes`)                          | the pin failed on `Expected: < 0, Received: 0` — the drifted float the test holds is gone the moment the rule covers every plan                                                                                                                                                                                        |
| **2026-08-11**, `datesOf`'s clamp wiring dropped (`lastWorkdayOf(0, timing.earliestFinish)`)                     | be-01 `keeps a zero-length row on its own start day, whole or fractional` failed **alone**, the whole-day gate's `endsOn` `"2026-08-10"` for `"2026-08-11"` — a row ending the day before it starts; the other 71 cases in the file passed with the clamp gone                                                         |
| **2026-08-11**, `datesOf`'s clamp reads the start a day up (`lastWorkdayOf(Math.ceil(timing.earliestStart), …)`) | the same test failed on the **fractional** gate, `expected "2026-08-12" to be "2026-08-11"`, the whole-day pair untouched — the half of that test the whole days cannot stand in for (the two chained-drift cases failed beside it)                                                                                    |

## The one injection with no reachable negative — resolved by deleting the check

`calendarAxis` counting with a bare `Math.ceil(horizon)` — the helper call
reverted in that one site — was injected and **the whole fe-01 suite stayed
green (1078 tests)**. It has to: the calendar axis's horizon is read off the
placed marks, and every path into it (`startOf`, `endOf`, bar widths,
brackets, flags) already snaps, so the value arriving there is exact or
genuinely fractional — there is no drifted input left for that one ceil to
misread.

The first draft of this change shipped the helper call anyway, on the argument
that one cell-count rule across both axes is worth a backstop. **That is the
shape R5 exists to refuse**, and the cross-review said so: an unproven changed
check is a claim. `T1 column-widths-drag` deleted a line for exactly this
reason one change earlier — the guard whose removal you cannot see.

**Resolution:** `calendarAxis` counts with `Math.ceil(horizon)` and the
invariant is written where the helper call was — the horizon it is handed came
through `calendarScale`, which snaps before every discrete step, so a
snap-aware ceil here would be protecting against an input that cannot arrive.
`workdayAxis` keeps `wholeDaysCovering`: there the horizon **is** the engine's
drifted numbers, and that fault was watched (table above). One rule for two
axes was never true of their inputs, so it is no longer claimed of their code.

Residual, stated rather than hidden: a bar's reach is `x + width`, and
`startOf(s) + (stopOf(…) − startOf(s))` is not bit-identical to `stopOf(…)`
for every double. No input reaching that expression today produces a horizon
whose ceil moves, and no test can be written that observes one; if such a case
is ever found, it is a fault in `placeGantt`'s arithmetic, to be fixed there
with its own negative — not absorbed by a snap on the axis that would hide it.

## CI on the review-fixes head

Run `31438407579` on `836ff18`, both jobs green: `gate` (the full
`test lint typecheck build` plus the secrets scan, migration lint and
`openspec validate`) and `pixels` (`bun run e2e`, one Chromium against the
real stack, 5m49s). That run is the proof for `build` and the only browser
evidence on this branch.

## Not verified

- **`build`** — forbidden on this host; CI's `gate` job above is the proof.
- **Anything run locally in a browser** — none was; the `pixels` job above is
  the whole of this branch's Chromium evidence.
- **The exact drifted float value** in the pinned engine test — deliberately:
  the bound is asserted (negative, `> -1e-9`), the platform's exact double is
  not the contract.
