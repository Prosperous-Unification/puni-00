## ADDED Requirements

### Requirement: A work item records the external work it stands for

The system SHALL hold, per work item, an ordered list of **external refs**, each
being an external system and a URL. A work item MAY hold several refs to one
system.

The external system SHALL be a name from a directory-wide vocabulary, unique by
name, seeded with the known systems and extended by naming a new one.

A work item's refs SHALL be edited by full replacement, so that adding or
removing one preserves the others, and undo SHALL restore the previous list.

#### Scenario: a work item holds several refs to one system

- **GIVEN** a work item with two GitHub pull-request refs
- **WHEN** a third ref to a different system is added
- **THEN** the work item SHALL hold three refs
- **AND** the two GitHub refs SHALL be unchanged

#### Scenario: naming an unknown system saves it

- **WHEN** a ref is stored with a system name the vocabulary does not hold
- **THEN** the vocabulary SHALL hold that name afterwards
- **AND** a later ref MAY be given the same name

### Requirement: A ref's system is derived from its URL once, and then stored

The system SHALL, when a ref is added or its URL changed in the app, derive the
external system from the URL and store the derived name. A URL matching no known
pattern SHALL leave the system to be named by the reader.

The stored system SHALL NOT be re-derived when the ref is read. Changing the
derivation rules SHALL NOT change any existing ref.

The reader SHALL be able to change a ref's system, and that choice SHALL be kept.

#### Scenario: a pasted pull-request URL types itself

- **WHEN** a GitHub pull-request URL is added as a ref
- **THEN** its stored system SHALL be the canonical GitHub pull-request name

#### Scenario: a new rule does not re-type an existing ref

- **GIVEN** a ref stored with a system a reader chose by hand
- **WHEN** a derivation rule is added that would match its URL differently
- **THEN** the ref's stored system SHALL be unchanged

#### Scenario: an unmatched URL is left to the reader

- **WHEN** a URL matching no known pattern is added
- **THEN** no system SHALL be derived
- **AND** the ref SHALL NOT be stored until a system is named

### Requirement: A narrow column shows which systems a row links to

The system SHALL render a fixed-width column immediately after the work item
number, showing one mark per **distinct** external system the row links to,
never one per ref.

The marks SHALL NOT change the column's width or the row's height, whatever
number of refs or systems the row holds. Where more distinct systems are present
than the column can show, the surplus SHALL be shown as a single overflow mark.

A work item with no refs SHALL render an empty cell, not a placeholder
character.

#### Scenario: four refs to one system are one mark

- **GIVEN** a work item with four GitHub refs and one Jira ref
- **WHEN** its cell is read
- **THEN** it SHALL show two marks

#### Scenario: the column and the row do not move

- **GIVEN** one work item with no refs and one with refs to four systems
- **WHEN** their rows and their cells are measured
- **THEN** the two rows SHALL be the same height
- **AND** the two cells SHALL be the same width

#### Scenario: no refs is blank

- **GIVEN** a work item with no refs
- **WHEN** its cell is read
- **THEN** it SHALL be empty

### Requirement: The marks are readable without colour

The system SHALL distinguish external systems by more than hue: marks SHALL
differ in fill as well, and every mark SHALL carry an accessible name saying
which system it stands for and how many refs it covers.

Every mark SHALL be legible in both the light and the dark palette.

#### Scenario: the cell says what it links to, without colour

- **GIVEN** a work item with two GitHub refs and one Jira ref
- **WHEN** the cell's accessible description is read
- **THEN** it SHALL name GitHub and Jira
- **AND** it SHALL say that two refs are GitHub

#### Scenario: two marks of one hue are told apart by fill

- **WHEN** the Jira and Confluence marks are compared
- **THEN** they SHALL differ in fill as well as in hue

### Requirement: The cell reads on hover and edits on click

The system SHALL show a work item's refs, each followable, in an anchored card
when the cell is pointed at, and SHALL open an editor for the list when the cell
is taken.

The editor SHALL add a ref from a pasted URL, change a ref's system or URL, and
remove one.

A ref SHALL be rendered as a followable link only where its URL is `http` or
`https`; any other URL SHALL be rendered as text and SHALL NOT be followable. A
followed link SHALL open in a new context and SHALL NOT pass a referrer.

#### Scenario: the card lists every ref and follows one

- **GIVEN** a work item with three refs
- **WHEN** its cell is pointed at
- **THEN** the card SHALL list all three
- **AND** each SHALL be followable

#### Scenario: a non-http URL is not a link

- **GIVEN** a stored ref whose URL is neither `http` nor `https`
- **WHEN** it is shown
- **THEN** it SHALL be rendered as text
- **AND** it SHALL carry no link target

#### Scenario: taking the cell opens the editor

- **WHEN** the cell is taken
- **THEN** the ref editor SHALL open holding the work item's refs
