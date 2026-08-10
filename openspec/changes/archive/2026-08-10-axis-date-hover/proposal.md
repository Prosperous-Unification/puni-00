# axis-date-hover

## Why

The chart's axis prints day-of-month numbers, and the only way to learn which month a cell is in mid-chart is its native `title` — a raw ISO string after the browser's own ~1.5s delay. Dany, reading the seeded plan: the hover must be faster, and it must say the month.

## What Changes

**The axis cell's hint**

- From: a native `title` holding `2026-08-17`, after the browser's delay.
- To: the chart's own hover card — the same 220ms open the bars have — saying the date in words: `Mon 17 Aug 2026`, with `Workday 5` or `Weekend` under it. On a plan with no start date it says `Workday N`. The native `title` goes: one hint, and it is the card (`instant-hovers`' rule).
- Impact: non-breaking. Touch stays inert, exactly as the bars' seam demands.

## Non-Goals

- No keyboard path: axis cells are not focusable today and do not become so.
- No change to the corner caption, the bars' surfaces, or the 220ms constant.
- No persistence, no month band.

## Constraints

- The same `opening` timer and dismiss discipline as the bar surfaces — two cards never open at once.
- `HoverCard` portal + anchor placement; the SVG holds no HTML (design §1).
- Dates in words come from fixed English tables (`monthWords`' reason: locale-stable tests).

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `gantt-view`: the axis cell's hover hint.

## Domain Terms

none

## Decisions Recorded

none

## Impact

`apps/fe-01/src/components/wbs/gantt-panel.tsx`, `gantt-panel.test.tsx`, `apps/fe-01/e2e/gantt.spec.ts`.
