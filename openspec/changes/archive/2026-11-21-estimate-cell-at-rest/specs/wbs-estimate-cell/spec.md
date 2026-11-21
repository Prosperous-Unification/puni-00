## ADDED Requirements

### Requirement: The result is the folded step cell's main reading

Whenever a folded step has an estimate whose result differs from its trio, the cell SHALL draw the result at the row's own type and foreground, with tabular numerals and no leading separator. An equal trio follows the single-reading requirement below.

#### Scenario: An estimated folded step is read at a glance

- **WHEN** a step with an estimate whose result differs from its trio is folded
- **THEN** its result is drawn at the row's own type and foreground
- **THEN** its result uses tabular numerals and has no leading separator

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

When a trio's text equals its result, the trio SHALL remain visibly readable at rest and the duplicate result SHALL be suppressed. This rule SHALL apply to a parent's rolled-up trio as well as a leaf's box.

#### Scenario: A leaf has a flat trio

- **WHEN** a folded leaf's trio text equals its result and the cell is at rest
- **THEN** the trio value remains visibly readable in the input box
- **THEN** no duplicate result span is drawn

#### Scenario: A parent has a flat rolled-up trio

- **WHEN** a folded parent's rolled-up trio text equals its result
- **THEN** the rolled-up trio value remains visibly readable in its trio span
- **THEN** no duplicate result span is drawn

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
