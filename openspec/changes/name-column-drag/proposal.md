<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.
-->

## Why

`column-widths-drag` gave every declared-width column a handle and deliberately
refused the Name column one: it was the flexible remainder-absorber, and asking
for its width was an error. Dany's 2026-08-10 UX batch asks for Name to be
draggable too — a planner whose names run short cannot give Name's pixels back.
The direction is recorded and confirmed (plan
`docs/plans/2026-08-10-ux-batch-and-roadmap.md`, U1 and its Answers section,
Dany 2026-08-10): do not re-litigate it here.

## What Changes

**The Name column takes a dragged width** — superseding, by name,
`column-widths-drag`'s "Name stays the flexible column" (its proposal entry,
and the "flexible column SHALL NOT be draggable" clause of its requirement
"A column with a declared width can be dragged to another width").

- From: `widthFor`/`floorFor` throw for `name`; no handle; no override.
- To: a dragged Name enters `widthOverrides` — same key, same claim rules —
  with its own bounds: floor `FLEXIBLE_FLOOR` (200), ceiling `WIDEST_COLUMN`
  (600). `floorFor` grows an explicit flexible arm returning `FLEXIBLE_FLOOR`;
  `widthFor` keeps throwing for flexible-without-override. This adopts as
  behaviour the exact injected fault of the shipped negative "refuses the
  flexible column a width and a floor alike" (`column-widths-drag/verify.md`
  row 4) — that negative is retired by name and the test flips to proving the
  resolved floor.

**Excess viewport width stays Name's alone.** `<col name>` stays unsized even
with an override; the dragged width rides as `width` + `min-width` on the Name
cells, so `table-layout: fixed` keeps Number on its 93px envelope and the dates
on 114 at every viewport. If Chromium shows fixed layout not honouring the cell
width against an unsized `<col>`, the fallback is the table's own width set to
the resolved sum; the e2e measurement decides, and the losing branch is
deleted, not left as dead config.

**Reset is unchanged**: `forgetWidthOverrides` — one reset returns the whole
layout, Name included.

## Non-Goals

- No second flexible column; no reordering or hiding; no per-column reset.
- Nothing shared: no be-01 write, no event.
- No width control on the outline cards or the Plan actions sheet.

## Constraints

- The `columns` memo gains no deps (landmine #1); widths never enter column
  definitions.
- jsdom performs no default action for pointer events: the gesture and the
  excess-width distribution are provable only in Chromium (CI job `pixels`).

## Capabilities

- `wbs-domain`
