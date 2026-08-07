## ADDED Requirements

### Requirement: A name is shown in full, not cropped

The Name cell SHALL be as tall as the text it holds, whether or not it has the
focus, so a name that wraps is read rather than hidden. Its height at rest
SHALL be capped so that one very long name cannot dominate the table, and the
cap SHALL be lifted while the cell has the focus.

#### Scenario: a name that needs three lines

- **WHEN** a name too long for one line is shown and nothing is focused
- **THEN** the cell is as tall as the wrapped text

#### Scenario: an unreasonably long name

- **WHEN** a name far longer than the cap is shown
- **THEN** the cell stops at the cap at rest, and the cap is lifted when the
  cell takes the focus

### Requirement: A date that cannot be honoured cannot be entered

The per-work-item earliest-start field SHALL be disabled while the project has
no start date, and SHALL say that the project start date is needed. The Starts
and Ends column headers SHALL name their unit as days while the project has no
start date, and SHALL drop it once the project has one.

#### Scenario: no calendar yet

- **WHEN** a project with no start date is shown
- **THEN** every earliest-start field is disabled and explains why, and the
  headers read "Starts (day)" and "Ends (day)"

#### Scenario: the plan is put on a calendar

- **WHEN** the project's start date is set
- **THEN** the earliest-start fields become editable and the headers read
  "Starts" and "Ends"
