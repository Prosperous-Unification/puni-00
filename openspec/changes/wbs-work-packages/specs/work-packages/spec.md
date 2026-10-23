## ADDED Requirements

### Requirement: No surface names the old level "project"

After slice 1, no route path, operationId, MCP tool name, realtime subscription or event
name, audit vocabulary value, plan document field, saved-plan input key, SQLite table, column,
index or trigger, fe-01 user-visible word or `CONTEXT.md` term SHALL use "project" for one
WBS. The committed `tool-rename-work-package check` SHALL exit 0 on the tree and SHALL exit 1
listing every residual outside its allow-list.

#### Scenario: The generated OpenAPI document is renamed

- **WHEN** `emit-openapi-cli.ts` writes the document after slice 1
- **THEN** no path contains the segment `projects`, no operationId contains `Project`, and no
  schema property is named `projectId`

#### Scenario: The gateway admits the new subscription only

- **WHEN** a connection subscribes to `project:<id>` and another to `work-package:<id>`
- **THEN** the first is refused by the subscription shape check and the second joins the work
  package's presence roster

#### Scenario: A residual fails the check

- **WHEN** a line `const projectId = x` is injected into a file outside the allow-list and
  `tool-rename-work-package check` runs
- **THEN** it exits 1 and lists that path and line; with the line in an allow-listed path it
  exits 0

### Requirement: Live data migrates in place through the rename

The slice 1 migration SHALL rename every table, column, index and trigger, rewrite
`organization_audit` subject kinds and actions, refuse while a work package lacks an
organization row, and leave every row's content otherwise unchanged. Existing journal
entries, history events and saved plans SHALL keep working.

#### Scenario: A migrated dev-shaped store reads the same

- **WHEN** a fixture store with work packages, steps, estimates, claims, calendar markers,
  saved plans and a journal is migrated
- **THEN** every work package tree, startable read, history and saved-plan compare answers the
  same content as before, under the new field names

#### Scenario: Undo survives the rename

- **WHEN** the last batch before the migration moved a row and the same account presses undo
  after it
- **THEN** the move is undone

#### Scenario: An unmapped work package refuses the migration

- **WHEN** one work package has no organization row
- **THEN** the migration fails on its guard naming the count, and nothing is renamed

### Requirement: A rename migration runs only inside a proven window

`migration-lint` SHALL refuse the slice 1, 2 and 3 migrations unless `bin/assert-rename-window.sh`
exists. The gate SHALL pass only when no prod release is recorded or a backup report of the
live database is fresh (its sha256 equals the file's now and its migration set equals the
applied set), and SHALL refuse a missing, unreadable or stale report and a missing or
unreadable state directory.

#### Scenario: A write after the backup refuses the window

- **WHEN** a row is written after `backup-db-cli.ts` produced the report
- **THEN** the gate exits 1 naming the sha mismatch

#### Scenario: The waiver needs its gate

- **WHEN** `bin/assert-rename-window.sh` is deleted from the tree
- **THEN** `migration-lint` refuses the waived migration

### Requirement: The plan document is version 11, then 12, then 13

Export SHALL write only the newest version: 11 after slice 1 (`workPackage` replaces
`project`, every `projectId` is `workPackageId`), 12 after slice 2 (adds the engagement as
`project: { id, name }`), 13 after slice 3 (`workPackage.settings` carries each catalogue key
with provenance). Import SHALL read every version from 1 to the newest, converting older
shapes on read, and SHALL refuse a newer one with `400 unsupported_version`.

#### Scenario: A version 10 file imports as a work package

- **WHEN** a version 10 file whose top-level `project` names timezone `Europe/Kyiv` is imported
  into project P
- **THEN** a work package is created in P with that timezone as its own override

#### Scenario: Navigator reads the new export and the old fixtures

- **WHEN** `twilight-navigator` turns a version 11 export and the v7–v10 fixtures into plan
  reference records
- **THEN** each record's plan id is the work package id of its file

### Requirement: Saved plans read across the input schema bump

