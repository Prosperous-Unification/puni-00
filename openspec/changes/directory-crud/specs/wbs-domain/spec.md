## ADDED Requirements

### Requirement: A person or service team can be renamed

The directory SHALL accept a new name for a person and for a service team it
already holds. Names SHALL stay unique across the deployment — the same rule
creation already enforces — and a collision SHALL be refused as taken,
carrying the name that survives. A name of whitespace alone SHALL be refused,
and a name SHALL be stored trimmed. A patch naming nothing to change SHALL be
refused as invalid rather than accepted as a no-op.

Any signed-in account may rename, as any may create today.

#### Scenario: renaming a person

- **WHEN** `Kat` is renamed to `Katrin`
- **THEN** the directory holds `Katrin`, and every assignment that held the
  person still holds them

#### Scenario: renaming onto a taken name

- **GIVEN** people `Kat` and `Strip`
- **WHEN** `Strip` is renamed to `Kat`
- **THEN** the request is refused as taken naming `Kat`, and both names are
  unchanged

#### Scenario: a whitespace name

- **WHEN** a team is renamed to spaces alone
- **THEN** the request is refused and nothing is written

#### Scenario: an empty patch

- **WHEN** a patch arrives carrying neither a name nor memberships
- **THEN** it is refused as invalid

### Requirement: A person's memberships can be edited

A patch carrying `teamIds` SHALL replace the person's memberships in full,
deduplicated, in the same transaction as any rename riding the same patch —
the two SHALL NOT be observable half-applied. An id naming a team that is not
there SHALL refuse the whole patch as `unknown_team`, and nothing SHALL be
written. Replacing memberships with an empty list SHALL leave the person a
free agent, which is a valid state.

#### Scenario: memberships replaced

- **GIVEN** `Kat` in `Platform`
- **WHEN** a patch sets her memberships to `Payments` and `Support`
- **THEN** she is in exactly those two teams

#### Scenario: a dead team id refuses the rename beside it

- **WHEN** one patch renames `Kat` to `Katrin` and sets a membership naming a
  deleted team
- **THEN** the patch is refused as `unknown_team` and she is still `Kat`

#### Scenario: duplicate ids collapse

- **WHEN** a patch lists the same team twice
- **THEN** the person holds one membership in it

### Requirement: Removing a person or team says what it would take with it

Removing a person or a service team SHALL be refused, by default, when
anything points at it. The refusal SHALL carry the **directory usage** — the
affected projects, work items and members by name, not bare counts. For a
person that is the assignments that hold them and every work item whose
**assumed assignee** would change, named with who covers it now. For a team
that is every work item labeled with it across every project, and every
person who belongs to it.

The refusal SHALL be a 409 whose body is `{ error: 'in_use', usage }`, and the
usage SHALL carry both of its halves, always present and never optional:

- `projects`: one entry per affected project, `{ id, name, workItems }`, where
  each work item is `{ id, number, name, effects }` and `number` is the
  derived number the plan shows (`3.1`).
- `members`: one entry per person whose membership the removal would drop,
  `{ id, name }`. A service team nothing but memberships points at SHALL still
  be refused, with those people named — a confirmation showing an empty impact
  list while memberships were about to be dropped is a confirmation of
  nothing. A person's own memberships name nobody else and go with them, so
  they SHALL NOT, alone, force a confirmation.

Each entry of `effects` SHALL name its kind and what that kind does:

- `{ kind: 'assignment_dropped', role: { id, name } }` — an assignment that
  holds the person goes.
- `{ kind: 'label_nulled' }` — the work item's service team label is nulled.
- `{ kind: 'assumed_assignee_changed', assumedNow, assumedAfter }` — the
  **assumed assignee** the work item reads as moves. Each is a person's name
  or `null`, and `null` SHALL mean `unassigned`: a removal that takes a work
  item's sole assignee SHALL name the flip to `unassigned` in the payload
  rather than leave it to be inferred from an absence.

A person or team nothing points at SHALL be removed without confirmation.

A second request carrying an explicit cascade SHALL remove the entity in one
transaction: a person's assignments are dropped and a team's labels are
nulled on every work item that carried them — never left dangling — and the
memberships either way. Every work item that lost an assignment or a label
SHALL have its revision moved, so a stale journal precondition refuses
instead of undoing against a directory that changed.

