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
- [x] 1.2 Red: `migration-lint.test.ts` with one fixture per window migration of design
      E39, each carrying that migration's complete planned statement shape (passes with its
      waiver and gate script; refused with the waiver entry removed; the two-drop shapes
      refused under the compatible-rebuild marker instead of a waiver; every waived folder
      refused without `bin/assert-rename-window.ts`); `backup-report.db.test.ts` for
      `backup-db-cli.ts --report` (E37: checkpoint `busy = 0` required, empty `-wal`, source
      and snapshot hashes, name and hash ledger, never over an existing file; separate
      retained-artifact metadata and stderr on success/failure; no stage deletion or report
      unlink under pathname replacement; usable retained snapshot and post-link failure
      preservation; no-flag protocol unchanged);
      `assert-window-cli.db.test.ts` fed the real CLI's report (passes), then a WAL-only
      write with the writer connection kept open, a checkpointed write, a report naming
      another database, a malformed report, an unreadable report, a changed ledger hash and
      a missing snapshot (each refused naming the field); `tools/tool-remote-scripts/src/lib/rename-window.test.ts`
      (an unreadable state directory with a valid report refuses; a running container
      refuses). Green: `backup-db-cli.ts --report`, `assert-window-cli.ts`,
      `bin/assert-rename-window.ts` and four new exact `WAIVERS` entries (five total including the historical waiver). R5 faults: the
      `existsSync` requirement removed; the `-wal` size check removed (the WAL-only write
      passes); the sha comparison removed (the checkpointed write passes); the ledger
      comparison by name only (the changed hash passes); the state-directory arm made to
      pass on a valid report; destructive stage/report cleanup reintroduced after a reached
      pathname substitution; post-link failure incorrectly removing evidence; each watched.
      _Current-code refinement:_ before apply, replace blanket permission-line guards with shared path/context-qualified character spans and actual mixed-line/ScopeChain/wire witnesses. Freeze the complete Python release boundary. Tasks1.3–1.6 form one readiness boundary; mechanical checkpoints alone do not prove saved-plan/import/solver compatibility.

- [ ] 1.3 Red: `rename-project-to-work-package.db.test.ts` over a dev-shaped fixture store:
      fresh inventory/report includes all old-level tables, columns, indexes, triggers and the
      abbreviation allocator view; each is renamed with no old-level name/body residual outside
      explicit new-sense permission/scope literals. Real allocator operations prove the renamed
      view and its callers work (ALTER TABLE body rewriting alone is insufficient); audit rows rewritten while preserving the earlier
      access/member actions, subjects and indexes from permissions 4.1, trees, startable, history,
      saved-plan compare, budget headroom and undo answer the same, the guard refuses an
      unmapped work package; recognized compensating-command and external-revision paths
      receive shape-checked package-key rewrites while stable replay requirements, user text,
      opaque identities and absent legacy endpoint anchors stay exact; malformed/colliding
      owned shapes refuse atomically naming the stored row. Replay every journal kind.
      Preserve historical runtime declarations/fingerprints/version1 canonical bytes, digests
      and receipts; named historical codecs and explicit current-format versions prove exact
      replay and deleted-reference independence without re-hashing old identities;
      actual engine-generated schedule1 local/elsewhere and connected2 fixtures prove the changed serialized fields: current plain3/connected4, frozen1/2 readers and separate projections, unchanged timings/dates/order/algorithm and original stored hashes;
      scheduler contract 18 → 19 and renamed current canonical host inputs are proven,
      with unchanged numerical scheduling and quantum; old contract-18 cache rows miss
      before current-codec decoding and old saved-plan bytes/hashes stay intact; `down.sql` refuses and leaves schema and ledger unchanged (E38). Green:
      `migration.sql` (no compatible-rebuild marker, E39), `down.sql`. R5 faults: the guard
      replaced by `CHECK (1)`; one trigger left under its old name (the
      `claim_step_project_*` pair); the `down.sql` guard removed (the refusal test sees a
      reversal); watched. _Ordering (WP-14):_ the store-level assertions read through the renamed
      store code, so 1.3 lands red with its migration and goes green only with 1.4's
      mechanical component and required repair integration; its R5 faults are watched after 1.4.
