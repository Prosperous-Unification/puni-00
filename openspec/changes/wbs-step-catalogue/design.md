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

- **SC11. Every step keeps its id** (F1, F2; confirmed 2026-10-25). Each existing `step` row
  becomes the `step_definition` row with the **same id**, `origin = 'migration'`,
  `legacy_work_package_id` = its package, and one binding at its package's project for every
  type; its unit, allowance and `allowance_revision` become that package's
  `work_package_step` row. Foreign keys keep pointing at valid ids, so no fact row, journal
  entry, saved-plan body, `plan_event` or cache row changes for a step that is not merged
  (SC12). This removes the saved-plan rewrite F1 objects to: `saved_plan_body.bytes` stay
  immutable and `saved_plan.input_sha256`/`schedule_sha256` stay valid.
- **SC12. Identical shared codes merge; divergent ones wait for a rule** (F2, F11; revised
  2026-10-25 by the coordinator, confirmed the same day). Step rows of one organization sharing
  a code whose name, estimate unit and allowance are **all** equal merge automatically: the
  survivor is the row with the earliest `created_at` (NULL, from rows older than
  `20260901120000_add_audit_columns`, sorts after every value), then the lowest id, a stated
  total order rather than a default. Each such code is one `shared_code_identical` report
  row naming survivor and losers. An identical merge loses nothing, and every work package
  starts with `Dev` and `QA`, so ruling them would fill the dev rules file with no decision.
  Rows sharing a code with any differing field are one `shared_code` row listing the fields
  and refuse until the rules file (SC23) names the surviving step id. Merging, inside the
  migration, re-points the fifteen current foreign-key columns of the
  thirteen tables (inventory below) from each losing id to the survivor, re-keys the loser's
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
  Saved comparison keeps captured evidence separate from resolved meaning. Every side has an
  explicit comparison state: captured, or step-resolved with detached input, dependency and
  schedule meanings. The shared verified-plan path serves observed reads and legacy comparison;
  original bytes, hashes and header links are checked before identity translation. Current
  captures explicitly use captured meaning; there is no optional translator fallback.
  Connected `inputEvidence`, schedule bodies, stage bytes, question hashes and signatures remain
  captured evidence, including in detail responses and provenance summaries. Comparison meanings
  decode supported stage packets and translate only typed identity sites and their derived keys;
  they are not serialized back or presented as newly captured packets. Historical labels and
  opaque fields are preserved. Derived digest spelling may be normalized only when its packet
  change is explained by the supported format/identity projection; solver configuration, timing,
  membership and variant differences still compare. This path neither schedules nor rehashes
  translated packets. Missing trusted history and projected identity collisions refuse.
- **SC14. Storage transition** (F2; confirmed 2026-10-25). Not additive: it runs in the E14
  stop-the-world window with the backup as rollback, with a migration-lint waiver shaped
  like `20260831120000_rename_role_to_step`; the proposal's former "additive" constraint is
  withdrawn. The folder carries the foreign-keys-off marker; renaming `step` to
  `step_definition` (`ALTER TABLE … RENAME`) makes SQLite rewrite the thirteen current children's foreign-key clauses, the parent
  is then rebuilt to the SC1 shape, and an orphan count per column feeds the
  `CHECK (violations = 0)` guard before commit. The six triggers that join `step`
  (`claim_step_project_insert`/`_update`, `step_blockage_owner_insert`/`_update`,
  `step_parallel_owner_insert`/`_update`) are dropped and recreated against
  `step_definition` and `work_package_step`: the step must hold a row for the work item's
  package. `down.sql` (required by lint) renames back and restores `project_id` from
  `legacy_work_package_id` only while every definition is migration-origin and bound once,
  `step_identity_history` is empty and no fact lies outside its
  definition's legacy package; otherwise it refuses naming the first row, and the rollback
  is the backup. For task 1.2, reversing an unmerged database means restoring the original
  predecessor representation of each step, including its raw nullable code. An SC23 confirmation
  may promote a NULL code during apply; down must restore that original NULL, not carry the
  promoted code back or derive another value from the name. Preserve explicit lossless legacy-code
  provenance before promotion. A missing or incoherent provenance row is a refusal naming the step
  before destructive down statements, not permission to infer a value. Facts, historical JSON/hash
  bytes, IDs and the complete predecessor name/hash ledger retain their existing guarantees.
  This clarifies lossless unmerged rollback, not a claim that current private down already does it.
  Tests: `bin/assert-rename-window.sh` refuses with a live colour; restore
  from the backup is drilled in `verify.md`.
