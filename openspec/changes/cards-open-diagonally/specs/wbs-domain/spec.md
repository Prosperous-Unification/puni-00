## ADDED Requirements

### Requirement: A cell's card opens diagonally

A hover card opened from a plan cell SHALL stand past that cell horizontally and past its row
vertically, so that the column stays clear for the pointer and the row stays readable.

A card a reader is meant to point at SHALL survive the trip: leaving the cell SHALL hold the card
briefly rather than close it, and arriving anywhere in the cell's subtree — the card included —
SHALL cancel that hold.

#### Scenario: the card clears both the column and the row

- **GIVEN** a card open from a cell
- **THEN** the card's top SHALL be at or below its row's bottom edge
- **AND** the card SHALL be clear of its own column

#### Scenario: a hand reaching for the card keeps it

- **GIVEN** a notes preview open from its marker
- **WHEN** the pointer moves to the card in steps, leaving the cell on the way
- **THEN** the card SHALL still be open when the pointer arrives

#### Scenario: the pointer settling elsewhere still closes it

- **GIVEN** a card held by that reach
- **WHEN** the pointer settles somewhere that is neither the cell nor the card
- **THEN** the card SHALL close

### Requirement: The open Name editor shows its notes rendered beside it

While a work item's Name box has the keyboard, the notes written in it SHALL be rendered beside
the box, in the row's right half, by the same component the hover preview renders.

#### Scenario: the panel answers the keystroke

- **GIVEN** a work item whose notes carry markdown
- **WHEN** its Name box is clicked into
- **THEN** the rendered notes SHALL be on screen beside the box
- **AND** they SHALL be the rendering, not the source

#### Scenario: the panel belongs to the writing

- **GIVEN** that panel on screen
- **WHEN** the box is left
- **THEN** the panel SHALL go with it
