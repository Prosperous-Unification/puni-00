<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

A bar's hover is a native SVG `<title>`: six terse lines. Team, trio and what
the slice waits for are in none of them, nor in the rows the panel receives. It
is also the bar's only accessible name. Plan:
`docs/plans/2026-08-09-directory-table-header-gantt.md`, G2.

## What Changes

**A hover surface replaces the native tooltip**

- From: a `<title>`, browser-placed and browser-timed.
- To: `name-title-body`'s `HoverPreview` generalized into a surface the Name
  cell and the bar share — the row heading, who and what, dates, the trio, the
  float, the floor and what it waits for. Anchored to the bar's rect, flipped
  and clamped, dismissed by panel scroll, one at a time. The `<title>` children
  then go — two tooltips is a bug — and `gantt-view`'s requirement mandating
  them is amended here.

**Bars carry slice-true facts**

- From: words off a bar that cannot reach team, trio or dependencies.
- To: bars enriched with the team name, the trio for that bar's own role,
  and dependency labels resolved from the **full tree**, not `shownRows`.
  Dates come from the bar's own offsets, never the row's span. Zero-role,
  unassigned and missing-estimate render named states.

**A bar is reachable without a mouse** — `tabIndex` and an `aria-label` of its
facts, focus shows the surface, Enter and Space pick the row; the accessible
name survives the `<title>`'s removal.

## Non-Goals

- Notes stay with the Name cell's preview.
- No long-press on touch; a tap picks the row.
- No new be-01 read; nothing on the surface is editable.

## Constraints

- **After `name-title-body` merges** (mid-flight, another checkout): it renames
  `notes-preview.tsx` → `hover-preview.tsx` and adds a name heading; its
  merged contract is re-read first.
- After `gantt-calendar-axis`: it places the anchor; the dates in words stay
  `addWorkdays`/`lastWorkdayOf` — a coordinate is not a date.
- After `compact-columns`: dates print through its `shortIsoDate`.
- `personName` stays from the atomic chart payload.
- Enrichment is built outside the `columns` memo (landmine 1).
- R5: hover, flip and dismiss are browser facts jsdom cannot see.

## Capabilities

### Modified Capabilities

- `wbs-domain`: a bar explains itself in a surface, from facts it is given.

## Domain Terms

Proposed, not written here: **hover preview**, **bar facts**.

## Decisions Recorded

none — the plan's disposition table settled scroll-dismiss.

## Impact

fe-01 only: the hover surface, the Gantt panel and its geometry,
`wbs-table.tsx`, both gantt tests. No be-01 change or migration.
