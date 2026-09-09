## ADDED Requirements

### Requirement: A plan can be read down a column of hover cards

The point a reader would move to in the next row SHALL belong to that row, and not to the card
a cell above it has open — by the card being pointer-transparent, or by the card standing clear
of the column.

Moving the pointer from one row's trigger to the next row's, in that column, SHALL open the
next row's own card.

#### Scenario: the open card is not what the next row's trigger hit-tests to

- **GIVEN** a card open from one row's cell in a column
- **WHEN** the middle of the next row's trigger in that column is hit-tested
- **THEN** the topmost element there SHALL NOT be part of the open card

#### Scenario: the pointer walks down the column

- **GIVEN** a card open from one row's cell in a column
- **WHEN** the pointer moves, in steps, to the middle of the next row's trigger
- **THEN** that row's own card SHALL be open

#### Scenario: the columns this holds for

- **GIVEN** a plan three rows deep carrying notes, an estimate, a type, a tag, a dependency and
  a link on every row
- **THEN** both scenarios above SHALL hold for the Start, Name, Depends on, Types, Tags, folded
  step and Links columns
