## ADDED Requirements

### Requirement: Pools are clamped to the directory capacity

Both engines SHALL size a resource's pool as the project capacity, clamped to the directory
capacity when both are stated, or the directory capacity when only it is stated. The canonical
schedule input and its hash SHALL carry the effective pool size. A schedule SHALL still read no
claim, no occupancy and no other project's plan. With no directory capacity stated, schedules
SHALL be byte-identical to the previous contract.

#### Scenario: The project states more than exists

- **WHEN** a project states 32 GB of `host ram` whose directory capacity is 16, and two leaves
  each demand 16
- **THEN** both engines serialise the two leaves' blocks

#### Scenario: Golden corpus

- **WHEN** the golden corpus is scheduled with no directory capacity stated
- **THEN** every schedule and hash is byte-identical to the recorded one
