## MODIFIED Requirements

### Requirement: A plan can be exported as a Mermaid gantt

A client SHALL be able to take the plan's chart as a Mermaid `gantt` block: one
task per placed slice, grouped into sections by a caller-chosen mode, carrying
the work item's number and name, its phase, and whoever is named on it.

The grouping mode SHALL be one of three: the row's outermost ancestor
(`outline`, the default a caller who states no preference gets); the role the
slice is estimated under (`phase`); or whoever is on the bar (`assignee`). A
slice under no role, or under nobody, SHALL still be grouped — under a
section named for that absence — rather than dropped, and that section SHALL
sort after every named one.

Every task SHALL carry two absolute dates and SHALL ask the renderer to compute
nothing. The dates are be-01's own schedule read through the chart's calendar
scale, rounded outward to whole days — a start down and a finish up, so no bar
is drawn shorter than the work in it.

The block SHALL declare that its end dates are inclusive, because a task's end
is the last day the work is still on and a renderer reading it as the boundary
after that draws every bar a day short.

The block SHALL say, inside itself, what it cannot draw: dependency arrows,
capacity and hand-off waits, slack, priority, the three-point figures, how many
people a work item ran at, and one colour per assignee. It SHALL also say that
it holds every row of the plan, including rows the screen had collapsed or
searched away.

The export SHALL name no team, in every grouping mode. The exported table
names it.

Wherever a grouping mode scatters one section's tasks across the row list —
`phase` and `assignee` both can, since two different rows can share a role or
a person — the block SHALL still draw that section as one contiguous run of
task lines, never as two separately headed bands of the same name.

#### Scenario: a slice becomes a dated task

- **GIVEN** a plan on a calendar with a placed slice
- **WHEN** it is exported as a Mermaid gantt
- **THEN** the block SHALL hold a task naming the work item and the phase
- **AND** the task SHALL carry the day the slice starts and the last day it is
  still on

#### Scenario: a work item deeper than the top level keeps its outline, under the default grouping

- **GIVEN** a slice on a work item three levels down, exported with no
  grouping mode stated
- **WHEN** it is exported
- **THEN** its section SHALL be the outermost work item above it
- **AND** its task SHALL carry its own number

#### Scenario: the diagram names no team

- **GIVEN** a plan whose work items state a team
- **WHEN** it is exported as a Mermaid gantt, in any grouping mode
- **THEN** no team name SHALL appear in the block

#### Scenario: grouping by phase gathers one role's slices into a single section

- **GIVEN** a plan with slices under the same role on two different rows, and
  a slice under no role
- **WHEN** it is exported as a Mermaid gantt grouped by phase
- **THEN** both same-role slices SHALL appear as one contiguous section named
  for the role
- **AND** the roleless slice SHALL appear in its own section, after every
  named role's

#### Scenario: grouping by assignee gathers one person's slices into a single section

- **GIVEN** a plan with slices naming the same person on two different rows,
  and a slice naming nobody
- **WHEN** it is exported as a Mermaid gantt grouped by assignee
- **THEN** both of that person's slices SHALL appear as one contiguous section
  named for them
- **AND** the unnamed slice SHALL appear in its own section, after every named
  person's

### Requirement: A name somebody typed cannot become syntax

The export SHALL neutralise every character of free text that the gantt grammar
reads as syntax rather than as text — the colon a task line splits on, the
comment opener, and line breaks — and SHALL leave every other character as it was
typed. Work item names, phase names, people's names and the project's name are
all free text, in every section-grouping mode.

No user-typed text SHALL reach a position the grammar reads as metadata: task
ids SHALL be generated.

#### Scenario: a work item named with a colon

- **GIVEN** a work item called `Phase 1: strip`
- **WHEN** the plan is exported
- **THEN** the task SHALL still carry its two dates and its generated id
- **AND** the name SHALL still read as the words that were typed

#### Scenario: a work item named with a comment opener

- **GIVEN** a work item whose name holds `%%`
- **WHEN** the plan is exported
- **THEN** the rest of that line SHALL survive

#### Scenario: a phase or a person named with a colon, grouped by that same field

- **GIVEN** a role named `QA: final`, exported grouped by phase
- **WHEN** the plan is exported
- **THEN** the section line SHALL still read as the words that were typed,
  with the colon replaced the same way a row's name would be
