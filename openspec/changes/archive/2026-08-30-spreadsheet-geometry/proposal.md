<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

The plan reads as a document and Dany asked for a spreadsheet (2026-08-08, U2.2
and U4: "`#` instead of Number, tighter paddings, spreadsheet feel", "Name half
as wide"). Three things are left of that ask after the batches that landed since
— `compact-columns` took the widths, `deep-indent` and `table-mechanics` took the
indent and the number's type, `caret-gutter-and-initials` took the folded role
cell.

The body is set at the browser's default 16px, which is a paragraph's size in a
table of short strings and figures. The Name column takes every pixel a wide
window leaves, so at 1512 it is half a screen of white space that pushes the
dates away from the names. And two headings print words no column can hold:
`Number` in 93px, `optimistic` in 52 — measured at 84px, drawn as `optimi`.

Plan: `docs/plans/2026-08-08-table-polish.md` §2, less the parts merged since.

## What Changes

**The grid's type**

- From: 16px over the browser's own line, a 26px row
- To: 13px over a 1.4 line, on the cells, the boxes and the buttons alike; a
  single-line row inside a stated 28px budget
- Impact: every fixed column is now wider than what it holds. Nothing clips and
  no column moves — narrowing them is a measurement of its own

**The Name column's ceiling**

- From: the flexible column takes the whole remainder, however wide the window
- To: it stops at `FLEXIBLE_CAP` (420px) and the window keeps the slack, through
  the table's own `min(100%, maxWidth)` — one declaration, no cell `max-width`
- Impact: a drag still outranks it, up to the shared 600px ceiling

**Two headings that are marks**

- From: `Number` and `optimistic`/`realistic`/`pessimistic`, clipped
- To: `#` and `o`/`r`/`p`, each with the word as the `<th>`'s accessible name;
  the point columns 52px → 44

## Non-Goals

- No narrower date, team or priority columns. They were measured at 16px and
  each is its own browser measurement.
- No gantt panel: `ROW_PX` is the chart's own and another change owns that file.
- Not the accordion, not the cells' quiet states — §3 and §4 of the same plan.

## Constraints

- Every column width is a browser measurement, and `e2e/layout.spec.ts` asserts
  the declared width is at least what Chromium needs. Type that shrinks strings
  keeps those true; type that grew them would not.
- `plan-cards.tsx` carries `data-grid` too. Every rule here is `tbody`-scoped.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: the table stops widening the Name column at a cap; the grid body
  is typed for a grid; a heading may be a mark with the word said out loud

## Domain Terms

none

## Decisions Recorded

none — the cap and the type scale are one constant each, and both are argued
where they live.

## Impact

`apps/fe-01` only: `table-frame.ts`, `wbs-table.tsx`, `styles.css`, their unit
tests, and `e2e/{layout,deps-cell}.spec.ts`. No be-01, no gw-01, no migration.
