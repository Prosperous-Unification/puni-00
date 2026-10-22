## ADDED Requirements

### Requirement: Setting or resetting an organization's limits writes one audit row

`organization-limits-cli.ts` `set` and `reset` SHALL each write exactly one
`organization_audit` row in the same transaction as the write, with action
`organization_limits_changed`, subject kind `organization_limits`, subject id the
organization id and actor `operator:<os login>`. The detail SHALL carry `beforeSource`,
`afterSource` and, for each of the three caps, its before and after value, flat. An
unchanged `set` SHALL write no row. The migration that admits the action and subject kind
SHALL keep the table's columns and rows, keep every existing action writable by the
outgoing release, refuse an unknown action, and refuse rollback while a row of the new
action exists, whether it widens by compatible rebuild or by the trigger vocabulary of
issue #632.

#### Scenario: A set is audited with before and after

- **WHEN** the operator sets `--max-agent-persons 8` on an organization whose effective caps
  were the defaults 50, 200, 10,000
- **THEN** one `organization_limits_changed` row names `beforeSource: 'default'`,
  `afterSource: 'organization'`, `beforeMaxAgentPersons: 50`, `afterMaxAgentPersons: 8`,
  and equal before and after for the other two caps

#### Scenario: Unknown action still refused

- **WHEN** a writer inserts the action `organization_limits_teleported` after the widening
- **THEN** the store refuses it

#### Scenario: Rollback over a limits row refused

- **WHEN** an `organization_limits_changed` row exists and the widening's `down.sql` runs
- **THEN** it fails and the table and its rows are unchanged
