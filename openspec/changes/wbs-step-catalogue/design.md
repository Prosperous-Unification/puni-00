## Context

Today `step(id, project_id, name, order, code, estimate_unit, allowance_bps)` belongs to
one work package (today's `project`); `estimate(work_item_id, step_id, optimistic,
realistic, pessimistic)` keys on it; a **step node** exists for every leaf and every step
of its package (ADR 0031); work item types are directory-global, do not inherit (ADR 0009)
and have no relation to steps. `wbs-work-packages` E21 (deferred 2026-10-25) would have
lifted the step set to the project. Dany's rule replacing it: "steps by work item type;
first configured on the org level; then can be added on the space level; then on the
project". This change is designed after `wbs-work-packages` slices 1–3a and replaces its
slice 3b. Open questions Q1–Q5 are Dany's; every SC decision is the planner's assumption.

## Goals / Non-Goals

Goals: one vocabulary of steps per organization; which steps a leaf carries follows its
type and its place in the organization → space → project chain; adding is cheap at any
level; nothing silently disappears. Non-goals: proposal.md.

## Decisions

- **SC1. One catalogue per organization.** `step_definition(id, organization_id, code,
name, estimate_unit, default_allowance_bps, position, created_at, created_by)`; `code`
  unique per organization (today's shape, scope widened: `dev`, `qa`, `review`). A space or
  a project that "adds a step" creates a definition in the organization catalogue (so the
  code namespace stays one) and binds it at its own scope (SC2); the definition records
  `defined_at_scope_kind/id` as provenance only, plus `origin` (`'migration'` or
  `'authored'`) and `legacy_work_package_id` (set by the migration only, SC14). Creation
  authority: SC20; uncoded legacy steps: SC23; the definition's unit and allowance are
  **default estimate unit** and **default allowance**, copied into package rows (SC21).
  Rejected: catalogues per space or project
  (three namespaces, and the same `qa` meaning three things).
- **SC2. Bindings add; nothing hides.** `step_binding(id, organization_id, scope_kind
CHECK IN ('organization','space','project'), scope_id, step_id → step_definition,
work_item_type_id NULL → work_item_type, position, origin)`; identity and uniqueness
  are SC18 (the four-column UNIQUE first written here admits duplicate every-type rows). A leaf's resolved steps are the bindings on its chain
  (organization, its project's space if any, its project) whose type is the leaf's type or
  NULL, deduplicated by step, ordered by SC18, each read with provenance (every matching
  binding). Removing a step at a lower scope than its binding is not expressible (E19's rule
  for markers). **Q1b (Dany):** is a project-level exclusion needed ("this project's spikes
  skip QA")? Recommend no for now; if yes later, a `step_exclusion` row with the same
  columns, evaluated as a subtraction after the union, no reshape.
- **SC3. Untyped leaves get the type-unbound steps.** A leaf with no work item type
  resolves only bindings with `work_item_type_id IS NULL`. An every-type binding is not
  an untyped leaf's binding: it reaches typed leaves too. A leaf in the stored type
  conflict state resolves nothing (SC19). **Q2b (Dany):** should an
  organization be able to require a type on every leaf? Recommend no in this change; it is
  one setting (`requireWorkItemType`, E18 catalogue) later.
- **SC4. Order** (comparator made total by SC18). A scope reorders only its own bindings.
  **Q3b (Dany):** should a
  project be able to reorder inherited steps for its own tables and Gantt? Recommend no
  (one order per organization reads the same everywhere); a display preference later if
  wanted.
- **SC5. Who may bind** (revised by SC20: definitions are created only through
  `defineAndBindStep`; renaming or retiring needs `organization.manage_settings`).
  Organization bindings and definitions: `organization.manage_settings` (P19); space bindings and definitions:
  `organization.manage_spaces`; project bindings and definitions:
  `project.manage_settings`. Deleting a definition needs `organization.manage_settings`
  and is refused `409 step_bound` while any binding names it.
- **SC6. Per work package stays per work package** (row set defined by SC21).
  `work_package_step(work_package_id, step_id, estimate_unit, allowance_bps,
allowance_revision)` holds what genuinely differs per package, defaulting from the
  definition when first written (explicit row, not a fallback read: SC21 says which rows
  exist, so a read never defaults). Changing the unit while estimates exist stays refused
  (ADR 0042). Rounding rules unchanged (ADR 0011).
- **SC7. A step node exists for every leaf and resolved step; dropping one that holds
  data is refused** (protected facts and paths enumerated by SC17). A write that drops a
  step from a leaf's set is refused `409 step_nodes_in_use { stepId, count, projectIds }`
  while any protected fact exists for a vanishing pair; the caller clears or moves them
  first. **Q4 (Dany):**
  alternative is to keep orphan rows hidden and restore them when the step returns.
  Recommend refusal: hidden state is the kind of silence R5 forbids, and a hidden estimate
  still sums into nothing visible.
- **SC8. Migration** (superseded by SC11–SC15 and SC23: no re-key of unmerged steps, no
  rewrite of stored JSON). One folder after `wbs-work-packages` 3a; the SC23 report runs
  first and the folder refuses until every reported row has a rule.
- **SC9. Reads and documents.** The tree read carries per leaf `steps: [{ stepId, code,
name, via: [{ bindingId, scopeKind, scopeId, workItemTypeId }] }]`, `via` listing every
  matching binding in SC18 order; the work package read carries the
  resolved set for its project plus the package's unit and allowance per step; plan
  document version +1 (catalogue, bindings, per-package rows) and saved-plan input +1,
  older versions converted on read; Navigator reads the new version, Burokrat admits it.
- **SC10. Twilight** (superseded by SC22: validation stays offline over a fetched
  manifest). The binding file names codes, never ids.

## Decisions after the Codex review

Codex review of #725 at `0bc934e4a` (13 findings, verdict NEEDS AMENDMENTS). Every
decision below is the planner's, **assumed, overrulable**; each names the finding it answers.

- **SC11. Every step keeps its id** (F1, F2; assumed, overrulable). Each existing `step` row
  becomes the `step_definition` row with the **same id**, `origin = 'migration'`,
  `legacy_work_package_id` = its package, and one binding at its package's project for every
  type; its unit, allowance and `allowance_revision` become that package's
  `work_package_step` row. Foreign keys keep pointing at valid ids, so no fact row, journal
  entry, saved-plan body, `plan_event` or cache row changes for a step that is not merged
  (SC12). This removes the saved-plan rewrite F1 objects to: `saved_plan_body.bytes` stay
  immutable and `saved_plan.input_sha256`/`schedule_sha256` stay valid.
- **SC12. Identical shared codes merge; divergent ones wait for a rule** (F2, F11; assumed,
  overrulable; revised 2026-10-25 by the coordinator). Step rows of one organization sharing
  a code whose name, estimate unit and allowance are **all** equal merge automatically: the
  survivor is the row with the earliest `created_at` (NULL, from rows older than
  `20260901120000_add_audit_columns`, sorts after every value), then the lowest id, a stated
  total order rather than a default. Each such code is one `shared_code_identical` report
  row naming survivor and losers. An identical merge loses nothing, and every work package
  starts with `Dev` and `QA`, so ruling them would fill the dev rules file with no decision.
  Rows sharing a code with any differing field are one `shared_code` row listing the fields
  and refuse until the rules file (SC23) names the surviving step id. Merging, inside the
  migration, re-points the thirteen foreign-key columns of the
  twelve tables (inventory below) from each losing id to the survivor, re-keys the loser's
  `work_package_step` row to the survivor keeping that package's unit, allowance and
  `allowance_revision`, drops the loser's binding and definition, and records
  `step_identity_history(old_step_id PRIMARY KEY, step_id → step_definition, merged_at)`.
  Codes are unique per package today (`step_project_code`), so the map is injective per
  package and no per-work-item key collides; a fact whose work item lies in another package
  than its step's is a `foreign_package_fact` report row and refuses.
- **SC13. History is translated on read, never rewritten** (F1; **settled by Dany 2026-10-25, "ok go SC13"; supersedes E33**). Historical readers translate an old id through
  `step_identity_history` after the integrity check, on read only, and never write
  translated bytes back: saved-plan input and schedule bodies (slice keys included), journal
  `payload`, `inverse` and `preconditions` (`estimateUnits` keys, `moveProgress`, and
  `step:<id>` revision keys, which name the `work_package_step` row of the journal's
  package), `plan_event.step_id`/`before`/`after`, `optimized_schedule_cache.result_json`,
  and `event_log.message` on reconnect replay. Saved-plan hashes stay valid because the bytes
  are untouched. E33 rejected an alias table as a compatibility layer; this table is a
  **historical identity map** read by history readers only and never consulted by a live
  write (a live write naming a merged id is `404 not_found`). Rejected: E33's `json_set`
  rewrite (breaks saved-plan integrity, F1).
- **SC14. Storage transition** (F2; assumed, overrulable). Not additive: it runs in the E14
  stop-the-world window with the backup as rollback, with a migration-lint waiver shaped
  like `20260831120000_rename_role_to_step`; the proposal's former "additive" constraint is
  withdrawn. The folder carries the foreign-keys-off marker; renaming `step` to
  `step_definition` (`ALTER TABLE … RENAME`) makes SQLite rewrite the twelve children's foreign-key clauses, the parent
  is then rebuilt to the SC1 shape, and an orphan count per column feeds the
  `CHECK (violations = 0)` guard before commit. The six triggers that join `step`
  (`claim_step_project_insert`/`_update`, `step_blockage_owner_insert`/`_update`,
  `step_parallel_owner_insert`/`_update`) are dropped and recreated against
  `step_definition` and `work_package_step`: the step must hold a row for the work item's
  package. `down.sql` (required by lint) renames back and restores `project_id` from
  `legacy_work_package_id` only while every definition is migration-origin and bound once,
  `step_identity_history` is empty, no `expand` rule applied and no fact lies outside its
  definition's legacy package; otherwise it refuses naming the first row, and the rollback
  is the backup. Tests: `bin/assert-rename-window.sh` refuses with a live colour; restore
  from the backup is drilled in `verify.md`.
- **SC15. One project, different old sets: refuse** (F3; assumed, overrulable; Q1a). Packages
  of one project whose old step sets differ cannot keep them under project bindings. The
  migration refuses with one `divergent_project_set` report row per project naming each
  package's codes, unless the rules file says `expand: true` for that project, which accepts
  the union (new `work_package_step` rows from catalogue defaults). Recommended: refuse.
- **SC16. The scheduler slices per leaf** (F4; assumed, overrulable; Q2a). `slicesOf` builds
  each leaf's slices from its resolved order, not a package-wide order. A leaf resolving no
  step keeps one boundary-only slice of zero duration (the **work-item boundary**), so whole
  dependencies and folds keep an endpoint. A `descendant-step` endpoint applies to the
  descendants that resolve the step and throws `no_descendant_resolves_step` when none does
  (today it requires the step on every descendant, `slice-edges.ts`); recommended
  "matching descendants". Whole and node endpoints are unchanged; cycle validation runs on
  the per-leaf graph. Saved plans schedule through SC13. Fast and solver must agree on a
  mixed story/spike fixture.
- **SC17. One applicability invariant guards every protected fact, and lists what it protects before and when it refuses** (F5; settled by Dany 2026-10-25 with his rule "if changing configs breaks smth - must list what will be broken before change can happen"). Protected facts per (leaf, step): `estimate`, `actual`, `step_progress`,
  `step_measure`, `measure_estimate`, `step_node_attempt`, `step_node_attempt_issued`,
  `assignment`, `claim` (lease, revocation and delegation fields included),
  `typed_dependency` at either endpoint (parent-scoped references included), `step_blockage`
  and `step_parallel`. Applicability-changing paths: unbind, retype, type deletion (today it
  cascades its labels), moving a leaf or a package across projects, changing a project's
  space, deleting a space, undo/redo/restore and copy, and a leaf becoming a parent. One
  store-level check, evaluated in the writer's transaction by every such path and by every
  fact writer (`setEstimate`, `setActual`, … refuse `422 step_not_resolved`), refuses `409 step_nodes_in_use { count, pairs }`: `pairs` lists each vanishing (work item `id`, `name`, `stepId`, `workPackageId`) with the kinds of protected facts on it, the first 200 by package and rank, `count` the total. Every applicability-changing write (unbind, retype, type deletion, leaf and package move, space change, space deletion) accepts `dryRun: true` and answers `200 { wouldRefuse: 'step_nodes_in_use', count, pairs }` or `200 { wouldRefuse: null }` from a rolled-back transaction under the write's own permission, writing and announcing nothing; `GET …/step-nodes-in-use` stays for browsing a binding's usage. Issued-attempt counters are retained facts: they block removal, so attempt numbers are never reused. Rejected: dropping the facts (the schedule changes and nobody can tell why) and hiding the node with its facts (the data leaves every read).
- **SC18. Binding identity and a total order** (F6; assumed, overrulable). `type_key` is a
  virtual generated column `COALESCE(work_item_type_id, '*')` and
  `UNIQUE (scope_kind, scope_id, step_id, type_key)`; on bun's SQLite 3.53.4 this refused
  both a duplicate every-type and a duplicate typed row (checked 2026-10-25). A step's
  ordering binding is its matching binding with the least (scope rank organization < space <
  project, position, binding id); resolved steps sort by (that binding's scope rank, its
  position, code, step id). Provenance lists every matching binding; removing one of several
  leaves the step resolved, so SC17 does not fire. A same-organization trigger requires the
  scope, definition and type to belong to the binding's organization.
- **SC19. A type conflict resolves nothing** (F7; assumed, overrulable). A leaf in the stored
  **type conflict** state resolves no step and every step write on it is refused
  `409 type_conflict` until its type is corrected; reads show it flagged. The resolver takes
  `{ kind: 'untyped' } | { kind: 'typed', typeId } | { kind: 'conflict', typeIds }`, never
  a nullable id. Migration: a conflict leaf holding a protected fact is a
  `type_conflict_leaf` report row and refuses; undo, copy and replay restore the conflict
  exactly and the leaf then resolves nothing.
- **SC20. `defineAndBindStep`** (F8; assumed, overrulable; Q3a). One atomic operation
  creates the organization-wide definition and binds it at one scope, with that scope's
  permission (SC5) checked at the scope id: `organization.manage_settings` (#723 P19) for
  the organization, `organization.manage_spaces` for a space, `project.manage_settings` at
  that project. Renaming or retiring a definition afterwards needs
  `organization.manage_settings`. Scope, definition and type must share the caller's
  organization; otherwise `404 not_found`. Negatives: another organization's project, and a
  manager of a sibling project. Depends on #723 (projects, spaces, scope chain, moves) and
  #724 (set membership).
- **SC21. A package's rows are the union over its project** (F9; assumed, overrulable).
  rows(p) = { s | some binding at the organization, at project(p)'s space or at project(p)
  names s, for any type }, independent of current leaves; it covers every leaf's resolved
  set. Rows are written when a package is created and on every binding add, project move
  or space change, from the definition's defaults at that moment. Unused rows persist with
  their authored unit and allowance; later default changes never touch them.
- **SC22. Burokrat validates offline over a manifest** (F10; assumed, overrulable). WBS
  serves `GET /api/projects/:id/step-manifest` (`project.read`): per work item type and for
  untyped leaves the resolved codes, plus the project revision.
  `twib validate workflow-binding --manifest <file>` reads it offline, checks every type and
  code pair and the `default` mapping, refuses a manifest whose revision is not the one the
  binding names, and adds the manifest digest to the binding digest. Coordinated with
  `twilight-agentic-workflows/specs/twilight/workflow-binding/spec.md` (#601), whose
  `--steps` stays as the untyped shorthand.
- **SC23. Rules file, report, then apply** (F11; assumed, overrulable).
  `step-catalogue-cli.ts report` writes only `step_migration_report` rows (kinds
  `shared_code_identical` (informational, never refuses), `shared_code`, `uncoded`,
  `name_clash`, `divergent_project_set`, `type_conflict_leaf`,
  `foreign_package_fact`) and a fingerprint of the step rows. `apply --merge-rules=<file>`
  takes the JSON file below and runs the folder under the window. A missing, unreadable, malformed (arktype at the
  boundary) or stale (fingerprint differs) file refuses with nothing written. An uncoded
  step gets the code `backfill-step-codes-cli.ts` derives from its name, shown in the report
  and applied only when the operator confirms it in `uncoded` (replaces E21's refusal). Names
  stay unique per catalogue (`name_clash`, E21's rule carried forward).

  ```json
  {
    "version": 1,
    "fingerprint": "<sha256 printed by report>",
    "organizations": {
      "<organizationId>": {
        "codes": { "dev": { "survivorStepId": "<stepId>" } },
        "uncoded": { "<stepId>": { "code": "deploy" } },
        "projects": { "<projectId>": { "expand": true } }
      }
    }
  }
  ```

- **SC24. Endpoint and tool inventory; import** (F12; assumed, overrulable). Removed:
  `postApiProjectsByIdSteps`, `patchApiProjectsByIdStepsByStepId` (its allowance half moves
  to the package route, still the journalled `setStepAllowance`) and
  `deleteApiProjectsByIdStepsByStepId`, with their three mcp-01 tools.
  `getApiProjectsByIdStep-references` stays and reads the leaf's resolved order. No plan
  command adds, renames, reorders or deletes a step today; the removed list names
  endpoints only. Import: codes in the catalogue reuse their definition; codes not resolved
  at the target project are bound there for every type (`project.manage_settings`); unknown
  codes are refused `422 unknown_step_codes` unless `defineMissing: true` (SC20).

Step-key inventory (schema.ts at `0bc934e4a`, matching E21): `estimate`, `actual`,
`step_progress`, `step_measure`, `measure_estimate`, `step_node_attempt`,
`step_node_attempt_issued`, `assignment`, `claim` (nullable), `typed_dependency`
(predecessor and successor), `step_blockage`, `step_parallel`; `plan_event.step_id` has no
foreign key. Lease state lives on `claim`; `claim_occupancy` keys on claim ids, untouched.

## Routes

| Route                                                                         | Permission                                   |
| ----------------------------------------------------------------------------- | -------------------------------------------- |
| `GET /api/organization/steps`                                                 | `organization.read`; definitions, bindings   |
| `PATCH /api/organization/steps/:id` / `DELETE …/:id`                          | `organization.manage_settings`; `step_bound` |
| `POST /api/organization/step-bindings` (`stepId` or `define`, SC20)           | SC20 at the scope; `409 duplicate_binding`   |
| `DELETE /api/organization/step-bindings/:id`                                  | SC20 at the scope; `409 step_nodes_in_use`   |
| `POST /api/organization/step-bindings/reorder { scopeKind, scopeId, ids }`    | SC20 at the scope; `409 stale_order`         |
| `GET /api/projects/:id/steps?type=`                                           | `project.read`; resolved with provenance     |
| `GET /api/projects/:id/step-nodes-in-use?stepId=`                             | `project.read`; the pairs to clear and facts |
| `GET /api/projects/:id/step-manifest`                                         | `project.read`; SC22                         |
| `PATCH /api/work-packages/:id/steps/:stepId { estimateUnit?, allowanceBps? }` | `package.manage_settings`; unit change rule  |

`reorder` names exactly the scope's bindings or is refused `409 stale_order`.

## Open questions for Dany

- **Q1.** (a) Packages of one project with different old sets: refuse until regrouped, or
  accept the union per project (`expand`)? Recommend refuse (SC15). (b) Project-level
  exclusion: recommend no (SC2).
- **Q2.** (a) What a parent's "QA across descendants" dependency means when only some
  descendant types resolve QA: recommend matching descendants, refusing when none (SC16); a
  leaf with no resolved step reads as a leaf with no worked steps does today (this change
  does not touch the fold; ADR 0046's "every project step" becomes "every resolved step").
  (b) Required work item type: recommend no (SC3).
- **Q3.** (a) May space and project managers create organization-wide definitions? Recommend
  yes, only through `defineAndBindStep`, with renaming and defaults afterwards
  organization-level (SC20). (b) Reorder inherited steps per project: recommend no (SC4).
- **Q4.** _Settled 2026-10-25 by Dany: refuse, listing the pairs in the refusal and in a `dryRun` preview (SC17)._ (Was: refuse versus hide step nodes that would vanish.)
- **Q5.** _Settled 2026-10-25 by Dany: SC13 confirmed, E33 superseded._ (Was: the historical identity map revises E33's rejection of an alias table: confirm.)

## Risks / Trade-offs

- A type change on a leaf becomes a potentially refused write (SC17); fe-01 shows the count
  and fetches the pairs to clear from `step-nodes-in-use`.
- Divergent shared codes on dev need a survivor in the rules file; the report lists them,
  and the automatic identical merges, before anything is written.
- History readers depend on `step_identity_history` for merged ids for as long as old
  journals and saved plans are read (SC13, Q5).
