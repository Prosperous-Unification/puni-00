## ADDED Requirements

### Requirement: Ratchet mode uses a supplied adopted set

A rule in ratchet mode SHALL require an adopted set supplied by the consumer's trusted policy. A finding whose path is inside an adopted prefix SHALL be a refusal, and a finding outside the adopted set SHALL be debt. A policy that ratchets a rule without an adopted set SHALL be refused by name.

#### Scenario: Ratchet debt remains outside the adopted set

- **GIVEN** a rule in ratchet mode and a finding outside every adopted prefix
- **WHEN** Twilight Bureaucrat constructs the verdict
- **THEN** the finding is debt and does not refuse the candidate

#### Scenario: Ratchet refuses inside the adopted set

- **GIVEN** a rule in ratchet mode and a finding at or below an adopted prefix
- **WHEN** Twilight Bureaucrat constructs the verdict
- **THEN** the finding is a refusal and the candidate is disallowed

#### Scenario: Ratchet has no adopted set

- **GIVEN** a policy that assigns ratchet mode to a rule and states no adopted set
- **WHEN** Twilight Bureaucrat loads the policy
- **THEN** it refuses the policy and names the ratcheted rule

### Requirement: Source file size is ratcheted

Each production TypeScript source file under a measured root SHALL stay at or below the consumer's ceiling unless the policy pins that path above it. An unpinned file above the ceiling, a pinned file above its maximum, and a pin whose file has fallen to or below the ceiling SHALL be findings. A pin that names no measured candidate file SHALL leave the rule unevaluated.

#### Scenario: An unpinned source exceeds the ceiling

- **GIVEN** an unpinned production source under a measured root
- **WHEN** its line count exceeds the policy ceiling
- **THEN** F7 reports the path, line count, and ceiling

#### Scenario: A pinned source breaks the ratchet

- **GIVEN** a production source pinned above the ceiling
- **WHEN** it grows past its maximum or falls to or below the ceiling
- **THEN** F7 reports that the pin is violated or must be removed

#### Scenario: A size pin is stale

- **GIVEN** a size policy pin that names no measured candidate file
- **WHEN** F7 evaluates the candidate
- **THEN** F7 is unevaluated and names the stale path

### Requirement: Module layout

Each directory containing a kind-declared service SHALL declare a real wiki index at its own `README.md` and a regular `contract.ts` file. If the shared index report is unavailable, MOD-LAYOUT SHALL be unevaluated rather than reporting the module clean.

#### Scenario: A module declares its boundary

- **GIVEN** a directory containing a kind-declared service
- **WHEN** its own README is a checked wiki index and its contract is a regular candidate blob
- **THEN** MOD-LAYOUT reports no module-layout finding

#### Scenario: A module lacks a declaration

- **GIVEN** a directory containing a kind-declared service
- **WHEN** it lacks a checked wiki index or a regular contract file
- **THEN** MOD-LAYOUT reports the directory and each missing declaration

#### Scenario: Module indexes cannot be checked

- **GIVEN** a candidate whose shared index report is unavailable
- **WHEN** MOD-LAYOUT evaluates the candidate
- **THEN** the rule is unevaluated and carries the index-report reason

### Requirement: Kind direction over the import graph

Twilight Bureaucrat SHALL enforce K2 through K6 over kind-suffixed services and frontend delivery files in module `view` directories. It SHALL resolve path aliases, follow re-exports transitively, and keep composition roots outside the judged graph. Delivery SHALL NOT reach a resource-service or repository; a feature-service SHALL NOT reach a repository or delivery; a resource-service SHALL NOT reach a feature-service or delivery; a repository SHALL NOT reach a resource-service, feature-service, or delivery; and a kind SHALL NOT reach the same kind in another module.

#### Scenario: A barrel hides a forbidden dependency

- **GIVEN** a kinded service whose import reaches a forbidden kind through re-exports
- **WHEN** the kind-direction rule evaluates the extracted import graph
- **THEN** it reports the importing path, reached path, and original specifier

#### Scenario: Same-kind work crosses modules

- **GIVEN** two modules containing services of the same kind
- **WHEN** one service imports the service in the other module
- **THEN** K6 reports both modules

#### Scenario: A composition root wires every kind

- **GIVEN** a module composition root containing wiring only
- **WHEN** it imports each service kind
- **THEN** K2 through K6 report no finding for the composition root

### Requirement: Compiler-supported ambient non-code imports have no dependency target

When file/module resolution finds no target for an import but the configured TypeScript program binds
that exact import expression to an ambient module declaration, relationship extraction SHALL omit the
import from forward and reverse dependency selectors. It SHALL NOT invent a candidate or external
target. An unresolved import with no such compiler binding SHALL fail relationship extraction; every
selected rule that needs the graph SHALL be unevaluated and the verdict SHALL be disallowed in every
mode.

#### Scenario: Ambient stylesheet import is compiler-supported without an asset file

- **GIVEN** a configured program whose ambient declarations accept `import './styles.css'` and whose
  candidate contains no file at that path
- **WHEN** Twilight Bureaucrat extracts TypeScript relationships
- **THEN** extraction succeeds and contains no forward or reverse selector for that stylesheet

#### Scenario: Similar unresolved module has no ambient support

- **GIVEN** the same candidate imports `./absent` and no compiler declaration binds that expression
- **WHEN** a graph-dependent rule evaluates the candidate
- **THEN** extraction names the unresolved source and specifier, the rule is unevaluated, and the
  candidate is disallowed even in observe mode

### Requirement: Services are plain TypeScript

A feature-service, resource-service, repository adapter, or consumer-declared store or geometry path SHALL NOT reach React, React DOM, or a package under the TanStack React scope. Frontend delivery MAY reach those packages. A declared plain-TypeScript selector that matches no candidate path SHALL leave F1 unevaluated.

#### Scenario: A service reaches React

- **GIVEN** a kinded non-delivery service
- **WHEN** its import graph reaches React, React DOM, or a TanStack React package
- **THEN** F1 reports the importing path and external target

#### Scenario: A declared store reaches React

- **GIVEN** a store or geometry path declared plain TypeScript by policy
- **WHEN** its import graph reaches a React package
- **THEN** F1 reports the declared path and external target

#### Scenario: A plain-TypeScript selector is stale

- **GIVEN** a policy selector that matches no candidate path
- **WHEN** F1 evaluates the candidate
- **THEN** F1 is unevaluated and names the stale selector
