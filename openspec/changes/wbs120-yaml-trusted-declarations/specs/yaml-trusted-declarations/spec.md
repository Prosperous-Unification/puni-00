## ADDED Requirements

### Requirement: YAML declarations are release-owned inputs

The shared trusted declaration closure used by package, toolkit and relocation producers SHALL include the locked yaml package. Installed extraction SHALL resolve its named imports and public declaration return types without candidate node_modules. Candidate imports SHALL NOT enroll additional trusted roots. Existing nested and transitive dependency resolution and input refusals SHALL remain in force.

#### Scenario: [YAML-TRUSTED-DECLARATIONS-001] Installed consumer resolves the real YAML parser

- **GIVEN** a committed candidate without node_modules whose public entrypoint imports `parseAllDocuments` from `yaml` and exposes its return type
- **WHEN** the installed package extracts relationships with the source workspace unavailable
- **THEN** extraction succeeds, reports the yaml import edge and preserves the public return declaration

#### Scenario: [YAML-TRUSTED-DECLARATIONS-002] Missing or altered trusted YAML is refused

- **GIVEN** the installed package's reviewed trusted closure includes yaml
- **WHEN** yaml is removed from the copied closure or its declaration bytes are altered
- **THEN** installed extraction refuses with no successful relationship report
- **AND** restoring the exact bytes restores successful extraction

#### Scenario: [YAML-TRUSTED-DECLARATIONS-003] Unsupported candidate dependency stays outside the closure

- **GIVEN** candidate source requests a package outside the release-owned roots and their installed transitive dependencies
- **WHEN** the release closure is derived
- **THEN** the candidate request does not add that package
