## ADDED Requirements

### Requirement: The plan leaves the tool as Markdown or CSV

The table SHALL offer, without asking be-01 for anything, a copy of the whole
current project as a Markdown table on the clipboard and as a downloaded CSV
file. Both SHALL carry every work item in the project's own order, whatever the
viewer has collapsed or searched for. Both SHALL begin with a header block
naming the project, the estimate method **by name**, the project start date or
that there is none, what the date columns mean, when the export was taken, and
that the figures are unrounded. The CSV SHALL carry that block as leading
`key,value` records followed by a blank record, because CSV has no comment
syntax; the Markdown SHALL carry it as a block above the table. The exported
table SHALL be flat: the derived work item number is the outline.

#### Scenario: the header says how to read the table

- **WHEN** a plan planned with PERT is exported
- **THEN** the header names the project, says `Final figures: PERT`, carries the
  timestamp it was given, and stands above the table in both formats

#### Scenario: a plan that is not on a calendar

- **GIVEN** a project with no start date
- **WHEN** it is exported
- **THEN** the header says the plan is not on a calendar and the schedule
  columns read `day 2`, `day 5` rather than dates

#### Scenario: a plan that is on a calendar

- **GIVEN** a project with a start date
- **WHEN** it is exported
- **THEN** the header says the dates skip weekends and the schedule columns hold
  those dates

#### Scenario: the whole plan, not the view of it

- **GIVEN** a branch collapsed and a search narrowing the table to one row
- **WHEN** the plan is exported
- **THEN** every work item in the project is in the export

### Requirement: The export says what a figure is, and what an empty cell is

Exported final figures SHALL be the full-precision figures the schedule was
computed from, not the one-decimal figures the table displays. A leaf nobody has
estimated for a role SHALL export empty cells for that role and an empty total,
never `0`. A work item whose figures are rolled up from the rows beneath it
SHALL be marked `(sum)` in Markdown and SHALL NOT be marked in CSV. Team,
assignee and dependency ids SHALL be exported as names and work item numbers,
and the assumption that a lone assignee does every phase SHALL be stated rather
than exported as a blank. When no schedule could be computed, the schedule
columns SHALL say so rather than exporting the zeroed schedule as day offsets.

#### Scenario: unrounded, not as displayed

- **GIVEN** a row whose PERT final is `3.6666666666666665` and shows as `3.7`
- **WHEN** the plan is exported
- **THEN** the cell holds `3.6666666666666665`

#### Scenario: nobody has looked

- **GIVEN** a leaf with no estimate for either role
- **WHEN** the plan is exported
- **THEN** its estimate cells, its finals and its total are empty

#### Scenario: a sum is marked as one

- **GIVEN** a parent whose Dev final is the sum of its children's
- **WHEN** the plan is exported
- **THEN** the Markdown cell reads `7 (sum)` and the CSV cell reads `7`

#### Scenario: ids are resolved to what people call things

- **GIVEN** a row labelled with a team, waiting on `010` and `020`, with one
  person assigned to Dev and nobody assigned to QA
- **WHEN** the plan is exported
- **THEN** the team column holds the team's name, Depends on holds `010, 020`,
  the Dev assignee is that person's name and the QA assignee says they are
  assumed to do every phase

#### Scenario: no schedule to export

- **GIVEN** dependencies that run in a circle
- **WHEN** the plan is exported
- **THEN** the header says so and every Starts, Ends and Slack cell reads `—`

### Requirement: The CSV is RFC 4180 and safe to open in a spreadsheet

Every CSV field containing a comma, a double quote or a line break SHALL be
enclosed in double quotes with contained quotes doubled, and records SHALL be
separated by CRLF, so that a note written over several lines survives as one
cell. Every field whose first character is `=`, `+`, `-`, `@`, a tab or a
carriage return SHALL be prefixed with an apostrophe, so a typed name cannot
reach a spreadsheet as a formula (CSV injection, CWE-1236). The downloaded file
SHALL begin with a UTF-8 byte-order mark and SHALL be named after the project
and the day it was taken.

#### Scenario: hostile names and notes survive a strict reader

- **GIVEN** work items named `a,b` and `say "hi"` and a note written over three
  lines
- **WHEN** the CSV is read by a parser that implements RFC 4180 and nothing else
- **THEN** every field comes back exactly as it was typed and every record has
  the same number of fields

#### Scenario: a name that would be a formula

- **GIVEN** a work item named `=SUM(A1)` and a note starting `@echo`
- **WHEN** the plan is exported
- **THEN** both fields are prefixed with an apostrophe

#### Scenario: the file lands under a name

- **GIVEN** a project called `Rewire the shed`
- **WHEN** the CSV is downloaded
- **THEN** it is named `rewire-the-shed-<the export's date>.csv` and starts with
  a byte-order mark

### Requirement: A refused clipboard is reported

The Markdown copy SHALL report, as an error toast naming the CSV download as the
way out, both a page that has no clipboard at all and a clipboard that refuses
the write. A copy that lands SHALL be reported as an info toast.

#### Scenario: copied

- **WHEN** the clipboard accepts the write
- **THEN** an info toast says so and no alert is raised

#### Scenario: the clipboard refuses

- **WHEN** the clipboard rejects the write
- **THEN** an error toast says the browser refused it and points at the CSV

#### Scenario: no clipboard at all

- **GIVEN** a page served over http, where the clipboard API is absent
- **WHEN** Copy as Markdown is activated
- **THEN** an error toast says the page has no clipboard and points at the CSV
