## ADDED Requirements

### Requirement: An admin registers a provider instance for the organization

`POST /api/organization/compute-providers` SHALL be accepted, after activation, from an
`admin` or `super_admin` of the active organization, with a body naming a `kind` of
`ssh_host`, `docker`, `kubernetes` or `puni_pool`, a `name` (1 to 80 characters, unique among
the organization's instances, `409 name_taken` otherwise) and a `locator` (1 to 256
characters of display text WBS never dials). A `member` or `viewer` SHALL be refused
`403 forbidden`; a delegation or a machine principal SHALL be refused `403 insufficient_scope`
on every `/api/organization/compute-providers` route; before activation every such route
SHALL answer `403 no_active_organization`; any other `kind` SHALL be refused
`400 invalid_body`. The instance SHALL be written in one transaction with one
`compute_provider_registered` audit row. `GET` SHALL list the organization's instances with
the count of resources each fulfils; `PATCH /:id` SHALL rename or relocate one with a
`compute_provider_updated` row; `DELETE /:id` SHALL remove one that no resource references, or
with `cascade: true` clear every reference and delete its reports in the same transaction,
with a `compute_provider_removed` row; without cascade a referenced instance SHALL be refused
`409 in_use` naming the referencing resources. An instance of another organization SHALL be
`404 unknown_provider` on `PATCH` and `DELETE`.

#### Scenario: PUNI registers its two gate hosts

- **WHEN** an admin of PUNI posts `{ kind: 'ssh_host', name: 'h4claw', locator: 'puni1@h4claw' }`
  and then `{ kind: 'ssh_host', name: 'h2puni', locator: 'puni1@h2puni' }`
- **THEN** both are listed with `resources: 0`, each with one `compute_provider_registered`
  audit row naming kind, name and locator, and a third post named `h4claw` is refused
  `409 name_taken`

#### Scenario: A member registers

- **WHEN** a caller with role `member` posts a valid body
- **THEN** WBS answers `403 forbidden` and writes no instance and no audit row

#### Scenario: A machine key administers

- **WHEN** a request with a live `wbs_mk_` key lists or posts compute providers
- **THEN** WBS answers `403 insufficient_scope` and writes nothing

#### Scenario: Removing a fulfilling instance

- **WHEN** `h4claw` fulfils `h4claw ram` and `h4claw agent slots` and `DELETE` arrives without
  cascade
- **THEN** WBS answers `409 in_use` naming both resources; with `cascade: true` both resources
  read `providerId: null`, their reports are gone, the instance is gone, and one
  `compute_provider_removed` row names the two cleared resources

### Requirement: A capacity report is accepted only from an agent machine principal of the instance's organization

`PUT /api/compute-providers/:providerId/resources/:resourceId/capacity-report` SHALL be
accepted only from a principal whose `authentication.kind` is `machine` and whose pinned
person is of kind `agent`: a browser session, a delegation or a machine credential pinned to a
person of kind `person` SHALL be refused `403 not_an_agent_principal` naming which. An
instance that is not owned by the credential's organization, or absent, SHALL be
`404 unknown_provider`; a resource the organization does not hold SHALL be `404 not_found`; a
resource whose `providerId` is not `:providerId` SHALL be `409 provider_mismatch` carrying
the resource's current `providerId` or null. No audit row SHALL be written for a report.

#### Scenario: Another tenant's Dash reports

- **WHEN** a machine key of organization B, pinned to agent `dash-b`, puts a report for an
  instance registered by organization A
- **THEN** WBS answers `404 unknown_provider`, stores nothing, and A's instance is not named in
  the answer

#### Scenario: A human's key reports

- **WHEN** a machine credential pinned to a person of kind `person` puts a valid report
- **THEN** WBS answers `403 not_an_agent_principal` with `personKind: 'person'` and stores
  nothing

#### Scenario: A browser session reports

- **WHEN** a signed-in admin's browser session puts a valid report
- **THEN** WBS answers `403 not_an_agent_principal` with `authentication: 'session'`

#### Scenario: The resource names another instance

- **WHEN** `h4claw ram` references instance `h4claw` and `h2puni`'s reporter puts a report for
  it
- **THEN** WBS answers `409 provider_mismatch` with `providerId: <h4claw>` and stores nothing

