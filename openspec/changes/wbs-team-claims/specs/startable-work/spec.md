## ADDED Requirements

### Requirement: One read answers which steps a team may claim

be-01 SHALL offer a project-scoped read of **startable** work, filtered by an optional team,
derived from the same tree the project page reads and the same `statusOf`,
`blockedByProxyOf` and progress folds it uses. A step is startable when its leaf's status is
none of `blocked`, `on_hold`, `blocked_by_proxy`, `done`, its progress is not `done`, and no
claim holds it; startable **for a team** when the team is also in the leaf's effective team
set. With no team given, the read SHALL list every startable step. Rows SHALL be grouped by
leaf and carry the work item id, the frozen number or the derived number when none is
frozen, the name, the startable step ids, the assignee of each step when any, the stating
row of each team in force, the ids of unfinished predecessors, and the subtree claim in force
above the leaf when any, with its holder. The read SHALL also list, apart, the claimed steps
of the same leaves with holder person, run id, parent claim, the step's assignee when any,
and the instant of the claim write, and, apart again, every subtree claim in force in the
project with its work item, frozen number, holder, run id and write instant, so an operator
sees silent claims even where no step under them is startable. An unknown team, or one the organization does not hold, SHALL be refused `404 unknown_team`. The read SHALL be derived from the shared HTTP descriptor so the MCP server offers it as a tool.

#### Scenario: A team asks what it may start

- **WHEN** the project holds three unblocked leaves: one labelled `Platform` with two free
  steps, one labelled `Platform` with every step claimed, one unlabelled
- **THEN** the startable read for `Platform` lists the first leaf with its two steps, lists
  the second under claimed steps with holders, and omits the unlabelled leaf

#### Scenario: A blocked leaf is not startable whatever its readiness

- **WHEN** a leaf is stated `ready` and an unfinished predecessor makes it read
  `blocked_by_proxy`
- **THEN** the leaf is absent from the startable rows

#### Scenario: A subtree claim is visible but does not hide the steps

- **WHEN** `claire` holds a subtree claim on `080` and `080.25` has free steps
- **THEN** `080.25` is listed with its steps and the row names the subtree holder `claire`

#### Scenario: A silent subtree claim is listed

- **WHEN** `claire` holds a subtree claim on `080` and its only leaf `080.25` is held `blocked`
- **THEN** the read lists no startable step and lists the subtree claim on `080` with its
  holder and write instant

#### Scenario: A claimed step keeps its assignee in view

- **WHEN** `ada` is assigned `Impl` of a leaf and `codex-fleet` holds a claim on that step
- **THEN** the claimed-steps list names both `codex-fleet` as holder and `ada` as assignee

#### Scenario: Numbers are the frozen ones

- **WHEN** a startable leaf has frozen number `080.25`
- **THEN** its row answers `080.25` and its id, never a derived path such as `60.250`

#### Scenario: The read is a viewer's read

- **WHEN** a caller with role `viewer` in the project's organization asks
- **THEN** the read answers; a caller with no membership is refused as the tree read refuses
