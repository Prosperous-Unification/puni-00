## Context

Read on 2026-10-24 on `main` at `1de277850` (fresh worktree; counts are `git grep` on that
tree, the schema is the 89 be-01 migrations applied in memory in order, all of them cleanly):

| Need                    | Exists today                                                                                                                                                                                                                                                                                         | Missing                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| The old level           | `project` (21 columns: name, owner, restricted, estimate method, PERT weights, rounding, dep reach, start date, solution ref, optimization, engine, objective, timezone, revision, audit) and 8 more `project*` tables; 20 tables carry `project_id`; 25 indexes and 10 triggers name it             | the word for it                                        |
| The engagement level    | nothing; `organization` owns roots through `*_organization` side tables; `space` is a lens (ADR 0033)                                                                                                                                                                                                | `project` in the new sense                             |
| Settings                | columns on `project`; `calendar_marker.project_id`; `step.code` unique per project; `work_item_type` global per organization; `project_priority_band`, `project_team_capacity`, `project_resource_capacity` per project                                                                              | a catalogue, inheritance, provenance                   |
| Routes                  | 25 `/api/projects…` paths, 5 more with a `projects` segment (`/api/spaces/:id/projects…`, `/api/organization/projects/:id/rank`, `/api/organization/project-rank`), 39 operationIds naming `Project`, MCP tools derived from them                                                                    | `/api/work-packages`, `/api/projects` in the new sense |
| Documents               | `PLAN_DOCUMENT_VERSION = 10` with top-level `project`; import classifier reads 1–10; `CANONICAL_PLAN_INPUT_SCHEMA_VERSION = 8` (saved-plan input, `CanonicalProject`); `SCHEDULE_BODY_SCHEMA_VERSION = 1`; `SCHEDULER_CONTRACT_VERSION = 17`; `SOLVER_WIRE_VERSION = 4` with `projectId` on the wire | the bumps                                              |
| Realtime                | gw-01 subscription `project:<id>` (presence rosters hang off it); events `project_settings_changed`, `project_changed`; fe-01 `lib/project-stream.ts`                                                                                                                                                | the renamed names                                      |
| Audit                   | `organization_audit.subject_kind` CHECK includes `project`; action `restricted_project_recovery`                                                                                                                                                                                                     | a CHECK rebuild                                        |
| Non-additive migrations | lint forbids `RENAME COLUMN`, `DROP TABLE`, `DROP COLUMN`; `WAIVERS` keyed by folder with a required gate script; precedent `20260831120000_rename_role_to_step` gated by `bin/assert-no-prod-release.sh`; `backup-db-cli.ts` writes a verified snapshot (path, sha256, bytes, migrations)           | a waiver for a window that may have a prod release     |
| Deploy                  | dev: one container `wbs-dev-src`, migrates at boot, poller follows `main`; prod: blue/green image swap; the organization-activation runbook already stops the container, backs up and restarts                                                                                                       | a stop-the-world procedure for a rename                |
| Twilight readers        | Navigator `plan-reference.ts` reads `document.project.id` (fixtures v7–v10) and names `POST /api/projects/:id/commands`; Dash's and Burokrat's `projectId` are Nx project ids                                                                                                                        | a v11 reader                                           |
| puni-plan tooling       | no live script calls `/api/projects` (90 files mention it: RESUME, batch notes, evidence); the wbs-dev MCP client lists tools by name                                                                                                                                                                | nothing to build; names to relearn                     |

## Goals / Non-Goals

**Goals:** the old level is called work package on every surface at once; a project is the
engagement and owns its work packages; one configuration layering model with provenance
across organization → space → project → work package; spaces group projects and hold persons
and teams; dev data survives each slice; everything that breaks is named here.

**Non-Goals:** per-project access (`wbs-permissions`); a space-level override of anything;
budgets (`wbs-budgets`); cross-work-package dependencies themselves; merging step rows across
work packages; any compatibility layer, alias, redirect or dual-version writer.

## Decisions

### Owner decisions (Dany, 2026-10-23/24; not reopened here)

- **E1. Space stays purely organizational.** A grouping of projects with no authority; a
  person or team may belong to one or several spaces (new, cheap link). Organization
  configuration overridable per space is a later non-goal.
