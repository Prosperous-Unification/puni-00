<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

A row waiting on seven others is a `depends` cell several lines tall. The
wrap is one recorded declaration —
`whiteSpace: 'normal'` on the deps wrapper, rationale "a dependency nobody
can see is not [a cost worth paying]" — and the full list now lives in two
places that did not exist then: the `DependsCard` hover and the box's sr-only
`Waiting for …` description. The card becomes the guarantee. Plan:
`docs/plans/2026-08-10-ux-batch-and-roadmap.md`, U3.

## What Changes

**At rest the cell clamps to one line**

- The chips and the box move into an **inner strip** with `nowrap` +
  `overflow: hidden` (precedent: `CellInput.restShowsFirstLineOnly`). The
  wrapper stays the positioned ancestor for the listbox and the card, both
  outside the strip; the `<td>`'s popover clip exemption is untouched. While
  the picker owns the cell the strip wraps as before; typing and the open
  list are unchanged.

**No `+N` marker; a rest-only edge fade is the cue**

- A `+N` count means measuring hidden variable-width pills, and "fade only
  when clipped" needs the same `scrollWidth` read — the rest condition is the
  picker's _state_, never a measurement. The fade comes off while the picker
  owns the cell: the strip has wrapped, and a mask there dims the ring, caret
  and typed text (codex + agy review). At rest the chips' ✕ buttons leave the
  tab order (`tabIndex -1`): a clipped chip must not take a focus nobody can
  see. The strip pins `direction: ltr` — the mask fades a physical edge.

**Two recorded requirements are reversed by name**

- The deps wrapper's `whiteSpace: 'normal'` rationale comment in
  `wbs-table.tsx`, and `table-geometry-and-tab-order`'s "wraps its chips onto
  a second line rather than clipping them" (archived at
  `openspec/changes/archive/2026-08-10-table-geometry-and-tab-order/`). Both
  named in the delta spec.

## Non-Goals

- No `+N` count, no per-row measurement.
- No hover highlights — that is U4 `dep-hover-highlights`, ordered after this.
- The picker, listbox, card content, grid Tab routing and `<td>` exemption
  are untouched.

## Constraints

- The `columns` memo's deps stay `[roles, unfoldedRoles]`.
- jsdom proves declarations only; seven-chip row height and a clipped chip's
  invisibility are Chromium's (the `pixels` CI job, R5 #14–16).

## Capabilities

### Modified Capabilities

- `wbs-domain`: the Depends on cell rests on one line.

## Domain Terms

none

## Decisions Recorded

none

## Impact

fe-01 only: `wbs-table.tsx` (the strip), `styles.css` (chip margin becomes
strip gap), `wbs-table.test.tsx`, new `e2e/deps-cell.spec.ts`, comment fixes
in `e2e/layout.spec.ts`. No migration or dependency.
