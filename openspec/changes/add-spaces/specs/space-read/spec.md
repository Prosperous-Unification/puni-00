## ADDED Requirements

### Requirement: The space list and the virtual All projects

`GET /api/spaces` SHALL answer `{ spaces: [{ id, name, projectCount, revision, createdById,
createdAt }] }` for the caller's organization, where `projectCount` counts only members the
caller can open. All projects SHALL NOT be listed; it is addressed as `all`, has no row, and
its rows SHALL be `GET /api/projects` in the caller's recency order. Every membership write to
`all` SHALL answer `409 virtual_space`.

#### Scenario: an organization with one space

- **GIVEN** organization A holds space `Q3` with two members
- **WHEN** a member of A lists spaces
- **THEN** the answer holds exactly `Q3` with `projectCount` 2

#### Scenario: adding to All projects

- **WHEN** a member posts a project to `/api/spaces/all/projects`
- **THEN** the answer is `409 virtual_space` and nothing is written

### Requirement: A space read lists rows before roll-ups

`GET /api/spaces/:id` SHALL answer `{ space, rows: [{ project, position }] }` in membership
order, each `project` carrying what `GET /api/projects` carries for it, in one read with no
roll-up. Envelopes SHALL be objects with named arrays so cursors can be added later.

#### Scenario: a space of three

- **GIVEN** space `s` holding `p1`, `p2`, `p3` in that order
- **WHEN** it is read
- **THEN** `rows` lists the three projects in that order and carries no roll-up

### Requirement: A project roll-up is one pure function over the project's tree

`rollUpProject(tree)` in `@wbs/domain` SHALL read the same tree, dates and statuses the project
page reads, with `roots` the rows with no parent:

- `dates`: the earliest start and latest end over dated roots in the displayed engine, or
  `null` when no root is dated or the schedule failed; held roots drop out.
- `finalTotal`: the sum of the roots' `finalTotal`; no per-step totals.
- `status`: `foldStatuses(roots)`; a project with no rows reads `unknown`.
- `counts`: leaves per status, `leaves` and `estimated`; carried: `scheduleError`,
  `waitingForPerson`, `waitingForCapacity`, `displayed`, `projectRevision`, `seq`.
- No cost field.

An unavailable scheduler engine SHALL make that row `{ kind: 'unavailable' }`, never a Fast
fallback.

#### Scenario: a project whose roots are all on hold

- **GIVEN** a project whose two roots are both on hold
- **WHEN** it is rolled up
- **THEN** `status` is `on_hold` and `dates` is `null`

#### Scenario: two roots

- **GIVEN** roots dated 2026-10-01..2026-10-05 and 2026-10-03..2026-10-20 with final totals 3
  and 8
- **WHEN** the project is rolled up
- **THEN** `dates` is 2026-10-01..2026-10-20 and `finalTotal` is 11

### Requirement: Roll-ups are read in chunks behind a sequence-keyed cache

`GET /api/spaces/:id/roll-ups?projectIds=…` SHALL accept at most 50 ids, each a member the
caller can open, and answer `{ rollUps: { [projectId]: rollUp } }`. A process cache SHALL key a
roll-up by project id, the project's event sequence, the scheduler contract version and the
roll-up version, and SHALL expire an entry after 60 seconds, so a roll-up is never staler than
60 seconds nor stale at all after a write this process published.

#### Scenario: a command then a read

- **GIVEN** a cached roll-up of `p1`
- **WHEN** a plan command changes `p1`'s total and the roll-up is read again
- **THEN** the new total is answered

#### Scenario: fifty-one ids

- **WHEN** 51 project ids are requested
- **THEN** the answer is `400` and nothing is computed

### Requirement: Space reads meet a stated budget

Over a synthetic corpus of 30 projects of 300 rows, a warm roll-up chunk of 20 SHALL answer
within 100 ms and a cold one within 1.5 s, in progress now over 30 warm projects within
200 ms, and `GET /api/spaces/:id` within 30 ms, each scaled by the CI factor the import
performance test uses.

#### Scenario: a warm chunk

- **GIVEN** the corpus with every roll-up cached
- **WHEN** a chunk of 20 is read
- **THEN** it answers within the scaled 100 ms

### Requirement: fe-01 renders spaces and refreshes by polling

fe-01 SHALL offer `/spaces` (All projects first, then the organization's spaces) and
`/spaces/:spaceId` (`all` allowed) with a projects table, in progress now and a read-only
Gantt of one bar per project over its `dates`, an undated project drawing a labelled blank.
Each row SHALL render `loading`, then its roll-up or `unavailable`. Loading, empty, query
failure and `organization_required` SHALL be rendered states. Viewers SHALL see no reorder or
remove handles. A project SHALL be deep-linked as `/?project=<id>`; an unknown id SHALL render
the empty state. fe-01 SHALL refetch on focus, after its own writes and every 60 seconds while
visible, and SHALL NOT subscribe to project sockets for a space.

#### Scenario: a viewer opens a space

- **GIVEN** a viewer of the space's organization
- **WHEN** `/spaces/:spaceId` renders
- **THEN** no reorder or remove handle is shown

#### Scenario: an unknown deep link

- **WHEN** `/?project=unknown` opens
- **THEN** the empty state renders and nothing throws