- [ ] 1.4 Run `tool-rename-work-package apply` over store-sqlite, store-memory, conformance,
      core, contracts, domain, validation, adapters, be-01, gw-01, mcp-01, fe-01 as a reproducible mechanical component, with the pinned deterministic formatting phase and exact generated path list (E12). Seal its tree/patch; archive and review semantic/codec repairs separately. If mandatory lint requires them, an ordinary implementation commit composes both diffs with exact composition identity and all normal hooks; it is never called purely mechanical. `check`
      exits 0. Review rule: independently reproduce the sealed mechanical component from its exact recorded parent, then prove the ordinary implementation commit equals that component composed with its separately reviewed repair diff. Tests that prove it: the whole existing
      suite under the new names, the OpenAPI scenario (no `projects` segment, no `Project`
      operationId, no `projectId` property; `GET /api/work-packages/:id/budget-headroom`
      answers as `GET /api/projects/:id/budget-headroom` did), the gateway subscription
      scenario (`project:<id>` refused, `work-package:<id>` admitted), with retained old event_log/event_sequencer bytes and a fresh independent current namespace: actual client/gateway old persisted cursor→anchored full state→new replay, seq0 collision and denied resume/refetch. Never relabel old frames or translate cursors; mcp-01's README count
      ("91 tools in all") unchanged and still asserted by `openapi-tools.test.ts`. R5 fault:
      `project:` left admitted in `ws.controller.ts`; the subscription test fails; watched.
- [ ] 1.5 Plan document ordinary13/connected14 and current saved input11 (base9 and published dependencyHistory10 already exist):
      `plan-document-rename.test.ts` (export ordinary13/connected14 with `workPackage`;
      genuine11/12 captures import through strict historical leaves, feature thresholds10/11
      retained, mixed external fields refused;15 refused `unsupported_version`), `canonical-plan-input.test.ts` and actual stored fixtures (freeze legacy1–9→9→published10, explicit10→11 rename; old9 local and old10 local/connected compare equal to current11 re-saves; original bytes/hashes untouched; mixed/future versions refuse; current11 requires captured dependencyHistory). R5 faults: the historical12→current14 leaf projection dropped (import of
      the v11 fixture fails); the upgrade step removed (`input_version_unreadable`); watched.
- [ ] 1.6 Frozen solver wire v5 with explicit host mapping (E26): rename host fields
      everywhere, mapping current work-package ownership/member/fixed/occupancy/boundary
      fields to frozen wire `projectId`/`projects`/`foreignProjectId` keys only at the
      solver boundary. Preserve both schema copies v1–v5 byte-for-byte, Python 0.4.0 and its
      image/package. Tests: mixed connected fixture through the actual request builder and
      unchanged installed Python CLI; response scope/input/question identity validation;
      corpus prefix `19+0.4.0` and explicitly permitted version/hash request differences.
      Advance host-shaped stored connected stage DTO to 2, success DTO to 3, certificate
      DTO to 2, stored schedule cache DTO4 to5 and public connected boundary to2;
      retain result-envelope1 and infeasible1. Test three independent local/success/certificate
      cache readers with valid current generation/control and same hash. Test old contract-18 cache rejection
      before decoding, including equal input hashes, and current exported nested stageBytes
      and boundary.canonical for renamed vocabulary. Historical saved body/header hashes
      validate before read-time upgrade and remain untouched. R5 faults: mutate each owner
      projection/response identity check, bypass old-cache contract matching or historical
      integrity validation; watch each named production-path negative fail, then restore.
- [x] 1.7 Twilight Navigator: preserve v7–11 output bytes and schemas1/2; newly admit complete frozen connected12 and current ordinary13/connected14 through strict public descriptor reads. Allocate PlanTasks3 for12–14: local leaf tasks plus every authored document-level typed dependency in input order, discriminated internal/external endpoints, preserved external ownership/display and parent successors, no expansion. Lazy frozen12 includes detached published project history/boundary1; current13/14 reuse one selected strict requestSchema from the public raw declaration. Explicit reference/task pairs6/7→1,8–11→2,12–14→3;15+ refuse. Receipt2 binds the complete reference; local leaf receipt targets and selected-package command destination only, external-only refusal and cross-owner collision coverage; receipt1 semantics unchanged. Ordered TDD: frozen response, persisted contracts/pairing, projection, Nav/Burokrat/Dash receipt integration, then quality/lazy memory checks. Current route docs name /api/work-packages/:id/commands. Finite R5 source recipes require independent review before formal faults: wrong root key; skipped complete history; mixed names; omitted external/parent edge; local-ref substitution; pair bypass; stale bound receipt after external/history replacement. Task stays open until integration and proof review.

  Historical qualification: checked1.7 records its original slice1 allocation, including the then-current13/14 descriptor and15+ refusal. Its captures and Proof history stay unchanged; task3.4 below owns current15/16 consumer readiness.

