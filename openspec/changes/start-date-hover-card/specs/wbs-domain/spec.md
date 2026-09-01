## MODIFIED Requirements

### Requirement: The Start cell explains its day at once, in the page's own hint

Where a row's Start day has an explanation, its cell SHALL show that
explanation in the application's own hover card, opened in the same frame the
pointer arrives on the cell, and SHALL carry no native `title` on the cell or
anything inside it.

The card SHALL also open when the cell takes the keyboard focus, and while it
is open the cell SHALL point its accessible description at it.

The card SHALL be drawn whole, past the edges of its own column.

A row whose Start day has no explanation SHALL show no card, no focus stop and
no mark.

#### Scenario: the pointer arrives on a Start cell

- **GIVEN** a row whose Start day carries an explanation
- **WHEN** the pointer arrives on its Start cell
- **THEN** the card SHALL already be open when the frame is read, holding that
  explanation, and the cell SHALL carry no `title`

#### Scenario: the keyboard reaches the same sentence

- **GIVEN** the same row
- **WHEN** its Start cell takes the focus
- **THEN** the same card SHALL open and the cell's accessible description SHALL
  name it

#### Scenario: the card is not cut off by its column

- **GIVEN** the card open on a 52px Start column
- **WHEN** the strip of page below the cell is compared with and without it
- **THEN** the two SHALL differ
