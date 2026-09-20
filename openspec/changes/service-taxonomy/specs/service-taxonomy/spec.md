## ADDED Requirements

### Requirement: K1 every service declares exactly one kind

Every service file SHALL declare exactly one kind, by its filename suffix or by an entry in the classification file, and SHALL NOT carry both.

#### Scenario: [SERVICE-TAXONOMY-001] A service has no kind

- **GIVEN** a candidate service file
- **WHEN** it has neither a kind suffix nor a classification entry
- **THEN** the inventory fails and names the path

#### Scenario: [SERVICE-TAXONOMY-002] A service has two declarations

- **GIVEN** a candidate service file with a kind suffix
- **WHEN** the classification file also names it
- **THEN** the inventory fails and names the path

#### Scenario: [SERVICE-TAXONOMY-003] A suffix declares one kind

- **GIVEN** a candidate service file with exactly one kind suffix
- **WHEN** no classification entry also names it
- **THEN** the inventory passes that file

### Requirement: K2 delivery imports only its allowed dependencies

Delivery SHALL import feature-services, the domain library and its own delivery files. Backend delivery SHALL import the contracts library; frontend delivery SHALL import only types from it. Neither SHALL import a resource-service, a repository port or a repository adapter. Frontend delivery SHALL be allowed to import React, and backend delivery SHALL NOT import it. The import matrix in the code organization design, not this scenario list, SHALL be the complete statement.

#### Scenario: [SERVICE-TAXONOMY-004] A component reaches through its feature

- **GIVEN** a frontend delivery component
- **WHEN** it imports a resource-service
- **THEN** the direction check fails and names the import

#### Scenario: [SERVICE-TAXONOMY-005] A component uses its allowed dependencies

- **GIVEN** a frontend delivery component
- **WHEN** it imports a feature-service, the domain library, contracts types and React
- **THEN** the direction check passes those imports

#### Scenario: [SERVICE-TAXONOMY-006] Contracts values differ by delivery runtime

- **GIVEN** the same runtime value exported by the contracts library
- **WHEN** a frontend component imports it
- **THEN** the direction check fails that component
- **AND** the direction check passes a backend controller importing that value

### Requirement: K3 feature-services coordinate resources

A feature-service SHALL import resource-services, the domain library and the contracts library, and SHALL NOT import a repository port or adapter, a feature-service of another module, delivery, React or a vendor UI library. Layering SHALL be strict, with no exception for a resource-service that would only forward. The import matrix in the code organization design, not this scenario list, SHALL be the complete statement.

#### Scenario: [SERVICE-TAXONOMY-007] A feature reaches a repository

- **GIVEN** a feature-service
- **WHEN** it imports a repository port
- **THEN** the direction check fails and names the import

#### Scenario: [SERVICE-TAXONOMY-008] A feature uses its allowed dependencies

- **GIVEN** a feature-service
- **WHEN** it imports a resource-service, the domain library and the contracts library
- **THEN** the direction check passes those imports

#### Scenario: [SERVICE-TAXONOMY-009] A barrel hides a forbidden repository

- **GIVEN** a feature-service whose barrel import resolves to a repository
- **WHEN** fast lint sees only the barrel and the authoritative graph resolves it
- **THEN** lint passes and the graph check fails

### Requirement: K4 resource-services protect one resource

A resource-service SHALL import repository ports, the domain library and the contracts library, and SHALL NOT import a feature-service, a resource-service of another module, delivery, React or a vendor UI library. The import matrix in the code organization design, not this scenario list, SHALL be the complete statement.

#### Scenario: [SERVICE-TAXONOMY-010] A resource reaches a feature

- **GIVEN** a resource-service
- **WHEN** it imports a feature-service
- **THEN** the direction check fails and names the import

#### Scenario: [SERVICE-TAXONOMY-011] A resource uses its allowed dependencies

- **GIVEN** a resource-service
- **WHEN** it imports a repository port and the domain library
- **THEN** the direction check passes those imports

#### Scenario: [SERVICE-TAXONOMY-012] A resource reaches delivery

- **GIVEN** a resource-service
- **WHEN** it imports a delivery file
- **THEN** the direction check fails and names the import

### Requirement: K5 repository adapters import nothing above them

A repository adapter SHALL import the domain library, the contracts library and the port it implements, and SHALL import nothing above it: no resource-service, no feature-service, no delivery, no React and no vendor UI library. The import matrix in the code organization design, not this scenario list, SHALL be the complete statement.

#### Scenario: [SERVICE-TAXONOMY-013] A repository reaches a resource

- **GIVEN** a repository adapter
- **WHEN** it imports a resource-service
- **THEN** the direction check fails and names the import

#### Scenario: [SERVICE-TAXONOMY-014] A repository implements its port

- **GIVEN** a repository adapter
- **WHEN** it imports its port and the domain library
- **THEN** the direction check passes those imports

### Requirement: K6 kinds do not import sideways

No kind SHALL import a sibling of the same kind from another module. Sideways work SHALL go through a published event. The import matrix in the code organization design, not this scenario list, SHALL be the complete statement.

