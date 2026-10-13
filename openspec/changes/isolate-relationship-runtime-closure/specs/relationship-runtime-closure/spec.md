## ADDED Requirements

### Requirement: Trusted packages resolve in an isolated physical topology

Relationship extraction SHALL materialize a physical node_modules directory and copy complete requested packages from TOOL_WIKI_TRUSTED_NODE_MODULES, preserving scoped packages, nested dependencies, package metadata and relative paths. It MUST NOT consume candidate-supplied packages or resolve missing dependencies from ancestor installations.

#### Scenario: Arbitrary trusted directory basename

- **WHEN** a trusted directory named trusted-node-modules supplies vendor A importing vendor B and the candidate augments B
- **THEN** A and the augmentation resolve the trusted B even when an incompatible B exists in the trusted directory's ancestor node_modules

#### Scenario: Missing trusted dependency

- **WHEN** trusted B is absent, with or without a compatible ancestor B
- **THEN** extraction refuses rather than substituting ancestor bytes

#### Scenario: Scoped config and nested dependency

- **WHEN** the candidate extends a trusted scoped config package and A supplies a nested B
- **THEN** compilation uses the scoped configuration and A's nested dependency topology

#### Scenario: Candidate supplies modules

- **WHEN** the candidate snapshot contains a node_modules path segment at any depth, including a symlink alias
- **THEN** extraction refuses before compiler consumption

### Requirement: Compiler reads remain within the admitted closure

Configuration parsing, compilation and manual relationship resolution MUST use one guarded filesystem view. Loaded declarations MUST resolve within the frozen candidate or copied runtime closure. Sources classified as external by TypeScript MUST resolve canonically inside the physical copied node_modules directory, except for the bundled compiler's explicitly identified standard library declarations. Trusted unreadability and escaping symlinks MUST throw.

#### Scenario: Outside compiler input

- **WHEN** the candidate imports an absolute file outside the admitted closure
- **THEN** extraction refuses without admitting that file as a declaration

#### Scenario: Unreadable trusted declaration

- **WHEN** a requested trusted package contains an unreadable declaration
- **THEN** extraction reports unreadable trusted state

#### Scenario: Escaping trusted symlink

- **WHEN** a requested trusted package contains a symlink outside the trusted runtime root
- **THEN** extraction refuses the escaping symlink

### Requirement: Failed materialization cleans temporary state

Extraction MUST publish a requested package only after copying it completely and MUST remove its temporary candidate and package staging directories on failure.

#### Scenario: Broken package copy

- **WHEN** package copying encounters a broken symlink
- **THEN** extraction refuses and its temporary directory contains no retained candidate or partially published package