#### Scenario: refused with the usage named

- **GIVEN** `Kat` assigned on work item `3.1 Design` in project `Rollout`
- **WHEN** her removal is requested without cascade
- **THEN** the refusal names `Rollout` and `3.1 Design`, and she remains

#### Scenario: an assumed assignee flip is named

- **GIVEN** a work item whose only assignment is `Kat` on `Dev`
- **WHEN** her removal is requested without cascade
- **THEN** that work item carries an `assumed_assignee_changed` effect reading
  `Kat` now and `null` after, which is `unassigned`

#### Scenario: a team held by memberships alone

- **GIVEN** team `Platform` no work item carries, holding `Kat` and `Ada`
- **WHEN** its removal is requested without cascade
- **THEN** the request is refused as `in_use` with `Kat` and `Ada` in
  `members`, and the team remains

#### Scenario: cascade removes and nulls

- **GIVEN** team `Platform` labeled on work items in two projects
- **WHEN** its removal is requested with cascade
- **THEN** the team is gone, both projects' labels are null, no work item
  carries a dangling id, and each labeled work item's revision moved

#### Scenario: nothing points at it

- **WHEN** removal of a team no work item carries and no person belongs to
  is requested without cascade
- **THEN** it is removed

### Requirement: A stale directory id refuses instead of failing or dangling

Every write that accepts a person or team id SHALL validate the id inside
its own transaction and refuse a missing one as `unknown_person` or
`unknown_team` — assigning a person to a role, labeling a work item with a
team, creating a person into teams, and the undo/redo of any of them. It SHALL NOT
surface a raw constraint failure and SHALL NOT store an id the directory no
longer holds. Undo SHALL never resurrect a deleted person, team, or
membership.

That validation SHALL live **inside the repository write transaction that
performs the write** — `WorkItemRepository.patch` is the shape: read the id in
the same transaction as the `UPDATE` and answer a typed `unknown_team` or
`unknown_person` outcome in place of the written row, so the check and the
write cannot be pulled apart. A service-level precheck followed by today's
unchecked update SHALL NOT satisfy this requirement: they are two statements
with a delete-sized gap between them, and the check passes for a team removed
inside it. A compensating undo or redo SHALL replay through that same guarded
path rather than around it, so the guard covers the replay it was written for.

#### Scenario: the check and the write are one transaction

- **GIVEN** a team removed between a client's read and its write
- **WHEN** the label is written
- **THEN** the write's own transaction refuses it as `unknown_team`, and no
  row anywhere records the removed id

#### Scenario: assigning a person deleted underneath

- **GIVEN** a client holding a picker rendered before `Kat` was removed
- **WHEN** it assigns her to a role
- **THEN** the request is refused as `unknown_person`, not an error page

#### Scenario: labeling with a team deleted underneath

- **WHEN** a work item is labeled with a removed team's id
- **THEN** the request is refused as `unknown_team` and the label is
  unchanged

#### Scenario: undo against a removed person

- **GIVEN** an assignment was cleared, then the person was removed
- **WHEN** the clearing is undone
- **THEN** the undo is refused and nothing dangles

### Requirement: Directory writes that touch projects tell them

A rename or cascade removal SHALL, after its transaction commits, record and
publish one `directory_changed` event through the sequencer of every project
it touched — the projects holding an affected assignment, label, or
membership-derived assumption. A write touching no project SHALL emit
nothing. An open client's existing refetch-on-event SHALL therefore re-read
names and labels without a new subscription kind.

The event SHALL NOT precede the write it announces: anything that reads the
directory the moment the event is published SHALL already see the committed
rename or removal. An event published first would send every listener back to
read the state it was told had changed and find the old one.

#### Scenario: a rename reaches an open project

- **GIVEN** two clients with project `Rollout` open, where `Kat` is assigned
- **WHEN** one renames her
- **THEN** the other's next refetch, triggered by the event, shows `Katrin`

#### Scenario: an unreferenced rename is silent

- **WHEN** a person no project references is renamed
- **THEN** no project records an event
