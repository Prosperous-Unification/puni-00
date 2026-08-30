## ADDED Requirements

### Requirement: The Number cell reserves its caret's width

Every Number cell SHALL reserve the disclosure caret's width whether or not its
row can be expanded, so that two rows at the same depth print their numbers at
the same horizontal position regardless of whether either has children. The
caret SHALL remain the control that expands and collapses the row, and SHALL
still be absent while a search is on.

A row whose number is frozen SHALL print its frozen marker after the number
rather than before it, so the marker cannot move the number either.

#### Scenario: a parent and a childless sibling line their numbers up

- **GIVEN** two rows at the same depth, one with children and one without
- **WHEN** the table is shown with the parent expanded
- **THEN** the left edge of both numbers is at the same horizontal position

#### Scenario: collapsing a row does not move its number

- **WHEN** a row with children is collapsed and then expanded
- **THEN** its number's horizontal position is unchanged by either

#### Scenario: a frozen row's number does not move

- **GIVEN** two rows at the same depth, one frozen and one not
- **THEN** the left edge of both numbers is at the same horizontal position

#### Scenario: the caret still expands

- **WHEN** the caret of a collapsed row with children is clicked
- **THEN** that row's children are shown

### Requirement: A folded role cell names its assignee by initials

A folded role cell SHALL print the assignee as at most two characters — the
first letter of each of the first two words of the name, or the first two
letters where the name is one word — in upper case, and SHALL NOT ellipsise
them. Where the assignee is assumed rather than set, the initials SHALL keep
the bracketed, muted form the cell uses today.

The hover card SHALL keep naming the assignee in full. The cell SHALL NOT carry
a native tooltip of its own — a decision from 2026-08-09 that this change keeps
rather than reverses.

The unfolded role columns SHALL keep printing the whole name.

#### Scenario: a set assignee reads as initials

- **GIVEN** a folded role whose assignee is named `vadym`
- **THEN** its cell prints `VA` and no ellipsis

#### Scenario: a two-word name takes one letter from each

- **GIVEN** a folded role whose assignee is named `Kat Nowak`
- **THEN** its cell prints `KN`

#### Scenario: an assumed assignee stays bracketed and muted

- **GIVEN** a folded role with no assignee of its own and an assumed one named `vadym`
- **THEN** its cell prints `(VA)` in the muted colour

#### Scenario: the whole name is still reachable

- **WHEN** a folded role cell with an assignee is hovered
- **THEN** the card names the assignee in full

#### Scenario: the cell adds no tooltip of its own

- **GIVEN** a folded role cell with an assignee
- **THEN** the printed initials carry no `title` attribute

#### Scenario: an unfolded role still prints the name

- **WHEN** a role is unfolded into its own columns
- **THEN** the assignee is printed as their whole name

#### Scenario: the estimate syntax reminder is no longer clipped

- **GIVEN** a folded role cell with no estimate and an assumed assignee
- **THEN** the whole `o/r/p` placeholder is visible in the cell
