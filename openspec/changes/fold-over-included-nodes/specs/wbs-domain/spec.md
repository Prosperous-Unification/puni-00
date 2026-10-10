## MODIFIED Requirements

### Requirement: A leaf's status folds its progress, hold, readiness and predecessors

Every leaf SHALL report one `status` of `unknown`, `draft`, `ready`, `in_progress`,
`blocked_by_proxy`, `on_hold`, `blocked` or `done`, folded on every read, first match winning:
its progress fold `done` → `done`; its hold → `on_hold` or `blocked`; its progress fold
`in_progress` → `in_progress`; a predecessor reading `on_hold`, `blocked` or
`blocked_by_proxy` → `blocked_by_proxy`; its readiness → `draft` or `ready`; else `unknown`.
The progress fold SHALL run over every step node the leaf has — one per project step — whose
participation is not `skipped`, whether or not the node holds an estimate, actual, statement or
attempt: `done` SHALL require every included node to say `done`; any `in_progress`, a running
attempt, or a mix of `done` and silence SHALL read `in_progress`; every included node silent
SHALL read `unknown`. Skipped nodes SHALL be absent from the fold and SHALL read `skipped`.
Progress SHALL stay per step node; readiness and hold SHALL be stored once per leaf and never
on a parent; `status` and `blocked_by_proxy` SHALL never be stored. A step node's own status
SHALL remain its reading. The parent fold SHALL be unchanged.

#### Scenario: a hold outranks a running step

- **GIVEN** a leaf whose `Dev` says `in_progress`, holding `hold: 'on_hold'`
- **WHEN** the plan is read
- **THEN** the leaf reports `on_hold`, and `in_progress` again once the hold is cleared

#### Scenario: done outranks a hold

- **GIVEN** a leaf done on every included step and holding `hold: 'blocked'`
- **WHEN** the plan is read
- **THEN** the leaf reports `done`

#### Scenario: readiness yields to anything the steps or the graph say

- **GIVEN** a leaf with `readiness: 'ready'`, no progress, and no held or blocked predecessor
- **WHEN** the plan is read
- **THEN** it reports `ready`; with a blocked predecessor it reports `blocked_by_proxy`; with
  `Dev` in progress it reports `in_progress`

#### Scenario: nothing said is unknown

- **GIVEN** a leaf with no progress, readiness or hold, and no predecessor reading `on_hold`,
  `blocked` or `blocked_by_proxy`
- **WHEN** the plan is read
- **THEN** it reports `unknown`

#### Scenario: a silent QA keeps a leaf from done

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` is included, silent and holds no
  figure
- **WHEN** the plan is read
- **THEN** the leaf reports `in_progress`, and `done` once `QA` says `done` or is skipped

#### Scenario: the row menu's done still finishes a leaf

- **GIVEN** a leaf with three included nodes
- **WHEN** the row menu marks it `done`
- **THEN** every node says `done` and the leaf reports `done`

#### Scenario: a skipped node is not in the fold

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` is `skipped`
- **WHEN** the plan is read
- **THEN** the leaf reports `done` and `QA` reads `skipped`

## ADDED Requirements

### Requirement: A leaf keeps at least one included node

Skipping a leaf's last included node SHALL be refused `409 last_included_node` and nothing
SHALL be written; skipping a node holding a statement or an attempt SHALL remain refused as
010.4.13.3 (`configure-project-step-workflows`) specifies.

#### Scenario: the last node cannot be skipped

- **GIVEN** a leaf whose `Dev` is skipped and whose `QA` is its only included node
- **WHEN** `QA` is skipped
- **THEN** it is refused `409 last_included_node` and `QA` stays included
