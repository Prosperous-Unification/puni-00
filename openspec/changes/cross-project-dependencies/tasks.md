# Cross-project dependencies implementation tasks

Implements [proposal.md](proposal.md), [design.md](design.md), and the eight
[delta capabilities](specs/). This is the implementation plan; do not create
`plan.md`. The checkboxes track completed slices. New external authoring stays dormant
until the complete reader/writer runtime capability is active.

For each checkbox: write and run its named failing behavior tests, implement the
production seam, then rerun green. Each safety check also needs a watched
production-path negative: remove that check or break its dependency, observe
the specified test fail, restore it and rerun green. Record the exact fault,
command, assertion and restoration in [verify.md](verify.md); add adjacent
`Proof:` comments only after observation. Planned negatives are not evidence.
Read callers, existing tests and scoped README/check contracts before changes.
Update composition, barrels and conformance fakes with their owning slice.

## Execution contracts and parallel ownership

These interfaces are planned additions, not existing exports:

- Grammar slice 1.1 owns `parseProjectAbbreviation(value: string)` returning
  `{ ok: true; abbreviation: string } | { ok: false; reason: 'invalid_abbreviation' }`,
  `suggestProjectAbbreviations(name: string): readonly string[]`, and
  `parseWorkItemAddress(token: string)` returning
  `{ kind: 'local'; reference: string } | { kind: 'qualified'; abbreviation: string; reference: string } | { kind: 'invalid' }`.
  Reference parsing reuses current work-item/step grammar. These functions do
  no lookup/allocation; suggestions contain only 3–5 uppercase ASCII letters.
- Unified relationship slice 4.1 adds explicit `projectId` to scoped endpoint
  values while retaining `DependencyEndpoint` scopes/IDs. The stored row's
  `projectId` remains the successor owner. Extend `TypedDependencyStore` with
  `listIncident(projectIds: readonly string[]): Promise<StoredTypedDependency[]>`;
  owned reads combine existing local and additive external rows. Local clients
  adapt with the already-known project, never an inferred foreign owner.
- Capture slice 5.1 introduces `ConnectedPlanCapture` with detached project-owned
  `PlanInputReads`, incident relationships, mode/rank, labels and identities.
  Extend `ChainSnapshot`/`LivePlanRead` with an explicit connected branch;
  `captureConnected(projectId: string): Promise<ConnectedPlanCapture>` runs only
  under authorized read snapshot or borrowed write transaction.
- Graph slice 4.3 owns a domain `ConnectedGraphInput` containing project-local
  resolved trees/step nodes/edges and scoped external relationships;
  `resolveConnectedGraph(input: ConnectedGraphInput)` returns a domain graph.
  Placement slice 6.1 owns domain `ResolvedScheduleInput` and pure
  `scheduleResolved(input: ResolvedScheduleInput)`. Domain code imports no core
  capture types. Core adapts `ConnectedPlanCapture` into these domain inputs;
  core `deriveConnectedPlan(capture: ConnectedPlanCapture, scheduler:
CapturedScheduler)` orchestrates capture-derived optimization and projection.
  Its output is a complete detached component projection or explicit
  engine/calendar unavailability; authored relationships and readiness remain
  inspectable when calendar placement is unavailable.
- Solver slices 7.1–7.3 provide captured stage inputs with fixed foreign starts,
  incoming/outgoing FS/SS/FF bounds and occupancy, immutable question identity,
  and terminal `boundary-infeasible` certificate. HTTP/cache/Python discriminate
  this from invalid authored plan, corrupt output and required-engine absence.

Graph guard observation and complete scheduling capture are separate boundaries:
4.3 reads minimal authored graph facts inside the existing admitted transaction,
then uses the same domain resolver as full capture. Its resulting-state guard
waits for this minimal observation and 4.2 admission, never for 6.1 scheduling.
5.1 can build and test capture/lifetime foundations in parallel, but its live
connected projection remains unchecked until 6.1 supplies actual derivation.
No fake schedule or old shared-chain representation closes that integration.

Safe initial parallel work: **1.1** owns only new pure grammar files/tests and
its domain barrel export; **2.1** owns abbreviation migration, SQLite allocator,
schema and DB tests. They share no edit ownership. **2.2** integrates their
interfaces into project ports/contracts/composition. After **4.1**, command
admission **4.2** and connected capture **5.1** can proceed independently;
resulting-state guards use the minimal authored observation and admission. After **6.1**, solver wire/Python work and
frontend lookup can proceed separately. One integrator owns shared barrels,
composition, `work-item.resource.ts`, `chain-snapshot.ts`, migration identities
and solver versions. Do not schedule competing edits to those files.

The WBS delivery packages map to the headings below. Each checkbox is a coherent
TDD slice and independent review unit, not a two-minute keystroke.

### Task 1: Pure abbreviation and address grammar — WBS 010.02

- [x] 1.1 Create `libs/wbs/domain/domain/src/project-address.ts` and `project-address.test.ts`; export via the domain barrel. Manual codes normalize lowercase and match `^[A-Z][A-Z0-9_-]{0,19}$`; generated suggestions use 3–5 letters. Split qualified addresses on the first dot and reuse `step-reference.ts` plus existing numeric grammar. Tests: `accepts one and twenty character manual abbreviations`, `rejects leading digits dots and twenty-one characters`, `suggests only three to five ASCII letters`, `parses PUNI-CORE.080.39 and PUNI_CORE.020.s1-dev`, `keeps 010.s1-dev local`, `rejects empty qualified endpoints`. Negative: remove each character/length/delimiter guard independently and observe its test fail via exported parser; slice 2.2 also exercises grammar through HTTP admission.

### Task 2: Additive abbreviation storage and project integration — WBS 010.03

- [x] 2.1 Create `apps/wbs/be-01/drizzle/20261022210000_add_project_abbreviations/{migration.sql,down.sql}`, `libs/wbs/adapters/store-sqlite/src/project-abbreviation.ts`, `project-abbreviation-migration.db.test.ts`, and schema entries. Confirm the migration identity is unused before creation. Transactionally backfill every project, enforce project and namespace/code uniqueness, allocate atomic five-letter counter codes for old inserts, skip occupied generated codes, refuse exhaustion, and move namespace in the organization-mapping transaction. Tests: `backfills every project`, `old writer insert allocates five letters`, `concurrent old and new writers never collide`, `organization mapping moves namespace atomically`, `manual uniqueness is organization scoped`, `allocator skips occupied codes and refuses exhaustion`, `rollback preserves old project rows`. Negatives: disable allocator/namespace trigger or uniqueness index independently and run actual migrated old-writer/concurrent insert tests; compare full forward/down name/hash ledger and stored rows rather than trusting exit status.
- [x] 2.2 Integrate required abbreviation through `libs/wbs/application/core/src/ports/{project-values.ts,project-store.ts}`, `module/project/project.resource.ts`, `libs/wbs/adapters/store-sqlite/src/project.ts`, and `libs/wbs/domain/contracts/src/http/{project-shapes.ts,project-response.ts}`. Allocate suggestions on creation, validate manual edits once at boundary and refuse missing/malformed trusted abbreviation rows without generating a read fallback. Update project conformance fixtures/composition in this slice. Add `apps/wbs/be-01/src/controller/project-address.controller.db.test.ts`: `creates and normalizes abbreviation`, `duplicate manual edit is a typed conflict`, `rename preserves stable project and relationship identities`, `absent and malformed abbreviation rows refuse reads`, `foreign organization cannot edit code`. Negative: bypass boundary grammar, duplicate translation, trusted-row guard and organization predicate independently and watch mounted controller tests fail.

### Task 3: Authorized lookup and shared contracts — WBS 010.04

- [x] 3.1 Add `libs/wbs/application/core/src/ports/project-address-search.ts`, `libs/wbs/adapters/store-sqlite/src/project-address-search.ts` and HTTP shapes/routes beside current project/work-item routes. Return bounded authorized project identity/abbreviation/name and scoped endpoint/step metadata; exact qualified lookup resolves stable IDs. Extend `apps/wbs/fe-01/src/lib/wbs-api.ts`. Add `apps/wbs/be-01/src/controller/project-address-search.controller.db.test.ts`: `alphabetic prefix is bounded and organization scoped`, `manual punctuation and lowercase resolve`, `selected project scopes steps and work items`, `numeric input is not external discovery`, `foreign and absent addresses have identical refusal`. Negative: remove organization/project predicates, response bounds or boundary grammar separately and observe mounted search tests leak, mis-scope or admit malformed input. Search results confer no write capability.
- [ ] 3.2 Extend existing dependency/command HTTP shapes under `libs/wbs/domain/contracts/src/http`, `document-from-shapes.ts`, core HTTP handlers and backend controller composition with explicit stable project IDs. Preserve local payload interpretation and batch aliases. Propagate typed endpoint/not-found/conflict, calendar-unavailable and optimization outcomes. Update OpenAPI and generated MCP tools using `apps/wbs/mcp-01/README.md`. Tests: existing shared shape suites plus `apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts` cases `HTTP and MCP admit equivalent external endpoints`, `old local payload keeps its meaning`, `unknown scope SF and malformed IDs refuse`. Negative: remove shared shape validation and demonstrate refusal fails through mounted HTTP/MCP paths, not a duplicated validator.

Task 3.2 transport reconciliation (2026-10-23): shared command shapes,
generated MCP transport, local aliases/history, consented scoped writes and
calendar/optimization outcomes are implemented and mapped to integrated
acceptance in [verify-task-3.2-closure.md](verify-task-3.2-closure.md). This
supersedes the transport gaps in the earlier source audit and historical bounded
packets. Task 4.2 retains its complete authority matrix; Tasks 10.x retain
capability negotiation and activation. The 3.2 checkbox remains open pending the
configured MCP suite rerun, root review and the integrated exact-SHA host gate. No runtime behavior changes
in this reconciliation.

### Task 4: Unified relationships, admission and actual graph — WBS 010.05

