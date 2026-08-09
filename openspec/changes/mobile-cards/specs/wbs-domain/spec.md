## ADDED Requirements

### Requirement: How wide the window is decides which renderer draws the plan

The plan SHALL be drawn as a list of outline cards while the viewport is
narrower than 768px, and as the table at 768px and wider. Exactly one of them
SHALL be on screen at a time.

The answer SHALL follow the viewport while the page is open: a window that
becomes narrow SHALL become cards without a reload, and one that becomes wide
SHALL become the table again.

Nothing about the table SHALL change at any width it is drawn at. The question
asked is the width of the viewport and nothing else — not the pointer, not the
user agent, not the orientation — so a narrow window on a laptop is answered
the same way a phone is.

#### Scenario: a phone gets cards

- **WHEN** the plan is opened in a viewport 390px wide
- **THEN** the work items are drawn as cards and no table is on screen

#### Scenario: a laptop gets the table

- **WHEN** the plan is opened in a viewport 1024px wide
- **THEN** the work items are drawn as the table and no cards are on screen

#### Scenario: the window is made narrow while the plan is open

- **WHEN** a plan drawn as the table is resized to 390px wide
- **THEN** the same plan is drawn as cards, with no reload

### Requirement: A card is one work item, read whole and edited one field at a time

An outline card SHALL show the work item's number at its own depth, its name
and notes in one box, its total days, its dates, what it waits for, and one
line per phase carrying that phase's figure and who is on it.

Exactly three things on a card SHALL be editable: the name-and-notes box, each
phase's `o/r/p` figure, and — through the `@` list in that figure's box — who
is assigned to that phase. Everything else a card shows SHALL be read-only.

A card SHALL offer no drag handle and no keyboard grid: a phone has no pointer
to drag with and no Tab key to walk a grid with, and a control that cannot be
worked is worse than one that is not there.

#### Scenario: the name is typed on a card and be-01 is asked for it

- **WHEN** a name is typed into a card's box and the box is left
- **THEN** the work item is renamed, exactly as it would be from the table

#### Scenario: a card offers no handle to drag

- **WHEN** a plan is drawn as cards
- **THEN** no card carries a reorder control

### Requirement: A card's cells are the table's cells

Every editable box on a card SHALL carry the `data-cell` of the cell it edits —
the same `rowId::columnId` the table's box for that cell carries — and SHALL
carry no cell identity the table does not have one for.

The element holding the cards SHALL be marked as the grid, so that everything
which finds a cell by walking the grid finds a card's.

#### Scenario: the same plan, the same cells

- **WHEN** a plan is drawn as cards
- **THEN** every `data-cell` on screen is one the table draws for that plan too

#### Scenario: the cards are a grid

- **WHEN** a plan is drawn as cards
- **THEN** the cells of the grid can be found from the card list without it
  being a table

### Requirement: The focus lands on the card an edit asked for

The focus SHALL land on the cell a structural edit asked for, on the card DOM,
once the refetched tree that holds it is on screen — exactly as it does in the
table.

#### Scenario: a work item created from the sheet is typed into

- **WHEN** a work item is added while the plan is drawn as cards
- **THEN** the focus is in the new card's name box once the refetched plan is
  on screen

### Requirement: A draft be-01 refused survives the breakpoint itself

A draft be-01 refused SHALL be put back into the box the other renderer draws
for that cell when the viewport crosses the breakpoint, in either direction,
without the page being reloaded.

#### Scenario: refused on the table, read on the card

- **WHEN** a name typed into the table is refused by be-01 and the viewport is
  then narrowed past the breakpoint
- **THEN** the card's box for that cell holds the typed text, not the server's

### Requirement: An open list on a card owns the keyboard, and the sheet holds the page's back

While a card's `@` list is open it SHALL own the keys it uses: Enter SHALL take
what the list offers first rather than reaching the box under it, and Escape
SHALL close the list leaving what was typed on screen.

While the toolbar sheet is open, the page's own shortcuts SHALL NOT fire for a
keystroke aimed at the sheet.

#### Scenario: Enter belongs to the open list

- **WHEN** `@` is typed into a card's figure box and Enter is pressed
- **THEN** the person the list offers first is assigned, and the box is left
  holding the figure it was showing

#### Scenario: the cheat sheet does not open over the sheet

- **WHEN** `?` is pressed on the open toolbar sheet
- **THEN** the keyboard cheat sheet does not open

### Requirement: The toolbar is reachable on a phone

Every toolbar control SHALL be reachable while the plan is drawn as cards,
through one control that opens them as a sheet. The toolbar SHALL NOT be drawn
above the cards: it is about 1245px of controls at its narrowest.

#### Scenario: the sheet holds the toolbar

- **WHEN** the toolbar control is taken while the plan is drawn as cards
- **THEN** the toolbar's controls are on screen on a sheet
