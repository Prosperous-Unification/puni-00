## ADDED Requirements

### Requirement: The list query grammar is closed and refuses what it cannot read

The paged reads (`GET /api/projects` with any paging parameter, and
`GET /api/projects/:id/work-item-rows`) SHALL read these parameters, and each SHALL answer
`400 { error: 'invalid_query' }` for a value outside its grammar, before any store read:

- `limit`: decimal digits, a whole number from 1 to 200; absent means 25.
- `cursor`: 1 to 512 characters of `[A-Za-z0-9_-]`, the base64url spelling of a JSON object
  whose `v` is 1 and whose keys and value types are exactly the ones that endpoint issues.
  A cursor that does not decode to that shape (not base64url, not JSON, another `v`, a
  missing or extra key, a value of the wrong type) SHALL answer 400. Clients SHALL treat a
  cursor as opaque; only a `nextCursor` the same endpoint answered is valid.
- `q`: after trimming white space, 1 to 200 characters; it matches a name that contains it,
  compared after `toLowerCase()` on both. Names only; notes are never searched.
- `updatedSince`: decimal digits, an instant in epoch milliseconds; it matches an
  **update instant** greater than or equal to it and never matches a `null` one.

An undeclared parameter and a parameter given twice SHALL answer 400 as well.

#### Scenario: a limit above the cap

- **WHEN** a paged read is sent `limit=201`
- **THEN** the answer is `400 { error: 'invalid_query' }` and nothing is read

#### Scenario: a limit of zero and a limit that is not a number

- **WHEN** a paged read is sent `limit=0`, and separately `limit=ten`
- **THEN** both answer `400 { error: 'invalid_query' }`

#### Scenario: a malformed cursor

- **WHEN** a paged read is sent a cursor that is not base64url, one that decodes to text
  that is not JSON, one with `v` 2, one with an extra key, and one whose key holds a value
  of the wrong type
- **THEN** each answers `400 { error: 'invalid_query' }`

#### Scenario: an empty search

- **WHEN** a paged read is sent `q=%20%20`
- **THEN** the answer is `400 { error: 'invalid_query' }`

#### Scenario: a repeated parameter

- **WHEN** a paged read is sent `limit=5&limit=6`
- **THEN** the answer is `400 { error: 'invalid_query' }`

### Requirement: Paging happens after access filtering

Every paged read SHALL filter to the rows the caller may read before it orders, filters,
cuts or issues a cursor. A page's size, `nextCursor` and its presence SHALL be the same as
if the rows the caller cannot read did not exist. A cursor issued to one caller SHALL
reveal nothing about another organization's rows when replayed by it.

#### Scenario: a foreign organization's projects do not shorten a page

- **GIVEN** organization A with 3 projects and organization B with 30 newer projects
- **WHEN** a member of A reads `GET /api/projects?limit=2` and follows `nextCursor`
- **THEN** the pages hold 2 and then 1 of A's projects and the second `nextCursor` is `null`

### Requirement: The project list pages newest update first

`GET /api/projects` without `q`, `updatedSince`, `limit` or `cursor` SHALL answer every
readable project in today's order (opened by this account most recently first, then never
opened newest created first) with `nextCursor: null`. With any of them it SHALL answer a
page `{ projects, nextCursor }` ordered by update instant descending, `null` instants
last, then by project id descending. Every entry in both modes SHALL carry `updatedAt`.

A project's **update instant** SHALL be the greatest of its own `updated_at`, the
`updated_at` of its work items, and the `created_at` of its plan events, ignoring `NULL`s,
and `null` when all are `NULL`. Calendar marker edits do not move it.

The cursor SHALL carry the sort key `[updatedAt, id]` of the last entry answered, and the
next page SHALL be the entries whose key sorts strictly after it. `q` and `updatedSince`
are filters and SHALL NOT change the key. A walk is not a snapshot; between two reads:

