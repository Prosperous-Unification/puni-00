<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

`wbs-domain` says the chart's `Detail` switch "SHALL open **off**". The code has
opened it on for a plan with dependency links since TASK-38, and since ui-review
F-065 (#472) that default waits for the plan's first read. The spec sentence is
stale (ui-review F-089).

The review of #472 also found that the never-said default was latched for the
whole life of the chart (F-088). A chart whose links become unknown again would
keep the previous plan's answer. Today the page mounts the table afresh on every
project switch, so a reader does not see this; the latch still contradicts the
chart's own `generation` contract, where 0 means "links not known yet".

## What Changes

- The switch opens on for a plan whose first read brings dependency links, and
  off for one whose first read brings none. A remembered answer wins.
- The default is decided once per plan. A first link added later in the session
  does not flip it.
- When the project changes, the default is decided again from the next plan's
  first read. `useGanttDetail` unlatches when the links become unknown again
  (generation 0).
- The scenarios that assumed "opens off" are restated for a plan without links.

## Non-goals

- Changing the remembered key, its global scope or its refusal rules.
- Keeping the chart open across a project switch.
- The assumed-bar drift: "One switch draws every mark the chart holds back"
  (first paragraph) and "Leaves draw bars for the work somebody costed, and the
  rest is behind the switch" still say an unestimated slice's assumed bar is
  behind the switch. Since 2026-09-11 it is drawn in both states
  (`gantt-panel.tsx` `drawnBars`). This change leaves those sentences alone and
  only drops `data-assumed` from the sentence about the opening state it
  rewrites. That drift needs its own change.

## Impact

- `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts` (`useGanttDetail`).
- Tests: `gantt-detail.test.tsx`, `gantt-panel.test.tsx`, `e2e/gantt-detail.spec.ts`.
