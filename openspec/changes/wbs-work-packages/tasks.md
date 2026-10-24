## 0. Dany reads E10 to E34

- [ ] 0.1 Dany confirms or amends design.md E10 to E34, in particular the 2026-10-24
      revisions of E10 (merge-date stamps; plan documents 12–14 after budgets' 11; slice 3
      split into 3a and 3b), E15 (nullable `created_by`), E21 (steps as project entities and
      their re-key), E22 (directory-global types with a project allow-list), E26 (no solver
      wire change), E27 (the deletion rule) and **E30 (every organization has exactly one
      default project; awaits Dany's confirmation)**; E31 and E32 only move planner content
      out of E1 and E9; E33 (the step lift rewrites stored JSON once, no alias table) and
      E34 (an explicit default-project route) are session decisions after the re-check. Slice 1 is built on the assumptions; an amendment lands as a
      follow-up slice.
- [x] 0.2 Landing order decided before slice 1 starts: budgets #663 (plan document 11,
      saved-plan input 9) lands first; `feat/cross-project-dependencies` renumbers after.
      Satisfied 2026-10-24: #663 merged (`1bb1cb392`); `main` at `0b1dddaa0` has
      `PLAN_DOCUMENT_VERSION = 11` and `CANONICAL_PLAN_INPUT_SCHEMA_VERSION = 9`.

## 1. The rename (slice 1, `feat/wbs-work-packages-1`)

- [ ] 1.1 Red: `tools/tool-rename-work-package/src/rename-map.test.ts` (every key has its five
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
- [ ] 1.2 Red: `migration-lint.test.ts` refuses `<merge-date>100000_rename_project_to_work_package`
      without `bin/assert-rename-window.sh`; `assert-rename-window.test.ts` (fresh report
      passes; sha mismatch, missing report, unreadable state dir refuse). Green: the gate
      script and the `WAIVERS` entry. R5 faults: the `existsSync` requirement removed; the
      sha comparison removed (a post-backup write passes); each watched.
- [ ] 1.3 Red: `rename-project-to-work-package.db.test.ts` over a dev-shaped fixture store:
      every table, column, index and trigger renamed (no index or trigger in `sqlite_master`
      names `project` in name or body), audit rows rewritten, trees, startable, history,
      saved-plan compare, budget headroom and undo answer the same, the guard refuses an
      unmapped work package; a replay of every journal kind proves no payload names
      `projectId` (or the migration's `json_set` rewrite is proven instead);
      `SCHEDULE_BODY_SCHEMA_VERSION` and the canonical schedule input hash are shown
      unchanged. Green: `migration.sql`, `down.sql`. R5 faults: the guard replaced by
      `CHECK (1)`; one trigger left under its old name (the `claim_step_project_*` pair);
      watched. _Ordering (WP-14):_ the store-level assertions read through the renamed
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
- [ ] 1.9 Runbook `docs/runbook-dev-deploy.md#work-package-rename-window` (stop, backup, gate,
      deploy, health, smoke, rollback) and the prod paragraph in `docs/runbook-prod-deploy.md`;
      `verify.md` with commands, results and the failure-proof table; the dev window executed
      and its receipt (backup path, sha, gate output, health commit) recorded.

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

- [ ] 3.1 Red: `add-project.db.test.ts` (one "Default project" for every organization, empty
      ones included, each recorded in `organization_default_project` (E30), every work
      package re-homed, the column `project_id` NOT NULL, back-filled `created_by IS NULL`,
      the cross-organization trigger refuses, the guard refuses an unmapped work package,
      `down.sql` refuses while an organization holds a project other than its default) and
      `widen-organization-audit-projects.db.test.ts` (subject kind `project` and the actions
      `project_created`, `project_renamed`, `project_deleted`, `work_package_moved`,
      `default_project_changed` admitted). Green: `<merge-date>100000_add_project` in the
      compatible rebuild form (a waiver only if a `DROP COLUMN`/`RENAME COLUMN` statement
      remains; the uuid generation follows the organization back-fill precedent) and
      `<merge-date>100100_widen_organization_audit_projects` in the
      `widen_organization_audit_*` shape (WP-7). R5 faults: the trigger dropped; the
      `NOT NULL` dropped; the back-fill restricted to organizations holding packages (the empty
      organization's assertion fails); the widen migration removed (an insert of
      `project_created` is refused by the CHECK); each watched.
- [ ] 3.2 Red: `ProjectStore` conformance (`projects.create:name-taken`, `projects.delete:not-empty`,
      `projects.delete:last-project`, `projects.delete:default-hands-over`,
      `projects.move:cross-organization`) on SQLite and the memory twin; organization creation
      writes the default project in the same transaction on all three store paths
      (`OrganizationRepository.createForUnaffiliatedUser`, `OnboardingRepository`,
      `organization-legacy-activation.ts`), and the test harnesses that insert organizations
      by SQL (`organization-harness.ts`, `booted-browser-process.ts`,
      `measure-bound-claims.ts`, `capacity-fanout-process.ts`, store-sqlite's
      `testing/space-database.ts`) write the mark too. Green: the port, `ProjectRepository`,
      `inMemoryProjects`, the three creation paths. R5 faults: `not_empty` check removed,
      watched on both stores; the default-project insert removed from onboarding (the
      onboarding test and the create-without-`projectId` route test fail); watched.
- [ ] 3.3 Red: `project.routes.test.ts` (create 201, list with counts, read with entries, patch
      409/404, delete 204/409 `not_empty`/409 `last_project`/404, admin-only writes, member
      reads), `default-project.routes.test.ts` (`PATCH /api/organization/default-project`
      200 with the audit row and the next create landing in the new default, `404 not_found`
      for a foreign or missing project, admin-only until `wbs-permissions` adds its row, E34)
      and `work-package-move.routes.test.ts` (200 with both projects' revisions up by
      one and the audit row; 404, `cross_organization`, `dependency_crosses_project` behind a
      fixture flag until the dependency branch lands); `POST /api/work-packages` and the
      import routes without `projectId` land in the default project, with a foreign one
      `404`. Callers verified to work with the default project (E30), each by a named test:
      fe-01's create (`project-page.tsx`) and import (`import-with-ai.ts`, `wbs-api.ts`),
      mcp-01's import tool (`postApiWorkPackagesImport` after slice 1), the activation CLI,
      the onboarding route and the e2e seeding (`apps/wbs/fe-01/e2e/create-project.ts`).
      Green: routes, contracts, OpenAPI, MCP tools by derivation, and mcp-01's README count
      ("91 tools in all" raised by the new tools; `openapi-tools.test.ts` asserts it, WP-10).
      R5 faults: the move's organization check removed; the audit append removed; the
      default-project route's organization check removed (the foreign-project scenario
      moves the mark across organizations); each watched.
- [ ] 3.4 Plan document 13 (`project: { id, name }`, informational on import) with its test;
      the work package read carries `projectId`.
- [ ] 3.5 fe-01: picker grouped by project, a projects page (create, rename, delete, move),
      refusals rendered as states; "New project" on a fresh organization creates the package
      in the default project with no picker step (E30); browser test on the real stack. R5
      fault: the handler that renders `409 not_empty` as a state removed; the browser test
      naming that refusal fails; watched. UI reviewed by eye (pretty UI and fluent UX)
      before merge.
- [ ] 3.6 Runbook window executed on dev (backup, gate, deploy, health); `verify.md`.

## 4. Settings inheritance and spaces (slice 3a, `feat/wbs-work-packages-3a`)

- [ ] 4.1 Red: `settings/catalogue.test.ts` in `@wbs/domain` (every key typed, overridable-at
      sets as E18 including `budgetFactor` fixed at project with values in (0, 1000], a
      property that `resolveSetting` over random chains answers the nearest allowed level
      with provenance, space inert, `ambiguous_space_value` only for a space-overridable
      key). Green: `catalogue.ts`, `resolve-setting.ts`. R5 fault: the `overridableAt` check
      removed (a work-package row for `allowedWorkItemTypes` resolves); watched.
- [ ] 4.2 Red: `add-setting-value.db.test.ts` (the lift creates rows only for non-default
      values, drops the columns, every work package reads the same; `budget_factor` lifted
      to one project row where a project's packages agree and none where they agree on 1;
      the guard refuses naming the project where they disagree; `calendar_marker` scoped; no
      allow-list row written). Green: `<merge-date>100000_add_setting_value` in the
      compatible rebuild form (a waiver only if a `DROP COLUMN`/`RENAME COLUMN` statement
      remains), `down.sql` refusing while any override row exists; the budget headroom read
      resolves `budgetFactor` through `resolveSetting`. R5 faults: the "differs from
      default" predicate inverted (defaults get rows, overrides none; the read-back test
      fails); the budget-factor agreement guard replaced by `CHECK (1)` (the disagreeing
      fixture migrates and a package reads another factor); watched.