- [ ] 1.8 Docs, terms and synced specs: `CONTEXT.md` (the work package, project and step-set
      terms done in planning; the remaining definition bodies that still say "project" for
      one WBS are swept by hand under `check`), `LLM_README.md` tables line, current docs by
      script, module READMEs under the renamed module directories; the current synced specs under
      `openspec/specs/` edited in place (E29: scenario titles and `## Purpose` included,
      scenario ids kept) and `project-assignment-reads` moved to
      `work-package-assignment-reads` with `git mv`; `check-indexes working . HEAD` exits 0;
      `openspec validate --all --json` passes and its output is in `verify.md`.
- [ ] 1.9 Runbook `docs/runbook-dev-deploy.md#work-package-rename-window` (pause the poller,
      authenticated read handoff, stop live-store owners, backup with `--report`, gate,
      merge/reset, complete baseline ledger capture, explicitly admitted stopped one-off
      candidate migration under permissions 6.4b/6.4e, post-ledger/schema validation, current
      startup/health/read checks, old-authorizer retirement before grant/write exposure and
      supported poller resumption; rollback in E38's order only when permissions 6.4f admits it) and a paragraph in `docs/runbook-prod-deploy.md` saying prod
      is out of scope until an activation change defines its window (E36); the rehearsal of
      E38 on a copy of the dev database with non-default settings and an injected failed
      `/health`; `verify.md` with commands, results and the failure-proof table; the dev
      window executed and its receipt (report file, snapshot path and sha, gate output,
      health commit, transition-owner/candidate/ledger attribution, read continuity,
      retirement and exposure facts) recorded. Unknown or failed one-off transition blocks
      startup/resumption; raw migrate-cli and a successful verifier alone are not a permit.
      The same runbook section serves 3.8 and 4.9.

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

- [ ] Permissions budget/replay follow-up: prove an explicit owning-project budget grant permits a restricted work-package budget write without requiring package.write; record a budget operation, move its work package to another engagement project, then prove undo/redo resolve project.manage_budgets at the current parent and preserve immutable authorization requirements through undo→redo→undo and restamp. InterimPackageChain cannot express this parent move before this slice; see wbs-permissions tasks 2.2–2.3 amendment.

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
      (`DROP TABLE`, gate `bin/assert-rename-window.ts`; no compatible-rebuild marker, E39;
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
      deleted), CP14 nonlowering/zero-grant deletion refusal with exact rollback,
      `projects.move:cross-organization` (the store-level refusal, E45)) on SQLite
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
      list with counts, read with entries, patch 409/404, delete 204/409 `not_empty`/404,
      CP14 deletion refusal409 `last_super_admin` with no effects even for zero grants, the
      organization's only empty project deleted 204, E41's interim authority:
      `organization.create_project` for writes, every member reads) and
      `work-package-move.routes.test.ts` (E45: typed200 IDs/committed-revisions reply; an
      authorized same-parent200 writes/audits nothing; a real move bumps the package and
      each distinct project's revision once, with one project-kind destination-subject audit
      carrying flat IDs/revisions; `404 not_found` with identical bodies for a missing
      package, an unreadable package, a missing target and a foreign target, in that order
      before BOTH current `organization.create_project` then `package.write` and any content
      check. Use actual current grants/credential intersection; preserve queued context,
      restricted-package, parent/map and rollback failure controls); `POST /api/work-packages` and `POST /api/work-packages/import`
      (body `{ projectId, document }`, E44) with `projectId` missing, `null`, `42`, foreign
      and nonexistent answer `422 project_required` twice, `422 invalid_body`, and `404`
      twice, creating nothing; an import whose document names another project lands in the
      body's project. Every direct/internal create/import caller, explicitly legacy calls
      included, supplies a nonempty parent. Add SQLite/memory caller controls for owner-time
      scoped or actual legacy-organization parent validation, identical absent/foreign
      not-found, missing parent refusal with no effects, and stale legacy admission after
      activation, including an actual full-memory source-owned mode transition while queued.
      A legacy-organization flag or isolated fixture does not prove that transition control.
      Preserve usable explicit preactivation calls and existing delegation/unbound
      refusals; seed real parent identities, never select a first/migrated/automatic parent.
      Callers updated to name a project (E30), each by a named test: fe-01's
      create (`project-page.tsx`) and import (`import-with-ai.ts`, `wbs-api.ts`, the new
      envelope) and the e2e seeding (`apps/wbs/fe-01/e2e/create-project.ts`, which creates
      a project first). Green: routes, contracts, OpenAPI, MCP tools by derivation, and
      mcp-01's README count ("91 tools in all" raised by the new tools;
      `openapi-tools.test.ts` asserts it, WP-10). R5 faults: the move's organization scope
      removed from the target lookup (the foreign target reaches the store and answers its
      refusal instead of `404`); the audit append removed; `classifyBodyFailure` mutated so
      the missing-`projectId` case falls through to `invalid_body` (the mounted missing
      case fails, E44); each watched. Actual dependencies now exist: this move slice owns
      the mounted `dependency_crosses_project` test in BOTH directions, including a
      successor-owned incoming edge, held edge, destination-counterpart/local-edge positives,
      deterministic unique blocker IDs and permission-before-content opacity. Preserve
      original dependency SQL/receipts; no historical-branch or fixture-flag proof credit.
      Add actual package/source-project/target-project/audit failure rollback, overflow,
      explicit same-parent no-op and unchanged grants/journal/step/address controls. These
      new move negatives and any finite R5 omissions remain prospective until observed;
      step-code matching and future settings/type policy remain deferred (E45).
