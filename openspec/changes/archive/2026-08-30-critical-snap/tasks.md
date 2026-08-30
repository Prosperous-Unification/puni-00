<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Watch A1 fail

- [x] 1.1 A regression test in `schedule-shapes.test.ts` for case A1's exact
      shape — a 45/6 + 25/6 + 20/6 chain accumulating to 15.000000000000002
      beside a flat 15-day row, every one of the four ending the project —
      watched failing on `critical: false` with a float of
      `8.881784197001252e-16` on `chain-a`; 2026-08-11. The finish is asserted
      still drifted, so a future engine that stops drifting cannot leave this
      test green about nothing.

## 2. Snap the slack

- [x] 2.1 `slackOf` in `schedule.ts`: `snapWorkdays(latestStart -
earliestStart)` at the domain's 1e-9 window, `-0` normalised. Read where a
      slice's schedule is built (`float`, `critical`) and where a leaf's
      tiling endpoints are projected; the aggregated branch keeps
      `Math.min` over already-snapped slice floats and `some(critical)` —
      test: 1.1 goes green; negative: the snap dropped, four tests failed
      (1.1, the floor test, both differentials), and the `-0` normalisation
      dropped, the floor test failed alone on `Expected: 0 Received: -0`.
      `Proof:` on `slackOf`.
- [x] 2.2 Negative on the production path for the window itself: `keeps a
sixth of a day of real slack, and the row that has it out of the red` —
      a diamond whose short branch has exactly 1/6 day of room; negative:
      `DRIFT` widened to 0.5, watched failing on `Expected: false Received:
true` (the colour) and on the float with that assertion removed.

## 3. Flip the pin

- [x] 3.1 `answers a drifted negative float when a notBefore floor ends the
project — pinned, not endorsed` becomes `reports no float on a row a
notBefore floor stands at the project finish`: float 0, critical true.
      Its comment records that it guarded the defect until this change and
      guards the fix now, and asserts `latestStart` is still drifted so the
      snap is what the green is coming from.

## 4. State the one difference in the differential

- [x] 4.1 `schedule-identity.test.ts`: `expectSameSchedule` snaps the oracle's
      slack and derives its `critical` from the snapped value, through a
      two-line `snappedSlack` **copied** rather than imported — a differential
      that asks the code under test what the answer should be cannot see that
      code change. Every other field stays `toBe`-exact.
- [x] 4.2 `holds plans the snap actually moves, so the comparison is not the
old one in disguise`: counts the corpus rows whose raw and snapped slack
      differ (1946) and the subset that change colour (1598), both asserted
      nonzero rather than pinned to the generator's exact figures.

## 5. Gate

- [x] 5.1 `bunx nx format:check --all`, `bunx nx run-many -t test lint
typecheck --parallel=2` and `bunx @fission-ai/openspec@1.3.0 validate
--all --json` green; results and the failure-proof table in `verify.md`.
      `build` is CI's — it is forbidden on this host.