### Requirement: A capacity report is idempotent, latest wins, and never a planning input

The body SHALL carry `observedAt` (an instant not more than 5 minutes ahead of WBS's clock,
else `400 observedAt_in_future` naming the skew), `cadenceSeconds` (30 to 86,400) and an
`outcome` that is `{ kind: 'measured', capacityUnits, usageUnits }` with whole numbers from 0
to 1,000,000,000 in the resource's unit label, or `{ kind: 'unreachable', reason }` with a
reason of 1 to 200 characters; anything else SHALL be `400 invalid_body`. WBS SHALL keep one
report per resource: a body whose `observedAt` is newer than the stored one replaces it and
answers `200` with the stored report (instance, outcome, `observedAt`, `cadenceSeconds`,
`reportedBy` person, `reportedAt`); the same body again from the same reporter answers `200`
and changes nothing; an `observedAt` older than the stored one SHALL be refused
`409 report_superseded` carrying the stored `observedAt`, and so SHALL a report at the stored
`observedAt` that differs from it in any field, including one from a different reporting person
with an otherwise identical body: the first report of an instant stands. The canonical schedule input and its hash, `decideClaim`,
`refuseOccupancy`, the startable read, the plan export and the plan document SHALL NOT read or
carry a report or a `providerId`.

#### Scenario: h4claw reports 15 GB with 8 in use

