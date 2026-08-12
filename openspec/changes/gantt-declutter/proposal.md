# gantt-declutter

## Why

Dany read the chart on a real plan and could not: "remove arrows + other clutter
like transparent bars of parent items and unestimated QA bars." Sixty elbows
bury the bars they join, which is why `gantt-polish` gave them a switch — and
the switch still opens on. A parent's ghost bar restates a span its children
already draw. And a leaf nobody has estimated draws a dashed bar per role, so a
fresh 10-leaf plan draws 20 bars for 10 rows and half of them are guesses
wearing full labels. The chart is least readable on the plan a reader most needs
it for: a new one.

## What Changes

**Dependency arrows**

- From: every arrow is drawn on open; the switch hides them for that mount only.
- To: the switch opens **off**, and its answer is remembered across reloads.
- Impact: non-breaking; person links and not-before carets are untouched.

**Parent rows**

- From: a parent draws a translucent ghost bar over its projection, and a tick
  where that projection has no days.
- To: a parent's row draws **nothing**. The row stays on the chart, at the same
  index and height, beside its table row.
- Impact: non-breaking; the label rail still names every parent.

**Unestimated slices**

- From: a slice nobody estimated draws a dashed bar two workdays wide, `?` on it.
- To: it draws **nothing**. A leaf with some roles estimated draws those roles'
  bars alone; a leaf with none draws an empty track.
- Impact: non-breaking. The chart stops being where unestimated work is found;
  the plan's own `?` cells are, and `unestimated-navigator` counts them.

**Not-before carets**

- From: a caret is drawn on every row that carries a start date.
- To: only on a row that draws a bar — a caret is placed in the band above the
  bar its row starts with, so on a row that now draws nothing it would float
  over an empty track.
- Impact: follows from the two removals above; no row that keeps a bar loses
  its caret.

## Non-Goals

- No re-routing or restyling of the arrows. Off by default is the whole answer.
- No new mark in place of what is removed — no hairline bracket, no row
  shading, no "not estimated" words on the chart.
- No schedule, engine, wire or be-01 change. Every removal is in the paint;
  `gantt-geometry.ts` keeps every number it computed, including the bracket
  spans and assumed widths nothing draws any more — the only edits to it are
  doc comments that said "drawn" of marks the panel no longer draws.
- The arrows preference is not part of the layout reset.

## Constraints

- Row alignment is load-bearing: chart row `N` stands beside table row `N`, and
  the browser gate measures it. Removing a parent's mark must not move its row.
- The `pixels` job measures these marks in Chromium; three of its cases assert
  what this change removes.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `gantt-view`: parent rows draw no mark; unestimated slices draw no bar; the
  arrows switch defaults off and is remembered.

## Domain Terms

none — `ghost bar` and `assumed span` were drawing descriptions, and both marks
are gone.

## Decisions Recorded

none. One deviation worth naming: the remembered arrows answer is keyed per
**browser** (`wbs.ganttArrows`), not per project like the panel height beside
it. Arrows on or off is a preference about a feature; a panel height is one
plan's share of one screen. Two tabs open at once diverge until each is
reloaded: the answer is read once on mount and written on the press, with no
`storage` listener, so a toggle in one tab does not reach the other.

## Impact

`apps/fe-01` only: `gantt-panel.tsx`, its jsdom tests, `e2e/gantt.spec.ts`.