#### Scenario: [SERVICE-TAXONOMY-015] A feature imports another module's feature

- **GIVEN** two modules with feature-services
- **WHEN** one feature-service imports the other
- **THEN** the direction check fails and names both modules

#### Scenario: [SERVICE-TAXONOMY-016] Same-kind files stay inside one module

- **GIVEN** two files of one kind inside one module
- **WHEN** one imports the other
- **THEN** the direction check passes that import

### Requirement: Composition roots contain wiring only

A composition root SHALL be exempt from K2 to K6 because it installs modules and supplies adapters, and SHALL contain wiring only and no policy.

#### Scenario: [SERVICE-TAXONOMY-017] A composition root supplies every kind

- **GIVEN** a declared composition root containing wiring only
- **WHEN** it imports every service kind
- **THEN** the direction check passes those imports

#### Scenario: [SERVICE-TAXONOMY-018] Policy claims the wiring exemption

- **GIVEN** a file claiming to be a composition root
- **WHEN** it branches on domain state
- **THEN** the composition-root check reports the policy branch

### Requirement: K7 feature-services own transactions

The feature-service SHALL own the transaction. A resource-service SHALL NOT open a unit of work; it is built over the admitted stores. Until a static check for this rule exists, conformance SHALL be judged by review, and review SHALL be named as its check.

#### Scenario: [SERVICE-TAXONOMY-019] A resource opens a unit of work

- **GIVEN** review of a resource-service
- **WHEN** the resource-service opens a unit of work
- **THEN** review refuses it and records that review is the current check

#### Scenario: [SERVICE-TAXONOMY-020] A feature owns a multi-resource transaction

- **GIVEN** a feature-service that opens a unit of work
- **WHEN** it calls two resource-services inside that unit
- **THEN** review accepts the transaction ownership

### Requirement: K8 each table has one resource owner

Each table SHALL belong to exactly one resource module, proved from the migration facts the wiki tool already extracts.

#### Scenario: [SERVICE-TAXONOMY-021] Two modules claim one table

- **GIVEN** migration facts for a table
- **WHEN** two resource modules claim it
- **THEN** the ownership check fails and names both modules

#### Scenario: [SERVICE-TAXONOMY-022] No module claims a table

- **GIVEN** migration facts for a table
- **WHEN** no resource module claims it
- **THEN** the ownership check fails and names the table

### Requirement: K9 kinds name their domain owner

A feature-service SHALL name the one capability it serves and a resource-service SHALL name the one glossary term it is named after, both machine-readably.

#### Scenario: [SERVICE-TAXONOMY-023] A feature has no capability

- **GIVEN** a classified feature-service
- **WHEN** it names no capability
- **THEN** the classification check fails and names the service

#### Scenario: [SERVICE-TAXONOMY-024] A resource names no glossary term

- **GIVEN** a classified resource-service
- **WHEN** its named term is absent from the glossary
- **THEN** the classification check fails and names the term

### Requirement: Inventory integrity is enforced in every mode

The classification record SHALL be complete and current independently of any rule's mode: a candidate service file with neither a kind suffix nor an entry SHALL fail; an entry naming no existing file SHALL fail; a file carrying both a suffix and an entry SHALL fail; and an absent, unreadable or malformed classification file SHALL fail. These SHALL be checks on the record, not on the code, and observe mode SHALL NOT suppress them.

#### Scenario: [SERVICE-TAXONOMY-042] Observe mode finds an unclassified candidate

- **GIVEN** every taxonomy rule is in observe mode
- **WHEN** a candidate service file has neither a suffix nor an entry
- **THEN** the inventory check fails the candidate

#### Scenario: [SERVICE-TAXONOMY-043] A classification entry is stale

- **GIVEN** a classification entry
- **WHEN** it names no existing file
- **THEN** the inventory check fails and names the stale path

#### Scenario: [SERVICE-TAXONOMY-044] The classification file is unavailable

- **GIVEN** the classification file is absent or unreadable
- **WHEN** inventory is evaluated
- **THEN** the inventory check fails and distinguishes absence from unreadability

#### Scenario: [SERVICE-TAXONOMY-045] A classification entry is malformed

- **GIVEN** a malformed classification entry
- **WHEN** inventory is evaluated
- **THEN** the inventory check fails and names the entry

### Requirement: F1 services stores and geometry are plain TypeScript

Feature-services, resource-services, stores and geometry SHALL be plain TypeScript and SHALL NOT import React or a React package.

#### Scenario: [SERVICE-TAXONOMY-025] A service imports React

- **GIVEN** a service file
- **WHEN** it imports React
- **THEN** the framework boundary fails and names the import

#### Scenario: [SERVICE-TAXONOMY-026] A store or geometry module imports React

- **GIVEN** a store module or geometry module
- **WHEN** it imports React
- **THEN** the framework boundary fails and names the import

#### Scenario: [SERVICE-TAXONOMY-027] A component imports React

- **GIVEN** a delivery component
- **WHEN** it imports React
- **THEN** the framework boundary passes that import

### Requirement: F2 stateful services expose one store contract

