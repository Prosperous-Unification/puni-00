## ADDED Requirements

### Requirement: Direct creation is durably reserved and recorded

The lab SHALL reserve an owner-only pending operation bound to schema, lab, attempt, daemon and a closed network or registry slot before executing that Docker creation. It SHALL persist the full ID returned by that creation before proceeding to another creation. Errors or missing/malformed responses SHALL preserve unresolved pending evidence and stop progression. It SHALL neither adopt resources by names/labels nor overwrite a reserved slot.

#### Scenario: Network creation succeeds before registry creation

- **WHEN** the real lab up caller creates its network and registry
- **THEN** the network command observes a durable pending record and registry creation observes its durable created network receipt

#### Scenario: Docker loses or corrupts its response

- **WHEN** creation errors or returns no single full Docker ID
- **THEN** the slot remains pending and the next creation does not execute

#### Scenario: Persistence fails

- **WHEN** reservation or completion file or directory synchronization fails
- **THEN** the error propagates and no subsequent creation executes

### Requirement: Trusted operation evidence is strict

Receipt consumption SHALL reject missing, unreadable, public, foreign-owner, symlink, nonregular, malformed or incorrectly bound operation evidence, including unknown schema fields. It SHALL require the phase-one journal binding as well.

#### Scenario: Invalid evidence reaches assessment

- **WHEN** either operation has invalid evidence or binding
- **THEN** assessment refuses before granting a successful assessment

### Requirement: Assessment is read-only and exact

Assessment SHALL require both created receipts, the same current daemon and exact returned inspected IDs and lab labels. Network endpoint IDs SHALL contain no foreign container, and registry network IDs SHALL reference only the receipted network. It SHALL confer no deletion or volume authority.

#### Scenario: Docker resolves an ID-shaped name to another object

- **WHEN** inspection returns a different ID than requested
- **THEN** assessment refuses regardless of names or labels

#### Scenario: Foreign endpoint or network appears

- **WHEN** either inspected object has a foreign attachment
- **THEN** assessment refuses

#### Scenario: An older attempt succeeded but a later operation is pending

- **WHEN** assessment targets the later attempt
- **THEN** the older receipt cannot resolve its pending operation

### Requirement: Destructive paths remain disabled

Phase-one receipt consumption SHALL always refuse deletion. Lab failure SHALL preserve k3d no-rollback and invoke no cleanup. Ordinary down SHALL retain its existing semantics and preserve receipt history.

#### Scenario: A fully receipted attempt requests deletion

- **WHEN** phase-one consume receives valid journals and direct receipts
- **THEN** it still refuses deletion
