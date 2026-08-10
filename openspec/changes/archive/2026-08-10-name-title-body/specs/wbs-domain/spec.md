## ADDED Requirements

### Requirement: The Name cell at rest shows the name alone

A Name cell that does not hold the focus SHALL be exactly as tall as its own
wrapped name: the name shown whole, wrapping when longer than the column,
however many lines that takes. The notes under it SHALL take no height and
SHALL NOT be scrollable into view. While the cell holds the focus it SHALL
show the full text — name on the first line, notes under it — as it does
today, and on leaving it SHALL return to the name alone. What the cell holds,
sends and diffs SHALL NOT change; only its visible height does.

#### Scenario: a long name wraps whole at rest

- **WHEN** a work item whose name is longer than the Name column is shown, unfocused
- **THEN** the whole name is visible, wrapped, with no part cut or scrolled away

#### Scenario: notes take no height at rest

- **GIVEN** two work items with equal names, one with ten lines of notes, one with none
- **WHEN** neither holds the focus
- **THEN** their Name cells are the same height

#### Scenario: notes cannot be scrolled into view at rest

- **WHEN** the wheel scrolls over an unfocused Name cell that has notes
- **THEN** the notes stay out of view

#### Scenario: focus reveals the notes

- **WHEN** an unfocused Name cell with notes takes the focus
- **THEN** the full text is visible — the name on the first line, the notes under it

#### Scenario: leaving hides the notes again

- **WHEN** a Name cell showing its notes loses the focus with nothing typed
- **THEN** it returns to the name alone, and nothing is sent

## MODIFIED Requirements

### Requirement: Notes are markdown, rendered on hover

Hovering a work item's Name cell that has notes SHALL show the hover preview:
the work item's name as a level-one heading, and the notes rendered as
markdown under it. The name SHALL appear in the heading as the text typed —
markdown syntax or raw HTML inside a name SHALL NOT become markup. Raw HTML in
a note SHALL be rendered as text, never as markup. A work item with no notes
SHALL show no preview.

#### Scenario: the preview reads as one document

- **GIVEN** a work item named `Strip the old wiring` with notes `## Risks`
- **WHEN** its Name cell is hovered
- **THEN** the preview holds a level-one heading reading `Strip the old wiring`
  and a lesser heading reading `Risks` under it

#### Scenario: a name containing markdown shows as typed

- **GIVEN** a work item named `# not a heading <script>`
- **WHEN** its Name cell is hovered
- **THEN** the heading reads `# not a heading <script>` as text, and the
  preview contains no script element

#### Scenario: a note containing HTML

- **GIVEN** a note containing an `<img onerror=…>` and a `<script>`
- **WHEN** the Name cell is hovered
- **THEN** the preview contains neither element, and shows the text as typed

#### Scenario: nothing to preview

- **WHEN** a work item with no notes is hovered
- **THEN** no preview is shown
