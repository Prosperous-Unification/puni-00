# WBS estimate cell

## Purpose

Defines how a folded step cell presents its result and typed or rolled-up trio at rest and while editing.

## Requirements

### Requirement: The result is the folded step cell's main reading

Whenever a folded step has an estimate whose final result differs from its trio, the cell SHALL draw that result at the row's own type and foreground, with tabular numerals and no leading separator. When the result equals the trio, the trio SHALL be the sole visible reading.

#### Scenario: An estimated folded step is read at a glance

- **WHEN** a step with an estimate whose result differs from its trio is folded
- **THEN** its result is drawn at the row's own type and foreground
- **THEN** its result uses tabular numerals and has no leading separator

#### Scenario: A differing result is read at a glance

- **GIVEN** a folded estimated step whose final result differs from its trio
- **WHEN** the cell is drawn
- **THEN** the result uses the row's type and foreground, tabular numerals, and no leading separator

### Requirement: The typed trio recedes while the cell is not being typed in

The typed trio SHALL be smaller and muted at rest and SHALL return to the row's type and weight while its cell has focus.

#### Scenario: The folded estimate is at rest

- **WHEN** an estimated folded leaf's cell does not have focus
- **THEN** its typed trio is smaller than the row's type and uses the muted foreground

#### Scenario: The folded estimate is being typed in

- **WHEN** the folded estimate cell receives focus
- **THEN** its typed trio returns to the row's type and weight
- **WHEN** the cell loses focus
- **THEN** its typed trio recedes again

### Requirement: A flat trio is not said twice

When a folded leaf's typed shorthand equals its computed final result, the o/r/p input SHALL always display its value visibly at rest, including after save, blur and refresh, and the duplicate final span SHALL not be rendered. A parent's rolled-up trio SHALL likewise remain visibly readable, with an equal final result shown only once. When shorthand and final differ, both SHALL remain readable. Focus and refused-input styling SHALL remain visible; an incomplete three-box draft SHALL not be filled or committed by this presentation rule.

#### Scenario: A leaf has a flat trio

- **WHEN** a folded leaf's trio text equals its result and the cell is at rest
- **THEN** the trio value remains visibly readable in the input box
- **THEN** no duplicate result span is drawn

#### Scenario: A parent has a flat rolled-up trio

- **WHEN** a folded parent's rolled-up trio text equals its result
- **THEN** the rolled-up trio value remains visibly readable in its trio span
- **THEN** no duplicate result span is drawn

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

### Requirement: A parent's rolled-up cell reads like its leaves

A parent's rolled-up trio SHALL carry the resting leaf box's size, weight, and colour.

#### Scenario: A parent and leaf are read in one step column

- **WHEN** a folded parent and its folded leaf both show estimates for the same step
- **THEN** the parent's rolled-up trio has the resting leaf trio's size, weight, and colour

### Requirement: An unestimated step stays empty and a refusal never recedes

When a step has no estimate, no result SHALL be drawn. When a typed trio was refused, the trio SHALL keep the row's type and its invalid styling.

#### Scenario: A folded step has no estimate

- **WHEN** a folded step has no estimate
- **THEN** no result is drawn in its estimate cell

#### Scenario: A typed trio is refused

- **WHEN** a folded step cell contains a typed trio that was refused
- **THEN** the trio keeps the row's type and its invalid styling
