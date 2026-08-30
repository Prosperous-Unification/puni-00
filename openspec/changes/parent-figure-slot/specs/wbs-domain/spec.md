## ADDED Requirements

### Requirement: A folded step cell's figure stands in one column

A folded step cell's derived figure SHALL stand at the same horizontal
position on a parent row as on the leaf rows under it, wherever both rows show
a trio and the figure the project's estimate method derives from it.

#### Scenario: a parent's figure aligns with its leaves'

- **GIVEN** a parent whose child holds the estimate `2/3/8`
- **WHEN** both rows show their trio and derived figure at rest
- **THEN** the parent's figure SHALL stand at the same x position as the leaf's