- [ ] 3.4 Freeze the complete actual owner-bearing document13/14 schemas and reachable leaves
      independently of live response types. Add ownerless ordinary15/connected16 with required
      `workPackage.projectId` and `project: { id, name }` from one source-owned capture in
      every supported mode, including pre-activation legacy and scoped isolated/shared/connected;
      refuse mismatched or foreign trusted parent identities. Require the purpose export reader
      at route composition, retain optional ordinary livePlans, and retire independent async
      export/later package-tree rereads. Co-land ownerless current capture/input12 first. Tests
      use actual SQLite observations and detached MemorySource epochs, with rival parent rename,
      missing/foreign parent, stale authority, detachment and no optimizer admission controls.
      Scoped capture checks target package.read before topology and every retained shared-chain
      or connected-component member before complete success, under the current interim chain;
      hidden-member refusal is opaque not_found, never filtered/rehashed evidence. Test actual
      creator grant, no grant, membership/grant removal, restricted roles, exact credential
      noninheritance and a malformed selected role; memory selected unsupported group/custom
      state throws. Keep legacy and general scheduler/read behavior unchanged.
      Explicitly retain historical13/14 classifier branches;
      connected12/14/16 remain distinct from ordinary13/15. Test original13/14 bytes and
      owner validation, new15/16 owner absence, current parent consistency, and writable
      15/16 imports with read-only response metadata omitted. The outer import parent is
      authoritative. Frozen owner-bearing document13/14 validation, original bytes/hashes and
      recorded Proof history stay exact; compatibility decoding grants no live authority.
      Update Navigator/Burokrat/Dash consumers before declaring delivery.
      Consumer sub-slice (ordered TDD, still part of open3.4):

  1. Preserve frozen7–14 fixtures/bytes; separately select lazy strict public13/14
     owner-bearing and current15/16 ownerless request declarations. Require complete
     current export parent metadata and matching parent IDs; refuse mixed/unknown
     fields and17+ before publication, without changing HTTP response tolerance.
  2. Keep reference1/receipt1/2 and PlanTasks3 unchanged; extend exact pairs to
     6/7→1,8–11→2,12–16→3. Cover raw export/reference digests, parent/history-only
     replacements, receipt2/selected-reference mismatch, local leaf/external collision
     and selected work-package destination. Parent consistency grants no authority;
     historical receipt1 conversion and its admission refusal stay unchanged.
  3. Coordinate the active CLI write lease, then compose the complete versioned
     providers/contracts with the PUNI CLI root. Verify current15/16 and frozen12/13/14
     through one installed canonical PUNI Navigator/Burokrat/Dash artifact and aliases
     outside the checkout. Update current docs/help to work-package routes; do not infer
     installed delivery from source checks or change activation/manifest schemas or old bytes.
  4. Run owning ordinary, lazy-memory and quality checks, then separately review
     finite R5 recipes for changed checks before faults or new Proof claims. Retain
     all old captures/Proof history and leave3.4 open until complete delivery review.

