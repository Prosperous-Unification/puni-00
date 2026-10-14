## ADDED Requirements

### Requirement: A resting chip line shows whole chips and counts the rest

A resting Depends on, Teams, Tags, Services or Types cell SHALL draw only whole
chips on its one line. A dependency chip SHALL NOT end in an ellipsis. Chips that
do not fit SHALL be hidden whole and counted by a `+N` drawn after the chips,
whose title names them (`Also: …`). Nothing SHALL be drawn when no chip is
hidden. No resting strip or chip line SHALL wear an edge fade. The last drawn
chip's ✕ SHALL keep at least 4.5:1 contrast in both palettes. The Depends on
column's default width SHALL fit the plan's widest whole-row dependency chip,
plain or typed, and the count beside it, and SHALL NOT be below 84px. This
supersedes `deps-single-line`'s edge fade and its "no `+N` marker" sentence.

#### Scenario: a row waiting for three deep numbers

- **WHEN** a row waits for `010.3.01`, `010.3.02` and `010.3.03` at the default width
- **THEN** it reads `+ 010.3.01 ✕ +2`, with the title `Also: 010.3.02, 010.3.03`, and nothing fades

#### Scenario: a chip too wide for any width the plan sets

- **WHEN** a node-scoped typed chip is wider than the cell
- **THEN** it is hidden whole and counted `+1`, and the strip stays the same frame after frame

### Requirement: Creatable pickers share one placeholder word

Every creatable picker's empty box in the plan table and on the phone's sheets
SHALL say `search`; creating is offered by the list's `Add “…”` line.

#### Scenario: an empty Teams cell

- **WHEN** a row states no team and inherits none
- **THEN** its box reads `search`, like the Tags, Services and Types boxes
