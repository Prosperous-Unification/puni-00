<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

A Depends on cell says `010 ✕ 030 ✕` — numbers. Finding the rows those
numbers name means reading the hover card and then scanning the Number
column. Dany's ask (2026-08-10, with screenshot): hovering the cell should
light every dependency's row in the table, and hovering one pill should
light that one row and emphasise its line in the card. Plan:
`docs/plans/2026-08-10-ux-batch-and-roadmap.md`, U4 — ordered after U3
`deps-single-line`, because after U3 a chip can be clipped out of sight and
the case has to be named, not discovered.

## What Changes

**Table-level hover state, read through `live`**

- `depHover: { rowId, pillId | null } | null` — the cell's input area sets
  `pillId: null`, a pill sets its id, leaving a pill inside the cell
  restores `pillId: null`, leaving the cell clears. Two fields, not an id
  list: a list cannot distinguish "the cell" from "the cell's only pill"
  (codex 10). A hover re-renders the table; it must never remount cells —
  the `columns` memo keeps its two deps (`roles`, `unfoldedRoles`).

**Rows light through the `--cell-bg` join**

- `<tr>` gains `data-row-id` and `data-dep-lit`; a `styles.css` rule
  re-points `--cell-bg` to a new `--grid-dep-lit` tint (the `tr:hover`
  precedent), so the pinned cells' opaque inline backgrounds follow. The
  lit set derives per render from the hovered row's `dependsOn` — all of it
  at `pillId: null`, the one row otherwise.

**The card keeps the guarantee, and gains the emphasis**

- A dependency whose row is collapsed or filtered out has no `<tr>` to
  light; the card still names it. `DependsCard` gains `emphasisedId`,
  rendering the pill's line with the same tint the rows use — a background
  swatch, not bold.

## Non-Goals

- No hover delay, no measurement, no scrolling a lit row into view.
- A clipped chip gets no synthetic hover target — cell-level hover already
  lights every row.
- The picker, listbox, chips' click/keyboard behaviour and U3's strip,
  fade and tab-order rules are untouched.

## Constraints

- The `columns` memo's deps stay `[roles, unfoldedRoles]`, pinned by the
  existing focus tests and a new negative.
- jsdom proves the state machine and attributes; the painted tint and real
  pointer moves are Chromium's (`e2e/hover-cards.spec.ts`, the `pixels` CI
  job, R5 #14–16).

## Capabilities

### Modified Capabilities

- `wbs-domain`: hovering a dependency lights the rows it names.

## Domain Terms

none

## Decisions Recorded

none

## Impact

fe-01 only: `wbs-table.tsx` (state, handlers, `<tr>` attributes),
`depends-card.tsx` (`emphasisedId`), `styles.css` (tint + rule),
`wbs-table.test.tsx`, `e2e/hover-cards.spec.ts`. No migration or
dependency.
