# gantt-polish

## Why

Dany read the seeded 63-row plan on the chart and could not: bars name only the assignee, so sixty bars read as anonymous colour; a parent row draws as a bracket that reads as a scratch; sixty dependency elbows bury the bars they join; and a dated chart names its month as `2026-08`, which nobody says out loud. Four small legibility faults, each one costing the chart the reading it exists for.

## What Changes

**On-bar words**

- From: a bar writes the assignee (name, initials, or nothing).
- To: the assignee as now, then ` · 010 - name`, cropped to the bar's width; the label font drops a size.
- Impact: non-breaking; unestimated bars keep their `?`.

**Parent rows**

- From: a parent draws a 2px bracket with dropped legs.
- To: a parent draws the same rounded bar a leaf gets, semitransparent and unstroked — visibly a projection of what is beneath, not work of its own.
- Impact: non-breaking; the span is still the projection, never a sum.

**Dependency arrows**

- From: every stored dependency always draws its elbow and head.
- To: a switch on the panel hides all arrows; default stays shown. View state only, per mount.
- Impact: non-breaking.

**Month caption**

- From: the sticky corner prints `2026-08`.
- To: it prints `Aug 2026`, still following the scroll; `Workday` stays when the plan has no start date.
- Impact: non-breaking.

## Non-Goals

- No re-routing or restyling of the arrows themselves — Dany judged them ugly but unfixed for now; the switch is the whole answer.
- No persistence of the switch across reloads or accounts.
- No month band along the axis; the corner caption is the one month reading.
- No schedule, wire, or be-01 change of any kind.

## Constraints

- The SVG user space stays geometry-only; every word stays HTML over it (design §1 of gantt-view).
- Engine numbers stay verbatim on `data-start`/`data-finish`; the parent bar keeps the bracket's span readings through `placeGantt`.
- The e2e gate measures marks in Chromium; changed marks must keep findable hooks.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `gantt-view`: bar label content, parent-row mark, arrow visibility switch, month caption format.

## Domain Terms

none — `virtual bar` stays a drawing description, not a domain term.

## Decisions Recorded

none

## Impact

`apps/fe-01/src/components/wbs/gantt-panel.tsx`, `gantt-geometry.ts` (bracket type unchanged, drawing changes), their tests, `apps/fe-01/e2e/gantt.spec.ts`.
