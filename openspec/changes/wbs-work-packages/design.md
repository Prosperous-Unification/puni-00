## Context

Read on 2026-10-24 on `main` at `1de277850` (fresh worktree; counts are `git grep` on that
tree, the schema is the 89 be-01 migrations applied in memory in order, all of them cleanly):

| Need                    | Exists today                                                                                                                                                                                                                                                                                                                                                                                    | Missing                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| The old level           | `project` (21 columns: name, owner, restricted, estimate method, PERT weights, rounding, dep reach, start date, solution ref, optimization, engine, objective, timezone, revision, audit) and 8 more `project*` tables; 20 tables carry `project_id`; 25 indexes and 10 triggers name it                                                                                                        | the word for it                                        |
| The engagement level    | nothing; `organization` owns roots through `*_organization` side tables; `space` is a lens (ADR 0033)                                                                                                                                                                                                                                                                                           | `project` in the new sense                             |
| Settings                | columns on `project`; `calendar_marker.project_id`; `step.code` unique per project; `work_item_type` global per organization; `project_priority_band`, `project_team_capacity`, `project_resource_capacity` per project                                                                                                                                                                         | a catalogue, inheritance, provenance                   |
| Routes                  | 25 `/api/projects…` paths, 5 more with a `projects` segment (`/api/spaces/:id/projects…`, `/api/organization/projects/:id/rank`, `/api/organization/project-rank`), 39 operationIds naming `Project`, MCP tools derived from them                                                                                                                                                               | `/api/work-packages`, `/api/projects` in the new sense |
| Documents               | `PLAN_DOCUMENT_VERSION = 10` with top-level `project`; import classifier reads 1–10; `CANONICAL_PLAN_INPUT_SCHEMA_VERSION = 8` (saved-plan input, `CanonicalProject`); `SCHEDULE_BODY_SCHEMA_VERSION = 1`; `SCHEDULER_CONTRACT_VERSION = 17`; `SOLVER_WIRE_VERSION = 4`, whose wire names only `personId`/`resourceId`; in flight: budgets (#663) holds plan document 11 and saved-plan input 9 | the bumps                                              |
| Realtime                | gw-01 subscription `project:<id>` (presence rosters hang off it); events `project_settings_changed`, `project_changed`; fe-01 `lib/project-stream.ts`                                                                                                                                                                                                                                           | the renamed names                                      |
| Audit                   | `organization_audit.subject_kind` CHECK includes `project`; action `restricted_project_recovery`                                                                                                                                                                                                                                                                                                | a CHECK rebuild                                        |
| Non-additive migrations | lint forbids `RENAME COLUMN`, `DROP TABLE`, `DROP COLUMN`; `WAIVERS` keyed by folder with a required gate script; precedent `20260831120000_rename_role_to_step` gated by `bin/assert-no-prod-release.sh`; `backup-db-cli.ts` writes a verified snapshot (path, sha256, bytes, migrations)                                                                                                      | a waiver for a window that may have a prod release     |
| Deploy                  | dev: one container `wbs-dev-src`, migrates at boot, poller follows `main`; prod: blue/green image swap; the organization-activation runbook already stops the container, backs up and restarts                                                                                                                                                                                                  | a stop-the-world procedure for a rename                |
| Twilight readers        | Navigator `plan-reference.ts` reads `document.project.id` (fixtures v7–v10) and names `POST /api/projects/:id/commands`; Dash's and Burokrat's `projectId` are Nx project ids                                                                                                                                                                                                                   | a v12 reader                                           |
| puni-plan tooling       | no live script calls `/api/projects` (90 files mention it: RESUME, batch notes, evidence); the wbs-dev MCP client lists tools by name                                                                                                                                                                                                                                                           | nothing to build; names to relearn                     |

## Goals / Non-Goals

**Goals:** the old level is called work package on every surface at once; a project is the
engagement and owns its work packages; one configuration layering model with provenance
across organization → space → project → work package; spaces group projects and hold persons
and teams; dev data survives each slice; everything that breaks is named here.

**Non-Goals:** per-project access (`wbs-permissions`); a space-level override of anything;
budgets (`wbs-budgets`); cross-work-package dependencies themselves; any compatibility
layer, alias, redirect or dual-version writer.

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

- **E10. Allocated numbers.** Migration folders are
  `<merge-date>100000_rename_project_to_work_package` (slice 1),
  `<merge-date>100000_add_project` (slice 2), `<merge-date>100000_add_setting_value` and
  `<merge-date>100100_space_holds_projects_people_teams` (slice 3).
  _Stamps revised 2026-10-24 after review:_ each slice's migration is stamped with the real
  date it merges, never a future date, and newer than every folder applied on dev (checked
  that day). Reason: `libs/wbs/adapters/store-sqlite/src/migrate.ts` applies pending folders in
  sorted order and does not refuse a pending folder that sorts before an applied one, so a
  future stamp applied on dev before later real-dated migrations splits dev's order from a
  fresh database's order and can make the `--capture` rollback refuse. Newest on `main` today
  is `20261023100000_add_claim_lease`.
  Versions: `PLAN_DOCUMENT_VERSION` 12 (slice 1), 13 (slice 2), 14 (slice 3).
  _Plan document versions revised 2026-10-24 after review:_ the budgets change (#663,
  `wbs-measure-budgets`) holds version 11 (`PLAN_DOCUMENT_VERSION = 11`,
  `LEGACY_PLAN_DOCUMENT_VERSION = 10`) and lands first; this change keeps its v11 classifier
  branch and builds on it. `feat/cross-project-dependencies` is still at 10 and renumbers when
  it lands. The same branch also holds `CANONICAL_PLAN_INPUT_SCHEMA_VERSION = 9`, so the
  saved-plan input goes 9 → 10 at slice 1 and → 11 at slice 3 (assumed by the same reasoning;
  overturn with E10). `SOLVER_WIRE_VERSION` stays 4 (E26). `SCHEDULER_CONTRACT_VERSION` 17
  stays unless slice 1 changes a hashed byte (the canonical schedule input names no
  `projectId` today; task 1.3 proves it either way). Landing order (budgets #663 before slice
  1, `feat/cross-project-dependencies` renumbering after) is decided before slice 1 starts.
  Rejected: one document bump at the end (E4 wants slice 1 shipped renamed, and a document
  that still says `project` at the old level would be a dual vocabulary for weeks).
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
  head. _Review rule added 2026-10-24 after review:_ the mechanical commit is reproducible: the
  reviewer runs `tool-rename-work-package apply` on that commit's parent and the resulting
  diff is byte-identical to the commit; hand fixes (articles, plural grammar, sorted fields,
  prettier wrapping) go in a separate commit after it and are reviewed as an ordinary diff.
  Rejected: a one-off sed in a PR description (not
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
  gate (their migrations rebuild tables, E15/E20). Lint for slices 2 and 3: the compatible
  rebuild form (`-- migration-lint: compatible-table-rebuild` with `-- foreign-keys-off-rebuild`,
  a `_NEW` table and a `CHECK (violations = 0)` guard), whose `DROP TABLE` needs no waiver
  (`tools/tool-git-hooks/src/hooks/migration-lint.ts` lifts only the labels a `WAIVERS` entry
  names); a waiver with the same gate only if a `DROP COLUMN` or `RENAME COLUMN` statement
  remains. Rejected: running the rename under the
  blue/green swap (the outgoing colour would fail every query the instant the rename commits).
- **E15. Slice 2 storage.** `project(id PK, organization_id NOT NULL → organization, name NOT
NULL CHECK (length(name) > 0), revision, created_at NOT NULL, updated_at, created_by)` with
  `UNIQUE (organization_id, name)` and `UNIQUE (id, organization_id)`; born
  organization-aware like `space` (no side table). _Revised 2026-10-24 after review:_
  `created_by` is nullable, with the JSDoc "null = the migration back-fill (no actor)";
  reason: the back-fill has no actor and inventing one would be a made-up default (R5); every
  project created through `createProject` carries its real actor. `work_package.project_id NOT
NULL → project(id)` through a compatible table rebuild of `work_package` (lint form as in
  E14; `ADD COLUMN … NOT NULL` without a default is refused and a default would be a made-up
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
  cross-work-package dependencies exist / 409 `type_not_allowed_in_project { typeIds }` (E22)
  and 409 `step_code_not_in_project { codes }` (E21) from slice 3; an applied move re-keys the
  package's per-step rows to the target project's steps by code. Each write is one
  immediate transaction under the write coordinator, bumps the project's revision and
  appends one `organization_audit` row (`project_created`, `project_renamed`, `project_deleted`, `work_package_moved`; subject
  kind `project` in the new sense, unambiguous because slice 1 rewrote the old rows to
  `work_package`). Authority today: admin or super-admin for project writes; `moveWorkPackage`
  also needs edit on the work package (the restricted-owner rule); every member lists projects
  (E7's "plain membership sees nothing" arrives with `wbs-permissions`). mcp-01 derives the
  tools (`postApiProjects`, `postApiWorkPackagesByIdMove`, …). The work package read gains
  `projectId`; the plan document gains `project: { id, name }` at version 13, informational on
  import: the import request names the target project, never the file.
- **E18. The setting catalogue (E9).** `@wbs/domain` `settings/catalogue.ts`: `SETTING_CATALOGUE`
  entries `{ key, value (ArkType), definedAt: 'project', overridableAt: ReadonlySet<Level> }`
  for `timezone` (IANA zone; overridable at `work_package`), `pertWeights` (three positive
  numbers; `work_package`), `calendarMarkers` (a set, E19; `work_package`),
  `allowedWorkItemTypes` (a set of directory type ids, empty meaning all; fixed at project;
  E22); the step set is a project entity, not a setting (E21); `budgetFactor` is listed by
  name in the catalogue's JSDoc as reserved for `wbs-budgets` and gets its entry there (an
  entry without a value type is dead code). Levels: `organization | space | project | work_package`.
  Storage: `setting_value(scope_kind, scope_id, key, value_json, revision, created_at,
updated_at, created_by)` PK `(scope_kind, scope_id, key)`, `scope_kind` CHECK over the
  levels; a write of a key at a level the catalogue does not allow is refused at the boundary
  (`409 not_overridable_here`), and a value that fails the key's type is `422`. Resolution:
  `resolveSetting(chain, key)` in core, `chain: ScopeChain`, walks work package → project →
  spaces → organization → catalogue default and answers `{ value, provenance: { level, id } | { level: 'default' } }`; it refuses
  `ambiguous_space_value` when two spaces of the chain hold different values for a
  space-overridable key (inert today, E24). Reads: `GET /api/work-packages/:id/settings` and
  `GET /api/projects/:id/settings` answer every catalogue key resolved with provenance;
  writes: `PATCH …/settings { key: value | null }` where `null` clears the override (back to
  inherited). _Shared chain type, added 2026-10-24 after review:_ this change and
  `wbs-permissions` use one `ScopeChain` value type in `@wbs/domain`, `{ organizationId,
spaceIds, projectId, workPackageId? }`, defined by whichever change lands first (expected:
  `wbs-permissions` slice 1); `resolveSetting(chain, key)` (nearest wins, provenance
  `{ level, id }`) and `effectiveRoleAt(chain)` (strongest wins) both take it, so the chain
  is built once per request and never twice with different rules. Rejected: nullable columns
  per level (E9 names that as the thing not to do); a settings JSON blob per row (no per-key
  provenance or type).
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
- **E21. Steps are project entities.** _Revised 2026-10-24 after review (option a; was: a
  project-wide code vocabulary over per-work-package step rows, refusing a fresh code with
  `code_not_in_project`)._ The step set (code, name, order) is defined once on the project;
  a work package holds one row per project step for what genuinely differs per package, its
  allowance and its estimate unit, keyed by the project's step id. There is no second
  vocabulary table and no `code_not_in_project` refusal: creating, renaming or reordering a
  step is a project write, visible to every work package of the project at once. Reason: E6's
  "project-wide, not overridable" means one step vocabulary per engagement, which is also what
  #601's `twib validate workflow-binding --steps <codes>` wants (one list per engagement).
  Migration (slice 3): for each default project, today's per-work-package steps are lifted
  into project steps deduplicated by code in first-occurrence order (work packages by
  `created_at` then id, then steps by order; the first occurrence's name wins); each
  package's allowance and estimate-unit rows, its step nodes, estimates, attempts and claims
  are re-keyed to the project step of the same code. `moveWorkPackage` refuses
  `step_code_not_in_project { codes }` while the target lacks a code the package uses, and
  re-keys by code when it applies. Merging step rows across work packages is thereby
  decided, not a non-goal.
- **E22. Work item types stay directory-global; a project allows a subset.** _Revised
  2026-10-24 after review (was: project-scoped types with `work_item_type.project_id`)._
  Types stay named globally and unique across the directory (`CONTEXT.md`), directory
  commands stay organization-level and #699's matrix is unchanged. The project holds an
  allow-list of directory type ids as the `allowedWorkItemTypes` setting resolved through
  `resolveSetting` (E18), fixed at project; an empty list allows every type. Assigning a type
  outside the list on create or update, and `moveWorkPackage` into a project whose list lacks
  a type a work item of the package carries, refuse `409 type_not_allowed_in_project
{ typeIds }`. Back-fill: no row (every default project allows all). ADR 0009 (a type does
  not inherit) is untouched. Rejected: project-scoped types (it splits one directory word into
  one per project and breaks the organization-level directory commands).
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
- **E26. The solver wire carries no project id.** _Revised 2026-10-24 after review (was: the
  wire renames `projectId`, `SOLVER_WIRE_VERSION` 4 → 5, a solver image rebuild and repin)._
  On `main`, `solver-wire.v4.json` names only `personId` and `resourceId`; the `projectId` is
  host-side, `ElsewhereBooking.projectId` in `libs/wbs/domain/domain/src/schedule.ts`, and the
  script renames it like any TypeScript identifier. `SOLVER_WIRE_VERSION` stays 4, solver-py
  is unchanged and no image is rebuilt or repinned; the existing golden request test proves
  the wire bytes are unchanged after `apply`.
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
| realtime adapter + other adapters                 |    22 |     37 | script; the solver wire is untouched (E26)                                              |
| be-01 `src` and tests                             |   186 |  4,108 | script                                                                                  |
| gw-01                                             |    26 |    237 | script; `work-package:<id>`                                                             |
| mcp-01                                            |    15 |     77 | script; tool names follow operationIds; its own store names no project                  |
| fe-01                                             |   341 |  3,319 | script; `modules/project` → `modules/work-package` (indexed README), stream, preference |
| twilight-structure                                |   106 |    833 | Navigator only (reader, JSDoc, README, a v12 fixture); the rest is Nx-ish               |
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

- Version 11 is the budgets change's (#663, E10); its classifier branch is preserved.
- Version 12 (slice 1): top-level `project` → `workPackage`, every nested `projectId` →
  `workPackageId`; the classifier reads 1–12 and converts a ≤ 11 file's `project` on read as
  it converts 7's zone or 10's resources; export writes 12 only; `unsupported_version` for
  13+. Navigator reads 12 and keeps 7–11.
- Version 13 (slice 2): adds `project: { id, name }` of the engagement, informational.
- Version 14 (slice 3): `workPackage.settings` carries each catalogue key as `{ value,
provenance }`; import writes only the work package's own overrides and leaves inherited
  values inherited.
- Saved plans: `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` 9 (budgets) → 10 (`CanonicalProject` →
  `CanonicalWorkPackage`, keys renamed; a stored ≤ 9 body upgrades on read), → 11 at slice 3
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
step set as a project entity and the project's work item type allow-list.

## Spaces (e)

E23–E24.

## What breaks (f)

- Every `/api/projects…` route, 39 operationIds and therefore every MCP tool name; clients
  re-list tools (the wbs-dev MCP client, Navigator's documentation, puni-plan notes).
- `project:<id>` subscriptions and the two event names; an old fe-01 tab reconnects to
  nothing and must reload.
- Plan documents: an exported file is version 12; the running import still reads older files.
- Saved plans read through the upgrade to 10; nothing is lost.
- Navigator: `document.project.id` becomes `document.workPackage.id` at 12; the v7–v11
  readers stay. Dash and Burokrat: nothing (their `projectId` is Nx's).
- The solver wire: nothing (E26).
- fe-01: the remembered open work package is forgotten once.
- `feat/cross-project-dependencies` rebases onto the new names; it is still at plan document
  10 and renumbers past this change's versions when it lands (E10).
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
- E21 changes authoring flows (adding, renaming or reordering a step is a project write
  that every work package of the project sees); E22 adds one refusal on type assignment
  when a project narrows its allow-list. Both revised after review; flagged for Dany.
- Whether prod records a release could not be read from this machine; the gate decides on the
  day, and the procedure covers both outcomes.

## Open Questions

- E5's deletion list: Dany confirms the owner logins and name patterns in E27 before `apply`.
- The dependency shape of `feat/cross-project-dependencies` was skimmed read-only (abbreviation
  side table, stable endpoint identities, typed external rows); its rebase is that branch's
  work.
