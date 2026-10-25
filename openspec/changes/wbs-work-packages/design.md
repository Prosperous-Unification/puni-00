## Context

Read on 2026-10-24 on `main` at `1de277850` (fresh worktree; counts are `git grep` on that
tree, the schema is the be-01 migrations applied in memory in order, all of them cleanly).
_Re-derived 2026-10-24 after the Fable review (WP-6) on `origin/main` at `0b1dddaa0`:_ 93
migrations, newest `20261023170000_add_work_item_budget`; the table rows below carry those
counts (schema from the 93 migrations applied in memory; routes and operationIds from the
document `emit-openapi-cli.ts` writes). Every count in this design is **indicative**:
`tool-rename-work-package report` re-derives it on the slice 1 branch, and that output, not
this table, is what slice 1 is reviewed against.

| Need                    | Exists today                                                                                                                                                                                                                                                                                                                                                                    | Missing                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| The old level           | `project` (23 columns: name, owner, restricted, estimate method, PERT weights, rounding, dep reach, start date, solution ref, optimization, engine, objective, timezone, budget factor, revision, audit) and 8 more `project*` tables; 19 tables carry `project_id`; 25 indexes and 9 triggers carry it in their name, 16 triggers name it in their body                        | the word for it                                        |
| The engagement level    | nothing; `organization` owns roots through `*_organization` side tables; `space` is a lens (ADR 0033)                                                                                                                                                                                                                                                                           | `project` in the new sense                             |
| Settings                | columns on `project`; `calendar_marker.project_id`; `step.code` unique per project; `work_item_type` global per organization; `project_priority_band`, `project_team_capacity`, `project_resource_capacity` per project                                                                                                                                                         | a catalogue, inheritance, provenance                   |
| Routes                  | 27 `/api/projects…` paths (among them `/api/projects/:id/budget-headroom`), 4 more `/api` paths with a `projects` segment (`/api/spaces/:id/projects…` ×3, `/api/organization/projects/:id/rank`), 2 `/internal/gateway/projects/:projectId/…` paths, plus `/api/organization/project-rank`; 40 operationIds containing `Project`; 91 MCP tools derived from them               | `/api/work-packages`, `/api/projects` in the new sense |
| Documents               | `PLAN_DOCUMENT_VERSION = 11` (budgets, #663, merged) with top-level `project` carrying `settings.budgetFactor`; import classifier reads 1–11; `CANONICAL_PLAN_INPUT_SCHEMA_VERSION = 9` (saved-plan input, `CanonicalProject`); `SCHEDULE_BODY_SCHEMA_VERSION = 1`; `SCHEDULER_CONTRACT_VERSION = 17`; `SOLVER_WIRE_VERSION = 4`, whose wire names only `personId`/`resourceId` | the bumps                                              |
| Realtime                | gw-01 subscription `project:<id>` (presence rosters hang off it); events `project_settings_changed`, `project_changed`; fe-01 `lib/project-stream.ts`                                                                                                                                                                                                                           | the renamed names                                      |
| Audit                   | `organization_audit.subject_kind` CHECK includes `project`; action `restricted_project_recovery`                                                                                                                                                                                                                                                                                | a CHECK rebuild                                        |
| Non-additive migrations | lint forbids `RENAME COLUMN`, `DROP TABLE`, `DROP COLUMN`; `WAIVERS` keyed by folder with a required gate script; precedent `20260831120000_rename_role_to_step` gated by `bin/assert-no-prod-release.sh`; `backup-db-cli.ts` writes a verified snapshot (path, sha256, bytes, migrations)                                                                                      | a waiver for a window that may have a prod release     |
| Deploy                  | dev: one container `wbs-dev-src`, migrates at boot, poller follows `main`; prod: blue/green image swap; the organization-activation runbook already stops the container, backs up and restarts                                                                                                                                                                                  | a stop-the-world procedure for a rename                |
| Twilight readers        | Navigator `plan-reference.ts` reads `document.project.id` (fixtures v7–v10) and names `POST /api/projects/:id/commands`; Dash's and Burokrat's `projectId` are Nx project ids                                                                                                                                                                                                   | a v12 reader                                           |
| puni-plan tooling       | no live script calls `/api/projects` (90 files mention it: RESUME, batch notes, evidence); the wbs-dev MCP client lists tools by name                                                                                                                                                                                                                                           | nothing to build; names to relearn                     |

## Goals / Non-Goals

**Goals:** the old level is called work package on every surface at once; a project is the
engagement and owns its work packages; one configuration layering model with provenance
across organization → space → project → work package; spaces group projects and hold persons
and teams; dev data survives each slice; everything that breaks is named here.

**Non-Goals:** per-project access (`wbs-permissions`); a space-level override of anything;
budgets themselves (`wbs-measure-budgets`, merged; this change only moves its budget factor
to the project, E18 and E20); cross-work-package dependencies themselves; any compatibility
layer, alias, redirect or dual-version writer.

## Decisions

### Owner decisions (Dany, 2026-10-23/24; not reopened here)

- **E1. Space stays purely organizational.** A grouping of projects with no authority.
  Organization configuration overridable per space is a later non-goal. _Amended
  2026-10-24 after the Fable review (WP-9):_ the belonging of persons and teams to spaces
  was planner content and moved to E31.
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
  enabling a space override later is a per-setting flag, not a redesign. Settings are not
  ad-hoc columns per level. Per-setting table: timezone, calendar markers, PERT weights
  overridable at work package; step codes, work item types, budget factor fixed at project;
  nothing overridable at space. Slice 1's migration is unchanged by E9. _Amended 2026-10-24
  after the Fable review (WP-9):_ the catalogue and `resolveSetting` shape was planner
  content and moved to E32.

### Assumed decisions (E10 onward; each the reading closest to E1–E9; Dany overturns by id)

- **E10. Allocated numbers.** Migration folders are
  `<merge-date>100000_rename_project_to_work_package` (slice 1),
  `<merge-date>100000_add_project` and `<merge-date>100100_widen_organization_audit_projects`
  (slice 2), `<merge-date>100000_add_setting_value` and
  `<merge-date>100100_space_holds_projects_people_teams` (slice 3a),
  `<merge-date>100000_lift_steps_to_project` (slice 3b). _Slice 3 split 2026-10-24 after the
  Fable review (WP-3):_ 3a is settings, markers and spaces; 3b is steps as project entities
  (E21), the riskiest re-key, in its own window.
  _Stamps revised 2026-10-24 after review:_ each slice's migration is stamped with the real
  date it merges, never a future date, and newer than every folder applied on dev (checked
  that day). Reason: `libs/wbs/adapters/store-sqlite/src/migrate.ts` applies pending folders in
  sorted order and does not refuse a pending folder that sorts before an applied one, so a
  future stamp applied on dev before later real-dated migrations splits dev's order from a
  fresh database's order and can make the `--capture` rollback refuse. Newest on `main` at
  `0b1dddaa0` is `20261023170000_add_work_item_budget` (93 folders; WP-6).
  Versions: `PLAN_DOCUMENT_VERSION` 12 (slice 1), 13 (slice 2), 14 (slice 3a); slice 3b
  bumps nothing unless its task proves a document or hashed byte changes.
  _Plan document versions revised 2026-10-24 after review:_ the budgets change (#663,
  `wbs-measure-budgets`) holds version 11 (`PLAN_DOCUMENT_VERSION = 11`,
  `LEGACY_PLAN_DOCUMENT_VERSION = 10`) and has landed on `main` (`1bb1cb392`); this change
  keeps its v11 classifier branch and builds on it. `feat/cross-project-dependencies` is still at 10 and renumbers when
  it lands. The same branch also holds `CANONICAL_PLAN_INPUT_SCHEMA_VERSION = 9`, so the
  saved-plan input goes 9 → 10 at slice 1 and → 11 at slice 3a (assumed by the same reasoning;
  overturn with E10). `SOLVER_WIRE_VERSION` stays 4 (E26). `SCHEDULER_CONTRACT_VERSION` 17
  stays unless slice 1 changes a hashed byte (the canonical schedule input names no
  `projectId` today; task 1.3 proves it either way). Landing order: budgets #663 before slice
  1 (done, merged), `feat/cross-project-dependencies` renumbering after.
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
  last is replaced again in slice 3a, E23); core module `module/project` → `module/work-package`
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
  _Exclusions added 2026-10-24 after the Fable review:_ (WP-2) **identifiers already in the
  new sense**, which `wbs-permissions` slices 1–2 land before this slice 1: the
  `ScopeChain { organizationId, spaceIds, projectId, workPackageId? }` value type and every
  read of its `projectId`, the permission ids `organization.create_project` and `project.*`
  (`project.read`, `project.manage_packages`, …), the project role names, the access target
  `{ kind: 'project'; chain }` and grant rows whose scope kind is `project`, plus anything
  else those slices add (listed from their landed code on the slice 1 branch); each is a
  per-line pattern in `allow-list.ts` (E12), never a path exclusion. (WP-13) the solver wire
  schemas `libs/wbs/domain/contracts/solver/solver-wire.v1–v4.json` and their byte-identical
  copies under `libs/wbs/adapters/solver-py/src/wbs_solver/`: "project" appears in their
  `$comment` strings only (v4 lines 149, 156, 304, 318), and rewriting the solver-py copy
  would change solver-py, which E26 keeps untouched; the comments are reworded with the next
  wire version. (WP-8) the scenario ids `[PROJECT-ASSIGNMENT-READS-00n]`, which tests in
  store-sqlite and core cite by id.
