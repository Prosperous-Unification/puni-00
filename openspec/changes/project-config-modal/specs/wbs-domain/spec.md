## MODIFIED Requirements

### Requirement: A project's configuration is edited in one place

The system SHALL offer one toolbar control that opens a single modal holding
every project-level setting: the project's teams and their capacity, its
priority ladder, and its steps.

The separate toolbar controls for those three SHALL be removed. The modal's
sections SHALL be reached by a tab list, SHALL each keep the behaviour, writes
and refusals they had as separate dialogs, and SHALL stay mounted while another
section is shown, so that a half-typed value survives a glance at another
section.

#### Scenario: one control opens every project setting

- **WHEN** the plan toolbar is read
- **THEN** exactly one control SHALL open project configuration
- **AND** no separate control for teams, priorities or steps SHALL be offered
- **AND** opening it SHALL show all three sections in its tab list

#### Scenario: a half-typed value survives a look at another section

- **GIVEN** the modal open on the teams section with a capacity typed and not committed
- **WHEN** another section is shown and then the teams section again
- **THEN** the typed value SHALL still be in its field

### Requirement: The modal refuses to close over an edit in flight, and shows what is holding it

The system SHALL refuse Escape, the close control and a click outside while any
section holds an uncommitted edit or a write in flight. The refusal SHALL show
the section holding it.

#### Scenario: an in-flight write holds the modal open and is shown

- **GIVEN** the modal open on the priorities section with a write in flight, and
  the steps section shown
- **WHEN** Escape is pressed
- **THEN** the modal SHALL stay open
- **AND** the priorities section SHALL be the one shown

#### Scenario: a clean modal closes from any section

- **GIVEN** the modal open with no uncommitted edit in any section
- **WHEN** Escape is pressed
- **THEN** the modal SHALL close

### Requirement: The modal reopens on the section last used for that project

The system SHALL remember, per project and per browser, which section was last
shown, and SHALL open on it.

A remembered value that is not a section this project offers SHALL be dropped
and the first section shown.

#### Scenario: the modal reopens where it was left

- **GIVEN** the modal was last closed on the priorities section of a project
- **WHEN** it is opened again for that project
- **THEN** the priorities section SHALL be shown

#### Scenario: an unrecognised remembered section is dropped

- **GIVEN** a remembered section value naming no section this project offers
- **WHEN** the modal is opened
- **THEN** the first section SHALL be shown
- **AND** the unrecognised value SHALL NOT be kept
