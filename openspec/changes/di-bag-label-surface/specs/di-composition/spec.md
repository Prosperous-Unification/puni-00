## MODIFIED Requirements

### Requirement: A module's label names its private bindings in failures

Every sealed module SHALL carry the exact `moduleLabel` implied by its module directory and SHALL expose it through the read-only module getter. The label-agreement check SHALL read that getter on the sealed module it scans. A private binding SHALL NOT be required solely for label agreement. A container-only consumer SHALL attribute bindings to module installations through `moduleInstallationId` and `moduleInstallations`, including unlabelled and empty installations, without parsing slash-delimited binding labels.

#### Scenario: A forged prefix does not supply a module label

- **GIVEN** the scanned Capacity module is unlabelled and registers a private key `application.capacity/secret`
- **WHEN** the label-agreement check reads the sealed module
- **THEN** it reports the missing `application.capacity` module label even though the binding label has that prefix

#### Scenario: A nested labelled module does not label its parent

- **GIVEN** the scanned Capacity module is an unlabelled wrapper that installs a labelled inner module
- **WHEN** the label-agreement check reads the wrapper
- **THEN** it reports the wrapper's missing `application.capacity` label

#### Scenario: No private binding is required for label agreement

- **GIVEN** a sealed module with the expected label and all its bindings exported, or no bindings
- **WHEN** the label-agreement check reads its getter
- **THEN** the label agrees without requiring a private binding

#### Scenario: A binding's installation is identified in a container

- **GIVEN** a container includes a repeated module, an unlabelled wrapper and a binding whose key contains `/`
- **WHEN** a container-only consumer attributes a binding
- **THEN** it follows the binding's `moduleInstallationId` to the exact installation and its `parentInstallationId` ancestry