- **E12. The rename is a committed, rerunnable script**: Nx project `tool-rename-work-package`
  under `tools/tool-rename-work-package/` with `src/rename-map.ts` (the map above, as data),
  `src/allow-list.ts` (excluded paths and per-line patterns, as data), and `src/cli.ts` with
  three modes: `apply` (path moves through `git mv`, then content replacement file by file,
  idempotent), `check` (exit 1 listing every residual match of
  `\bprojects?\b|projectId|ProjectId|project_id` outside the allow-list, with path and line),
  `report` (the inventory table below, regenerated). Tests: the map's families are consistent
  (every key has all five spellings and none collides with an existing identifier); `check`
  fails on an injected residual in a non-excluded file and passes on an excluded one (R5
  negative, watched); `apply` twice equals `apply` once. _New-sense rule added 2026-10-24
  after the Fable review (WP-2):_ `allow-list.ts` carries, beside excluded paths, per-line
  patterns for identifiers already in the new sense (E11's list); `apply` leaves a matching
  line untouched (so `ScopeChain.projectId` never becomes a second `workPackageId`) and
  `check` does not report it (so `check` can reach exit 0). The rename-map test asserts that
  each listed pattern still matches at least one line of the tree, so a pattern outlived by
  its code fails the test instead of silently widening the allow-list. The reviewer reruns `check` on the PR
  head. _Review rule added 2026-10-24 after review:_ the mechanical commit is reproducible: the
  reviewer runs `tool-rename-work-package apply` on that commit's parent and the resulting
  diff is byte-identical to the commit; hand fixes (articles, plural grammar, sorted fields,
  prettier wrapping) go in a separate commit after it and are reviewed as an ordinary diff.
  Rejected: a one-off sed in a PR description (not
  rerunnable, not testable).
- **E13. Slice 1 migration.** One `migration.sql`: `ALTER TABLE … RENAME TO` for the nine
  tables, `ALTER TABLE … RENAME COLUMN project_id TO work_package_id` for the nineteen, `DROP
INDEX`/`CREATE INDEX` and `DROP TRIGGER`/`CREATE TRIGGER` for the 25 indexes and 9
  triggers whose name carries `project`, under their new names (the bodies of all 16 triggers
  that name `project` follow SQLite's own rename rewriting; task 1.3 asserts no index or
  trigger in `sqlite_master` still names `project` in name or body; counts per WP-6 at
  `0b1dddaa0`, re-derived by `report`), a rebuild of `organization_audit` with the renamed CHECK
  vocabulary (the `widen_organization_audit_*` shape) and `UPDATE`s of its `subject_kind` and
  `action` values; a `CHECK (violations = 0)` guard table refuses while any work package lacks
  an organization row. Stored JSON is not rewritten: `command_journal` and `plan_event` keep
  their payloads (their `project_id` is a column), and the saved-plan input body stays
  at schema ≤ 9 bytes (`saved_plan_body.bytes`, kind `input`) read through a new 9 → 10 upgrade step in the saved-plan reader (the
  established reader-side chain; a stored body is not rewritten here, and only slice 3b's
  step-id rewrite (E33) ever touches one; corrected 2026-10-24,
  WP-5, to agree with E10). Task 1.3 proves by
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
  backup plus a redeploy of the previous release. Slices 2, 3a and 3b reuse the window and the
  gate (their migrations rebuild tables, E15/E20/E21). Lint for slices 2, 3a and 3b: the compatible
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
  owner, R5). Back-fill inside the migration: for every organization, empty ones included
  (E30; was: only organizations holding a work package), one project named "Default
  project" with a fresh uuid, recorded as that organization's default project (E30), then
  every work package of that organization points at it; a guard refuses while any work
  package lacks an organization row. Trigger pair `work_package_project_organization_insert/update` refuses a work package
  whose project belongs to another organization than its `work_package_organization` row (the
  `claim_step_project_*` device). `down.sql` refuses while any organization holds a project
  other than its default project, then rebuilds `work_package` without the column and drops
  `organization_default_project` and `project`. Ids are uuids generated in SQL the way the
  organization back-fill did (task 3.1 verifies the precedent). _Revised 2026-10-24 by E30:_
  the default project is marked, through `organization_default_project` (E30), and nothing
  else about it is special.
