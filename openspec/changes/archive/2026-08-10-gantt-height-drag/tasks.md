<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 0. Standing rule for this change

Every negative below is written and **watched failing** before the line it
guards is believed — `T1 column-widths-drag`'s finiteness line and `P
phases-ui`'s sanitizer are why the order is the point. Each guard carries a
`Proof:` comment naming the injected fault and the test that observed it.

## 1. The height, clamped and applied

- [x] 1.1 `GANTT_MIN_PX = 84` (the axis row and two chart rows, `3 * ROW_PX`)
      and `GANTT_CEILING_PX` in `gantt-panel.tsx` beside `ROW_PX`, exported,
      with JSDoc saying where each comes from — the ceiling is 80% of a 2160px
      display, the tallest viewport a stored height could honestly have been
      dragged on — and a pure `clampedGanttHeight(px, viewportPx)` used by
      **both** the drag and the stored-height check, so no drag can produce a
      height a reload would reject — test: `gantt-panel.test.tsx` clamp cases:
      below 84 stops at 84, above the ceiling stops at the ceiling, above 80%
      of the given viewport stops there
- [x] 1.2 `GanttPanel` takes `heightPx: number | null`; `null` keeps
      `max-h-[40vh]` exactly as today, a number is applied as `height` with
      `maxHeight: '80vh'` in its place — test: `wbs-table.test.tsx`, the panel
      carries the override's height when one is in force and today's class
      when none is; the no-override case is the existing chart tests staying
      green

## 2. The remembered height is a claim

- [x] 2.1 `rememberedGanttHeight(projectId): number | null`,
      `rememberGanttHeight`, `forgetGanttHeight` in `wbs-table.tsx` beside the
      width trio, key `wbs.ganttHeight.<projectId>`; read refuses storage that
      does not parse to a number in `[GANTT_MIN_PX, GANTT_CEILING_PX]` — the
      same constants the drag clamps by — dropping the key and answering
      `null` — test: `wbs-table.test.tsx`, a stored height survives a
      remount; negatives, each watched failing with its refusal removed:
      unparseable storage → default share and key gone; a height below the
      floor and one above the ceiling → default share and key gone. `Proof:`
      comments beside each refusal name these
- [x] 2.2 A write happens on commit and at no other time — opening a project
      must not change what is remembered about it — test: `wbs-table.test.tsx`,
      opening the chart with valid storage leaves the stored string byte-equal

## 3. The drag

- [x] 3.1 A handle rendered by the shell **above and outside**
      `GanttFaultBoundary` (`role="separator"`, `aria-orientation`
      `horizontal`, labelled for the chart's height,
      `cursor-row-resize`, `touch-action: none`): pointerdown captures the
      pointer and records the panel's current height, each move applies
      `clampedGanttHeight(start + (startY - clientY), viewport)` per move so
      the boundary follows the pointer, pointerup commits to storage,
      `pointercancel` re-reads the last committed answer — the `ColumnResize`
      shape — test: `wbs-table.test.tsx` drives the pointer sequence and
      asserts the applied height, the committed storage, and the cancel
      falling back to the committed value
- [x] 3.2 The handle stands when the chart cannot be drawn: it is outside the
      boundary by construction — test: `wbs-table.test.tsx`, a throwing chart
      read shows the fault UI and the separator is still in the document and
      still applies a drag

## 4. The layout reset

- [x] 4.1 `resetColumnWidths` becomes `resetLayout`: forgets both keys, drops
      both overrides; button label `Reset layout`, title updated; offered
      while `widthOverrides.size > 0 || ganttHeightPx !== null`; the two
      `{@link Width reset}` JSDoc references (`table-frame.ts:288`,
      `wbs-table.tsx`) follow the glossary to **Layout reset** — test:
      `wbs-table.test.tsx`, a height override alone offers the reset and
      pressing it forgets the height; a reset with both in force forgets both
      keys; the existing no-overrides case still offers nothing
- [x] 4.2 The reset moves into the toolbar row as `data-toolbar`'s own child —
      never into `toolbarControls`, which the Plan actions sheet renders — and
      the own-line `data-width-controls` wrapper is deleted — test:
      `wbs-table.test.tsx`, the reset's parent is the toolbar row and no
      `data-width-controls` element exists; `plan-cards.test.tsx`'s sheet test
      ("offers no width control at all, because a card has no columns") stays
      green — it is the negative for the placement, watched failing when the
      reset was put in `toolbarControls`, 2026-08-09

## 5. The browser proves the gesture

- [x] 5.1 `e2e/gantt.spec.ts`: a real drag on the separator makes the panel
      measurably taller and the table frame shorter; a drag far past the
      bottom stops at `GANTT_MIN_PX`; a reload finds the dragged height again;
      `Reset layout` returns the panel to its default share and the height key
      is gone — negative: the same spec watched failing with the handle's
      `onPointerMove` application short-circuited, the fault the jsdom tests
      cannot see (R5 #14/#15's class)
- [x] 5.2 Gate: `bunx nx format:check --all` and
      `bunx nx run-many -t test lint typecheck build --parallel=2`, plus
      `openspec validate --all --json`; e2e on this worktree's own ports,
      never a reused dev server (the landmine)
