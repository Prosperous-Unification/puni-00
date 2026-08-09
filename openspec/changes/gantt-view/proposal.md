# The schedule becomes something you can look at

## Why

The engine places every slice — floors, floats, person-queues, a critical path —
and the table shows three narrow columns of the projection. Nobody can see _why_
a row starts when it does, who is waiting on whom, or where the critical path
runs. This is `G gantt-view` in
`docs/plans/2026-08-08-phases-gantt-mobile-roadmap.md`, the last of the nine
changes and the one S2's `boundBy` / `resourcePredecessorId` were built for.

## What Changes

**Slices go on the wire.** The tree payload gains `slices`: each scheduled slice
with its engine numbers, its binding floor and its resource predecessor, under
the engine's own ids. Today `tree()` computes them and throws them away.

**A Gantt panel, toggled from the toolbar.** It sits under the plan and mirrors
the shown rows — same order, same expansion, either renderer. Leaves draw one
bar per slice; parents draw a summary bracket over their projection; dependency
arrows join work items; person links, drawn unlike them, come from
`resourcePredecessorId` and are never parsed from anything; not-before flags
mark manual dates; critical bars are tinted; hovering a bar names its binding
floor; clicking a bar or its label takes the plan to that row. Row labels hold
the left edge while the chart scrolls — on a phone too.

**The workday is the unit.** The SVG's user space _is_ workdays: viewBox width
equals the horizon, and every bar carries `data-start`/`data-finish` holding
engine numbers verbatim (codex #15, agy #14). Calendar labels print from the
same workday mapping the date columns use, finish following the ceil−1 rule, so
the panel and the Start/End columns cannot disagree. Weekend compression is
exact because the axis holds no weekends.

## Non-Goals

- No editing from the chart: no drag-to-reschedule, no resizing, no drawing
  dependencies. Read-only is Dany's answered Q5.
- No new schedule math. Engine numbers are drawn, never recomputed or nudged.
- No holidays, zoom presets, chart export, or gantt library.

## Constraints

- The wire change is additive; every existing payload consumer and every
  existing test passes unedited.
- Two-layer proof (codex #15): jsdom asserts user-space `x`/`width` strictly
  equal engine numbers; only a real browser judges on-screen alignment after
  scaling, pinned labels and scroll — the R5 #14/#15 fault class lives there.
- `d3-scale` only if hand-rolled scales get fiddly, and logged if so.

## Capabilities

### Modified Capabilities

- `wbs-domain`: slices cross the wire, and the schedule is drawn, not only
  projected into columns.

## Domain Terms

gantt panel, workday axis, horizon, bar, summary bracket, person link,
not-before flag

## Decisions Recorded

none — the coordinate contract's alternatives and rationale are in the
roadmap's disposition table (codex #15 / agy #14).

## Impact

be-01: `tree()` keeps `planned.slices`, serialised. fe-01: toolbar toggle,
`gantt-panel.tsx` + pure `gantt-geometry.ts`, workday helpers shared from
`libs/domain`, `e2e/gantt.spec.ts`. No migration, no new dependency.