- [x] 4.1 Create `apps/wbs/be-01/drizzle/20261022211000_add_external_dependencies/{migration.sql,down.sql}` after confirming the identity is unused. Extend `libs/wbs/adapters/store-sqlite/src/{schema.ts,typed-dependency.ts}`, `libs/wbs/application/core/src/ports/typed-dependency-store.ts`, `libs/wbs/domain/domain/src/typed-dependency.ts` and conformance typed store. Preserve local rows; add both endpoint project IDs, successor ownership and incident indexes; enforce work-item/project, step/project and organization consistency. Implement owned/incident unified reads and atomic local↔external updates preserving relationship ID. Extend `typed-dependency.db.test.ts` and add `external-dependency-migration.db.test.ts`: `combines local and external rows`, `lists both incident directions once`, `representation move preserves identity`, `rejects cross-project mismatched endpoints and foreign organizations`, `duplicates refuse across representations`, `down preserves local rows`. Negatives: remove each ownership/duplicate check separately and observe production repository write/read tests fail; corrupt required endpoint evidence and prove the reader throws.
- [ ] 4.2 Extend `libs/wbs/application/core/src/module/plan-commands/{command-references.ts,admitted-scope.resource.ts,working-plan-edges.resource.ts,run-command-batch.ts}` and direct commands in `module/work-item/work-item.resource.ts`. Revalidate successor edit access, predecessor read access, same organization and endpoint shape inside the transaction. Keep a batch scoped to one successor owner. Add `apps/wbs/be-01/src/controller/cross-project-dependency-commands.controller.db.test.ts`: `restricted readable predecessor needs no edit permission`, `foreign and absent endpoint return same not found`, `revocation after lookup refuses`, `second successor owner refuses`, `local aliases remain local`, `remote step ownership refuses`. Negatives: bypass each access/owner/shape predicate independently, watching mounted command tests incorrectly succeed; assert no relationship, revision, history or event changed on refusal.
  - Descendant-step HTTP/generated MCP parity sub-slice: both leaf timing orders, local parent alias, persisted endpoint/journal identity, dormant and atomic refusal cases now have mounted evidence in [verify-descendant-command-parity.md](verify-descendant-command-parity.md). The broader access/shape matrix and activation remain open.
  - [x] Bounded active generated MCP authority acceptance: restricted readable node SS add/FF update retains identity, history and connected read parity; queued machine-credential revocation and successor restriction refuse external updates with complete table/publication atomicity. Three independent production faults were watched failing. [Evidence and remaining intersections](verify-active-mcp-authority.md). Parents 3.2/4.2 and activation remain open.
  - [x] Bounded queued successor edit revocation proof: mounted external add/update/remove all recheck the other-owned successor after a separate writer changes access, return 403 and preserve durable state/publications. The production guard's forbidden branch was independently removed and all three cases failed with unsafe 200 responses. Evidence: [successor edit revalidation](verify-4-2-successor-edit-revalidation.md). Complete 4.2 and production activation remain open.
- [x] 4.3 Add `libs/wbs/domain/domain/src/connected-step-node.ts` / `connected-step-node.test.ts`, `libs/wbs/application/core/src/service/connected-dependency-graph.ts`, and extend `service/dependency-graph.ts`. Resolve each project's tree/steps/legacy depReach before combining typed external edges and provenance. Wire resulting-state validation into direct/batch commands (`module/plan-commands/plan-command-graph.ts`), moves, hand-down, step edits/removal, reach changes and estimate presence changes. Add `apps/wbs/be-01/src/controller/cross-project-dependency-graph.controller.db.test.ts`: `accepts A.design B.build A.test`, `rejects genuine reverse cycle and self-node`, `distinct tasks can close remote cycle`, `remote scopes expand under their own trees and steps`, `move step edit reach and estimate anchor changes revalidate final graph`, `batch rollback preserves every affected revision`. Negatives: omit one expanded pair, use project-name cycle refusal, use target reach for all projects, and bypass each structural guard call separately; observe the named real graph/controller tests fail.
- [ ] 4.4 Extend incident lifecycle and compensating history in `module/work-item/work-item.resource.ts`, `ports/command-journal-values.ts`, typed store and project deletion. Refuse deletion of referenced external predecessors/projects; successor deletion removes owned relationships undoably; hand-down maps incident step facts without changing authored scope. Add `apps/wbs/be-01/src/controller/cross-project-dependency-lifecycle.controller.db.test.ts` and `cross-project-dependency-history.controller.db.test.ts`: `predecessor deletion refuses`, `successor deletion removes only owned links`, `first child inherits external endpoint`, `incident touched identities journal together`, `undo refuses newly formed remote cycle`, `redo revalidates current access and endpoint ownership`, `concurrent endpoint edit refuses compensation`, `undo representation move restores same ID`. Negatives: remove deletion refusal, incident mapping, touched-ID conflict guard and each replay graph/access check independently; mounted tests must catch unsafe success and verify atomic refusal across journals/revisions/events.
  - [x] Bounded mounted remote endpoint compensation acceptance: real incoming predecessor/outgoing successor edits independently refuse first-child undo/redo with all-table selected-prune and publication evidence. Disabling only the replay revision comparison made all four mounted cases return unsafe 200. [Receipt and limits](verify-4-4-remote-replay.md). Parent 4.4 and activation remain open.
  - Mounted incident replay sub-slice proves restricted successor deletion, first-child hand-down, exact undo/redo receipts and corrupt journal atomic refusal; see `verify.md`. The remaining replay guards and parent task stay open.
  - Mounted neighboring-history proof covers a newer B replay followed by stale older B undo after a real intervening remote A edit; the older entry is pruned without relationship mutation or publication. A watched `WorkItemService.rebase` fault turned that undo into unsafe 200. Evidence: [mounted history neighbors](evidence/mounted-history-neighbors/README.md). Parent 4.4 remains open.

### Task 5: Coherent capture and live invalidation — WBS 010.08

- [x] 5.1 Extend `libs/wbs/application/core/src/ports/{chain-snapshot-store.ts,shared-people-values.ts,saved-plan-capture-values.ts}`, `libs/wbs/adapters/store-sqlite/src/{chain-snapshot.ts,saved-plan-capture.ts,captured-optimization-reader.ts}`, and add `service/connected-plan-values.ts` under core. Capture incident dependency closure and, in shared mode, shared-person connections in both directions; each project is captured once with its own complete scheduling/progress/label facts. Keep authorization, closure, derivation and sequential cache selection in one snapshot for externally connected isolated/shared reads; ordinary isolated/legacy reads retain existing detached lifetime and avoid unrelated ranks/projects. Borrowed command reads include staged writes and never close the owner transaction. Extend `chain-snapshot.db.test.ts`; add `connected-plan-capture.db.test.ts`: `concurrent predecessor edit yields one coherent state`, `connected isolated capture excludes concurrent cache publication`, `ordinary isolated lifetime is retained`, `closure follows both incident directions and shared bridges`, `required absent unreadable malformed facts refuse`, `borrowed capture sees staged writes`, `success modeled refusal and throw close exactly once`, `capture never admits solver work`. Negatives: remove BEGIN, defer cache/derivation past close, swap borrowed connection, omit closure, bypass authorization or omit close separately; watch production-factory tests fail, including concurrent cache publication after BEGIN remaining invisible until the next observation.
- [ ] 5.2 Extend `libs/wbs/application/core/src/service/shared-people-fanout.ts`, `ports/project-event.ts`, committed backend event composition and gateway delivery. Invalidate dependency components without shared people, including both old/new components after topology change; recompute on progress/estimates/calendar/capacity/rank/engine edits and refresh labels on abbreviation/name/number changes without retargeting. Extend `shared-people-fanout.test.ts`; add `apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts`: `remote completion invalidates successor without shared people`, `topology refreshes old and new components`, `rename updates label only`, `fanout occurs after commit`, `foreign organization gets no labels`. Negatives: drop incident traversal, emit before commit or bypass organization filtering; mounted event assertions must fail and rolled-back writes must publish nothing.

### Task 6: Combined Fast scheduling and readiness — WBS 010.06

- [x] 6.1 Create `libs/wbs/domain/domain/src/resolved-schedule-input.ts`, `schedule-connected.test.ts` and `libs/wbs/application/core/src/service/connected-plan.ts`; adapt existing `schedule.ts`, `step-node.ts`, runtime-portable scheduler and `canonicalScheduleParts` instead of duplicating levelling. Preserve each project's estimate/rounding/steps/width/reach. Preserve `withoutHeldSubtrees` before constraints in both engines while keeping authored relationships inspectable. Namespace team/resources by project, people only in isolated mode; enforce eligibility/FS/SS/FF before rank and priority. Tests: `interleaves A.design B.build A.test`, `lower ranked prerequisite precedes high ranked successor`, `priority orders only eligible work`, `team and resource catalog IDs do not merge project pools`, `people share only in shared mode`, `project estimate inputs remain distinct`, `held reduction preserves existing behavior and authored inspection`, `unconnected plan keeps old path`. Negatives: remove each eligibility/boundary/capacity namespace guard and watch actual Fast projections violate its invariant. Rerun existing typed, priority, joint-capacity, resources and hold suites.
- [x] 6.2 Extend connected derivation through `libs/wbs/domain/domain/src/workday.ts` and core `service/saved-plan-schedule.ts`. Translate through workday ordinals, preserve fractional manual floors/deadlines, enforce project start floors, and project back through each anchor. Add `schedule-connected-calendar.test.ts`: `Monday Wednesday anchors agree from either project`, `fractional offsets survive translation`, `manual floors and deadlines retain own anchor`, `weekend uses current workday calendar`, `missing prerequisite anchor returns dependency_calendar_missing with visible relationships`, `undated unconnected behavior is unchanged`. Negative: substitute target anchor, round fractions, omit floor or default missing date to zero separately and observe production read tests fail; no incomplete dated projection is labeled complete.
- [ ] 6.3 Extend `libs/wbs/application/core/src/module/work-item/startable.ts` and connected node readings with coherent per-project progress/attempt evidence. Add a shared execution-eligibility reading: FS requires done before start, SS requires actual start/done, FF exposes a finish condition without blocking start. Use it in local and remote advertised startability and matching governed step claim/start admission; retain manual progress/actual correction policy. Preserve hold, completion, claim and resource behavior. Extend `startable.test.ts`; add `apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts`: `unfinished local and remote FS exclude a new start`, `remote FS completion releases successor`, `SS requires actual start`, `FF permits start and reports finish prerequisite`, `governed claim agrees with startable`, `manual correction retains override policy`, `missing calendar still exposes readiness`. Negatives: independently omit remote progress/attempt/hold/edge evidence, admit absent project evidence, or bypass FS/SS eligibility and each governed consumer; mounted startable/tree/claim tests must detect false readiness or premature starts and verify atomic refusal. Follow the exact boundary and skipped-completion-policy rules in [the scheduling ruling](architecture/connected-scheduling.md).

  - [x] Bounded FS/SS execution-predicate R5 proof: independent predicate bypasses each fail four mounted local/remote isolated/shared permission cases; restoration passes the full 37-case startable/claim file. [Evidence](evidence/task-6-3-execution-predicates/report.md). Parent 6.3 remains open for MCP/skip-policy reconciliation and integrated gates.

### Task 7: Optimization boundaries, terminal outcomes and cache — WBS 010.07

