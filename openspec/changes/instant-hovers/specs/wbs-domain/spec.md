## ADDED Requirements

### Requirement: A folded role cell answers hover with the whole of what it folds

Hovering a folded role column cell SHALL show a hover card, with no built-in
delay, holding the whole of what the fold hides: the role's name, the three
points (optimistic, realistic, pessimistic), the final figure, and — when
someone is assigned or assumed — the person's full name and the assumed-phase
state. The card SHALL show what the client already holds; hovering SHALL NOT
send a request. The card SHALL NOT take pointer events, so a click through its
area lands on the row beneath. One hover card SHALL be open at a time across
the table.

#### Scenario: the folded figure opens into its parts

- **GIVEN** a work item whose Dev role is folded to `4.8 · Ka…` with Kat assigned
- **WHEN** the folded cell is hovered
- **THEN** a card shows the role name, its three points, the final `4.8`, and
  `Kat` in full, with no delay

#### Scenario: an assumed assignee says so

- **GIVEN** a work item where Kat is assumed to do QA because she is the only
  person assigned
- **WHEN** the folded QA cell is hovered
- **THEN** the card names Kat and says she is assumed

#### Scenario: hover asks the server for nothing

- **WHEN** a folded role cell is hovered and left
- **THEN** no request is sent

#### Scenario: a click through the card lands beneath it

- **GIVEN** a hover card open over the row below
- **WHEN** that row is clicked where the card overlaps it
- **THEN** the click lands on the row, not the card

#### Scenario: one card at a time

- **GIVEN** a hover card open on one cell
- **WHEN** another cell that has a card is hovered
- **THEN** the first card is gone and only the second is shown

### Requirement: The depends cell answers hover with names

Hovering a depends cell that holds at least one dependency SHALL show a hover
card, with no built-in delay, listing every dependency as its number and its
full name. A depends cell with no dependencies SHALL show no card. The card
SHALL NOT render while that cell's picker is open.

#### Scenario: numbers become names

- **GIVEN** a work item depending on `010` and `030`
- **WHEN** its depends cell is hovered
- **THEN** a card lists `010` and `030` each with the work item name it stands for

#### Scenario: nothing to expand

- **WHEN** a work item with no dependencies has its depends cell hovered
- **THEN** no card is shown

#### Scenario: the picker owns the cell while open

- **GIVEN** the depends picker open on a cell
- **WHEN** the mouse rests on that cell
- **THEN** no hover card is shown

## MODIFIED Requirements

### Requirement: Notes are markdown, rendered on hover

A Name cell whose work item has notes SHALL show a notes marker at the cell's
right edge; a work item with no notes SHALL show no marker. Hovering the
marker SHALL show the hover preview: the work item's name as a level-one
heading, and the notes rendered as markdown under it. Hovering the Name cell
anywhere other than the marker SHALL show no preview. The name SHALL appear in
the heading as the text typed — markdown syntax or raw HTML inside a name
SHALL NOT become markup. Raw HTML in a note SHALL be rendered as text, never
as markup.

The marker SHALL NOT take the focus and SHALL NOT be a cell of the keyboard
grid, and it SHALL take pointer events on its own area alone.

This trigger is the Name cell's alone. A folded role cell and a depends cell
SHALL keep the whole cell as the trigger for their own hover cards: those
cards are a few lines over a narrow cell, where the preview is a document over
the rows below.

#### Scenario: the marker opens the preview

- **GIVEN** a work item named `Strip the old wiring` with notes `## Risks`
- **WHEN** its Name cell's notes marker is hovered
- **THEN** the preview holds a level-one heading reading `Strip the old wiring`
  and a lesser heading reading `Risks` under it

#### Scenario: the cell itself opens nothing

- **GIVEN** a work item with notes
- **WHEN** its Name cell is hovered away from the marker
- **THEN** no preview is shown

#### Scenario: a name containing markdown shows as typed

- **GIVEN** a work item named `# not a heading <script>`
- **WHEN** its notes marker is hovered
- **THEN** the heading reads `# not a heading <script>` as text, and the
  preview contains no script element

#### Scenario: a note containing HTML

- **GIVEN** a note containing an `<img onerror=…>` and a `<script>`
- **WHEN** the notes marker is hovered
- **THEN** the preview contains neither element, and shows the text as typed

#### Scenario: nothing to mark

- **WHEN** a work item has no notes
- **THEN** its Name cell shows no notes marker, and hovering the cell shows no
  preview
