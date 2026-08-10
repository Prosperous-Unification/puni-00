<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

The Gantt panel takes a bounded share of the screen — `max-h-[40vh]`, a
constant — and a reader who wants to study the chart, or who wants their rows
back, has no lever but closing it. Dany asked for the boundary between plan
and chart to be draggable, and for the width reset to grow into a layout
reset that covers it.

## What Changes

**The Gantt panel's top edge can be dragged**

- From: the panel takes what it needs up to a constant 40vh cap.
- To: a handle on the panel's top edge drags the boundary up and down. The
  height it settles at is a **panel height override**, clamped between three
  chart rows (84px) and a named ceiling the stored-height check shares, and
  applied under a live 80vh cap so a height dragged on a tall monitor stays
  sane on a laptop. No drag yet → today's behavior, unchanged.
- Impact: non-breaking; the panel and the shell that mounts it.

**The height is remembered per project, per browser**

- From: n/a.
- To: `wbs.ganttHeight.<projectId>`, read as a claim like the widths beside
  it — storage that is not a number in the drag's own range drops the key and
  the panel opens at its default share.

**Width reset becomes layout reset**

- From: "Reset column widths", offered while a width override is in force,
  forgetting only widths, on a line of its own above the table.
- To: "Reset layout", offered while a width **or** height override is in
  force, forgetting both. Forgotten, never frozen, as before. It joins the
  toolbar row as that row's own child — still never the shared
  `toolbarControls` array, which reaches the phone sheet by construction.

## Non-Goals

- No layout control on the outline cards or in the Plan actions sheet; the
  drag handle itself works on a phone because it is the panel's own edge.
- Nothing shared: no be-01 write, no event, no undo.
- No keyboard resize of the boundary — the columns' handles set that bar.
- No remembered open/closed state for the panel.

## Constraints

- jsdom performs no default action for pointer events: the drag is provable
  only in Chromium (`e2e/gantt.spec.ts`), the shape of the fourteenth and
  fifteenth failures.
- The chart may fail to draw (`GanttFaultBoundary`); the drag must not die
  with it, or a reader who shrank the chart to nothing could never get it
  back.

## Capabilities

### New Capabilities

- none

### Modified Capabilities

- `wbs-domain`: the Gantt panel's height becomes draggable, remembered, and
  covered by the reset.

## Domain Terms

- Panel height override
- Layout reset (replacing Width reset)

## Decisions Recorded

none

## Impact

`apps/fe-01` only: `gantt-panel.tsx`, `wbs-table.tsx`, `table-frame.ts`
(reset JSDoc link), `e2e/gantt.spec.ts`, unit tests beside each.
