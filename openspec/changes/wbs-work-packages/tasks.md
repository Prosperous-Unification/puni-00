## 0. Dany reads E10 to E34

- [x] 0.1 Dany confirms or amends design.md E10 to E34. Done 2026-10-25: Dany
      confirmed/revised as recorded in design.md. Revised: E30 (a project is mandatory,
      `422 project_required`; the slice 2 back-fill creates "Migrated work packages" only
      where work packages exist), E16 (deleting the only project is allowed), E25 (no owner; grants
      only), E23 and E24 (a project sits in one space or none; a space is a settings level);
      withdrawn: E34; deferred: E21 to `wbs-step-catalogue`; scoped: E19 (point markers;
      ranges are `wbs-calendar-ranges`). Confirmed unchanged: E11, E12, E14, E22, E27, E33
      and every other decision of E10 to E29.
- [x] 0.2 Landing order decided before slice 1 starts: budgets #663 (plan document 11,
      saved-plan input 9) lands first; `feat/cross-project-dependencies` renumbers after.
      Satisfied 2026-10-24: #663 merged (`1bb1cb392`); `main` at `0b1dddaa0` has
      `PLAN_DOCUMENT_VERSION = 11` and `CANONICAL_PLAN_INPUT_SCHEMA_VERSION = 9`.
- [x] 0.3 E47, E48 and E49 settled 2026-10-25 (the Codex review's product-owner questions;
      E48 by Dany's rule, E47 and E49 by adopting the recommendation). Every task below follows design.md's
      "Dependency graph" (E41): a task merges only after every row it depends on.

## 1. The rename (slice 1, `feat/wbs-work-packages-1`)

- [x] 1.1 Red: `tools/tool-rename-work-package/src/rename-map.test.ts` (every key has its five
      spellings, no target collides with an identifier already in the tree; `check` exits 1
      on an injected residual outside the allow-list and 0 inside it; `apply` is idempotent;
      every per-line new-sense pattern in `allow-list.ts` still matches at least one line of
      the tree, E12). Green: `rename-map.ts`, `allow-list.ts` (excluded paths, and per-line
      patterns for identifiers already in the new sense: `ScopeChain.projectId`,
      `organization.create_project`, the `project.*` permission ids, `{ kind: 'project' }`
      and whatever else `wbs-permissions` slices 1–2 have landed on `main` by then, listed
      from that code; the solver wire schemas and the `[PROJECT-ASSIGNMENT-READS-00n]` ids,
      E11), `cli.ts apply|check|report`, Nx project `tool-rename-work-package` with `test`,
      `lint`, `typecheck`. R5 faults: the allow-list made to match every path; `check` stops
      failing on the injected residual; watched. The `ScopeChain` pattern removed; `apply`
      renames `ScopeChain.projectId` to a second `workPackageId` and typecheck fails; watched.
- [ ] 1.2 Red: `migration-lint.test.ts` with one fixture per window migration of design
      E39, each carrying that migration's complete planned statement shape (passes with its
      waiver and gate script; refused with the waiver entry removed; the two-drop shapes
      refused under the compatible-rebuild marker instead of a waiver; every waived folder
      refused without `bin/assert-rename-window.sh`); `backup-report.db.test.ts` for
      `backup-db-cli.ts --report` (E37: checkpoint `busy = 0` required, empty `-wal`, source
      and snapshot hashes, name and hash ledger, never over an existing file);
      `assert-window-cli.db.test.ts` fed the real CLI's report (passes), then a WAL-only
      write with the writer connection kept open, a checkpointed write, a report naming
      another database, a malformed report, an unreadable report, a changed ledger hash and
      a missing snapshot (each refused naming the field); `assert-rename-window.test.ts`
      (an unreadable state directory with a valid report refuses; a running container
      refuses). Green: `backup-db-cli.ts --report`, `assert-window-cli.ts`,
      `bin/assert-rename-window.sh` and the five `WAIVERS` entries. R5 faults: the
      `existsSync` requirement removed; the `-wal` size check removed (the WAL-only write
      passes); the sha comparison removed (the checkpointed write passes); the ledger
      comparison by name only (the changed hash passes); the state-directory arm made to
      pass on a valid report; each watched.
