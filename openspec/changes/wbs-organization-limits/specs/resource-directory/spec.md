## MODIFIED Requirements

### Requirement: A project states how many units of a resource its plan may use

`setResourceCapacity { resource, units }` with non-null `units` SHALL additionally be refused
`capacity_limit { resourceId, cap, declared, asked }` when the sum of stated units of that
resource over the organization's other projects plus `units` exceeds the organization's
`maxCapacityUnitsPerResource` (`organization-limits`); null and any lowering SHALL be
applied as before. The plan import SHALL apply the same check to every capacity it writes
and refuse the whole import. Team capacities are unchanged and uncounted.

#### Scenario: A capacity over the organization's cap

- **WHEN** the organization's cap is 64, another project states 48 GB of `h2puni ram`, and
  this project sets 32 GB
- **THEN** the command is refused `capacity_limit` with `declared: 48, asked: 32, cap: 64`
  and the pair stays unstated

#### Scenario: Import of a plan whose capacities cross the cap

- **WHEN** a plan import would state 70 GB of `h2puni ram` under a cap of 64 with nothing
  else stated
- **THEN** the import is refused `capacity_limit` with `declared: 0, asked: 70` and writes
  nothing
