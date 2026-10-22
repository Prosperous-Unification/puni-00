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

### Task 4: Unified relationships, admission and actual graph — WBS 010.05

- [x] 4.1 Create `apps/wbs/be-01/drizzle/20261022211000_add_external_dependencies/{migration.sql,down.sql}` after confirming the identity is unused. Extend `libs/wbs/adapters/store-sqlite/src/{schema.ts,typed-dependency.ts}`, `libs/wbs/application/core/src/ports/typed-dependency-store.ts`, `libs/wbs/domain/domain/src/typed-dependency.ts` and conformance typed store. Preserve local rows; add both endpoint project IDs, successor ownership and incident indexes; enforce work-item/project, step/project and organization consistency. Implement owned/incident unified reads and atomic local↔external updates preserving relationship ID. Extend `typed-dependency.db.test.ts` and add `external-dependency-migration.db.test.ts`: `combines local and external rows`, `lists both incident directions once`, `representation move preserves identity`, `rejects cross-project mismatched endpoints and foreign organizations`, `duplicates refuse across representations`, `down preserves local rows`. Negatives: remove each ownership/duplicate check separately and observe production repository write/read tests fail; corrupt required endpoint evidence and prove the reader throws.
- [ ] 4.2 Extend `libs/wbs/application/core/src/module/plan-commands/{command-references.ts,admitted-scope.resource.ts,working-plan-edges.resource.ts,run-command-batch.ts}` and direct commands in `module/work-item/work-item.resource.ts`. Revalidate successor edit access, predecessor read access, same organization and endpoint shape inside the transaction. Keep a batch scoped to one successor owner. Add `apps/wbs/be-01/src/controller/cross-project-dependency-commands.controller.db.test.ts`: `restricted readable predecessor needs no edit permission`, `foreign and absent endpoint return same not found`, `revocation after lookup refuses`, `second successor owner refuses`, `local aliases remain local`, `remote step ownership refuses`. Negatives: bypass each access/owner/shape predicate independently, watching mounted command tests incorrectly succeed; assert no relationship, revision, history or event changed on refusal.
- [ ] 4.3 Add `libs/wbs/domain/domain/src/connected-step-node.ts` / `connected-step-node.test.ts`, `libs/wbs/application/core/src/service/connected-dependency-graph.ts`, and extend `service/dependency-graph.ts`. Resolve each project's tree/steps/legacy depReach before combining typed external edges and provenance. Wire resulting-state validation into direct/batch commands (`module/plan-commands/plan-command-graph.ts`), moves, hand-down, step edits/removal, reach changes and estimate presence changes. Add `apps/wbs/be-01/src/controller/cross-project-dependency-graph.controller.db.test.ts`: `accepts A.design B.build A.test`, `rejects genuine reverse cycle and self-node`, `distinct tasks can close remote cycle`, `remote scopes expand under their own trees and steps`, `move step edit reach and estimate anchor changes revalidate final graph`, `batch rollback preserves every affected revision`. Negatives: omit one expanded pair, use project-name cycle refusal, use target reach for all projects, and bypass each structural guard call separately; observe the named real graph/controller tests fail.
- [ ] 4.4 Extend incident lifecycle and compensating history in `module/work-item/work-item.resource.ts`, `ports/command-journal-values.ts`, typed store and project deletion. Refuse deletion of referenced external predecessors/projects; successor deletion removes owned relationships undoably; hand-down maps incident step facts without changing authored scope. Add `apps/wbs/be-01/src/controller/cross-project-dependency-lifecycle.controller.db.test.ts` and `cross-project-dependency-history.controller.db.test.ts`: `predecessor deletion refuses`, `successor deletion removes only owned links`, `first child inherits external endpoint`, `incident touched identities journal together`, `undo refuses newly formed remote cycle`, `redo revalidates current access and endpoint ownership`, `concurrent endpoint edit refuses compensation`, `undo representation move restores same ID`. Negatives: remove deletion refusal, incident mapping, touched-ID conflict guard and each replay graph/access check independently; mounted tests must catch unsafe success and verify atomic refusal across journals/revisions/events.

### Task 5: Coherent capture and live invalidation — WBS 010.08

