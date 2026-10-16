## ADDED Requirements

### Requirement: Neutral import directory dependency

Plan import SHALL reconcile directory entries through a neutral application port exposing exactly `listWithin`, `addWithin`, `patchTeamWithin` and `addPersonWithin`, preserving their existing signatures. The port and its outcome declarations MUST NOT depend on the concrete directory resource directly or transitively.

#### Scenario: Scoped directory retains its receiver and collector

- **WHEN** an admitted import reconciles its directory
- **THEN** composition supplies the existing complete scoped directory resource instance
- **AND** generic catalog inference and optional PersonKind remain available
- **AND** its method receiver, borrowed transaction, authority and collector retain existing behavior

#### Scenario: Production oracle detects concrete dependencies

- **WHEN** a committed candidate restores the concrete directory dependency directly or through a neutral-looking port re-export
- **THEN** the production K6 CLI reports imported-plan resource to directory resource
- **AND** the retained boundary oracle fails

#### Scenario: Port removes only the selected edge

- **WHEN** the production committed-candidate CLI evaluates the neutral port candidate with the reviewed policy
- **THEN** K6 has no unevaluated rules and zero findings
- **AND** only imported-plan resource to directory resource is removed from the single wave9 baseline finding
