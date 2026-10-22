## ADDED Requirements

### Requirement: Every activated organization has three caps, its own or the deployment default

WBS SHALL hold, per activated organization, `maxAgentPersons`, `maxConcurrentClaims` and
`maxCapacityUnitsPerResource`, each an integer from 0 to 1,000,000. An organization with
an `organization_limits` row SHALL use that row's three values; one without SHALL use the
deployment defaults read at boot from `ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS`,
`ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS` and
`ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE`. be-01 SHALL refuse to boot when any
of the three is absent, non-integer or outside the bound, naming the variable. A row SHALL
hold all three values or not exist. Under legacy access (no activated organization) no cap
SHALL exist and no limit refusal SHALL be answered.

#### Scenario: Default applies without a row

- **WHEN** organization A has no `organization_limits` row and the deployment defaults are
  agents 50, claims 200, capacity units 10,000
- **THEN** A's effective limits are 50, 200 and 10,000 and the read answers
  `source: 'default'`

#### Scenario: A row wins over the default

- **WHEN** an operator set A's row to agents 8, claims 40, capacity units 64
- **THEN** A's effective limits are 8, 40 and 64 whatever the defaults are, and the read
  answers `source: 'organization'`

#### Scenario: A deployment without defaults does not boot

- **WHEN** be-01 starts with `ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS` unset, or set to
  `-1`, `1000001` or `many`
- **THEN** boot fails naming that variable and no request is served

#### Scenario: The legacy store is uncapped

- **WHEN** the store is not activated and a batch claims the 201st bound claim
- **THEN** the claim is applied and no limit is read

### Requirement: An admin reads caps with usage beside each

`GET /api/organization/limits` SHALL answer, for a current `admin` or `super_admin` of the
active organization, `source`, `limits` (the three caps) and `usage`: `agentPersons` (the
organization's persons of kind `agent`), `concurrentClaims` (its bound claims: distinct
`(work item, person, run)` triples holding at least one claim row over its projects) and
`capacityUnits`, one entry `{ resourceId, name, unitLabel, units }` per resource of the
organization with at least one stated project capacity, `units` being the sum of stated
capacities over the organization's projects, in resource-id order. Limits and usage SHALL be
read in one transaction. A `member` or `viewer` SHALL be refused `403 forbidden`; a
delegation or a machine principal `403 insufficient_scope`; before activation
`403 no_active_organization`. Usage SHALL count rows of the active organization only.

#### Scenario: Seven of eight

- **WHEN** A holds 7 agent persons, 12 bound claims across two projects, and states 32 GB
  of `h2puni ram` in one project and 16 GB in another, and an admin of A reads the limits
- **THEN** the answer carries `usage.agentPersons: 7`, `usage.concurrentClaims: 12` and
  `capacityUnits: [{ h2puni ram, 48 }]` beside the caps

#### Scenario: A whole-leaf claim is one bound claim

- **WHEN** `claire` under run `r1` claims a leaf with four steps and nothing else is claimed
- **THEN** `usage.concurrentClaims` is 1, and after `codex` claims one step of another leaf
  it is 2

#### Scenario: A member cannot read

- **WHEN** a caller with role `member` reads the limits
- **THEN** WBS answers `403 forbidden` and reads no usage

#### Scenario: Another organization's rows are not counted

- **WHEN** B holds 30 agent persons and A holds 2, and an admin of A reads
- **THEN** `usage.agentPersons` is 2

### Requirement: Making one more agent person than the cap allows is refused

Every write that would make the organization hold more persons of kind `agent` than
`maxAgentPersons` SHALL be refused `agent_person_limit` carrying `cap`, `current` and
`added`, in the write's own transaction, with nothing written: `patchPerson` changing a
kind to `agent`, the directory add with kind `agent`, and the plan import for the agents it
would create (the whole import refused). `createPerson` carries no kind, so the directory
add with kind `agent` is reachable only through the plan import until it gains one.
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

### Requirement: Holding one more bound claim than the cap allows is refused

`claimWorkItem` SHALL be refused `claim_limit` carrying `cap` and `current` when the batch
would add a bound claim (a `(work item, person, run)` triple the organization's projects do
not yet hold) and the organization already holds `maxConcurrentClaims` of them. The check
SHALL be the last of the claim's refusal order, inside the batch's `BEGIN IMMEDIATE`
transaction under the write coordinator, so of two concurrent claims the loser counts the
winner. A repeated claim answering `alreadyHeld`, a release, and a claim moving with its leaf
on a split or a promotion SHALL never be refused by this cap. A redo of a claim and an undo
of a release SHALL re-check it and, refused, answer `stale_undo` whose detail begins
`claim_limit:`. Two claims of one batch SHALL count each other.

#### Scenario: The forty-first claim

- **WHEN** A's cap is 40, its projects hold 40 bound claims, and a batch claims an unheld
  leaf for `claire` under run `r9`
- **THEN** the batch is refused `claim_limit` with `cap: 40, current: 40` and nothing is
  written

#### Scenario: Two fleets race for the last slot