- [ ] 5.1 Extend `libs/wbs/application/core/src/ports/{chain-snapshot-store.ts,shared-people-values.ts,saved-plan-capture-values.ts}`, `libs/wbs/adapters/store-sqlite/src/{chain-snapshot.ts,saved-plan-capture.ts,captured-optimization-reader.ts}`, and add `service/connected-plan-values.ts` under core. Capture incident dependency closure and, in shared mode, shared-person connections in both directions; each project is captured once with its own complete scheduling/progress/label facts. Keep authorization, closure, derivation and sequential cache selection in one snapshot for externally connected isolated/shared reads; ordinary isolated/legacy reads retain existing detached lifetime and avoid unrelated ranks/projects. Borrowed command reads include staged writes and never close the owner transaction. Extend `chain-snapshot.db.test.ts`; add `connected-plan-capture.db.test.ts`: `concurrent predecessor edit yields one coherent state`, `connected isolated capture excludes concurrent cache publication`, `ordinary isolated lifetime is retained`, `closure follows both incident directions and shared bridges`, `required absent unreadable malformed facts refuse`, `borrowed capture sees staged writes`, `success modeled refusal and throw close exactly once`, `capture never admits solver work`. Negatives: remove BEGIN, defer cache/derivation past close, swap borrowed connection, omit closure, bypass authorization or omit close separately; watch production-factory tests fail, including concurrent cache publication after BEGIN remaining invisible until the next observation.
- [ ] 5.2 Extend `libs/wbs/application/core/src/service/shared-people-fanout.ts`, `ports/project-event.ts`, committed backend event composition and gateway delivery. Invalidate dependency components without shared people, including both old/new components after topology change; recompute on progress/estimates/calendar/capacity/rank/engine edits and refresh labels on abbreviation/name/number changes without retargeting. Extend `shared-people-fanout.test.ts`; add `apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts`: `remote completion invalidates successor without shared people`, `topology refreshes old and new components`, `rename updates label only`, `fanout occurs after commit`, `foreign organization gets no labels`. Negatives: drop incident traversal, emit before commit or bypass organization filtering; mounted event assertions must fail and rolled-back writes must publish nothing.

### Task 6: Combined Fast scheduling and readiness — WBS 010.06

- [ ] 6.1 Create `libs/wbs/domain/domain/src/resolved-schedule-input.ts`, `schedule-connected.test.ts` and `libs/wbs/application/core/src/service/connected-plan.ts`; adapt existing `schedule.ts`, `step-node.ts`, runtime-portable scheduler and `canonicalScheduleParts` instead of duplicating levelling. Preserve each project's estimate/rounding/steps/width/reach. Preserve `withoutHeldSubtrees` before constraints in both engines while keeping authored relationships inspectable. Namespace team/resources by project, people only in isolated mode; enforce eligibility/FS/SS/FF before rank and priority. Tests: `interleaves A.design B.build A.test`, `lower ranked prerequisite precedes high ranked successor`, `priority orders only eligible work`, `team and resource catalog IDs do not merge project pools`, `people share only in shared mode`, `project estimate inputs remain distinct`, `held reduction preserves existing behavior and authored inspection`, `unconnected plan keeps old path`. Negatives: remove each eligibility/boundary/capacity namespace guard and watch actual Fast projections violate its invariant. Rerun existing typed, priority, joint-capacity, resources and hold suites.
- [ ] 6.2 Extend connected derivation through `libs/wbs/domain/domain/src/workday.ts` and core `service/saved-plan-schedule.ts`. Translate through workday ordinals, preserve fractional manual floors/deadlines, enforce project start floors, and project back through each anchor. Add `schedule-connected-calendar.test.ts`: `Monday Wednesday anchors agree from either project`, `fractional offsets survive translation`, `manual floors and deadlines retain own anchor`, `weekend uses current workday calendar`, `missing prerequisite anchor returns dependency_calendar_missing with visible relationships`, `undated unconnected behavior is unchanged`. Negative: substitute target anchor, round fractions, omit floor or default missing date to zero separately and observe production read tests fail; no incomplete dated projection is labeled complete.
- [ ] 6.3 Extend `libs/wbs/application/core/src/module/work-item/startable.ts` and connected node readings with coherent per-project progress/attempt evidence. Add a shared execution-eligibility reading: FS requires done before start, SS requires actual start/done, FF exposes a finish condition without blocking start. Use it in local and remote advertised startability and matching governed step claim/start admission; retain manual progress/actual correction policy. Preserve hold, completion, claim and resource behavior. Extend `startable.test.ts`; add `apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts`: `unfinished local and remote FS exclude a new start`, `remote FS completion releases successor`, `SS requires actual start`, `FF permits start and reports finish prerequisite`, `governed claim agrees with startable`, `manual correction retains override policy`, `missing calendar still exposes readiness`. Negatives: independently omit remote progress/attempt/hold/edge evidence, admit absent project evidence, or bypass FS/SS eligibility and each governed consumer; mounted startable/tree/claim tests must detect false readiness or premature starts and verify atomic refusal. Follow the exact boundary and skipped-completion-policy rules in [the scheduling ruling](architecture/connected-scheduling.md).

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
    - [ ] Prove stable successor-owned transfer links, unavailable outcomes, immutable stage boundaries and current client download/import projection; record watched faults and focused checks.
    - [ ] Integrate current-principal import packet and whole-project authorized export/import rollback proofs before claiming 8.1/8.2 complete.

  - Bounded whole-project v11 integration slices 1–2 (parent 8.1 remains open):
    - [x] Real mounted multi-scope incoming/internal/outgoing/component artifact traverses archival classification and a separate test-only same-source active importer, preserving exact remapping and external UUIDs without history writes.
    - [x] Generated client, downloaded Blob and page import preserve the mounted artifact's authored transfer set while stripping read-only history; inactive refusal retains selection.
    - [x] Mounted production incoming import remains inactive with/without the synthetic importer; outgoing-only v11 retains internal typed and legacy content on successful import.
    - [ ] Complete stable identity changes/mapping precedence, current endpoint/graph changes, all-effects injected rollback and remaining compatibility/transport/public activation proofs (planned slices 3–5).

