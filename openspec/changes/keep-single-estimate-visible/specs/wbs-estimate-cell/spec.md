## MODIFIED Requirements

### Requirement: The result is the folded step cell's main reading

Whenever a folded step has an estimate whose final result differs from its trio, the cell SHALL draw that result at the row's own type and foreground, with tabular numerals and no leading separator. When the result equals the trio, the trio SHALL be the sole visible reading.

#### Scenario: A differing result is read at a glance

- **GIVEN** a folded estimated step whose final result differs from its trio
- **WHEN** the cell is drawn
- **THEN** the result uses the row's type and foreground, tabular numerals, and no leading separator

### Requirement: A flat trio is not said twice

When a folded leaf's typed shorthand equals its computed final result, the o/r/p input SHALL always display its value visibly at rest, including after save, blur and refresh, and the duplicate final span SHALL not be rendered. A parent's rolled-up trio SHALL likewise remain visibly readable, with an equal final result shown only once. When shorthand and final differ, both SHALL remain readable. Focus and refused-input styling SHALL remain visible; an incomplete three-box draft SHALL not be filled or committed by this presentation rule.

#### Scenario: A saved single-number shorthand remains visible

- **GIVEN** a leaf whose shorthand 5 has been saved as 5/5/5
- **WHEN** the folded estimate cell blurs or is rendered again after refresh
- **THEN** its o/r/p input visibly reads 5
- **AND** no separate final span repeats 5

#### Scenario: A parent has an equal rolled-up trio

- **GIVEN** a folded parent whose rolled-up trio text equals its final result
- **WHEN** its estimate cell is drawn
- **THEN** its rolled-up trio is visibly readable
- **AND** no separate final span repeats it

#### Scenario: The final differs from the shorthand

- **GIVEN** a folded estimate whose shorthand and computed final differ
- **WHEN** the cell is at rest
- **THEN** its shorthand and final result are both visible

#### Scenario: Refused and incomplete entries stay honest

- **GIVEN** an invalid shorthand or an incomplete three-box draft
- **WHEN** the cell blurs
- **THEN** its validation or incomplete state remains visible
- **AND** the missing values are not silently filled or saved
