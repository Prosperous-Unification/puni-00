<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Two columns fray, both in Dany's screenshot of the imported WCN plan.

The Number column's disclosure caret is inline before the number, so a row with
children prints its number 12px right of a sibling without any: `▾040` and `050`
are the same depth and do not line up. The frozen 🔒 shifts it again. A column of
figures that does not align is the one thing a column of figures is for.

The folded Dev and QA cells print the figure and the assignee side by side in
96px, the name taking 60% of it and ellipsising. What a reader gets is `1 · vad…`,
`5.5 · kuc…`, and — where the estimate is empty and the assignee only assumed —
`o/r/ · (va…`, in which even the `o/r/p` syntax reminder has lost its last
character. Three characters of a person's name is not a name.

## What Changes

**The Number cell's caret**

- From: inline before the number, present only on a row that can expand
- To: a fixed-width slot always reserved, so the number starts at the same x for
  every row at a given depth
- Impact: non-breaking; a childless row gains 12px of empty gutter

**The Number cell's frozen marker**

- From: between the caret and the number, shifting the number right
- To: after the number, where it cannot shift it
- Impact: non-breaking

**The folded role cell's assignee**

- From: the person's name, truncated to whatever 60% of the column holds
- To: their initials — two characters, no ellipsis — with the whole name in the
  cell's tooltip, as the hover card already gives it
- Impact: non-breaking; nothing is lost that hover does not say

## Non-Goals

- No change to the unfolded role columns, which have the room for a name.
- No change to what is stored, sent, or assumed — this is what the cell prints.
- Not a re-layout: no column changes width, and no row changes height.
- The mobile cards keep the full name; a card is not 96px wide.

## Constraints

- Alignment and truncation are laid out by the browser, so the negatives are
  browser tests (R5 #14–16). jsdom can see the initials; only Chromium can see
  two numbers sharing an x.
- The Number column's declared width is unchanged, so the gutter has to come out
  of `numberIndentFor`'s existing envelope rather than widen it.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: the Number cell reserves its caret's width and prints its frozen
  marker after the number; a folded role cell names its assignee by initials

## Domain Terms

none

## Decisions Recorded

none — every part of this is a cell's own printing, reversible in one file.

## Impact

`apps/fe-01` only: `wbs-table.tsx`'s Number and folded-role cells, `styles.css`,
their unit tests, and `e2e/layout.spec.ts`. No be-01, no gw-01, no migration.