- [ ] 8.2 Extend project/subtree copy orchestration and `module/work-item/work-item.resource.ts`. Internal relationships remap IDs; copied successors preserve authorized external prerequisites with new relationship IDs; copying a predecessor never clones outgoing relationships into another successor owner. Extend `apps/wbs/be-01/src/controller/typed-dependency-copy.controller.db.test.ts`: `copied successor retains original external prerequisite`, `internal endpoints and steps remap`, `copied predecessor creates no outgoing foreign owner write`, `unrelated edge is not copied`, `copy revalidates access and graph atomically`. Negative: clone all incident edges, reuse relationship IDs or skip access/graph checks independently; actual copy tests must catch foreign owner writes or unsafe success.
- [ ] 8.3 Extend core `ports/{saved-plan-capture-values.ts,saved-plan-values.ts}`, `module/saved-plans/{save-plan.ts,saved-plan-integrity.ts,saved-plan-values.ts,saved-plan-schedule.ts}`, SQLite `{saved-plan-capture.ts,saved-plan.ts}` and saved HTTP payload versions. Persist external identities/labels, graph/placement and selected optimization boundary evidence; historical reads fetch no live foreign facts, while navigation checks current access. Add paired additive payload migration only if existing versioned storage requires schema change. Extend `saved-plan-capture.db.test.ts`, `saved-plan-immutability.test.ts`, backend `service/saved-plan-read.db.test.ts` and frontend `saved-plan-compare.test.tsx`: `rename renumber edit deletion do not reinterpret history`, `history works with unavailable live external access and performs no live lookup`, `missing unreadable required save evidence leaves no partial snapshot`, `comparison states captured boundary`. Negative: replace captured evidence with live reads, omit required fields or escape save transaction separately; actual save/read tests must fail. Retain explicit readers for old saved versions.
  - [x] C2 bounded backend/HTTP comparison (2026-10-22): required left/right frozen side summaries, exact retained boundaries and explicit schedule/provenance state now pass through service and HTTP; current/current resolves once. Mounted SQLite and poisoned live capability proofs are recorded in verify.md. Frontend client/state/rendering, remaining lifecycle matrix, active writer integration and canonical gate remain deferred; task 8.3 stays open.
  - [x] C1 bounded comparison projection (2026-10-22): dormant pure `SavedComparisonSide` projection retains legacy unknown/local/connected provenance, labels, unavailable reasons, objective states and exact foreign pre-selection boundaries. Pure mutation evidence remains provisional; HTTP/client/UI wiring, mounted no-live-lookup proofs and current/current capture-count test remain deferred to C2. See `verify.md`, “Saved comparison C1 pure projection”.
  - [x] Bounded saved-resource packet (2026-10-22): validate v9/v2 historical bodies after stored hash/link checks; propagate typed body/path/code corruption through mounted read and either comparison side; decode v9 saved comparison input without changing active v8/v1 writers. Proofs and limits: `verify.md`, “Saved history resource integration”. Connected capture/writer/current, full immutable lifecycle, side provenance and activation remain open.
