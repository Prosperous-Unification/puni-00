## ADDED Requirements

### Requirement: Every chrome control box draws one 3:1 edge

Every control box outside the plan grid that draws a boundary (an outline
button, a text box, a select, a disclosure summary) SHALL draw it in the one
control-edge colour, and that edge SHALL stand at least 3:1 against the ground
outside the control and against the control's own fill, in the light and the
dark palette.

#### Scenario: the plan toolbar's boxes

- **WHEN** a plan is open at 1400px in either palette
- **THEN** Find, the start date, Plan with, Saved plans, Filters, Views, Columns and Export / Import each paint a left edge at least 3:1 against both sides

### Requirement: The chrome draws no platform frame and no ink-coloured border

No visible element outside the plan grid SHALL draw a border styled `outset`,
`inset`, `groove` or `ridge`, and no such element other than a radio or a check
box (whose ring is the control itself, not a frame) SHALL draw a border in its
own text colour. A border whose utility names no colour SHALL draw the surface
border colour, and no control box SHALL draw that surface colour. A bare
`<button>` or `<fieldset>` SHALL draw no border unless it asks for one, and every
button outside the grid that is a control rather than a row label SHALL be drawn
in the chrome's button vocabulary.

#### Scenario: the Gantt, a dialog and the settings sections

- **WHEN** the home card, the plan, each toolbar popover, the Gantt, the Board, the cheat sheet, the account menu, each Project settings section, Directory or Spaces is shown in either palette
- **THEN** no element outside the grid draws a bevel, a groove, a border in its own ink, or a control box on the surface line

#### Scenario: onboarding and the phone card sheets

- **WHEN** onboarding asks to create an organization, verify an email or join one, or a phone card's Earliest start, Priority or Depends on sheet is open
- **THEN** every field and button draws the control edge and the chrome's 6px corner

### Requirement: The header marks the page that is showing

The header's page link for the page that is showing SHALL carry
`aria-current="page"` and a visible mark that stands at least 3:1 against the
header, which the other page links SHALL NOT carry. No page link SHALL be
underlined.

#### Scenario: Directory

- **WHEN** the reader is on `/directory`
- **THEN** Directory carries `aria-current="page"` and the ink bar at its foot, and Plan and Spaces carry neither and no underline

### Requirement: The phone's plan controls share one type size and one label edge

On a phone, the Plan and Board toggles and Plan actions SHALL use one font size.
On the Plan actions sheet, every button and disclosure row's label SHALL start at
the same x, whether or not the row carries a glyph.

#### Scenario: the Plan actions sheet at 375px

- **WHEN** the sheet is open at 375×812
- **THEN** Gantt, Collapse all, Columns, Undo and every other row's label starts within 1px of the first's
