## ADDED Requirements

### Requirement: The signed-out page is one centred column

The signed-out page SHALL centre one column holding the `WBS tool v2` heading,
one line saying the product plans work breakdown structures, and the sign-in
panel, at every width from 375px up, with at least 16px on either side and no
sideways scroll. The column SHALL be anchored by its top near the window's
middle, so that what opens inside it grows downward and the heading does not
move. The password form's refusal line SHALL take no space while it is empty,
SHALL open between the password field and its button when a refusal is shown,
and SHALL stay open with its sentence while a further attempt is in flight.
Every reply that sets the refusal line SHALL put a new text node in its live
region, so a screen reader announces a refusal identical to the last one.

#### Scenario: a wide window

- **WHEN** the signed-out page is shown at 1440 × 900
- **THEN** the column and its panel are centred, and Password stands one form gap above its button

#### Scenario: a refused password

- **WHEN** the server refuses the username and password
- **THEN** the message is drawn whole between the password field and the button, and the heading does not move

#### Scenario: a second attempt after a refusal

- **WHEN** the reader submits again while the refusal is shown
- **THEN** the refusal line stays open with its sentence until the reply replaces it

#### Scenario: the same refusal twice

- **WHEN** the server refuses a second attempt with the same sentence as the first
- **THEN** the refusal line's live region holds a new text node with that sentence, and the line stays open

### Requirement: The plan toolbar ends in one group

Undo, Redo, Keyboard shortcuts, Export / Import and the schedule group (Starts,
Plan with and, while offered, Reset layout) SHALL be one group at the end of the
desktop plan toolbar, ending at the bar's right edge. When the bar wraps, no
other control SHALL share the group's row.

#### Scenario: a laptop window

- **WHEN** the plan is shown at 1024 and the bar wraps
- **THEN** row two holds Undo, Redo, Keyboard shortcuts, Export / Import, Starts and Plan with together at its right edge, and nothing else

### Requirement: Quiet table text clears 4.5:1 on a banded row

The hidden-chip count (`+N`) and the plan table's `search` placeholders SHALL
have at least 4.5:1 contrast, as painted, on a banded row in both palettes.

#### Scenario: a banded row with a hidden team

- **WHEN** the second row states two teams and the line draws one
- **THEN** its `+1`, and the `search` word of an empty banded cell, measure at least 4.5:1 in light and dark
