<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Half the table's data hides behind its at-rest faces: a folded role column
shows one figure where three points, a final and an assignee live; a depends
chip shows `010` where the work item's name is what a reader wants. Those
cells answer a hover with a native `title` — one line, incomplete, a second
late. And the one instant answer the table has, the Name cell's preview,
opens a rendered document over the rows below every time a mouse crosses the
column.

## What Changes

**Folded role column cell**

- From: `4.8 · Ka…` with a delayed one-line `title`
- To: instant hover card with the whole of it — role name, the three points,
  the final figure, the assignee's full name, and the assumed-phase state
- Impact: non-breaking

**Depends cell**

- From: chips showing numbers only; no hover data
- To: instant hover card listing every dependency as number and full name
- Impact: non-breaking

**Truncated assignee beside a folded figure**

- From: delayed `title` with the full name
- To: covered by the folded role cell's card
- Impact: non-breaking

**The Name cell's Hover preview**

- From: opens from a hover anywhere on the cell
- To: opens from a small notes marker at the cell's right edge, drawn only on
  a row that has notes; the cell body opens nothing
- Impact: non-breaking; supersedes `name-title-body`'s non-goal "any
  affordance marking this row has notes at rest" — the marker is one

**What keeps its native `title`**: header help text, and controls whose title
names an action (fold/unfold, remove).

## Non-Goals

- No new data: every card shows what the row already holds on the client.
- The card face (mobile) — no hover exists there.
- No hover-intent delay, follow-cursor, or flip positioning.
- The compact cards keep the whole cell as their trigger; only the big
  preview moves behind a marker, which is not a button: no click, no focus,
  no place in the grid.
- Schedule cells, whose numbers are whole at rest.

## Constraints

- Instant means the preview's pattern: state set on `mouseenter`, no timeout.
  One card open at a time per table, from one hovered-cell state.
- `columns` must not grow a dependency that changes per keystroke (the
  remount landmine); hovers read through `live`.
- Cards must not intercept the mouse on the row beneath.
- `POPOVER_COLUMNS` governs which `<td>`s may overflow; the cards' columns
  are named there deliberately.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: folded role cells and depends cells answer hover instantly
  with what they fold away; the Name cell's preview opens from its notes
  marker

## Domain Terms

- Hover card (new; the Name cell's Hover preview is one)
- Notes marker (new; the Name cell's preview trigger)

## Decisions Recorded

none

## Impact

- `apps/fe-01` only: a hover-card primitive, `wbs-table.tsx` (Name cell,
  folded role cell, depends cell), unit tests, `e2e` browser specs.
