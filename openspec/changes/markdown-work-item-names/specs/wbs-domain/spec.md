## MODIFIED Requirements

### Requirement: A work item's name renders inline markdown

The system SHALL render a work item's name as inline markdown wherever it is
read: the Name cell at rest, the hover preview's heading, the plan cards, and
the chart's row label. Emphasis, strong, inline code, strikethrough and links
SHALL be parsed.

Block markdown SHALL NOT be parsed. A name containing a heading marker, a list
marker, a blockquote marker, a fence, a table or a rule SHALL render those
characters literally, and SHALL NOT have them stripped.

Rendering a name SHALL NOT change the height of the row, card or label it is
drawn in. Raw HTML in a name SHALL NOT become markup.

A link in a name SHALL NOT be followable from a table cell and SHALL NOT add a
tab stop to the grid; it SHALL be followable from the hover preview.

#### Scenario: emphasis in a name is rendered

- **GIVEN** a work item named `Ship *now*`
- **WHEN** its Name cell is read
- **THEN** the word `now` SHALL be rendered as emphasis
- **AND** no asterisk SHALL be shown

#### Scenario: a heading marker in a name is shown, not eaten

- **GIVEN** a work item named `# not a heading`
- **WHEN** its Name cell is read
- **THEN** the `#` SHALL be shown
- **AND** the cell SHALL contain no heading element

#### Scenario: a name of block markdown does not grow its row

- **GIVEN** three work items, named plainly, with inline emphasis, and with a
  heading marker and a list marker
- **WHEN** their rows are measured
- **THEN** all three rows SHALL be the same height

#### Scenario: raw HTML in a name stays text

- **GIVEN** a work item whose name contains an HTML tag
- **WHEN** its name is read on any face
- **THEN** the tag SHALL be shown as text and SHALL NOT become an element

### Requirement: The hover preview's heading is structure the app writes

The system SHALL render the hover preview's name heading as a level-one heading
element it constructs, with the name's inline markdown rendered inside it. It
SHALL NOT compose the name into markdown source.

#### Scenario: the heading is not made by the parser

- **GIVEN** a work item named `# x`
- **WHEN** its hover preview is opened
- **THEN** the heading SHALL contain the literal text `# x`
- **AND** the heading SHALL contain no element produced by the markdown parser

#### Scenario: emphasis inside the heading still renders

- **GIVEN** a work item named `*not*`
- **WHEN** its hover preview is opened
- **THEN** the heading SHALL contain an emphasis element

### Requirement: The export and the search read the name's source

The system SHALL write a work item's name to an export as its raw source, and
SHALL match a search against that source rather than against rendered text.

#### Scenario: an export carries the markdown source

- **GIVEN** a work item named `**blocked**`
- **WHEN** the plan is exported
- **THEN** the exported name SHALL be `**blocked**`

#### Scenario: a search matches the source

- **GIVEN** a work item named `**blocked**`
- **WHEN** `blocked` is searched for
- **THEN** that work item SHALL match
