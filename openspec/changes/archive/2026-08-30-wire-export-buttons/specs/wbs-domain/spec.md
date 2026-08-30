## MODIFIED Requirements

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

**A `Copy as Mermaid` button in the plan toolbar SHALL put the diagram on the
clipboard**, beside the existing `Copy as Markdown` button, and SHALL model the
same clipboard outcomes that button already does — no clipboard on the page,
the write refused, or done — plus the refusal above where there is no diagram
to copy at all.

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

#### Scenario: the toolbar button copies the diagram

- **GIVEN** a plan on a calendar with a placed slice, and a page with a
  clipboard
- **WHEN** the `Copy as Mermaid` button is clicked
- **THEN** the clipboard SHALL hold the Mermaid gantt block
- **AND** a toast SHALL say the copy happened

### Requirement: A plan not on a calendar is refused in words

A client asking for a Mermaid gantt of a plan with no start date SHALL be given a
sentence saying so and asking for a start date, and SHALL be given no diagram. A
Mermaid gantt has one axis and it is a calendar; an invented start would put
dates nobody agreed to into a document that outlives the screen.

The same SHALL hold for a plan whose dependencies run in a circle, and for a
plan nothing has been placed in: a sentence, and no diagram.

**The toolbar's `Copy as Mermaid` and `Download as Markdown` buttons SHALL show
this sentence as a toast, and SHALL copy or download nothing, wherever this
requirement refuses.**

#### Scenario: a plan with no start date

- **GIVEN** a plan whose start date is not set
- **WHEN** a Mermaid gantt is asked for
- **THEN** the answer SHALL be a refusal naming the missing start date
- **AND** SHALL carry no diagram

#### Scenario: a plan whose dependencies run in a circle

- **GIVEN** a plan be-01 could not order
- **WHEN** a Mermaid gantt is asked for
- **THEN** the answer SHALL be a refusal and SHALL carry no diagram

#### Scenario: the toolbar shows the refusal as a toast

- **GIVEN** a plan whose start date is not set
- **WHEN** the `Copy as Mermaid` or `Download as Markdown` button is clicked
- **THEN** a toast SHALL show the refusal sentence
- **AND** nothing SHALL be copied or downloaded

### Requirement: A plan can be exported as a bundled Mermaid document

A client SHALL be able to take a plan as one Markdown document holding a header
block, a Mermaid `gantt` fence of the plan's chart, and the same table
`planToMarkdown` writes, in that order. The document SHALL exist only where the
diagram exists: it SHALL be refused with the same sentence, and for the same
reason, wherever a Mermaid gantt of the plan is refused.

The header block SHALL state that the document holds the whole plan — every row
and slice, including any a collapsed branch or a running search had hidden on
screen — because the chart on screen may draw fewer.

The fence SHALL be long enough that no run of backticks anywhere in the
diagram's text, including inside a work item's name, can close it before the
diagram ends.

**A `Download as Markdown` button in the plan toolbar SHALL save this document
as a `.md` file**, beside the existing `Download CSV` button, named the same
way `planFileName` already names the CSV, with the `.md` extension.

#### Scenario: a plan on a calendar becomes one document

- **GIVEN** a plan on a calendar with a placed slice
- **WHEN** it is exported as a bundled Mermaid document
- **THEN** the document SHALL hold, in order, a header block, a Mermaid gantt
  fence, and the exported table
- **AND** the header block SHALL state that the document holds the whole plan

#### Scenario: a plan with no start date is refused, and no document is given

- **GIVEN** a plan whose start date is not set
- **WHEN** a bundled Mermaid document is asked for
- **THEN** the answer SHALL be the same refusal a Mermaid gantt of that plan is
  given
- **AND** SHALL carry no document

#### Scenario: a task name carrying a run of backticks cannot close the fence early

- **GIVEN** a work item whose name holds three backticks
- **WHEN** the plan is exported as a bundled Mermaid document
- **THEN** the fence around the diagram SHALL use more backticks than the
  longest run inside it
- **AND** the table SHALL still follow the diagram inside that fence, not fall
  outside it as prose

#### Scenario: the toolbar button downloads the bundled document

- **GIVEN** a plan on a calendar with a placed slice
- **WHEN** the `Download as Markdown` button is clicked
- **THEN** a `.md` file SHALL be saved holding the header block, the fence, and
  the table
