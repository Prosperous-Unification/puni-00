<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

At rest the Name cell shows the name plus up to four lines of notes, so a table
with notes is mostly notes: rows grow to five lines, neighbouring names drift
apart, and scanning the plan means reading past text nobody asked to see. The
name — the one part that must always be readable — competes for its own box.

## What Changes

**Name cell at rest**

- From: the name plus up to four note lines, then the box scrolls
- To: the name alone, whole and wrapped, however many lines the name itself
  takes; the notes take no height
- Impact: non-breaking; every row with notes gets shorter

**Name cell while edited**

- From: the full text — name on the first line, notes under it
- To: unchanged
- Impact: none

**Hover preview**

- From: the notes rendered as markdown
- To: the name as a level-one heading, the notes rendered as markdown under it
- Impact: non-breaking

## Non-Goals

- The card face keeps its at-rest notes: a phone has no hover, so edit would be
  the only other place to read them. This change is the table's Name column.
- No storage or API change; name and notes stay two fields.
- No preview for a work item with no notes — its name is already fully shown.

## Constraints

- The Name cell stays one textarea node. The focus machinery — `focusIntent`,
  `LiveField`, the `columns` remount landmine — forbids swapping nodes or the
  node's value at focus time.
- Notes hidden at rest must still round-trip: what the box holds and what
  `LiveField` diffs against its baseline do not change, only the visible height.
- Raw HTML in a name or a note renders as text, never markup — the name enters
  a heading element as text, not as concatenated markdown source.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: the at-rest Name cell shows the name only; the hover preview
  gains the name as a level-one heading

## Domain Terms

- Name cell (updated), Hover preview (new)

## Decisions Recorded

none — the at-rest clamp is reversible and unsurprising given the cell's
existing autoSize; the alternatives (node swap, value swap) fail the existing
focus constraints rather than being live options.

## Impact

- `apps/fe-01` only: `cell-input.tsx` (at-rest height), `notes-preview.tsx`
  (heading), `wbs-table.tsx` (props wiring), their tests, `e2e` browser specs.