- [ ] 4.3 Red: `SettingStore` conformance (write refused `not_overridable_here`, `null` clears,
      type failure 422) and `settings.routes.test.ts` (the inherited/overridden/cleared
      scenario, provenance on every key, `allowedWorkItemTypes` and `budgetFactor` written at
      the project). Green: port, both stores, routes, contracts, MCP by derivation, mcp-01's
      README count raised (WP-10). R5 fault: provenance hard-coded to `work_package`; the
      inherited scenario fails; watched.
- [ ] 4.4 Calendar markers (E19): union with provenance, project marker not deletable through a
      work package route; work item types (E22): the `allowedWorkItemTypes` setting,
      `type_not_allowed_in_project` on assignment and on move, directory routes unchanged.
      Tests named in the spec scenarios. R5 fault: the allow-list check removed (a `spike`
      assignment succeeds); watched.
- [ ] 4.5 Red: `space-holds-projects.db.test.ts` (back-fill dedupe and order,
      `space_work_package` gone, `space_person`/`space_team` with organization scoping) and
      `space.routes.test.ts` (projects routes in the new sense, people and teams add/remove/list,
      schedule input hashes unchanged throughout, roll-ups folded per project with work package
      rows beneath). Green: `<merge-date>100100_space_holds_projects_people_teams`, store, routes,
      contracts, mcp-01's README count raised (WP-10). R5 faults: the dedupe removed
      (duplicate key failure observed instead of the ordered result); the organization scope
      on `space_person` removed; watched.
- [ ] 4.6 Plan document 14 (settings with provenance; import writes only `work_package`
      provenance values) and saved-plan input 11; tests as in 1.5.
- [ ] 4.7 fe-01: provenance in the settings modal ("inherited from project X", clear
      override), project-level settings page, spaces page with projects, persons and teams;
      browser test. R5 fault: the handler that renders `409 not_overridable_here` as a state
      removed; the browser test naming that refusal fails; watched. UI reviewed by eye.
- [ ] 4.8 Runbook window executed on dev (precondition: one budget factor per project,
      E20); `verify.md`.

## 5. Steps as project entities (slice 3b, `feat/wbs-work-packages-3b`)

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