- [x] 7.1 Extend `libs/wbs/domain/contracts/solver/src/{wire-types.ts,wire-vocabulary.ts,build-solver-request.ts}`, installed solver schema/version and Python schema copy. Reconcile current runtime versions with concurrent scheduler changes before allocating the next version. Encode fixed incoming lower/outgoing upper FS/SS/FF bounds, project/anchor identity and shared-person occupancy with provenance and conservative quantization. Extend `build-solver-request.test.ts`, `solver-request-pair.test.ts`, strict fixtures and `wire-contract-version.test.ts`: `external FS targets second step`, `outgoing FS SS FF are separate upper bounds`, `occupancy names foreign holder`, `conservative quantization retains bounds`, `old contract cannot match new question`. Negative: remove each new boundary/version member independently and watch production request/decoder fixtures fail; both schema copies must reject unknown fields consistently.
- [x] 7.2 Extend `libs/wbs/adapters/solver-py/src/wbs_solver/{model.py,validate.py,solve.py}` and `tests/{test_model.py,test_validate.py,test_solve.py}`. Tests: `test_external_fs_ss_ff_bounds`, `test_external_outgoing_upper_bound`, `test_fixed_foreign_occupancy`, `test_expanded_pair_is_not_omitted`, `test_boundary_infeasible_quantized_window`. Use fixed A finish 0.2, one-day B, fixed C start 1.2 and quantum 48, no deadlines: real Fast fits at 0.2, integer start requires >=10 and <=9. Preparation must allow the validated empty integer window without fabricating feasible quantized baseline or labeling it malformed. Model terminal `boundary-infeasible` for this stage, including cases with local deadlines, without global plan-infeasible/optimality claims. Negative: omit each Python inequality, preparation distinction and outcome mapping independently and watch actual solve/validation tests fail. Run configured `bunx nx run wbs-solver-py:test`, not a second task runner.
- [ ] 7.3 Create `libs/wbs/application/core/src/service/connected-optimization.ts` / `connected-optimization.test.ts`; extend `ports/scheduler.ts`, backend `module/optimization/optimized-schedule-reader.ts`, solver response/materialization adapters and relevant exit mapping. Start from combined Fast, visit rank/ID stages once, fix all foreign starts, honor each project's engine/enablement/objective, validate full component before replacement. Add typed `boundary-infeasible` certificate with question/project/objective/quantum/version, fixed boundary provenance and existing real composite evidence. Tests: `mixed engines select one coherent placement`, `interleaving uses no recursive reads and one stage per project`, `pending failed and boundary infeasible retain current valid placement visibly`, `required unavailable engine refuses`, `proof and comparison state fixed boundary scope`, `quantized infeasibility survives preparation solver exit and materialization`. Negatives: bypass stage bound, foreign pinning, whole-component validation, certificate discriminator or outcome mapping separately; watch real reader/exit tests misclassify or publish invalid placement.
- [ ] 7.4 Extend `libs/wbs/adapters/store-sqlite/src/{schedule-input-hash.ts,optimized-schedule-cache.ts,captured-optimization-reader.ts,optimized-outcome.ts,optimization-generation.ts,optimization-queue.ts}` plus optimization restart/Retry handlers and frontend outcome DTOs. Hash all local inputs, external stable endpoints/types, anchors, mode/capacities, rank, fixed stage placements and installed versions. Earlier selections invalidate later identities; later selections do not feed back into earlier identity. Persist boundary-infeasible separately, release solver slot, forbid same-question automatic restart/read retry and typed manual Retry; a relevant input change forms a new question. Extend hash/cache/capture/queue DB tests and add `apps/wbs/be-01/src/module/optimization/connected-publication.test.ts`: `every boundary field changes identity`, `upstream variant invalidates later cache only`, `stale generation refuses`, `foreign starts cannot move`, `real FS SS FF violations refuse despite quantized validity`, `boundary infeasible releases slot and survives restart`, `same question manual Retry is not retryable and admits no attempt`, `changed boundary admits a new question`, `capture never allocates queue generation slot or event`. Negatives: remove each new hash member and exact-question/generation/foreign-start/real-boundary check separately; replace capture reader with admitting reader, bypass terminal retry suppression or conflate outcome with plan-infeasible and observe production-path tests fail. No generic single hash negative substitutes for the field sweep.

  Bounded lifecycle progress (2026-10-22): detached connected questions now reach backend observation, initial reservation, child/preflight terminal persistence, queue/restart, edit capture and Retry in composed SQLite/source-owner fixtures. The Q1→Q2→Q1 retained certificate path avoids generation mutation. Scoped source-owned connected publication/eviction fan-out and recipient-insert rollback now have production-path proofs. Production installation and visible DTO/frontend scope remain open; see the private lifecycle slice in `verify.md`.

Task 7.3/7.4 snapshot prerequisite (2026-10-22): the private
`capturedSchedulerIn` factory now binds local and explicitly opted-in connected
cache readers to the existing borrowed observation lifetime. Both production
snapshot constructors use the factory without the connected opt-in. Private
coordinator lifecycle progress is recorded above; production configuration,
mounted admission/Retry and end-to-end publication binding remain pending.
Neither task checkbox is complete. Evidence and watched faults are recorded in
`verify.md`.

Task 7.3/7.4 detached view prerequisite (2026-10-22):
`projectConnectedTree.optimizationView` now projects exact retained stage scope,
captured foreign labels and target-only objective comparisons without IO or
admission. Public PlanTree/HTTP/shape-generated-client structural integration now has a
bounded packet with independently watched required-field and union faults. The
frontend API explicitly refuses connected presentation until Slice B. Semantic
wire identity equality remains Slice A work; no connected production source is
installed. Parent task
checkboxes remain open. Commands, watched producer faults and limits: `verify.md`.

### Task 8: Transfer, copies, immutable history and downstream readers — WBS 010.08

- [ ] 8.1 Version `libs/wbs/domain/contracts/src/http/{plan-document-shapes.ts,import-shapes.ts}` and core `module/plan-document/{plan-document-values.ts,plan-document.resource.ts}` / `module/plan-import/{import-values.ts,prepare-import.ts,imported-plan.resource.ts}`. Distinguish remappable internal endpoints from stable external IDs and descriptive labels; export selected schedule/boundary evidence coherently. Import resolves original UUIDs or explicit destination mappings inside transaction, applies destination abbreviation allocation, and revalidates ownership/access/shape/duplicates/graph. Extend plan-document module tests, `apps/wbs/be-01/src/http/elysia/plan-document-boundary.test.ts` and add `controller/cross-project-import.controller.db.test.ts`: `rename round trips stable external identity`, `reused address never replaces absent UUID`, `explicit mapping binds declared endpoint`, `foreign absent malformed cyclic external references refuse whole import`, `abbreviation conflict cannot overwrite another project`, `legacy document retains reach`, `unsupported version refuses without writes`. Negatives: omit external evidence, bypass version/mapping/current access/graph guards, and inject post-project-creation failure separately; mounted export/import tests must catch loss or partial rows/history/events.
  - Allocation sub-slice (2026-10-22): original internal paths and the complete
    destination relationship packet now feed existing internal imports. Real SQLite
    remapping, tree announcement and all-table refusal/throw rollback are covered.
    External production imports remain dormant; scoped admission and retained
    principal admission are recorded in the following slices. Full transfer rollout
    remains open. Evidence: `verify.md`.

  - Scoped admission sub-slice (2026-10-22): private owner/actor-bound resource,
    required explicit production dormancy, staged endpoint/shape/full duplicate/
    connected graph admission and real SQLite rollback/fanout/lifetime proofs.
    Active capability exists only in isolated fixtures with synthetic storage
    authority. Retained current-principal admission is recorded below; full transfer
    rollout remains open and 8.1 is unchecked. Evidence: `verify.md`.

  - Current-principal import sub-slice (2026-10-22): required retained
    `CommandCaller`, same-writer `CommandAccess` and fresh callback/resource/context
    access are implemented with queued browser and persisted machine/consent
    integration coverage. Public external imports remain explicitly inactive.
    Selected-secret rotation, upstream/delegation expiry and independently current
    remote MCP family verification are outside the retained principal contract.
    Export/schedule/boundary/copy/history/public activation rollout remains open;
    task 8.1 stays unchecked. Evidence and proof limits: `verify.md`.

  - Bounded read-side v11 export slices (parent 8.1 remains open):
    - [x] Define required v11 connected response evidence and pure detached projection; preserve writable import stripping and frozen v10 behavior.
    - [x] Capture document facts alongside connected live reads and wire actual JSON/Markdown export without post-closure reads or optimizer admission.
    - [x] Prove stable successor-owned transfer links, unavailable outcomes, immutable stage boundaries and current client download/import projection; record watched faults and focused checks. Reconciled existing mounted/client slices and added detached-memory evidence in [read-side acceptance](verify-v11-export-acceptance.md).
    - [ ] Integrate current-principal import packet and whole-project authorized export/import rollback proofs before claiming 8.1/8.2 complete.

  - Bounded whole-project v11 integration slices 1–2 (parent 8.1 remains open):
    - [x] Real mounted multi-scope incoming/internal/outgoing/component artifact traverses archival classification and a separate test-only same-source active importer, preserving exact remapping and external UUIDs without history writes.
    - [x] Generated client, downloaded Blob and page import preserve the mounted artifact's authored transfer set while stripping read-only history; inactive refusal retains selection.
    - [x] Mounted production incoming import remains inactive with/without the synthetic importer; outgoing-only v11 retains internal typed and legacy content on successful import.
    - [x] Slice 3: downloaded artifacts preserve external UUIDs across rename/renumber; explicit whole/node/descendant-step mappings override valid originals, invalid mapped rows/steps refuse atomically, and reused display addresses require explicit replacement mappings. Watched mapping-precedence and step-key faults are recorded in `verify.md`.
    - [x] Slice 4 bounded proof: downloaded artifacts recheck selected current endpoint and graph facts; an injected failure after a real durable event insertion rolls back all effects. The multi-declaration cycle diagnostic can still blame a downstream edge. Evidence: [import slice 4](verify-import-slice4.md).
    - [x] Correct cycle witness attribution so only authored edges on real directed cycles are witnesses, and an imported external declaration is blamed when it reaches an already cyclic remote component. Bounded evidence: [cycle witness correction](verify-cycle-witness.md). Production external import remains dormant; parent 8.1 is open.
    - [ ] Complete compatibility, transport and public activation proofs for v11 import; parent 8.1 remains open.

- [ ] 8.2 Extend project/subtree copy orchestration and `module/work-item/work-item.resource.ts`. Internal relationships remap IDs; copied successors preserve authorized external prerequisites with new relationship IDs; copying a predecessor never clones outgoing relationships into another successor owner. Extend `apps/wbs/be-01/src/controller/typed-dependency-copy.controller.db.test.ts`: `copied successor retains original external prerequisite`, `internal endpoints and steps remap`, `copied predecessor creates no outgoing foreign owner write`, `unrelated edge is not copied`, `copy revalidates access and graph atomically`. Negative: clone all incident edges, reuse relationship IDs or skip access/graph checks independently; actual copy tests must catch foreign owner writes or unsafe success.
  - Bounded active mounted duplicate/undo/redo proof retains exact remote endpoint and copy/journal IDs while excluding foreign-owner writes; see [verify-8-2-copy-slice.md](verify-8-2-copy-slice.md). Broader task 8.2 remains open.
