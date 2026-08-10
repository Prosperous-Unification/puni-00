## ADDED Requirements

### Requirement: Backspace on an empty root row removes it

The Name cell SHALL treat Backspace as a removal when the caret sits at
position zero with nothing selected, the row is at root level, and the item is
wholly empty: nothing in the Name input, no notes, no estimates of its own, no
children, and no dependencies. The row is removed and focus SHALL move to the
Name cell of the row above it, when one exists. A nested row SHALL
keep outdenting instead (the existing behaviour), and a row holding any
content SHALL leave Backspace untouched.

#### Scenario: removing an abandoned empty row

- **WHEN** the caret sits in the empty Name of root row `020`, which has no
  notes, estimates, children or dependencies, and Backspace is pressed
- **THEN** the row is removed and focus sits in `010`'s Name

#### Scenario: a nested empty row outdents first

- **WHEN** the caret sits in the empty Name of `010.1` and Backspace is pressed
- **THEN** the row outdents to `020`; nothing is removed

#### Scenario: text in the Name input vetoes removal

- **WHEN** the Name input of a root row holds any text — committed or not —
  with the caret at position zero, and Backspace is pressed
- **THEN** nothing is removed and nothing is moved

#### Scenario: notes, estimates, children or dependencies veto removal

- **WHEN** the caret sits in the empty Name of a root row that has notes, an
  estimate, a child, or a dependency, and Backspace is pressed
- **THEN** nothing is removed and nothing is moved
