## ADDED Requirements

### Requirement: Neutral tree announcement dependency

Plan import SHALL announce the imported tree through a neutral application port whose `announceTreeNow(projectId: string)` returns `Promise<void>`. This port MUST NOT import or re-export the concrete work-item resource directly or transitively.

#### Scenario: Scoped resource retains its receiver and collector

- **WHEN** an admitted import announces its completed tree
- **THEN** composition supplies the existing scoped work-item resource instance
- **AND** its method retains its receiver, borrowed scope and import collector
- **AND** import writes, authority, committed fan-out and rollback retain existing behavior

#### Scenario: Production oracle detects concrete imports

- **WHEN** a committed candidate restores the concrete work-item dependency directly or through a neutral-looking port barrel
- **THEN** the production K6 CLI reports imported-plan resource to work-item resource
- **AND** the retained boundary oracle fails

#### Scenario: Port removes only the selected edge

- **WHEN** the production committed-candidate CLI evaluates the neutral port candidate with the reviewed policy
- **THEN** K6 has no unevaluated rules and exactly three findings
- **AND** only imported-plan resource to work-item resource is removed from the four baseline findings