- [ ] 8.3 Extend core `ports/{saved-plan-capture-values.ts,saved-plan-values.ts}`, `module/saved-plans/{save-plan.ts,saved-plan-integrity.ts,saved-plan-values.ts,saved-plan-schedule.ts}`, SQLite `{saved-plan-capture.ts,saved-plan.ts}` and saved HTTP payload versions. Persist external identities/labels, graph/placement and selected optimization boundary evidence; historical reads fetch no live foreign facts, while navigation checks current access. Add paired additive payload migration only if existing versioned storage requires schema change. Extend `saved-plan-capture.db.test.ts`, `saved-plan-immutability.test.ts`, backend `service/saved-plan-read.db.test.ts` and frontend `saved-plan-compare.test.tsx`: `rename renumber edit deletion do not reinterpret history`, `history works with unavailable live external access and performs no live lookup`, `missing unreadable required save evidence leaves no partial snapshot`, `comparison states captured boundary`. Negative: replace captured evidence with live reads, omit required fields or escape save transaction separately; actual save/read tests must fail. Retain explicit readers for old saved versions.
  - [x] C2 bounded backend/HTTP comparison (2026-10-22): required left/right frozen side summaries, exact retained boundaries and explicit schedule/provenance state now pass through service and HTTP; current/current resolves once. Mounted SQLite and poisoned live capability proofs are recorded in verify.md. Frontend client/state/rendering, remaining lifecycle matrix, active writer integration and canonical gate remain deferred; task 8.3 stays open.
  - [x] C3 bounded frontend comparison summaries (2026-10-22): shape-derived frozen left/right context replaces shelf/diff schedule inference; connected disclosures retain captured stage boundaries and objective outcomes, with post-decode source/target binding and exhaustive render refusals. Runtime/guard proofs are in verify.md. Remaining saved-history lifecycle, active writer integration and canonical host gate keep task 8.3 open.
  - [x] C1 bounded comparison projection (2026-10-22): dormant pure `SavedComparisonSide` projection retains legacy unknown/local/connected provenance, labels, unavailable reasons, objective states and exact foreign pre-selection boundaries. Pure mutation evidence remains provisional; HTTP/client/UI wiring, mounted no-live-lookup proofs and current/current capture-count test remain deferred to C2. See `verify.md`, “Saved comparison C1 pure projection”.
  - [x] Bounded saved-resource packet (2026-10-22): validate v9/v2 historical bodies after stored hash/link checks; propagate typed body/path/code corruption through mounted read and either comparison side; decode v9 saved comparison input without changing active v8/v1 writers. Proofs and limits: `verify.md`, “Saved history resource integration”. Connected capture/writer/current, full immutable lifecycle, side provenance and activation remain open.
  - [x] Bounded saved-history lifecycle packet (2026-10-23): two genuine connected saves in isolated/shared modes survive foreign rename, abbreviation, number, step, estimate and fact edits, then foreign project deletion. Fresh stores and a mounted HTTP reader retain exact saved bodies and comparison boundaries with live capture/scheduler/clock/ID capabilities poisoned. Watched read and comparison faults and focused checks are in [the packet](verify-saved-history-lifecycle.md). Missing/unreadable required save evidence, production active-semantic rollout and canonical host gate remain open; parent 8.3 stays unchecked.
- [ ] 8.4 Integrate connected projection into work-item live tree, retained batch reads, core `service/{project-page.ts,person-load.feature.ts,space.resource.ts}`, arrangement and optimizer restart/admission. All projections from one observation use one composite; capture remains non-admitting, explicit owner admission occurs after snapshot closure. Extend person-load/space/arrangement tests and add `apps/wbs/be-01/src/controller/cross-project-live.controller.db.test.ts`: `tree retained batch load and spaces agree`, `arrangement sees staged links`, `restart builds current boundary question`, `aggregate deduplicates overlapping components`, `ordinary reads allocate no solver work`, `labels do not reread live after capture`. Negative: route one surface through old rank-only scheduling, defer derivation past closure or use admitting reader; watch that mounted surface fail. Rerun existing shared/live snapshot and staged arrangement lifecycle regressions.
  - Bounded shared connected aggregate capture/projection, mounted load/Space foreign refresh and seven watched faults: [evidence](evidence/shared-connected-aggregate/README.md). Full 8.4 remains open.
- [x] 8.5 Add sparse/dense connected fixtures beside `libs/wbs/domain/domain/src/schedule-benchmark.test.ts` and SQLite `connected-plan-capture.db.test.ts`. Tests: `captures each required project once`, `closure includes incident and shared person bridges`, `lookup page bounds never truncate scheduling closure`. Measure query counts/capture/derive timings and record actual measurements, without inventing an unsupported budget. Negative: apply search page limit to required closure or repeat capture per projection and observe completeness/count tests fail. Evidence: [connected benchmark](evidence/connected-benchmark/README.md).

### Task 9: Dependency UI and project settings — WBS 010.09

- [x] 9.1 Implement the real table/phone/Customize flow described in [the autocomplete/editor ruling](architecture/autocomplete-editor.md). Extend `apps/wbs/fe-01/src/components/wbs/{depends-input.ts,dep-picker.ts,use-plan-dependencies.ts,plan-columns/depends.tsx,plan-cards.tsx,typed-dependency-editor.tsx,plan-live.ts,wbs-table.tsx,use-plan-read.ts}` and their actual memo/delivery callers. Add required `modules/dependency-lookup` feature service, inject the existing scoped address client through session/project runtime, and preserve optional step codes in frontend transport/equality. Directory reference-set kinds are unrelated and remain unchanged. Use one scoped selection model through picking, Customize and stable-pair command serialization; complete remote choice pages before inferring a unique code default. Alphabetic initial token enables bounded debounced projects alongside local title matches; empty/numeric/`010.s1-dev` stay local. Selection scopes remote lookup and preserves earlier comma/space tokens; dedupe by identity. Model loading, no match, retryable failure, cancellation and stale results. Tests: `empty numeric tokens never request projects`, `PUNI shows projects and local titles`, `late alphabetic response cannot populate 080`, `selection preserves mixed earlier tokens`, `failed lookup renders retry not empty`, `unmount cancels lookup`. Negatives: remove alphabetic/stale-token/cancellation guard separately and observe mounted field tests send unwanted calls or render stale options. Use configured frontend Vitest/Nx targets, not root bun:test. Also prove actual table and phone runtime integration, scoped client withdrawal, per-page revision/completeness, mixed-submit identity dedupe, real command serialization and per-endpoint Customize cases from the ruling. Independently break runtime/close, rendered query identity, page revision/completeness and remote-step identity guards. New-selection support does not claim persisted remote relationship display or production activation.
- [ ] 9.2 Extend frontend `{typed-dependency-editor.tsx,reference-set-presentation.tsx,depends-card.tsx,plan-columns/depends.tsx,use-plan-dependencies.ts,project-settings-modal.tsx}` and respective tests. Render qualified labels and stable remote navigation; no Gantt arrow to absent row. Step default matches unambiguous remote code, never local UUID; ambiguity/unavailable requires explicit selection. Render calendar unavailability and boundary-infeasible certificate scope with retained valid Fast and inspectable links/readiness; suppress same-question Retry according to typed response. Support abbreviation edits/conflicts. Tests: `remote step uses own identity`, `ambiguous step needs selection`, `rename changes label not target`, `remote relationship has navigation but no local arrow`, `missing calendar keeps relation inspectable`, `boundary infeasible retains Fast and disables same question Retry`, `abbreviation conflict is visible`. Negatives: substitute local step UUID, navigate by address string, collapse failed/unavailable state to empty or enable terminal Retry separately; mounted view tests must fail.
  - Persisted successor-owned remote relationships now permit fixed-endpoint FS/SS/FF editing on desktop and phone, preserving identity and read-only details for foreign-owned links; see [verify-9-2-persisted-edit.md](verify-9-2-persisted-edit.md). Remote predecessor scope editing is implemented on both surfaces; see [scope editing](verify-9-2-predecessor-scope.md) and [bounded browser persistence acceptance](verify-9-2-predecessor-scope-browser.md). Production authoring activation and full task 9.2 remain open.

### Task 10: Semantic activation and deploy capability — WBS 010.10

- [ ] 10.1 Add `libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.ts`, durable monotone authority, immutable runtime capability/startup hooks and command admission. Activate authoring only after the deployment owner proves incompatible readers/writers/background/gateway/MCP/retained-client participants cannot serve or resume. Guard startup/downgrade after activation even with zero live external rows, distinguish semantic capability from additive schema compatibility, and expose capability to clients. Add `apps/wbs/be-01/src/controller/cross-project-activation.controller.db.test.ts`: `dormant compatible binary reads legacy plans`, `old runtime overlap refuses creation`, `complete compatible participant proof permits activation`, `activated empty store refuses incapable startup or downgrade`, `missing unreadable malformed authority evidence refuses`. Negatives: bypass each capability/activation/startup guard independently and observe real startup/command tests admit incompatible execution; document an exact pinned attended compatible recovery diagnostic. A destructive removal command remains outside delivery until it can prove retained journal, saved-plan and replay obligations.
- [x] 10.1-HTTP Expose the exact frozen backend binary capability through the mounted read-only `GET /api/runtime/dependency-capability` infrastructure endpoint and shared generated-client/OpenAPI shape. Prove empty semantics, environment/readiness independence and dormant command rollback; watch route binding, semantic advertisement, registry omission and dormant admission faults. Production authoring, activation writer, participant fencing, startup permit refresh and parent 10.1 remain open. Evidence: verify.md, “Backend capability HTTP transport”.
- [ ] 10.2 Integrate immutable runtime-capability preflight, complete participant fencing, activation receipt transport/readback and semantic downgrade refusal into `tools/tool-remote-scripts/src/{swap.ts,lib/deploy-contract.ts}`, `tools/tool-deploy/src/k8s/{deploy-k3s.ts,migration-capture.ts}` and their capability adapters. Preserve complete applied-set capture/hash validation; keep `apps/wbs/be-01/src/migrate-capabilities-cli.ts` DB-free and distinct from runtime dependency capability. Compose preserves attended recovery after durable stop intent: retain current store, candidate exposure and interruption evidence without automatic schema reversal, snapshot restore or old-writer restart. Kubernetes preserves its verified dormant rollback contract, but possible semantic activation or uncertain exposure requires attended recovery; only an explicitly admitted dormant restoration reverses exactly captured additions and compares the full name/hash ledger. Extend `swap-writer-barrier.test.ts`, `swap-migration.db.test.ts` and `deploy-k3s-workflow.test.ts`: `Compose Kubernetes refuse incapable candidate`, `incomplete participant proof refuses activation`, `Compose post-stop failure retains barriers`, `Kubernetes refuses incompatible rollback after possible activation`, `eligible dormant exact-set restoration compares full ledger`, `edited applied migration refuses`, `failed restoration retains evidence and names pinned manual procedure`. Negatives: suppress candidate capability, bypass participant or activation guard, drop capture member/hash comparison and inject restore failure separately; production deploy adapter tests must catch each fault. Update `docs/runbook-prod-deploy.md` / `docs/runbook-dev-deploy.md` and link guard JSDoc to recovery instructions.
- [x] 10.2-B1 Add shared pure capability command/closed decoder and Kubernetes-only fresh Job/Pod-attributed observation transport with DB-free capability Jobs and coordinator-generated scratch store scans. Verify independently invoked equal images, stale/replaced/foreign evidence refusal, effective security/mount projection and real migrated SQLite/WAL source invariance. This is transport only; B2 storage fencing and B3 durable admission/exposure/recovery integration, live runtime acceptance and the parent task remain open. Evidence: [verify-k8s-dependency-observation.md](verify-k8s-dependency-observation.md).
- [x] 10.2-B2a Add observational Kubernetes storage readbacks with PVC/PV UID binding, backend/policy/Flux readback, unfiltered Pod and standard controller-template inventory, conservative consumer refusal and identity/template comparisons. No scan or release integration is enabled. Durable controller ownership/suspension/drain/restoration and continuous stopped-storage enforcement remain open B2 work. Evidence: [verify-k8s-storage-readback.md](verify-k8s-storage-readback.md).
- [x] 10.2-B2b-prepared Add the closed prepared-only ownership record, GET-only cluster/storage/Flux/backup observation and mandatory caller-owned durable checkpoint, with conservative original-state restart validation. This bounded primitive performs no suspension or drain and has no release caller; conditional UID/resourceVersion patching, acknowledgment resume, exact Job/Pod drain, release persistence/interval/restoration and B3 admission remain open. Evidence: [verify-k8s-storage-ownership.md](verify-k8s-storage-ownership.md).
  - Bounded prerequisite: exact-image DB-free backend capability observations now run before Compose stop intent and through shared recovery admission. This does not complete 10.2: strict coordinator-owned stopped-store authority admission and post-maintenance/pre-exposure recheck are implemented as the next bounded prerequisite; participant fencing, activation and Kubernetes work remain open. Evidence is in verify.md under “Compose binary capability prerequisite” and “Compose dormant preservation prerequisite”.
