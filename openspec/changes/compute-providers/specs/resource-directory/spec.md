## ADDED Requirements

### Requirement: A resource may name the provider instance that fulfils it

A resource SHALL carry an optional `providerId` naming one provider instance
(`compute-provider`) of the resource's organization, null by default and set or cleared by
`patchResource { patch: { providerId } }` under the directory scope. An id naming no instance
of the caller's organization SHALL be refused `404 unknown_provider`; an id naming an instance
of another organization SHALL be refused `409 provider_not_in_organization`. The resource
read, the project resources read and the directory usage SHALL carry `providerId`; the plan
export and the plan document SHALL NOT. The reference SHALL NOT be read by the schedule input,
the claim decision, the occupancy check or the startable read, and a resource without one
SHALL behave byte for byte as before this change. The migration adding the column SHALL be
additive with a `down.sql` refusing while any resource references an instance.

#### Scenario: h4claw ram is fulfilled by h4claw

- **WHEN** `patchResource { resource: <h4claw ram>, patch: { providerId: <h4claw> } }` is
  applied
- **THEN** the resource reads `providerId: <h4claw>`, the instance lists `resources: 1`, the
  project's schedule hash is unchanged, and `patch: { providerId: null }` clears it

#### Scenario: A stranger's instance

- **WHEN** an admin of A patches a resource with an instance id registered by B
- **THEN** the command is refused `409 provider_not_in_organization` and the resource is
  unchanged

#### Scenario: Export does not carry the instance

- **WHEN** a plan whose resources reference instances is exported and imported elsewhere
- **THEN** every imported resource reads `providerId: null` and the export bytes hold no
  instance id

#### Scenario: Rollback over references

- **WHEN** `migrate-down-cli.ts` reverses `add_resource_provider` while one resource references
  an instance
- **THEN** the rollback refuses, names the count and the clearing command, and the column stays
