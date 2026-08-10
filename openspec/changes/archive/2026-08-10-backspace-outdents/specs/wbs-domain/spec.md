## ADDED Requirements

### Requirement: Backspace at the start of a name outdents the row

The Name cell SHALL treat Backspace as an outdent when the caret sits at
position zero, nothing is selected, and the row is below root level: the row
moves to its parent's level, the same move Shift+Tab performs. In any other
position, with any selection, or on a root row, the Name cell SHALL leave
Backspace an ordinary backspace and move nothing.

#### Scenario: outdenting a child

- **WHEN** the caret sits at the start of `010.1`'s name and Backspace is
  pressed
- **THEN** the row becomes `020`, the next sibling of `010`

#### Scenario: backspace inside the text

- **WHEN** the caret sits anywhere past the start of a child's name and
  Backspace is pressed
- **THEN** no move is requested

#### Scenario: backspace over a selection

- **WHEN** text is selected in a child's name — including a selection anchored
  at the start — and Backspace is pressed
- **THEN** no move is requested; the key deletes the selection as always

#### Scenario: a root row has nowhere to go

- **WHEN** the caret sits at the start of a root row's name and Backspace is
  pressed
- **THEN** no move is requested
