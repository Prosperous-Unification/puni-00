## ADDED Requirements

### Requirement: A hover card closes when the row it belongs to moves

An open hover card SHALL be closed when a refreshed plan puts the work item it
belongs to under a different parent, or at a different position among its
siblings, or removes it. A refresh that leaves that work item where it was SHALL
leave the card open.

#### Scenario: a peer moves the row out from under the card

- **GIVEN** a hover card open on a work item
- **WHEN** somebody else moves that work item to the top of the plan
- **THEN** the card is gone

#### Scenario: a peer's unrelated edit leaves the card alone

- **GIVEN** a hover card open on a work item
- **WHEN** somebody else renames a different work item
- **THEN** the card is still shown

### Requirement: A folded role cell answers hover with the whole of what it folds

Hovering a folded role column cell SHALL show a hover card, with no built-in
delay, holding the whole of what the fold hides: the role's name, the work
item's number, the three points (optimistic, realistic, pessimistic), the final
figure, and — when someone is assigned or assumed — the person's full name and
the assumed-phase state. The figures SHALL be the ones the work item holds, not
a half-typed estimate waiting in the cells it was typed into. The card SHALL
show what the client already holds; hovering SHALL NOT send a request. The card
SHALL NOT take pointer events, so a click through its area lands on the row
beneath. One hover card SHALL be open at a time across the table.

Focusing the cell's own box SHALL open the same card, and that box SHALL be
described by it, so the card is reachable without a pointer. No card SHALL be
shown while an `@` mention is being typed in that cell.

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

#### Scenario: the card shows the estimate the plan is made of

- **GIVEN** a work item whose Dev trio is `2/3/8` on the server, and one of the
  three boxes emptied but never accepted, so what was typed is still pending
- **WHEN** the role is folded and the cell hovered
- **THEN** the card shows `2`, `3` and `8`, and the final figure in days

#### Scenario: the keyboard reaches the card

- **GIVEN** a folded role cell with an estimate in it
- **WHEN** its box takes the focus, with no pointer involved
- **THEN** the card is shown, and the box is described by it

#### Scenario: a mention being typed keeps the cell

- **GIVEN** an `@` typed into a folded role cell on a plan with nobody assigned
  to anything and nobody in the directory, so the picker offers nothing
- **WHEN** the pointer rests on that cell
- **THEN** no card is shown

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
full name. A depends cell with no dependencies SHALL show no card and SHALL NOT
close a card open elsewhere. The card SHALL NOT render while that cell's picker
is open; the cell's box SHALL instead be described by the same list, so what the
card shows is reachable without a pointer.

#### Scenario: numbers become names

- **GIVEN** a work item depending on `010` and `030`
- **WHEN** its depends cell is hovered
- **THEN** a card lists `010` and `030` each with the work item name it stands for

#### Scenario: nothing to expand

- **WHEN** a work item with no dependencies has its depends cell hovered
- **THEN** no card is shown

#### Scenario: the keyboard is told the same names

- **GIVEN** a work item depending on `010`
- **WHEN** its depends box takes the focus
- **THEN** the box is described by a list naming `010` and the work item it
  stands for

#### Scenario: the picker owns the cell while open

- **GIVEN** the depends picker open on a cell
- **WHEN** the mouse rests on that cell
- **THEN** no hover card is shown

## MODIFIED Requirements

### Requirement: Notes are markdown, rendered on hover

A Name cell whose work item has notes SHALL show a notes marker at the cell's
right edge; a work item with no notes SHALL show no marker. Hovering the
marker SHALL show the hover preview: the work item's name as a level-one
heading, and the notes rendered as markdown under it. Nothing but the marker
SHALL open the preview — hovering the Name cell elsewhere SHALL open none.

An open preview SHALL stay open while the pointer is anywhere on that Name cell
or on the preview itself, and SHALL close when it leaves both. A note taller than
the preview SHALL therefore be scrollable: reaching the preview crosses the cell
between the marker and it. The name SHALL appear in the heading as the text
typed — markdown syntax or raw HTML inside a name SHALL NOT become markup. Raw
HTML in a note SHALL be rendered as text, never as markup.

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

#### Scenario: a long note is read to the end

- **GIVEN** a work item whose notes are longer than the preview is tall
- **WHEN** the marker is hovered and the pointer moved onto the preview
- **THEN** the preview is still open, and the wheel scrolls it to its last line

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