- [x] 10.2-B3a-detached Add a closed versioned Kubernetes dependency-evidence codec and conservative recovery classifier. Preserve exact source/participant/activation/exposure claims, reject malformed or inconsistent projections, and route uncertain or progressed releases to attended recovery. This pure prerequisite has no release caller, persistence, verified participant exclusion, activation or rollback grant; parent 10.1/10.2 remain open. Evidence: [verify-k8s-dependency-evidence.md](verify-k8s-dependency-evidence.md).

### Task 11: Integration, R5 proofs and delivery gate — WBS 010.11

- [ ] 11.1 Add browser scenarios in the existing frontend Playwright fixture routing after reading its configuration: alphabetical discovery → qualified dependency → external completion → live update; abbreviation edit → stable navigation. Cover local legacy behavior, interleaving, FS/SS/FF readiness, fractional calendars, mixed engines, terminal boundary infeasibility, concurrent snapshot publication, undo/import and dormant/active rollout. Run focused Bun tests on exact changed non-DOM suites, `bunx nx run wbs-fe-01:test`, `bunx nx run wbs-solver-py:test` and relevant API/conformance/browser targets. Record unavailable/skipped checks explicitly; absent required tools block release.
- [ ] 11.2 Review every delta scenario against its proving test and complete every watched guard negative in verify. Run `./node_modules/.bin/openspec validate --all --json`, `bunx nx format:check --all`, and obtain CI test/lint/typecheck/build, secrets and migration lint evidence. On h2puni use only `bin/h2puni-gate.sh <candidate-sha>` from a clean isolated gate worktree; record its printed actual running SHA and output. Never checkout before its lock or use the dev poller tree. Record exact commit range and clean-worktree evidence, perform implementation review, then archive/sync specs under the authorized workflow. This planning packet claims no implementation gate, migration, rollout or deploy.

### Compose dormant preservation prerequisite (bounded part of 10.2)

- [x] Write real generated-command and ordinary execute negatives, observe missing admission reaching startup, then implement coordinator-owned strict DISABLED/no-edge scanner and bounded readonly scratch transport.
- [x] Wire shared recovery admission before maintenance and independently re-resolve SQLite family, rollback image and exact stopped outgoing/replacement-maintenance set before a fresh post-maintenance scan.
- [x] Add migrated store/CLI conformance, coherent historical refusal, enabled-empty/deceptive-image, source failure/WAL, identity drift, first-install replacement and installed source/built dispatch controls; watch production guard removals fail.
- [ ] Complete scoped verification, independent review and isolated host gate for the integrated SHA; record limitations in verify.md. Parent 10.1/10.2 remain open.

Task 7.3/7.4 semantic response prerequisite (2026-10-22): the tree endpoint now
wraps its structural Standard Schema with terminal sibling identity and connected
display/comparison consistency checks. The JSON descriptor and local compatibility
remain intact. The frontend binds scope to the requested project and exports the
local/connected view union, retaining its explicit connected presentation refusal
until the cue slice lands. Each of eight equalities and five comparison failures
has a watched generated-client fault; URL binding has a watched API fault.
Parent 7.3/7.4/9.2 remain incomplete.

Task 9.2 bounded cue prerequisite (2026-10-22): pure connected cue reading now
preserves captured scope/fixed identities and positions, distinguishes both
terminal evidence arms, keeps terminal selection/Retry unavailable, retains a
selected ready sibling, suppresses stale arithmetic and throws on unknown
internal discriminators. Complete `chartReadOf` optimization equality is covered.
The connected HTTP refusal remains explicit. B2 now renders the captured facts
and truthful retention in the shared cue, with a distinct boundary warning and
mounted terminal actions/read-only/stale/error-boundary coverage. Independent
mounted faults cover scope/details, Retry/selection, retention, stale figures and
unknown discriminators. Producer-to-HTTP/table/cards B3, reconciliation B4,
remaining B5 proofs and activation are pending; 7.3/7.4/9.2 stay unchecked.

Task 9.2 B3 producer-fixture prerequisite (2026-10-22): the original mixed-engine,
distinct-anchor observation is now shared through a runner-free fixture, with a
complete `presentConnectedTree(projectConnectedTree(...))` factory. A separate real
FS A/B/C fixture derives A.finish=0.2, B=0.2→1.2 and C.start=1.2 with no authored
deadlines, then uses actual connected solver preparation/classification at quantum
48 for terminal Time. Captured Pri idle/pending/failed states remain independent
through generated-client decoding. Public mixed fixtures retain A's captured C=8
and final C=6 on the component axis. This is a bounded prerequisite, not completed
B3: real `httpProjectApi.tree` → `WbsTableOverClient` table/cards, retained rendered
dates/bars/spans, terminal HTTP actions, unavailable reads and mounted stale/refetch
proofs remain pending. The frontend connected refusal remains in place. Parent
7.3/7.4/9.2, B3 enablement, B4, remaining B5 and activation remain unchecked.

Task 9.2 B4 bounded reconciliation (2026-10-22): internal connected fake-API
mounted cases now cover held Q1 failed/corrupt → Q2 failed/corrupt/ready/terminal,
current hash and captured scope/certificate, reopen/refetch terminal action
absence, replacement runtime/project late-refusal fencing, and actual stream
refresh failure followed by a fresh retryable tree. Writer tests cover delayed
owner replacement/withdrawal and busy lifetime during reconciliation. A watched
optimistic-terminal production fault fails before the held authoritative tree
arrives; verify.md records its exact assertion and the public HTTP/session/gate
limits. This bounded packet leaves parent 7.3/7.4/9.2 unchecked.

Task 9.2 B3 mounted unavailable-read prerequisite (2026-10-22): a new configured
Vitest suite imports the runner-free real producer with three test-only runtime
aliases and test-only TypeScript paths/library support. The production Vite
resolver is unchanged. The suite crosses generated decoding for fractional and
mixed observations, checks real HTTP adapter refusal/URL binding/malformed packet
rejection, and mounts actual missing-calendar/required-engine trees through
`httpProjectApi.tree` and `projectServicesOf` into both table and cards, preserving
editable rows, unknown readiness and stable foreign navigation without fabricated
dates or optimization. Connected schedule enablement remains refused. Rendered
B=0.2→1.2 bars/spans, mounted captured C=8 versus final C=6, selected-ready/floor
retention, terminal action suppression and failed-sibling Retry HTTP hash proofs
remain deferred; parent 7.3/7.4/9.2 and B3 enablement remain unchecked. See verify.md.

Task 8.3 saved-history B2 bounded prerequisite (2026-10-22): detached connected-history preparation now retains complete component relationship/readiness evidence, exact stage bytes, observation configuration and selected schedules through reserved input9/schedule2 builders. A real migrated SQLite fixture proves isolated/shared interleaving and conversion after store deletion. Ready-displacement coverage corrected the dormant placement codec to accept its existing optimizer binding discriminator. Converter fault evidence and the remaining B2 matrix are recorded in verify.md. This does not activate save/current, remove compose refusal, or complete B2/task 8.3.

Task 8.3 saved-history B2 matrix follow-up (2026-10-22): migrated SQLite capture
now covers real durable cache-ready mixed Fast/optimized selection, retained later
foreign boundaries, selected Time quantisation-floor baseline with independent
ready Pri sibling, public versus encoded person/stage capacity identities,
node/whole/descendant-step endpoints, nonempty idle members and engine/cycle/range
absence. Two dormant cache producer corrections and watched faults are recorded
in verify.md. Team/resource placement-binding breadth and the mounted D/E
save/current/lifecycle proofs remain pending; v8/v1 writers and compose refusal
remain active, and task 8.3 stays unchecked.

Task 9.2 B3 bounded connected presentation (2026-10-22): the HTTP adapter now
passes the generated-client-validated connected packet through the existing
local/connected view union into the real project services and mounted table.
The prior presentation refusal is removed after producer/HTTP equality and
mounted evidence: fractional B=0.2→1.2 bars, corresponding table/card dates,
A's captured fixed C=8 versus separately mounted final C=6 (C-local day 4),
and selected-ready/quantisation-floor retention. URL binding and malformed
packet refusals remain in place. This enables reading supplied connected
packets; it installs no connected production source or admission authority.
Terminal action suppression across reopen/refetch/remount, zero terminal Retry
HTTP calls, failed-sibling current-hash Retry, mounted pending announcement,
B4 reconciliation and production activation remain open. Parent 7.3/7.4/9.2
and full B3 completion stay unchecked. Commands, watched faults and limits:
`verify.md`.

Task 9.2 B3 action-proof follow-up (2026-10-22): the producer-mounted fixture
now delegates tree, Retry and optimization settings to the real HTTP client,
with method/path/body transport observations. Both desktop table and phone
cards exercise unavailable terminal Time by mouse, Enter and Space; reopen,
authoritative refetch and a fresh remount retain dates and emit no Retry POST
or settings PATCH. Terminal Time with failed Pri offers only Retry Pri and
sends the refetched connected input hash. A real producer controlled-outcome
case retains selected ready Time beside terminal Pri; pending Pri still
announces optimizing beside terminal Time. Independent watched mounted faults
cover terminal Retry, terminal selection, dropped forwarded scope, missing
schedule slices and captured C replaced with final C. Adjacent proofs and
commands are in `verify.md`. B4 HTTP 409/replaced-runtime/stale reconciliation,
browser geometry, production admission and activation remain open; parent
7.3/7.4/9.2 and full Slice B remain unchecked.

Task 9.2 B3 R5 scope-proof correction (2026-10-22): independent review found
that the original scope fault was intercepted by fake response validation.
The action transport now uses a plain composed adapter with direct real HTTP
tree/Retry/settings delegates and fake operations only for unrelated methods.
The re-injected post-decode scope fault renders two editable rows and the Time
pill on table/cards, then fails the specific accessible retention assertion.
The original proof attribution is corrected in `verify.md`; the adjacent
production proof names the actual presentation failure. Production enabling
integration remains held for review approval; parent tasks remain unchecked.