- **SC15. One project, different old sets: refuse, and no package gains a step** (F3; settled by Dany 2026-10-25, Q1a: "make sure no new steps for now"). Packages of one project whose old step sets differ cannot keep them under project bindings. The migration refuses with one `divergent_project_set` report row per project naming each package's codes, and there is no `expand` rule: the operator regroups the packages into projects whose packages share one set (or aligns the sets by hand) before `apply`, so after the migration every package resolves exactly the codes it had, no more and no fewer. Because `wbs-work-packages` slice 2 puts every existing package of an organization into one migration project, this migration cannot run for an organization until its packages are regrouped or their sets agree; the report says which. Automatic union is deferred until Dany asks for it.
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
  `typed_dependency` and `external_dependency` at either endpoint (parent-scoped references included), `step_blockage`
  and `step_parallel`. Applicability-changing paths: unbind, retype, type deletion (today it
  cascades its labels), moving a leaf or a package across projects, changing a project's
  space, deleting a space, undo/redo/restore and copy, and a leaf becoming a parent. One
  store-level check, evaluated in the writer's transaction by every such path and by every
  fact writer (`setEstimate`, `setActual`, … refuse `422 step_not_resolved`), refuses `409 step_nodes_in_use { count, pairs }`: `pairs` lists each vanishing (work item `id`, `name`, `stepId`, `workPackageId`) with the kinds of protected facts on it, the first 200 by package and rank, `count` the total. Every applicability-changing write (unbind, retype, type deletion, leaf and package move, space change, space deletion) accepts `dryRun: true` and answers `200 { wouldRefuse: 'step_nodes_in_use', count, pairs }` or `200 { wouldRefuse: null }` from a rolled-back transaction under the write's own permission, writing and announcing nothing; `GET …/step-nodes-in-use` stays for browsing a binding's usage. Issued-attempt counters are retained facts: they block removal, so attempt numbers are never reused. Rejected: dropping the facts (the schedule changes and nobody can tell why) and hiding the node with its facts (the data leaves every read).
  Clarification accepted 2026-11-18: A42 already retains a parent’s issued-attempt counter when copying it to its first child. Treat that retained address as an **allocator reservation**, separately from a visible leaf step node. Configuration admission checks the reservation against the parent’s own direct type/current chain and exact definition/WPS identity and values; it reports the parent’s actual tree rank with `attempt_issued`. It does not substitute a descendant type, filter away the parent, reset its counter, or defer invalidity until a later last-child deletion. Current leaf counter-only protection remains unchanged. An unrelated sibling/foreign reservation is not a global veto. This is a clarification of existing retained numbering history, not authorization for parent estimates, progress, measures or attempts. The alternative of allowing unbind and refusing only later revival was rejected because it admits invalid retained history and loses the original binding order needed for a precise configuration preview.

  First-child conversion must deepen the existing store-owned structural operation: capture all 13 protected families/current direct types and already-admitted incident receipts, construct the actual untyped child, validate every transferred address, then mutate in one same-writer savepoint or memory staged publication. A refusal leaves unrelated outer work committable and exposes no partial tree/fact state. Budgets stay on their existing parent owner; assignments, demands, claim satellites, endpoint identity and counters retain their established transfer semantics. Parallel facts without a lawful transfer refuse. Current undo/redo must use the same atomic transition, rather than replaying transient parent point rows through repeated working-plan refreshes. Existing remote incident admission/restoration remains the authority; captured receipts cannot manufacture permission. The first combined point-fact tests do not complete all-family, SQL, failure-recovery or history coverage.

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
        "uncoded": { "<stepId>": { "code": "deploy" } }
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

