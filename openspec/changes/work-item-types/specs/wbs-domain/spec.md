## ADDED Requirements

### Requirement: A work item carries the types a reader has named

The system SHALL hold a directory-wide vocabulary of **work item types**, each a
name unique across the directory, and SHALL let a work item carry several of
them.

A work item's types SHALL be edited by full replacement, so that adding or
removing one preserves the others. A type carried by no work item SHALL remain
in the vocabulary until it is removed from the directory.

A work item with no types SHALL be blank, and SHALL NOT inherit any ancestor's
types.

#### Scenario: a work item carries several types

- **GIVEN** a directory holding the types `Story` and `Spike`
- **WHEN** both are put on one work item
- **THEN** the work item SHALL carry both
- **AND** removing one SHALL leave the other

#### Scenario: a type name is unique in the directory

- **WHEN** a type is created with a name the directory already holds
- **THEN** the create SHALL be refused
- **AND** the existing type SHALL be unchanged

#### Scenario: an unset type shows nothing and inherits nothing

- **GIVEN** a work item with no types whose parent carries `Epic`
- **WHEN** its Type cell is read
- **THEN** it SHALL be blank
- **AND** it SHALL NOT show `Epic`

#### Scenario: removing a type from the directory takes it off every row

- **GIVEN** a type carried by two work items
- **WHEN** it is removed from the directory
- **THEN** neither work item SHALL carry it
- **AND** neither work item SHALL be deleted

### Requirement: The Type cell behaves as the other reference cells do

The system SHALL present a work item's types in the same cell family as Teams,
Tags and Services: a quiet add control, compact removable chips, search from the
keyboard, and creation of a type by naming one the directory does not hold.

The cell SHALL occupy one line and SHALL NOT change its row's height whatever
number of types the row carries.

#### Scenario: naming a type the directory does not hold creates it

- **GIVEN** a directory with no type called `Chore`
- **WHEN** `Chore` is typed into a work item's Type cell and taken
- **THEN** the directory SHALL hold `Chore`
- **AND** the work item SHALL carry it

#### Scenario: a row of many types is the height of a row of none

- **GIVEN** one work item carrying three types and one carrying none
- **WHEN** their rows are measured
- **THEN** the two rows SHALL be the same height

### Requirement: The Type column is off by default and the folded budget is unchanged

The system SHALL hide the Type column until a reader shows it, and the folded
table's minimum width over the default column set SHALL be unchanged by this
change.

#### Scenario: the default table is the table it was

- **WHEN** the folded minimum width over the default column set is computed
- **THEN** it SHALL equal the width computed before this change

#### Scenario: a reader can show the column

- **WHEN** the Columns control is read
- **THEN** it SHALL offer the Type column
- **AND** showing it SHALL render a Type cell on every row

### Requirement: The filter offers the types present on a plan

The system SHALL offer a type facet beside the existing facets, listing the
types carried by the plan's work items, and SHALL narrow the plan to the rows
carrying a chosen type.

#### Scenario: the facet lists what the plan carries

- **GIVEN** a plan whose rows carry `Story` and `Bug`, in a directory also
  holding `Epic`
- **WHEN** the type facet is read
- **THEN** it SHALL offer `Story` and `Bug`
- **AND** it SHALL NOT offer `Epic`
