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

`migration-lint` SHALL refuse the slice 1 migration unless `bin/assert-rename-window.sh`
exists. The gate SHALL pass only when no prod release is recorded or a backup report of the
live database is fresh (its sha256 equals the file's now and its migration set equals the
applied set), and SHALL refuse a missing, unreadable or stale report and a missing or
unreadable state directory.

#### Scenario: A write after the backup refuses the window

- **WHEN** a row is written after `backup-db-cli.ts` produced the report
- **THEN** the gate exits 1 naming the sha mismatch

#### Scenario: Slices 2 and 3 need no waiver

- **WHEN** the slice 2 migration rebuilds `work_package` in the compatible rebuild form with
  no `DROP COLUMN` or `RENAME COLUMN` statement
- **THEN** `migration-lint` passes it without a `WAIVERS` entry, and its window still runs
  the gate before deploy

#### Scenario: The waiver needs its gate

- **WHEN** `bin/assert-rename-window.sh` is deleted from the tree
- **THEN** `migration-lint` refuses the waived migration

### Requirement: The plan document is version 12, then 13, then 14

Version 11 is the budgets change's. Export SHALL write only the newest version: 12 after
slice 1 (`workPackage` replaces `project`, every `projectId` is `workPackageId`), 13 after
slice 2 (adds the engagement as `project: { id, name }`), 14 after slice 3a (`workPackage.settings` carries each catalogue key
with provenance). Import SHALL read every version from 1 to the newest, converting older
shapes on read, and SHALL refuse a newer one with `400 unsupported_version`.

#### Scenario: A version 11 file imports as a work package

- **WHEN** a version 11 file whose top-level `project` names timezone `Europe/Kyiv` is imported
  into project P
- **THEN** a work package is created in P with that timezone as its own override

#### Scenario: Navigator reads the new export and the old fixtures

- **WHEN** `twilight-navigator` turns a version 12 export and the v7–v11 fixtures into plan
  reference records
- **THEN** each record's plan id is the work package id of its file

### Requirement: Saved plans read across the input schema bump

`CANONICAL_PLAN_INPUT_SCHEMA_VERSION` SHALL be 10 after slice 1 and 11 after slice 3a. A body
stored at 9 or earlier SHALL upgrade on read and compare equal to itself re-saved; no stored body SHALL
be rewritten.

#### Scenario: An old saved plan still compares

- **WHEN** a saved plan stored before slice 1 is compared with one saved after it, both of the
  same unchanged work package
- **THEN** the compare reports no difference

### Requirement: A project is an organization's named collection of work packages

`POST /api/projects` SHALL create a project with a unique name within the organization,
and with `workPackage: { name }` SHALL create the project and its first work package in one
transaction; `PATCH` renames it; `DELETE` removes it only while it holds no work package,
the organization's only project included. Every work package SHALL reference exactly one
project of its own organization, enforced in storage, and `POST /api/work-packages` and the
import routes SHALL refuse `422 project_required` when the body names no `projectId`.

#### Scenario: Duplicate name

- **WHEN** an admin creates two projects named "WBS product" in one organization
- **THEN** the second answers `409 name_taken`

#### Scenario: Delete refuses a non-empty project

- **WHEN** an admin deletes a project holding work packages W1 and W2
- **THEN** it answers `409 not_empty` with `workPackageIds: [W1, W2]` and nothing changes

#### Scenario: A work package cannot point across organizations

- **WHEN** a row insert gives a work package of organization A a project of organization B
- **THEN** the trigger refuses it

#### Scenario: Creating a work package without a project is refused

- **WHEN** `POST /api/work-packages` is sent without `projectId`, and again with a foreign one
- **THEN** the first answers `422 project_required`, the second answers `404`, and no work
  package is created

#### Scenario: Importing without a project is refused

- **WHEN** a plan document is imported through the import route, and again through mcp-01's
  import tool, both naming no `projectId`
- **THEN** both answer `422 project_required` and no work package is created

#### Scenario: A new project with its first work package

- **WHEN** an admin sends `POST /api/projects { name: "WBS product", workPackage: { name:
"Editor" } }`, and again with the same name
- **THEN** the first answers `201` with project "WBS product" holding work package "Editor"
  whose `projectId` is the new project; the second answers `409 name_taken` and creates
  neither a project nor a work package