Current step-key inventory: `estimate.step_id`, `actual.step_id`, `step_progress.step_id`,
`step_measure.step_id`, `measure_estimate.step_id`, `step_node_attempt.step_id`,
`step_node_attempt_issued.step_id`, `assignment.step_id`, `claim.step_id`,
`step_blockage.step_id`, `step_parallel.step_id`, both `typed_dependency` step endpoints,
and both `external_dependency` step endpoints: fifteen columns in thirteen tables. The
external endpoints extend the original thirteen-column inventory and retain their paired
work-package/item/step composite ownership. Nullable whole endpoints name no step and are
not foreign-step facts. `plan_event.step_id` has no foreign key and remains SC13 historical
read translation only. Lease/revocation/delegation state lives on `claim`;
`claim_occupancy` keys on claim ids, untouched.

## Retained identity retirement (SC25)

Accepted implementation assumption under the standing authorization to resolve this change's remaining details; it closes the conflict between SC5's definition deletion and SC11/SC13/SC21's retained identity and package values. See [Step retirement preserves identity](../../../docs/adr/0085-step-retirement-preserves-identity.md).

`DELETE /api/organization/steps/:id` retires an active definition. It requires `organization.manage_settings`, conceals foreign/absent/already-retired definitions as `404 not_found`, and refuses `409 step_bound` while any binding names the definition. An unbound definition retires successfully whether it has no references, unused package values, a legacy merge alias, or immutable history. It never deletes the definition or those references. The HTTP result is 204; `GET /api/organization/steps` lists active definitions and active bindings only. Retirement is not unbinding, clearing facts, renaming, or permission to rewrite a stored plan.

The definition's id, code, organization, name, defaults, origin, legacy metadata and historical alias records are retained. Its code and name remain reserved in that organization, including after every package is removed; defining either again returns the existing precise `code_taken` or `name_taken` outcome. Retirement cannot be reversed through bind, defineMissing, rename, replay or an implicit fallback. A future explicit reactivation purpose, if wanted, requires its own contract and tests. This is deliberate namespace retention, not a hidden physical-deletion restriction.

Storage uses a required additive retirement relation keyed by definition id, with actual organization ownership and retirement audit. A missing retirement record is the modeled active state; a missing relation, malformed record, orphan definition or inconsistent ownership is a trusted-state failure. A paired down migration must refuse while retirement records exist rather than silently reactivate identities. Empty-state forward/down ownership and actual complete name/hash ledger restoration remain required. Do not edit migration117 or previously applied bodies.

The current catalogue read decodes selected identities and retirement metadata before projecting active entries. A binding that names a retired definition is corrupt trusted state, not an edge to filter away: public/current reads and admission must throw rather than silently omit it. Both insert and update of bindings must refuse retired identities on the actual same writer. Definition retirement and its final zero-binding check share the owned method-local transaction/savepoint, including when a borrowed caller catches a modeled refusal and commits unrelated work. Memory stages the same definition/retirement/binding graph before publication. All current Source/lifetime/queue guarantees remain required.

Historical readers deliberately retain physical identity access. SC13's saved-plan read translation still sees the retained survivor and old-id aliases; stored input/schedule hashes, raw JSON, command/event history, signatures, resource-use snapshots and runtime bindings remain unchanged. Current package projection still comes from live bindings and each package's explicit values; unused `work_package_step` rows are neither deleted nor replaced from definition defaults. Current point writes/restores against a retired step cannot resolve, and command replay refuses through its existing modeled stale/current-applicability boundary without reactivation. Frozen historical reads do not apply current active-catalogue filtering.

Import distinguishes an unknown code from a retired reserved code. A retired code is refused as a named `retired_step_codes` 422 with the affected codes, including with `defineMissing: true`; it is not silently recreated or bound. This response is a planned explicit contract requiring its own first owner before implementation. Definition PATCH and binding by retired id answer `not_found`, without revealing a foreign retirement record.

