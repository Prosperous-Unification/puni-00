## ADDED Requirements

### Requirement: A phone's cards show slack and the critical path, in the table's words

The mobile card renderer SHALL say how many days a work item can slip before
the plan's finish moves, in the same two words the table's Slack column uses:
the row's stored day figure, or `critical` where the row has none.

#### Scenario: a row with slack says how many days

- **GIVEN** a work item whose schedule gives it float
- **WHEN** its card is drawn on a phone
- **THEN** the card SHALL state the number of days, using the table's own
  singular/plural wording

#### Scenario: a row on the critical path says so, not a number

- **GIVEN** a work item on the critical path
- **WHEN** its card is drawn on a phone
- **THEN** the card SHALL say `critical`, the table's own word, in place of a
  figure

### Requirement: A phone's cards offer the `o·r·p` trio behind each phase's figure

The mobile card renderer SHALL offer, per phase, a tappable detail showing the
three estimate points and the final figure behind that phase's combined box —
read off the row's stored estimate, not a box's in-progress draft — in the same
words the table's own hover card uses for the same fields.

#### Scenario: an estimated phase shows its three points and its final figure

- **GIVEN** a phase somebody has given a three-point estimate
- **WHEN** its card's detail is opened
- **THEN** it SHALL show all three points, each named and valued
- **AND** SHALL show the final figure in days where be-01 has computed one

#### Scenario: an unestimated phase says so, not a blank

- **GIVEN** a phase nobody has estimated
- **WHEN** its card's detail is opened
- **THEN** it SHALL say `No estimate yet` rather than three blank points