#### Scenario: The only project is deleted like any other

- **WHEN** an admin deletes the empty only project of an organization
- **THEN** it answers `204` and the organization holds no project

### Requirement: An organization starts with no project

Organization activation (the activation CLI and the onboarding route) SHALL create no
project; nothing SHALL mark one project of an organization as special.

#### Scenario: A new organization holds no project

- **WHEN** a user creates an organization through onboarding, and an operator activates a
  legacy one through `organization-activation-cli.ts`
- **THEN** each organization holds no project, and a `POST /api/work-packages` there without
  `projectId` answers `422 project_required`

### Requirement: Slice 2 back-fills one migration project where work packages exist

The migration SHALL create one ordinary project named "Migrated work packages" in every
organization that holds work packages and none in an organization that holds none, and
point every work package of the organization at it. A back-filled project's `created_by`
SHALL be null (no actor); a project created through `POST /api/projects` SHALL carry its
creator. The same migration SHALL drop `work_package.owner_id` after copying it into a null
`work_package.created_by`, and SHALL refuse on a database where `access_grant` does not
exist.

#### Scenario: Back-fill

- **WHEN** organizations A (3 work packages) and B (0) exist before the migration
- **THEN** A has one project "Migrated work packages" holding all 3 with `created_by IS
NULL`, B has no project, and renaming A's project, and deleting it once empty, is allowed
  like any other; a project an admin creates afterwards has `created_by` equal to that
  admin's account

#### Scenario: The owner column goes and its account is kept

- **WHEN** work package W has owner U and a null `created_by` before the migration
- **THEN** after it `work_package` has no `owner_id` column and W's `created_by` is U

#### Scenario: The migration waits for the grant tables

- **WHEN** the slice 2 migration runs on a database without `access_grant`
- **THEN** it fails before rebuilding anything and `work_package.owner_id` is unchanged

### Requirement: The audit admits the project vocabulary through its own migration

Slice 2 SHALL widen `organization_audit` to admit subject kind `project` and the actions
`project_created`, `project_renamed`, `project_deleted` and `work_package_moved`, in a
migration of its own.

#### Scenario: The audit refuses project actions before the widening

- **WHEN** an `organization_audit` row with action `project_created` is inserted after
  slice 1's migration and before `widen_organization_audit_projects`
- **THEN** the subject-kind and action CHECK refuses it; after the widening it is admitted

### Requirement: A work package moves between projects of its organization

`POST /api/work-packages/:id/move { projectId }` SHALL re-home the work package in one
transaction, bump both projects' revisions and append `work_package_moved` to the audit. It
SHALL refuse `409 cross_organization`, `409 dependency_crosses_project { dependencyIds }`,
`409 type_not_allowed_in_project { typeIds }` and `409 step_code_not_in_project { codes }`,
and on success SHALL re-key W's per-step rows to the target project's steps by code.

#### Scenario: Move refused by a type

- **WHEN** a work item of W carries type `spike` and the target project's allow-list is
  `{epic, story}`
- **THEN** the move answers `409 type_not_allowed_in_project { typeIds: [<spike id>] }` and
  W stays

#### Scenario: Move refused across organizations

- **WHEN** an admin of organization A moves W of A into a project of organization B
- **THEN** the move answers `409 cross_organization` and W stays

#### Scenario: Move refused by a missing step code

- **WHEN** W uses step codes `dev` and `qa` and the target project defines only `dev`
- **THEN** the move answers `409 step_code_not_in_project { codes: ["qa"] }` and W stays

#### Scenario: Move refused by a dependency leaving the project

- **WHEN** cross-work-package dependencies exist and dependency D links a work item of W to
  one of another work package of W's current project
- **THEN** the move answers `409 dependency_crosses_project { dependencyIds: [D] }` and W
  stays

#### Scenario: Move applied

- **WHEN** the target allows W's types, has a step of every code W uses, and no dependency
  leaves the project
- **THEN** W's `projectId` is the target, the source project's and the target project's
  revisions each rose by one, and the audit holds one `work_package_moved` row

### Requirement: Every setting resolves down the chain with provenance

