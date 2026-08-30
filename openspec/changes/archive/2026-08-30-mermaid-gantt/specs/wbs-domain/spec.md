## ADDED Requirements

### Requirement: A plan can be exported as a Mermaid gantt

A client SHALL be able to take the plan's chart as a Mermaid `gantt` block: one
task per placed slice, grouped by the outermost work item each slice hangs
under, carrying the work item's number and name, its phase, and whoever is named
on it.

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

The export SHALL name no team. The exported table names it, and the diagram's
one grouping channel is spent on the plan's outline.

#### Scenario: a slice becomes a dated task

- **GIVEN** a plan on a calendar with a placed slice
- **WHEN** it is exported as a Mermaid gantt
- **THEN** the block SHALL hold a task naming the work item and the phase
- **AND** the task SHALL carry the day the slice starts and the last day it is
  still on

#### Scenario: a work item deeper than the top level keeps its outline

- **GIVEN** a slice on a work item three levels down
- **WHEN** it is exported
- **THEN** its section SHALL be the outermost work item above it
- **AND** its task SHALL carry its own number

#### Scenario: the diagram names no team

- **GIVEN** a plan whose work items state a team
- **WHEN** it is exported as a Mermaid gantt
- **THEN** no team name SHALL appear in the block

### Requirement: A plan not on a calendar is refused in words

A client asking for a Mermaid gantt of a plan with no start date SHALL be given a
sentence saying so and asking for a start date, and SHALL be given no diagram. A
Mermaid gantt has one axis and it is a calendar; an invented start would put
dates nobody agreed to into a document that outlives the screen.

The same SHALL hold for a plan whose dependencies run in a circle, and for a
plan nothing has been placed in: a sentence, and no diagram.

#### Scenario: a plan with no start date

- **GIVEN** a plan whose start date is not set
- **WHEN** a Mermaid gantt is asked for
- **THEN** the answer SHALL be a refusal naming the missing start date
- **AND** SHALL carry no diagram

#### Scenario: a plan whose dependencies run in a circle

- **GIVEN** a plan be-01 could not order
- **WHEN** a Mermaid gantt is asked for
- **THEN** the answer SHALL be a refusal and SHALL carry no diagram

### Requirement: A name somebody typed cannot become syntax

The export SHALL neutralise every character of free text that the gantt grammar
reads as syntax rather than as text — the colon a task line splits on, the
comment opener, and line breaks — and SHALL leave every other character as it was
typed. Work item names, phase names, people's names and the project's name are
all free text.

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
