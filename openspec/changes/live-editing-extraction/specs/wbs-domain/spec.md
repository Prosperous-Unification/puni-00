## ADDED Requirements

### Requirement: A draft be-01 refused belongs to the cell, not to the renderer

A cell's unsaved state SHALL outlive whatever is drawing it. When be-01 refuses
an edit, the text that was refused SHALL be held against the cell it was typed
into — `rowId::columnId` — and SHALL be put back into whatever box is next
rendered for that cell, whether the box arrives from the same renderer after a
remount or from a different renderer entirely.

The hold SHALL end when the person resolves it and not before: leaving the cell
again retries the edit, and putting the box back to what the server holds
abandons it. A refusal resolved under one renderer SHALL be resolved under
every renderer.

An edit be-01 **took** SHALL leave nothing held. The next renderer reads that
value from the plan like any other, and text carried across regardless would be
text nobody could account for.

#### Scenario: the phone is turned and the refusal comes with it

- **WHEN** a name is typed into a cell, be-01 refuses it, and the renderer
  drawing that cell is replaced by a different one showing the same plan
- **THEN** the new box for that cell holds the typed text, not the server's

#### Scenario: and turned back

- **WHEN** the refusal happened under the second renderer and the first one
  returns
- **THEN** its box for that cell holds the typed text too

#### Scenario: a refusal resolved under the new renderer is resolved for good

- **WHEN** the box under the second renderer is put back to what the server
  holds and left
- **THEN** nothing is held for that cell any more

#### Scenario: an edit that landed is not carried

- **WHEN** be-01 takes an edit and the renderer is then replaced
- **THEN** nothing is held for that cell, and the new box shows what the plan
  says

### Requirement: The editable grid is a container and not a table

A keyboard move between cells SHALL find the cells it moves between inside the
nearest element marked as the grid, and SHALL NOT require that element to be a
table. This covers Tab, Shift+Tab, the arrows, the command chords, and the focus
a structural edit asks for.

A box that is inside no grid SHALL be left to the browser rather than have its
key taken: a field in the toolbar is not a cell.

#### Scenario: the arrows work in a grid that is not a table

- **WHEN** the cells of a plan are rendered inside a non-table element marked as
  the grid
- **THEN** the focus moves between them exactly as it does inside the table

#### Scenario: a box outside the grid keeps its own keys

- **WHEN** a key that would move between cells is pressed in a box that is in no
  grid
- **THEN** nothing takes the key and the browser does what it would have done