- [ ] 8.4 Integrate connected projection into work-item live tree, retained batch reads, core `service/{project-page.ts,person-load.feature.ts,space.resource.ts}`, arrangement and optimizer restart/admission. All projections from one observation use one composite; capture remains non-admitting, explicit owner admission occurs after snapshot closure. Extend person-load/space/arrangement tests and add `apps/wbs/be-01/src/controller/cross-project-live.controller.db.test.ts`: `tree retained batch load and spaces agree`, `arrangement sees staged links`, `restart builds current boundary question`, `aggregate deduplicates overlapping components`, `ordinary reads allocate no solver work`, `labels do not reread live after capture`. Negative: route one surface through old rank-only scheduling, defer derivation past closure or use admitting reader; watch that mounted surface fail. Rerun existing shared/live snapshot and staged arrangement lifecycle regressions.
  - Bounded shared connected aggregate capture/projection, mounted load/Space foreign refresh and seven watched faults: [evidence](evidence/shared-connected-aggregate/README.md). Full 8.4 remains open.
- [x] 8.5 Add sparse/dense connected fixtures beside `libs/wbs/domain/domain/src/schedule-benchmark.test.ts` and SQLite `connected-plan-capture.db.test.ts`. Tests: `captures each required project once`, `closure includes incident and shared person bridges`, `lookup page bounds never truncate scheduling closure`. Measure query counts/capture/derive timings and record actual measurements, without inventing an unsupported budget. Negative: apply search page limit to required closure or repeat capture per projection and observe completeness/count tests fail. Evidence: [connected benchmark](evidence/connected-benchmark/README.md).

### Task 9: Dependency UI and project settings — WBS 010.09

- [x] 9.1 Implement the real table/phone/Customize flow described in [the autocomplete/editor ruling](architecture/autocomplete-editor.md). Extend `apps/wbs/fe-01/src/components/wbs/{depends-input.ts,dep-picker.ts,use-plan-dependencies.ts,plan-columns/depends.tsx,plan-cards.tsx,typed-dependency-editor.tsx,plan-live.ts,wbs-table.tsx,use-plan-read.ts}` and their actual memo/delivery callers. Add required `modules/dependency-lookup` feature service, inject the existing scoped address client through session/project runtime, and preserve optional step codes in frontend transport/equality. Directory reference-set kinds are unrelated and remain unchanged. Use one scoped selection model through picking, Customize and stable-pair command serialization; complete remote choice pages before inferring a unique code default. Alphabetic initial token enables bounded debounced projects alongside local title matches; empty/numeric/`010.s1-dev` stay local. Selection scopes remote lookup and preserves earlier comma/space tokens; dedupe by identity. Model loading, no match, retryable failure, cancellation and stale results. Tests: `empty numeric tokens never request projects`, `PUNI shows projects and local titles`, `late alphabetic response cannot populate 080`, `selection preserves mixed earlier tokens`, `failed lookup renders retry not empty`, `unmount cancels lookup`. Negatives: remove alphabetic/stale-token/cancellation guard separately and observe mounted field tests send unwanted calls or render stale options. Use configured frontend Vitest/Nx targets, not root bun:test. Also prove actual table and phone runtime integration, scoped client withdrawal, per-page revision/completeness, mixed-submit identity dedupe, real command serialization and per-endpoint Customize cases from the ruling. Independently break runtime/close, rendered query identity, page revision/completeness and remote-step identity guards. New-selection support does not claim persisted remote relationship display or production activation.
- [ ] 9.2 Extend frontend `{typed-dependency-editor.tsx,reference-set-presentation.tsx,depends-card.tsx,plan-columns/depends.tsx,use-plan-dependencies.ts,project-settings-modal.tsx}` and respective tests. Render qualified labels and stable remote navigation; no Gantt arrow to absent row. Step default matches unambiguous remote code, never local UUID; ambiguity/unavailable requires explicit selection. Render calendar unavailability and boundary-infeasible certificate scope with retained valid Fast and inspectable links/readiness; suppress same-question Retry according to typed response. Support abbreviation edits/conflicts. Tests: `remote step uses own identity`, `ambiguous step needs selection`, `rename changes label not target`, `remote relationship has navigation but no local arrow`, `missing calendar keeps relation inspectable`, `boundary infeasible retains Fast and disables same question Retry`, `abbreviation conflict is visible`. Negatives: substitute local step UUID, navigate by address string, collapse failed/unavailable state to empty or enable terminal Retry separately; mounted view tests must fail.

### Task 10: Semantic activation and deploy capability — WBS 010.10

