## ADDED Requirements

### Requirement: A panel with chart below its bottom edge says so

The system SHALL draw a fade over the bottom edge of the Gantt panel's scroll
box while there is chart below that edge, and SHALL NOT draw it while the panel
holds the whole chart or the reader has reached its last row.

The fade SHALL be a drawn element rather than a scrollbar, because the platform
may draw its scrollbars as overlays that are invisible at rest.

The fade SHALL cover the panel's whole visible width at every horizontal scroll
offset, including a calendar scrolled past the panel's right edge.

The fade SHALL NOT add to what the panel scrolls: drawing it SHALL NOT make
there be more chart below the edge.

#### Scenario: a panel that holds the whole chart fades nothing

- **GIVEN** a chart shorter than the panel it is drawn in
- **WHEN** the panel is read
- **THEN** no fade SHALL be drawn

#### Scenario: a panel dragged short fades its bottom edge

- **GIVEN** a chart taller than the panel after its edge has been dragged down
- **WHEN** the panel is read at its first row
- **THEN** a fade SHALL be drawn at the panel's bottom edge
- **AND** it SHALL reach across the panel's visible width

#### Scenario: the fade lifts at the last row

- **GIVEN** a panel with chart below its edge
- **WHEN** it is scrolled to its last row
- **THEN** no fade SHALL be drawn

#### Scenario: the fade holds the edge with the calendar scrolled right

- **GIVEN** a panel with chart below its edge and a chart wider than the panel
- **WHEN** the calendar is scrolled fully right
- **THEN** the fade SHALL still cover the panel's visible width

### Requirement: A scrolled panel keeps its calendar and its rows together

The system SHALL keep the Gantt panel's calendar axis at the top of the panel's
scroll box at every vertical scroll offset, so that a scrolled chart still says
which day each bar stands on.

Every bar the panel draws SHALL stay within the vertical band of its own row
label at every vertical scroll offset.

#### Scenario: the calendar stays over the bars

- **GIVEN** a panel too short for its chart
- **WHEN** it is scrolled down by two rows
- **THEN** the calendar axis SHALL still be at the top of the panel's content

#### Scenario: a bar stays on its own row

- **GIVEN** a panel scrolled down by two rows
- **WHEN** each bar on screen is compared with its own row label
- **THEN** each bar SHALL be inside its label's band
