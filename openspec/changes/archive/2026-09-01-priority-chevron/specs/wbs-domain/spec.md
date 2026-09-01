## MODIFIED Requirements

### Requirement: A priority reads as a rung as well as a number

The Prio cell SHALL draw a glyph beside its value that says which rung of the
ladder the value falls in, so the rung is legible without reading the colour.

The glyph SHALL be chosen by the band's rank and SHALL be drawn in that band's
own ink. Five ranks SHALL have five distinguishable glyphs, ordered so that
more important reads as upward.

A work item nobody has prioritised SHALL show no glyph and no number.

The glyph SHALL NOT be announced to a screen reader — the cell's accessible
description already names the band and the number — and SHALL NOT take the
pointer away from the cell.

#### Scenario: five rungs, five glyphs

- **GIVEN** a plan with one work item on each rung of the default ladder
- **WHEN** the Prio column is read
- **THEN** each cell SHALL show a glyph, and no two ranks SHALL show the same
  one

#### Scenario: an unprioritised row

- **GIVEN** a work item whose priority has been cleared
- **WHEN** its Prio cell is read
- **THEN** it SHALL show no glyph

#### Scenario: the click still opens the ladder

- **GIVEN** a prioritised work item
- **WHEN** the pointer clicks the cell where the glyph is drawn
- **THEN** the band list SHALL open
