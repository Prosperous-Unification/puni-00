Every refusal and omission ships with a production-path negative watched red with the
check removed, then an adjacent `Proof:` comment (R5). Runs after `wbs-work-packages`
slices 1–3a (#723) and the set membership of #724, and replaces `wbs-work-packages` slice
3b; nothing merges until Dany lifts the 2026-10-25 hold.

## 0. Decisions

- [x] 0.1 Q1–Q5 settled 2026-10-25 (Q1a, Q4, Q5 by Dany; Q1b, Q2, Q3 and SC11, SC12, SC14 by
      adopting the recommendations, Dany, 2026-10-25: "go with your best assumptions"). SC1–SC24 stand, overrulable by id.

## 1. Catalogue, bindings, resolution, migration

- [ ] 1.1 `step-catalogue-cli.ts report` and `apply --merge-rules=<file>` (SC23) and
      migration `add_step_migration_report` — test: `step-catalogue-report.db.test.ts` on a
      dev-shaped fixture: one row per `shared_code_identical`, `shared_code`, `uncoded`,
      `name_clash`,
      `divergent_project_set`, `type_conflict_leaf`, `foreign_package_fact`, and no other
      table changed; `apply` refuses a missing, unreadable, malformed and stale file, each
      separately; negatives: drop the fingerprint comparison and a stale file applies; drop
      the uncoded confirmation and a derived code lands silently; make one field (the
      allowance) of an identical pair differ and the automatic merge stops and reports
      `shared_code`; watched.
- [ ] 1.2 Migration `add_step_catalogue` (SC11, SC12, SC14, SC15) under the E14 window with
      its lint waiver — test: `step-catalogue-migration.db.test.ts`: every unmerged step keeps
      its id and every fact answers unchanged; journal, saved-plan, `plan_event` and cache
      bytes are byte-identical; a ruled merge re-points all thirteen columns (one fixture
      fact per column) and keeps each package's unit, allowance and `allowance_revision`;
      the six recreated triggers refuse a step without a row for the work item's package;
      `down.sql` reverses an unmerged database and refuses after a merge or an authored
      binding; negatives: drop one re-point (`step_parallel`) and the orphan guard
      refuses naming it; drop the divergent-set refusal and W1 silently gains `qa`; a rules file carrying an
      unknown `projects` key is refused as malformed; drop a
      recreated trigger and a cross-package claim inserts; watched.
- [ ] 1.3 History readers (SC13): saved-plan input and schedule, journal payload, inverse
      and preconditions (`step:<id>`, `estimateUnits`, `moveProgress`), `plan_event`,
      `optimized_schedule_cache`, `event_log` replay — test: production readers on a merged
      fixture, plus a tampered body that still fails its hash; negatives: drop translation
      and the saved plan read throws naming the loser; write translated bytes back and the
      byte-identity assertion fails; a live write naming the loser is `404`; watched.
- [ ] 1.4 `@wbs/domain` `resolveSteps(chain, typeState, bindings)` (SC2, SC3, SC18, SC19)
      — test: property over random chains and bindings (union, dedupe, every-type reaches
      every type, typed only its type, conflict resolves nothing, order total and stable
      under input permutation); negatives: drop the type predicate and a `story` step
      resolves for a `spike`; drop the binding-id tiebreak and a permutation reorders;
      watched.
- [ ] 1.5 `StepCatalogue` port, `step_binding` with `type_key` uniqueness and the
      same-organization trigger, `work_package_step` rows of SC21 on both stores through
      conformance — test: an empty package gets the union rows; a binding add, a package
      move and a space change add rows; unbinding keeps them; a missing row throws
      `WorkPackageStepMissing`; negatives: drop `type_key` from the index and a mounted
      duplicate every-type write succeeds; skip the write on move and the read throws;
      watched.
- [ ] 1.6 SC17 invariant in every applicability-changing path and fact writer — test: one
      case per protected fact (twelve) against an unbind, plus retype, type deletion, leaf
      and package move, space change and deletion, undo/restore, copy and leaf-to-parent,
      and two concurrent writers (one admits a fact, one unbinds) of which exactly one wins;
      the refusal's `pairs` and `count` on a 201-pair fixture (200 listed); `dryRun: true`
      on each applicability-changing write answering the list from a rolled-back
      transaction; negatives: drop the attempt-issued clause and a counter-only node
      vanishes; drop the check from `setStepBlocked` and a blockage lands on an unresolved
      pair; drop the dry-run rollback and a retype persists after a preview; drop the
      `pairs` query and the refusal lists nothing with `count: 1`; watched.

## 2. Routes, commands, documents

- [ ] 2.1 `@wbs/contracts` shapes and be-01 routes of design.md "Routes" with SC20
      authorization at the scope id; removal of `postApiProjectsByIdSteps`,
      `patchApiProjectsByIdStepsByStepId`, `deleteApiProjectsByIdStepsByStepId` and their
      mcp-01 tools (README count asserted, SC24) — test: route tests per refusal,
      `defineAndBindStep` atomicity, cross-organization and sibling-project negatives,
      `reorder` with a stale list, `step-nodes-in-use` pairs; `contracts-boot-memory.test.ts`
      under 500 MB; negative: check the permission at the organization instead of the project
      id and the sibling manager binds; watched.
- [ ] 2.2 Tree and work package reads carry resolved steps with every matching binding
      (SC9); plan document +1 and saved-plan input +1 with converters; import
      reconciliation (SC24) — tests: `plan-document-shapes.test.ts`,
      `canonical-plan-input.test.ts`, `plan-reference.test.ts`, a document round trip, an
      import with an existing, an unbound and an unknown code; negatives: drop the converter
      and the previous fixture fails `unsupported_version`; drop the unknown-code refusal
      and a definition appears without `defineMissing`; watched.
- [ ] 2.3 Step manifest route and `twib validate workflow-binding --manifest <file>`
      (SC22), coordinated with #601's task — test: every type and code pair and the default
      mapping validate offline; another revision refuses; negative: skip the per-type check
      and `story.research` passes; watched.

## 3. Scheduler

- [ ] 3.1 Per-leaf slices, zero-step boundary and descendant-step over matching
      descendants (SC16) in `slicesOf` and `slice-edges.ts` — tests: the spec's mixed
      subtree and no-match scenarios, a cycle through per-leaf graphs, a saved plan
      scheduled through SC13, Fast and solver agreement on the mixed fixture; negatives:
      keep the package-wide order and the spike leaf gains a `qa` slice; drop the boundary
      slice and a whole dependency on a zero-step leaf has no endpoint; watched.

## 4. fe-01

- [ ] 4.1 Settings → Steps at organization, space and project: definitions, bindings per
      type with provenance, "add step here" (`defineAndBindStep`), binding reorder, refused
      unbind listing the pairs from `step-nodes-in-use`; the work item type picker warns
      before a type change that would refuse (SC17); conflict leaves render flagged; the
      estimates table shows only resolved steps per leaf — Playwright scenarios; rendered
      states for loading, empty and query failure.

## 5. Verify

- [ ] 5.1 `verify.md`: commands, outputs, R5 proofs; dev window: `report`, rule every row,
      `apply` under the heavy lock with a backup (E14), restore drill from that backup,
      confirm every work package's trios unchanged.