- [ ] 10.1 Add `libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.ts`, durable monotone authority, immutable runtime capability/startup hooks and command admission. Activate authoring only after the deployment owner proves incompatible readers/writers/background/gateway/MCP/retained-client participants cannot serve or resume. Guard startup/downgrade after activation even with zero live external rows, distinguish semantic capability from additive schema compatibility, and expose capability to clients. Add `apps/wbs/be-01/src/controller/cross-project-activation.controller.db.test.ts`: `dormant compatible binary reads legacy plans`, `old runtime overlap refuses creation`, `complete compatible participant proof permits activation`, `activated empty store refuses incapable startup or downgrade`, `missing unreadable malformed authority evidence refuses`. Negatives: bypass each capability/activation/startup guard independently and observe real startup/command tests admit incompatible execution; document an exact pinned attended compatible recovery diagnostic. A destructive removal command remains outside delivery until it can prove retained journal, saved-plan and replay obligations.
- [ ] 10.2 Integrate immutable runtime-capability preflight, complete participant fencing, activation receipt transport/readback and semantic downgrade refusal into `tools/tool-remote-scripts/src/{swap.ts,lib/deploy-contract.ts}`, `tools/tool-deploy/src/k8s/{deploy-k3s.ts,migration-capture.ts}` and their capability adapters. Preserve complete applied-set capture/hash validation; keep `apps/wbs/be-01/src/migrate-capabilities-cli.ts` DB-free and distinct from runtime dependency capability. Compose preserves attended recovery after durable stop intent: retain current store, candidate exposure and interruption evidence without automatic schema reversal, snapshot restore or old-writer restart. Kubernetes preserves its verified dormant rollback contract, but possible semantic activation or uncertain exposure requires attended recovery; only an explicitly admitted dormant restoration reverses exactly captured additions and compares the full name/hash ledger. Extend `swap-writer-barrier.test.ts`, `swap-migration.db.test.ts` and `deploy-k3s-workflow.test.ts`: `Compose Kubernetes refuse incapable candidate`, `incomplete participant proof refuses activation`, `Compose post-stop failure retains barriers`, `Kubernetes refuses incompatible rollback after possible activation`, `eligible dormant exact-set restoration compares full ledger`, `edited applied migration refuses`, `failed restoration retains evidence and names pinned manual procedure`. Negatives: suppress candidate capability, bypass participant or activation guard, drop capture member/hash comparison and inject restore failure separately; production deploy adapter tests must catch each fault. Update `docs/runbook-prod-deploy.md` / `docs/runbook-dev-deploy.md` and link guard JSDoc to recovery instructions.
- [x] 10.2-B1 Add shared pure capability command/closed decoder and Kubernetes-only fresh Job/Pod-attributed observation transport with DB-free capability Jobs and coordinator-generated scratch store scans. Verify independently invoked equal images, stale/replaced/foreign evidence refusal, effective security/mount projection and real migrated SQLite/WAL source invariance. This is transport only; B2 storage fencing and B3 durable admission/exposure/recovery integration, live runtime acceptance and the parent task remain open. Evidence: [verify-k8s-dependency-observation.md](verify-k8s-dependency-observation.md).
- [x] 10.2-B2a Add observational Kubernetes storage readbacks with PVC/PV UID binding, backend/policy/Flux readback, unfiltered Pod and standard controller-template inventory, conservative consumer refusal and identity/template comparisons. No scan or release integration is enabled. Durable controller ownership/suspension/drain/restoration and continuous stopped-storage enforcement remain open B2 work. Evidence: [verify-k8s-storage-readback.md](verify-k8s-storage-readback.md).
- [x] 10.2-B2b-prepared Add the closed prepared-only ownership record, GET-only cluster/storage/Flux/backup observation and mandatory caller-owned durable checkpoint, with conservative original-state restart validation. This bounded primitive performs no suspension or drain and has no release caller; conditional UID/resourceVersion patching, acknowledgment resume, exact Job/Pod drain, release persistence/interval/restoration and B3 admission remain open. Evidence: [verify-k8s-storage-ownership.md](verify-k8s-storage-ownership.md).
  - Bounded prerequisite: exact-image DB-free backend capability observations now run before Compose stop intent and through shared recovery admission. This does not complete 10.2: strict coordinator-owned stopped-store authority admission and post-maintenance/pre-exposure recheck are implemented as the next bounded prerequisite; participant fencing, activation and Kubernetes work remain open. Evidence is in verify.md under “Compose binary capability prerequisite” and “Compose dormant preservation prerequisite”.

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
