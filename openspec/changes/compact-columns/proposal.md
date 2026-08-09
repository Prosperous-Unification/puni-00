<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

Dates print as `2026-06-01`; `Not before` is 146px because every row mounts a
native date input, Number is 100 — furniture in a table that must fit a
1280 laptop. Width resolution is scattered across five consumers, one a
module-load map, so no width can depend on state — which
`column-widths-drag` needs. Plan:
`docs/plans/2026-08-09-directory-table-header-gantt.md`, T2.

## What Changes

**One resolved frame layout**

- From: five consumers compute widths apart; the pinned map is static.
- To: one per-render `frameLayout(leafIds, state)` all five read, the folded
  minimum among them from the project's real role ids, and a width may now
  depend on the plan.

**Short dates**

- From: raw ISO in three columns.
- To: `1 Jun`, `1 Jun 2027` off the current year, full ISO in `title`, from two
  formatters: `shortIsoDate` for a zone-free day, `shortInstant` for an epoch
  instant in the browser's zone. Existing fallbacks stand.

**`Not before` is text until it is edited**

- From: every row mounts one.
- To: the day as text, em-dash for none; `DateField` mounts for the edited cell
  only, with `onExit('commit' | 'cancel')` — Enter and blur commit and
  close, Escape commits nothing, its blur included, and focus returns to the cell.

**Two columns narrow**

- From: `not-before` 146, `number` 100.
- To: `not-before` 84, or 56 where no row sets one; `number` a browser's
  measurement of an eleven-character number at the deepest indent, longer ones
  clipped with the full number in `title`.

## Non-Goals

- No drag-to-resize or persistence; `column-widths-drag` uses this seam.
- No new date entry: the editor stays a native input.
- No display-timezone concept; `shortInstant` reads the browser's.
- No schedule maths, only how figures print.

## Constraints

- The `columns` memo's deps stay `[roles, unfoldedRoles]`; widths never enter a
  column definition — rebuilding those eats the focus.
- No longest number exists (insertion appends digits): Number fits a measured
  envelope, not a guess at 72.
- jsdom performs no default action: Escape, Tab and the picker are proved in
  Chromium (R5 #14/#15).

## Capabilities

### Modified Capabilities

- `wbs-domain`: a column's width is a fact about the plan; a day prints as one
  reads it.

## Domain Terms

For `CONTEXT.md`: frame layout, short date, edit exit.

## Decisions Recorded

none

## Impact

fe-01 only: `table-frame.ts` gains `frameLayout`, `date-field.tsx` an `onExit`,
`short-date.ts` is new, and `wbs-table.tsx`, `phases-dialog.tsx`, `plan-cards.tsx`
and `e2e/layout.spec.ts` follow. No migration or dependency.
