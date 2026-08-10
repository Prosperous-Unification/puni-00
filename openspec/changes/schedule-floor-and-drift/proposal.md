<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

PR #34's adversarial sweep left two skipped tests marked `DEFECT`, both watched
failing 2026-08-10.

One: a `startNoEarlierThan` written on a parent is accepted, stored, echoed
back — and constrains nothing. `tree` puts every floored row into the
`notBefore` map, but the engine read the map for leaf ids alone. The mirror
feature, a dependency declared on a parent, expands to every leaf beneath it;
a floor declared on a parent reached nothing, and nothing told the writer.

Two: chained fractional PERT finishes accumulate double error — three
estimates summing to exactly 15 working days arrive as 15.000000000000002 —
and the calendar boundary read the drift as work: `datesOf`'s bare `Math.ceil`
minted a sixteenth day (a Monday, three calendar days late on screen), and
`addWorkdays`' bare `Math.floor` reads 8.999999999999998 as day 8, starting a
row a day early.

## What Changes

**Parent floors expand to leaves.** `schedule.ts` walks `notBefore` through
`TreeIndex.leavesUnder`, each leaf keeping the **latest** of its own floor and
every ancestor's — `Math.max`, never a copy-down, so a parent's earlier floor
cannot overwrite a child's stricter own. A floor stays a floor: a later
dependency still wins and is still the named bound.

**Drift is snapped at the discrete calendar boundaries.** `snapWorkdays` in
`@wbs/domain`: a value within 1e-9 of a whole day is that whole day; anything
further is real work, untouched. Applied in `datesOf`'s ceil and
`addWorkdays`' floor — both boundaries, not an ad-hoc tweak to ceil alone —
and nowhere else: the engine's numbers stay verbatim on the wire.

**Test cleanups from the same review.** The sweep's chain test stops pinning
the platform's exact drifted double and asserts the bound the snap window
rests on; the two parent-edge shape tests say honestly that `canDepend`
refuses `ancestor` at the write path and the engine's cycle throw is a
backstop on a self-loop artifact of `expandToLeaves`.

## Non-Goals

- No change to the engine's arithmetic or wire numbers — anchoring, floats and
  fractional slices are reported as computed.
- No refusal of `startNoEarlierThan` on a parent: it now means what a
  dependency on a parent means.
- fe-01's Gantt (`lastWorkdayOf`, `spanWords`) repeats the bare ceil/floor;
  recorded as a finding, not fixed here.

## Constraints

- The snap window must sit far below any real estimate fraction (a sixth of a
  day) and far above plan-scale accumulated error; a negative test proves a
  wide window swallows real work.

## Capabilities

### Modified Capabilities

- `wbs-domain`: parent floors reach leaves; calendar days stop drifting.

## Domain Terms

none new

## Decisions Recorded

none

## Impact

`libs/domain` (`workday.ts`), be-01 (`schedule.ts`, `work-item.service.ts`),
tests beside them. No migration, no API shape change.
