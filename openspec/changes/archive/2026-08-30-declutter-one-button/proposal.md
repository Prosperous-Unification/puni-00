<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

`gantt-declutter` (#44) answered Dany's "remove arrows + other clutter" with two
different mechanisms: the arrows went behind a remembered switch, and the parent
ghost bars and unestimated assumed bars were removed outright. He read the
result and said what he had meant: "what i wanted is for arrows toggle to also
affect Unestimated QA ghost bars and Parent transparent bars. i want to
encompass all decluttering into one button."

So two of the three families are gone with no way back, and the one control on
the panel says `Arrows` while answering a question about the whole chart.

## What Changes

**One switch over three families of mark**

- From: `Arrows` gates the dependency elbows and heads alone; a parent's
  bracket and an unestimated slice's assumed bar are not drawn at all.
- To: one switch, labelled `Detail`, gates all three. Off — still the default —
  is exactly the chart #44 ships. On draws the arrows, the parent brackets and
  the assumed bars as they were drawn before #44, with the marks that follow
  them: the assumed bar's `?` label and `data-assumed` hook, the hand-off lines
  onto a slice that is now drawn, and the not-before caret on every row holding
  a date.
- Impact: non-breaking. Nothing is drawn at rest that is not drawn today.

**The preference is renamed, and the old key is dropped**

- From: `wbs.ganttArrows`, holding an answer about the arrows.
- To: `wbs.ganttDetail`, holding an answer about every gated mark.
  `wbs.ganttArrows` is **removed** on read and never read as an answer: it
  answered a smaller question, and carrying a stored `true` across would draw
  two families of mark its owner never asked for.
- Impact: a reader who had asked for arrows asks once more. #44 is one day old
  and its default was off.

## Non-Goals

- No third state, no per-family switches, no menu. One button is the ask.
- No re-routing or restyling of any restored mark. What comes back is what #44
  deleted, verbatim.
- No schedule, engine, wire or be-01 change. `gantt-geometry.ts` already
  computes every bracket and assumed span; only the paint is gated.
- The preference is still per browser and still not part of the layout reset.

## Constraints

- Row alignment is load-bearing: the chart's row `N` stands beside the plan's
  row `N`, in **both** states. The `pixels` job measures it.
- The lazy initialiser stays: an effect would flash the wrong chart for a frame.
  The `setItem` stays outside the state updater — a review fix on #44.
- Absence assertions are vacuous against a chart that draws nothing, so every
  one of them stands beside a presence assertion on the same render.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `gantt-view`: one switch gates the arrows, the parent brackets and the
  unestimated assumed bars together, under a renamed key.

## Domain Terms

none new. `ghost bar` and `assumed span` are drawing descriptions, as they were.

## Decisions Recorded

none. One deviation worth naming: the old `wbs.ganttArrows` answer is **dropped
rather than migrated**. Migrating it would open Wednesday's chart with parent
brackets and uncosted bars on it for anybody who pressed `Arrows` on Tuesday —
the clutter he asked to be rid of.

## Impact

`apps/fe-01` only: `gantt-panel.tsx`, its jsdom tests, `e2e/gantt.spec.ts`.