`CANONICAL_PLAN_INPUT_SCHEMA_VERSION` SHALL be 9 after slice 1 and 10 after slice 3. A body
stored at 8 SHALL upgrade on read and compare equal to itself re-saved; no stored body SHALL
be rewritten.

#### Scenario: An old saved plan still compares

- **WHEN** a saved plan stored before slice 1 is compared with one saved after it, both of the
  same unchanged work package
- **THEN** the compare reports no difference

### Requirement: A project is an organization's named collection of work packages

`POST /api/projects` SHALL create a project with a unique name within the organization;
`PATCH` renames it; `DELETE` removes it only while it holds no work package. Every work
package SHALL reference exactly one project of its own organization, enforced in storage.

#### Scenario: Duplicate name

- **WHEN** an admin creates two projects named "WBS product" in one organization
- **THEN** the second answers `409 name_taken`

#### Scenario: Delete refuses a non-empty project

- **WHEN** an admin deletes a project holding work packages W1 and W2
- **THEN** it answers `409 not_empty` with `workPackageIds: [W1, W2]` and nothing changes

#### Scenario: A work package cannot point across organizations

- **WHEN** a row insert gives a work package of organization A a project of organization B
- **THEN** the trigger refuses it

#### Scenario: Creating a work package needs a project

- **WHEN** `POST /api/work-packages` is sent without `projectId`, and again with a foreign one
- **THEN** the answers are `422` and `404`

### Requirement: Slice 2 back-fills one default project per organization

The migration SHALL create one project named "Default project" per organization holding
work packages, point every work package at it, and mark nothing as special.

#### Scenario: Back-fill

- **WHEN** organizations A (3 work packages) and B (0) exist before the migration
- **THEN** A has one project "Default project" holding all 3, B has none, and renaming or
  deleting A's project once empty is allowed like any other

### Requirement: A work package moves between projects of its organization

`POST /api/work-packages/:id/move { projectId }` SHALL re-home the work package in one
transaction, bump both projects' revisions and append `work_package_moved` to the audit. It
SHALL refuse `409 cross_organization`, `409 dependency_crosses_project { dependencyIds }`,
`409 type_not_in_project { typeIds }` and `409 step_code_not_in_project { codes }`.

#### Scenario: Move refused by a type

- **WHEN** a work item of W carries type `spike` and the target project has no type named
  `spike`
- **THEN** the move answers `409 type_not_in_project { typeIds: [<spike id>] }` and W stays

#### Scenario: Move applied

- **WHEN** W's types and step codes exist in the target and no dependency leaves the project
- **THEN** W's `projectId` is the target, both revisions rose by one, and the audit holds one
  `work_package_moved` row

### Requirement: Every setting resolves down the chain with provenance

Every catalogue key SHALL resolve as work package → project → spaces → organization →
catalogue default; a settings read SHALL answer `{ value, provenance }` for every key; a write
at a level the catalogue does not allow SHALL be refused `409 not_overridable_here`; `null`
SHALL clear an override. Nothing SHALL be overridable at space in this change, and the space
step SHALL be inert.

#### Scenario: Inherited, overridden, cleared

- **WHEN** project P sets timezone `Europe/Kyiv`, work package W of P sets none, then
  `Europe/Berlin`, then `null`
- **THEN** W's timezone reads Kyiv with provenance `{ project, P }`, then Berlin with
  `{ work_package, W }`, then Kyiv with `{ project, P }`

#### Scenario: A fixed setting refuses the work package

- **WHEN** `PATCH /api/work-packages/W/settings { stepCodes: [...] }`
- **THEN** `409 not_overridable_here` and W's project vocabulary is unchanged

#### Scenario: The space step is inert

- **WHEN** a `setting_value` row is forced at space level for `timezone`
- **THEN** resolution ignores it and the write path would have refused it

### Requirement: The slice 3 migration lifts only real overrides

