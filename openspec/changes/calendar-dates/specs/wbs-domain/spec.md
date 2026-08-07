## ADDED Requirements

### Requirement: A project may begin on a calendar day

A project SHALL hold a start date, or null. While it is null the schedule SHALL
report day offsets and no dates. When it is set, every work item SHALL report
the days it starts and ends on. A start date that is not a real calendar day
SHALL be refused and the project SHALL keep the date it had.

#### Scenario: no calendar yet

- **WHEN** a project with no start date is read
- **THEN** its work items report no dates, and the offsets are unchanged

#### Scenario: a day that does not exist

- **WHEN** a project is asked to start on `2026-02-31`
- **THEN** the request is refused with 422

### Requirement: Dates count working days only

Dates SHALL be computed over working days: Saturdays and Sundays are not days
on which work happens. A work item's end date SHALL be the last day its work is
still on, not the day after. A project whose start date falls on a weekend
SHALL begin on the following Monday.

#### Scenario: a task that spans a weekend

- **GIVEN** a project starting Thursday 2026-08-06, a two-day task, and a
  second two-day task that waits for it
- **WHEN** the tree is read
- **THEN** the first runs 2026-08-06 to 2026-08-07 and the second runs
  2026-08-10 to 2026-08-11

### Requirement: A work item may be told not to start before a day

A work item SHALL hold a day it may not start before, or null. The schedule
SHALL treat it as a floor and never as a pin: a work item starts on the later
of that day and the day its dependencies allow. Everything that waits on the
work item SHALL move with it. Clearing it SHALL return the item to its
dependencies alone.

#### Scenario: the constraint pushes an item later

- **GIVEN** an unblocked work item in a plan starting Thursday 2026-08-06
- **WHEN** it is told not to start before 2026-08-12
- **THEN** it starts on 2026-08-12

#### Scenario: a dependency pushes past the constraint

- **GIVEN** a work item told not to start before 2026-08-07, waiting on a
  six-day predecessor in a plan starting 2026-08-06
- **WHEN** the tree is read
- **THEN** it starts on 2026-08-14, where the predecessor leaves it

#### Scenario: no dates from a schedule that failed

- **GIVEN** a project on a calendar whose dependencies run in a circle
- **WHEN** the tree is read
- **THEN** no work item reports dates