- a project already answered that is updated moves ahead of the cursor and SHALL NOT be
  answered again;
- a project not yet answered that is updated also moves ahead of the cursor, and is
  missed for the rest of that walk;
- a project's instant can go down: when its newest term was a plan event the retention
  sweep has since pruned (`PLAN_EVENT_RETENTION_DAYS`), it falls back to an older term,
  and a project already answered can then sort after the cursor and be answered again.

A caller that needs every project exactly once restarts the walk, or reads the
parameterless list.

`nextCursor` SHALL be `null` exactly when no readable entry sorts after the last one
answered under the same filters.

#### Scenario: the parameterless list is unchanged

- **WHEN** `GET /api/projects` is read with no query string
- **THEN** the projects and their order are today's, each entry adds `updatedAt`, and
  `nextCursor` is `null`

#### Scenario: an edited work item moves its project first

- **GIVEN** projects P and Q, Q updated after P
- **WHEN** a work item of P is renamed and `GET /api/projects?limit=1` is read
- **THEN** the page holds P

#### Scenario: a tie is broken by id and a null instant sorts last

- **GIVEN** projects `a` and `b` with the same update instant and project `c` with none
- **WHEN** `GET /api/projects?limit=1` is walked to its end
- **THEN** the pages hold `b`, `a`, `c` in that order and the last `nextCursor` is `null`

#### Scenario: updatedSince is inclusive and never matches null

- **GIVEN** a project updated at 1000, one at 999, and one with no update instant
- **WHEN** `GET /api/projects?updatedSince=1000` is read
- **THEN** only the project updated at 1000 is answered

#### Scenario: a project not yet answered is edited mid-walk

- **GIVEN** projects updated at 3, 2 and 1, and a walk with `limit=1` that has answered the
  first
- **WHEN** the project updated at 1 is edited before the next read
- **THEN** the walk answers the project updated at 2 and ends, never answering the edited one

#### Scenario: search by name

- **GIVEN** projects named `Roof Repair`, `Garden` and `roofline`
- **WHEN** `GET /api/projects?q=ROOF` is read
- **THEN** `Roof Repair` and `roofline` are answered

### Requirement: Work-item rows page in tree order with filters and field groups

`GET /api/projects/:id/work-item-rows` SHALL answer `{ rows, nextCursor, projectRevision }`
for a project the caller can read, and `404 { error: 'not_found' }` alike for an absent
and a foreign project. Rows SHALL be in **tree order** over the whole project, computed
before any filter, and their derived fields (number, status, dates, schedule) SHALL be the
ones the whole-tree read answers at the same `projectRevision`.

Filters, all combined with AND:

- `q` and `updatedSince` as in the grammar, against the work item's name and its own
  `updated_at`.
- `status`: a comma-separated list of work-item status names; a row matches when its
  derived status is one of them. An unknown name SHALL answer 400.
- `parentId`: only rows below that work item, never the work item itself. A `parentId`
  that names no work item of the project SHALL answer `404 { error: 'unknown_parent' }`.
- `depth`: decimal digits, 1 to 64; rows at most that many levels below `parentId`, or
  below the top when `parentId` is absent (a top-level work item is depth 1). Absent means
  unbounded; 0 or above 64 SHALL answer 400.

Every row SHALL carry the **outline**: `id`, `projectId`, `parentId`, `number`, `name`,
`status`, `dates`, `revision`, `updatedAt`. `fields`, a comma-separated list of **field
group** names, SHALL add exactly those groups:

- `notes`: `notes`.
- `schedule`: `schedule`, `finalDays`, `finalTotal`, `dependsOn`.
- `slices`: `slices`, this work item's slices.
- `estimates`: `estimates`, `actuals`, `measures`, `progress`, `rolledUp`.
- `constraints`: `position`, `frozenNumber`, `startNoEarlierThan`,
  `startNoEarlierThanReason`, `deadline`, `factStart`, `factEnd`, `readiness`, `hold`,
  `priority`, `maxParallel`, `doesEveryStep`.
