<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename.
Approach detail lives in design.md and the implementation order in tasks.md.
-->

## Why

Links is a 40px pinned column whose empty cells say nothing. It is visible on
every first visit today, including projects with no external refs. Dany chose a
quieter first visit and a data-aware **Reset layout**: a reader starts without
Links, then Reset shows it only when the project currently contains a link.

## What Changes

- With no stored layout, Links starts hidden whether or not the project has
  refs. The other default-hidden columns are unchanged.
- Full-table Reset layout recomputes Links from the last successful whole-tree
  read: show it when any live item anywhere in the project has at least one
  external ref; hide it otherwise. Filters, collapsed branches and the viewport
  do not narrow the test.
- A stored column choice or saved view remains authoritative. Adding or removing
  refs never changes the visible columns; only a later Reset recomputes the
  contextual target.
- Reset stores one local `Links shown by reset` marker so its result survives a
  reload without freezing the rest of the column set. It still forgets widths,
  Gantt settings and the explicit hidden-column list.

## Non-Goals

No server preference, shared project setting, ref-count endpoint, column
reordering, card field, or automatic visibility effect. External-ref storage
and editing are unchanged.

## Constraints

The decision uses `flat`, the already-loaded full tree, not `shownRows`. The
40px width and pinned ordering remain unchanged when Links is shown; hiding it
must remove exactly 40px and leave no sticky gap before Name. Phone cards still
have no Links field and their Gantt-only reset does not change desktop columns.

## Capabilities

### Modified Capabilities

- `wbs-domain`: initial and reset-time Links-column visibility; local layout
  persistence and reset semantics.

## Domain Terms

No new domain term. This narrows the existing Column set and Layout reset
contracts.

## Impact

`fe-01` only: `table-frame.ts`, `wbs-table.tsx`, their layout tests, and the
existing 1280px/390px browser assertions. No be-01, schema or wire change.
