## MODIFIED Requirements

### Requirement: A dragged Gantt panel stays inside the column it lives in

The system SHALL cap a dragged Gantt panel height at the space its own column
has for it — the column's height less every other child it holds — and SHALL NOT
cap it at a share of the viewport.

After any drag, the panel's bottom edge SHALL be at or above its column's bottom
edge. No part of the chart SHALL be drawn outside the column, because no
ancestor scrolls to reach it.

The panel's floor SHALL continue to win over the cap, so a column too short for
the floor SHALL show a clipped panel at the floor rather than a shorter one.

#### Scenario: dragging past the available space stops at it

- **GIVEN** a plan column with less room for the chart than the viewport share
  would allow
- **WHEN** the panel's edge is dragged far past that room
- **THEN** the panel's bottom SHALL be at or above the column's bottom
- **AND** the panel SHALL be no taller than the space the column has for it

#### Scenario: no part of the chart is unreachable

- **GIVEN** a panel dragged as tall as it will go
- **WHEN** the document's scrollable height is compared to the window's
- **THEN** they SHALL be equal
- **AND** the panel's bottom SHALL be on screen

#### Scenario: the floor wins over the cap

- **GIVEN** a column with less room than the panel's floor
- **WHEN** the panel is drawn
- **THEN** it SHALL be its floor height

### Requirement: The panel's top edge follows the pointer

The system SHALL move the boundary between the plan and the chart as the handle
is dragged, so that dragging up gives the chart screen from the plan above it.

The panel SHALL be able to give space back when its column is over-constrained,
rather than overflowing it.

#### Scenario: dragging up moves the boundary up

- **GIVEN** a plan with the chart shown and room above it
- **WHEN** the handle is dragged up
- **THEN** the handle's top SHALL be higher than it was
- **AND** the panel SHALL be taller than it was

#### Scenario: an over-constrained column shrinks the chart

- **GIVEN** a panel at a height its column can no longer hold
- **WHEN** the column is measured
- **THEN** the panel SHALL have shrunk to fit
- **AND** it SHALL NOT extend past the column

### Requirement: A remembered height is a claim about a window that may have changed

The system SHALL re-clamp a remembered Gantt height against the column it is
being drawn in, and SHALL NOT rewrite the remembered value when it does.

#### Scenario: a height dragged in a tall window is clamped in a short one

- **GIVEN** a remembered height taller than the current column allows
- **WHEN** the plan is opened
- **THEN** the panel SHALL be drawn no taller than the column allows
- **AND** the remembered value SHALL be unchanged

#### Scenario: a wider window gives the dragged height back

- **GIVEN** a remembered height clamped down in a short window
- **WHEN** the window becomes tall enough again
- **THEN** the panel SHALL be drawn at the remembered height
