Every refusal and omission ships with a production-path negative watched red with the
check removed, then an adjacent `Proof:` comment (R5). Runs after `wbs-work-packages`
slices 1–3a and replaces its slice 3b; nothing merges until Dany lifts the 2026-10-25 hold.

## 0. Decisions

- [ ] 0.1 Dany answers Q1 (project-level exclusion: recommend no), Q2 (required type:
      recommend no), Q3 (reorder inherited steps per project: recommend no), Q4 (refuse
      versus hide step nodes that would vanish: recommend refuse) and confirms or amends
      SC1–SC10 (design.md). Slice 1 waits for Q4 and SC1–SC4; slice 2 for Q1–Q3.

## 1. Catalogue, bindings, resolution

- [ ] 1.1 Migration `add_step_catalogue`: `step_definition`, `step_binding`,
      `work_package_step`, `step_merge_conflict` report table, the merge of each
      organization's package steps by code, project-scope bindings for every type, re-key
      of every step-keyed table and the `json_set` rewrite of journals and saved-plan input
      bodies (E33), refusal on an unrecognised payload shape and on an unresolved merge
      conflict without `--merge-rules`; `down.sql` refusing outside migration-origin rows —
      test: `step-catalogue-migration.db.test.ts` on a dev-shaped fixture (two packages
      sharing `qa` with equal rows merge; two with different names refuse and report; every
      leaf resolves its old set; estimates, progress, measures, attempts, blockages and
      parallels answer the same through the renamed keys; a replayed journal names no old
      step id); negatives: drop the conflict refusal and a differing `qa` is merged
      silently; drop one re-key statement (`step_blockage`) and the blockage read throws
      on a dangling id; drop the down guard and a route-origin binding is deleted; watched.
- [ ] 1.2 `@wbs/domain`: `resolveSteps(chain, workItemTypeId | null, bindings)` pure, with
      provenance and SC4 order — test: property over random chains and bindings (union,
      dedupe, NULL-type bindings reach every type, typed ones only their type, order
      stable); negative: drop the type predicate and a `story` step resolves for a `spike`;
      watched.
- [ ] 1.3 Store ports `StepCatalogue` (definitions, bindings) and the `work_package_step`
      rows written on `createWorkPackage`, `moveWorkPackage` and binding writes (SC6), on
      both stores through conformance — test: a new package has one row per resolved step
      with the definition's unit and allowance; a read of a missing row throws
      `WorkPackageStepMissing` (never defaults); negatives: skip the write on move and the
      read throws; replace the throw with the definition's default and the test fails;
      watched.
- [ ] 1.4 SC7 refusals in the store's transaction: unbinding, `setWorkItemType`,
      `moveWorkPackage`, `moveWorkItem` across projects refuse `409 step_nodes_in_use { stepId, count }` while data exists for a vanishing pair; `setEstimate` refuses
      `422 step_not_resolved` — test: each write against a leaf with one estimate on the
      vanishing step; negatives: drop the existence query and the estimate becomes
      unreachable (the leaf's trio read then throws on the orphan, watched as the proof that
      the refusal is what keeps it reachable); watched.

## 2. Routes, commands, documents

- [ ] 2.1 `@wbs/contracts` shapes and be-01 routes of design.md "Routes" with SC5
      permissions (`organization.manage_settings` from `wbs-permissions` P19,
      `organization.manage_spaces`, `project.manage_settings`, `package.manage_settings`),
      `409 step_bound`, `409 step_nodes_in_use`, `422 step_not_resolved`; removal of the
      package-level `addStep`, `renameStep`, `reorderSteps`, `deleteStep` plan commands and
      their mcp-01 tools (README count asserted) — test: route tests per refusal;
      `contracts-boot-memory.test.ts` under 500 MB.
- [ ] 2.2 Tree and work package reads carry resolved steps with provenance (SC9); plan
      document +1 and saved-plan input +1 with converters; Navigator reads the new version,
      Burokrat admits it — tests: `plan-document-shapes.test.ts`, `canonical-plan-input.test.ts`,
      `plan-reference.test.ts`; negatives: drop the converter and the previous fixture fails
      `unsupported_version`; watched.
- [ ] 2.3 `twib validate workflow-binding --steps <codes> --type <type>` reads
      `GET /api/projects/:id/steps?type=` (SC10) — test: a binding naming a code outside
      the type's resolved set fails validation; negative: drop the type argument and the
      code of another type passes; watched.

## 3. fe-01

- [ ] 3.1 Settings → Steps at organization, space and project: definitions, bindings per
      type with provenance, "add step here", refused unbind with the pairs to clear; the
      work item type picker warns before a type change that would refuse (SC7); the
      estimates table shows only resolved steps per leaf — Playwright scenarios; rendered
      states for loading, empty and query failure.

## 4. Verify

- [ ] 4.1 `verify.md`: commands, outputs, R5 proofs; dev window: run the migration on dev
      under the heavy lock with a backup (`wbs-work-packages` E14 shape), rule the merge
      conflicts the report lists, confirm every work package's trios unchanged.
