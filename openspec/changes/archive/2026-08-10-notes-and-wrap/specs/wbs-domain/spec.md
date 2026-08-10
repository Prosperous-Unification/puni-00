## ADDED Requirements

### Requirement: The name and notes cells wrap and grow

The Name and Notes cells SHALL wrap their text rather than scrolling it out of
sight, and SHALL show one row at rest and more rows while they hold the focus.
Enter in either SHALL remain the key that creates a work item, and Tab,
Shift+Tab, Backspace and the arrow keys SHALL behave exactly as they do in a
single-line cell.

#### Scenario: a long name is readable

- **WHEN** a name longer than its cell is shown
- **THEN** it wraps within the cell rather than being cut

#### Scenario: the notes cell grows to be written in

- **WHEN** the Notes cell takes the focus
- **THEN** it shows more than one row, and returns to one when the focus leaves

### Requirement: Notes are markdown, rendered on hover

The Notes cell SHALL hold markdown source, showing as much of it as its height
allows. Hovering a work item's notes SHALL show them rendered. Raw HTML in a
note SHALL be rendered as text, never as markup. A work item with no notes
SHALL show no popover.

#### Scenario: markdown becomes markup in the popover

- **GIVEN** a note reading `## Risks` and a bulleted `*old*`
- **WHEN** the notes cell is hovered
- **THEN** the popover holds a heading element and an emphasis element

#### Scenario: a note containing HTML

- **GIVEN** a note containing an `<img onerror=…>` and a `<script>`
- **WHEN** the notes cell is hovered
- **THEN** the popover contains neither element, and shows the text as typed

#### Scenario: nothing to preview

- **WHEN** a work item with no notes is hovered
- **THEN** no popover is shown
