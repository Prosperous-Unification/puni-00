## ADDED Requirements

### Requirement: A stored estimate can be taken back off

A work item's three-point estimate for one role SHALL be removable. The
removal SHALL take away that work item's trio for that role alone, leaving
every other role on the same work item and the same role on every other work
item untouched. Removing a trio that is not stored SHALL be reported as a
success rather than as a missing thing, so clearing twice is not an error. The
removal SHALL be refused for a caller who may not edit the project, and SHALL
be reported as not found for a work item that does not exist. Parents SHALL
report the sum of what is left below them, and the project's subscribers SHALL
be told, as narrowly as a written estimate tells them.

#### Scenario: clearing one role's trio

- **GIVEN** a leaf with a Dev trio and a QA trio
- **WHEN** its Dev estimate is cleared
- **THEN** the tree reports the leaf as holding the QA trio and no Dev trio

#### Scenario: clearing the same trio twice

- **WHEN** a stored trio is cleared and then cleared again
- **THEN** both answer success, and the trio is gone once

#### Scenario: the parent's roll-up drops

- **GIVEN** a parent over two leaves estimated `1 / 2 / 3` and `10 / 20 / 30`
  for Dev, reported on the parent as `11 / 22 / 33`
- **WHEN** the first leaf's Dev estimate is cleared
- **THEN** the parent reports `10 / 20 / 30`

#### Scenario: a caller who may not write

- **GIVEN** a restricted project and a caller who does not own it
- **WHEN** that caller asks to clear a stored trio
- **THEN** it is refused and the trio is still there

#### Scenario: an unauthenticated caller

- **WHEN** the clear is asked for without a valid token
- **THEN** it answers 401 and the trio is still there

#### Scenario: peers hear about it

- **WHEN** a leaf's estimate is cleared
- **THEN** the project's subscribers receive the leaf and its ancestors, whose
  totals moved

### Requirement: Emptying all three boxes clears the estimate

The table SHALL clear a stored trio when, after an edit, all three of that row
and role's boxes read empty and the server holds a trio for them, and SHALL
drop that trio's drafts once the clear is accepted. It SHALL NOT clear
anything when only some of the boxes are empty: a partly filled trio SHALL
remain marked invalid with nothing sent, exactly as before. It SHALL NOT send
anything for a row and role the server holds no trio for.

#### Scenario: all three boxes emptied

- **GIVEN** a row whose Dev trio is stored as `2 / 3 / 10`
- **WHEN** all three Dev boxes are emptied
- **THEN** the estimate is cleared, the boxes read empty, and none of them is
  marked invalid

#### Scenario: two boxes emptied

- **GIVEN** the same stored trio
- **WHEN** the optimistic and realistic boxes are emptied and pessimistic is
  left alone
- **THEN** nothing is cleared, the stored trio is unchanged, and the two empty
  boxes are marked invalid with the reason that the estimate is not saved

#### Scenario: emptying a row that was never estimated

- **GIVEN** a row with no stored trio for Dev
- **WHEN** its already-empty Dev boxes are edited to empty
- **THEN** nothing is sent
