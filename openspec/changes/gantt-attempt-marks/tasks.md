## 0. Spec

- [x] 0.1 Intent and delta spec; initial OpenSpec validation recorded at packet creation
      (020.11, 2026-10-11). Architecture rulings are in `design.md`. Depends on
      `sub-day-gantt-axis` slices 1–3 and `step-node-attempts` slices 5–6, including timezone
      on the chart read. The glossary entry is task 0.2.
- [ ] 0.2 Apply the glossary entry Attempt mark to `CONTEXT.md` verbatim from
      `puni-plan/batch-10/interviews/glossary-delta.md`, in the first green commit of slice 1.

## 1. Inputs, geometry and display range

- [ ] 1.1 Red: `gantt-geometry.test.ts` "one mark per eligible attempt over the planned
      slice at a sub-day rung", "completed leaves keep planned slices under their attempts",
      "a running mark ends at the given now", "an instant is placed by its project-zone day
      and minute", "early and late attempts clamp to selectable edge ticks", "overnight and
      multi-day attempts stop at the start day's 17:00", "running overnight marks retain an
      open capped edge", "attempt start dates extend both sides of the forecast range",
      "extending the range preserves forecast and dependency coordinates", "weekend attempt
      dates stay on calendar days", "no mark at a day rung", "every day-rung case unchanged";
      `plan-chart-input.test.ts` "only eligible visible attempts count toward markCount",
      "unavailable overlay adds no attempt count". Files:
      `apps/wbs/fe-01/src/components/wbs/{gantt-geometry,plan-chart-input}.ts`.
- [ ] 1.2 Green: carry node identities, attempts and project zone in the chart input;
      explicit overlay availability; pure attempt projection with the supplied `now`;
      reuse the axis foundation's `STAGE_ONE_DAY_START_MINUTE = 540` with JSDoc naming its
      retirement by `agent-calendar-instant-axis`; one start-day-clamped mark per attempt;
      sub-day forecast slices on completed leaves; shared eligibility for mark count and
      display range; range translation without rewriting schedule coordinates.
- [ ] 1.3 Negatives: `Date.now()` inside geometry → the supplied-now case; the clamp removed
      → overnight paint enters the next day's cell; done-row coalescing retained at sub-day
      rungs → the two-slice completed-row case; attempts dropped from count → 2,501 offered;
      hidden attempts included → filtered count/range cases; forecast-only bounds retained
      → earlier/later attempt dates are clipped. Observe each failure and add adjacent
      `Proof:` comments with the test and fault.

## 2. Paint, availability, card and the browser

- [ ] 2.1 Red: `gantt-panel.test.tsx` and its zoned suite: all four `data-attempt` values and
      their actual solid/hatch/dot/open-edge paint; planned slices underneath on completed
      rows; a two-minute attempt is a tick in the collision list; original instants, attempt
      number, outcome, executor and reference in cards; absent start, absent zone and both
      absent render the prescribed messages with the forecast; malformed supplied inputs
      reach the Error Boundary; new `now` and changed attempts repaint through memoization;
      cards and hits agree after left-range translation; SVG export preserves the range and
      paint. Put card assertions against the real panel or an extracted card component:
      `gantt-detail.ts` owns the detail toggle, not the cards.
- [ ] 2.2 Green: paint styles and cards; explicit unavailable messages; panel clock prop
      and memoization; translated hit geometry and headers; export parity. Add browser
      fixtures for three attempts over one slice, all four outcomes, a completed row and
      an attempt before the forecast origin, at `15 min`.
- [ ] 2.3 Negatives: keep `data-attempt` intact and swap the actual hatch/dot mappings or
      pattern definitions → the actual-paint assertion fails; format cards in the browser
      zone → zoned-instants test fails under `TZ=America/Los_Angeles`; substitute today or
      browser zone for an absent input → availability cases fail; translate paint without
      its hit surfaces → the browser selection case fails. Record every observed proof.

## 3. Verify

- [ ] 3.1 fe-01 component tests, the Gantt e2e shards, `prettier --check`, `lint:fast`,
      `typecheck`, `openspec validate --all --json`, the host gate; outputs and every proof row
      in `verify.md`. Include unchanged day-rung assertions with attempts present.
- [ ] 3.2 Record an attempt-inclusive performance fixture within 2,500 total marks. Follow
      `sub-day-gantt-axis/design.md` D4 for the oversized renderer-only measurement; label
      it separately from production panel behavior. Neither a production bypass nor a
      changed `SUB_DAY_MARK_LIMIT` is permitted for the measurement; no CI timing gate.
