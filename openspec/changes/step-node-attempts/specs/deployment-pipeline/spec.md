## ADDED Requirements

### Requirement: The attempts migration is additive and its rollback refuses stored attempts

The migration SHALL create `step_node_attempt` with its checks and indexes and add
`project.timezone TEXT NOT NULL DEFAULT 'UTC'`, so an outgoing colour's project insert that
omits the column succeeds. Its `down.sql` SHALL refuse while any attempt row exists, naming
`step-node-attempt-rollback-cli.ts`'s `save`, `remove` and `restore` commands, then drop the
table and the column, the comment naming the timezone as lost. The stamp SHALL sort after
every migration on main and in the integration queue.

#### Scenario: rollback over an attempt is refused

- **GIVEN** a database with one attempt row
- **WHEN** `down.sql` runs
- **THEN** it fails naming the rollback CLI and the table remains

#### Scenario: save, remove and restore round-trip the attempts

- **GIVEN** three attempt rows on two nodes
- **WHEN** the CLI saves, removes, the migration rolls back and forward, and the CLI restores
- **THEN** the three rows are back verbatim, numbers included

### Requirement: The swap refuses code that cannot read a stored attempt outcome

The swap SHALL compare the stored `outcome` values against the outcomes the incoming image
prints, before migrating and again after stopping blue, in the stored-vocabularies step. An
image whose `attempt-outcomes-cli.ts` is absent SHALL read as supporting no outcome. A stored
outcome the image does not support SHALL abort the swap before any write, naming the value
and its count.

#### Scenario: an older image meets an ended attempt

- **GIVEN** a database with two `failed` attempts and an image without the outcomes CLI
- **WHEN** the swap runs
- **THEN** it aborts naming `failed (2)` and blue keeps serving

#### Scenario: an older image over no attempts passes

- **GIVEN** a database with no attempt rows and an image predating the CLI
- **WHEN** the swap runs
- **THEN** the outcome comparison passes
