<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The shared helpers

- [x] 1.1 `workday.test.ts`: cases for `firstWorkdayOf`, `lastWorkdayOf`,
      `wholeDaysCovering` — both drift signs (8.999999999999998 → 9-side,
      15.000000000000002 → 15-side), a genuine fraction (3.5, 14.9), and
      `lastWorkdayOf`'s zero-length clamp — watched red (helpers absent),
      then `workday.ts` grows the three, each snapping before its discrete
      step, and the file goes green

## 2. The calendar scale snaps

- [x] 2.1 `gantt-geometry.test.ts`: `startOf` of a drifted 8.999999999999998
      answers `startOf(9)`, `endOf` of a drifted 15.000000000000002 answers
      `endOf(15)`, and a genuine 3.5 keeps its fraction — watched red, then
      `calendarScale` reads through `snapWorkdays`/`firstWorkdayOf` and goes
      green

## 3. The panel reads through the helpers

- [x] 3.1 `gantt-panel.test.tsx`: a fixture whose slices carry drifted offsets
      (start 2.9999999999999996, finish 5.000000000000001) renders the same
      days the fixture's be-01 dates claim — `data-last-day` joined to the
      axis equals the End column's day, the hover sentence names 13→14 Aug
      and neither drifted neighbour — watched red, then `spanWords` and
      `data-last-day` go through `firstWorkdayOf`/`lastWorkdayOf` (the local
      copy deleted) and it goes green
- [x] 3.2 `gantt-panel.test.tsx`: a drifted horizon (6.000000000000001) draws
      exactly the six workday-axis cells of 6, and the drifted calendar plan
      keeps its eight cells — watched red, then both axis builders count
      through `wholeDaysCovering` and it goes green

## 4. be-01 on the same helpers

- [x] 4.1 `datesOf` refactored onto `firstWorkdayOf`/`lastWorkdayOf` — a
      mechanical move of the same arithmetic, `work-item.service.test.ts`'s
      drift and fraction suite watched green before and after

## 5. The engine's drifted float, pinned

- [x] 5.1 `schedule-shapes.test.ts`: a 23/6-day row floored at `notBefore` 13
      in a plan otherwise done by day 3 — float negative, magnitude below
      1e-9, `critical: false`, the row the project's last — commented as
      pinned-not-endorsed; non-vacuity watched by dropping `hasQueues` from
      the tight-path condition and seeing the pin fail on float 0

## 6. Gate and proofs

- [x] 6.1 Fault table run: each helper's snap skipped, each fe site reverted
      to its inline rule — named tests watched failing per site class;
      results in `verify.md`
- [x] 6.2 `bunx nx format:check --all`, `bunx nx run-many -t test lint
typecheck --parallel=2` and `bunx @fission-ai/openspec@1.3.0 validate
--all --json` green; results in `verify.md`

## 7. Cross-review fixes (2026-08-11)

- [x] 7.1 be-01 `work-item.service.test.ts`: a zero-length row's dates on the
      production path, at a whole start and at a fractional one — the clamp
      dropped at `datesOf`'s call site and watched failing there **alone**
      (71 other cases in the file green with it gone), then the clamp watched
      reading the start a day up and only the fractional half failing
- [x] 7.2 `calendarAxis` counts with `Math.ceil(horizon)` again, the invariant
      written where the helper call was: R5 does not ship a changed check
      whose absence no test can observe, and this one's injection stayed
      green across all 1078 fe-01 cases. `workdayAxis` keeps
      `wholeDaysCovering`, where the drifted horizon is real
