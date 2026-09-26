## MODIFIED Requirements

### Requirement: Plan transfer preserves typed and legacy dependencies

The new-format export/import and project/subtree copy SHALL preserve SS and FF types with endpoint identities. Import SHALL reject unsupported or missing type values in a new-format typed relationship; legacy-format links SHALL remain legacy FS without invented explicit scopes.

#### Scenario: FF round-trip

- **GIVEN** a plan with FF and SS typed relationships
- **WHEN** it is exported and imported
- **THEN** both types and endpoint scopes are unchanged

#### Scenario: Unknown type is refused

- **GIVEN** a new-format import declares type `SF`
- **WHEN** import validation runs
- **THEN** it is refused before any plan write
