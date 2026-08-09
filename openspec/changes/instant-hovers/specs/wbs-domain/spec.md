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
