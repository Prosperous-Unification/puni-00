<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

`indentFor(depth) = min(depth, 4) * 12`: every level past four renders
identically, which is Dany's screenshot — `030.1.1.1.1.1` at depth 5,
invisible under its depth-4 parent. The cap is right where it lives (the
Number column's declared width) and wrong everywhere it was reused. Plan:
`docs/plans/2026-08-10-ux-batch-and-roadmap.md`, U2.

## What Changes

**One function becomes two named concepts**

- From: one `indentFor`, capped, four consumers.
- To: `numberIndentFor` — capped as today, guarding the Number column's
  envelope — and `hierarchyIndentFor` — uncapped. Each consumer's choice is
  stated in its JSDoc.

**The Name cell carries the withheld share**

- The Number cell keeps the capped indent; the Name cell additionally carries
  `hierarchyIndentFor(depth) − numberIndentFor(depth)` — zero until the cap,
  one step per level past it. Name is the flexible column; there is no
  envelope to blow. The quantity that grows at every level is the **sum** of
  the two cells' shares, and that sum is what the browser measures.

**The Gantt label rail is uncapped**

- The rail takes `hierarchyIndentFor` whole: its labels are not width-capped
  by a 93px column.

**The mobile cards get a stated cap of their own**

- `cardIndentFor` = `min(depth, 6)` at the cards' step: a 390px card cannot
  spend an unbounded margin, and 6 is stated in its JSDoc rather than
  discovered at a viewport.

## Non-Goals

- No change to the Number column's width, envelope, or clipping bargain — the
  `NUMBER_ENVELOPE` e2e proof stays green, untouched.
- No new step size; 12px stands everywhere.
- No persistence, no state: depth in, pixels out.

## Constraints

- The `columns` memo's deps stay `[roles, unfoldedRoles]`; the indent is
  per-row style, never a column definition.
- jsdom lays nothing out: that the two cells' shares **add up** to a strictly
  deeper outline at every level is Chromium's to prove (R5 #14/#15 fault
  class); jsdom watches the arithmetic arrive on the elements.

## Capabilities

### Modified Capabilities

- `wbs-domain`: a row's depth is visible at every level, on every surface.

## Domain Terms

For `CONTEXT.md`: number indent, hierarchy indent.

## Decisions Recorded

none

## Impact

fe-01 only: `table-frame.ts` splits the function, `wbs-table.tsx` (Number and
Name cells), `gantt-panel.tsx` (label rail), `plan-cards.tsx` (card margin)
and `e2e/layout.spec.ts` follow. No migration or dependency.
