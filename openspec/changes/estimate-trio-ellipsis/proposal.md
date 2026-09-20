## Why

A folded step cell holds three readings in 104px: the typed trio, the step's result, and an assignee slot. With the widest trio anybody has typed (`20/24/30`), a fractional result (`24.3`) and a named assignee, the trio wants 16px more than the box it is given, and the cell cut it off mid-glyph with nothing to say that more had been typed. Measured in Chromium on 2026-09-20: the `<td>` is 104px, the box 30.69px, the result 25.31px, the slot 32px.

## What Changes

**The resting trio yields legibly**

- From: A trio too wide for its box is clipped at the box edge, mid-glyph, with no mark.
- To: A trio too wide for its box ends in an ellipsis while the cell is at rest. The result and the assignee keep the rendering they already have, the assignee slot's own deliberate clipping of an assumed `(WW)` included.
- Impact: Non-breaking visual change to folded step cells whose trio does not fit.

**Editing is untouched**

- From: The focused box scrolls its whole value.
- To: Unchanged — the ellipsis is declared on the resting arm only.
- Impact: None.

## Non-Goals

This change does not widen the step column, shrink or hide the trio, change the assignee slot, change what is stored or how a result is computed, or change the hover card, which already carries the trio in full.

## Constraints

The column width is fixed: widening the step column moves the table's own width equation and fourteen unit pins. The result is the cell's main reading, so the trio is what yields. The trio is a real `<input>`, so its text cannot be styled in parts. The assignee slot's own clipping of an assumed `(WW)`, which `ASSIGNEE_SLOT_PX`'s JSDoc accepts on purpose, is unchanged and out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wbs-estimate-cell`: Adds what a resting trio does when it does not fit beside the result and the assignee slot.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

The change affects only the WBS frontend's folded estimate-cell rendering and its jsdom and Chromium coverage. It changes no API, stored contract, dependency, migration, or deploy path.
