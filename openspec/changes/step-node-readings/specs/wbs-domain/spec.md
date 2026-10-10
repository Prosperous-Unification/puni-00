## ADDED Requirements

### Requirement: A step node's reading is derived on every read

Every leaf's step node SHALL report one reading of `skipped`, `done`, `on_hold`, `blocked`,
`in_progress`, `blocked_by_proxy`, `waiting` or `unknown`, derived on every read and never
stored, first match winning: its participation `skipped` → `skipped`; its statement `done` →
`done`; its row's hold → `on_hold` or `blocked`; its statement `in_progress` or a running
attempt → `in_progress`; its row reading `blocked_by_proxy` → `blocked_by_proxy`; no
statement, no running attempt, at least one predecessor node in the step graph and every
predecessor reading `done` → `waiting`; else `unknown`. The stored statements SHALL stay
`in_progress | done`. `skipped` SHALL be in the reading type and SHALL NOT be produced until
participation is stored. The same function SHALL serve be-01's wire and fe-01's folds.

#### Scenario: QA waits on a finished Dev

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` has no statement and no attempt
- **WHEN** the plan is read
- **THEN** `Dev` reads `done` and `QA` reads `waiting`

#### Scenario: a first node is never waiting

- **GIVEN** a leaf whose `Dev` has no statement, no attempt and no predecessor node
- **WHEN** the plan is read
- **THEN** `Dev` reads `unknown`

#### Scenario: a running attempt reads in progress

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` has no statement and a running attempt
- **WHEN** the plan is read
- **THEN** `QA` reads `in_progress`, and `waiting` once the attempt ends `failed`

#### Scenario: the row's hold shows on its nodes

- **GIVEN** a leaf `on_hold` whose `Dev` says `in_progress`
- **WHEN** the plan is read
- **THEN** `Dev` reads `on_hold`, and `in_progress` once the hold is cleared

#### Scenario: skipped is not produced yet

- **GIVEN** any plan before participation is stored
- **WHEN** every node is read
- **THEN** no node reads `skipped`

### Requirement: A node with attempts holds work in the progress fold

The leaf progress fold SHALL count a step node holding any attempt as a step the leaf holds
work for, and SHALL read a running attempt on a node with no statement as `in_progress`. The
fold's step set SHALL otherwise be unchanged by this change.

#### Scenario: a running attempt starts the leaf

- **GIVEN** a leaf with no statements whose `Dev` has a running attempt
- **WHEN** the plan is read
- **THEN** the leaf reads `in_progress`

#### Scenario: an ended attempt keeps a silent node in the fold

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` holds one `failed` attempt and no
  statement
- **WHEN** the plan is read
- **THEN** the leaf reads `in_progress`, not `done`

### Requirement: The step cell shows the reading as a corner glyph with a card

Each leaf's step cell SHALL carry its node's reading as a glyph in its top-right corner with an
sr-only `Reading: <word>`: readings sharing a word with a row status SHALL reuse that status's
glyph and palette token; `waiting` SHALL be `◇` and `skipped` SHALL be `∅`. Every reading
SHALL have its own glyph, asserted by a component test. The cell card SHALL name the reading
in words, then the attempt count and last outcome (`3 attempts, last failed`), then the latest
attempt's executor and reference. The Status column SHALL keep the row fold.

#### Scenario: every reading has its own glyph

- **GIVEN** the eight readings
- **WHEN** their glyphs are collected
- **THEN** there are eight distinct glyphs

#### Scenario: the card says what happened

- **GIVEN** a `QA` node reading `waiting` after attempts `failed`, `failed`, `cancelled`
- **WHEN** its card opens
- **THEN** it reads `Waiting`, `3 attempts, last cancelled`, and the third attempt's executor
  and reference

#### Scenario: an unknown reading word is a rendered fault

- **GIVEN** a wire payload whose reading is `paused`
- **WHEN** the table renders
- **THEN** the plan's query-failure state renders, not a blank corner
