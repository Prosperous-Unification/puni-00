<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

Every column width is a constant in `table-frame.ts`, measured once against a
1280px laptop. A planner whose names run long, or who never uses Depends on,
cannot spend one column's pixels on another; the only lever is folding a role
away. Dany asked for draggable widths plus a reset. `compact-columns`
(T2) has just made width resolution one per-render object — the seam this
needs. Reviewed plan:
`docs/plans/2026-08-09-directory-table-header-gantt.md`, section T1.

## What Changes

**A column's edge can be dragged**

- From: every declared width is a module constant.
- To: each column that has a declared width carries a handle on its header's
  edge; dragging it sets an override, carried in T2's frame layout state, that the
  `<colgroup>`, both table minimums and the pinned offsets take from one
  `frameLayout` call — so they move together. Floor per column: 36px, or
  its own default where that is narrower; ceiling 600px, one constant the drag
  and the stored-width check share.
- Impact: non-breaking; the table renderer only.

**Name stays the flexible column**

- From: n/a.
- To: `name` absorbs the remainder above its 200px floor and gets no handle.

**Widths are remembered per project, per browser**

- From: n/a.
- To: `wbs.columnWidths.<projectId>`, read as a claim like the expansion beside
  it — unparseable storage drops the key; an entry naming a column nothing can
  size, or a width outside the drag's own range, is dropped on its own.

**Reset returns columns to today's defaults**

- From: n/a.
- To: one control beside the table forgets the key. Columns return to what
  `frameLayout` resolves now, not to a snapshot taken when it was pressed.

## Non-Goals

- No column reordering, hiding, or per-column reset.
- Nothing shared: no be-01 write, no event, no journal entry, no undo.
- No width control on the outline cards or in the Plan actions sheet — they
  have no columns.

## Constraints

- **`compact-columns` (T2) lands first.** These artifacts assume its per-render
  `frameLayout(leafIds, state)` exists, that all five width consumers read it,
  and that the folded minimum already takes real role ids.
- The `columns` memo gains no deps (landmine #1) and widths never enter column
  defs — which is also why TanStack's own resizing is not used.
- jsdom performs no default action for pointer events: the drag is provable
  only in Chromium, the shape of the fourteenth and fifteenth failures.

## Capabilities

- `wbs-domain`