`work_package.timezone` and the PERT weight columns SHALL become work-package `setting_value`
rows only where they differ from the catalogue default, then the columns SHALL be dropped;
every work package SHALL read the same values as before.

#### Scenario: Lift

- **WHEN** W1 had `UTC` and 1/4/1 and W2 had `Europe/Kyiv` and 1/3/1
- **THEN** W1 has no rows and reads defaults with provenance `default`, W2 has two rows and
  reads its values with provenance `{ work_package, W2 }`

### Requirement: Calendar markers add across levels

A work package's calendar SHALL be its project's markers plus its own, each read with
provenance; a project marker SHALL NOT be removable through a work package route.

#### Scenario: Union

- **WHEN** P holds marker "Holiday 2026-12-25" and W of P holds "Demo 2026-11-03"
- **THEN** `GET /api/work-packages/W/calendar-markers` answers both with their provenance and
  `DELETE /api/work-packages/W/calendar-markers/<holiday>` answers `404`

### Requirement: Step codes are a project vocabulary

A step's code SHALL be one of its project's `stepCodes`; a step write with another code
SHALL be refused `409 code_not_in_project { code }`. The slice 3 back-fill SHALL set each
default project's vocabulary to the union of its work packages' codes.

#### Scenario: Refusal and union

- **WHEN** P's vocabulary is `{dev, qa}` and a step with code `ops` is created in W of P
- **THEN** `409 code_not_in_project { code: 'ops' }`; and after the back-fill of a default
  project whose work packages used `{dev}` and `{dev, qa}` its vocabulary is `{dev, qa}`

### Requirement: Work item types belong to a project

Each work item type SHALL belong to one project and be unique by name within it; the slice 3
back-fill SHALL move every type into its organization's default project.

#### Scenario: Back-fill and scope

- **WHEN** organization A had types `epic` and `story` before the migration
- **THEN** both belong to A's default project and a second `epic` in that project is refused

### Requirement: Spaces hold projects

After slice 3 a space's members SHALL be projects; the back-fill SHALL map each space's work
packages to their projects, deduplicated in first-occurrence order; roll-ups SHALL answer one
row per project folded from its work packages' roll-ups with the work package rows beneath.

#### Scenario: Back-fill order

- **WHEN** space S held work packages W1 (project P1), W2 (P2), W3 (P1) at positions 1, 2, 3
- **THEN** S holds P1 then P2

#### Scenario: Folded roll-up

- **WHEN** P1's work packages start 2026-11-02 and 2026-11-09 and total 12 and 8 days
- **THEN** P1's row reads start 2026-11-02, total 20 days, with both work package rows beneath

### Requirement: Persons and teams belong to spaces without authority

`POST`/`DELETE /api/spaces/:id/people/:personId` and `/teams/:teamId` SHALL add and remove
belonging within the organization; the space read SHALL list them; no access, capacity or
schedule SHALL change.

#### Scenario: Belonging changes nothing else

- **WHEN** person Ana is added to space S and removed again
- **THEN** S lists her and then does not, and every work package schedule input hash is
  unchanged throughout

### Requirement: The dev cleanup CLI reports before it deletes

`work-package-cleanup-cli.ts report` SHALL list doomed work packages by the selection rule
(owner login in the named set or `^claire-reg-`, or name matching `^TASK-\d+\b`,
`^New project$`, `^resume check \d+$`) and the survivors; `apply` SHALL refuse unless
`--expect-count` equals the report's count and SHALL delete through the existing deletion path.

#### Scenario: A changed dataset refuses

- **WHEN** `report` counts 330, one more doomed work package is created, and `apply
--expect-count=330` runs
- **THEN** it exits non-zero naming 331 and deletes nothing

### Requirement: The solver wire names the work package

`SOLVER_WIRE_VERSION` SHALL be 5 and every wire field SHALL say `workPackageId`; a response
with another wire version SHALL be refused by the parser.

#### Scenario: Wire mismatch

- **WHEN** a solver answers `wireVersion: 4`
- **THEN** `parse-solver-response` refuses it naming both versions
