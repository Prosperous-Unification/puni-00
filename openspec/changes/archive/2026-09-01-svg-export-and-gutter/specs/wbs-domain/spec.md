## ADDED Requirements

### Requirement: The chart is downloadable from the Export menu

The Export menu SHALL offer the chart as a standalone `.svg`, downloading the
same file the chart panel's own control downloads.

Where no chart is on screen the menu's control SHALL say so in a toast and
SHALL download nothing, exactly as the Mermaid exports refuse a plan no gantt
can be drawn of.

#### Scenario: the menu downloads the chart

- **GIVEN** a plan whose chart is open
- **WHEN** `Download chart as SVG` is picked from the Export menu
- **THEN** a file named `gantt-chart-<today>.svg` SHALL be downloaded, holding
  the same standalone document the panel's own control writes

#### Scenario: the menu refuses without a chart

- **GIVEN** a plan whose chart is closed
- **WHEN** `Download chart as SVG` is picked from the Export menu
- **THEN** nothing SHALL be downloaded and a toast SHALL say the chart has to
  be open

### Requirement: A downloaded chart's names end before its first day

In the downloaded `.svg` the label gutter SHALL be wide enough for the widest
row label it draws, so no label's text crosses the divider into the plot area.

The width SHALL be measured from the labels the file actually carries, and
SHALL never be narrower than the gutter a chart of short names already has.

#### Scenario: a name far longer than the gutter

- **GIVEN** a plan holding a work item whose name is far longer than the
  gutter a chart of short names is drawn with
- **WHEN** the chart is downloaded as an `.svg`
- **THEN** every label's drawn text SHALL end left of the divider, and the
  first day column SHALL begin right of it

#### Scenario: short names keep the gutter they had

- **GIVEN** a plan whose row labels all fit the gutter
- **WHEN** the chart is downloaded as an `.svg`
- **THEN** the gutter SHALL be the width it was before this change
