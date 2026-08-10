## ADDED Requirements

### Requirement: Alt and an arrow move a row from any cell

Alt with an arrow key SHALL restructure the focused row from any editable cell
of it and at any caret position: Up and Down swap it with its sibling above or
below, Left outdents it, and Right indents it under the sibling above. The
first and last sibling positions SHALL be no-ops — no wrap and no change of
parent — as SHALL outdenting a root row and indenting a first sibling. Each
move SHALL be sent as the work item's id with the parent and preceding sibling
ids read from the tree currently on screen, never as a computed position. A
handled Alt+arrow SHALL be taken from the browser, so it can neither type a
character nor move the caret. An Alt+arrow arriving mid-composition, or with
Ctrl or Meta also held, SHALL be left alone.

#### Scenario: swapping with the sibling below

- **GIVEN** root work items `010 Strip`, `020 Sand`, `030 Paint`
- **WHEN** Alt+Down is pressed with the caret mid-word in `010`'s name
- **THEN** the order reads `Sand`, `Strip`, `Paint`, and the key does not reach
  the text

#### Scenario: the first sibling has nowhere up to go

- **GIVEN** the same three root work items
- **WHEN** Alt+Up is pressed in the first of them
- **THEN** no move is sent, the order is unchanged, and the key is still taken
  from the browser

#### Scenario: indenting without walking the caret to the start

- **GIVEN** the caret in the middle of `020`'s name, where Tab navigates rather
  than indents
- **WHEN** Alt+Right is pressed
- **THEN** `020` becomes the last child of `010` and is numbered `010.1`

#### Scenario: outdenting from an estimate box

- **GIVEN** the focus in a child row's estimate box
- **WHEN** Alt+Left is pressed
- **THEN** the row becomes its parent's next sibling

#### Scenario: a plain arrow is still navigation

- **WHEN** an arrow is pressed without Alt
- **THEN** the focus moves between cells as before and no work item moves

### Requirement: A moved row keeps the column the focus was in

After an Alt+arrow move, the focus SHALL land on the same column of the moved
row once the refetched tree is on screen — the estimate box it was in, not the
row's name. Creating and deleting rows SHALL continue to land the focus in the
Name cell.

#### Scenario: the estimate box the move started from

- **GIVEN** the focus in `020`'s Dev optimistic box
- **WHEN** Alt+Right indents the row under `010`
- **THEN** the focus is in the Dev optimistic box of the moved row, now `010.1`

### Requirement: An Alt+arrow move that cannot happen says so

A frozen work item SHALL refuse an Alt+arrow move without sending a request,
naming the freeze as the reason in the same words a refused drag uses. While a
move is in flight, further Alt+arrows SHALL be dropped rather than queued.

#### Scenario: a frozen row

- **GIVEN** a project whose numbering has been frozen
- **WHEN** Alt+Down is pressed in one of its rows
- **THEN** no move is sent and the table says the row's number is frozen

#### Scenario: a held arrow while the first move is in flight

- **GIVEN** an Alt+Down whose request has not come back
- **WHEN** Alt+Down is pressed again
- **THEN** no second move is sent