Required first owners beyond the initial mounted catalogue slice:

1. Actual current Source creates and binds a definition, materializes two packages, authors distinct package values/revisions, safely unbinds, retires via mounted HTTP, and observes active catalogue absence while the complete original definition and package rows remain exact. Repeated/foreign operations and code/name reuse are explicit outcomes.
2. A genuinely migrated merged-survivor fixture safely loses its final binding, then retires through current admitted authority. Actual saved-read alias translation and frozen body/hash verification remain unchanged; no fabricated survivor/history rows substitute for the existing genuine fixture.
3. Same-writer binding-versus-retirement serialization, a late native fault with full rollback, and a caught borrowed refusal followed by independent outer COMMIT. Memory publication and SQL savepoint omissions need their own observed state failures.
4. Corrupt selected retirement ownership/orphan/scalar metadata and a retained binding to a retired definition must reach production-path trusted-state negatives; removing each new/changed dependency must produce the intended failure before an adjacent Proof is added.
5. Actual import/replay behavior for retired codes/ids, plus active catalogue omission versus historical retention, before API/MCP/UI retirement is certified.

The additive SQL shape does not itself prove mixed-version runtime compatibility. Old binary bind/read behavior, migration window capabilities, deployment ordering, down refusal and disposal must be observed under their actual owners. No such gate, migration, runtime or R5 result is claimed by this design candidate.

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

`reorder` names exactly the scope's complete bindings across every type or is refused `409 stale_order` atomically. Missing, duplicate, extra and inherited/foreign-scope ids all refuse. The actual same-organization scope is resolved under the write loan before census; a foreign/absent scope is404. Keeping the existing total order (position, then binary binding id), including an empty scope, is a no-op and retains its ranks/revisions. A changed order writes positions10,20,… and advances every actually reached package/project once, including empty projects; definitions, explicit values and facts stay exact. It never reorders inherited bindings on behalf of a child scope.

The project step read uses the existing actual `ProjectChain`, never a made-up work-package identity or current package defaults. Under the standing authorization to settle remaining details, an absent `type` query selects the untyped mapping (SC3); a supplied nonempty value is an organization-owned work-item type id. Unknown or foreign type ids are404 after actual project admission. Empty, repeated or unknown query fields are400. The response is `{ steps: [{ stepId, code, name, via }] }`, listing every matching binding in SC18 order, with no package unit/allowance projection. The actual project’s `project.read` permission is sufficient even when the caller cannot read the organization-wide catalogue. Empty projects resolve without creating package rows or advancing revisions. Project read refusal matches the existing dedicated reader: a currently readable actual child makes a project shell visible and yields403 project.read; otherwise missing project.read conceals the project as404. Readable IDs and actual children are observed inside the same admitted owner before type lookup. Unrelated readable packages never establish shell visibility. SC22’s manifest separately enumerates the untyped default and every type mapping.

The binding DELETE body requires an explicit `{ dryRun: boolean }`. `true` answers200 with `wouldRefuse: null` or the bounded `step_nodes_in_use` count/pairs and rolls back; `false` applies204 or refuses409 with the same protected pairs. Both modes use the binding's stored scope under the write's permission, not a body-provided scope; malformed or omitted mode is422. Successful removal preserves explicit package values and publishes only after commit; preview/refusal publishes nothing.

## Open questions for Dany

