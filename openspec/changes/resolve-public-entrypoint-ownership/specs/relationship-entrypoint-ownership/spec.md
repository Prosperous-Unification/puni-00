## ADDED Requirements

### Requirement: Public entrypoints have deterministic emitting owners

For each requested public entrypoint, extraction SHALL retain the sole emitting configuration as owner even if it imports the entrypoint transitively. If multiple configurations emit the entrypoint, extraction SHALL select only the unique emitting configuration whose compiler root file list contains that entrypoint. Extraction MUST refuse zero or multiple qualifying roots and report the relevant sorted configuration paths. It MUST refuse an entrypoint emitted by no configured program.

#### Scenario: Provider with importing programs

- **WHEN** a provider explicitly includes the entrypoint and two other selected programs emit it only through imports
- **THEN** the provider owns the public declaration selector regardless of selected configuration order

#### Scenario: Multiple explicit roots

- **WHEN** multiple emitting configurations explicitly include the requested entrypoint
- **THEN** extraction refuses and names the conflicting explicit-root configurations

#### Scenario: No explicit root among multiple emitters

- **WHEN** multiple selected programs emit the requested entrypoint only through imports
- **THEN** extraction refuses and names the emitting configurations

#### Scenario: Single transitive emitter

- **WHEN** only one selected program emits the requested entrypoint through an import
- **THEN** extraction preserves that program as owner

#### Scenario: Missing public entrypoint

- **WHEN** no selected program emits the requested entrypoint
- **THEN** extraction refuses instead of fabricating an owner

### Requirement: Owner selection preserves declaration evidence

Extraction SHALL bind the selected owner's configPath, configurationIdentity and complete transitive declaration closure into the public selector identity. Ownership selection MUST NOT prune imports or alter configuration hashing.

#### Scenario: Transitive declaration edit

- **WHEN** a declaration reached through the chosen entrypoint changes with the chosen configuration unchanged
- **THEN** the public selector identity changes and its configurationIdentity remains stable