- [ ] 3.5 Owner removal (E40): `ownerId` out of the port, the store selects, the work package
      response and `canonical-plan-input.ts`; `ownerName` replaced by `createdByName` in the
      list metadata (`project-shapes.ts`), the space rows (`space-shapes.ts`), the port and
      the store's `users` join on `created_by`; `ProjectResource.create` and plan import
      take the actor as `createdBy`; fe-01's picker entry meta and hover card show the
      creator; freeze actual input11 grammar/semantics, then write strict current12 with
      mandatory captured parent and no owner/creator audit metadata. After original
      byte/hash/header/link validation, project historical reads into one internal
      comparison view with only actually captured `retired.ownerId` and explicit recorded
      or unrecorded parent evidence. Comparison side summaries expose required parent evidence
      separately from dependency provenance, including empty diffs; add retired-field to the
      HTTP category union and its deliberate frontend rank without weakening unknown-category
      refusal. Never fabricate raw12 or consult live parent/creator.
      Remove live `SavedPlanPrincipals.workPackageOwnerId` and SQLite/memory projections.
      Legacy saved-plan rename/delete admits only nonnull `saved_plan.created_by_id`, never
      package `created_by` or retired owner evidence; scoped touch retains current
      `package.write` and saved-plan authorship or `package.manage_settings` in its writer.
      Add legacy author success, another actor/package-creator refusal, null-author refusal,
      and unchanged scoped author/manager/current-admission/header-only maintenance controls.
      Retain explicit legacy actor/context and recheck actual activation plus current saved-plan
      author inside the queued touch owner; Resource preflight/double resolution is insufficient.
      Add queued activation-change and saved-plan-author-change refusal with no effects on both
      touch verbs, retaining header-only and `snapshot_busy` behavior. Full memory source tests
      stage real source-owned activation state with their other state and exercise queued
      creation/import/touch transitions; no caller/env/legacy-flag or absent-state mode fallback,
      and isolated old fixtures establish no full-source current-mode parity.
      Replace the ordinary legacy owner predicate with explicit unrestricted-only admission
      and rename its creator-named injections; preserve scoped granted/NO_ADMISSION paths.
      Add former-owner/current-creator/other-actor restricted refusal with no effects,
      unrestricted legacy edit success, real current-schema resource-use without owner_id,
      and restricted scoped create/import plus current-grant edit positives. Preserve the
      distinct saved-author header-maintenance and read/navigation contracts.
      Keep strict frozen input1–11/document13/14 owner decoding, original fixture bytes/hashes
      and recorded Proof history; change live test setup/authorization expectations only in
      explicit successors, with no compatibility alias or blocked comparison edit.
      Tests: mounted required `createdByName`; original11 versus fresh12 unchanged facts;
      preserved historical10→11 decoding; different old owners report `retired-field`,
      one-sided retirement reports no owner change; two recorded parents differ as
      `reparented`, unknown parent stays unknown after live move/deletion; integrity
      and schedule-link refusals precede projection. Keep pre10 dependency uncertainty; the
      picker's unit test; `git grep -n -E 'ownerId|ownerName|owner_id'` over
      `libs/wbs` and `apps/wbs` outside migrations, their tests, named frozen input1–11
      and document1–14 readers/fixtures, explicit retired-owner comparison evidence and
      optimization `ownerId` (another sense) answers nothing. R5 faults: `createdByName`
      made optional in the contract (the mounted test receives a row without it); the
      `retired` move dropped (the two-owner case reports nothing); the one-side rule dropped
      (a pre-retirement versus12 comparison reports an invented owner change); each watched.