Every stateful service SHALL expose one store contract: a subscribe function and a snapshot that is stable until something changed.

#### Scenario: [SERVICE-TAXONOMY-028] A snapshot changes without state changing

- **GIVEN** a stateful service whose state has not changed
- **WHEN** its snapshot is read twice
- **THEN** its unit test fails if the snapshot identity differs

### Requirement: F3 vendor UI stays inside primitives

Features SHALL import UI only from the application's own primitives layer, and only that layer SHALL import a vendor UI library or a web component.

#### Scenario: [SERVICE-TAXONOMY-029] A feature imports vendor UI

- **GIVEN** a feature file
- **WHEN** it imports a vendor UI library
- **THEN** the primitives boundary fails and names the import

#### Scenario: [SERVICE-TAXONOMY-030] A non-primitive file imports vendor UI

- **GIVEN** a file outside the primitives layer, whatever its kind
- **WHEN** it imports a vendor UI library
- **THEN** the primitives boundary fails and names the path

#### Scenario: [SERVICE-TAXONOMY-031] A primitive imports vendor UI

- **GIVEN** a file in the primitives layer
- **WHEN** it imports a vendor UI library
- **THEN** the primitives boundary passes that import

### Requirement: F7 source-file size is ratcheted

A production source file SHALL NOT grow past the size ceiling, and a file already above the ceiling SHALL only shrink.

#### Scenario: [SERVICE-TAXONOMY-032] An unlisted file exceeds the ceiling

- **GIVEN** an unlisted production source file
- **WHEN** its size exceeds the ceiling
- **THEN** the size check fails and names the file, its size and the ceiling

#### Scenario: [SERVICE-TAXONOMY-033] A listed oversized file grows

- **GIVEN** a production source file pinned above the ceiling
- **WHEN** its size exceeds its pinned size
- **THEN** the size check fails and names the file and both sizes

### Requirement: A module has one declared boundary

A module SHALL have the layout the code organization design names, SHALL be exactly one DI Bag module and exactly one wiki module, and SHALL NOT span runtimes.

#### Scenario: [SERVICE-TAXONOMY-034] A module has no contract

- **GIVEN** a module directory
- **WHEN** it contains no contract file
- **THEN** the module-layout check fails and names the directory

#### Scenario: [SERVICE-TAXONOMY-035] An index reaches into another module

- **GIVEN** a module index
- **WHEN** it names a second module's files as members
- **THEN** the module-membership check fails and names both modules

#### Scenario: [SERVICE-TAXONOMY-036] A module spans runtimes

- **GIVEN** the files named by one module
- **WHEN** they install into two runtimes' bags
- **THEN** the module-layout check fails and names both runtimes

### Requirement: Observe mode reports taxonomy debt

A rule in observe mode SHALL report every taxonomy violation as debt and SHALL NOT fail a candidate. Observe mode SHALL govern the taxonomy rules only; inventory integrity is outside it and SHALL fail in every mode.

#### Scenario: [SERVICE-TAXONOMY-037] Debt and an inventory failure coexist

- **GIVEN** taxonomy rules in observe mode
- **WHEN** one file has the wrong kind or crosses a layer and another candidate is unclassified
- **THEN** the taxonomy violation is reported as debt and does not refuse the candidate
- **AND** the inventory failure refuses the same candidate

### Requirement: Ratchet mode protects touched and adopted code

A rule in ratchet mode SHALL refuse a violation inside a module in the consumer's adopted set and SHALL report a violation outside it as debt without refusing. The adopted set SHALL be policy supplied by the consumer. Refusing a violation because the candidate **touched** its file SHALL additionally require a comparison base supplied as an explicit input, resolved to a tree object identity before judging and recorded in the verdict; until that input exists, scenario SERVICE-TAXONOMY-038 SHALL be unmet and SHALL NOT be claimed. Twilight Bureaucrat slice B2 supplies the adopted set; a policy that ratchets a rule without one SHALL be refused by name.

#### Scenario: [SERVICE-TAXONOMY-038] Touched code introduces a violation

- **GIVEN** a rule in ratchet mode
- **WHEN** a touched file introduces a violating import
- **THEN** the verdict refuses it

#### Scenario: [SERVICE-TAXONOMY-039] An adopted module regresses

- **GIVEN** a module in the consumer's adopted set
- **WHEN** it gains a violation
- **THEN** the verdict refuses it and names the module

#### Scenario: [SERVICE-TAXONOMY-040] Unadopted debt remains visible

- **GIVEN** an untouched pre-existing violation outside the adopted set
- **WHEN** ratchet mode evaluates it
- **THEN** the verdict reports debt and allows the candidate

### Requirement: Enforce mode refuses every taxonomy violation

A rule in enforce mode SHALL refuse every violation across the declared coverage.

#### Scenario: [SERVICE-TAXONOMY-041] Ratchet debt becomes an enforce refusal

- **GIVEN** a pre-existing violation that ratchet mode reported as debt
- **WHEN** the rule is evaluated in enforce mode
- **THEN** the verdict refuses the violation