Every catalogue key SHALL resolve as work package → project → the project's space when it
has one → organization → catalogue default; a settings read SHALL answer `{ value,
provenance }` for every key; a write at a level the catalogue does not allow SHALL be refused
`409 not_overridable_here`; `null` SHALL clear an override. `timezone`, `calendarMarkers` and
`allowedWorkItemTypes` SHALL be writable at space; `pertWeights` and `budgetFactor` SHALL NOT.

#### Scenario: Inherited, overridden, cleared

- **WHEN** project P sets timezone `Europe/Kyiv`, work package W of P sets none, then
  `Europe/Berlin`, then `null`
- **THEN** W's timezone reads Kyiv with provenance `{ project, P }`, then Berlin with
  `{ work_package, W }`, then Kyiv with `{ project, P }`

#### Scenario: A fixed setting is written at the project

- **WHEN** `PATCH /api/projects/P/settings { allowedWorkItemTypes: [<epic id>, <story id>],
budgetFactor: 1.5 }`
- **THEN** it answers `200`, and every work package W of P reads both values with
  provenance `{ project, P }`

#### Scenario: A fixed setting refuses the work package

- **WHEN** `PATCH /api/work-packages/W/settings { allowedWorkItemTypes: [...] }`
- **THEN** `409 not_overridable_here` and W's project allow-list is unchanged

#### Scenario: A space value resolves for its projects

- **WHEN** space S sets timezone `Europe/Kyiv`, project P sits in S and sets none, work
  package W of P sets none, and project Q sits in no space
- **THEN** W and P read `Europe/Kyiv` with provenance `{ space, S }`, and Q reads the
  organization's value or the catalogue default with that provenance

#### Scenario: A project-only setting refuses the space

- **WHEN** `PATCH /api/spaces/S/settings { pertWeights: [1, 3, 1] }`
- **THEN** `409 not_overridable_here` and no space row is written

### Requirement: The slice 3a migration lifts only real overrides

`work_package.timezone` and the PERT weight columns SHALL become work-package `setting_value`
rows only where they differ from the catalogue default. `work_package.budget_factor` SHALL
become one project-level row where every work package of the project holds the same value
other than the default 1, and no row where they all hold 1; where they disagree the
migration SHALL refuse naming the project. The columns SHALL then be dropped; every work
package SHALL read the same values as before.

#### Scenario: Lift

- **WHEN** W1 had `UTC` and 1/4/1 and W2 had `Europe/Kyiv` and 1/3/1
- **THEN** W1 has no rows and reads defaults with provenance `default`, W2 has two rows and
  reads its values with provenance `{ work_package, W2 }`

#### Scenario: Budget factor lifts to the project

- **WHEN** project P holds W1 and W2, both with budget factor 1.5, and project Q holds W3
  with 1.5 and W4 with 2
- **THEN** with only P present, P has one `budgetFactor` row of 1.5 and W1 and W2 read 1.5
  with provenance `{ project, P }`; with Q present, the migration refuses naming Q and
  nothing is lifted

### Requirement: Calendar markers add across levels

A work package's calendar SHALL be the union of its organization's, its project's space's
(when it has one), its project's and its own markers, each read with provenance; a marker of
a level above SHALL NOT be removable through a lower level's route.

#### Scenario: Union

- **WHEN** P holds marker "Holiday 2026-12-25" and W of P holds "Demo 2026-11-03"
- **THEN** `GET /api/work-packages/W/calendar-markers` answers both with their provenance and
  `DELETE /api/work-packages/W/calendar-markers/<holiday>` answers `404`

### Requirement: Steps are project entities

A project SHALL define its step set (code, name, order) once; a work package SHALL hold
only its allowance and estimate unit per project step, keyed by the project's step id.
Creating, renaming or reordering a step SHALL be a project write seen by every work package
of the project. This requirement and the step lift below SHALL NOT be implemented before the
separate `wbs-step-catalogue` design lands, which may replace them (design E21, deferred
2026-10-25).

#### Scenario: A step added once is everywhere

- **WHEN** an admin adds step `review` to project P holding W1 and W2
- **THEN** both W1 and W2 list `review` with allowance 0

### Requirement: The step lift re-keys every step reference

The slice 3b migration SHALL lift steps into projects by code and re-key every row that
names a step: every table with a foreign key to `step` (twelve on `main` at `0b1dddaa0`,
listed in design E21) and `plan_event.step_id`. Stored journal payloads and saved-plan
bodies SHALL have their step ids rewritten once by the same migration, which SHALL refuse,
naming the row, on a payload shape it does not recognise. It SHALL refuse while any step
has no code or two codes of one project share a name.