- `labels`: `teamIds`, `tagIds`, `serviceIds`, `typeIds`, `externalRefs`, `serviceTeamId`,
  `serviceId`, `assignees`.

Every field of a whole-tree work item SHALL belong to the outline or to exactly one group.
An unknown group name SHALL answer 400.

The cursor SHALL carry the id of the last row answered; the next page SHALL be the rows
after it in the current tree order that pass the filters. A cursor whose work item is no
longer in the project SHALL answer `409 { error: 'stale_cursor' }`. With no write between
reads, the pages of a walk SHALL answer every matching row exactly once; under concurrent
writes a moved row may be missed or repeated, and a caller that needs one snapshot
restarts when `projectRevision` changes.

#### Scenario: the outline by default

- **WHEN** `GET /api/projects/:id/work-item-rows` is read with no query string
- **THEN** the first 25 work items in tree order are answered with the outline fields only

#### Scenario: a walk partitions the tree once across a re-derived read

- **GIVEN** a project of 7 work items across three levels
- **WHEN** it is walked with `limit=3`, the tree re-derived between reads with no write
- **THEN** the rows of the pages, joined, are the whole-tree read's work items in order,
  each once, with the same numbers and dates

#### Scenario: a status filter with an unknown name

- **WHEN** it is read with `status=in_progress,finished`
- **THEN** the answer is `400 { error: 'invalid_query' }`

#### Scenario: a subtree to one level

- **GIVEN** a work item `010` with children `010.1`, `010.2` and grandchild `010.1.1`
- **WHEN** it is read with `parentId` of `010` and `depth=1`
- **THEN** `010.1` and `010.2` are answered, not `010` and not `010.1.1`

#### Scenario: an unknown parent

- **WHEN** it is read with a `parentId` naming no work item of the project
- **THEN** the answer is `404 { error: 'unknown_parent' }`

#### Scenario: a depth out of range

- **WHEN** it is read with `depth=0`, and separately `depth=65`
- **THEN** both answer `400 { error: 'invalid_query' }`

#### Scenario: an unknown field group

- **WHEN** it is read with `fields=notes,cost`
- **THEN** the answer is `400 { error: 'invalid_query' }`

#### Scenario: a named group is added

- **WHEN** it is read with `fields=notes,slices`
- **THEN** each row carries the outline, `notes` and its own `slices`, and no `schedule`

#### Scenario: a stale cursor

- **GIVEN** a `nextCursor` whose last work item has since been deleted
- **WHEN** it is sent back
- **THEN** the answer is `409 { error: 'stale_cursor' }`

### Requirement: One work item reads in full

`GET /api/projects/:id/work-items/:workItemId` SHALL answer `{ workItem, projectRevision }`
where `workItem` is every field the whole-tree read answers for it, plus `slices` (its own)
and `updatedAt`. An absent or foreign project and an absent work item SHALL answer
`404 { error: 'not_found' }` alike.

#### Scenario: one work item

- **WHEN** a readable work item is read
- **THEN** its fields equal its entry in the whole-tree read, plus its own slices

#### Scenario: a foreign project's work item

- **WHEN** a work item of another organization's project is read
- **THEN** the answer is `404 { error: 'not_found' }`, as for an absent one

### Requirement: The whole-tree read is unchanged and steers to the pages

`GET /api/projects/:id/work-items` SHALL answer exactly as before this change. Its summary
and description, which the MCP tool description carries, SHALL say it answers the whole
tree and SHALL name the work-item-rows and single work-item reads for a page or for one
work item.

#### Scenario: the whole-tree read is unchanged

- **WHEN** it is read with no query string
- **THEN** the body is the one it answered before this change

#### Scenario: the MCP lists the two new reads

- **WHEN** mcp-01 derives its tools
- **THEN** there are two more than before, and the README states the new count
