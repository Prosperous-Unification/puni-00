## ADDED Requirements

### Requirement: One read answers which leaves a team may start

be-01 SHALL offer a project-scoped read of **startable** leaves, filtered by an optional
team, derived from the same tree the project page reads and the same `statusOf` and
`blockedByProxyOf` folds it uses. A leaf is startable for a team when its status reads
`ready`, no step of it has an assignee, and the team is in its effective team set. With no
team given, the read SHALL list every unclaimed `ready` leaf. Each row SHALL carry the work
item id, the frozen number or the derived number when none is frozen, the name, the stating
row of each team in force, and the ids of its predecessors. The read SHALL also list, apart,
the leaves whose status reads `ready` or `in_progress` and that are claimed, with holder and
the instant of the last assignment write, so an operator sees silent claims. The read SHALL
be derived from the shared HTTP descriptor so the MCP server offers it as a tool.

#### Scenario: A team asks what it may start

- **WHEN** the project holds three leaves of status `ready`: one labelled `Platform` and
  unclaimed, one labelled `Platform` and claimed, one unlabelled
- **THEN** the startable read for `Platform` lists the unclaimed labelled leaf only, and
  lists the claimed one under claimed leaves with its holder

#### Scenario: Readiness alone is not enough

- **WHEN** a leaf is stated `ready` and an unfinished predecessor makes it read
  `blocked_by_proxy`
- **THEN** the leaf is absent from the startable read

#### Scenario: Numbers are the frozen ones

- **WHEN** a startable leaf has frozen number `080.25`
- **THEN** its row answers `080.25` and its id, never a derived path such as `60.250`

#### Scenario: The read is a viewer's read

- **WHEN** a caller with role `viewer` in the project's organization asks
- **THEN** the read answers; a caller with no membership is refused as the tree read refuses
