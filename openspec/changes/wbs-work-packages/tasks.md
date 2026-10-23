## 0. Dany reads E10 to E29

- [ ] 0.1 Dany confirms or amends design.md E10 to E29, in particular E21 (step codes as a
      project vocabulary, refusal on a fresh code), E22 (project-scoped work item types), E26
      (solver wire rename) and E27 (the deletion rule). Slice 1 is built on the assumptions;
      an amendment lands as a follow-up slice.

## 1. The rename (slice 1, `feat/wbs-work-packages-1`)

- [ ] 1.1 Red: `tools/tool-rename-work-package/src/rename-map.test.ts` (every key has its five
      spellings, no target collides with an identifier already in the tree; `check` exits 1
      on an injected residual outside the allow-list and 0 inside it; `apply` is idempotent).
      Green: `rename-map.ts`, `allow-list.ts`, `cli.ts apply|check|report`, Nx project
      `tool-rename-work-package` with `test`, `lint`, `typecheck`. R5 fault: the allow-list
      made to match every path; `check` stops failing on the injected residual; watched.
- [ ] 1.2 Red: `migration-lint.test.ts` refuses `20261101100000_rename_project_to_work_package`
      without `bin/assert-rename-window.sh`; `assert-rename-window.test.ts` (fresh report
      passes; sha mismatch, missing report, unreadable state dir refuse). Green: the gate
      script and the `WAIVERS` entry. R5 faults: the `existsSync` requirement removed; the
      sha comparison removed (a post-backup write passes); each watched.