- **WHEN** `h4claw`'s reporter puts `{ observedAt: T, cadenceSeconds: 300, outcome: { kind:
'measured', capacityUnits: 15, usageUnits: 8 } }` for `h4claw ram`, then the same body again
- **THEN** both answers are `200` with the same stored report, `reportedBy` is the agent
  person, and the project resources read shows the report beside the stated capacity

#### Scenario: A late report after a newer one

- **WHEN** a report observed at T + 300 s is stored and a report observed at T arrives
- **THEN** WBS answers `409 report_superseded` with `storedObservedAt: T + 300 s` and the
  stored report is unchanged

#### Scenario: The host is unreachable

- **WHEN** the reporter puts `{ kind: 'unreachable', reason: 'ssh: connect to host h4claw port
22: Connection timed out' }` observed at T + 600 s
- **THEN** the stored report is the unreachable one and the UI renders it as unreachable with
  the reason, not as a capacity of 0

#### Scenario: Reports change no schedule and no claim

- **WHEN** a project states 15 GB of `h4claw ram`, the stored report says 8 GB capacity, and a
  leaf demanding 12 GB is scheduled and claimed
- **THEN** the schedule hash equals the hash before any report existed, the claim is accepted,
  and the startable read lists 15 GB stated

### Requirement: Declared capacity is shown with the measured figure and adopted only by an explicit command

`GET /api/projects/:id/resources` SHALL carry, per resource, `providerId`; a resource that
names an instance SHALL also carry, when a report exists, `report` as stored, and always
`measurement { declared, measured, measuredAt, state }`: this project's stated units or null,
the latest measured capacity or null, the latest report's `observedAt` or null, and `state`
one of `no_report`, `measured`, `unreachable` or `stale` (`stale` once
`now - observedAt > 3 × cadenceSeconds`, whatever the outcome). The project settings resources section and the directory page
SHALL show, beside a capacity whose resource names an instance, the report in one of the
rendered states: `no report yet`, `measured <capacity> <unit>, <usage> in use, <age>`,
`unreachable <age>: <reason>`, each marked `stale` once `now - observedAt > 3 ×
cadenceSeconds`; a resource without an instance SHALL show nothing extra. An organization
admin SHALL see the instance's kind and name; a member or a viewer SHALL see that a compute
provider fulfils the resource, unnamed, because the resources read carries only `providerId`
and the instances list is admin-only. "Adopt measured" SHALL write `setResourceCapacity {
resource, units: capacityUnits }` for that project, the explicit command a project writer
could always send for declared capacity; the UI SHALL offer Adopt to organization admins only.
`setResourceCapacity` is not journalled, so the plan's undo does not reverse it: the UI's Undo
SHALL be a compensating `setResourceCapacity` with the previous value (or `null` when it was
unstated), offered only while the declared value still equals the adopted one. Nothing SHALL
adopt a measurement without that act.

#### Scenario: The chip beside the capacity

- **WHEN** `h4claw ram` is stated at 32 GB for project P and the stored report is measured 15
  with 8 in use, observed 4 minutes ago at a cadence of 300 s
- **THEN** the row reads `32 GB` with `ssh_host h4claw · measured 15 GB, 8 in use, 4 min ago`
  and no stale mark; at 16 minutes it is marked stale

#### Scenario: Adopting the measurement

- **WHEN** an admin clicks adopt on that row
- **THEN** one `setResourceCapacity { resource: <h4claw ram>, units: 15 }` is applied, the
  schedule recomputes from 15, and the row offers Undo, which sends
  `setResourceCapacity { resource: <h4claw ram>, units: 32 }` and restores 32

#### Scenario: Undo is withdrawn once another writer states a different number

- **WHEN** after the adoption another writer states `h4claw ram` at 20 GB for P and the
  section reads again
- **THEN** the row reads `20 GB` and offers no Undo, so 32 is never written over 20

#### Scenario: A resource without an instance

- **WHEN** `staging` has no `providerId`
- **THEN** its row shows the capacity alone, and the resources read carries `providerId: null`
  and no `report`

### Requirement: Twilight Dash measures and runs through one provider port

Twilight Dash SHALL hold a `ComputeProvider` port with `kind`, `instanceId`, `capabilities
{ measures, runs }`, `observe(binding, now)` and `run(request, now)`, and adapters `ssh_host`
and `docker`, a `kubernetes` stub whose every method answers `not_implemented`, and no adapter
for `puni_pool`. Loading a reporter configuration SHALL refuse a binding whose measure the
adapter lacks (`unsupported_measure`), an instance of kind `puni_pool`
(`provider_kind_not_available`) or of a stub kind (`provider_not_implemented`), a credential
file that is not owner-only (`credential_not_owner_only`), and a missing or malformed file
(`config_absent`, `config_malformed`), each before any network call. `observe` SHALL answer
`unreachable` with the typed transport cause for connection refused, timeout, host-key
mismatch and authentication failure, and SHALL throw for an answer it cannot parse from a
reachable host. Every instant SHALL come from the injected clock.

#### Scenario: The SSH adapter measures memory

- **WHEN** `observe({ resourceId, measure: 'memory_gib' })` runs through a local SSH fixture (a fixture `ssh`
  client in the gate; a real sshd in the slice 2 rehearsal) whose `/proc/meminfo` says `MemTotal: 15976448 kB` and `MemAvailable: 7340032 kB`
- **THEN** the measurement is `measured` with `capacityUnits: 15` and `usageUnits: 8`, and its
  evidence names the transport and the two lines

#### Scenario: The host does not answer

- **WHEN** the fixture's port is closed
- **THEN** the measurement is `unreachable` with the `ssh` cause and no exception escapes

#### Scenario: The host answers nonsense

- **WHEN** the fixture returns `/proc/meminfo` without a `MemTotal` line
- **THEN** `observe` throws naming the missing line, and the reporter exits with that error

#### Scenario: A pool instance is configured

- **WHEN** a configuration names an instance of kind `puni_pool`
- **THEN** loading refuses `provider_kind_not_available` naming the instance and nothing is
  dialled

### Requirement: The reporter reports on a cadence and exits on refusal

`twilight-dash report-capacity --config <file>` SHALL, per instance, observe every binding
and `PUT` one report per binding every `cadenceSeconds` (default 300, minimum 30) and after
each `run` starts or ends, carrying `cadenceSeconds` in each body. A `200` SHALL be recorded;
three consecutive `409 report_superseded` on one binding SHALL end the loop with
`another_reporter` naming the binding; `401`, `403`, `404` and `409 provider_mismatch` SHALL
end the loop at once with the refusal; a `5xx` or a transport fault to WBS SHALL be retried
once after `cadenceSeconds` and then end the loop. The loop SHALL never print the credential.

#### Scenario: Two reporters on one host

- **WHEN** a second reporter for `h4claw` starts with a clock 2 s behind the first
- **THEN** its third `409 report_superseded` ends it with `another_reporter: h4claw ram`, and
  the first keeps reporting

#### Scenario: The credential is revoked

- **WHEN** WBS answers `401 unknown_identity`
- **THEN** the loop exits with that refusal on the next tick and sends nothing further
