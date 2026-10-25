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
| Non-additive migrations | lint forbids `RENAME COLUMN`, `DROP TABLE`, `DROP COLUMN`; `WAIVERS` keyed by folder with a required gate script; precedent `20260831120000_rename_role_to_step` gated by `bin/assert-no-prod-release.sh`; `backup-db-cli.ts` writes a verified snapshot (path, sha256, bytes, migrations)                                                                                      | a window exception with a writer barrier (E36–E39)     |
| Deploy                  | dev: one container `wbs-dev-src`, migrates at boot, poller follows `main`; prod: blue/green image swap; the organization-activation runbook already stops the container, backs up and restarts                                                                                                                                                                                  | a stop-the-world procedure for a rename                |
| Twilight readers        | Navigator `plan-reference.ts` reads `document.project.id` (fixtures v7–v10) and names `POST /api/projects/:id/commands`; Dash's and Burokrat's `projectId` are Nx project ids                                                                                                                                                                                                   | a v12 reader                                           |
| puni-plan tooling       | no live script calls `/api/projects` (90 files mention it: RESUME, batch notes, evidence); the wbs-dev MCP client lists tools by name                                                                                                                                                                                                                                           | nothing to build; names to relearn                     |

## Goals / Non-Goals

**Goals:** the old level is called work package on every surface at once; a project is the
engagement and owns its work packages; one configuration layering model with provenance
across organization → space → project → work package; spaces are the organization's
structure (departments and teams): each project sits in one space or none, and a space holds
persons and teams and carries settings for its projects; dev data survives each slice;
everything that breaks is named here. _Revised 2026-10-25 by Dany (E23); was: spaces group
projects and hold persons and teams._

**Non-Goals:** per-project access (`wbs-permissions`); space-scope grants (declared, unfilled,
`wbs-permissions` P14); nested spaces (additive later, E24); budgets themselves
(`wbs-measure-budgets`, merged; this change only moves its budget factor to the project, E18
and E20); cross-work-package dependencies themselves; the step catalogue per work item type
(`wbs-step-catalogue`, E21); calendar date ranges (`wbs-calendar-ranges`, E19); any
compatibility layer, alias, redirect or dual-version writer. _Revised 2026-10-25 by Dany:
was also "a space-level override of anything", now allowed where E18 says._

## Decisions

### Owner decisions (Dany, 2026-10-23/24; not reopened here)

- **E1. Space stays purely organizational.** A grouping of projects with no authority.
  Organization configuration overridable per space is a later non-goal. _Amended
  2026-10-24 after the Fable review (WP-9):_ the belonging of persons and teams to spaces
  was planner content and moved to E31. _Revised 2026-10-25 by Dany:_ a space is the
  organization's structure (a department or a team) and a settings level: a project sits in
  one space or none, and a space's value resolves for the projects beneath it (E18, E23,
  E24); it still grants nothing (space-scope grants stay declared and unfilled,
  `wbs-permissions` P14). Was: a grouping with no authority, and organization configuration
  overridable per space a later non-goal.
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
- **E5. Migration.** Slice 2 puts every work package of an organization into one ordinary
  project named "Migrated work packages", created only in organizations that hold work
  packages (E15, E30); a curated regrouping happens by hand on dev afterwards through
  `moveWorkPackage`, not in the migration. Before it, dev's ~330 QA leftovers are deleted
  (assumed; Dany may overturn) and the eight real ones are regrouped into "PUNI platform",
  "WBS product", "Twilight agentic workflows" and "[KWLA] Kill WL Admin". _Revised
  2026-10-25 by Dany (E30); was: one "Default project" per organization._
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
  content and moved to E32. _Revised 2026-10-25 by Dany:_ the space level is no longer inert;
  timezone, calendar markers and allowed work item types are overridable at space (E18).
  Was: nothing overridable at space, the space step inert.

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
  saved-plan input goes 9 → 10 at slice 1, → 11 at slice 2 and → 12 at slice 3a (assumed by
  the same reasoning; overturn with E10). _Revised 2026-10-25 after the Codex review (F4):
  slice 2's owner removal takes 11 (E40); was 11 at slice 3a._ `SOLVER_WIRE_VERSION` stays 4 (E26). `SCHEDULER_CONTRACT_VERSION` 17
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
  `ScopeChain` value type (a union discriminated by level since 2026-10-25, E42) and every
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
  established reader-side chain; a stored body is not rewritten here, and since E33 is superseded by `wbs-step-catalogue` SC13 no migration touches one either; corrected 2026-10-24,
  WP-5, to agree with E10). Task 1.3 proves by
  replaying every journal kind through a migrated fixture that no payload names `projectId`;
  if one does, the migration rewrites it with `json_set` and the test proves that instead.
  `down.sql` exists because the lint and `migrate-down-cli.ts` require one, and it refuses
  (E38); the rollback of record is the snapshot (E14, E38). Lint: a `WAIVERS` entry for the
  folder with labels `ALTER TABLE ... RENAME COLUMN` and `DROP TABLE` (the audit rebuild) and
  gate script `bin/assert-rename-window.sh` (E39). _Revised 2026-10-25 after the Codex review
  (F1, F3): was a `down.sql` reversing every rename and a waiver for `RENAME COLUMN` only._ Rejected: expand/contract with views and `INSTEAD OF`
  triggers (`steps-schema-rename` D2): nine views and dozens of triggers alive for one
  release, for nobody (E8).