- [ ] 1.3 Red: `rename-project-to-work-package.db.test.ts` over a dev-shaped fixture store:
      every table, column, index and trigger renamed, audit rows rewritten, trees, startable,
      history, saved-plan compare and undo answer the same, the guard refuses an unmapped work
      package; a replay of every journal kind proves no payload names `projectId` (or the
      migration's `json_set` rewrite is proven instead); `SCHEDULE_BODY_SCHEMA_VERSION` and
      the canonical schedule input hash are shown unchanged. Green: `migration.sql`,
      `down.sql`. R5 faults: the guard replaced by `CHECK (1)`; one trigger left under its old
      name (the `claim_step_project_*` pair); watched.
- [ ] 1.4 Run `tool-rename-work-package apply` over store-sqlite, store-memory, conformance,
      core, contracts, domain, validation, adapters, be-01, gw-01, mcp-01, fe-01; hand fixes;
      `check` exits 0. Tests that prove it: the whole existing suite under the new names, the
      OpenAPI scenario (no `projects` segment, no `Project` operationId, no `projectId`
      property), the gateway subscription scenario (`project:<id>` refused, `work-package:<id>`
      admitted). R5 fault: `project:` left admitted in `ws.controller.ts`; the subscription test
      fails; watched.
- [ ] 1.5 Plan document 11 and saved-plan input 9: `plan-document-shapes.test.ts` (export is
      11 with `workPackage`; a 10 file converts on read; 12 refused `unsupported_version`),
      `canonical-plan-input.test.ts` (8 → 9 upgrade; an 8 body compares equal to its 9
      re-save). R5 faults: the 10 → 11 converter dropped (import of the v10 fixture fails);
      the upgrade step removed (`input_version_unreadable`); watched.
- [ ] 1.6 Solver wire 5 (E26): `build-solver-request.test.ts`, `parse-solver-response.test.ts`
      (wire 4 refused naming both), solver-py tests under `workPackageId`; the solver image
      rebuild and the dev mapping repin recorded in the runbook. R5 fault: the version check
      removed; a wire-4 response is accepted; watched.
- [ ] 1.7 Twilight Navigator: `plan-reference.test.ts` reads `plan-export.v11.json` and keeps
      v7–v10; JSDoc and README name `/api/work-packages`. R5 fault: the v11 reader keyed on
      `project` again; the v11 fixture fails; watched.
- [ ] 1.8 Docs and terms: `CONTEXT.md` (done in planning; re-check), `LLM_README.md` tables
      line, current docs by script, module READMEs under the renamed module directories;
      `check-indexes working . HEAD` exits 0; `openspec validate --all --json` passes.
- [ ] 1.9 Runbook `docs/runbook-dev-deploy.md#work-package-rename-window` (stop, backup, gate,
      deploy, health, smoke, rollback) and the prod paragraph in `docs/runbook-prod-deploy.md`;
      `verify.md` with commands, results and the failure-proof table; the dev window executed
      and its receipt (backup path, sha, gate output, health commit) recorded.

## 2. The project entity (slice 2, `feat/wbs-work-packages-2`)

- [ ] 2.1 Red: `add-project.db.test.ts` (one "Default project" per organization holding work
      packages, none for an empty organization, every work package re-homed, the column
      `project_id` NOT NULL, the cross-organization trigger refuses, the guard refuses an unmapped work
      package, `down.sql` refuses while a non-default project holds work packages). Green:
      `20261101110000_add_project` with the waiver entry; the uuid generation follows the
      organization back-fill precedent. R5 faults: the trigger dropped; the `NOT NULL` dropped;
      watched.
- [ ] 2.2 Red: `ProjectStore` conformance (`projects.create:name-taken`, `projects.delete:not-empty`,
      `projects.move:cross-organization`) on SQLite and the memory twin. Green: the port,
      `ProjectRepository`, `inMemoryProjects`. R5 fault: `not_empty` check removed; watched on
      both stores.
- [ ] 2.3 Red: `project.routes.test.ts` (create 201, list with counts, read with entries, patch
      409/404, delete 204/409/404, admin-only writes, member reads) and
      `work-package-move.routes.test.ts` (200 with both revisions and the audit row; 404,
      `cross_organization`, `dependency_crosses_project` behind a fixture flag until the
      dependency branch lands). Green: routes, contracts, OpenAPI, MCP tools by derivation,
      `createWorkPackage` requiring `projectId` (422/404). R5 faults: the move's
      organization check removed; the audit append removed; watched.
- [ ] 2.4 Plan document 12 (`project: { id, name }`, informational on import) with its test;
      the work package read carries `projectId`.
- [ ] 2.5 fe-01: picker grouped by project, a projects page (create, rename, delete, move),
      refusals rendered as states; browser test on the real stack. UI reviewed by eye (pretty
      UI and fluent UX) before merge.
- [ ] 2.6 Runbook window executed on dev (backup, gate, deploy, health); `verify.md`.

## 3. Settings inheritance and spaces (slice 3, `feat/wbs-work-packages-3`)

- [ ] 3.1 Red: `settings/catalogue.test.ts` in `@wbs/domain` (every key typed, overridable-at
      sets as E18, a property that `resolveSetting` over random chains answers the nearest
      allowed level with provenance, space inert, `ambiguous_space_value` only for a
      space-overridable key). Green: `catalogue.ts`, `resolve-setting.ts`. R5 fault: the
      `overridableAt` check removed (a work-package row for `stepCodes` resolves); watched.
- [ ] 3.2 Red: `add-setting-value.db.test.ts` (the lift creates rows only for non-default values,
      drops the columns, every work package reads the same; `calendar_marker` scoped;
      `work_item_type.project_id` back-filled and unique per project; `step` codes union per
      default project). Green: `20261101120000_add_setting_value`, waiver, `down.sql` refusing
      while any override row exists. R5 faults: the "differs from default" predicate inverted
      (defaults get rows, overrides none; the read-back test fails); the per-project type
      uniqueness dropped; watched.
- [ ] 3.3 Red: `SettingStore` conformance (write refused `not_overridable_here`, `null` clears,
      type failure 422) and `settings.routes.test.ts` (the inherited/overridden/cleared
      scenario, provenance on every key). Green: port, both stores, routes, contracts, MCP by
      derivation. R5 fault: provenance hard-coded to `work_package`; the inherited scenario
      fails; watched.
- [ ] 3.4 Calendar markers (E19): union with provenance, project marker not deletable through a
      work package route; step codes (E21): `code_not_in_project` on create and set-code, the
      union back-fill; work item types (E22): project-scoped directory routes,
      `type_not_in_project` on move. Tests named in the spec scenarios. R5 faults: the
      vocabulary check removed; the move's type check removed; watched.
- [ ] 3.5 Red: `space-holds-projects.db.test.ts` (back-fill dedupe and order,
      `space_work_package` gone, `space_person`/`space_team` with organization scoping) and
      `space.routes.test.ts` (projects routes in the new sense, people and teams add/remove/list,
      schedule input hashes unchanged throughout, roll-ups folded per project with work package
      rows beneath). Green: `20261101120100_space_holds_projects_people_teams`, store, routes,
      contracts. R5 faults: the dedupe removed (duplicate key failure observed instead of the
      ordered result); the organization scope on `space_person` removed; watched.
- [ ] 3.6 Plan document 13 (settings with provenance; import writes only `work_package`
      provenance values) and saved-plan input 10; tests as in 1.5.
- [ ] 3.7 fe-01: provenance in the settings modal ("inherited from project X", clear
      override), project-level settings page, spaces page with projects, persons and teams;
      browser test; UI reviewed by eye.
- [ ] 3.8 Runbook window executed on dev; `verify.md`.

## 4. Dev cleanup and curated regrouping (runbook, between slice 1 and slice 2's window)

- [ ] 4.1 Red: `work-package-cleanup.test.ts` (the selection rule over a fixture: owner logins,
      `^claire-reg-`, the three name patterns; `report` lists doomed and survivors; `apply`
      refuses on a count mismatch and deletes through the existing deletion path otherwise).
      Green: `apps/wbs/be-01/src/work-package-cleanup-cli.ts`. R5 fault: the
      `--expect-count` comparison removed; the changed-dataset test fails; watched.
- [ ] 4.2 Runbook section `docs/runbook-dev-deploy.md#work-package-cleanup-and-regrouping`:
      backup, `report`, Dany reads the list, `apply --expect-count`, then after slice 2's
      window the four `createProject` calls ("PUNI platform", "WBS product", "Twilight agentic
      workflows", "[KWLA] Kill WL Admin"), the `moveWorkPackage` list with ids filled in on the
      day, the project-level settings lifted by hand, and the receipt (counts before and after,
      backup path and sha).
- [ ] 4.3 Executed on dev with the receipt recorded in `verify.md`.
