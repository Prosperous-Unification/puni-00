## ADDED Requirements

### Requirement: Up and Down move between rows in the same column

fe-01 SHALL move focus to the same column of the row above or below when Up or
Down is pressed in an editable cell, following the order the rows are rendered in.
A collapsed branch's children are not rendered and MUST be skipped. At the first
or last row the focus MUST NOT move.

#### Scenario: down a column of estimates

- **WHEN** Down is pressed in a role's optimistic cell
- **THEN** focus moves to the same role's optimistic cell on the next row shown

#### Scenario: past the end of the table

- **WHEN** Down is pressed on the last row
- **THEN** focus does not move

#### Scenario: over a collapsed branch

- **WHEN** Down is pressed on a row whose children are collapsed
- **THEN** focus moves to the next row on screen, not to a hidden child

### Requirement: Left and Right move between columns once the caret cannot

fe-01 SHALL move focus to the previous or next editable column of the same row
when Left is pressed with the caret at the start of the value, or Right with the
caret at its end, and nothing selected. With the caret anywhere else, or with a
selection, the key MUST be left to the browser. Focus MUST NOT wrap to another row.

#### Scenario: leaving a cell from its end

- **WHEN** Right is pressed with the caret at the end of a name
- **THEN** focus moves to the next editable column of that row

#### Scenario: moving the caret instead

- **WHEN** Right is pressed with the caret in the middle of a name
- **THEN** focus does not move and the caret does

#### Scenario: at the first column

- **WHEN** Left is pressed with the caret at the start of the first editable column
- **THEN** focus does not move

### Requirement: The derived number is not a stop

The number column SHALL NOT receive focus from this navigation. It is derived by
be-01 and cannot be edited, so stopping on it would be a keypress that does
nothing on every row.

#### Scenario: crossing the number column

- **WHEN** Left is pressed at the start of the name column
- **THEN** focus does not move, because the number to its left is not editable