Task 3.2/4.2 bounded mounted command prerequisite (2026-10-22): a test-only active
batch WorkItemService now crosses the ordinary mounted HTTP runner, real SQLite
stores/history/connected graph/fanout/tree. Two isolated Fast projects prove a
restricted readable predecessor remains uneditable, FS placement 0→2 then 2→4,
committed journal/revisions/delivery, stable local↔external update/remove identity
through undo/redo, rollback without publication, stale remote-revision refusal and
foreign organization concealment. Watched dormant, graph-edge and history guard
faults are in verify.md. Production composition remains inactive; 3.2/4.2 stay
unchecked pending their complete endpoint/type/authority/history matrix and active
MCP parity.

Task 9.2 B4 bounded backend Retry bridge (2026-10-22): human-scoped Retry consumes
the actual detached connected pre-selection stage through the mounted HTTP
adapter, coordinator and source writer. SQLite tests cover terminal no-write 409,
stale-before-terminal, changed foreign boundary, replaced generation, failed Pri
beside terminal Time, exact missing-calendar target/list, idle/unavailable, foreign
concealment, authorization-before-capture and membership removal before writer
admission. Independent watched faults and commands are in verify.md. The private
fixture installs no production reader; buildServices and activation remain dormant.
Three-project C=8/final6 Retry, browser reconciliation and complete optimizer
acceptance remain pending. Parent 7.3/7.4/9.2 remain unchecked.

Task 9.2 settings refresh correction (2026-10-22): mounted same-project catalog
refresh tests now retain invalid/conflicted abbreviation drafts and their refusal,
update the saved baseline, and restore that latest baseline on Escape. Untouched
fields still follow refreshes. This extends the already completed abbreviation
clause only; parent 9.2, remote navigation/authoring and activation remain open.
See verify.md for the watched dirty-draft guard negative and focused checks.

Task 8.3 Slice D bounded writer/current packet (2026-10-22): connected observations
now pass the installed save/current seam and share one serialized capture. Mounted
Fast save persists input9/schedule2 and equals current; configured installed-module
isolated/shared ready selection retains optimized versus quantisation-floor baseline
and earlier foreign boundaries after cache eviction. Real migrated contention pins
team/resource placement bindings. Target writer reauthorization, atomic rollback,
current/current reuse, post-close conversion/serialization, no solver admission and
once-after-commit announcement have focused negatives and watched faults in verify.md.
Production connected optimizer configuration remains absent and explicitly unavailable;
external authoring remains dormant. Full immutable lifecycle, all failure/evidence
matrices, production optimizer integration, independent review and canonical host gate
remain open; task 8.3 is not complete.

Task 4.2 bounded node/alias mounted proof (2026-10-22): synthetic active
HTTP and direct-service cases now admit a restricted readable remote FS node
using both step wire forms, a dotted alias for a successor created earlier in
the same batch, and real Fast tree/history evidence. Dormant, late-command,
shape and cross-project-step refusals preserve full-table rollback. Four watched
mutations and exact limits are in [the node authoring report](evidence/node-authoring-2026-10-22/report.md).
Production authoring and MCP parity remain inactive; task 4.2 stays open.

Task 5.2 bounded semantic rank fanout (2026-10-22): dependency-component
fingerprints now retain component-relative rank order from the borrowed writer.
Mounted isolated/shared rank changes notify connected recipients after commit,
while unrelated moves and physical respacing stay silent; missing rank evidence
refuses. Rollback, postcommit delivery and seven watched faults are in
[the rank fanout report](evidence/rank-fanout/verification.md). Writer-coverage
audit and socket/browser acceptance remain open; task 5.2 stays unchecked.

Task 4.3 closure reconciliation (2026-10-22): the authored connected graph,
actual task-node cycle rules, all remote expansion pairs, structural command
revalidation, batch rollback and incident hand-down are implemented and have
reviewed transaction-level proofs. Fresh scoped audit passed 46/46 tests;
[graph closure](evidence/task-4-graph-closure.md) and
[hand-down correction](evidence/task-4-incident-handdown-review.md) close the
older provisional gaps. Tasks 3.2, 4.2, 4.4 and activation remain open.

### Plan-wide activation rollback admission (bounded part of 10.2)

- [x] Preserve the ten real migration-runner refusal regressions; add complete schema/ledger/table-row certificates, actual capture-file refusal and dormant/no-op/unrelated controls.
- [x] Resolve all selected row names/folders/forward hashes, then inspect complete-selection dormant/no-edge authority on the native rollback connection before any down statement; preserve per-migration retry and rebuild contracts.
- [x] Watch omitted/late/first-only admission, enabled/edge/inspector bypasses, delayed metadata checks and independent SQL down-guard bypasses fail; restore each guard and record adjacent proof evidence.
- [x] Finish bounded verification and independent review; parent tasks 10.1/10.2 remain unchecked.

### Bounded backend pre-migration admission packet (2026-10-23)

- [x] Add mounted pending-migration refusal tests comparing complete sqlite_master, ledger and every table, including explicit unreadable authority and disposal/no-start assertions; observe ordering regression before implementation.
- [x] Admit current authority before source migrations; distinguish empty-schema bootstrap from exact known historical name/hash-prefix and scratch-reproduced schema; retain strict post-migration inspection before startup side effects.
- [x] Verify fresh, certified historical and dormant pending-migration positives; refuse historical hash/schema/ledger faults and nonempty unrecorded schema; watch preflight-order, postflight-removal, historical-hash/schema and fresh-routing mutations fail.

### Bounded task 7.3/7.4 initial connected live admission (2026-10-23)

Ordered slices:

- [x] Watch cold mounted isolated/shared reads fail with zero launches, and missing
      configured admission resolve; then install the core-owned detached target
      admission callback through public composition and Work item DI.
- [x] Exercise repeated mounted reads with held children, retained terminal reuse,
      target-only initial admission, capture-only surfaces, staged borrowed HTTP
      rollback, typed refusals and source-writer enablement/drain races.
- [x] Watch production mutations for capture mode, missing installation,
      enablement, unscheduled refusal, port forwarding and omitted admission;
      record independent close/recapture probes and their limits.
- [ ] Complete displaced selected-stage/final-composite proof, full calendar and
      capacity matrices, installed Python/image acceptance and canonical host gate.

This packet adds public target admission only. Existing committed-event fanout
may admit other enabled projects after outcomes finish. Parent 7.3/7.4 and
activation remain open; receipts and proof limits are in
[evidence/connected-live-admission/report.md](evidence/connected-live-admission/report.md).

Task 9.2 B4 producer-backed HTTP 409 packet (2026-10-23): six mounted
producer→generated decoder→HTTP adapter→runtime/writer→table/cards cases now
exercise held authoritative reads after typed terminal refusal, failed Q2 Retry
identity replacement, terminal Q2 action suppression and delayed same-project
runtime / same-API project replacement. Genuine fractional terminal Pri is
prepared independently beside terminal Time. Five mounted production faults fail;
the retired-owner writer guard fault survives mounted replacement under layered
channel/feed guards but fails the existing isolated production writer test.
Evidence and explicit coverage limits:
[evidence/task-9-2-producer-http-409.md](evidence/task-9-2-producer-http-409.md).
No runtime behavior change or production activation is included. Parent tasks
7.3/7.4/9.2 and full Slice B remain unchecked.

### Kubernetes journal-owned controller lifecycle (bounded task 10.2 prerequisite)

- [x] Retain separate forward/rollback controller histories in journal schema 4 while preserving the prepared-only B2b codec.
- [x] Wire production suspend/drain/readback around source replay/capture/migration, conditional restoration before rollout, and fresh rollback re-entry after completed forward restoration.
- [x] Prove exact absent/false/true restoration, patch-before-ack restart, individual UID/resourceVersion/template/token guards, unrelated descendant and unlabelled/readonly consumer refusal, repeated inventory, Lease loss and bounded drain timeout through the real executor/file journal/kubectl adapter.
- [x] Prove sticky Lease journal retention, missing/unreadable/corrupt journal refusal, UID/session CAS and ABA refusal, and guarded Lease cleanup; record watched faults and configured checks.
- [x] Preserve live-holder conflict precedence over the sticky missing-journal refusal when a contender sees the marker before the winner's first checkpoint; keep marked lapsed/parked and same-holder missing-journal refusal. Evidence: verify.md under “Kubernetes live marked-Lease race.”
- [ ] Complete independent review and isolated host gate for the integrated SHA. Parent 10.1/10.2, complete B2 participant exclusion and B3 semantic activation remain open.

Task 9.2 bounded stable-link filter landing (2026-10-23): desktop and phone
work-item/step landing now uses the existing criteria-scoped filter reveal for
the linked row and its ancestors. Find/facets and stored expansion are retained;
changing criteria expires the reveal. Mounted nested Find, facet and combined
cases use destination-owned step identity and prove actual input focus and URL
consumption with unrelated parameters retained. Page-owned project selection is
covered separately. Parent 9.2 remains unchecked; this does not claim activation
or the remaining unavailable/Retry/transfer work. See verify.md.

### Kubernetes release binary preflight (bounded task 10.2 prerequisite)

- [x] Write and watch mounted executor/file-journal/kubectl-adapter failures for missing dispatch, independent equal-digest roles, exact distinct-image association and retained-only refusal before serving interruption.
- [x] Consume the existing DB-free binary observation port after F6 admission and before protected effects; refresh admission and evidence for every resumed forward/rollback execution while preserving journal/controller/serving state on refusal.
- [x] Prove missing/unreadable/malformed/deadline failures for both roles, Lease loss, omitted resume dispatch/admission, rollback exemption, candidate substitution, early journal advancement and generic rollback routing; add adjacent production Proof comments.
- [x] Repair sticky heartbeat loss after successful binary observation and later renewal; prove fresh and interrupted-resume refusal before journal normalization or protected effects, including watched omission.
- [x] Record final configured test/lint/typecheck/build and format/OpenSpec results in [verify-k8s-binary-preflight.md](verify-k8s-binary-preflight.md).
- [ ] Complete independent review and isolated host gate on the integrated SHA. Parent 10.1/10.2, semantic admission, activation, participant exclusion and recovery remain open.

### Bounded task 10.1 current WorkItemService authoring consumption

- [x] Watch mounted SQLite current-state add/update/remove/undo/redo regressions fail against the construction cache; retain already-current copy controls.
- [x] Read current authority at existing admission positions, preserving constructor validation and principal/owner/endpoint concealment ordering.
- [x] Cover active/inactive transitions and throwing authority for add, both update directions, remove, copy and undo/redo; compare complete tables after refusal, earlier local batch writes and zero publication.
- [ ] Complete independent review and integrated isolated host gate. Parent 10.1 stays open; production remains inactive and import-port refresh was not changed by this packet. Receipts and limits: [verify-current-authoring.md](verify-current-authoring.md).

Task 9.2 bounded remote blockage explanation (2026-10-23): connected trees carry
only referenced foreign root identities and qualified labels from the complete
captured component metadata, including roots beyond incident links. The strict
additive HTTP shape, delivered read and shared desktop/phone card index retain
those names on scheduled and unavailable reads. Producer and mounted HTTP tests
cover direct/step/stepless-hold roots, transitive roots, missing calendars, remote
renames, clearing and malformed metadata. Parent 9.2 remains unchecked; authoring,
activation and optimizer behavior are outside this packet. See verify.md.

