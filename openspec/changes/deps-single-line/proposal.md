<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

A row waiting on seven others is a `depends` cell several lines tall, and the
whole row stretches with it: one dependency-heavy row makes the table ragged.
The wrap is one recorded declaration — `whiteSpace: 'normal'` on the deps
wrapper, rationale "a dependency nobody can see is not [a cost worth paying]"
— and the full list now lives in two other places that did not exist when it
was recorded: the `DependsCard` hover and the box's sr-only `Waiting for …`
description. The card becomes the guarantee; the cell stops paying for it.
Plan: `docs/plans/2026-08-10-ux-batch-and-roadmap.md`, U3.

## What Changes

**At rest the cell clamps to one line**

- The chips and the box move into an **inner strip** with `nowrap` +
  `overflow: hidden` (precedent: `CellInput.restShowsFirstLineOnly`). The
  wrapper stays the positioned ancestor for the listbox and the card, both of
  which stay outside the strip; the `<td>`'s popover clip exemption is
  untouched. While the picker owns the cell the strip wraps as before, so
  typing and the open list are unchanged.

**No `+N` marker; an unconditional edge fade is the cue**

- Counting hidden variable-width pills means real layout measurement for
  marginal information, and "fade only when clipped" needs the same
  `scrollWidth` read. The fade is declared always; over an unclipped short row
  it fades nothing. No measurement, no resize listener, nothing to count.

**Two recorded requirements are reversed by name**

- The deps wrapper's `whiteSpace: 'normal'` rationale comment in
  `wbs-table.tsx`, and `table-geometry-and-tab-order`'s "wraps its chips onto
  a second line rather than clipping them" (archived at
  `openspec/changes/archive/2026-08-10-table-geometry-and-tab-order/`). Both
  supersessions are named in the delta spec.

## Non-Goals

- No `+N` count, no per-row measurement.
- No hover highlights — that is U4 `dep-hover-highlights`, ordered after this.
- No change to the picker, the listbox, the card's content, tab order, or the
  `<td>` exemption.

## Constraints

- The `columns` memo's deps stay `[roles, unfoldedRoles]`.
- jsdom proves declarations only — the strip exists, the wrapper still
  positions the listbox. Row height with seven chips and a clipped chip's
  invisibility are Chromium's to prove (the `pixels` CI job; R5 #14–16 fault
  class).

## Capabilities

### Modified Capabilities

- `wbs-domain`: the Depends on cell rests on one line.

## Domain Terms

none new

## Decisions Recorded

none — the reversal is recorded in the delta spec and at the wrapper.

## Impact

fe-01 only: `wbs-table.tsx` (the strip), `styles.css` (chip margin becomes
strip gap), `wbs-table.test.tsx`, new `e2e/deps-cell.spec.ts`, stale chip-wrap
comments in `e2e/layout.spec.ts`. No migration or dependency.