- **E14. Stop-the-world window with the backup as rollback.** _Revised 2026-10-25 after the
  Codex review (F1, F2): was a gate passing when no prod release was recorded **or** a backup
  report named the live `DB_PATH` with an equal hash, a report the CLI did not produce, a
  rollback by file copy, a prod path through the ordinary swap tooling, and slices 2 and 3a
  under the compatible-rebuild exemption._ The windows of slices 1, 2 and 3a (and 3b, once
  `wbs-step-catalogue` defines it) are a documented exception to the additive rule (E36).
  `bin/assert-rename-window.sh <state-dir> --backup-report=<file> --container=<name>` passes
  only when all hold: `bin/assert-no-prod-release.sh <state-dir>` passes (prod is not in
  scope until an activation change defines its window, E36), the named container is not
  running (the writer barrier, E36), and `assert-window-cli.ts` accepts the report against
  the live database (E37). The report is always required. Procedure, dev (`wbs-dev-src`,
  `/data/wbs.db`, under the heavy lock, the organization-activation runbook's shape): pause
  the poller; stop the container; run
  `backup-db-cli.ts --report=<file> /data/pre-<slice>.db` from a one-off container on the
  same volumes; run the gate; merge;
  reset the host checkout to the merged commit; start the container (be-01 migrates at
  boot); `/health` proves the commit; smoke `GET /api/work-packages`; resume the poller.
  Rollback is E38's. Lint is E39's: every window migration carries an explicit waiver, and
  none claims the compatible-rebuild exemption. Rejected: running a window migration under
  the blue/green swap (the outgoing colour would fail every query the instant the rename
  commits).
- **E15. Slice 2 storage.** `project(id PK, organization_id NOT NULL → organization, name NOT
NULL CHECK (length(name) > 0), revision, created_at NOT NULL, updated_at, created_by)` with
  `UNIQUE (organization_id, name)` and `UNIQUE (id, organization_id)`; born
  organization-aware like `space` (no side table). _Revised 2026-10-24 after review:_
  `created_by` is nullable, with the JSDoc "null = the migration back-fill (no actor)";
  reason: the back-fill has no actor and inventing one would be a made-up default (R5); every
  project created through `createProject` carries its real actor. `work_package.project_id NOT
NULL → project(id)` through a table rebuild of `work_package` under the window's waiver
  (E39; `ADD COLUMN … NOT NULL` without a default is refused and a default would be a made-up
  owner, R5). Back-fill inside the migration: for every organization that holds at least
  one work package, one ordinary project named "Migrated work packages" with a fresh uuid,
  then every work package of that organization points at it; an organization without work
  packages gets no project (E30). A guard refuses while any work package lacks an
  organization row. Trigger pair `work_package_project_organization_insert/update` refuses a work package
  whose project belongs to another organization than its `work_package_organization` row (the
  `claim_step_project_*` device). `down.sql` refuses unconditionally (E38; _revised
  2026-10-25 after the Codex review (F1): was a refusal while a project with a non-null
  `created_by` existed, then a rebuild without the column_). Ids are uuids generated in SQL the way the
  organization back-fill did (task 3.1 verifies the precedent). _Revised 2026-10-25 by Dany
  (E30): was, after the 2026-10-24 revision, one "Default project" for every organization,
  empty ones included, marked through an `organization_default_project` table, with
  `down.sql` refusing while an organization held a project other than its default._
  _Owner column, added 2026-10-25 by Dany (E25):_ the same rebuild drops
  `work_package.owner_id`. Before the drop it copies `owner_id` into `created_by` where
  `created_by` is null (the owner is the creating account, so this records a known fact, not
  a made-up one), and a guard then refuses while any `created_by` is still null, so the
  rebuilt column is `NOT NULL` (E40). The migration requires `wbs-permissions`' `add_access_grants` to be applied
  first, because P6's backfill reads `owner_id`: its guard reads `access_grant`, and a
  database without that table fails the migration before anything is rebuilt. The project
  gains no `space_id` here; it lands nullable in slice 3a (E23).
- **E16. Projects are ordinary; deletion refuses while packages remain.** _Revised
  2026-10-25 by Dany: the `409 last_project` refusal goes, because it only protected E30's
  withdrawn invariant. History: 2026-10-24 (WP-4) replaced the original narrowing (no
  marked project after the back-fill, none for a new organization, `projectId` required)
  with an optional `projectId` landing in a marked per-organization project; 2026-10-25
  restores the required `projectId` (E30)._ "Ordinary" means no kind column, no system flag
  and no protected row: every project, the back-filled "Migrated work packages" included, is
  renamed, emptied and deleted by the same rules, and an organization may hold no project at
  all. `deleteProject` refuses `409 not_empty` naming the work package ids while any remain.
  `createWorkPackage` and the import routes require `projectId`: absent or `null` answers
  `422 project_required`, malformed answers `422 invalid_body`, foreign or missing answers
  `404` (E44). Rejected: a `kind` column or a
  side table marking one project (one more thing permissions would have to reason about,
  E7, and a concept the domain does not have, E30).
- **E17. Project commands are organization-level HTTP routes, not plan-command batch
  commands** (batches are per work package).
  `POST /api/projects { name, workPackage?: { name } }` → 201 / 409 `name_taken` (with
  `workPackage`, the project and its first work package
  are written in one transaction, E30, so a refusal leaves neither); `GET /api/projects` (the
  caller's organization, with work package counts); `GET /api/projects/:id` (its work package
  entries); `PATCH /api/projects/:id {name}` → 200 / 409 `name_taken` / 404; `DELETE
/api/projects/:id` → 204 / 409 `not_empty` / 404 (deleting an organization's only project
  is allowed, E16); `POST
/api/work-packages/:id/move {projectId}` → 200 / 404 (either side, organization-scoped, so a
  foreign target is 404) / 409 `type_not_allowed_in_project { typeIds }` (E22, from slice
  3a); the store-level `cross_organization` refusal stays unreachable through HTTP, and
  `dependency_crosses_project` and step-code matching are deferred (E45). _Revised
  2026-10-25 after the Codex review (F9): was also `409 cross_organization` at HTTP,
  `409 dependency_crosses_project` once dependencies exist, `409 step_code_not_in_project`
  and a re-key of per-step rows by code on every applied move._
  _Revised 2026-10-25 by Dany: was also `409 last_project` on delete and the organization
  route of E34 (withdrawn); the optional `workPackage` on create is the combined dialog's
  route (E30)._ Each write is one
  immediate transaction under the write coordinator, bumps the revision of every project it
  writes by one (a move writes two: the source and the target; corrected 2026-10-24, WP-11,
  to agree with the spec's "both revisions") and appends one `organization_audit` row
  (`project_created`, `project_renamed`, `project_deleted`, `work_package_moved`; subject kind
  `project` in the new sense, unambiguous
  because slice 1 rewrote the old rows to `work_package`). _Audit vocabulary migration added
  2026-10-24 after the Fable review (WP-7):_ slice 1's `organization_audit` rebuild removes
  `project` from the `subject_kind` CHECK, so slice 2 ships
  `<merge-date>100100_widen_organization_audit_projects` in the `widen_organization_audit_*`
  compatible-rebuild shape, re-admitting subject kind `project` and adding those four
  actions (_revised 2026-10-25 by Dany: was five, with the withdrawn E34's
  `default_project_changed`_); before it an insert of `project_created` is refused by the
  CHECK (task 3.1's R5 negative). Authority until `wbs-permissions` 3.4 is E41's interim
  rule (project writes and `moveWorkPackage` need `organization.create_project` at the
  organization; `moveWorkPackage` also needs `package.write` on the work package, which on a
  restricted package comes from grants only, E25); every member lists projects (E7's "plain
  membership sees nothing" arrives with `wbs-permissions`). The combined create also writes
  the creator grants and their audit rows in its transaction (E41). mcp-01 derives the
  tools (`postApiProjects`, `postApiWorkPackagesByIdMove`, …). The work package read gains
  `projectId`; the plan document gains `project: { id, name }` at version 13, informational on
  import: the import request names the target project (`422 project_required` when it names
  none, E30), never the file.
- **E18. The setting catalogue (E9).** `@wbs/domain` `settings/catalogue.ts`: `SETTING_CATALOGUE`
  entries `{ key, value (ArkType), definedAt: 'project', overridableAt: ReadonlySet<Level> }`
  (plus `resolution` and `storage` since 2026-10-25, E43) for `timezone` (IANA zone; overridable at `work_package`), `pertWeights` (three positive
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
  reading a column. Levels: `organization | space | project | work_package`. _Space level
  added 2026-10-25 by Dany (E23):_ `space` joins `overridableAt` for `timezone`,
  `calendarMarkers` and `allowedWorkItemTypes`; because a space sits above the project,
  those three keys are also writable at `organization` (an organization-wide value for a
  space to refine; assumed, overrulable with E18). `allowedWorkItemTypes` stays not
  overridable at `work_package` (E6); `pertWeights` and `budgetFactor` gain no space level.
  Was: nothing overridable at space.
  Storage of the nearest-resolved keys (every key but `calendarMarkers`, which lives in
  `calendar_marker`, E43): `setting_value(scope_kind, scope_id, key, value_json, revision, created_at,
updated_at, created_by)` PK `(scope_kind, scope_id, key)`, `scope_kind` CHECK over the
  levels; a write of a key at a level the catalogue does not allow is refused at the boundary
  (`409 not_overridable_here`), and a value that fails the key's type is `422`. Resolution:
  `resolveSetting(chain, key)` in core, `chain: ScopeChain`, walks from the chain's own level
  upward (work package → project → the project's space when it has one → organization →
  catalogue default; a space chain starts at the space, an organization chain at the
  organization, E42) and answers `{ value, provenance: { level, id } | { level: 'default' } }`
  for a nearest key and one provenance per marker for `calendarMarkers` (E43)
  (_revised 2026-10-25 by Dany, E24: was "spaces", with a refusal when two spaces of the
  chain disagreed; a project now has at most one space, so that rule is moot and gone_).
  Reads: `GET /api/work-packages/:id/settings`, `GET /api/projects/:id/settings`,
  `GET /api/spaces/:id/settings` and `GET /api/organization/settings` answer every
  catalogue key resolved with provenance (the last two added 2026-10-25 for the space
  level; their permissions are `wbs-permissions` P19, which adds `organization.manage_settings`
  and so raises that change's permission count by one, to 22 in this tree's
  `permission-matrix.md`; the count after #724 is that change's to state and is not verified
  here, _revised 2026-10-25 after the Codex review (F11): was "28 once #724 lands"_);
  writes: `PATCH …/settings { key: value | null }` where `null` clears the override (back to
  inherited). _Shared chain type, added 2026-10-24 after review:_ this change and
  `wbs-permissions` use one `ScopeChain` value type in `@wbs/domain`, a union discriminated
  by `level` that ends at organization, space, project or work package (E42; was
  `{ organizationId, spaceId, projectId, workPackageId? }`, and before that `spaceIds`),
  defined by whichever change lands first (expected:
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
  work package adds one marker). _Space level added 2026-10-25 by Dany:_ `scope_kind` admits
  `organization`, `space`, `project` and `work_package`; a work package's calendar is the
  union of its organization's, its project's space's (when it has one), its project's and its
  own markers, and no level removes a marker of a level above it. Was: the project's plus
  the work package's own. _Scoped 2026-10-25 by Dany:_ these are point markers only; date
  ranges with logic are a separate design, `wbs-calendar-ranges`. _Storage and writes pinned
  2026-10-25 after the Codex review (F7):_ markers are the catalogue's one additive key; they
  live only in `calendar_marker`, each read carries its own provenance, and a level's write
  adds or removes only its own markers (E43).
- **E20. What the slice 3a migration lifts.** `work_package.timezone` and the three
  `pert_weight_*` columns move into `setting_value` rows at the work package level **only
  where the stored value differs from the catalogue default** (`UTC`; 1, 4, 1); equal values
  get no row and read as inherited from the default. No project-, space- or
  organization-level row is invented: the migrated project cannot be given the "right" zone
  when its work packages disagree, and the curated regrouping lifts values to projects or
  spaces by hand afterwards. Every work package reads
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
- **E21. Steps are project entities.** _Deferred 2026-10-25 by Dany to `wbs-step-catalogue`:_
  steps per work item type, configured at the organization and added at space and project,
  become a separate design (PR #725, `openspec/changes/wbs-step-catalogue`). Slice 3b is blocked on
  it; the text below stays as the input that design starts from, not as this change's
  decision. E33 is superseded by that design's SC11–SC13 (Dany, 2026-10-25): every step keeps its id and merged ids are translated on read, never rewritten. _Revised 2026-10-24 after review (option a; was: a
  project-wide code vocabulary over per-work-package step rows, refusing a fresh code with
  `code_not_in_project`)._ The step set (code, name, order) is defined once on the project;
  a work package holds one row per project step for what genuinely differs per package, its
  allowance and its estimate unit, keyed by the project's step id. There is no second
  vocabulary table and no `code_not_in_project` refusal: creating, renaming or reordering a
  step is a project write, visible to every work package of the project at once. Reason: E6's
  "project-wide, not overridable" means one step vocabulary per engagement, which is also what
  #601's `twib validate workflow-binding --steps <codes>` wants (one list per engagement).
  Migration (slice 3b, `<merge-date>100000_lift_steps_to_project`; _re-keying enumerated
  2026-10-24 after the Fable review, WP-3_): for each project (by then the migrated projects
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
  package today, `step_project_code`), so no per-work-item unique key can collide. _Superseded 2026-10-25 by `wbs-step-catalogue` SC13 with E33; kept as input text only (revised 2026-10-24 by E33; was: a permanent `step_lift_alias` table read at replay):_
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
{ typeIds }`. Back-fill: no row (after it, no organization, space or project narrows the
  list). _Revised 2026-10-25 by Dany:_ the allow-list is also settable at the organization
  and at space (E18), nearest wins; still never at the work package. A write that would
  leave existing work outside the resolved list refuses `409 types_in_use { count, workItems }`, listing the work items, and `dryRun: true` previews it (E48, settled 2026-10-25). ADR 0009 (a type does
  not inherit) is untouched. Rejected: project-scoped types (it splits one directory word into
  one per project and breaks the organization-level directory commands).
- **E23. A project sits in one space or none; persons and teams belong to spaces.** _Revised
  2026-10-25 by Dany: spaces are the organization's structure (departments or teams) and a
  settings level (E18), so a project belongs to one space or to none. Was: slice 3a replaces
  `space_work_package` with a many-to-many `space_project(space_id, project_id,
organization_id, position, …)`, back-filled by mapping each space's work packages to their
  projects, deduplicated in first-occurrence order._ Slice 3a adds `project.space_id`
  (nullable → `space(id)`) and `project.space_position` (nullable; a CHECK requires both null
  or both set) through a compatible rebuild of `project`. Null means an organization-level
  project: an explicit modeled state every read names (`spaceId: null`), not a default. A
  trigger pair refuses a `space_id` whose space belongs to another organization (checked
  against `space`'s `UNIQUE (id, organization_id)`). Back-fill: the kept space, the
  renumbering and the report are E46's total order (_revised 2026-10-25 after the Codex
  review (F10): was "the earliest entry with the lowest position, ties by
  `space.created_at`, then `space.id`", which left several packages per pair and tied
  projects unordered_). Every other (project, space) pair is written to
  `space_project_dropped(project_id, space_id, kept_space_id, organization_id, position)`,
  a report table the migration keeps and the slice 3a runbook
  prints into `verify.md`: dropped memberships are reported, never silently lost (R5). Then
  `space_work_package` is dropped. Routes keep their shape and go
  `/api/spaces/:id/work-packages…` (slice 1) → `/api/spaces/:id/projects…` (slice 3a, new
  sense; a second break, stated): `POST /api/spaces/:id/projects { projectId }` sets the
  project's space and answers `409 project_in_other_space { spaceId }` while it sits in
  another (remove it there first, so no move is silent), `DELETE …/:projectId` sets none,
  `POST …/:projectId/move` reorders within the space. Deleting a space returns its projects
  to none in the same transaction; a space owns no project lifecycle and grants no access,
  and it holds its own local settings. [ADR 0061](../../../docs/adr/0061-a-space-is-an-organizational-unit.md)
  (written 2026-10-25) supersedes ADR 0033 ("A space is a lens", many spaces per
  project). `GET /api/spaces/:id/roll-ups` answers one row
  per project folded from its work packages' roll-ups (earliest start, latest finish, summed
  days and counts, folded status) with the work package rows beneath; `in-progress` keeps its
  meaning over the space's projects' work packages; the `all` space is the caller's projects,
  in a space or not.
  Belonging: `space_person(space_id, person_id, organization_id, created_*)` and
  `space_team(space_id, service_team_id, organization_id, created_*)`, `POST`/`DELETE
/api/spaces/:id/people/:personId` and `/teams/:teamId`, listed in the space read; no effect
  on access, capacity or scheduling (E1, E31). Rejected: a polymorphic `space_member(kind, id)`
  table (three foreign keys cannot be expressed on one column).
- **E24. The chain is a list.** _Revised 2026-10-25 by Dany: was "the chain and several
  spaces": a project could sit in many spaces, `chain.spaceIds` was the set, the space step
  was inert, and two spaces with different values were to resolve with a named ambiguity
  refusal. With one space or none that rule is moot and gone, and so is the "no home space
  column" rule (`project.space_id` is that column, E23)._ _Revised again 2026-10-25 with
  `wbs-permissions` P14: was "`ScopeChain.spaceIds` keeps its list shape and holds zero or
  one id"._ `ScopeChain.spaceId: string | null` holds the project's one space, null for an
  organization-level project, and `resolveSetting` skips the space level when it is null.
  _Since 2026-10-25 (E42) the chain is a union by level, so an organization or a space with
  no project is a chain of its own._
  Spaces stay flat; nesting is additive later: the slot widens to the space's ancestors,
  nearest first, and the walk gains those levels without changing what it does today. `CONTEXT.md` terms that keep the word in its new sense:
  **Project**, **Project roll-up**, **Project settings**, **All projects**; **Project rank**,
  **Project entry** and **Project timezone** become work package terms; the owner terms go
  (E25).
- **E25. What stays on the work package; no owner.** _Revised 2026-10-25 by Dany: the owner
  concept is dropped on both levels. Was: owner and `restricted` stay on the work package,
  the owner renamed **Work package owner**._ `created_by` stays, as on every other table;
  `restricted` stays on the work package, and edit rights on a restricted package come from
  grants only (`wbs-permissions` P5, P6). Slice 2's rebuild of `work_package` drops
  `owner_id` (E15) after `wbs-permissions`' `add_access_grants` backfill has read it (P6
  writes a `package-manager` grant per owner) and after that change's task 3.3 retires its
  last reader (`canEditProject`); the order is the "Dependency graph" below (E41; was the
  sequence `wbs-permissions` slice 1, this slice 1, `wbs-permissions` 3.3, this slice 2).
  Every other owner reader and the display that replaces it are E40's. Also staying: `work_package_access` (last opened), the
  solution ref, the rank over shared people
  (`work_package_rank`: it orders what books people), the abbreviation of
  `feat/cross-project-dependencies` (addresses `PUNI.080.39` name a work package); that branch
  rebases onto the slice 1 names before it lands and its dependency rows become
  cross-work-package rows inside one project (E2). A project has no owner either (E7).
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
  is `users` and the column `username`. _Confirmed 2026-10-25 by Dany:_ the owner rule
  reads `work_package.owner_id`, which still exists at that point (slice 2 drops it, E25).
  `New project` is fe-01's placeholder name
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
  group to the picker, a projects page, a required project picker on "New work package" and a
  "New project" dialog that creates the project and its first work package together (E30);
  the picker's entry meta and hover card show the creator (`createdByName`) where they
  showed the owner (E40);
  an organization with no project shows the projects page's empty state with "New project"
  as its action. Slice 3a shows provenance in the settings modal ("inherited from space S",
  "inherited from project X"), one provenance per calendar marker (E43) and a "clear
  override" control, a space settings page, and the
  spaces page lists each space's projects with their work packages, persons and teams, plus
  the organization-level projects (no space) as their own group. _Revised 2026-10-25 by
  Dany; was: the project group, the projects page and project provenance only._
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

- **E30. A project is mandatory.** _Revised 2026-10-25 by Dany: there is no default
  project. Was (assumed 2026-10-24, resolving WP-4): every organization has exactly one default
  project, created at organization activation and onboarding and back-filled for every
  organization, empty ones included, marked in an `organization_default_project` table,
  receiving every create and import that names no project, and refusing deletion while it
  held packages or was the only project. Why (Dany): a default project is wrong from the
  domain standpoint; a project needs a scope or mission, and the migration project is a
  one-time landing zone, not a concept._ `POST /api/work-packages` and the import routes
  refuse `422 project_required` when the body has no `projectId` (the contract marks it
  required; its absence answers this named code, not a generic validation error); a foreign
  or missing project answers `404`. Organization activation and onboarding create no
  project, and nothing marks one project as special. fe-01's "New work package" carries a
  required project picker, and a "New project" dialog creates the project and its first work
  package together through `POST /api/projects { name, workPackage: { name } }` in one
  immediate transaction, so a refusal leaves neither (the route shape is assumed,
  overrulable with E30; the creator grants are `wbs-permissions` P6's, written in that same
  transaction with their audit rows by this change's slice 2, E41 and E49). The mcp-01 create
  and import tools take `projectId`; an agent lists projects (`getApiProjects`) first, and
  mcp-01's README says so. The slice-2 back-fill creates one ordinary project named
  "Migrated work packages" only in organizations that hold work packages (E15); it is
  ordinary in every way (E16). Callers updated to name a project, each by a named test
  (tasks 3.3, 3.5, 3.6): fe-01's create (`project-page.tsx`) and import
  (`apps/wbs/fe-01/src/components/wbs/import-with-ai.ts`, `src/lib/wbs-api.ts`), mcp-01's
  create and import tools (`postApiWorkPackages`, `postApiWorkPackagesImport` after slice
  1), and the e2e seeding (`apps/wbs/fe-01/e2e/create-project.ts`), which creates a project
  first. `wbs-permissions` P16 gates creation before this slice 2; its slice 3 check at the
  named project always has a named project now (cross-referenced here, not edited).
- **E31. Persons and teams belong to spaces** (resolves WP-9; moved out of E1). A person or
  team may belong to one or several spaces (new, cheap link). The link carries no authority,
  capacity or scheduling effect (E1); its storage and routes are E23's.
- **E35. There is no persons-team entity** (resolved 2026-10-25 by the planner, not a
  question for Dany). WBS has no team of persons: `/api/teams` are **Service teams**, labels
  on work, and `space_team` links a service team to a space. Dany's "departments and teams"
  are both spaces; a team of people is a space that holds persons.
- **E33. Superseded by `wbs-step-catalogue` SC11–SC13 (Dany, 2026-10-25).** Every step keeps
  its id, only operator-ruled or identical shared codes merge, and merged ids are translated
  on read through `step_identity_history`; stored JSON is never rewritten. Was: the step lift
  rewrites stored JSON once; no alias table (session decision 2026-10-24, on the Fable
  re-check of #714). Slice 3b's migration rewrites step ids in
  `command_journal.payload`/`inverse` and saved-plan input bodies with `json_set`, refusing
  on an unrecognised payload shape naming the row; the permanent `step_lift_alias` table is
  rejected as the compatibility layer the Non-Goals forbid. Detail in E21.
- **E34. Withdrawn.** _Withdrawn 2026-10-25 by Dany with E30's revision: there is no
  default project to choose. Was "the default project is chosen by an explicit route"
  (session decision 2026-10-24, on the Fable re-check of #714):
  `PATCH /api/organization/default-project { projectId }` moved the mark to another project
  of the caller's organization (`404 not_found` otherwise) in one transaction appending a
  `default_project_changed` audit row, with a hand-over to the oldest project as the
  fallback on deleting an empty default, and needed a new `wbs-permissions` matrix row._
  Neither the route, the audit action nor the matrix row exists in this change.
- **E32. The settings catalogue and `resolveSetting`** (resolves WP-9; moved out of E9).
  Settings are a small catalogue (key, value type, overridable-at levels) and one
  `resolveSetting(scope, key)` in core; E18 gives the catalogue's entries and storage and
  the shared `ScopeChain` it resolves over.

### Decisions after the Codex review (2026-10-25)

The Codex design review of #723 (F1–F11) led to these planner decisions; Dany overrules any
of them by id. E47, E48 and E49 answer the review's three product-owner questions with
planner assumptions; all three were settled on 2026-10-25 (E48 by Dany's rule, E47 and E49
by adopting the recommendation).

- **E36. The windows are an exception to the additive rule, behind a writer barrier** (F1).
  `AGENTS.md` keeps forward migrations additive so that blue and green can share SQLite in
  the middle of a swap. Slices 1, 2 and 3a break that rule on purpose (Dany's E4 "break
  everything at once" and E14 "the backup is the rollback"), so no process may write while
  their migrations apply, and none may run the previous code afterwards. The barrier is the
  application stopped, and the gate proves it rather than assuming it. On dev, under the
  heavy lock, the window pauses the poller: puni1's crontab line for `poll.sh` is saved and
  removed, so neither the checkout reset nor devsync's `docker restart wbs-dev-src` can start
  a writer. Then it stops `wbs-dev-src`. `assert-rename-window.sh` refuses unless
  `docker inspect -f '{{.State.Running}}' <container>` answers `false`, and the backup's
  checkpoint refuses while another connection holds the file (E37). Prod is out of scope
  until an activation change defines its own window. The gate refuses whenever
  `bin/assert-no-prod-release.sh <state-dir>` refuses, so a recorded release, or a state
  directory that cannot be read, blocks the window whatever the backup says. No window
  migration ever runs under the blue/green swap.
- **E37. The backup report proves the source, the snapshot and the ledger** (F2).
  `backup-db-cli.ts --report=<file> <snapshot-path>` is a new mode; without the flag the CLI
  prints what it prints today, and the swap's `backup-db` step is unchanged. The new mode
  opens `DB_PATH` and runs `PRAGMA wal_checkpoint(TRUNCATE)`. It refuses unless the pragma
  answers `busy = 0` and the `-wal` file is afterwards absent or empty, which proves that
  the WAL content is in the main file and that no other connection is open. It hashes the
  main file, takes and verifies the `VACUUM INTO` snapshot (`snapshotDatabase`), and writes
  one JSON object atomically, never over an existing file, with the fields `version` (1),
  `sourcePath`, `sourceSha256`, `sourceBytes`, `snapshotPath`, `snapshotSha256`,
  `snapshotBytes` and `migrations`.
  `migrations` holds `{ name, hash }` pairs, read the way `migrate-status-cli.ts --capture`
  reads them (`captureAppliedMigrationSet`). The snapshot carries its own hash, because
  `VACUUM INTO` writes new bytes, while the source hash is the checkpointed main file's. The
  gate runs `assert-window-cli.ts --report=<file>` (be-01) in a one-off container on the
  same volume, and the CLI refuses, naming the field, when:
  - the report is missing, unreadable or malformed (ArkType at the boundary; an unknown
    `version` counts as malformed);
  - `sourcePath` differs from `DB_PATH`;
  - the `-wal` file is not empty;
  - the live main file's sha256 differs from `sourceSha256`;
  - the live ledger's name and hash set differs from `migrations`;
  - the snapshot is absent, or its sha256 differs from `snapshotSha256`.

  Tests run in task 1.2:
  - the pass case feeds the real CLI's output to the gate; no report is written by hand;
  - a WAL-only write after the report, by a connection with `wal_autocheckpoint = 0` that
    stays open;
  - a write checkpointed after the report;
  - a report that names another database;
  - malformed and unreadable reports;
  - an unreadable state directory beside a valid report, refused by E36's conjunction.

- **E38. Rollback is the snapshot and the previous code; window `down.sql` files refuse**
  (F1). The lint requires every window migration to have a `down.sql`, and each one refuses
  unconditionally. It uses a `CHECK (violations = 0)` guard on a temporary table (the
  `20260927170000_add_step_allowance` device), and its comment names the restore step. A
  partial reversal would be a second rollback path that no rehearsal covers. Slice 3a's
  could not reverse the overrides it creates anyway. If a window migration ever reached the
  swap, its abort would hit that refusal and report loudly with the pinned manual command,
  which is the intended failure. Rollback on dev runs in this order:
  1. Keep the poller paused and `wbs-dev-src` stopped, so the new code cannot restart and
     migrate again, and the old code cannot start against the new schema.
  2. Run `restore-db-cli.ts <snapshot>` from a one-off container. It moves `wbs.db`, `-wal`
     and `-shm` aside and verifies the copy.
  3. Reset the host checkout to the window's parent commit, and merge a revert of the slice
     on `main` (the poller would otherwise reset dev to the slice).
  4. Start `wbs-dev-src`. `/health` must show the parent commit, and the ledger must equal
     the report's `migrations`.
  5. Resume the poller only once `origin/main` is the revert.

  Each window's runbook section is rehearsed before the real window, on a copy of the dev
  database with non-default settings: a work package timezone override, PERT weights, a
  budget factor, a calendar marker and a restricted package. The rehearsal deploys the
  slice, injects a failed `/health` (be-01 started with a `DB_PATH` it refuses), runs the
  rollback, and proves that the restored file's sha256 equals the snapshot's and that every
  work package reads its pre-window values. `verify.md` records it.

- **E39. Every window migration and its waiver** (F3). The
  `-- migration-lint: compatible-table-rebuild` marker says that the outgoing colour can
  still read the table. These migrations make no such claim, so none carries the marker;
  each keeps the migrator's `-- foreign-keys-off-rebuild` marker and has an explicit
  `WAIVERS` entry whose gate is `bin/assert-rename-window.sh`. `ALTER TABLE … RENAME TO`,
  `DROP INDEX` and `DROP TRIGGER` are not on the lint's forbidden list.

  | Slice | Folder                                                 | Forbidden statements                                                                                | Waiver labels                                 | `down.sql`                                                      |
  | ----- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
  | 1     | `<merge-date>100000_rename_project_to_work_package`    | 19 `RENAME COLUMN`; `DROP TABLE organization_audit` (CHECK rebuild)                                 | `ALTER TABLE ... RENAME COLUMN`, `DROP TABLE` | refuses (E38)                                                   |
  | 2     | `<merge-date>100000_add_project`                       | `DROP TABLE work_package` (rebuild: `owner_id` out, `project_id NOT NULL` in)                       | `DROP TABLE`                                  | refuses (E38)                                                   |
  | 2     | `<merge-date>100100_widen_organization_audit_projects` | `DROP TABLE organization_audit`, in the compatible rebuild form: it only widens a CHECK             | none; the exemption holds                     | refuses while a new-vocabulary row exists (the `widen_*` shape) |
  | 3a    | `<merge-date>100000_add_setting_value`                 | `DROP TABLE work_package` (five columns out), `DROP TABLE calendar_marker` (re-scoped)              | `DROP TABLE`                                  | refuses (E38)                                                   |
  | 3a    | `<merge-date>100100_space_holds_projects_people_teams` | `DROP TABLE project` (rebuild adding `space_id`, `space_position`), `DROP TABLE space_work_package` | `DROP TABLE`                                  | refuses (E38)                                                   |
  | 3b    | `<merge-date>100000_lift_steps_to_project`             | blocked (E21); listed when `wbs-step-catalogue` lands                                               | —                                             | —                                                               |

  `migration-lint.test.ts` gains one fixture per folder, each with that migration's
  complete planned statement shape. Each fixture passes with its waiver and gate script
  present, and is refused once the waiver entry is removed. Each of the two-drop shapes is
  also refused when the compatible-rebuild marker replaces its waiver, because the
  exemption requires exactly one dropped table, equal to the `_NEW` target
  (`compatibleRebuildTarget` in `migration-lint.ts`).

- **E40. The owner leaves every surface in slice 2** (F4). The owner readers on `main`:
  - storage and store: `work_package.owner_id` (dropped, E15), and in
    `store-sqlite/src/project.ts` the `ownerId` select, the `users` join that produces
    `ownerName`, and the `restricted, ownerId` read behind `canEditProject`;
  - ports: `Project.ownerId` and the list entry's `ownerName`
    (`core/src/ports/project-values.ts`); `ProjectResource.create(name, ownerId)` and plan
    import's `ownerId: actorId`, which now pass the actor as `createdBy`;
  - contracts: `ownerId` in `project-response.ts`, the required `ownerName` in
    `project-shapes.ts`' list metadata, and `ownerName` on `space-shapes.ts`' space rows;
  - domain: `canEditProject` in `project-ownership.ts`, which `wbs-permissions` 3.3 removes;
  - saved plans: `CanonicalProject.ownerId` in `canonical-plan-input.ts`, the matching reads
    in `saved-plan-input.ts` and `saved-plan-capture-values.ts`, and the field category
    `ownerId: 'ownership'` in `diff-plans.ts`;
  - fe-01: `project-picker.ts`' entry meta, `(<created> · <ownerName>)`, its hover card's
    ownership row, and the test fixtures `testing/views.ts`, `testing/refusing-api.ts` and
    `e2e/spaces-stub.ts`.

  Wherever a name is shown, `createdByName` replaces `ownerName`. It is the `users.username`
  behind `work_package.created_by`. The slice 2 rebuild copies the owner into a null
  `created_by` and makes the column `NOT NULL`, and a missing user row throws, as the
  `ownerName` join does today. The hover card's row reads "created by". The plan document
  carries no owner (no `owner` appears in its contracts), so versions 12 to 14 are
  unaffected.

  Saved plans: slice 2 takes `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` 11, allocated here, and
  slice 3a's version becomes 12. `CanonicalWorkPackage` loses `ownerId`. The reader's 10 → 11
  step moves a stored `ownerId` into `retired: { ownerId }`. `diff-plans.ts` compares a
  `retired` key only when both sides carry it and reports a difference under a new category,
  `retired-field`. A key that only one side carries is no change: a body saved after the
  removal never carries it, and no owner is invented for one. The `ownership` category stays,
  because assignments, person teams, team services, work item teams and services use it.
  Tests:
  - a v10 body upgraded to 11 compares equal to its 11 re-save;
  - two v10 bodies with different `ownerId` report `retired-field`;
  - a v10 body and an 11 body of the same package report nothing.

  Negatives, each watched: dropping the `retired` move makes the two-owner case report
  nothing; dropping the one-side rule makes the v10 and 11 case report a change.

- **E41. Landing order is a graph; the combined create writes its grants and audit rows in
  one transaction** (F5). The graph is the "Dependency graph" section below. The combined
  create belongs to this change's slice 2, not to `wbs-permissions` 3.4.
  `POST /api/projects { name, workPackage? }` writes, in one immediate transaction under the
  write coordinator:
  - the project;
  - the work package, when the body names one;
  - a `project-manager` grant at the project for the creator (origin `creation`);
  - with a work package, a `package-manager` grant at it for the creator (origin `creation`);
  - the audit rows `project_created` and one `access_granted` per grant.

  The transaction needs `wbs-permissions` 1.4 (the grant store) and 4.1
  (`widen_organization_audit_access`, which admits `access_granted`) applied first, and the
  graph orders them so. A failed insert rolls everything back. Tests:
  - an injected failure of each insert (the project, the package, each grant, each audit
    row) leaves no project, package, grant or audit row behind;
  - after a successful create, the creator, an `org-admin`, restricts the new package and
    can still write it through the `package-manager` grant (`wbs-permissions` 3.3's
    evaluator), while another `org-admin` cannot.

  Interim authority, from this slice 2 until `wbs-permissions` 3.4: project writes and
  `moveWorkPackage` need `organization.create_project` at the organization (today's admin);
  create and import follow P16; every member reads projects through the backfilled
  organization-scope rows. Slice 2 writes the creator's `project-manager` grant, and 3.4 is
  where it is first consulted. Before projects exist, `wbs-permissions` 3.1 to 3.3 address a
  work package through `InterimPackageChain` (organization and work package ids only,
  permissions P13), which 3.4 removes.

- **E42. `ScopeChain` is a union that ends at its own level** (F6). It is discriminated by
  `level`:
  - `{ level: 'organization'; organizationId }`;
  - `{ level: 'space'; organizationId; spaceId }`;
  - `{ level: 'project'; organizationId; spaceId: string | null; projectId }`;
  - `{ level: 'work_package'; organizationId; spaceId: string | null; projectId; workPackageId }`.

  `wbs-permissions` P13 defines it. `resolveSetting(chain, key)` walks upward from the
  chain's own level and skips a null space. `GET /api/organization/settings` builds an
  organization chain and `GET /api/spaces/:id/settings` a space chain, so an empty
  organization and an empty space resolve without any project (their scenarios are in the
  spec), with no fabricated id and no cast.

- **E43. Each catalogue entry names its resolution and its storage** (F7). Entries gain
  `resolution: 'nearest' | 'additive'` and `storage: 'setting_value' | 'calendar_marker'`.
  - Nearest keys (`timezone`, `pertWeights`, `allowedWorkItemTypes`, `budgetFactor`) have one
    value and one provenance, live in `setting_value`, and `null` clears that level's row.
  - The one additive key, `calendarMarkers`, is the union over every level of the chain;
    each marker reads as `{ marker, provenance }`. It lives only in `calendar_marker`, and the
    `setting_value` write path refuses an additive key, which a test proves.
  - Marker writes at any level are
    `PATCH …/settings { calendarMarkers: { add?: Marker[]; remove?: string[] } }`. `remove`
    names only that level's own markers (a marker of another level answers
    `404 not_found`), and `calendarMarkers: null` deletes that level's own markers. Neither
    touches an inherited marker. The work package's existing marker routes keep writing the
    same rows, and no endpoint is added.
  - Plan document 14 exports the union with provenance. Import writes only the markers whose
    provenance is `work_package` into the new package, as with every other setting (E18).
  - Trusted state is never read as "no override": a stored `value_json` that fails its key's
    type, an unknown key in `setting_value`, or a scope row naming a missing entity throws,
    naming the row.
- **E44. The import request is an envelope** (F8). `POST /api/work-packages/import` takes
  `{ projectId: string, document: unknown }`. The document classifier runs on `document`
  only, and the document's own `project` (v13 and later) is informational. The create and
  import routes share one boundary classifier, `classifyBodyFailure` beside
  `project.routes.ts`:
  - a structural failure whose only issue is a missing or `null` `projectId` answers
    `422 project_required`;
  - any other structural failure, a non-string or malformed id included, answers
    `422 invalid_body`;
  - a well-formed id that names no project of the caller's organization, foreign or
    nonexistent, answers `404 not_found` with the absent-id body.

  Proof: mutating the classifier so that the missing case falls through to `invalid_body`
  must fail the mounted HTTP test of that case (watched). This replaces task 3.3's earlier
  fault, "remove the check and see a `500` from `NOT NULL`", which cannot happen once the
  contract requires the field. mcp-01's low-level `Server` passes arguments through without
  validating them (`server.ts`), so the missing case also runs through the MCP transport (an
  in-memory client against a mounted be-01). There it answers a tool error naming
  `project_required` and creates nothing.

- **E45. The move: what slice 2 does and what is deferred** (F9). Slice 2 answers `200`, or
  `404 not_found` with identical bodies when the work package is missing or unreadable, or
  the target project is missing or belongs to another organization (the lookup is scoped to
  the caller's organization, E17). It checks those in that order, then the permission (403,
  under E41's interim rule), and from slice 3a `409 type_not_allowed_in_project`. The store
  keeps its own `cross_organization` refusal (conformance `projects.move:cross-organization`)
  and the trigger pair (E15); HTTP cannot reach either. Deferred and not implemented here:
  `409 dependency_crosses_project` arrives with `feat/cross-project-dependencies`, together
  with its test (a test behind a fixture flag proves no production path); step-code matching
  and re-keying arrive with `wbs-step-catalogue` (E21).
- **E46. The kept space is a total order** (F10). For each pair of a project P and a space S
  in which any of P's work packages sits in `space_work_package`, the candidate position is
  the lowest `position` among P's packages in S; several packages of P in S make one
  candidate. P keeps the first of its candidates ordered by (candidate position,
  `space.created_at`, `space.id`). A project with no candidate gets `space_id` null. Within
  each space, the kept projects are renumbered `space_position = rank × POSITION_STEP` (the
  step `place-sibling.ts` appends with), with the 1-based rank ordered by (candidate
  position, `project.created_at`, `project.id`), so equal positions and equal timestamps
  still order. `space_project_dropped` holds one row per pair that was not kept, and its
  `position` is that pair's candidate position, the original value from before the
  renumbering. A guard refuses unless the dropped rows plus the kept projects equal the
  distinct pairs. The spec's scenarios cover several packages per pair, equal positions
  across spaces, equal positions and timestamps within one space, a project with no
  memberships, the renumbering and the report's completeness.
- **E47. Settled 2026-10-25 by adopting the recommendation (review Q1): the migration chooses the kept space by itself.** E46's
  order decides without a mapping file, so slice 3a's migration stays runnable unattended.
  `space_project_dropped`, printed in `verify.md`, lets Dany re-home a project by hand
  afterwards (remove it from its space, then `POST /api/spaces/:id/projects`). Rejected
  alternative: stopping the migration until an explicit mapping is supplied.
- **E48. Settled by Dany 2026-10-25 (review Q2): inherited changes apply at once; a change that would break existing work lists what breaks, and is refused until that is cleared.** Resolution happens at read and nothing is cached. So a settings write at the organization, a space or a project, a project entering or leaving a space, and a space deletion each change every resolved value beneath them immediately. After the commit, each affected work package gets `work_package_settings_changed` and the optimizer's ordinary re-plan trigger. Saved plans keep their captured inputs and show the new values as `settings` differences on compare. Any of those writes that would leave a work item carrying a type outside its work package's resolved `allowedWorkItemTypes` is refused with `409 types_in_use { count, workItems }` and changes nothing: `workItems` lists each such work item (`id`, `name`, `typeId`, `workPackageId`, `projectId`), the first 200 by project, package and rank, with `count` the total, so a person or an agent sees exactly what to re-type and where. Dany (2026-10-25): "if changing configs breaks smth - must list what will be broken before change can happen". Preview: every one of those writes accepts `dryRun: true` in its body; it runs the same code in a transaction that is rolled back and answers `200 { wouldRefuse: 'types_in_use', count, workItems }` or `200 { wouldRefuse: null, affectedWorkPackages }` (the packages that would receive `work_package_settings_changed`), under the same permission as the write and never writing or announcing. The same shape covers the move's own `type_not_allowed_in_project { typeIds }`. Nothing is grandfathered. Rejected: a separate preview route per write (two code paths whose answers can drift) and a count-only refusal (the caller must hunt for the items).
- **E49. Settled 2026-10-25 by adopting the recommendation (review Q3): the combined create succeeds only as a whole.** The
  create succeeds only when the project, the package, both creator grants and their audit
  rows commit together (E41); otherwise nothing is written. Where the owner was displayed,
  the creator is shown (`createdByName`, E40).

## Dependency graph

Each row lands as its own PR and merges only after every row it depends on has merged on
`main` and, where that row has a window, after the window has run on dev. "P" is
`wbs-permissions`; the other rows are this change's tasks. _Added 2026-10-25 after the Codex
review (F5), E41._

| Task                                                                                                                         | Depends on                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| P 1.1–1.4: grant tables, the catalogue's 22 permissions, `ScopeChain` and `InterimPackageChain`, decisions port, grant store | —                                            |
| P 2.1–2.5: `authorize` wired, P16's creation rule                                                                            | P 1                                          |
| 1.1–1.9: the rename and its window                                                                                           | P 2 (E11's new-sense identifiers)            |
| P 4.1: `widen_organization_audit_access`, admitting `access_granted`                                                         | 1.9 (its CHECK lists the renamed vocabulary) |
| P 3.1: the 404 rule                                                                                                          | P 2, 1.9                                     |
| P 3.3: restricted packages, package creator grants, `canEditProject` retired                                                 | P 3.1, P 4.1                                 |
| 2.1–2.3: dev cleanup                                                                                                         | 1.9                                          |
| 3.1–3.8: the project entity, the combined create with its grants and audit rows, the owner removal, its window               | P 1.4, P 3.3, P 4.1, 2.3                     |
| P 3.2, P 3.4: listing and project rules; `ProjectChain` replaces `InterimPackageChain`                                       | 3.8                                          |
| 4.1–4.9: settings, markers and spaces, and their window                                                                      | 3.8, P 3.4                                   |
| P 4.2 onward                                                                                                                 | as `wbs-permissions`' tasks order them       |
| 5.1–5.4: steps                                                                                                               | `wbs-step-catalogue`                         |

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
  `CanonicalWorkPackage`, keys renamed; a stored ≤ 9 body upgrades on read), → 11 at slice 2
  (`ownerId` retired, E40), → 12 at slice 3a (resolved settings with provenance in the
  input). _Revised 2026-10-25 after the Codex review (F4); was 11 at slice 3a._ `SCHEDULE_BODY_SCHEMA_VERSION` stays 1
  (it keys dates by work item id; task 1.3 checks).

## Slice 1 migration and deploy (c)

E13, E14 and E36–E39. Blue/green is not used for any window migration: each slice is one
commit, one window, one backup. Migration lint keeps refusing every other rename; each
waiver names its folder and requires the gate script to exist, and the gate refuses unless
the window is proven: no prod release recorded, the application stopped, and a backup
report whose source hash, snapshot hash and migration ledger match the live database.
_Revised 2026-10-25 after the Codex review (F1, F2); was "no prod release, or a fresh
verified backup"._

## Slice 2: the project entity (d)

E15–E17, E25, E30. Every work package is created inside a named project (`422 project_required`
otherwise); reads of a work package carry `projectId`; the project read lists entries;
`work_package.owner_id` goes; nothing about who may see which project changes (E7).

## Settings inheritance (E9) and what moves up

E18–E22, E32. Slice 2 moves only ownership; slice 3a brings the catalogue, `setting_value`,
`resolveSetting` over organization → space → project → work package, provenance on every
settings read, the budget factor lifted to the project, the marker scope and the work item
type allow-list; slice 3b is blocked on `wbs-step-catalogue` (E21, deferred 2026-10-25).

## Spaces (e)

E23–E24, E31. A space is an organizational unit (department or team): a project sits in one
space or none, persons and teams belong to spaces, and a space carries settings its projects
resolve (E18). Spaces stay flat.

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
- Spaces' member routes break twice (slice 1, slice 3a); from slice 3a a project sits in at
  most one space, `POST /api/spaces/:id/projects` refuses `409 project_in_other_space`, and
  every membership the back-fill could not keep is listed in `space_project_dropped`.
- `POST /api/work-packages` and the import routes without `projectId` answer
  `422 project_required` (slice 2), and the import body becomes `{ projectId, document }`
  (E44); a move into a foreign project answers `404`, never `409 cross_organization` (E45); fe-01's "New work package" needs a project picked in its
  picker (or the "New project" dialog), and the mcp-01 create and import tools need a
  `projectId`, so an agent lists projects first. A new organization starts with no project.
- `work_package.owner_id` and the owner word go (slice 2); edit on a restricted work package
  comes from grants only (E25). `ownerId` leaves the work package read and `ownerName` the
  list and space rows, replaced by `createdByName`; saved-plan input 11 retires `ownerId`
  (E40).

## Dev cleanup (g)

E27, as a runbook section in `docs/runbook-dev-deploy.md` (`Work package cleanup and
regrouping`): backup, `report`, Dany reads the doomed list, `apply --expect-count`, then the
slice 2 window, then the `moveWorkPackage` list and the project-level settings lifted by
hand. Numbers (~330 doomed, 8 survivors) are the owner's and are re-read by `report` on the
day.

## Risks / Trade-offs

- Four windows on dev (slices 1, 2, 3a, 3b), each minutes long, each with a backup report,
  a rehearsal and a refusing `down.sql`; accepted under E8 and E36 and documented in one
  runbook section.
- The script cannot decide prose that means the engagement; the allow-list and the hand diff
  are reviewed, and `check` lists what is left rather than hiding it.
- _Deferred 2026-10-25 by Dany (E21):_ the next two bullets describe the step design that
  `wbs-step-catalogue` takes over; they stay as its input.
- E21 changes authoring flows (adding, renaming or reordering a step is a project write
  that every work package of the project sees); E22 adds one refusal on type assignment
  when a project narrows its allow-list. Both revised after review; flagged for Dany.
- The step migration (`wbs-step-catalogue`, replacing slice 3b) re-points thirteen foreign-key columns for merged ids and rewrites no stored JSON (SC11–SC13; E33 superseded); it gets its own window so a failure there rolls back only the step migration, never the settings of slice 3a.
- Whether prod records a release could not be read from this machine. The gate refuses
  when one is recorded or the state cannot be read: prod's window is out of scope until an
  activation change defines it (E36). _Revised 2026-10-25 after the Codex review (F1); was
  "the procedure covers both outcomes"._

## Open Questions

- E5's deletion list: Dany confirms the owner logins and name patterns in E27 before `apply`.
- _Settled 2026-10-25 by Dany: E30 revised (a project is mandatory; was: one default project
  per organization) and E34 withdrawn (was: an explicit route choosing that default, needing
  a `wbs-permissions` matrix row)._ E31 and E32 only move planner content out of E1 and E9.
- Assumed on 2026-10-25 and overrulable by id: the combined create's route shape (E30);
  `timezone`, `calendarMarkers` and `allowedWorkItemTypes` also writable at the organization
  (E18); the kept-space rule and `space_project_dropped` (E23, E46).
- Settled 2026-10-25 (E48 by Dany's rule, E47 and E49 by adopting the recommendation): E47
  (the migration picks the kept space by itself), E48 (inherited changes
  apply at once; a narrowing that existing work violates is refused) and E49 (the combined
  create succeeds only as a whole; the creator is displayed where the owner was).
- _Settled 2026-10-25 after the Codex review (F11):_ the matrix rows for the space and
  organization settings routes and for `POST /api/projects` with a first work package exist
  in `wbs-permissions` (P19, permission-matrix.md); the stale question saying they did not
  is removed.
- E5's "the owner logins" in E27 means owners' `users.username`.
- The dependency shape of `feat/cross-project-dependencies` was skimmed read-only (abbreviation
  side table, stable endpoint identities, typed external rows); its rebase is that branch's
  work.