Task 9.2 bounded remote navigation audit (2026-10-23): the assigned base already
contains persisted captured labels, stable remote project/work-item/step links
and foreign-endpoint exclusion from local chart input. No duplicate production
implementation was added. Fresh selected mounted/adapter checks and independently
rewatched navigation, label and chart regressions are recorded in
[the audit](evidence/task-9-2-remote-navigation-audit.md). This audit leaves parent
9.2 unchecked and grants no authoring activation or release acceptance.

Connected arrangement consumer checkpoint (2026-10-23): the bounded command slice
under 6.1/6.2 now consumes captured final target placement, preserves held/foreign
rows, refuses missing anchors and selected unready optimization, and retains atomic
journal/replay behavior. Evidence is in `verify.md` under “Connected arrangement
consumer”. Parent 6.1/6.2 remain open for their broader obligations.

Task 6.1 bounded mounted Fast resource capacity (2026-10-23): composed migrated
SQLite now proves two connected Fast projects retain capacity one versus two for
the same resource catalog identity, producing serial versus overlapping leaves
through installed mounted readers. A watched resource-only namespace fault moved
A's second leaf from day one to zero; restoration passed. Public IDs and resource
facts remain unchanged. See verify.md, “Task 6.1 bounded mounted Fast resource
capacity”; parent 6.1 stays open and synthetic authority does not activate writers.

Task 5.2 bounded real socket delivery (2026-10-23): the mounted completion command
now has production PushClient→HTTP push→gateway subscription→real websocket proof.
Authorized B/C streams equal their durable ledger envelopes, unrelated/foreign
observers remain silent and B readiness refreshes. Actual-send removal and wrong
subscription lookup fail independently. Evidence and limits:
[evidence/real-socket-delivery/report.md](evidence/real-socket-delivery/report.md).
Browser reconciliation, remaining writer coverage and rollout remain open;
parent 5.2 stays unchecked.

### Bounded task 7.3 mounted interleaving and stage-state acceptance (2026-10-23)

Eleven mounted SQLite cases now exercise two optimized projects across
`A.design → B.build → A.test`, strict durable Pri/Time alternatives, exact
selected dates, immutable single-visit stage identity, repeated settled reads,
rank/ID order, Fast/disabled/objective/held choices, and retention of the exact
valid composite for idle/pending/failed/corrupt/boundary-infeasible states.
Independent selector and final-stage faults were watched red and restored;
upstream sorting masks a selector-only omission on the mounted path, so the
existing adversarial selector test supplies that independent omission proof.
See [the bounded packet](verify-task-7.3-interleaving.md). Production is unchanged;
parent 7.3 and separate 7.4/8.4 obligations remain open.

### Bounded task 10.1 non-backend binary observations (2026-10-23)

- [x] Red/green gateway and MCP frozen own-role empty-semantic declarations and DB/config/main-independent argument-free subprocesses; independently break role, semantics, configuration import, startup import, argument guard and both freezes.
- [ ] Complete configured gateway/MCP test, lint, typecheck and build, shared/backend controls, formatting and OpenSpec validation; record receipts in verify.md. Parent 10.1 remains open; activation, participant fencing and production authoring are unchanged.

## Backup Job drain reconciliation correction

- [x] Reproduce active Job replacement and delayed ordinary Pod termination against the production drain path.
- [x] CAS-suspend owned Jobs, read back and revalidate identity/spec, then freshly inventory and gracefully drain Pods before orphan-deleting Jobs.
- [x] Prove guard removal fails, retain bystanders, and report timeout survivors without releasing journal or Lease.
- [x] Seed a real owned backup Job and realistic bounded grace in the disposable k3s lab.
- [ ] Run the revised disposable k3s lab on a host with the required toolchain; retain exact-head evidence.

Evidence: [drain correction verification](verify-k8s-job-drain.md).

Task 9.2 bounded persisted local successor scope editing (2026-10-23):
owner-only desktop and phone details offer exact local Whole/node/descendant-step
selection while preserving captured remote predecessor identity and the existing
relationship ID. Complete coordinate keys refuse stale scopes; 409 and pending
reopen retain drafts. See [bounded evidence](verify-9-2-successor-scope.md).
Remote predecessor scope editing is implemented; [bounded browser persistence acceptance](verify-9-2-predecessor-scope-browser.md) exercises the test-only writer seam. Parent 9.2 and production authoring activation remain open.

### Bounded task 10.2 role-bound Docker binary observation (2026-10-23)

- [x] Add the explicit-role closed decoder and config-free exact-image Docker observation primitive with backend/gateway/MCP image binding before invocation; retain backend-only wrapper and independent backend candidate/retained calls, including equal images and first installation.
- [x] Exercise actual role executables and production-path role/tier/image/failure/deadline/import refusals; watch independently restored safety mutations. Evidence: [verify-role-bound-docker-observation.md](verify-role-bound-docker-observation.md).
- [ ] Complete independent review and isolated integrated-SHA host gate. Parent 10.1/10.2 remain open; participant exclusion, activation, deployment callers, grants and rollback expansion are outside this packet.

### Bounded task 10.1 HTTP dependency-client admission (2026-10-23)

- [x] Share exact HTTP claim, WebSocket protocol token and typed incompatibility refusal.
- [x] Require production app admission and inspect current durable authority in a coherent same-connection read transaction after origin and identity policies.
- [x] Exercise real SQLite through mounted resource routes, exact claims, binary support, corrupt/closed authority, ordered refusals and rival activation; watch independent safety faults fail.
- [ ] Complete independent review and integrated host gate. Parent 10.1 remains open; client claim sending/decoding, gateway admission, activation and semantic advertisement remain outside this packet.

Bounded 10.1 SCIM review correction (2026-10-23):

- [x] Protect separately mounted SCIM Users list/read/create/patch/delete after provisioning authentication/rate admission and before body/resource work.
- [x] Preserve the SCIM refusal/media contract and prove no provisioning, membership, audit, project, event or journal effect on refusal.
- [x] Watch production composition-binding and service-guard removal admit enabled SCIM traffic; watch eager dependency inspection break missing-token authentication ordering.
- [ ] Complete independent review/integrated host gate; parent 10.1 remains open.

### Bounded task 10.1 gateway upgrade dependency admission (2026-10-23)

- [x] Add the canonical empty-body secret-authenticated backend admission shape, no-store 204/typed409 and fresh existing authority inspection after identity.
- [x] Require finite gateway transport admission after socket origin/credential authentication on every upgrade/reconnect; forward v1 only for the exact WS token and immutable binary support.
- [x] Prove mounted SQLite→backend→real socket disabled preservation and enabled reconnect refusal; watch local support, exact token, outbound header, typed refusal and skipped/reused upgrade-check faults fail.
- [ ] Complete independent review and integrated host gate. Parent 10.1 remains open: existing socket/delivery interval fencing, old process participant exclusion, client claim sending and activation remain outside this packet; binary advertisement stays empty.

Task 9.2 bounded persisted remote predecessor scope editing (2026-10-23):
owner-only desktop and phone details offer explicit stable-project scope lookup,
complete-page/exact-coordinate selection and preserved relationship identity.
See [implementation evidence](verify-9-2-predecessor-scope.md) and [bounded browser/HTTP/SQLite acceptance](verify-9-2-predecessor-scope-browser.md) for desktop node-to-whole and phone whole-to-node using the test-only writer seam. Parent 9.2, production authoring activation and broader acceptance remain open.

### Bounded task 10.1 awaitable retained delivery prerequisite (2026-10-23)

- [x] Red: reproduce premature internal-push response/count, delayed replay overtaken by later events/ack and detached presence rejection through gateway controller integrations; introduce the strict awaitable delivery contract and await every producer.
- [x] Add the required per-connection writer boundary, bind the synchronous physical socket writer, bound pending frames/deadlines, retire on overflow/expiry/rejection/drop and preserve connection cancellation; distinguish accepted Bun backpressure from dropped frames.
- [x] Independently remove queue order, capacity, deadline, cancellation, failure-cause reporting, physical-drop accounting, invalid-limit refusal, push counting, replay awaiting/retirement and presence awaiting guards; watch each corresponding production-path negative fail and restore the control.
- [x] Complete configured gateway test/lint/typecheck/build and independent Astra review of the corrected synchronous pre-write expiry guard; evidence: [verify-retained-delivery.md](verify-retained-delivery.md).
- [ ] Complete integrated isolated host gate and strict OpenSpec validation. Parent 10.1 remains open: no retained-session authority inspection, activation, v1 advertisement, client claims or authoring enablement.

Bounded task 7.3/7.4 installed-image acceptance source packet (2026-10-23): the
smoke now requires feasible and fractional connected authenticated child binds in
both image modes. Focused tests and independent validator/bind-removal proofs are
recorded in [installed solver image acceptance](verify-task-7-installed-solver-image.md).
Actual built-image acceptance and the disposable installed-Python
boundary-result relabel negative passed under the h2puni heavy lock at
`08b2fe31d`; see the pinned digests and cleanup receipts in the packet;
parent tasks 7.3/7.4 stay open.

### Bounded task 10.1 browser compatibility decoding prerequisite (2026-10-23)

- [x] Write failing shared-client and real HTTP mounted-plan tests for exact protected-resource incompatibility, malformed envelopes and visible guidance without sending claims.
- [x] Decode the exact shared admission schema as typed `dependency_incompatible` boundary failure; retain required semantics, normal conflicts, exemptions and cancellation; render plan guidance.
- [x] Watch separate decoding, presentation, closed-envelope, required-semantics, status, exemption and cancellation faults fail; restore each fault and run focused verification.
- [x] Complete independent Astra review and integrated configured frontend lint/typecheck; evidence: [verify-client-compatibility.md](verify-client-compatibility.md).
- [ ] Complete isolated host gate on the integrated SHA. Parent 10.1 remains open: no V1 HTTP/WS claim, protocol negotiation, activation, semantic advertisement or authoring enablement.

### Bounded task 10.1 retained gateway egress admission (2026-10-23)

- [x] Observe queued authority-change, held-admission cancellation and exact-expiry regressions before adding required asynchronous per-head admission and the synchronous physical writer contract.
- [x] Reuse current backend admission/closed decoder with parent cancellation and empty immutable gateway capability; retire incompatible and unavailable authority without false accepted counts or replay acknowledgement.
- [x] Remove subscriptions/presence and abort pending work synchronously before physical close; prevent delayed identity and held subscribe revival without awaiting the joined promise or own FIFO.
- [x] Independently remove the new guards, observe named mounted assertion failures and restore them; mount real SQLite backend plus production gateway for DISABLED→synthetic ENABLED zero-row push/replay refusal.
- [ ] Complete configured gateway checks, formatting, OpenSpec validation, independent review and integrated isolated host gate. Parent 10.1 remains open; deployment-owned delayed-204 post-read/pre-send race, participant exclusion, activation, authoring and semantic advertisement remain unresolved/outside this packet. Evidence: [verify-retained-egress.md](verify-retained-egress.md).

Task 5.2 bounded attempt-driven dependency invalidation (2026-10-23):