- **E16. Projects are ordinary; deletion refuses while packages remain.** _Narrowing replaced
  2026-10-24 by E30 (WP-4); was: no default project after the back-fill, no project for a
  new organization, and `createWorkPackage` requiring `projectId` with `422` when absent._
  A project is renamed, moved out of and deleted like any other; `deleteProject` refuses
  `409 not_empty` naming the work package ids while any remain. `createWorkPackage` and the
  import routes take an optional `projectId`: absent lands the package in the organization's
  default project (E30), foreign answers `404`. Rejected: a `kind = 'default'` column on
  `project` (one more thing permissions would have to reason about, E7); E30's side table
  keeps the mark on the organization, where it is organization state.
- **E17. Project commands are organization-level HTTP routes, not plan-command batch
  commands** (batches are per work package). `POST /api/projects {name}` → 201 / 409
  `name_taken`; `GET /api/projects` (the caller's organization, with work package counts);
  `GET /api/projects/:id` (its work package entries); `PATCH /api/projects/:id {name}` → 200 /
  409 `name_taken` / 404; `DELETE /api/projects/:id` → 204 / 409 `not_empty` / 409
  `last_project` (the organization's only project, E30) / 404; `PATCH
/api/organization/default-project {projectId}` → 200 / 404 (E34); `POST
/api/work-packages/:id/move {projectId}` → 200 / 404 (either side, organization-scoped) /
  409 `cross_organization` / 409 `dependency_crosses_project { dependencyIds }` once
  cross-work-package dependencies exist / 409 `type_not_allowed_in_project { typeIds }` (E22)
  and 409 `step_code_not_in_project { codes }` (E21) from slice 3b; an applied move re-keys the
  package's per-step rows to the target project's steps by code. Each write is one
  immediate transaction under the write coordinator, bumps the revision of every project it
  writes by one (a move writes two: the source and the target; corrected 2026-10-24, WP-11,
  to agree with the spec's "both revisions") and appends one `organization_audit` row
  (`project_created`, `project_renamed`, `project_deleted`, `work_package_moved`,
  `default_project_changed` (E30); subject kind `project` in the new sense, unambiguous
  because slice 1 rewrote the old rows to `work_package`). _Audit vocabulary migration added
  2026-10-24 after the Fable review (WP-7):_ slice 1's `organization_audit` rebuild removes
  `project` from the `subject_kind` CHECK, so slice 2 ships
  `<merge-date>100100_widen_organization_audit_projects` in the `widen_organization_audit_*`
  compatible-rebuild shape, re-admitting subject kind `project` and adding those five
  actions; before it an insert of `project_created` is refused by the CHECK (task 3.1's R5
  negative). Authority today: admin or super-admin for project writes; `moveWorkPackage`
  also needs edit on the work package (the restricted-owner rule); every member lists projects
  (E7's "plain membership sees nothing" arrives with `wbs-permissions`). mcp-01 derives the
  tools (`postApiProjects`, `postApiWorkPackagesByIdMove`, …). The work package read gains
  `projectId`; the plan document gains `project: { id, name }` at version 13, informational on
  import: the import request names the target project, or names none and lands in the
  default project (E30), never the file.
- **E18. The setting catalogue (E9).** `@wbs/domain` `settings/catalogue.ts`: `SETTING_CATALOGUE`
  entries `{ key, value (ArkType), definedAt: 'project', overridableAt: ReadonlySet<Level> }`
  for `timezone` (IANA zone; overridable at `work_package`), `pertWeights` (three positive
  numbers; `work_package`), `calendarMarkers` (a set, E19; `work_package`),
  `allowedWorkItemTypes` (a set of directory type ids, empty meaning all; fixed at project;
  E22), `budgetFactor` (a positive number ≤ 1000, the bound of today's `budget_factor`
  CHECK; catalogue default 1; fixed at project, overridable nowhere; E6); the step set is a
  project entity, not a setting (E21). _`budgetFactor` added 2026-10-24 after the Fable
  review (WP-1); was: reserved by name for a budgets change under a name that does not exist. The
  merged change is `wbs-measure-budgets` (#663); its `budget_factor` column on today's
  `project` becomes `work_package.budget_factor` in slice 1 and moves to the project in slice
  3a (E20)._ The budgets surfaces ride the rename like any other: `GET
/api/projects/:id/budget-headroom` becomes `GET /api/work-packages/:id/budget-headroom` in
  slice 1, `work_item_budget` keeps its name (it is per work item) and its
  `project_organization_keys_work_item_budgets` trigger is renamed with the others; from
  slice 3a the headroom read resolves `budgetFactor` through `resolveSetting` instead of
  reading a column. Levels: `organization | space | project | work_package`.
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
  _Generalised 2026-10-25 by Dany:_ multi-day ranges with scheduling kinds, at every level,
  are designed in `openspec/changes/wbs-calendar-ranges`; slice 3a still ships point markers.
- **E20. What the slice 3a migration lifts.** `work_package.timezone` and the three
  `pert_weight_*` columns move into `setting_value` rows at the work package level **only
  where the stored value differs from the catalogue default** (`UTC`; 1, 4, 1); equal values
  get no row and read as inherited from the default. No project-level row is invented: the
  default project cannot be given the "right" zone when its work packages disagree, and the
  curated regrouping lifts values to projects by hand afterwards. Every work package reads
  exactly the value it read before. _Budget factor added 2026-10-24 after the Fable review
  (WP-1):_ `work_package.budget_factor` is fixed at project (E6), so it cannot stay a
  work-package override; the migration lifts it to its project: where every work package of
  a project holds the same value, that value becomes one project-level row (none when it is
  the catalogue default 1); where they disagree, a `CHECK (violations = 0)` guard refuses the
  migration naming the project, and the runbook's precondition is that the operator sets one
  value across that project's packages before the window (a project is never given a
  made-up value). Every work package reads exactly the value it read before. The columns
  (timezone, PERT weights, budget factor) are then dropped (table rebuild, slice 3a's
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
  Migration (slice 3b, `<merge-date>100000_lift_steps_to_project`; _re-keying enumerated
  2026-10-24 after the Fable review, WP-3_): for each project (by then the default projects
  and whatever the curated regrouping made), today's per-work-package steps are lifted into
  project steps deduplicated by code in first-occurrence order (work packages by
  `created_at` then id, then steps by order; the first occurrence's name wins, and the first
  occurrence's step id becomes the project step's id, so its rows need no re-key).
  Storage: `step` is rebuilt keyed by `project_id` (new sense) with `UNIQUE (project_id,
code)` and `UNIQUE (project_id, name)`; the per-package columns move to
  `work_package_step(work_package_id, step_id → step(id), allowance_bps,
allowance_revision, estimate_unit)` with PK `(work_package_id, step_id)`, one row per
  project step per package (a step added later gets allowance 0 and the column default
  `workdays` unit for every package). **Every column holding a step id** is re-keyed from
  the merged step id to the kept first-occurrence id, by `UPDATE` through a map the
  migration builds in a `TEMP` table and drops before it commits: the twelve tables with a
  foreign key to `step(id)` on `main` at `0b1dddaa0` (`actual`, `assignment`, `claim`,
  `estimate`, `measure_estimate`, `step_blockage`, `step_measure`, `step_node_attempt`,
  `step_node_attempt_issued`, `step_parallel`, `step_progress`, and `typed_dependency` on
  both `predecessor_step_id` and `successor_step_id`), plus `plan_event.step_id` (a column
  without a foreign key). The map is injective inside one work package (codes are unique per
  package today, `step_project_code`), so no per-work-item unique key can collide. _Stored
  JSON revised 2026-10-24 by E33 (was: a permanent `step_lift_alias` table read at replay):_
  the same migration rewrites, once, every step id inside `command_journal.payload` and
  `command_journal.inverse` and inside saved-plan input bodies (`saved_plan_body.bytes`,
  kind `input`) with `json_set`, the device E13 already names, mapping each lifted id to the
  kept id; a payload whose shape the rewrite does not recognise makes the migration refuse
  through its `CHECK (violations = 0)` guard naming the journal row id or saved-plan id,
  never passing it through unchanged (R5). After the window no reader knows a step was ever
  merged. Rollback is the pre-deploy backup (`wbs-measure-budgets` D72, E14), not `down.sql`
  reversing the rewrite. Rejected: the permanent alias table (every journal replay and
  saved-plan read would depend on a table forever, and it is the alias the Non-Goals rule
  out). The six triggers that compare
  a step's owner with the work item's package (`claim_step_*`, `step_blockage_owner_*`,
  `step_parallel_owner_*`, under their slice 1 names) are dropped and recreated to require
  that the step belongs to the project of the work item's work package. **Code-less and
  clashing steps:** `step.code` is nullable; a `CHECK (violations = 0)` guard refuses the
  migration naming each work package that holds a step without a code, and, for two
  distinct codes carrying one name in a project, refuses `step_name_clash { projectId, name,
codes, workPackageIds }` naming the project and the packages holding them; the runbook precondition is
  `backfill-step-codes-cli.ts` (codes) and a hand rename (names) before the window. Import
  into a project adds the file's codes the project lacks as project steps (appended in file
  order) and takes the project's name and order for the codes it has; the new package's
  rows carry the file's allowance and unit. `moveWorkPackage` refuses
  `step_code_not_in_project { codes }` while the target lacks a code the package uses, and
  re-keys by code when it applies. Merging step rows across work
  packages is thereby decided, not a non-goal.
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
- **E23. Spaces hold projects; persons and teams belong to spaces.** Slice 3a replaces
  `space_work_package` with `space_project(space_id, project_id, organization_id, position,
…)` → `project(id, organization_id)`, back-filled by mapping each space's work packages to
  their projects, deduplicated, keeping first-occurrence order; `space_work_package` is then
  dropped. Routes go `/api/spaces/:id/work-packages…` (slice 1) → `/api/spaces/:id/projects…`
  (slice 3a, new sense; a second break, stated). `GET /api/spaces/:id/roll-ups` answers one row
  per project folded from its work packages' roll-ups (earliest start, latest finish, summed
  days and counts, folded status) with the work package rows beneath; `in-progress` keeps its
  meaning over the space's projects' work packages; the `all` space is the caller's projects.
  Belonging: `space_person(space_id, person_id, organization_id, created_*)` and
  `space_team(space_id, service_team_id, organization_id, created_*)`, `POST`/`DELETE
/api/spaces/:id/people/:personId` and `/teams/:teamId`, listed in the space read; no effect
  on access, capacity or scheduling (E1, E31). Rejected: a polymorphic `space_member(kind, id)`
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
  owner's `users.username` is one of `claire-qa-22aug`, `planner-qa-0822`, `ada` or matches
  `^claire-reg-`, **or** its name matches `^TASK-\d+\b`, `^New project$` or
  `^resume check \d+$`. _Wording fixed 2026-10-24 after the Fable review (WP-12):_ the table
  is `users` and the column `username`. `New project` is fe-01's placeholder name
  (`PLACEHOLDER_PROJECT_NAME` in `project-page.tsx`) given to every package created from the
  page and never renamed, so the pattern dooms every such untouched package, real or not;
  the runbook says so and Dany reads the list before `apply`. Slice 1's script renames the
  placeholder to `New work package`, so packages created after slice 1 do not match. `report` prints the doomed list (id, name, owner, counts) and the
  survivors; `apply` refuses unless `--expect-count` equals the report's count (a changed
  dataset refuses) and deletes through the existing work-package deletion path, in one
  transaction per work package, after `backup-db-cli.ts`. It runs after slice 1 is deployed
  and before slice 2's window. The survivors' regrouping is a list of `moveWorkPackage` calls
  in the runbook with ids filled in on the day; the four project names come from E5.
- **E28. fe-01.** Words and module names through the script; no URL changes (there is no
  `/projects` URL; the open work package is a remembered preference). Slice 2 adds a project
  group to the picker and a projects page; slice 3a shows provenance in the settings modal
  ("inherited from project X") and a "clear override" control; the spaces page lists projects
  with their work packages, persons and teams.
- **E29. The synced specs under `openspec/specs/`** (10 files, 80 lines, and the folder
  `project-assignment-reads`) take the new vocabulary in the slice 1 PR, by hand, with
  `openspec validate --all --json` output recorded in slice 1's `verify.md`; archived changes
  are never edited. This change's delta spec is `work-packages` only. _Revised 2026-10-24
  after the Fable review (WP-8); was: renamed when this change is archived._ Reason for the
  hand sync over `## RENAMED`/`## MODIFIED` blocks, tried on this tree: a probe generated
  RENAMED and MODIFIED blocks for the 23 old-sense requirements of those ten specs (the
  three Nx-sense requirements of `core-lib-extraction` left out) and `openspec validate
wbs-work-packages` refused six of them, because a MODIFIED block cannot rename a
  scenario ("omits scenario(s) the current spec still has"), and seven scenario titles say
  "project" in the old sense; a capability folder (`project-assignment-reads`) and a
  `## Purpose` paragraph have no delta operation at all; and a MODIFIED block replaces the
  whole requirement at archive, so a copy written now would silently revert whatever another
  change syncs into those requirements before archive. The slice 1 PR therefore edits
  `openspec/specs/**` in place (in the script's scope, with the scenario ids allow-listed,
  E11), moves `project-assignment-reads` to `work-package-assignment-reads` with `git mv`,
  and this change's archive syncs only `work-packages`.

### Assumed decisions added after the Fable reviews (2026-10-24)

- **E30. Every organization has exactly one default project** (resolves WP-4, replaces E16's
  narrowing; **awaits Dany's confirmation**). Every organization has exactly one default
  project. Organization activation creates it (`organization-activation-cli.ts` and the
  onboarding path), and the slice-2 backfill creates one for EVERY existing organization,
  empty ones included. `POST /api/work-packages` and the import routes without `projectId`
  land the package in the default project (it is explicit organization state, not an
  unknown default, so R5 holds); the default project cannot be deleted while it holds
  packages or is the only project. _Planner's detail (assumed, overrulable with E30):_ the
  mark is `organization_default_project(organization_id PK → organization, project_id NOT
NULL UNIQUE, FOREIGN KEY (project_id, organization_id) → project(id, organization_id))`,
  written in the same transaction as the organization in all three store paths that create
  one (`OrganizationRepository.createForUnaffiliatedUser`, `OnboardingRepository` and
  `organization-legacy-activation.ts` behind the activation CLI), with the name "Default
  project" and the creating actor as `created_by`; a read that finds an organization without
  the row throws (missing trusted state, R5), never picks a project. Deleting the default
  answers `409 not_empty` while it holds packages and `409 last_project` while it is the only
  project; deleting an empty default while other projects exist hands the mark to the oldest
  remaining project (`created_at`, then id) in the same transaction and appends
  `default_project_changed`. Choosing another default is E34's explicit route; the hand-over
  on deletion is only the fallback. Callers verified to work with the default project (tasks 3.3,
  3.5): fe-01's create (`project-page.tsx`, "New project" with no picker) and import
  (`apps/wbs/fe-01/src/components/wbs/import-with-ai.ts`, `src/lib/wbs-api.ts`), mcp-01's import tool (`postApiProjectsImport`, renamed
  `postApiWorkPackagesImport` by slice 1), the activation CLI, the onboarding route, and the
  e2e seeding (`apps/wbs/fe-01/e2e/create-project.ts` and the be-01 test harnesses that
  insert organizations by SQL: `organization-harness.ts`, `booted-browser-process.ts`,
  `measure-bound-claims.ts`, `capacity-fanout-process.ts`, store-sqlite's
  `testing/space-database.ts`, which must write the mark too). `wbs-permissions` P16 gates
  creation without naming a project; `wbs-permissions` slice 3's check at the named project applies to the
  resolved project (named or default), cross-referenced here, not edited.
- **E31. Persons and teams belong to spaces** (resolves WP-9; moved out of E1). A person or
  team may belong to one or several spaces (new, cheap link). The link carries no authority,
  capacity or scheduling effect (E1); its storage and routes are E23's.
- **E33. The step lift rewrites stored JSON once; no alias table** (session decision
  2026-10-24, on the Fable re-check of #714). Slice 3b's migration rewrites step ids in
  `command_journal.payload`/`inverse` and saved-plan input bodies with `json_set`, refusing
  on an unrecognised payload shape naming the row; the permanent `step_lift_alias` table is
  rejected as the compatibility layer the Non-Goals forbid. Detail in E21.
- **E34. The default project is chosen by an explicit route** (session decision 2026-10-24,
  on the Fable re-check of #714). `PATCH /api/organization/default-project { projectId }`
  moves the mark to another project of the caller's organization (`404 not_found` for a
  project of another organization or none), in one immediate transaction appending
  `default_project_changed`; it is the normal way to change the default, and E30's
  hand-over on deleting an empty default stays as the fallback. Authority: the
  organization-settings permission of `wbs-permissions`; its matrix has no fitting row
  today (the nearest, `organization.manage_capacity_mode`, guards only
  `switchCapacityMode`), so `wbs-permissions` must add a row; until it lands, admin or
  super-admin as for the other project writes (E17).
- **E32. The settings catalogue and `resolveSetting`** (resolves WP-9; moved out of E9).
  Settings are a small catalogue (key, value type, overridable-at levels) and one
  `resolveSetting(scope, key)` in core; E18 gives the catalogue's entries and storage and
  the shared `ScopeChain` it resolves over.

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
| contracts                                         |    63 |    356 | script; 33 + 1 paths, 40 operationIds, document and saved-plan shapes, versions         |
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
| openspec/specs                                    |    10 |     80 | by hand in the slice 1 PR (E29)                                                         |
| openspec/changes (non-archive)                    | 1,429 |  8,537 | untouched (history)                                                                     |
| openspec/changes/archive                          |   369 |  2,039 | untouched                                                                               |
| **Code surfaces the script rewrites** (rows 2–12) | 1,243 | 14,782 |                                                                                         |
| **Whole tree**                                    | 3,701 | 33,804 |                                                                                         |

Case-sensitive identifier families outside the archive: `projectId` 935 files / 11,263
lines; `project_id` 210 / 1,043; `Project` 324 / 842; `projects` 1,211 / 6,213. The live
schema: 9 `project*` tables, 20 `project_id` columns, 25 indexes, 10 triggers (at
`1de277850`; at `0b1dddaa0`: 9 tables, 19 columns, 25 indexes, 9 triggers by name and 16 by
body, WP-6). The per-surface table above was not re-summed at `0b1dddaa0`; it is indicative,
and `report` re-derives it on the slice 1 branch.

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
- Version 14 (slice 3a): `workPackage.settings` carries each catalogue key as `{ value,
provenance }`; import writes only the work package's own overrides and leaves inherited
  values inherited.
- Saved plans: `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` 9 (budgets) → 10 (`CanonicalProject` →
  `CanonicalWorkPackage`, keys renamed; a stored ≤ 9 body upgrades on read), → 11 at slice 3a
  (resolved settings with provenance in the input). `SCHEDULE_BODY_SCHEMA_VERSION` stays 1
  (it keys dates by work item id; task 1.3 checks).

## Slice 1 migration and deploy (c)

E13 and E14. Blue/green is not used for this migration: the rename is one commit, one
window, one backup. Migration lint keeps refusing every other rename; the waiver names this
folder and requires the gate script to exist, and the gate refuses unless the window is
proven (no prod release, or a fresh verified backup of the live file with no write since).

## Slice 2: the project entity (d)

E15–E17, E25, E30. Reads of a work package carry `projectId`; the project read lists entries;
nothing about who may see which project changes (E7).

## Settings inheritance (E9) and what moves up

E18–E22, E32. Slice 2 moves only ownership; slice 3a brings the catalogue, `setting_value`,
`resolveSetting`, provenance on every settings read, the budget factor lifted to the
project, the marker scope and the project's work item type allow-list; slice 3b makes the
step set a project entity (E21).

## Spaces (e)

E23–E24.

## What breaks (f)

- Every `/api/projects…` route, 40 operationIds and therefore every MCP tool name; clients
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
- Spaces' member routes break twice (slice 1, slice 3a).

## Dev cleanup (g)

E27, as a runbook section in `docs/runbook-dev-deploy.md` (`Work package cleanup and
regrouping`): backup, `report`, Dany reads the doomed list, `apply --expect-count`, then the
slice 2 window, then the `moveWorkPackage` list and the project-level settings lifted by
hand. Numbers (~330 doomed, 8 survivors) are the owner's and are re-read by `report` on the
day.

## Risks / Trade-offs

- Four windows on dev (slices 1, 2, 3a, 3b), each minutes long, each with a backup; accepted
  under E8 and documented in one runbook section.
- The script cannot decide prose that means the engagement; the allow-list and the hand diff
  are reviewed, and `check` lists what is left rather than hiding it.
- E21 changes authoring flows (adding, renaming or reordering a step is a project write
  that every work package of the project sees); E22 adds one refusal on type assignment
  when a project narrows its allow-list. Both revised after review; flagged for Dany.
- E21's lift (slice 3b) re-keys twelve foreign-keyed tables and `plan_event` and rewrites
  stored journal and saved-plan JSON once (E33); it gets its own window so a failure there
  rolls back only the step lift, never the settings of slice 3a.
- Whether prod records a release could not be read from this machine; the gate decides on the
  day, and the procedure covers both outcomes.

## Open Questions

- E5's deletion list: Dany confirms the owner logins and name patterns in E27 before `apply`.
- E30 (every organization has exactly one default project, created at activation and
  back-filled for every organization) awaits Dany's confirmation; E31 and E32 only move
  planner content out of E1 and E9 and are overrulable by id like E10 onward. E34 needs a
  `wbs-permissions` matrix row for its route; that change owns adding it.
- E5's "the owner logins" in E27 means owners' `users.username`.
- The dependency shape of `feat/cross-project-dependencies` was skimmed read-only (abbreviation
  side table, stable endpoint identities, typed external rows); its rebase is that branch's
  work.
