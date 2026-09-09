## ADDED Requirements

### Requirement: A card a reader acts on is reachable by a pointer

Where a hover card carries something a reader is meant to click, the whole card SHALL take the
pointer — its own padding and the gaps between its lines included — and not only the lines
inside it.

An open links card SHALL survive the pointer leaving its cell for as long as it takes to reach
the card, and SHALL close once the pointer has settled anywhere else. The hold SHALL apply
only to closing; a card SHALL still open the moment the pointer arrives on its cell.

A card that carries nothing to click SHALL remain pointer-transparent, so that it cannot eat a
click aimed at the row it hangs over.

#### Scenario: the pointer walks straight down onto the card

- **GIVEN** a work item's links card open below its cell
- **WHEN** the pointer moves down the cell's own column, in steps, to a point inside the card's
  outer padding
- **THEN** the card SHALL still be on screen
- **AND** the topmost element at that point SHALL be part of the card

#### Scenario: the pointer reaches diagonally for a link on the right

- **GIVEN** a links card several times wider than its cell, with a link near its right edge
- **WHEN** the pointer moves from the cell to that link in one diagonal motion, in steps,
  leaving the cell sideways before it descends onto the card
- **THEN** the card SHALL still be on screen
- **AND** the link SHALL be followable

#### Scenario: the pointer settles somewhere else

- **GIVEN** a links card open below its cell
- **WHEN** the pointer leaves the cell and comes to rest clear of both the cell and the card
- **THEN** the card SHALL close