- **E2. Project is the engagement.** A collection of work packages; it owns the shared
  settings (timezone, calendar markers, PERT weights, budget factor, step codes, work item
  types), cross-work-package dependencies (the `feat/cross-project-dependencies` work), budgets
  that bound several work packages, and project roll-ups.
- **E3. Work package is today's `Project`.** One WBS: work items, steps, restriction, claims,
  saved plans, exports, history, all tracking. Renamed everywhere; "project" at the old level
  disappears.
- **E4. Break everything at once, in two slices.** Slice 1 is the rename on every surface
  (SQLite, routes, MCP tool names, plan document with a version bump and no dual-version
  branch, saved plan schema, audit vocabulary, realtime events, fe-01 words, `CONTEXT.md`,
  the Twilight readers); slice 2 is the project entity above work packages. No users, so no
  compatibility layer and no legacy names; dev data still migrates (the dev SQLite is live and
  auto-deploys from `main`).
- **E5. Migration.** Slice 2 puts every work package into one "Default project" per
  organization; a curated regrouping happens by hand on dev afterwards through
  `moveWorkPackage`, not in the migration. Before it, dev's ~330 QA leftovers are deleted
  (assumed; Dany may overturn) and the eight real ones are regrouped into "PUNI platform",
  "WBS product", "Twilight agentic workflows" and "[KWLA] Kill WL Admin".
- **E6. Settings inheritance.** A work package may override timezone, calendar markers and
  PERT weights (unset means inherited; reads say which); step codes, work item types and
  budget factor are project-wide and not overridable.
- **E7. Permissions are a separate change** (`wbs-permissions`). Out of scope; the entity
  shape leaves room: every work package has exactly one project, every project exactly one
  organization, ids are stable, nothing here invents per-project access.
- **E8. No compatibility burden** until the first external tenant: prefer the breaking
  change and say what breaks.
- **E9. One configuration layering model across all four levels.** Every configurable value
  is defined at a level and inherited downward through organization → space → project → work
  package; a level may override a value only where that setting's definition allows it; every
  read of a resolved value states its provenance (level and id). The same chain later serves
  access grants (strongest-wins instead of nearest-wins), measure definitions and limits, and
  belonging. Space is in the chain from day one although nothing is overridable there yet;
  enabling a space override later is a per-setting flag, not a redesign. Settings are a small
  catalogue (key, value type, overridable-at levels) and one `resolveSetting(scope, key)` in
  core, not ad-hoc columns per level. Per-setting table: timezone, calendar markers, PERT
  weights overridable at work package; step codes, work item types, budget factor fixed at
  project; nothing overridable at space. Slice 1's migration is unchanged by E9.

### Assumed decisions (E10 onward; each the reading closest to E1–E9; Dany overturns by id)

