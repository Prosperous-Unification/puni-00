## ADDED Requirements

### Requirement: A leaf's progress folds over its included nodes of every project step

A leaf's progress fold SHALL run over every step node the leaf has — one per project step —
that is not `skipped`, whether or not the node holds an estimate, actual, statement or
attempt. `done` SHALL require every included node to say `done`; any `in_progress`, a running
attempt, or a mix of `done` and silence SHALL read `in_progress`; every included node silent
SHALL read `unknown`. Skipped nodes SHALL be absent from the fold and SHALL read `skipped`.
The parent fold SHALL be unchanged. The change SHALL list in `verify.md` every leaf on the
dev store whose status moves at deploy.

#### Scenario: a silent QA keeps a leaf from done

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` is included, silent and holds no
  figure
- **WHEN** the plan is read
- **THEN** the leaf reads `in_progress`, and `done` once `QA` says `done` or is skipped

#### Scenario: the row menu's done still finishes a leaf

- **GIVEN** a leaf with three included nodes
- **WHEN** the row menu marks it `done`
- **THEN** every node says `done` and the leaf reads `done`

#### Scenario: a skipped node is not in the fold

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` is `skipped`
- **WHEN** the plan is read
- **THEN** the leaf reads `done` and `QA` reads `skipped`

#### Scenario: the moved readings are listed

- **GIVEN** a copy of the dev store before this change
- **WHEN** the fold runs before and after
- **THEN** every leaf whose status differs is listed in `verify.md` with both readings

### Requirement: A leaf keeps at least one included node

Skipping a leaf's last included node SHALL be refused `409 last_included_node` and nothing
SHALL be written; skipping a node holding a statement or an attempt SHALL remain refused as
stage 8 specifies.

#### Scenario: the last node cannot be skipped

- **GIVEN** a leaf whose `Dev` is skipped and whose `QA` is its only included node
- **WHEN** `QA` is skipped
- **THEN** it is refused `409 last_included_node` and `QA` stays included
