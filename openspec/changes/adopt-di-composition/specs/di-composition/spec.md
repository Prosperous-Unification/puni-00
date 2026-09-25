## ADDED Requirements

### Requirement: One sealed module per service responsibility

Every service responsibility named in the 040.6 backend module map SHALL be one sealed DI Bag
module whose directory holds a README, a `contract.ts` stating its exports and requirements, a
`module.ts` sealed with `buildModule`, and a composition check, and SHALL export only the
contract's services.

#### Scenario: A module exports its service and nothing else

- **GIVEN** a sealed module for one service responsibility
- **WHEN** a host installs it and names an export the contract does not state
- **THEN** the graph refuses the name instead of resolving it

#### Scenario: A module names what a host must supply

- **GIVEN** a sealed module whose requirements are repository ports
- **WHEN** a host omits one of them
- **THEN** the composition is refused before the service is used

### Requirement: A module's label names its private bindings in failures

Every sealed module SHALL be built with a `moduleLabel` that is its module identifier with only the
`module.` prefix dropped, so that its private bindings appear as `<label>/<key>` in DI failure
messages and in `graphSnapshot()`. A module that lives in a library SHALL be identified as
`module.<ring>.<name>`; a module that lives under an app SHALL be identified as
`module.<runtime>.<name>`, where the runtime is `backend`, `frontend`, `gateway` or `mcp` by the app
it lives under. The nine existing identifiers SHALL NOT change.

#### Scenario: A missing requirement names the module that asked

- **GIVEN** a host graph missing one of a module's requirements
- **WHEN** the module's exported service is resolved
- **THEN** the refusal names the private binding as `<label>/<key>` and the resolution path through it

#### Scenario: A library module and an app module are identified

- **GIVEN** Plan history in the portable core and Optimization under `apps/wbs/be-01`
- **WHEN** each module's identifier is read
- **THEN** Plan history is `module.application.plan-history` and Optimization is
  `module.backend.optimization`, and each label drops only the `module.` prefix

#### Scenario: Everything that names a module agrees with its label

- **GIVEN** a sealed module under the core's or be-01's module directory
- **WHEN** its label is read from an installation, and its identifier from its README index, its
  wiki pilot row and boundary, and every `kinds.json` shim row naming it
- **THEN** each agrees with the identifier its location implies, and a module with no pilot
  registration is one the change names

### Requirement: The bag is reachable only from a composition root

A bag SHALL be built only by a module's own composition function or by a composition root, and the
value that function returns SHALL carry the contract's exports and nothing else.

#### Scenario: A consumer cannot reach a private binding

- **GIVEN** a module installed in a host graph
- **WHEN** a private binding key is resolved from that host
- **THEN** the host answers that the service is not registered

#### Scenario: The installer's returned surface carries no bag

- **GIVEN** a module's composition function
- **WHEN** the properties of the value it returns are enumerated
- **THEN** they are exactly the contract's exports and none of them is a bag

### Requirement: No service imports a same-kind sibling

A resource-service SHALL NOT import another module's resource-service and a feature-service SHALL
NOT import another module's feature-service; a rule two of them share SHALL live in the domain
library, and sideways work SHALL go through a neutral published event port.

#### Scenario: A shared write gate lives in the domain library

- **GIVEN** two resource-services that gate writes on project ownership
- **WHEN** each one asks the question
- **THEN** both call the domain library's rule and neither imports the other

#### Scenario: A publisher does not import Realtime

- **GIVEN** a resource-service that announces a change
- **WHEN** it publishes
- **THEN** it depends on the neutral event port and not on the Realtime module

### Requirement: A module records the layering debt it does not close

A module whose contract requires a repository port from a feature-service SHALL state that the
dependency is preserved K3 debt rather than compliance, and the change SHALL track it.

#### Scenario: A feature module requires a store port

- **GIVEN** a feature-service module that reads a repository port
- **WHEN** its contract is read
- **THEN** it names the K3 obligation it leaves open and where that obligation is tracked

### Requirement: Existing core exports keep working through the move

Every symbol `@wbs/core` and its deep service paths export today SHALL keep its name and its single
definition while a responsibility moves, with the former path retained as a compatibility
re-export and no second class or type definition created.

#### Scenario: A moved service keeps its former deep path

- **GIVEN** a service file moved into its module directory
- **WHEN** a caller imports the former `@wbs/core/service/<name>` path
- **THEN** it receives the same declaration the module exports

### Requirement: Core modules own no process lifetime

A core module SHALL register a disposer only for a resource it creates, and SHALL borrow the
source, retention timer, optimizer runtime and listener whose disposal `bootBe01` already owns in
its tested order.

#### Scenario: Installing a core module adds no disposer to boot

- **GIVEN** a core module installed into the composed services
- **WHEN** the process shuts down
- **THEN** the shutdown order and the set of closed resources are unchanged

### Requirement: Writing modules are installed per admitted scope

The services built over an admitted transaction's stores SHALL be installed per supplied scope, so
that no staged store, announcement collector or working plan is shared between two transactions.

#### Scenario: Two command batches do not share staged state

- **GIVEN** two command batches admitted in turn
- **WHEN** each builds its writing services
- **THEN** neither sees the other's staged stores or collected announcements
