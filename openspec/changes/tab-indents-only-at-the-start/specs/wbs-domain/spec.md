## ADDED Requirements

### Requirement: Tab restructures only at the start of a name

The Name cell SHALL indent on Tab and outdent on Shift+Tab only while the
caret sits at position zero with nothing selected. In any other position, or
with a selection, the Name cell SHALL move focus to the next editable cell in
the table on Tab and to the previous one on Shift+Tab, selecting the target's
text; no move SHALL be requested. At the edge of the grid the key SHALL be
left to the browser.

#### Scenario: indenting from the start

- **WHEN** the caret sits at position zero of a name and Tab is pressed
- **THEN** the row indents, exactly as before

#### Scenario: tab inside the text walks the table

- **WHEN** the caret sits past the start of `010`'s name and Tab is pressed
- **THEN** focus lands on `010`'s first estimate cell, its text selected, and
  no move is requested

#### Scenario: shift-tab inside the text walks backwards

- **WHEN** the caret sits past the start of `020`'s name and Shift+Tab is
  pressed
- **THEN** focus lands on the last editable cell of the row above and no move
  is requested

#### Scenario: a selection never restructures

- **WHEN** any text is selected in a name and Tab is pressed
- **THEN** focus moves to the next editable cell and no move is requested