- [ ] 3.6 fe-01: picker grouped by project, a required project picker on "New work package",
      a "New project" dialog creating the project and its first work package together, a
      projects page (create, rename, delete, move) with an empty state for an organization
      with no project, refusals rendered as states; browser test on the real stack. R5
      faults: the handler that renders `409 not_empty` as a state removed; the picker's
      required check removed (the browser test sees the `422 project_required` refusal
      instead of a disabled create); each watched. UI reviewed by eye (pretty UI and fluent
      UX) before merge.

      **Open current-cohort sub-slice (ordered; E50, no completed evidence implied):**

  1. Own fresh run/store identity, native registration, actual direct grants/activation,
     run-bound readiness and controlled same-owner restart; retain real main optimizer
     and `superviseBe` composition. Observe failed/unknown close with preserved primary
     plus cleanup failure and retained owned evidence before declaring safe cleanup.
  2. Bind exact BE/GW/FE descriptors and Performance's independent expected stack and
     sanitized run/state identity. Prove absent-state `--list` stays discovery-only,
     while missing/mismatched worker state refuses before a fixture mutation.
  3. Publish actual native-cookie bridge, organization selection/discovery and API-parent
     readback state last/exclusively. Isolate destructive login/logout credentials from
     an empty jar; prove revoking one does not revoke the default credential. Carry
     explicit state/baseURL into manual contexts without implicit authority.
  4. Supply captured parent/expected organization in create/seed/import helpers and
     select the parent after navigation. Keep recipe pre-write negatives and normal
     protected dependency-client headers; exercise real selected GW peer delivery and
     missing-selection/origin/revoked-state refusals without fake access callbacks.
  5. Preserve explicit local quiet-load/refusal/layout and dedicated profiles; add current
     quiet loading separately. Keep actual activated organization/measure discovery.
     Observe any unavailable-Project regression before a bounded production correction;
     no warning suppression, fake Project success or automatic re-login. Retain budgets,
     retries0/workers1, Performance120s/1200 cells and its exact measurement denominator.
     Record actual failures/limits later; ordinary fixture health is not R5 or task closure.

- [x] 3.6a Preserve current mounted-lifecycle/Node/View failures, restore the mounted
      fixture through the actual catalogue migration owner and SQLite snapshot-scoped
      package reader, and retain SQLite on an unacknowledged close. Repair current
      public-name, permission/membership and package-value test expectations without
      weakening production contracts. Put actual HTTP undo/redo in the View tier and
      include the omitted package-value boundary file in Node. Run fresh Source/core,
      mounted, complete Node and affected View controls plus finite custody, deadline
      phrase and actual origin negatives. Evidence belongs to the V120 verification
      record; this bounded fixture/test repair does not complete3.6 or its current cohort.
- [ ] 3.6b Complete every current View file in bounded partitions, the root Unit and
      Auckland tiers, and diagnose the reproduced hostile-error accessor failure without
      weakening its assertion. Then finish the actual browser/runtime/authority cohort
      above and the original entity/catalogue acceptance; a timed-out View prefix and
      green repaired files do not prove the whole UI.
      V121 executes all176View files to completion and authenticates all four native
      transcripts; root Unit21/0 and Auckland5/0 pass. Two current semantic failures
      remain after the owning repairs, so this task stays open.
- [x] 3.6c Restore the reporter's DOM-free host selection after the actual root-suite
      collection failures, and prove omission fails both suites before exact restoration.
      Repair current membership/permission fixtures and public names while preserving
      their assertions. Await the actual page import control before testing its consent
      reset. Retain both current export fingerprints and all four pre-rename fingerprints
      after only the proven public-header substitution; reject an injected production CSV
      LF. Final eight affected files pass298tests, with nine-owner types/lint/format.
      This closes the bounded repair only;3.6b and all original parent obligations remain.