- **Q1.** (a) _Settled 2026-10-25 by Dany: refuse until regrouped, no `expand`, no package gains a step (SC15)._ (b) Project-level exclusion: no (SC2); _settled 2026-10-25 by adopting the recommendation (Dany, 2026-10-25: "go with your best assumptions")_.
- **Q2.** _Settled 2026-10-25 by adopting the recommendations: (a) SC16, (b) no (SC3)._ (a) What a parent's "QA across descendants" dependency means when only some
  descendant types resolve QA: recommend matching descendants, refusing when none (SC16); a
  leaf with no resolved step reads as a leaf with no worked steps does today (this change
  does not touch the fold; ADR 0046's "every project step" becomes "every resolved step").
  (b) Required work item type: recommend no (SC3).
- **Q3.** _Settled 2026-10-25 by adopting the recommendations: (a) yes, through `defineAndBindStep` (SC20), (b) no (SC4)._ (a) May space and project managers create organization-wide definitions? Recommend
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


### Current119 retirement and catalogue cache ownership

The current runtime requires the additive 119 `step_retirement` relation and an applied-ledger header with the required exact name/timestamp and a lowercase64hex hash. This is required header presence/shape, not content agreement with a universal expected migration hash; actual folder/name/hash acquisition and rollback checks retain their existing independent owners. Its marker retains the physical117 definition, code/name reservation, WPS values and historical aliases. Present markers are decoded against the actual same-organization definition, organization and audit actor. Current binding projections reject a marker/binding combination as trusted corruption; they never silently filter the bad binding. The single-statement package projection carries the required profile columns in its own snapshot; other multi-statement captures borrow the actual existing transaction. Historical saved identity readers remain on their precise117 path and do not reinterpret saved bytes through active catalogue visibility.

Definition name/default edits, first definition/binding creation, new binding provenance and successful unbind advance each actually reached package and project revision once. Empty projects participate independently of package existence. Overlapping bindings deduplicate affected IDs. Results return sorted actual `workPackageIds` and `projectIds`; an exact metadata no-op returns two empty lists and writes nothing. Preview/refusal performs no touch. Existing WPS unit, allowance and allowanceRevision remain untouched. Retirement writes only its immutable marker after a strict unbound check; it performs no definition/cache/value touch.

The memory Source clones its entire graph once, preserving shared table aliases. The retirement map belongs to that same staged graph and complete commit publication. Neither per-field clone reconstruction nor an old Step DTO shadow supplies current retirement or package values. SQL fixture acquisition uses the authentic private117 transition followed by ordinary118/119 folders and their full applied name/hash ledger. Genuine merged-history tests keep the original117 artifact and apply later additive folders normally.

Native119 guards require same-organization physical identity, an existing audit user, no active binding, immutable markers and no implicit binding reactivation. Its paired down refuses any recorded retirement before schema or ledger change; an empty marker relation can be reversed without deleting definitions/WPS. No117/applied SQL is edited.

This private source cohort does not certify mixed-version deployment. Additive staging alone cannot teach already-running older readers to hide retirement markers. Retirement activation requires the explicit rollout/drain/current-profile boundary from SC25; no host/session authority is invented by a lower store or fixture. Exact retired-code import/replay refusal, migration-guard omission proofs, active-corruption variants and current-profile rollout owners remain separate verification obligations. Physical namespace uniqueness already keeps retired names/codes reserved; active catalogue DTOs do not expose a retired record as an unknown-code substitute.

Project usage browsing is distinct from a single-binding unbind preview: redundant inherited bindings do not hide existing usage. A required internal catalogue read captures all actual organization package/type/definition/fact evidence on its current owner, including both external endpoints. The existing pure protected-pair projector validates that complete evidence and compares against removal of all bindings naming the requested step. A final explicit selection retains only the actual addressed project's currently readable packages and the selected step before computing count/order/the200pair cap. Private child names and counts follow the existing project reader's visibility policy. Mutating unbind safety retains its complete protected census. Missing/foreign/unreachable step ids answer404 after same-owner project admission; project-shell403, hidden404 and query400 match project steps. No writes, revisions or notifications follow a usage read.


SC22 wire details, settled under standing authorization: the project step manifest is `{version:1,project:{id,revision},default:[code,...],types:[{workItemTypeId,codes:[code,...]},...]}`. Type entries enumerate every actual organization-owned type, in binary ID order, even without a type-specific binding. Work-item types have stable IDs and display names, not a separate code; type mapping addresses therefore use IDs. The array keeps a legitimate type ID `default` distinct from the untyped default mapping. Codes retain SC18 resolution order and may be empty. Foreign types and sibling-only bindings never appear. Project.read alone permits this applicability metadata; package private fields, units, allowances and names are absent. Revision, actual project chain, current type ownership and bindings must come from the same admitted owner, including empty projects. No package or values are invented, and the read advances no revision or announcements. Burokrat's offline consumer and revision-naming binding format remain required by task2.3; this API wire refinement does not complete that task.


SC22 revision completeness also includes organization work-item type membership. A successful scoped creation/removal that changes the actual owned type set advances every actual project in that organization once, including empty projects, inside the same writer. Idempotent creation, refusals and rollbacks do not advance revisions; foreign projects and explicit package values remain unchanged. This is required because the manifest enumerates every owned type, even without typed bindings. The existing directory write path currently lacks this invalidation; a mounted directory-command regression must fail before the implementation is changed. The offline Burokrat consumer remains required after this producer invariant is established.


The type-set invalidation joins the directory writer at its actual ownership transition: `mapInOrganization` now requires the original write stamp and atomically writes a type mapping plus each actual organization's project revision. Non-type mappings preserve revisions. Type deletion captures its actual mapping before removal and advances those projects inside its existing transaction only after successful removal; explicitly unowned legacy roots retain legacy behavior. The shared target capture includes empty projects and excludes foreign organizations; no global catalogue activation or package mutation is needed merely to advance these project tokens. Standalone forwarding retains the stamp before any queued owner.


### SC22 offline consumer format and compatibility

Under standing authorization, extend the existing offline validation flow with `validate workflow-binding <file> --manifest <file>`. Preserve the strict version1 binding, `--steps` grammar, acceptance schema1 reader and existing digest bytes. The manifest consumer uses a distinct version2 binding: `{version:2,project:{id,revision},default:[{code,class}],types:[{workItemTypeId,steps:[{code,class}]}],classes:{...}}`. Stable IDs and codes are nonempty strings; arrays allow valid IDs such as default, constructor and whitespace without treating them as object properties. Duplicate type IDs or codes refuse before lookup. Classes retain existing strict executor/model/path validation; an empty class dictionary is valid only when no mapped class is needed.

The manifest is strict JSON matching the producer version1 wire. Default mapping must cover exactly its untyped codes. Every actual owned type uses its entire explicit mapping or the entire default mapping, checked against that type alone; never fill an incomplete explicit mapping from default. Unknown binding types and dangling classes refuse. Compare both exact project ID and safe nonnegative revision before coverage. Empty manifests/mappings are valid. Missing and unreadable manifest files remain distinct, nonregular files refuse before opening, malformed UTF-8/JSON/schema refuse, and no network is used. Binding YAML/prompt containment/UTF-8/original-byte rules remain unchanged.

Type entry order and binding mapping presentation order are nonsemantic and canonicalize in binary UTF-8 order. Manifest code order is SC18 behavior and remains ordered. A separate schema2 acceptance snapshots the canonical binding, canonical manifest, manifest digest and original prompt byte descriptors; its digest includes all of them. The old schema1 acceptance reader and RunStore behavior remain strict and unchanged. A distinct schema2 reader validates descriptor coverage and recomputes the manifest digest before reconstructing acceptance. This introduces no runtime execution authority. Shared class/prompt decoding is reused with unchanged version1 behavior; no synthetic type/code mapping is introduced to bypass the legacy checker.

Tests first exercise the actual exported command helper, typed/default/literal-default coverage, project/revision mismatch, empty mappings, real file permission failures, prompt-byte and manifest-content digest changes, and presentation invariance. Then add strict decoder/acceptance cases and actual Burokrat/PUNI grammar integration. Required negatives independently omit type checking, project/revision equality, exact coverage, uniqueness, descriptor and digest checks, plus changed shared boundaries. Astra follow-up remains required and currently unavailable; no parent task is closed by this design refinement.
