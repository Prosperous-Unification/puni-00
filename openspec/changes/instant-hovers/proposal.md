<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Half the table's data hides behind its at-rest faces: a folded role column
shows one figure where three points, a final and an assignee live; a depends
chip shows `010` where a work item's name is the thing a reader wants; a
truncated assignee shows `Ka…`. Today those cells answer a hover with a native
`title` tooltip — one line, incomplete, and a second late. The Name cell just
learned the better answer (its Hover preview is instant and whole); the rest
of the row should answer the same way.

## What Changes

**Folded role column cell**

- From: `4.8 · Ka…` with a delayed one-line `title` (assignee name, or the
  fold/unfold help)
- To: instant hover card with the whole of it — role name, the three points
  (optimistic / realistic / pessimistic), the final figure, the assignee's
  full name, and the assumed-phase state when it applies
- Impact: non-breaking

**Depends cell**

- From: chips showing numbers only; no hover data
- To: instant hover card listing every dependency as number and full name
- Impact: non-breaking

**Truncated assignee beside a folded figure**

- From: delayed `title` with the full name
- To: covered by the folded role cell's card above
- Impact: non-breaking

**What keeps its native `title`**: header help text ("Days this work item can
slip…", the shorthand help) — explanation, not item data — and controls whose
title names an action (fold/unfold, remove).

## Non-Goals

- No new data: every card shows what the row already holds on the client.
- The card face (mobile) — no hover exists there.
- No hover-intent delay, follow-cursor, or portal/flip positioning beyond what
  the Name cell's preview already does.
- Schedule cells (Start/End/Slack/Days) show their numbers whole at rest;
  their explanatory titles are headers' and stay native.

## Constraints

- Instant means the Name cell's pattern: state set on `mouseenter`, no
  timeout. One card open at a time per table (a shared hovered-cell state,
  like `hoveredNotes`).
- `columns` must not grow a dependency that changes per keystroke (the
  remount landmine at `wbs-table.tsx`); hovers read through `live`.
- Cards must not intercept the mouse on the row beneath (the fix round's e2e
  learned a preview can eat a click aimed at another row).
- The popover-clipping exemption (`POPOVER_COLUMNS`) governs which `<td>`s may
  overflow; new cards extend it deliberately, not by accident.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: folded role cells and depends cells answer hover instantly
  with the whole of what they fold away

## Domain Terms

- Hover card (new; the Name cell's Hover preview is one)

## Decisions Recorded

none

## Impact

- `apps/fe-01` only: a shared hover-card primitive, `wbs-table.tsx` (folded
  role cell, depends cell), unit tests, `e2e` browser specs.
