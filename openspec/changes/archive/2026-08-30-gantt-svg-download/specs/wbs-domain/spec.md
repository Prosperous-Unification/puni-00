## ADDED Requirements

### Requirement: The chart downloads as a standalone SVG

A client SHALL let a reader download the Gantt chart as drawn — an `.svg` file
that carries every mark the live chart draws (bars, dependency arrows, person
hand-offs, capacity waits, colour-as-person) plus the row labels and the
calendar axis, which are HTML on screen and exist nowhere else in the file.

It SHALL render correctly opened with no application around it: every colour
the live chart reads off a class SHALL be a literal attribute in the file, and
every attribute value SHALL be valid XML.

#### Scenario: the downloaded file carries what the live chart draws

- **GIVEN** an open Gantt chart with at least one drawn bar
- **WHEN** the standalone SVG is downloaded
- **THEN** the file SHALL parse as well-formed XML
- **AND** it SHALL contain the row's own label as text
- **AND** it SHALL contain the bar's own literal fill colour, unchanged

#### Scenario: a class-driven mark carries no class into the file

- **GIVEN** a mark whose colour the live chart reads off a Tailwind class
  (a weekend band, a gridline)
- **WHEN** the standalone SVG is built
- **THEN** the mark SHALL carry no `class` attribute in the file

#### Scenario: an id built with a separator no XML parser accepts still opens

- **GIVEN** a slice id containing a control character no strict XML parser
  accepts as an attribute value
- **WHEN** the standalone SVG is built
- **THEN** the control character SHALL NOT reach the file's markup