- **WHEN** A holds 39 of 40 and two batches from two accounts each claim a different unheld
  leaf, concurrently
- **THEN** exactly one is applied and the other is refused `claim_limit` with
  `current: 40`, whichever order the write coordinator admits them in

#### Scenario: The plan's reasons come first

- **WHEN** A holds 40 of 40 and a batch claims a step another person holds
- **THEN** the batch is refused `already_claimed`, not `claim_limit`

#### Scenario: Release frees a slot

- **WHEN** A holds 40 of 40, `codex` releases its leaf, and `claire` claims an unheld leaf
- **THEN** `claire`'s claim is applied and `usage.concurrentClaims` is 40 again

#### Scenario: Undo of a release at the cap

- **WHEN** `codex` released a leaf, another agent then took the freed slot of 40, and the
  release is undone
- **THEN** the undo is refused `stale_undo` with detail `claim_limit: cap 40, current 40.`
  and the leaf stays released

#### Scenario: A second step of a held leaf adds no bound claim

- **WHEN** A holds 40 of 40, one of them `claire` under `r1` on `Impl` of leaf `080.25`,
  and the same `claire` under `r1` claims `Review` of `080.25`
- **THEN** the claim is applied and `usage.concurrentClaims` stays 40

### Requirement: Stating more capacity units of a resource than the cap allows is refused

`setResourceCapacity { resource, units }` with non-null `units` SHALL be refused
`capacity_limit` carrying `resourceId`, `cap`, `declared` (the sum of stated units of that
resource over the organization's other projects) and `asked` when `declared + units` exceeds
`maxCapacityUnitsPerResource`, with nothing written. Clearing (`null`) or lowering SHALL
never be refused. The plan import SHALL check every capacity it would write the same way,
excluding the project it imports into from `declared`, and refuse the whole import. Team
capacities (`setCapacity`) SHALL NOT be counted or capped.

#### Scenario: Two projects share 64 units

- **WHEN** A's cap is 64, project P states 48 GB of `h2puni ram`, and project Q sets 32 GB
- **THEN** Q's batch is refused `capacity_limit` with
  `{ h2puni ram, cap: 64, declared: 48, asked: 32 }` and Q states nothing; setting 16 GB is
  applied

#### Scenario: Lowering is never refused

- **WHEN** A's cap was lowered to 32 while P states 48 GB
- **THEN** P setting 40 GB is applied, P setting 48 GB again is applied, and P setting 49 GB
  is refused `capacity_limit` with `declared: 0, asked: 49`

#### Scenario: Another resource is another sum

- **WHEN** A's cap is 64, P states 64 GB of `h2puni ram` and Q sets 10 `worktrees`
- **THEN** Q's batch is applied: the cap is per resource

### Requirement: Lowering a cap below usage strands nothing and refuses only new acquisitions

Setting a cap below the organization's current count SHALL be accepted. Everything held
SHALL stay held; the read SHALL answer the count above the cap as it is; the next write of
that kind SHALL be refused with those numbers; releases, kind changes and clearing SHALL
bring the count back under without any other act.

#### Scenario: Forty claims, cap lowered to ten

- **WHEN** A holds 40 bound claims and an operator sets `maxConcurrentClaims` to 10
- **THEN** the 40 claims stand, the read answers `concurrentClaims: 40` with cap 10, the
  next new claim is refused `claim_limit` with `cap: 10, current: 40`, and after 31 releases
  a new claim is applied

### Requirement: An operator sets an organization's caps by CLI, audited

`organization-limits-cli.ts` SHALL offer `show`, `set` and `reset` for one organization by
id. `set` SHALL write a complete row, taking the deployment default for each cap not given
when no row exists and the row's value when one does, and SHALL refuse an unknown
organization, a value outside 0 to 1,000,000 and a call naming no cap. `reset` SHALL delete
the row and refuse when none exists. `set` and `reset` SHALL each write one
`organization_limits_changed` audit row in the same transaction (`organization-audit`); an
unchanged `set` SHALL write no row and say so. Every command SHALL print the effective caps
with usage beside each and SHALL warn, without refusing, when a cap lands below usage. No
HTTP route SHALL change limits.

#### Scenario: Set one cap on an organization without a row

- **WHEN** the defaults are 50, 200, 10,000 and the operator runs
  `set --organization A --max-concurrent-claims 40`
- **THEN** A's row holds 50, 40, 10,000, one audit row names before `default` 50, 200,
  10,000 and after `organization` 50, 40, 10,000, and the output shows usage beside each cap

#### Scenario: Reset returns to the default

- **WHEN** the operator runs `reset --organization A` on an organization with a row
- **THEN** the row is gone, the read answers `source: 'default'`, and one audit row names
  before `organization` and after `default`

#### Scenario: Audit cannot be written

- **WHEN** the audit write fails during `set`
- **THEN** the row is unchanged and the command exits non-zero naming the failure

#### Scenario: A cap below usage warns and lands

- **WHEN** A holds 12 agents and the operator sets `--max-agent-persons 8`
- **THEN** the row holds 8, the output warns that 12 exceed 8, and the exit code is 0