- **E10. Allocated numbers.** Migration stamps `20261101100000_rename_project_to_work_package`
  (slice 1), `20261101110000_add_project` (slice 2), `20261101120000_add_setting_value`
  and `20261101120100_space_holds_projects_people_teams` (slice 3). Newest on `main` is
  `20261023100000_add_claim_lease`; the budgets branch (#663) renames its measure migrations
  past it with October stamps, so November stamps sort after everything in flight. Re-check
  against every open branch when each slice starts. Versions: `PLAN_DOCUMENT_VERSION` 10 → 11
  (slice 1) → 12 (slice 2) → 13 (slice 3); `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` 8 → 9 (slice
  1. → 10 (slice 3); `SOLVER_WIRE_VERSION` 4 → 5 (slice 1, `projectId` is on the wire);
     `SCHEDULER_CONTRACT_VERSION` 17 stays unless slice 1 changes a hashed byte (the canonical
     schedule input names no `projectId` today; task 1.3 proves it either way). Rejected: one
     document bump at the end (E4 wants slice 1 shipped renamed, and a document that still says
     `project` at the old level would be a dual vocabulary for weeks).
- **E11. The rename vocabulary** is one ordered map, applied by case family and word boundary:
  `project` → `work_package` (SQL), `workPackage` (identifiers, JSON keys, document fields),
  `WorkPackage` (types, operationId segments), `work-package` (paths, module directories,
  route segments as `work-packages`, realtime prefix `work-package:`), "work package" (prose,
  UI words); `projects` → the plural of each; `projectId` → `workPackageId`; `project_id` →
  `work_package_id`; `project:<id>` → `work-package:<id>`; `project_settings_changed` →
  `work_package_settings_changed`; `project_changed` → `work_package_changed`; audit subject
  `project` → `work_package`, action `restricted_project_recovery` →
  `restricted_work_package_recovery`; tables `project_access`, `project_organization`,
  `project_priority_band`, `project_rank`, `project_resource_capacity`, `project_solution`,
  `project_team_capacity`, `space_project` → `work_package_*` and `space_work_package` (the
  last is replaced again in slice 3, E23); core module `module/project` → `module/work-package`
  and fe-01 `modules/project` → `modules/work-package` (both carry indexed READMEs); fe-01
  preference key `lastOpenedProject` → `lastOpenedWorkPackage` (the old key is ignored, so the
  first load after the deploy opens nothing; accepted). **Excluded from the map:** Nx
  vocabulary (`project.json`, `projectType`, `nx run <project>`, `tool-devsync`'s project
  names, Burokrat's Nx `projectId`, Dash's ledger `project` columns), every existing
  `migration.sql`/`down.sql` (rollback refuses an edited migration), `openspec/changes/**`
  other than this change, dated records (`docs/findings/**` proof details,
  `docs/superpowers/**`, `docs/plans/**`, `docs/wbs/testing/**`, `*-history.md`, evidence
  logs, older plan-export fixtures), and `CONTEXT.md` terms that keep the word in its new
  sense (E24). Prose that names the engagement ("a client project") is a hand decision.
- **E12. The rename is a committed, rerunnable script**: Nx project `tool-rename-work-package`
  under `tools/tool-rename-work-package/` with `src/rename-map.ts` (the map above, as data),
  `src/allow-list.ts` (excluded paths and per-line patterns, as data), and `src/cli.ts` with
  three modes: `apply` (path moves through `git mv`, then content replacement file by file,
  idempotent), `check` (exit 1 listing every residual match of
  `\bprojects?\b|projectId|ProjectId|project_id` outside the allow-list, with path and line),
  `report` (the inventory table below, regenerated). Tests: the map's families are consistent
  (every key has all five spellings and none collides with an existing identifier); `check`
  fails on an injected residual in a non-excluded file and passes on an excluded one (R5
  negative, watched); `apply` twice equals `apply` once. The reviewer reruns `check` on the PR
  head; hand fixes (articles, plural grammar, sorted fields, prettier wrapping) follow `apply`
  and are reviewed as an ordinary diff. Rejected: a one-off sed in a PR description (not
  rerunnable, not testable).
- **E13. Slice 1 migration.** One `migration.sql`: `ALTER TABLE … RENAME TO` for the nine
  tables, `ALTER TABLE … RENAME COLUMN project_id TO work_package_id` for the twenty, `DROP
INDEX`/`CREATE INDEX` and `DROP TRIGGER`/`CREATE TRIGGER` for the 25 indexes and 10
  triggers under their new names, a rebuild of `organization_audit` with the renamed CHECK
  vocabulary (the `widen_organization_audit_*` shape) and `UPDATE`s of its `subject_kind` and
  `action` values; a `CHECK (violations = 0)` guard table refuses while any work package lacks
  an organization row. Stored JSON is not rewritten: `command_journal` and `plan_event` keep
  their payloads (their `project_id` is a column), and `saved_plan_body.input_bytes` stays
  schema 8 bytes read through a new 8 → 9 upgrade step in the saved-plan reader (the
  established reader-side chain; a stored body is never rewritten). Task 1.3 proves by
  replaying every journal kind through a migrated fixture that no payload names `projectId`;
  if one does, the migration rewrites it with `json_set` and the test proves that instead.
  `down.sql` reverses every rename (it is not linted for additivity) because
  `migrate-down-cli.ts` requires one; the rollback of record is the backup (E14). Lint: a
  `WAIVERS` entry for the folder with label `ALTER TABLE ... RENAME COLUMN` and gate script
  `bin/assert-rename-window.sh`. Rejected: expand/contract with views and `INSTEAD OF`
  triggers (`steps-schema-rename` D2): nine views and dozens of triggers alive for one
  release, for nobody (E8).
- **E14. Stop-the-world window with the backup as rollback.** `bin/assert-rename-window.sh
<state-dir> --backup-report=<file>` passes when `bin/assert-no-prod-release.sh <state-dir>`
  passes **or** the report (written by `backup-db-cli.ts`) names the live `DB_PATH`, its
  sha256 equals the live file's now, and its migration set equals the database's applied set;
  it refuses on a missing, unreadable or stale report (a sha mismatch means a write happened
  after the backup: stop again, back up again). Procedure, dev (`wbs-dev-src`, `/data/wbs.db`,
  under the heavy lock, the organization-activation runbook's shape): stop the container; run
  `backup-db-cli.ts /data/pre-work-package-rename.db`; run the gate with the report; let the
  poller deploy the merged commit (be-01 migrates at boot); `/health` proves the commit; smoke
  `GET /api/work-packages`. Rollback: stop, copy the backup over `/data/wbs.db` (dropping
  `-wal`/`-shm`), check out the previous commit, start. Prod: only if a release is recorded
  (undetermined from this machine; the gate reads the state directory and decides): stop both
  colours, back up with the same CLI from the new image against the volume, run the gate,
  deploy the release with the ordinary swap tooling (`--dry-run` first); rollback is the
  backup plus a redeploy of the previous release. Slices 2 and 3 reuse the window and the
  gate (their migrations rebuild tables, E15/E20). Rejected: running the rename under the
  blue/green swap (the outgoing colour would fail every query the instant the rename commits).
- **E15. Slice 2 storage.** `project(id PK, organization_id NOT NULL → organization, name NOT
NULL CHECK (length(name) > 0), revision, created_at NOT NULL, updated_at, created_by NOT
NULL)` with `UNIQUE (organization_id, name)` and `UNIQUE (id, organization_id)`; born
  organization-aware like `space` (no side table). `work_package.project_id NOT NULL →
project(id)` through a table rebuild of `work_package` (lint waiver with the same gate;
  `ADD COLUMN … NOT NULL` without a default is refused and a default would be a made-up
  owner, R5). Back-fill inside the migration: for every organization holding at least one work
  package, one project named "Default project" with a fresh uuid, then every work package of
  that organization points at it; a guard refuses while any work package lacks an organization
  row. Trigger pair `work_package_project_organization_insert/update` refuses a work package
  whose project belongs to another organization than its `work_package_organization` row (the
  `claim_step_project_*` device). `down.sql` refuses while any project other than a
  back-filled default holds work packages, then rebuilds `work_package` without the column and
  drops `project`. Ids are uuids generated in SQL the way the organization back-fill did (task
  2.1 verifies the precedent); nothing marks a default project as special afterwards.
- **E16. The default project is ordinary after the back-fill.** No flag column; it is renamed,
  moved out of and deleted like any project; `deleteProject` refuses `409 not_empty` naming
  the work package ids while any remain. A new organization gets no project until somebody
  creates one, and `createWorkPackage` requires `projectId` (`422` when absent, `404` when
  foreign). Rejected: a `kind = 'default'` column (one more thing permissions would have to
  reason about, E7).
- **E17. Project commands are organization-level HTTP routes, not plan-command batch
  commands** (batches are per work package). `POST /api/projects {name}` → 201 / 409
  `name_taken`; `GET /api/projects` (the caller's organization, with work package counts);
  `GET /api/projects/:id` (its work package entries); `PATCH /api/projects/:id {name}` → 200 /
  409 `name_taken` / 404; `DELETE /api/projects/:id` → 204 / 409 `not_empty` / 404; `POST
/api/work-packages/:id/move {projectId}` → 200 / 404 (either side, organization-scoped) /
  409 `cross_organization` / 409 `dependency_crosses_project { dependencyIds }` once
  cross-work-package dependencies exist / 409 `type_not_in_project { typeIds }` and 409
  `step_code_not_in_project { codes }` from slice 3. Each write is one immediate transaction
  under the write coordinator, bumps the project's revision and appends one `organization_audit`
  row (`project_created`, `project_renamed`, `project_deleted`, `work_package_moved`; subject
  kind `project` in the new sense, unambiguous because slice 1 rewrote the old rows to
  `work_package`). Authority today: admin or super-admin for project writes; `moveWorkPackage`
  also needs edit on the work package (the restricted-owner rule); every member lists projects
  (E7's "plain membership sees nothing" arrives with `wbs-permissions`). mcp-01 derives the
  tools (`postApiProjects`, `postApiWorkPackagesByIdMove`, …). The work package read gains
  `projectId`; the plan document gains `project: { id, name }` at version 12, informational on
  import: the import request names the target project, never the file.
- **E18. The setting catalogue (E9).** `@wbs/domain` `settings/catalogue.ts`: `SETTING_CATALOGUE`
  entries `{ key, value (ArkType), definedAt: 'project', overridableAt: ReadonlySet<Level> }`
  for `timezone` (IANA zone; overridable at `work_package`), `pertWeights` (three positive
  numbers; `work_package`), `calendarMarkers` (a set, E19; `work_package`), `stepCodes` (a set
  of codes; fixed), `workItemTypes` (fixed; E22); `budgetFactor` is listed by name in the
  catalogue's JSDoc as reserved for `wbs-budgets` and gets its entry there (an entry without
  a value type is dead code). Levels: `organization | space | project | work_package`.
  Storage: `setting_value(scope_kind, scope_id, key, value_json, revision, created_at,
updated_at, created_by)` PK `(scope_kind, scope_id, key)`, `scope_kind` CHECK over the
  levels; a write of a key at a level the catalogue does not allow is refused at the boundary
  (`409 not_overridable_here`), and a value that fails the key's type is `422`. Resolution:
  `resolveSetting(chain, key)` in core, `chain = { organizationId, spaceIds, projectId,
workPackageId? }`, walks work package → project → spaces → organization → catalogue default
  and answers `{ value, provenance: { level, id } | { level: 'default' } }`; it refuses
  `ambiguous_space_value` when two spaces of the chain hold different values for a
  space-overridable key (inert today, E24). Reads: `GET /api/work-packages/:id/settings` and
  `GET /api/projects/:id/settings` answer every catalogue key resolved with provenance;
  writes: `PATCH …/settings { key: value | null }` where `null` clears the override (back to
  inherited). Rejected: nullable columns per level (E9 names that as the thing not to do);
  a settings JSON blob per row (no per-key provenance or type).
- **E19. Calendar markers are a set that adds, never hides.** `calendar_marker(scope_kind,
scope_id, date, name, color, …)` replaces `work_package_id`; a work package's calendar is
  its project's markers plus its own, each read with its provenance; a work package cannot
  remove a project marker (that is a project write). "Override" for a set means adding.
  Rejected: a work package's own set replacing the project's (holidays vanish the moment a
  work package adds one marker).
- **E20. What the slice 3 migration lifts.** `work_package.timezone` and the three
  `pert_weight_*` columns move into `setting_value` rows at the work package level **only
  where the stored value differs from the catalogue default** (`UTC`; 1, 4, 1); equal values
  get no row and read as inherited from the default. No project-level row is invented: the
  default project cannot be given the "right" zone when its work packages disagree, and the
  curated regrouping lifts values to projects by hand afterwards. Every work package reads
  exactly the value it read before. The columns are then dropped (table rebuild, third
  window). `estimateMethod`, `estimateRounding`, `depReach`, `startDate`, engine, objective and
  optimization stay work-package columns: E6 names them nowhere, and they are plan inputs, not
  shared configuration. Rejected: keeping the columns as a cache (two sources of truth).
- **E21. Step codes are a project-wide vocabulary; step rows stay per work package.** The
  project's `stepCodes` set is the authoritative list; a work package's steps must use codes
  from it (`createStep`/`setStepCode` with an absent code → `409 code_not_in_project { code }`;
  fe-01 offers "add to project" to an admin). Back-fill: the default project's set is the
  union of its work packages' codes. Estimates and attempts key on step ids, allowances and
  estimate units differ per work package, so merging step rows across work packages has no
  rule and is a non-goal. Likely to be debated; overturn by id.
- **E22. Work item types become project-scoped.** `work_item_type.project_id NOT NULL`
  (rebuild in the slice 3 window), unique by name within a project, `work_item_type_organization`
  dropped (the project names the organization); back-fill: every type goes to its
  organization's default project. `moveWorkPackage` refuses `type_not_in_project` naming the
  types a work item of the package carries that the target lacks by name; the regrouping
  creates them in the target first through the directory routes. ADR 0009 (a type does not
  inherit) is untouched. Rejected: keeping types organization-wide with a per-project allow
  list (two tables for one fact).
- **E23. Spaces hold projects; persons and teams belong to spaces.** Slice 3 replaces
  `space_work_package` with `space_project(space_id, project_id, organization_id, position,
…)` → `project(id, organization_id)`, back-filled by mapping each space's work packages to
  their projects, deduplicated, keeping first-occurrence order; `space_work_package` is then
  dropped. Routes go `/api/spaces/:id/work-packages…` (slice 1) → `/api/spaces/:id/projects…`
  (slice 3, new sense; a second break, stated). `GET /api/spaces/:id/roll-ups` answers one row
  per project folded from its work packages' roll-ups (earliest start, latest finish, summed
  days and counts, folded status) with the work package rows beneath; `in-progress` keeps its
  meaning over the space's projects' work packages; the `all` space is the caller's projects.
  Belonging: `space_person(space_id, person_id, organization_id, created_*)` and
  `space_team(space_id, service_team_id, organization_id, created_*)`, `POST`/`DELETE
/api/spaces/:id/people/:personId` and `/teams/:teamId`, listed in the space read; no effect
  on access, capacity or scheduling (E1). Rejected: a polymorphic `space_member(kind, id)`
  table (three foreign keys cannot be expressed on one column).
- **E24. The chain and several spaces.** A project may sit in many spaces (today's rule
  kept), so `chain.spaceIds` is the set; because nothing is overridable at space, the step is
  inert and tested as such; the day a per-setting flag opens a space override, a project in two
  spaces with different values resolves `ambiguous_space_value`, and that change states its
  rule. No "home space" column. `CONTEXT.md` terms that keep the word in its new sense:
  **Project**, **Project roll-up**, **Project settings**, **All projects**; **Project rank**,
  **Project owner**, **Project entry** and **Project timezone** become work package terms
  (E25).
- **E25. What stays on the work package.** Owner and `restricted` (renamed **Work package
  owner**), `work_package_access` (last opened), the solution ref, the rank over shared people
  (`work_package_rank`: it orders what books people), the abbreviation of
  `feat/cross-project-dependencies` (addresses `PUNI.080.39` name a work package); that branch
  rebases onto the slice 1 names before it lands and its dependency rows become
  cross-work-package rows inside one project (E2). A project has no owner column (E7).
- **E26. Solver wire and supervisor protocol rename too.** `projectId` on the wire becomes
  `workPackageId`, `SOLVER_WIRE_VERSION` 4 → 5, solver-py's six Python lines follow; the solver
  image is rebuilt and the dev supervisor mapping repinned in the same window (dev runbook's
  solver mapping preflight). Rejected: leaving the wire alone (E4 says every surface, and a
  wire field that lies about its level is the first thing the next reader trips on).
- **E27. Dev cleanup is an operator step, not a migration.** `work-package-cleanup-cli.ts
report|apply <rules.json> --expect-count=N` in be-01: a work package is doomed when its
  owner account's login is one of `claire-qa-22aug`, `planner-qa-0822`, `ada` or matches
  `^claire-reg-`, **or** its name matches `^TASK-\d+\b`, `^New project$` or
  `^resume check \d+$`. `report` prints the doomed list (id, name, owner, counts) and the
  survivors; `apply` refuses unless `--expect-count` equals the report's count (a changed
  dataset refuses) and deletes through the existing work-package deletion path, in one
  transaction per work package, after `backup-db-cli.ts`. It runs after slice 1 is deployed
  and before slice 2's window. The survivors' regrouping is a list of `moveWorkPackage` calls
  in the runbook with ids filled in on the day; the four project names come from E5.
- **E28. fe-01.** Words and module names through the script; no URL changes (there is no
  `/projects` URL; the open work package is a remembered preference). Slice 2 adds a project
  group to the picker and a projects page; slice 3 shows provenance in the settings modal
  ("inherited from project X") and a "clear override" control; the spaces page lists projects
  with their work packages, persons and teams.
- **E29. The synced specs under `openspec/specs/`** (10 files, 80 lines, and the folder
  `project-assignment-reads`) take the new vocabulary when this change is archived; archived
  changes are never edited. This change's delta spec is `work-packages` only.

## Rename inventory (a)

`git grep -c -i -E '\bprojects?\b'` on `main` at `1de277850`, summed per surface; "Nx-ish"
is the share of those lines that mention Nx vocabulary (`nx run`, `project.json`,
`projectType`, `affected`, project graph) and is excluded by the allow-list (E11).

| Surface                                           | Files |  Lines | Treatment in slice 1                                                                    |
| ------------------------------------------------- | ----: | -----: | --------------------------------------------------------------------------------------- |
| be-01 migrations (`apps/wbs/be-01/drizzle`)       |    73 |    236 | untouched history; one new migration renames the live schema                            |
| store-sqlite                                      |   172 |  2,401 | script                                                                                  |
| store-memory                                      |    30 |    463 | script                                                                                  |
| conformance                                       |    35 |    330 | script                                                                                  |
| core                                              |   261 |  3,009 | script; `module/project` → `module/work-package` (indexed README)                       |
| contracts                                         |    63 |    356 | script; 25 + 5 paths, 39 operationIds, document and saved-plan shapes, versions         |
| domain + validation                               |    92 |    445 | script; `CanonicalProject`, roll-up, contract versions                                  |
| realtime adapter + other adapters                 |    22 |     37 | script; solver wire (E26)                                                               |
| be-01 `src` and tests                             |   186 |  4,108 | script                                                                                  |
| gw-01                                             |    26 |    237 | script; `work-package:<id>`                                                             |
| mcp-01                                            |    15 |     77 | script; tool names follow operationIds; its own store names no project                  |
| fe-01                                             |   341 |  3,319 | script; `modules/project` → `modules/work-package` (indexed README), stream, preference |
| twilight-structure                                |   106 |    833 | Navigator only (reader, JSDoc, README, a v11 fixture); the rest is Nx-ish               |
| libs/shared + libs/website                        |    26 |     66 | hand check; expected Nx-ish or unrelated                                                |
| tools, deploy, infra, ops, bin                    |   134 |  1,204 | 536 Nx-ish; the rest hand-checked (devsync, smoke, fleet manifests)                     |
| docs                                              |   230 |  5,585 | 573 Nx-ish; current docs by script, dated records excluded (E11)                        |
| `CONTEXT.md` and root `*.md`                      |     6 |    152 | hand (terms, E24); `LLM_README.md` tables line                                          |
| openspec/specs                                    |    10 |     80 | at archive time (E29)                                                                   |
| openspec/changes (non-archive)                    | 1,429 |  8,537 | untouched (history)                                                                     |
| openspec/changes/archive                          |   369 |  2,039 | untouched                                                                               |
| **Code surfaces the script rewrites** (rows 2–12) | 1,243 | 14,782 |                                                                                         |
| **Whole tree**                                    | 3,701 | 33,804 |                                                                                         |

Case-sensitive identifier families outside the archive: `projectId` 935 files / 11,263
lines; `project_id` 210 / 1,043; `Project` 324 / 842; `projects` 1,211 / 6,213. The live
schema: 9 `project*` tables, 20 `project_id` columns, 25 indexes, 10 triggers.

Live callers of `/api/projects` outside `apps/wbs`: twilight-navigator (`receipt-to-commands.ts`
JSDoc, `README.md`), the wbs-dev MCP client (tool names), puni-plan's `ui-review` capture
script text; none in Dash, Burokrat or a puni-plan script.

## Document and saved-plan bumps (b)

- Version 11 (slice 1): top-level `project` → `workPackage`, every nested `projectId` →
  `workPackageId`; the classifier reads 1–11 and converts a ≤ 10 file's `project` on read as
  it converts 7's zone or 10's resources; export writes 11 only; `unsupported_version` for
  12+. Navigator reads 11 and keeps 7–10.
- Version 12 (slice 2): adds `project: { id, name }` of the engagement, informational.
- Version 13 (slice 3): `workPackage.settings` carries each catalogue key as `{ value,
provenance }`; import writes only the work package's own overrides and leaves inherited
  values inherited.
- Saved plans: `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` 8 → 9 (`CanonicalProject` →
  `CanonicalWorkPackage`, keys renamed; a stored 8 body upgrades on read), → 10 at slice 3
  (resolved settings with provenance in the input). `SCHEDULE_BODY_SCHEMA_VERSION` stays 1
  (it keys dates by work item id; task 1.3 checks).

## Slice 1 migration and deploy (c)

E13 and E14. Blue/green is not used for this migration: the rename is one commit, one
window, one backup. Migration lint keeps refusing every other rename; the waiver names this
folder and requires the gate script to exist, and the gate refuses unless the window is
proven (no prod release, or a fresh verified backup of the live file with no write since).

## Slice 2: the project entity (d)

E15–E17, E25. Reads of a work package carry `projectId`; the project read lists entries;
nothing about who may see which project changes (E7).

## Settings inheritance (E9) and what moves up

E18–E22. Slice 2 moves only ownership; slice 3 brings the catalogue, `setting_value`,
`resolveSetting`, provenance on every settings read, the marker scope, the step-code
vocabulary and project-scoped types.

## Spaces (e)

E23–E24.

## What breaks (f)

- Every `/api/projects…` route, 39 operationIds and therefore every MCP tool name; clients
  re-list tools (the wbs-dev MCP client, Navigator's documentation, puni-plan notes).
- `project:<id>` subscriptions and the two event names; an old fe-01 tab reconnects to
  nothing and must reload.
- Plan documents: an exported file is version 11; the running import still reads older files.
- Saved plans read through the 8 → 9 upgrade; nothing is lost.
- Navigator: `document.project.id` becomes `document.workPackage.id` at 11; the v7–v10
  readers stay. Dash and Burokrat: nothing (their `projectId` is Nx's).
- The solver wire (E26): a solver image built for wire 4 refuses wire 5 requests loudly.
- fe-01: the remembered open work package is forgotten once.
- `feat/cross-project-dependencies` rebases onto the new names (its plan document 11 collides
  with this one; whichever lands second renumbers).
- Audit history reads `work_package` for old rows; the `restricted_project_recovery` action
  name changes.
- Spaces' member routes break twice (slice 1, slice 3).

## Dev cleanup (g)

E27, as a runbook section in `docs/runbook-dev-deploy.md` (`Work package cleanup and
regrouping`): backup, `report`, Dany reads the doomed list, `apply --expect-count`, then the
slice 2 window, then the `moveWorkPackage` list and the project-level settings lifted by
hand. Numbers (~330 doomed, 8 survivors) are the owner's and are re-read by `report` on the
day.

## Risks / Trade-offs

- Three windows on dev (slices 1, 2, 3), each minutes long, each with a backup; accepted
  under E8 and documented in one runbook section.
- The script cannot decide prose that means the engagement; the allow-list and the hand diff
  are reviewed, and `check` lists what is left rather than hiding it.
- E21 and E22 change authoring flows (a new step code or type is a project write first);
  the cheapest honest reading of "project-wide, not overridable", flagged for Dany.
- Whether prod records a release could not be read from this machine; the gate decides on the
  day, and the procedure covers both outcomes.

## Open Questions

- E5's deletion list: Dany confirms the owner logins and name patterns in E27 before `apply`.
- E21: should adding a step with a fresh code append to the project's vocabulary in the same
  transaction instead of refusing?
- The dependency shape of `feat/cross-project-dependencies` was skimmed read-only (abbreviation
  side table, stable endpoint identities, typed external rows); its rebase is that branch's
  work.