- [ ] 3.6d Restore the captured import destination without weakening SC24 consent or
      publication protection: first observe the original retained-parent RED plus the
      coupled captured-consent and busy/duplicate-read REDs; separate publication/admission
      ownership from project-specific choice ownership; preserve old setter/file callback,
      withdrawal, replacement, unmount and settlement controls. Run complete hook/picker/page
      owners, independent finite new-check negatives and strict quality, then formal Astra
      review when available. Keep the complete original browser/runtime/authority and parent
      acceptance open.

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
- [ ] 3.8 Runbook window executed on dev (E36–E38 and 1.9: rehearsal, report, gate, admitted stopped transition, post-validation, startup/health/handoff;
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
      printing `space_project_dropped` into `verify.md`, and the code following ADR 0063.
      R5 faults: the dropped-membership insert removed (the multi-space fixture's report
      assertion fails); the final `project.id` tie-break removed (the tied-projects case
      depends on row order and the fixture inserted in reverse fails); the
      cross-organization trigger dropped; the `project_in_other_space` check removed (the
      second add silently moves the project); the organization scope on `space_team`
      removed (a service team of another organization is linked); each watched.

- [x] 4.6.1 Actual people/team membership HTTP tests first: planned bodyless POST/DELETE paths,
      required sorted identity arrays in space reads, duplicate add, missing removal,
      multi-space membership, foreign/wrong-kind refusal, viewer and queued grant loss,
      native revision failure and unchanged package/hash/grant/event state.
- [x] 4.6.2 Implement a single `SpaceStore.readContents` snapshot for header, project membership
      and people/service-team identities; use actual committed read ownership for both SQLite
      public Source modes and actual staged ownership for loans. Keep Memory identity kinds
      distinct. Regress committed-versus-borrowed observations and expired owners before closure.
- [x] 4.6.3 Expose the specified people/team membership paths through shared descriptors,
      current Source-admitted space writes and the current read; retain virtual, permission,
      organization opacity and closed body/query boundaries. Link changes do not touch packages.
- [ ] 4.6.4 Generate and verify OpenAPI/MCP tools and count, then integrate actual named space
      people/team management and project-folded reads in the browser. Preserve loaded-owner
      lifetimes and server authority; raw membership supplies no access or scheduling authority.
- [ ] 4.6.5 Observe independent faults for every changed safety guard, restore exactly, and
      run compiler/format/lint/related products and actual Source checks. Complete directory
      deletion/cascade membership and revision invariants and Astra review before parent closure.
- [ ] 4.7 Plan documents17/18 (settings with provenance, markers as the union with provenance;
      import writes only `work_package` provenance values) and saved-plan input13; tests as
      in 1.5.
- [ ] 4.8 fe-01: provenance in the settings modal ("inherited from space S", "inherited from
      project X", one provenance per calendar marker, clear override), project-level and
      space-level settings pages, spaces page with each space's projects, persons and teams
      and an organization-level group for projects in no space; browser test. R5 faults:
      the handler that renders `409 not_overridable_here` as a state removed; the handler
      that renders `409 types_in_use` with its work item list as a state removed; the dry-run
      preview shown before a narrowing or a space change skipped; the browser tests naming those
      refusals fail; each watched. UI reviewed by eye.
- [ ] 4.9 Runbook window executed on dev (E36–E38 and 1.9, including admitted stopped transition and post-validation; precondition: one budget factor per
      project, E20); `verify.md`.

## 5. Step catalogue (replaces the superseded slice 3b)

The settled `wbs-step-catalogue` design replaces the old four slice-3b tasks; none of their
JSON history rewrites is an implementation obligation. SC13 supersedes E33: preserve stored
history bytes/hashes and translate historical identities only after integrity validation.
SC14 owns this later transition's guarded down script; snapshot restoration remains its
window rollback of record. The 2026-11-09 instruction to implement the complete entity
scope authorizes continuing this settled design; actual merge rules remain concrete
operator inputs with fingerprint and applicability checks.

- [ ] 5.1 Complete every task in [wbs-step-catalogue](../wbs-step-catalogue/tasks.md),
      including report/apply, catalogue/bindings/resolution, migrations/history readers,
      protected-fact/application invariants, scheduler, routes/commands/documents, UI,
      window rehearsal/activation and all R5 proofs. Verify the combined scope against
      that change's spec and the work-package/permissions integration before marking
      this parent obligation complete.

- [ ] Coupled1.5/1.6 comparison adapter: real old9/plain1 and old10/connected2 against equivalent renamed11/plain3/connected4; preserve per-side original provenance/bytes/hashes, symmetric meaning diff, same-format identity changes, known18→19-only normalization and nonrename/unknown-field differences. Keep all original hash checks; no live engine or new derived hash during projection.

- [ ] Coupled runtime identity boundary: genuine outgoing authority/claim/write1 bytes and receipts; strict frozen1 read/current canonical+acceptance+receipt+state2 write; original-format recanonicalization/digest/replay, current2-only insertions, raw1|2 reads and original lookup receipts. Keep ledger/body1/rb1 and current admission. Separate tagged resource identity2 versus untagged history with exact-order comparisons, old/new snapshots and linked/unlinked infrastructure controls. Actual adapters/mounted negatives, exact native schema and R5 required.

- [ ] Coupled1.3–1.6 recovery-backup identity, before Navigator1.7: (a) freeze actual shared-save1/projectId canonical bytes and ea65189d digest; new shared-save2/workPackageId only producer plus strict old/current CLI codecs, exact standalone project-rank-save1/work-package-rank-save2 pairs; (b) separate post-validation current-row projection, complete mode/rank/audit removal equality and all-or-none restore; (c) genuine outgoing110 pending/completed operation+approval+receipt+consumption evidence, actual111 migration preservation, current-authority pending restore and byte/digest-preserving cold retry; equivalent2 must not reuse1 approval; (d) host once-read versioned snapshot across fencing/path replacement, exact original digest diagnostics and unchanged owner/capability failures; (e) fresh bounded codec/DB/CLI/host/type/lint checks, reviewed finite R5 before faults, adjacent actualProof and exact source/evidence bridges. Preserve historical add_project_rank directory/hash and repair only its current JSDoc reference. No SQL digest/approval rewrite, version1 reinterpretation or golden replacement.

- [x] Coupled Dash local identity (R1/R2): immutable RuntimeScope1 for published pin/snapshots1–3 and tuple keys; full current/local maps and exact canonical1|2→local request view. TDD equality positive and independent organization/owner/person negatives, original scope/pin/snapshot/key bytes, genuine old canonical/digest preservation, current2 view and malformed/noncanonical refusal.
- [x] Coupled Dash raw receipts (R3): retain original receipt1|2 and full correspondence after original artifact integrity; current matcher input and local accessors. Genuine authority/claim/write receipts, current2 counterparts, wrong owner, additions and original tag/bytes/digest controls.
- [x] Coupled Dash state/recovery raw pairs (R4/R5): genuine7b state1 capture, complete frozen1/current2 retained grammar, live current2-only, unversioned view; repair recovery codec/types/evidence together. Raw body.value and complete independently reread envelope/body equality remain original, including permitted additions; reject corruption/mixed/unknown shapes before projection.
- [x] Coupled Dash fresh API boundary: three live canonical encoders map full current scope and emit envelope2/body1; current state/authority/claim/write/lookup and delegated preparation calls use current WBS SDK fields. Submitted mismatches refuse before send, retained old1 requests are never rebuilt/rehash.
- [x] Coupled Dash native integration: old accepted store/fixture→current receiver→cold reopen, deleted-reference replay, changed-command conflict, removed current write grant refusal for all3 POSTs AND lookups while ordinary package GET remains readable, independent read-credential/writer-permission lookup control, and new2 success after named write restoration. Preserve local keys, canonical/receipt bytes, receiver checks, owner/lifetime and memory/SQLite contracts; finite source/proof plan review before broad mutations. Historical broad637/73 diagnostics are retained; the current six affected strict roots pass. These scoped owning tests do not claim a full Dash test target or parent closure.

- [x] Coupled organization activation namespace repair: reconcile exact retained `project:<id>` and current `work-package:<id>` keys against current ownership; explicitly prune sorted unique physical orphans only, preserve both live raw histories/counters and durable plan history; prove unknown/lookalike and late-live-unmapped atomic rollback through store and CLI, retain current-only gateway authority. Ordinary implementation precedes a separately reviewed finite R5 sweep and complete source/proof review; leave unchecked until that review.
