<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Cloud case A1, watched live on dev at `94ed488`. A plan of three PERT finals —
the trios 0/8/13, 3/4/6 and 0/3/8 — chained end to end sums to exactly 15
working days and accumulates to 15.000000000000002, and a fourth row of a flat
15 days runs beside it. All four rows end the project and none can slip. The
table showed one of them red.

`float` is `latestStart - earliestStart` and `critical` is that difference
`=== 0`, both on raw doubles. Every row that ends a drifted project inherits
the drifted bit, so the subtraction gives ±1.8e-15 and the exact comparison
says "has slack". The Slack column rounds to a tenth of a day, so the same row
printed `0` — no slack — with no `critical` beside it and no ring on its Gantt
bar. Across the identity corpus of 1000 generated plans this is 1946 drifted
rows, 1598 of which are the wrong colour.

The calendar boundary already refuses to read a drifted bit as a day
(`snapWorkdays`, 1e-9, `schedule-floor-and-drift`). The critical/float
classification never learned the same rule.

## What Changes

**Slack is snapped before it is reported and before it decides `critical`.**
A new `slackOf` in `schedule.ts` puts `latestStart - earliestStart` through
`@wbs/domain`'s `snapWorkdays` — the same 1e-9 window the calendar uses — and
normalises `-0`. Applied where a slice's schedule is built and where a leaf's
tiling endpoints are read; the aggregated (person-split) branch needs no snap
of its own, since the least of already-snapped floats is one of them.

**The identity differential states the one difference.** The 2000-plan
comparison against the pre-slice engine now snaps the oracle's slack the same
way, with a copied two-line rule rather than an import, and a new case asserts
the corpus really contains rows the snap moves.

**The pinned defect test is flipped.** `schedule-shapes.test.ts` held the
drifted negative float as a known defect so the day it changed would be
deliberate. It is now the endorsed answer, and says so.

## Non-Goals

- No change to `latestStart`, `latestFinish` or any date: they stay verbatim.
- No change to the leveller's float-priority rule, which ranks unsnapped
  critical-path floats and must keep separating rows the plan can tell apart.
- No widening of the tight-path rule in `lateTimes`, still scoped to plans
  with resource queues.

## Constraints

- The window must not swallow real slack: a sixth of a day is the smallest
  fraction a PERT final can carry, eight orders of magnitude above 1e-9, and a
  negative test proves a wide window eats it.

## Capabilities

### Modified Capabilities

- `wbs-domain`: a row that cannot slip is reported as critical, drift and all.

## Domain Terms

none new

## Decisions Recorded

none

## Impact

be-01 (`schedule.ts`) and the three schedule test files beside it. No
migration, no API shape change, no fe-01 change — the wire field is the same
number, minus the drift.
