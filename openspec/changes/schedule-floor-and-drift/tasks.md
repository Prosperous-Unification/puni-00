<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Watch the defects fail

- [x] 1.1 Un-skip the two `DEFECT` tests PR #34 left in
      `work-item.service.test.ts` and watch each fail on the documented wrong
      output — `floors every leaf beneath a parent told not to start before a
day` on `Expected "2026-08-12" Received "2026-08-06"`, `ends a chain of
PERT estimates on the day the estimates add up to` on `Expected
"2026-08-28" Received "2026-08-31"`. Watched 2026-08-10.

## 2. Parent floors reach leaves

- [x] 2.1 `schedule.ts`: expand `notBefore` down the tree via
      `TreeIndex.leavesUnder`, each leaf taking `Math.max` of its own floor
      and every ancestor's — test: the un-skipped floor test goes green;
      negative: the pre-fix watch in 1.1
- [x] 2.2 Composition tests in `schedule-shapes.test.ts`: `carries a
grandparent's floor two levels down to the leaf` (three tiers, the
      grandparent's floor the latest, bound `notBefore`) and `composes
ancestor floors with a dependency, each leaf keeping its own maximum`
      (different floor per level, a later dependency named `predecessor`, a
      sibling's stricter own floor surviving); negative: `Math.max` replaced
      with a bare copy-down — both tests watched failing (`earliestStart: 3`
      for 6; `L2` at `earliestStart: 5` for 9), 2026-08-10; the stricter
      child's floor is listed first in the map so iteration order cannot hide
      the fault. `Proof:` beside the expansion.

## 3. Drift snapped at the calendar boundaries

- [x] 3.1 `@wbs/domain` `snapWorkdays` (window 1e-9), applied in
      `addWorkdays`' floor and `datesOf`'s ceil — test: the un-skipped chain
      test goes green; unit cases in `workday.test.ts` (`snapWorkdays`
      passthrough and snap, drifted `addWorkdays` both signs, genuine 14.9)
- [x] 3.2 Production-path boundary tests in `work-item.service.test.ts`: both
      signs of drift asserted on `startsOn` **and** `endsOn` (`holds the
calendar steady when a chained finish drifts above/below the whole
day`), and `keeps a genuine fraction just shy of a boundary as real
work`; negative: the snap window widened to 0.5 — the genuine-fraction
      tests watched failing (successor `startsOn` `"2026-08-31"` for
      `"2026-08-28"`; unit case `Received: 15` for 14.9), 2026-08-10.
      `Proof:` on `snapWorkdays`.

## 4. Review-flagged test cleanups

- [x] 4.1 The sweep's chain test stops pinning `15.000000000000002` and
      asserts the bound the snap window rests on: drift nonzero, below 1e-9
- [x] 4.2 The two parent-edge shape tests renamed/commented honestly —
      `canDepend` refuses `ancestor` at the write path (`refuses an ancestor
more than one level up, in both directions`, already present in
      `dependency.test.ts`); the engine's `/cycle/` throw is a backstop on the
      `L → L` self-loop `expandToLeaves` makes of the stored edge

## 5. Gate

- [x] 5.1 `bunx nx format:check --all`, `bunx nx run-many -t test lint
typecheck --parallel=2` and `bunx @fission-ai/openspec@1.3.0 validate
--all --json` green; results and the failure-proof table in `verify.md`
