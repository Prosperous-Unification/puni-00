## 0. Spec

- [x] 0.1 Intent and delta spec; OpenSpec validation green (020.11, 2026-10-11). The glossary
      entry is task 0.2. Depends on `sub-day-gantt-axis` slices 1–3 and `step-node-attempts`
      slice 5. No `design.md`: the shape is the spec plus `sub-day-gantt-axis/design.md`.
- [ ] 0.2 Apply the glossary entry Attempt mark to `CONTEXT.md` verbatim from
      `puni-plan/batch-10/interviews/glossary-delta.md`, in the first green commit of slice 1.

## 1. Geometry

- [ ] 1.1 Red: `gantt-geometry.test.ts` "one mark per attempt over the planned slice at a
      sub-day rung", "a running mark ends at the given now", "an instant is placed by its
      project-zone day and minute", "the part outside 09:00–17:00 is clamped with
      data-clamped", "no mark at a day rung", "every day-rung case unchanged";
      `plan-chart-input.test.ts` "attempts count toward markCount". Files:
      `apps/wbs/fe-01/src/components/wbs/{gantt-geometry,plan-chart-input}.ts`.
- [ ] 1.2 Green: `STAGE_ONE_DAY_START_MINUTE = 540` in `gantt-geometry.ts` with JSDoc naming it
      the anchor instants are placed from before the instant axis, "retired by
      `agent-calendar-instant-axis`"; `attemptMarksOf(node, rung, zone, now)` in `layOutGantt`; `markCount` with
      attempts; `now` as a prop of the panel.
- [ ] 1.3 Negatives: `Date.now()` used inside geometry → "a running mark ends at the given now"
      (a frozen `now` differs); the clamp removed → the overnight case draws into the next
      day's cell; attempts dropped from `markCount` → the 2,501 case offers the rung.

## 2. Paint, card and the browser

- [ ] 2.1 Red: `gantt-panel.test.tsx` (solid, hatched, dotted, running `data-attempt` values;
      the planned slice stays underneath; a 2-minute attempt is a tick in the collision list);
      `gantt-detail.test.tsx` (number, outcome, zoned instants, executor, reference; the true
      instants on a clamped mark); `e2e/gantt.spec.ts` "three attempts over one slice in a
      browser" pixel shard at the `15 min` rung.
- [ ] 2.2 Green: paint styles per outcome, the card body, the pixel fixture.
- [ ] 2.3 Negatives: the hatched and dotted styles swapped → the `data-attempt` test; the card
      formatting instants in the browser zone → the zoned-instants test under
      `TZ=America/Los_Angeles`.

## 3. Verify

- [ ] 3.1 fe-01 component tests, the Gantt e2e shards, `prettier --check`, `lint:fast`,
      `typecheck`, `openspec validate --all --json`, the host gate; outputs and every proof row
      in `verify.md`.
