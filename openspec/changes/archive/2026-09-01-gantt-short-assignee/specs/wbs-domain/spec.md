## MODIFIED Requirements

### Requirement: A bar names its assignee by their short name

A Gantt bar carrying an assignee SHALL write that person's short name — the one
or two characters `initialsOf` answers with — and SHALL never write the full
name, whatever width the bar has.

The short name SHALL be the same one the table's folded step cells use, so one
person reads identically on both faces.

A bar with no room for the short name SHALL write no assignee at all, and a bar
with nobody on it SHALL write none.

#### Scenario: one person, two bar widths

- **GIVEN** a plan where one person is on a ten-workday bar and a one-workday
  bar
- **WHEN** the chart is read
- **THEN** both bars SHALL name them by the same two characters

#### Scenario: the chart and the table agree

- **GIVEN** a work item whose step is assigned to a person with a one-word name
- **WHEN** the bar's label and the folded step cell are read
- **THEN** both SHALL name that person by the same characters
