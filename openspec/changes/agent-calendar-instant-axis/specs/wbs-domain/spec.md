## ADDED Requirements

### Requirement: A step has an executor kind

Every project step SHALL carry an executor kind of `human`, `agent` or `either`, stored as
`step.executor_kind`, `either` for every step that exists before this change and for a step
created without one. It SHALL be editable on step create and patch (`422
invalid_executor_kind` outside the vocabulary) and shown in the steps settings. It SHALL be a
definition fact: no per-node override. The person kind of an assignee SHALL remain a label and
SHALL NOT decide a slice's calendar.

#### Scenario: existing steps are either

- **GIVEN** a project created before this change
- **WHEN** its steps are read
- **THEN** every step reports `executorKind: 'either'`

#### Scenario: an agent assignee does not change the calendar

- **GIVEN** a `human` step assigned to a directory person of kind `agent`
- **WHEN** the plan is scheduled
- **THEN** the slice runs inside the working window

### Requirement: A project has a working window and slices run on calendars

A project SHALL carry a working window — start and end minute of day in the project timezone,
09:00–17:00 unless set, `422 invalid_working_window` unless `0 ≤ start < end ≤ 1440` — shown
in Settings. Slices of `human` and `either` steps SHALL occupy the working window on weekdays
only; slices of `agent` steps SHALL run continuously, every hour of every day. A successor
SHALL start at its own calendar's next working instant at or after its predecessor's finish.
Both engines SHALL read the same axis and calendars. Under the default window with no `agent`
step, every slice's day boundaries SHALL equal the dates the workday axis produced.

#### Scenario: an agent runs through the night and its human successor waits for morning

- **GIVEN** `A → B` in a `UTC` project, A an `agent` step charged `600 min` starting
  2026-10-12 15:00, B a `human` step
- **WHEN** the plan is scheduled
- **THEN** A finishes 2026-10-13 01:00 and B starts 2026-10-13 09:00

#### Scenario: a human stops for the weekend

- **GIVEN** a `human` step charged `600 min` starting Friday 2026-10-16 15:00
- **WHEN** the plan is scheduled
- **THEN** it finishes Monday 2026-10-19 17:00 (two hours on Friday, eight on Monday)

#### Scenario: the default window keeps every date

- **GIVEN** every live-plan identity fixture and golden corpus case, no step `agent`
- **WHEN** scheduled on the instant axis under the default window
- **THEN** every `startsOn`, `endsOn` and workday offset equals the stored value

### Requirement: Quota is modelled as capacity, never as a calendar

No calendar, window or rate limit SHALL be stored for a provider. Agent concurrency SHALL be a
capacity on a team of agent-kind people, counted in slots as any pool is.

#### Scenario: two agents, one slot

- **GIVEN** a team `Agents` with capacity 1 and two `agent` slices labelled with it
- **WHEN** the plan is scheduled
- **THEN** the second starts when the first finishes, through the pool and nothing else

### Requirement: The Gantt greys non-working hours at sub-day rungs

At a sub-day rung a calendar day SHALL be drawn as 24 hours with the hours outside the working
window greyed as weekends are; agent slices SHALL draw through the grey; the clamp of attempt
marks SHALL be removed and an instant SHALL be drawn where it is.

#### Scenario: an overnight attempt is drawn where it ran

- **GIVEN** an attempt 16:30–02:10 at the `4 h` rung
- **WHEN** the panel renders
- **THEN** its mark crosses the greyed hours into the next day with no `data-clamped`

### Requirement: Done nodes take no remaining duration and running nodes pin to their start

In the last slice of this change, a step node stated `done` SHALL take zero remaining duration
and be placed at its attempts' span (its fact span's days with no attempts; zero duration at
its earliest start with neither); a node with a running attempt SHALL start at that attempt's
start and keep its charged duration from there. Both engines SHALL agree. The live-plan
identity oracles and the golden corpora SHALL be re-baselined by this slice alone, in its own
commit, with before and after values recorded in `verify.md`.

#### Scenario: a finished Dev frees the plan

- **GIVEN** `010.dev` charged 3 days, stated `done` with attempts spanning 2026-10-12
  09:00–2026-10-12 12:00, and `010.qa` after it
- **WHEN** the plan is scheduled
- **THEN** `010.dev` occupies that span and `010.qa` starts 2026-10-12 12:00

#### Scenario: a running node holds its start

- **GIVEN** `010.dev` charged 3 days with an attempt running since 2026-10-12 14:00
- **WHEN** the plan is scheduled on 2026-10-13
- **THEN** `010.dev` starts 2026-10-12 14:00 and keeps its 3 charged days from there
