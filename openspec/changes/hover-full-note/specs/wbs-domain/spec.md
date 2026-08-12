## ADDED Requirements

### Requirement: The hover preview is sized to its note and to the room around its cell

The Name cell's hover preview SHALL be as tall as the note it renders, up to a
ceiling of the clear room between its cell and the edge of the window on the
side it opens on, and never more than 90% of the window's height. A note that
fits under that ceiling SHALL be shown whole, with nothing scrolled away and no
scrollbar. A note taller than it SHALL still scroll inside the card, as it does
today.

The preview SHALL be up to 640 CSS pixels wide, and SHALL NOT be wider than the
window it is drawn in.

Every other hover card — the folded role figure, the dependency card, the Gantt
bar's — SHALL keep its own 320px height and 420px width, and SHALL NOT gain
this sizing.

#### Scenario: a short note shows whole

- **GIVEN** a work item whose note renders under the ceiling for its row
- **WHEN** its notes marker is hovered
- **THEN** the whole note is visible in the card and the card does not scroll

#### Scenario: a long note fills the room it has

- **GIVEN** a work item whose note is far taller than the window
- **WHEN** its notes marker is hovered
- **THEN** the card is taller than 320 pixels and no taller than 90% of the window

#### Scenario: a long note still scrolls

- **GIVEN** the card of the previous scenario
- **WHEN** the pointer is moved onto the card and the wheel is turned to its end
- **THEN** the note's last line is on screen, inside the card's own rectangle

#### Scenario: the card stays inside the window's width

- **WHEN** the preview is shown in a window narrower than 640 pixels
- **THEN** its left and right edges are both inside the window

#### Scenario: another card keeps its own size

- **GIVEN** a work item with a folded role whose card is taller than 320 pixels of content
- **WHEN** the folded figure is hovered
- **THEN** that card is 320 pixels tall

### Requirement: The hover preview opens on the side of its cell that has the room

The Name cell's hover preview SHALL open below its cell when the clear room
below is at least the clear room above, and above its cell otherwise. It SHALL
NOT be drawn past the top or the bottom edge of the window.

The preview SHALL remain a descendant of its own cell, so that moving the
pointer from the notes marker onto the card does not close it.

#### Scenario: a row near the top opens downward

- **WHEN** the notes marker of a row in the upper half of the table is hovered
- **THEN** the card's top edge is below the cell's bottom edge

#### Scenario: a row near the bottom opens upward

- **WHEN** the notes marker of a row low enough that the room below is less than the room above is hovered
- **THEN** the card's bottom edge is above the cell's top edge

#### Scenario: the card is on screen either way

- **WHEN** the preview is open on a row in either half of the table
- **THEN** its top edge is at or below the top of the window and its bottom edge is at or above the bottom of the window

#### Scenario: the pointer reaches the card

- **GIVEN** an open preview on a row that opened it upward
- **WHEN** the pointer is moved from the notes marker onto the card
- **THEN** the card is still open
