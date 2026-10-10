## 0. Spec

- [x] 0.1 Intent, delta spec and design; OpenSpec validation green (020.11, 2026-10-11). The
      glossary entry is task 0.2. Depends on `estimate-units` slice 5 for a sub-day slice to
      exist; the ladder itself does not.
- [ ] 0.2 Apply the glossary entry Sub-day rung to `CONTEXT.md` verbatim from
      `puni-plan/batch-10/interviews/glossary-delta.md`, in the first green commit of slice 1.

## 1. Ladder and geometry

- [ ] 1.1 Red: `gantt-geometry.test.ts` "a one-day slice is 224 px at the 1 h rung and 896 at
      15 min", "a day cell at a sub-day rung spans 480 working minutes", "weekends stay greyed
      at a sub-day rung", "every day-rung width is unchanged" (the existing cases rerun under
      `AXIS_RUNGS`); `gantt-panel.test.tsx` "the control offers six rungs with exact widths in
      their titles", "sub-day cells are labelled by clock time from 09:00";
      `remembered-layout.test.ts` "a remembered day-rung pixel value reads as its rung and an
      unknown value resets to Days". Files: `apps/wbs/fe-01/src/components/wbs/{gantt-geometry,gantt-panel,remembered-layout}.ts(x)`.
- [ ] 1.2 Green: `AXIS_RUNGS` replacing `DAY_SCALES` (day values and labels kept), the
      six-position control, the cell labels, `layOutGantt(plan, rung)`, the remembered rung by id.
- [ ] 1.3 Negatives: `cellsPerWorkday` for `1h` set to 24 → the 224 px case; the greyed
      weekend dropped at sub-day rungs → the weekend case.

## 2. Ticks, pointer surfaces and the collision list

- [ ] 2.1 Red: `gantt-geometry.test.ts` "a mark under 4 px is a 4 px tick with data-tick",
      "every mark's hit rect is at least 18 px"; `gantt-detail.test.tsx` "the card carries the
      exact span of a tick", "two overlapping surfaces open a list and the chosen line opens
      its card", "one surface opens the card directly"; `e2e/gantt.spec.ts` "a two-minute slice
      is a tick in a browser".
- [ ] 2.2 Green: tick paint, hit rects above the row line, the collision list in
      `gantt-detail.ts` and its component.
- [ ] 2.3 Negatives: the 4 px floor removed → the tick case (width `1.87`); the list bypassed
      for the nearest mark → "two overlapping surfaces…" opens the wrong card.

## 3. Offer rule

- [ ] 3.1 Red: `plan-chart-input.test.ts` "counts marks as visible leaves × steps";
      `gantt-panel.test.tsx` "3,000 marks disable the sub-day rungs and say so" (the words
      `not offered at 3000 marks`), "400 leaves × 5 steps offer them", "a filter past the
      limit moves to Days and says so"; the limit is read from `SUB_DAY_MARK_LIMIT`.
- [ ] 3.2 Green: `markCount`, `SUB_DAY_MARK_LIMIT = 2_500`, the disabled state with
      `data-not-offered`, the move-to-Days rule.
- [ ] 3.3 Negatives: the limit check removed → the 3,000 case offers the rung; the silent
      fallback (panel picks `4 h`) → "moves to Days and says so".

## 4. Measurement

- [ ] 4.1 Rerun the 020.07 harness on the shipped component at the 15 min rung for 500×5 and
      2000×5; record p95 interaction and mount beside the experiment's figures in `verify.md`.
      Not a CI gate.

## 5. Verify

- [ ] 5.1 fe-01 component tests, the Gantt e2e shards, `prettier --check`, `lint:fast`,
      `typecheck`, `openspec validate --all --json`, the host gate; outputs and every proof row
      in `verify.md`. `gantt-attempt-marks` is the follow-on change.