- [x] Capture authorized component-member step attempts on the borrowed writer, check snapshot lifetime after the awaited read, and include the detached authoritative attempt rows in the dependency fingerprint.
- [x] Prove mounted isolated/shared SS start, failed end and removal each publish one B/C event while readiness follows the attempt, disconnected same-organization and foreign projects stay silent, relationships remain stable, and rejected/read-failed writes leave no durable or push-observed publication.
- [x] Watch fingerprint omission and post-await lifetime-guard removal fail their production-path tests; record focused test, lint, typecheck and format evidence in `verify.md`.

Task 5.2 remains open for its broader writer audit, socket/browser acceptance and exact-SHA host gate.

## Task 10.1 bounded managed Compose gateway init prerequisite (2026-10-23)

- [x] Watch rendered gateway service YAML fail without init in the production `tierComposeContext` and preview path; request `init: true` for future gateway services while retaining backend init and frontend omission. The current production tier set has no MCP tier; preview MCP init remains absent.
- [x] Remove each gateway init branch independently and widen the production branch to all supported tiers; observe the rendered service assertions fail, restore and rerun green. Record scoped configured checks and limitations in [verify.md](verify.md#managed-compose-gateway-init-prerequisite-2026-10-23).
- [ ] Complete independent review and isolated host gate on the integrated SHA. Parent 10.1/10.2 remain open: existing running container init, process topology, physical gateway quiescence, participant exclusion, activation and deployment are outside this packet.

### Bounded task 10.1/10.2 gateway fence admission prerequisite (2026-10-23)

- [x] Reproduce retained intent admitting gateway-only/frontend-only/backend-only/mixed ordinary runs and direct executors; add a separate closed/versioned read-only gateway fence marker boundary before effects.
- [x] Refuse missing/unreadable trusted state and malformed/unreadable/present intent; check under the existing deploy lock before observation/planning and separately before direct executor effects.
- [x] Independently bypass both entry guards, root validation, retained refusal, read-error handling and grammar; observe named negatives fail, restore and record scoped checks in [admission evidence](verify-gateway-fence-admission.md).
- [ ] Complete strict integrated OpenSpec validation and isolated exact-SHA host gate. Independent Astra High rereview approved the bounded packet; parent 10.1/10.2 remain open: this packet ships no marker writer/clearing, stop, physical gateway exclusion, activation or deployment; retained presence is only a conservative admission barrier.

### Bounded task 8.3 mounted connected-save capture refusal (2026-10-23)

- [x] Exercise mounted isolated/shared absence, unreadability and contradictory required foreign evidence on the actual captured read, including exact read-connection ownership, complete durable no-write and all-push no-publication assertions, and healthy restored saves.
- [x] Watch independent missing-status fallback, fact-agreement, persisted abbreviation fallback, owned rollback and close removal failures; restore and record [bounded evidence](verify-mounted-save-refusal.md).
- [ ] Complete integrated isolated exact-SHA host gate. Independent Astra High review approved the bounded packet; parent 8.3 remains open.

### Bounded task 10.1/10.2 managed Compose gateway physical exclusion (2026-10-23)

- [x] Red/green dedicated explicit fence/inspection CLI modes, mutual flag/tier exclusion and actual deploy-lock ownership; refuse ordinary admission for orphan companion records.
- [x] Inventory full unfiltered Docker identities and enforce exact managed cohort, image resolution, Compose labels/network, init/private PID/unprivileged/no-capability prerequisites and stable process/start identity before publication.
- [x] Publish/readback exclusive fsynced marker, closed intent and intent-hash/attempt-bound completion; perform exact-ID restart disable/readback, bounded stop/readback, complete fresh stopped proof and final/inspection reobservation. Retain all evidence/current state after publication failures.
- [ ] Complete real Docker/websocket evidence and isolated integrated-SHA host gate. Configured scoped verification and watched R5 faults passed; independent Astra High review found no blocker. Parent 10.1/10.2 remain open; no live execution, activation, ordinary bypass, clearance or broad participant exclusion is granted. Evidence: [verify-gateway-exclusion.md](verify-gateway-exclusion.md).

### Bounded task 10.1/10.2 disposable Docker gateway exclusion acceptance (2026-10-23)

- [x] Add an uncached explicit-image/source-SHA acceptance runner using UUID-owned scratch, exact created IDs/network, loopback parent/child WebSocket challenges and bounded cleanup with external retained reports.
- [x] Prove both real gateway colors, stubborn-child process/session termination, exact receipt/intent hash, fresh stopped inspection, unchanged bystander, no-init prepublication refusal, external-restart refusal and a separate empty cohort.
- [x] Watch production stop/init/fresh-inspection omissions and absent-child startup fail independently; restore, run the configured Docker target and record [evidence](verify-gateway-exclusion-docker.md).
- [x] Correct reviewed pending-create ownership: watch network/container daemon-success/CLI-stall cleanup, unresolved pre-create refusal, unchanged unrelated resources and explicit dirty-source provenance; normalize retained log CRs and pass the full packet range diff check.
- [ ] Complete independent Astra High review and isolated integrated-SHA host gate. Parent 10.1/10.2 remain open; no production activation, admission behavior, swap, clearance or deployment changes are included.

### Bounded task 6.3 generated MCP startable-to-claim acceptance (2026-10-23)

- [x] Exercise actual generated MCP local/remote FS/SS start refusal and milestone correction, FF finish disclosure, omitted/explicit mixed-step atomic refusal and corrected first-step claim with stable owner/step/durable claim identity.
- [x] Watch independent production response forwarding erase prerequisite disclosure and fail all six cases; restore and rerun green, configured MCP lint and scoped typecheck. Record [bounded evidence](verify-mcp-startable-claim.md).
- [ ] Complete independent review and isolated integrated exact-SHA host gate. Parent 6.3 remains open; production admission, historical-attempt/manual-correction skip policy, activation and deployment are unchanged.

Task 5.2 bounded bare-step add/name-only rename fanout (2026-10-23):
[the verification packet](verify-step-fanout.md) records service-preflight
capture, isolated/shared no-person acceptance, durable rollback and after-commit
delivery, with independent add/rename/eager-placement production negatives.
The reviewed [blocked-hold fanout packet](verify-hold-fanout.md) adds the
missing semantic hold fingerprint and mounted isolated/shared A→B→C block,
clear, undo/redo and rollback proofs. Parent 5.2 stays unchecked pending final
writer-coverage reconciliation and the integrated gate.

### Bounded task 10.2 managed Compose backend exclusion (2026-10-23)

- [x] Red/green strict backend-only dedicated fence/inspection CLI modes, ordinary retained-backend/orphan admission, and real deploy-lock ownership.
- [x] Share existing gateway inventory/publication primitives and expose a narrow under-lock gateway inspector; bind exact gateway evidence byte hashes and verify both cohorts from each complete joint inventory.
- [x] Require a nonempty backend cohort, exact process/image/network/Compose/security identity, one DB_PATH and canonical directory-bind SQLite family/main-file identity; refuse unmanaged overlapping writable mounts.
- [x] Publish durable intent before effects; disable restart/readback all exact IDs before stopping/readback; retain hash-bound completion and require final fresh joint inventory with no activation/restart/clearance.
- [x] Watch skipped intent/update/stop/readbacks, foreign DB, duplicate DB_PATH, unmanaged writers, gateway byte drift and database replacement mutations fail; restore each mutant.
- [ ] Complete clean-source real installed-backend health/SQLite Docker acceptance, configured scoped verification, independent Astra review and isolated integrated-SHA host gate. Parent 10.1/10.2 remain open. Evidence: [verify-backend-exclusion.md](verify-backend-exclusion.md).

- [x] Reuse actual initialized `verifyContainerNamespace` admission for every unmanaged persistent mount even after host Source success/EACCES/ENOENT; preserve explicit unsupported BuildKit refusal and require fresh complete inventory after audits before intent.
- [x] Watch independent namespace-invocation, namespace identity, mount completeness, inventory cardinality/membership and post-audit identity comparison omissions fail; cover opaque/rebound/read-only/nested/hardlinked aliases, tools/receipt/timeout/reap failures and unsupported security/init/PID targets.

- [x] Correct managed Source rebinding with actual managed-mode census, captured main/directory anchors, exact directory receipt/readback; watch blue-only, split-colour and all-hardlinked-directory lifecycle failures plus six independent check omissions.

### Bounded Task 10.1/10.2 read-only Compose participant observation (2026-10-23)

- [x] Add the dedicated `be --inspect-dependency-participants` early invocation under one selected deploy lock, refreshing retained managed backend/gateway evidence and the unfiltered Docker/network/process/full live Caddy topology twice under one bounded deadline. Return only a versioned blocked observation with explicit unresolved obligations; refuse source-run dev, unresolved ingress and changed evidence.
- [x] Add focused production observer/census and real CLI refusal tests; watch independent source-run, network-member, alternate-ingress, PID-association, evidence-refresh and real-lock guard faults fail. Evidence and limits: [verify-compose-participants.md](verify-compose-participants.md).
- [ ] Complete positive real-Docker/retained-proof CLI acceptance, independent review and isolated integrated-SHA host gate. Parent 10.1/10.2 remain open; this observation enables no activation, receipt, restart-authority control, MCP/client exclusion or continuous participant fencing.

Task 3.2/11 bounded MCP startup correction (2026-10-23): generate the required
same-checkout OpenAPI artifact before source/image/bundle startup; keep current
command/exclusion parity and remove runtime contracts/core barrel reachability.
Ordered TDD: default artifact missing/unreadable/malformed negatives; emitter
acceptance and generated parity; poisoned-barrel startup negative; uncached
preparation freshness and bounded 512 MiB startup observation. Evidence and
remaining delivery limits: [MCP startup memory](verify-mcp-startup-memory.md).
Parent 3.2, activation and Task 11 stay open.

Task 3.2/11 MCP preparation follow-up (2026-10-23): source deploy fingerprints
all generator source trees and library alias configs, restarts the supervisor,
and reruns uncached preparation. Real Git-reset/sync/Nx regression and watched
independent omissions are in the [startup memory packet](verify-mcp-startup-memory.md).
Ordinary application source retains watcher delivery. Parent tasks stay open.

### Bounded task 10.1/10.2 shared edge owner admission prerequisite (2026-10-23)

- [x] Red/green real source writer marker refusal and canonical shared-lock contention across prod/dev swaps, dev poller/loader/devsync and bootstrap/configure.
- [x] Preserve legacy absence, retain closed/orphan marker semantics, verify inherited descriptor identity/kernel lock and repeat direct-executor admission; watch production-path guard omissions fail.
- [ ] Complete integrated exact-SHA host gate. Independent Astra rereview approved the bounded packet after the child-FD, staged-config and prefetch corrections. Installed writer identity/drain/adoption, retained owner publication and activation remain outside this prerequisite; parent 10.1/10.2 stay unchecked. Evidence: [verify-shared-edge-admission.md](verify-shared-edge-admission.md).

- [x] Correct review findings with explicit inherited-FD remapping across real devsync child launch, staged provisioning base commit under configure admission, and manual retained-marker refusal before fetch; watch omitted mapping, direct live copy and prefetch admission negatives fail. Parent activation/installed-adoption obligations remain open.