- [ ] 1.3 Red: `rename-project-to-work-package.db.test.ts` over a dev-shaped fixture store:
      every table, column, index and trigger renamed (no index or trigger in `sqlite_master`
      names `project` in name or body), audit rows rewritten, trees, startable, history,
      saved-plan compare, budget headroom and undo answer the same, the guard refuses an
      unmapped work package; a replay of every journal kind proves no payload names
      `projectId` (or the migration's `json_set` rewrite is proven instead);
      `SCHEDULE_BODY_SCHEMA_VERSION` and the canonical schedule input hash are shown
      unchanged; `down.sql` refuses and leaves schema and ledger unchanged (E38). Green:
      `migration.sql` (no compatible-rebuild marker, E39), `down.sql`. R5 faults: the guard
      replaced by `CHECK (1)`; one trigger left under its old name (the
      `claim_step_project_*` pair); the `down.sql` guard removed (the refusal test sees a
      reversal); watched. _Ordering (WP-14):_ the store-level assertions read through the renamed
      store code, so 1.3 lands red with its migration and goes green only with 1.4's
      mechanical commit; its R5 faults are watched after 1.4.
- [ ] 1.4 Run `tool-rename-work-package apply` over store-sqlite, store-memory, conformance,
      core, contracts, domain, validation, adapters, be-01, gw-01, mcp-01, fe-01 as one
      mechanical commit (this greens 1.3); hand fixes in a separate commit after it; `check`
      exits 0. Review rule: the reviewer runs `apply` on the mechanical commit's parent and
      the diff must be byte-identical to that commit. Tests that prove it: the whole existing
      suite under the new names, the OpenAPI scenario (no `projects` segment, no `Project`
      operationId, no `projectId` property; `GET /api/work-packages/:id/budget-headroom`
      answers as `GET /api/projects/:id/budget-headroom` did), the gateway subscription
      scenario (`project:<id>` refused, `work-package:<id>` admitted); mcp-01's README count
      ("91 tools in all") unchanged and still asserted by `openapi-tools.test.ts`. R5 fault:
      `project:` left admitted in `ws.controller.ts`; the subscription test fails; watched.
- [ ] 1.5 Plan document 12 and saved-plan input 10 (on top of budgets' 11 and 9):
      `plan-document-shapes.test.ts` (export is 12 with `workPackage`; 10 and 11 files convert
      on read, budgets' v11 branch kept, `settings.budgetFactor` carried; 13 refused
      `unsupported_version`), `canonical-plan-input.test.ts` (9 → 10 upgrade; a 9 body
      compares equal to its 10 re-save). R5 faults: the 11 → 12 converter dropped (import of
      the v11 fixture fails); the upgrade step removed (`input_version_unreadable`); watched.
- [ ] 1.6 Solver wire unchanged (E26): `ElsewhereBooking.projectId` is renamed host-side by
      the script; `SOLVER_WIRE_VERSION` stays 4 and the existing golden request test passes
      byte-identical after `apply`; no solver-py change, no image rebuild or repin; both
      copies of `solver-wire.v1–v4.json` are allow-listed (E11, WP-13) and byte-identical to
      `main`.
- [ ] 1.7 Twilight Navigator: `plan-reference.test.ts` reads `plan-export.v12.json` and keeps
      v7–v11; JSDoc and README name `/api/work-packages`. R5 fault: the v12 reader keyed on
      `project` again; the v12 fixture fails; watched.
- [ ] 1.8 Docs, terms and synced specs: `CONTEXT.md` (the work package, project and step-set
      terms done in planning; the remaining definition bodies that still say "project" for
      one WBS are swept by hand under `check`), `LLM_README.md` tables line, current docs by
      script, module READMEs under the renamed module directories; the ten synced specs under
      `openspec/specs/` edited in place (E29: scenario titles and `## Purpose` included,
      scenario ids kept) and `project-assignment-reads` moved to
      `work-package-assignment-reads` with `git mv`; `check-indexes working . HEAD` exits 0;
      `openspec validate --all --json` passes and its output is in `verify.md`.
- [ ] 1.9 Runbook `docs/runbook-dev-deploy.md#work-package-rename-window` (pause the poller,
      stop, backup with `--report`, gate, merge, reset, start, health, smoke, resume; the
      rollback in E38's order) and a paragraph in `docs/runbook-prod-deploy.md` saying prod
      is out of scope until an activation change defines its window (E36); the rehearsal of
      E38 on a copy of the dev database with non-default settings and an injected failed
      `/health`; `verify.md` with commands, results and the failure-proof table; the dev
      window executed and its receipt (report file, snapshot path and sha, gate output,
      health commit) recorded. The same runbook section serves 3.8 and 4.9.

## 2. Dev cleanup and curated regrouping (runbook, between slice 1 and slice 2's window)

- [ ] 2.1 Red: `work-package-cleanup.test.ts` (the selection rule over a fixture: owners'
      `users.username`, `^claire-reg-`, the three name patterns; `report` lists doomed and
      survivors; `apply` refuses on a count mismatch and deletes through the existing
      deletion path otherwise). Green: `apps/wbs/be-01/src/work-package-cleanup-cli.ts`. R5
      fault: the `--expect-count` comparison removed; the changed-dataset test fails;
      watched.
- [ ] 2.2 Runbook section `docs/runbook-dev-deploy.md#work-package-cleanup-and-regrouping`:
      backup, `report`, Dany reads the list (the runbook states that `^New project$` is
      fe-01's placeholder name for every package created from the page and never renamed,
      E27), `apply --expect-count`, then after slice 2's window the four `createProject` calls
      ("PUNI platform", "WBS product", "Twilight agentic workflows", "[KWLA] Kill WL Admin"),
      the `moveWorkPackage` list with ids filled in on the day, the project-level settings
      lifted by hand, and the receipt (counts before and after, backup path and sha).
- [ ] 2.3 Executed on dev with the receipt recorded in `verify.md`.

## 3. The project entity (slice 2, `feat/wbs-work-packages-2`)

Precondition (design "Dependency graph"): `wbs-permissions` 1.4, 3.3 and 4.1 merged and 2.3
executed on dev.

- [ ] 3.1 Red: `add-project.db.test.ts` (one ordinary project "Migrated work packages" in
      each organization holding work packages and none in an empty organization (E30), every
      work package re-homed, the column `project_id` NOT NULL, the back-filled project's
      `created_by IS NULL`, `work_package.owner_id` gone with its value copied into a null
      `work_package.created_by` and that column NOT NULL (E25, E40), the cross-organization
      trigger refuses, the guard refuses an unmapped work package, the migration refuses on
      a store without `access_grant` (`wbs-permissions`' `add_access_grants` not applied),
      `down.sql` refuses unconditionally (E38)) and
      `widen-organization-audit-projects.db.test.ts` (subject kind `project` and the actions
      `project_created`, `project_renamed`, `project_deleted`, `work_package_moved`
      admitted). Green: `<merge-date>100000_add_project` with its `WAIVERS` entry
      (`DROP TABLE`, gate `bin/assert-rename-window.sh`; no compatible-rebuild marker, E39;
      the uuid generation follows the organization back-fill precedent) and
      `<merge-date>100100_widen_organization_audit_projects` in the
      `widen_organization_audit_*` compatible rebuild shape (WP-7). R5 faults: the trigger
      dropped; the `NOT NULL` dropped; the back-fill widened to every organization (the
      empty organization's "no project" assertion fails); the owner-to-`created_by` copy
      removed (the `created_by` guard refuses the fixture); the `access_grant` guard removed
      (the store without it migrates and the refusal test fails); the widen migration
      removed (an insert of `project_created` is refused by the CHECK); each watched.
- [ ] 3.2 Red: `ProjectStore` conformance (`projects.create:name-taken`,
      `projects.create:with-first-work-package` (all rows or none),
      `projects.delete:not-empty`, `projects.delete:only-project` (an empty only project is
      deleted), `projects.move:cross-organization` (the store-level refusal, E45)) on SQLite
      and the memory twin; `combined-create.db.test.ts` (E41, E49): one transaction writes
      the project, the package, the creator's `project-manager` and `package-manager`
      grants (origin `creation`) and the audit rows `project_created` and one
      `access_granted` per grant; an injected failure of each of those inserts leaves zero
      projects, packages, grants and audit rows; after success the creator restricts the
      package and still writes it while another `org-admin` cannot; organization creation
      on all three store paths (`OrganizationRepository.createForUnaffiliatedUser`,
      `OnboardingRepository`, `organization-legacy-activation.ts`) creates no project
      (E30). Green: the port, `ProjectRepository`, `inMemoryProjects`, the grant writes
      through `wbs-permissions`' `AccessGrants` inside the turn. R5 faults: the `not_empty`
      check removed, watched on both stores; the combined create split into two
      transactions (the injected package failure leaves the project behind); the
      `package-manager` grant insert moved after the commit (its injected failure leaves a
      project and package without the grant); the `access_granted` audit append removed
      (the audit-count assertion fails); each watched.
- [ ] 3.3 Red: `project.routes.test.ts` (create 201, create with `workPackage` 201 with both
      rows and the package's `projectId` the new project, `409 name_taken` leaving neither,
      list with counts, read with entries, patch 409/404, delete 204/409 `not_empty`/404, the
      organization's only empty project deleted 204, E41's interim authority:
      `organization.create_project` for writes, every member reads) and
      `work-package-move.routes.test.ts` (E45: 200 with both projects' revisions up by one
      and the audit row; `404 not_found` with identical bodies for a missing package, an
      unreadable package, a missing target and a foreign target, in that order before the
      permission check); `POST /api/work-packages` and `POST /api/work-packages/import`
      (body `{ projectId, document }`, E44) with `projectId` missing, `null`, `42`, foreign
      and nonexistent answer `422 project_required` twice, `422 invalid_body`, and `404`
      twice, creating nothing; an import whose document names another project lands in the
      body's project. Callers updated to name a project (E30), each by a named test: fe-01's
      create (`project-page.tsx`) and import (`import-with-ai.ts`, `wbs-api.ts`, the new
      envelope) and the e2e seeding (`apps/wbs/fe-01/e2e/create-project.ts`, which creates
      a project first). Green: routes, contracts, OpenAPI, MCP tools by derivation, and
      mcp-01's README count ("91 tools in all" raised by the new tools;
      `openapi-tools.test.ts` asserts it, WP-10). R5 faults: the move's organization scope
      removed from the target lookup (the foreign target reaches the store and answers its
      refusal instead of `404`); the audit append removed; `classifyBodyFailure` mutated so
      the missing-`projectId` case falls through to `invalid_body` (the mounted missing
      case fails, E44); each watched. `dependency_crosses_project` is not tested here (E45).
- [ ] 3.4 Plan document 13 (`project: { id, name }`, informational on import) with its test;
      the work package read carries `projectId`.
- [ ] 3.5 Owner removal (E40): `ownerId` out of the port, the store selects, the work package
      response and `canonical-plan-input.ts`; `ownerName` replaced by `createdByName` in the
      list metadata (`project-shapes.ts`), the space rows (`space-shapes.ts`), the port and
      the store's `users` join on `created_by`; `ProjectResource.create` and plan import
      take the actor as `createdBy`; fe-01's picker entry meta and hover card show the
      creator; `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` 11 with the 10 → 11 step moving
      `ownerId` into `retired`, and `diff-plans.ts`' `retired-field` category. Tests: the
      mounted list-metadata test (`createdByName` required); `canonical-plan-input.test.ts`
      (a v10 body upgrades and compares equal to its 11 re-save; two v10 bodies with
      different owners report `retired-field`; a v10 and an 11 body report nothing); the
      picker's unit test; `git grep -n -E 'ownerId|ownerName|owner_id'` over
      `libs/wbs` and `apps/wbs` outside migrations, tests of the old migrations and the
      optimization `ownerId` (another sense) answers nothing. R5 faults: `createdByName`
      made optional in the contract (the mounted test receives a row without it); the
      `retired` move dropped (the two-owner case reports nothing); the one-side rule dropped
      (the v10/11 case reports a change); each watched.
- [ ] 3.6 fe-01: picker grouped by project, a required project picker on "New work package",
      a "New project" dialog creating the project and its first work package together, a
      projects page (create, rename, delete, move) with an empty state for an organization
      with no project, refusals rendered as states; browser test on the real stack. R5
      faults: the handler that renders `409 not_empty` as a state removed; the picker's
      required check removed (the browser test sees the `422 project_required` refusal
      instead of a disabled create); each watched. UI reviewed by eye (pretty UI and fluent
      UX) before merge.
- [ ] 3.7 mcp-01: the create and import tools (`postApiWorkPackages`,
      `postApiWorkPackagesImport`) take a required `projectId` in their derived input
      schema; the README tells an agent to list projects (`getApiProjects`) first. Tests:
      `openapi-tools.test.ts` asserts `projectId` required on both tools; `server.test.ts`
      calls the import tool without `projectId` over the in-memory MCP transport against a
      mounted be-01 and receives the tool error naming `project_required`, with nothing
      created (E44: the low-level `Server` does not validate arguments). R5 faults:
      `projectId` made optional in the contract (the schema assertion fails); the be-01
      classifier mutated as in 3.3 (the transport case receives `invalid_body`); each
      watched.
- [ ] 3.8 Runbook window executed on dev (E36–E38: rehearsal, report, gate, deploy, health;
      precondition: `wbs-permissions`' `add_access_grants` applied and its tasks 3.3 and 4.1
      merged, E41); `verify.md`.

## 4. Settings inheritance and spaces (slice 3a, `feat/wbs-work-packages-3a`)

Precondition (design "Dependency graph"): 3.8 executed and `wbs-permissions` 3.4 merged.

- [ ] 4.1 Red: `settings/catalogue.test.ts` in `@wbs/domain` (every key typed with its
      `resolution` and `storage` (E43: `calendarMarkers` additive in `calendar_marker`, the
      rest nearest in `setting_value`), overridable-at sets as E18 including `space` for
      `timezone`, `calendarMarkers` and `allowedWorkItemTypes` and `budgetFactor` fixed at
      project with values in (0, 1000], a property that `resolveSetting` over random chains
      of every `ScopeChain` level (E42; a space or none) answers the nearest allowed level
      with provenance, a chain with no space skipping that level, an organization chain and
      a space chain resolving without a project). Green: `catalogue.ts`,
      `resolve-setting.ts`. R5 faults: the `overridableAt` check removed (a work-package row
      for `allowedWorkItemTypes` resolves); the space level skipped (a space value is
      ignored and the property fails); `calendarMarkers` resolved nearest (the four-level
      union case loses three markers); each watched.
- [ ] 4.2 Red: `add-setting-value.db.test.ts` (the lift creates rows only for non-default
      values, drops the columns, every work package reads the same; `budget_factor` lifted
      to one project row where a project's packages agree and none where they agree on 1;
      the guard refuses naming the project where they disagree; `calendar_marker` re-scoped
      to `scope_kind`/`scope_id`; no allow-list row written; `down.sql` refuses, E38).
      Green: `<merge-date>100000_add_setting_value` with its `WAIVERS` entry (`DROP TABLE`
      for `work_package` and `calendar_marker`; no compatible-rebuild marker, E39); the
      budget headroom read resolves `budgetFactor` through `resolveSetting`. R5 faults: the
      "differs from default" predicate inverted (defaults get rows, overrides none; the
      read-back test fails); the budget-factor agreement guard replaced by `CHECK (1)` (the
      disagreeing fixture migrates and a package reads another factor); watched.
- [ ] 4.3 Red: `SettingStore` conformance (write refused `not_overridable_here`, `null` clears,
      type failure 422, an additive key refused by the `setting_value` path, a corrupt
      stored value, an unknown stored key and a scope row naming a missing entity each
      failing the read naming the row) and `settings.routes.test.ts` (the
      inherited/overridden/cleared scenario, provenance on every key, `allowedWorkItemTypes`
      and `budgetFactor` written at the project, a space value read by its projects with
      `{ space, S }`, `pertWeights` refused at space with `409 not_overridable_here`,
      `GET`/`PATCH /api/spaces/:id/settings` and `/api/organization/settings` including the
      empty organization and empty space reads). Green: port, both stores, routes,
      contracts, MCP by derivation, mcp-01's README count raised (WP-10). R5 faults:
      provenance hard-coded to `work_package` (the inherited scenario fails); the corrupt
      value read as "no override" (the corrupt-value case answers the inherited value);
      each watched.
- [ ] 4.4 Calendar markers (E19, E43): the union across organization, space, project and work
      package with one provenance per marker; the `calendarMarkers` operation of every
      level's `PATCH …/settings` (`add`, `remove`, or `null`) touching only that level's
      markers; the work
      package's marker routes unchanged; export of the union with provenance and import of
      the `work_package` markers only. Work item types (E22): the `allowedWorkItemTypes`
      setting, `type_not_allowed_in_project` on assignment and on move, directory routes
      unchanged. Tests named in the spec scenarios (four levels, deleting a local marker,
      clearing a level's own set, no `setting_value` row for a marker). R5 faults: the
      allow-list check removed (a `spike` assignment succeeds); the level filter removed
      from `calendarMarkers: null` (clearing P's set deletes W's markers too); the level
      check removed from a lower level's delete (W deletes P's holiday); each watched.
- [ ] 4.5 Inherited changes (E48, settled 2026-10-25): a write at organization, space or project, a
      project entering or leaving a space and a space deletion announce
      `work_package_settings_changed` for each affected work package after the commit, and
      any of them that would leave a work item outside its resolved `allowedWorkItemTypes`
      refuses `409 types_in_use { count, workItems }` listing the work items, changing nothing;
      `dryRun: true` on each of those writes answers the list or the affected packages
      from a rolled-back transaction. Tests: the spec's space-change, narrowing and dry-run
      scenarios on the mounted routes, the announcement observed by the realtime adapter's
      test double, a 201-item fixture answering 200 items and `count: 201`. R5 faults: the
      `types_in_use` check removed from the space add (the project enters and its work item
      is outside the list); the announcement skipped for space changes (the realtime
      assertion fails); the dry-run rollback removed (the setting persists after a dry run);
      the `workItems` query dropped (the list is empty with `count: 1`); each watched.
- [ ] 4.6 Red: `project-in-one-space.db.test.ts` (E46: `project.space_id` and
      `space_position` back-filled by the total order; several packages of one project in
      one space make one pair; equal positions across spaces fall back to `space.created_at`
      and `space.id`; tied projects renumber to `rank × POSITION_STEP` by `project.created_at`
      and `project.id`; a project with no membership reads null; one `space_project_dropped`
      row per pair not kept, with the original candidate position; the completeness guard;
      `space_work_package` gone; the cross-organization trigger refuses a foreign space;
      `space_person`/`space_team` with organization scoping; `down.sql` refuses, E38) and
      `space.routes.test.ts` (a project set into a space,
      `409 project_in_other_space { spaceId }` while it sits in another, removal to none, reorder within the space,
      deleting a space returns its projects to none, an organization-level project reads
      `spaceId: null` and is listed in `all` only, people and teams add/remove/list,
      schedule input hashes unchanged throughout, roll-ups folded per project with work
      package rows beneath). Green: `<merge-date>100100_space_holds_projects_people_teams`
      with its `WAIVERS` entry (`DROP TABLE` for `project` and `space_work_package`, E39),
      store, routes, contracts, mcp-01's README count raised (WP-10), the runbook step
      printing `space_project_dropped` into `verify.md`, and the code following ADR 0062.
      R5 faults: the dropped-membership insert removed (the multi-space fixture's report
      assertion fails); the final `project.id` tie-break removed (the tied-projects case
      depends on row order and the fixture inserted in reverse fails); the
      cross-organization trigger dropped; the `project_in_other_space` check removed (the
      second add silently moves the project); the organization scope on `space_team`
      removed (a service team of another organization is linked); each watched.
- [ ] 4.7 Plan document 14 (settings with provenance, markers as the union with provenance;
      import writes only `work_package` provenance values) and saved-plan input 12; tests as
      in 1.5.
- [ ] 4.8 fe-01: provenance in the settings modal ("inherited from space S", "inherited from
      project X", one provenance per calendar marker, clear override), project-level and
      space-level settings pages, spaces page with each space's projects, persons and teams
      and an organization-level group for projects in no space; browser test. R5 faults:
      the handler that renders `409 not_overridable_here` as a state removed; the handler
      that renders `409 types_in_use` with its work item list as a state removed; the dry-run
      preview shown before a narrowing or a space change skipped; the browser tests naming those
      refusals fail; each watched. UI reviewed by eye.
- [ ] 4.9 Runbook window executed on dev (E36–E38; precondition: one budget factor per
      project, E20); `verify.md`.

## 5. Steps as project entities (slice 3b, `feat/wbs-work-packages-3b`)

_Blocked 2026-10-25 by Dany:_ E21 is deferred to the separate design `wbs-step-catalogue`
(steps per work item type, configured at the organization and added at space and project).
No task below starts until that design lands; it may replace them. E33's one-time JSON
rewrite stays the rule for any step re-key.

- [ ] 5.1 Red: `lift-steps-to-project.db.test.ts` over a dev-shaped fixture (E21, E33): project
      steps deduplicated by code in first-occurrence order, the first occurrence's id kept,
      one `work_package_step` row per project step per package carrying the old allowance,
      allowance revision and unit; every lifted step id re-keyed to the kept id in `actual`,
      `assignment`, `claim`, `estimate`, `measure_estimate`, `step_blockage`,
      `step_measure`, `step_node_attempt`, `step_node_attempt_issued`, `step_parallel`,
      `step_progress`, `typed_dependency` (both columns) and `plan_event.step_id`, with
      `PRAGMA foreign_key_check` empty and no map table left behind; step ids in
      `command_journal.payload`/`inverse` and saved-plan input bodies rewritten once with
      `json_set`; the six owner triggers rebuilt (a claim on a step of another project
      refused); the guard refuses naming the package for a code-less step, refuses
      `step_name_clash` naming the project and packages for two codes sharing a name, and
      refuses naming the journal row for an unrecognised payload shape; replaying a batch
      journaled before the lift yields the same tree as before it, and history and a saved
      plan stored before it read the same after it. Green:
      `<merge-date>100000_lift_steps_to_project` in the compatible rebuild form, `down.sql`
      refusing while any project step is used by two packages' rows (the backup is the
      rollback, D72). R5 faults: the code dedupe removed (duplicate project steps observed);
      `step_node_attempt_issued` left out of the re-key (`foreign_key_check` names it); the
      journal rewrite removed (replaying the pre-lift entry fails on an unknown step id); the
      unrecognised-shape check removed (the fixture's odd payload migrates unchanged instead
      of the migration refusing naming its row); each watched.
- [ ] 5.2 Steps (E21): step create, rename and reorder as project routes, per-package
      allowance and estimate unit, `step_code_not_in_project` and re-key on move, import
      adding the file's missing codes to the project; mcp-01's README count raised (WP-10).
      Tests named in the spec scenarios. R5 fault: the move's step-code check removed;
      watched.
- [ ] 5.3 fe-01: step editing as a project write seen by every package of the project;
      browser test. R5 fault: the handler that renders `409 step_code_not_in_project` as a
      state removed; the browser test naming that refusal fails; watched. UI reviewed by eye.
- [ ] 5.4 Runbook window executed on dev (precondition: `backfill-step-codes-cli.ts` run and
      step-name clashes renamed, E21); `verify.md`.
