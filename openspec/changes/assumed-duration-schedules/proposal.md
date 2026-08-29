<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

An unestimated slice takes zero days in the engine. So an unestimated work item
finishes where it starts, everything depending on it starts immediately, and a
plan that is half estimated draws an order nobody believes — the unestimated
work is free and the chart says the project ships on the estimated work alone.

The chart already knows better: **assumed span** draws an unestimated bar across
two workdays "so that a slice nobody has sized reads as work of unknown length
rather than as nothing at all". That knowledge stops at the paint. Dany's call
(2026-08-29): the engine should assume it too, so the **order** is right even
before anything is estimated.

## What Changes

**An unestimated slice takes two workdays in the schedule.** One constant, moved
to `libs/domain` so the engine and the drawing read the same number instead of
agreeing by coincidence. Dependencies, floors, leveling and capacity all see it:
an unestimated slice now occupies its assignee and its team's pool for two days,
because pretending otherwise is the fault this change is about.

**Nothing becomes estimated.** No estimate row is written. The Days column stays
blank, the roll-up stays blank, the readiness badge still counts the gap, and
the export still says unestimated. An assumed duration is the schedule's
assumption, never the project's data.

**The bars still say they are guesses.** The dotted translucent outline, the `?`
and the `data-assumed` hook are unchanged — but their width is now the schedule's
number rather than the drawing's own, so a bar and the date columns beside it
finally agree.

## Non-Goals

- Making the two days configurable. It is a constant, as the drawing's was.
- Writing estimates, changing the roll-up, or changing what "estimated" means —
  a slice with an assumed duration is still unestimated everywhere it is
  counted.
- Changing the `Detail` switch, which decides whether assumed bars are _drawn_
  at all. That question is untouched.

## Capabilities

### Modified Capabilities

- `wbs-domain`: what an unestimated slice occupies in a schedule.

## Domain Terms

Assumed duration (new); Assumed span (reworded); Slice; Estimate gap.

## Impact

`libs/domain` gains the constant; `schedule.ts`'s slice duration; capacity and
leveling see non-zero widths for unestimated slices; `gantt-geometry.ts` reads
the shared constant; `CONTEXT.md`'s **Assumed span**; the identity fixtures.
