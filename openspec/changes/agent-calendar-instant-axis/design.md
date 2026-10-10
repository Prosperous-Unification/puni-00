# design — `agent-calendar-instant-axis`

Rationale lives in
[ADR 0043](../../../docs/adr/0043-agent-steps-run-on-a-continuous-calendar-and-quota-is-not-a-calendar.md).
Interview: `puni-plan/batch-10/interviews/020.09-answers.md` Q0, Q3 (after the instant axis), Q3c;
`020.10-answers.md` Q9. XL; the engine slices are **gated** on the proof script (D0).

## D0 — The gate

`prove_mixed_calendars.py` beside `prove_dependencies.py` in
`puni-plan/wbs-feedback-2026-09-26/cpsat-proof/` models three slices on a minute axis — a
human slice bound to a 09:00–17:00 Monday–Friday window, an agent slice unbounded, a human
successor of the agent slice — with `AddNoOverlap` for the person and the window expressed as
forbidden intervals, and prints the schedule and solver status. It must report `OPTIMAL` or
`FEASIBLE` with the human successor starting at the next working instant after the agent's
finish, and render the result with the sub-day Gantt fixture ("make it look pretty"). Its
output is pasted into `verify.md`. Slices 2–5 open only after that paste exists; slice 1 and
the red tests of slice 2 may be written before it.

## Allocated numbers — allocated at packet time

Same procedure as `estimate-units/design.md`. Expected to move: `SCHEDULER_CONTRACT_VERSION`
(the axis changes every plan's canonical input hash; the corpus lint will demand it),
`CACHE_DTO_VERSION`, the solver wire version (quantum restated in minutes),
`PLAN_DOCUMENT_VERSION`, `CANONICAL_PLAN_INPUT_SCHEMA_VERSION`, one migration stamp. Pins on
`a3b1526b`: contract 15, document 6, schema 4, newest stamp `20261005110000_add_shared_people`.

## D1 — Columns

- `step.executor_kind TEXT NOT NULL DEFAULT 'either' CHECK (executor_kind IN
('human','agent','either'))`, `EXECUTOR_KINDS` in `stored-vocabularies.ts`. **Allocation-time
  decision (slice 1.2):** check `origin/main`; if 010.4.13.3 (`configure-project-step-workflows`)
  has shipped `step.executor_kind` with exactly this name, default and `CHECK`, this migration
  omits the `ALTER` and its CHECK test and `down.sql` does not drop the column; otherwise it adds
  the column. Which branch was taken is recorded here and in `verify.md`. The two packets agree on
  the definition by this paragraph.
- `project.working_window_start_minute INTEGER NOT NULL DEFAULT 540`,
  `project.working_window_end_minute INTEGER NOT NULL DEFAULT 1020`, `CHECK (0 <= start <
end <= 1440)`. Minutes from midnight in the project timezone (`step-node-attempts`). The
  default is 480 minutes long, which is `WORKDAY_MINUTES`.

An older image ignores both; the swap's stored-vocabulary step gains `executor-kinds-cli.ts`
so a rollback over `agent` steps aborts (an older image would schedule them on the workday
axis, moving dates). `down.sql` refuses over a non-`either` kind (only when this migration added the column) or a
non-default window, naming a rollback CLI, then drops exactly the columns this migration added.

## D2 — The instant axis

`schedule.ts` plans in epoch milliseconds internally. A **calendar** is a function from an
instant to the next working instant and from an instant plus a duration to a finish:
`workingWindowCalendar(zone, startMinute, endMinute)` (weekends off) and
`continuousCalendar`. A slice's calendar is its step's executor kind: `agent` →
continuous, `human` and `either` → the window. Dependencies, person queues, pools, floors
and deadlines compare instants; a successor's start is its calendar's next working instant
at or after the predecessor's finish. `snapWorkdays` and the drift window move to minutes
(`snapMinutes`, 1e-6 min). The wire keeps workday offsets and dates for every reader
(`Scheduled` unchanged in shape) by converting at the boundary; `startsOn`/`endsOn` are the
project-zone days. Under the default window and no `agent` steps, every slice's day boundaries
equal today's, which `live-plan-identity.test.ts` and both golden corpora assert.

## D3 — CP-SAT

`durationUnits` become minutes (quantum 1); the request carries each slice's calendar as
forbidden intervals over the horizon (window calendar) or none (continuous). The
`solver-preflight` horizon check in minutes is the guard (`horizon-overflow`);
`MAX_ESTIMATE_MINUTES` bounds a single slice, not the horizon. The proof script of D0 is the
model. `revalidate-solver-result.ts` checks a
window slice never occupies a forbidden interval.

## D4 — Gantt

At sub-day rungs a calendar day is 24 h; hours outside the working window are greyed as
weekends are; the before-instant-axis clamp of `gantt-attempt-marks` is removed (an instant now has a
place). Agent slices draw through the grey.

## D5 — `forecast-remaining-work` (last slice)

A node whose statement is `done` takes zero remaining duration and is placed at its attempts'
span (first start to last end; with no attempts, at its fact span's days; with neither, at
zero duration at its earliest start). A node with a running attempt pins its start to the
attempt's start and keeps its charged duration from there. Both engines read the same
`remainingWorkOf` and the canonical input carries it. This is the one slice that re-baselines
`live-plan-identity.test.ts` and the corpora, and it does so explicitly in its own commit
with the before and after values in `verify.md`.