#### Scenario: Lift and re-key

- **WHEN** project P holds W1 (created first) with steps `dev` (allowance 10) and
  `qa`, and W2 with `qa` and `ops`
- **THEN** P's steps are `dev`, `qa`, `ops` (deduplicated by code, first-occurrence order);
  W1 reads allowance 10 on `dev`, and every step node, estimate, attempt and claim of W1 and
  W2 reads the same as before

#### Scenario: Undo and history survive the step lift

- **WHEN** the last batch before the slice 3b migration edited an estimate on W2's `qa` step
  (merged into W1's `qa`), and the same account presses undo after it
- **THEN** replaying that pre-lift journal entry yields the same W2 tree as undo before the
  lift would have (the estimate restored on project step `qa`), W2's history lists the event
  against that step, and a saved plan of W2 stored before the lift compares equal to one
  saved after it

#### Scenario: An unrecognised journal payload refuses the lift

- **WHEN** journal row J holds a payload naming a step id in a shape the rewrite does not
  recognise
- **THEN** the migration fails on its guard naming J, and nothing is lifted or rewritten

#### Scenario: A code-less step refuses the lift

- **WHEN** work package W holds a step whose `code` is null
- **THEN** the migration fails on its guard naming W, and nothing is lifted

#### Scenario: Two codes with one name refuse the lift

- **WHEN** project P holds W1 with step `qa` named "Review" and W2 with step `rev` also named
  "Review"
- **THEN** the migration fails on its guard with `step_name_clash { projectId: P, name:
"Review", codes: ["qa", "rev"], workPackageIds: [W1, W2] }`, and nothing is lifted

### Requirement: Work item types stay directory-wide and a project allows a subset

Work item types SHALL stay named globally and unique across the directory. A project SHALL
hold `allowedWorkItemTypes`, resolved through `resolveSetting`, where an empty list allows
every type; assigning a type outside it on create or update SHALL be refused `409
type_not_allowed_in_project { typeIds }`. The slice 3a migration SHALL write no allow-list.

#### Scenario: Allow-list

- **WHEN** project P allows `{epic, story}` and a work item of W in P is given type `spike`
- **THEN** `409 type_not_allowed_in_project { typeIds: [<spike id>] }`; and in a project with
  no allow-list the same write succeeds

### Requirement: A project sits in one space or none

After slice 3a a project SHALL sit in at most one space (`spaceId`, null for an
organization-level project); the back-fill SHALL keep, per project, the space where its
earliest work package entry has the lowest position and SHALL write every other membership
to `space_project_dropped`; adding a project that sits in another space SHALL be refused;
deleting a space SHALL return its projects to none; roll-ups SHALL answer one row per
project folded from its work packages' roll-ups with the work package rows beneath.

#### Scenario: Back-fill keeps one space and reports the rest

- **WHEN** space S1 held W1 (project P1) at position 2 and W3 (P2) at position 1, and space
  S2 held W2 (P1) at position 1
- **THEN** P1 sits in S2, P2 sits in S1, and `space_project_dropped` holds exactly one row:
  P1 in S1, kept in S2

#### Scenario: A project in another space is refused

- **WHEN** P1 sits in S2 and `POST /api/spaces/S1/projects { projectId: P1 }` is sent
- **THEN** it answers `409 project_in_other_space { spaceId: S2 }` and P1 stays in S2

#### Scenario: An organization-level project

- **WHEN** project Q sits in no space, and later space S2 holding P1 is deleted
- **THEN** Q reads `spaceId: null` and is listed in `all` and in no space's roll-up, and P1
  reads `spaceId: null` with its work packages unchanged

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
(owner's `users.username` in the named set or `^claire-reg-`, or name matching `^TASK-\d+\b`,
`^New project$`, `^resume check \d+$`) and the survivors; `apply` SHALL refuse unless
`--expect-count` equals the report's count and SHALL delete through the existing deletion path.

#### Scenario: A changed dataset refuses

- **WHEN** `report` counts 330, one more doomed work package is created, and `apply
--expect-count=330` runs
- **THEN** it exits non-zero naming 331 and deletes nothing
