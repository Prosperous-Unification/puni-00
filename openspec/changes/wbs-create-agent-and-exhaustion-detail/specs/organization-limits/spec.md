## MODIFIED Requirements

### Requirement: Making one more agent person than the cap allows is refused

Every write that would make the organization hold more persons of kind `agent` than
`maxAgentPersons` SHALL be refused `agent_person_limit` carrying `cap`, `current` and
`added`, in the write's own transaction, with nothing written: `patchPerson` changing a
kind to `agent`, `createPerson` with `personKind: 'agent'` creating a new person, and the
plan import for the agents it would create (the whole import refused). `createPerson`'s
`personKind` SHALL default to `person`, and any value but `person` or `agent` SHALL be
refused `invalid_kind` with nothing written. A `createPerson` naming a person the
organization already holds SHALL keep that person's kind and add no agent.
Changing `agent` to `person`, renaming, re-teaming, binding or deleting SHALL never be
refused by this cap; deleting an agent frees a place for a later command of the same batch.
The count SHALL be read inside the transaction that writes.

#### Scenario: A cap of 0

- **WHEN** A's cap is 0 and an admin applies `patchPerson { kind: 'agent' }`
- **THEN** the batch is refused `agent_person_limit` with `cap: 0, current: 0, added: 1`

#### Scenario: Deleting first frees a place in the same batch

- **WHEN** A holds 8 agents of a cap of 8 and one batch deletes an agent and then promotes a
  person
- **THEN** the batch is applied and A holds 8 agents

#### Scenario: The ninth agent

- **WHEN** A's cap is 8, A holds 8 agents, and an admin applies `patchPerson { kind: 'agent' }`
  on a person of kind `person`
- **THEN** the batch is refused `agent_person_limit` with `cap: 8, current: 8, added: 1`
  and the person's kind is unchanged

#### Scenario: Demoting under the cap

- **WHEN** A holds 8 agents of a cap of 8 and an admin changes one to kind `person`
- **THEN** the change is applied, and the next `patchPerson { kind: 'agent' }` is applied too

#### Scenario: An import with three agents over the cap

- **WHEN** A holds 6 agents of a cap of 8 and a plan import would create 3 agent people
- **THEN** the import is refused `agent_person_limit` with `cap: 8, current: 6, added: 3`
  and no person, project or work item is written

#### Scenario: An agent created directly

- **WHEN** an admin of A applies `createPerson { name: 'Scout', personKind: 'agent' }` under
  the cap
- **THEN** the batch is applied and Scout is a person of kind `agent`

#### Scenario: The fifth agent created directly

- **WHEN** A's cap is 4, four agents were created by `createPerson { personKind: 'agent' }`,
  and a fifth is created the same way
- **THEN** the batch is refused `agent_person_limit` with `cap: 4, current: 4, added: 1` and
  no person is written

#### Scenario: A person by default

- **WHEN** A's cap is 0 and an admin applies `createPerson { name: 'Kat' }`
- **THEN** the batch is applied and Kat is a person of kind `person`

#### Scenario: A kind outside the set

- **WHEN** an admin applies `createPerson { name: 'Odd', personKind: 'robot' }`
- **THEN** the batch is refused `invalid_kind` and no person is written
