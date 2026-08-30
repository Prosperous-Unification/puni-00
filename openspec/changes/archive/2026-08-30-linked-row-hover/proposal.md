<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-08-14: "on hover over gantt chart item i want to highlight (1) the
corresponding line entry on the left of gantt chart (2) the entry in the table."

The plan is drawn twice and neither drawing answers anything about the other.
Which of sixty rows a bar is _for_ means counting rows in a 176px label column
against a table that scrolls on its own axis. The linked scroll fixed the coarse
half — the two faces start on the same row — and left this one open.

Agreed both ways in the interview: hovering a table row asks the same question
from the other side.

## What Changes

**A pointed row, and each face lights the other's answer** — a bar or row label
lights the plan renderer's row, and a plan renderer row lights the panel's label
and a band across its Gantt row. One work item at a time. Instant, in the `row
light` every other pointed row already uses (`--grid-dep-lit`): there is one
pointer, so two causes can never be on screen at once and one tint is never
ambiguous.

The asymmetry is load-bearing: a row the pointer rests on is already tinted, and
lighting it again makes the banded-hover rule unmatchable and stops the stripe
moving at all. `verify.md` has the four browser assertions that caught it.

**A bar's focus lights it too.** Bars already take the keyboard. `depHover` /
`depFocus` shipped as a pair on the reasoning that a hover-only answer is no
answer without a mouse; declining that here would contradict it.

## Non-Goals

- Nothing scrolls to a pointed row.
- The bar's 220ms hover card and its timing are untouched.
- A hovered bar does not light its row's other bars — the row is the answer.
- No second tint, no new `--grid-*` token, no be-01 read.

## Constraints

- `columns` keeps its two deps (`roles`, `unfoldedRoles`) — landmine 1. A hover
  may re-render the table; it must never remount a cell and take the focus.
- `styles.css`'s banded-hover rule holds the lit rules up **by predicate**, not
  by source order: anything added must join its `:not()` chain.
- `GanttBar` carries no `workItemId`; `rowIdAt(rowIndex)` is the join.
- R5: the tint is a painted fact. jsdom watched `dep-hover-highlights`' rule go
  missing and stayed green; the `pixels` job caught it. Browser, not jsdom.

## Capabilities

- `wbs-domain`
