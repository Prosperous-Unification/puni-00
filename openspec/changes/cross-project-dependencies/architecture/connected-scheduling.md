# Connected Fast scheduling, calendar and readiness ruling (6.1–6.3)

Read-only architecture ruling, 2026-10-22. Basis: integration `/home/df/.codex/worktrees/b3b7/puni-00` at approved graph foundation `3980e0bb5`; current capture value read from `/tmp/puni-cross-capture`. This extends `/tmp/puni-connected-capture-graph-architecture.md`, D4/D5 and tasks 6.1–6.3. It does not complete optimization, historical capture/export, live invalidation, UI or activation. Those remain required delivery scope. No code, tests, mutation proofs or host gate were run for this ruling.

## Binding decision

Use one component placement, produced by the existing Fast leveller. Extract its resolved-input boundary; do not schedule projects serially, repeatedly nudge independent schedules to convergence, flatten all projects under one reach, encode external links as old elsewhere bookings, or implement another capacity loop. The authored connected graph, reduced scheduling graph and live progress projection are distinct values from the same observation.

`resolveConnectedGraph` already provides the correct ownership and authored expansion seam. Its `ConnectedProjectGraph` can also describe a prepared reduced local graph: clarify its current “unreduced” JSDoc when reusing it, without weakening the graph guard's explicit unreduced contract. Never call `resolveDependencyGraphContext` to obtain scheduling durations: that helper deliberately manufactures estimate-presence placeholders. Build scheduling contexts from real per-project slices instead.

## Domain boundary and placement ownership

Create `domain/src/resolved-schedule-input.ts` with these precise fields (the order discriminant avoids inventing a project identity for historical single-project calls):

```ts
interface ResolvedScheduleInput {
  readonly rows: readonly PlannedRow[];
  readonly slices: readonly Slice[];
  readonly graph: StepNodeGraph;
  readonly notBefore: ReadonlyMap<string, number>;
  readonly deadlines: ReadonlyMap<string, number>;
  readonly poolSizes: PoolSizes;
  readonly resourceCapacities: PoolSizes;
  readonly elsewhere: Elsewhere;
  readonly order:
    | { readonly kind: 'local' }
    | {
        readonly kind: 'connected';
        readonly projectIdByWorkItem: ReadonlyMap<string, string>;
        readonly rankByProject: ReadonlyMap<string, number>;
      };
}
```

Numbers in this input use one workday coordinate system. There is no `reach`, local authored dependency list, organization, date, database capability or core capture type here: resolution has already applied the per-project rules. `graph.edges` retains `workflow`/`legacy`/`authored`, type and authored relationship ID. Keep actual work-item IDs and step IDs; do not manufacture concatenated work-item identities. The approved resolver already rejects cross-project duplicate work-item ownership. Slice keys remain the current `sliceKey`; stepless boundaries remain real zero-duration nodes.

Provide `resolveScheduleInput(input: ScheduleInput): ResolvedScheduleInput` for the existing local tuple, using `indexTree`, `groupSlicesByLeaf`, `expandToLeaves` and `resolveStepNodeGraph` exactly as today, with `order.kind = local`. Preserve absence/empty optional-field compatibility in the old canonical serializer; do not change historical hash bytes or solver schemas in this slice.

Keep public `schedule(...)` and pinned-start behavior. It adapts the old tuple, then delegates to `scheduleResolved(input, pinnedStarts?)`. Move, rather than copy, the existing graph-to-`SliceNode` conversion, CP pass, eligible heap, levelling, resource annotation, backwards pass and work-item projection into that implementation. Private helpers can stay in `schedule.ts`; moving the whole file is unnecessary. Retain local input validation and grouping behavior. Verify every resolved graph node and positional endpoint against the actual grouped slices and require an exact node set (no missing/extra node, wrong step or invalid position). A supplied graph must not silently change node meaning.

Extract `validateResolvedRealBoundaries(input, plan)` from `real-boundaries.ts`. The old `validateRealBoundaries` resolves the local input then calls it; connected scheduling validates the supplied reduced graph. This must preserve the strict real-number FS/SS/FF check after materialization, including negative FF weights and fractional finishes. Validation cannot reconstruct edges under a made-up common reach.

For Fast, prepend `(project rank, bytewise project ID)` to the current comparator **inside the eligible heap**. Within one project retain today's `(deadline slack, deadline, inherited priority, unleveled start, float, tree order, slice position, key)` order. The node's incoming count still decides eligibility before any priority comparison. Keep weighted inequality calculation `FS = predecessor duration`, `SS = 0`, `FF = predecessor duration - successor duration`, including negative FF weights. The existing weighted reconciliation/tiling and bounded refusal remain authoritative. Pinned replay retains its chronological/topological comparator; do not reinterpret rank as a pin.

`step-node.ts` needs no new node encoding or project field: stable IDs and the separate ownership map already provide identity. Update only a shared preparation extraction if the implementation actually requires one.

## Preparing the component

Core owns `service/connected-plan.ts`. Refactor the duplicated preparation in `canonicalScheduleParts` and `scheduleInputOfCaptured` into one core helper taking explicit project settings and scheduling facts (a structural settings type accepting live and captured projects). Keep `slicesOf`, estimate/PERT/rounding, effective teams, `maxParallel`, assignment widths, charged demands, date-floor/deadline helpers and `withoutHeldSubtrees` as the actual implementations. Preserve the live wrapper's returned `hasChildren`, assignment and estimate-rule display facts. The capture wrapper's absent factual start/end is explicit historical evidence, never a live fallback.

For each captured project, in deterministic rank/ID order:

1. Build the **unreduced authored** graph using its own rows, steps, estimate presence, legacy edges, reach and local typed rows. Combine through `resolveConnectedDependencyGraph`/`resolveConnectedGraph` with the complete external list. Keep the original capture and all relationships intact for inspection/readiness. Check scoped relationships agree with the per-project local list; the capture contract already requires this.
2. Prepare its real canonical input and run `withoutHeldSubtrees`. Blocked/readiness/done do not add new removal rules. Done work remains scheduled as today.
3. Construct its reduced `ConnectedProjectGraph` with its reduced tree, grouped real slices and `resolveStepNodeGraph(..., own reach, own typed)`. Fully held ancestors are absent; partly held selectors retain only surviving leaves.
4. Filter external scheduling relationships by whether **both authored endpoint work-item IDs survive in their own reduced tree**. Resolve the surviving external selectors through `resolveConnectedGraph`. A filtered relationship is omitted from this scheduling value only, never the authored value. Reduced-empty projects are legal contexts.
5. Namespace capacity keys and translate dates as below; concatenate reduced rows/slices and the already-resolved graph into `ResolvedScheduleInput`. There are no synthetic whole-project edges. Connected `elsewhere` is empty because every coupled project is already in the component. The existing nonconnected shared chain retains its elsewhere behavior.

Capacity identities use an injective encoder such as `JSON.stringify([kind, projectId, id])`, never an ambiguous separator. Team pools and resource capacities/demands are always project-local. People remain their actual ID in shared mode and become an encoded project/person key in isolated mode. Compute widths under each project's original capacity before encoding; do not allow another project's pool size to alter the width. Encode both slice references and capacity-map keys. Preserve a reverse identity map for output; output slices expose the actual person/team/resource IDs, not opaque internal keys. A foreign resource predecessor retains its actual slice key and separate project ownership/label evidence, not an invented local row reference.

## Calendar arithmetic

`workdayOrdinalOf` already exists; reuse it. For every project with surviving scheduling nodes, require its own non-null `startDate` before a complete component placement. This also applies to undated shared-person peers: their active placement cannot be put on the same axis without an anchor. A project with no surviving nodes supplies no boundary and need not block the component solely for its absent date. An ordinary undated, nonconnected plan stays on its current local path.

Choose `origin = min(workdayOrdinalOf(startDate))` over projects with surviving nodes, independently of requested target and rank. Let `shift[p] = ordinal[p] - origin`. For each p, translate every existing manual floor and deadline as `shift[p] + localOffset`, preserving the fractional number exactly. Do not translate by calling `addWorkdays` and reparsing a date, `firstWorkdayOf`, `floor`, `ceil`, or `workdaysBetween` between project anchors: these either discard fractions or clamp signed differences.

Impose an explicit floor of `shift[p]` on every reduced leaf's first slice, by adding/maxing the leaf's entry in the translated not-before map. Ancestor/manual floors still expand through the existing `leafFloorsOf`. This is needed even when no manual floor was authored. Existing deadline parsing continues to use `deadlineOffsetsOf`, its weekend-backwards rule and before-project-start refusal; this change does not silently repair impossible trusted deadlines. Start dates/weekends use the current forward-roll Monday–Friday calendar. Timezone affects existing actual/progress day interpretation only.

After a combined placement, project each member using its own `shift[p]`: subtract it from earliest/latest start/finish fields on slices and work-item spans. Preserve effort, duration, float, criticality and lateBy. Use existing date rendering on the local offsets and that project's anchor; never use the requested target's anchor for other projects. Count waiting leaves per project from that project's slices instead of copying global waiting counts. `eventsVisited` is computation instrumentation: retain it at component level and, if existing Schedule projections require it, document that it is the component computation count rather than inventing a per-project measurement. Preserve all original unheld identity mappings and reverse capacity encoding. Foreign capacity/person blockers need ownership evidence beside their stable slice keys.

The all-held/empty case has no scheduling origin (`originOrdinal: null`) and empty schedules; no calendar date is fabricated. A nonempty schedule requires a numeric origin. Guard this as a discriminated internal preparation state if needed.

## Core output and scheduler capability

Keep capture shape exactly as agreed with the capture worker. Add core values beside it:

```ts
interface DependencyCalendarMissing {
  readonly kind: 'dependency_calendar_missing';
  readonly projects: readonly {
    readonly projectId: string;
    readonly abbreviation: string;
    readonly name: string;
  }[];
}

type ConnectedPlacement =
  | DependencyCalendarMissing
  | { readonly kind: 'unavailable'; readonly reason: 'cycle' | 'calendar_range' }
  | {
      readonly kind: 'engine_unavailable';
      readonly engine: 'optimized';
      readonly projects: readonly string[];
      readonly reason: 'adapter_missing' | 'connected_optimization_not_supported';
    }
  | {
      readonly kind: 'scheduled';
      readonly engine: 'fast';
      readonly originOrdinal: number | null;
      readonly combined: Schedule;
      readonly byProject: ReadonlyMap<string, Schedule>;
    };

interface ConnectedPlanProjection {
  readonly kind: 'connected';
  readonly capture: ConnectedPlanCapture;
  readonly authored: ConnectedGraph;
  readonly placement: ConnectedPlacement;
}
```

This is detached internal evidence, not a proposed wire response. A target-selection helper requires that the requested project exists in `capture.projects` and selects its projection without rescheduling. Required graph/capture defects throw; only established cycle/calendar-range failures become modeled unavailability. A missing calendar is a modeled outcome that retains graph and capture, not a catch-all exception. For deterministic unavailable precedence: build/validate authored evidence first, then required engine check, then required-calendar check, then schedule (cycle refusal remains modeled). Both readiness and tree inspection can operate independently of which placement refusal wins.

Extend both `Scheduler` and `CapturedScheduler` with required `readResolvedFast(input: ResolvedScheduleInput): Schedule`. Add `ResolvedFastScheduler` as its function type. Extend runtime-portable construction explicitly, for example `createScheduler(fast, resolvedFast, optimized?)`, updating all production wiring and fixture factories together. Runtime supplies the real `scheduleResolved`; no optional missing callback or fake schedule fallback. Capture wrapping must apply the same lifetime guard to this new method as `read` and `supports`. This is a Fast-only synchronous capability, with no optimizer admission/cache lookup.

Implement `deriveConnectedPlan(capture, scheduler): ConnectedPlanProjection`. Before reporting a successful selected component, inspect **each member's** settings. A required engine is `optimizationEnabled && scheduleEngine === 'optimized'`, as today. For any such project, return `engine_unavailable` with its identity. If `supports('optimized')` is false, reason is `adapter_missing`; if a local optimizer exists but connected stage semantics are not implemented, reason is `connected_optimization_not_supported`. Do not call the ordinary single-project optimized reader with fake combined canonical input, set enabled false, or claim Fast is an optimized success. No connected optimizer support predicate returns true before task 7's real implementation. The later implementation extends this placement union and runs the approved sequential rank stages.

Fast-selected projects, including ones with optimization enabled for comparison, can receive a genuine Fast placement now. Their connected optimization comparison is explicitly unavailable/not implemented in the eventual projection metadata; it is not a pending generation, a ready Fast optimization or a fabricated cache identity. Disabled optimization retains today's Fast behavior even if the stored engine preference is optimized. A component containing any genuinely required optimized member is unavailable as a selected whole component, including when the requested member is Fast. A test must catch inspecting only the requested member's engine.

## Readiness, startable and actual execution eligibility

**Binding user clarification from the root:** prerequisites must be completed before dependent work regardless of priority, within and across projects. The current local implementation has a behavior gap: `findStartableWork` admits any not-done, unclaimed step of a startable leaf, and its unfinished predecessor list is informational. This legacy behavior must not be endorsed as satisfying the request. Scheduling eligibility alone does not close the execution gap. Record this clarified behavior in the OpenSpec delta before implementation; it is explicitly authorized user intent, not a new product question.

Keep canonical node readings and blockage propagation as their existing presentation semantics. In particular, `nodeReadingOf` calls a silent node `waiting` when its workflow/authored predecessors are all done, and does not distinguish relationship types. That vocabulary is not an execution-admission predicate. Add a separate pure domain function `executionEligibilityOf(graph, evidence)` returning a per-node `{ canStart, canFinish, startBlockers, finishBlockers }`. A blocker carries the predecessor node/boundary reference and the resolved edge type/provenance/relationship identity. No dates, rank, work-item priority, forecasts, resource claims or scheduled offsets can satisfy progress prerequisites.

The exact rule per resolved edge is:

- **FS:** successor may start only when predecessor is done. For a governed start action this is the user's completed-prerequisite rule. Apply it to workflow and legacy FS as well as authored FS, including remote endpoints.
- **SS:** successor may start only when predecessor has actually started or is done. This preserves the meaning of SS; requiring completion would silently turn SS into FS. Started means its progress is in_progress/done or it has a captured attempt showing an actual start. An ended unsuccessful attempt is still evidence that work started; it is not completion. Sparse unknown progress with no attempt is not started.
- **FF:** successor may start without predecessor completion; it may finish only when predecessor is done. Expose this finish condition separately; it is not a new hard refusal on historical/manual progress correction. Requiring completion before FF start would incorrectly convert FF into FS and disagree with scheduling.

A node's `canStart` is the conjunction of incoming FS/SS rules; `canFinish` is the conjunction of FF rules for an execution finish, while an action that also starts a never-started node additionally consults canStart. Zero estimated duration and unknown estimate are **not** done. For a stepless boundary, use its existing row completion/progress facts; graph-only zero duration cannot manufacture completion. Whole endpoints expand by relationship type through the approved resolver: FS sinks→sources, SS sources→sources, FF sinks→sinks. All expanded pairs must pass. Descendant selectors and legacy reach are already resolved; do not independently re-expand them differently for eligibility. Current participation/skip behavior remains unchanged (there is no new skipped-node implementation here).

This eligibility does not replace existing hold, direct blockage, row readiness, claims or resource-fit guards; those also apply. Done still wins over a retained hold when deriving a node's completion as today. Running work is not retroactively unstarted by a later predecessor change; a new claim/start on an unstarted dependent node must pass the current prerequisite checks. Completion checks concern the transition being requested. Do not retroactively reject reading an already-done node because somebody changed upstream progress. Informational node/row proxy semantics remain separately observable.

`PlanInputReads` has progress, estimates, actuals and blockages, but **not attempts**. Live readiness/eligibility requires each connected project's attempts from the same snapshot. Add a required live sidecar `attemptsByProject: ReadonlyMap<string, readonly StoredAttempt[]>`; present empty is known empty, absent project is an error. Do not add attempts to historical capture documents or substitute `[]` for uncaptured remote evidence. Live projection carries each project's current live metadata, including seq, beside the detached capture.

Core `deriveConnectedReadiness(capture, authored, attemptsByProject)` returns all-project row statuses, node readings/causes, execution eligibility, predecessor-leaf sets and deterministic project/rank/tree ordering. For each project, calculate worked-step/progress folds with its own estimates/actuals/statements/attempts and combine the maps. Run existing `workItemStatusesOf` over the combined forest and complete legacy/unified typed authored graph (explicit structural adaptation preserves IDs; ownership remains in `authored`). Run `projectNodeReadings` once over `authored.graph`. Derive execution evidence from intrinsic node facts, not the `waiting` label or a projected scheduled slice. First verify every statement/attempt/blockage step belongs to its own project; checking only the union of every project's steps masks foreign-step corruption. Preserve stored parent-progress compatibility. An absent sparse statement is unknown; a missing required project's evidence throws.

Refactor `StartableReads` to accept `eligibilityByNode`, already resolved `predecessorIdsByLeaf` and complete `statuses`, rather than expanding foreign endpoints against target-only rows. The local path uses the same eligibility evaluator over its local graph: fixing only remote edges would violate the user's within-project requirement. Each returned free step must pass its node's canStart as well as existing not-done/unclaimed/leaf-status conditions. Keep claimed steps visible even if their current dependencies would prevent a new start. Provide complete predecessor ordering or preordered lists: the current local `byPlace(remoteId)` throws. Keep target rows, steps, assignments, claims, occupancy, team filter and capacities local; another project's resource claims are not deducted. Existing predecessor IDs can name remote stable IDs; readable project/address labels belong in the explicit wire/UI projection, never a misleading local number.

**Admission and manual status correction are separate contracts.** Share the captured `canStart` evaluation with actual step claim/start admission where that API promises executable/startable work (the current `decideClaim` and startable contracts intentionally agree). Preserve target claims/resources, authority checks and atomic refusal. Subtree claims are organizational ownership rather than automatic starts of every descendant; preserve their existing behavior. Inventory attempt-begin and run admission and apply eligibility only where those paths contractually perform a new governed start. Never implement a second independent interpretation at those endpoints.

The delta specs require scheduler inequalities and external readiness/startable equivalence, but do not authorize a blanket ban on manual progress or actual-date corrections. Therefore **6.3 does not introduce arbitrary `setProgress(done)`/manual-finish refusals**, nor reject historical already-done work because upstream evidence later changes. Keep explicit manual overrides visible as authored observations; they can disagree with the suggested execution order. `canFinish` records the FF condition for an execution workflow, but enforcing it at every completion command requires that command's existing contract to promise dependency-governed execution. If it does not, record the gap and the explicit override semantics instead of claiming end-to-end finish enforcement. This prevents overclaiming: task 6.3 proves dependency-aware advertised startability and matching governed claim/start admission, not a newly universal execution lock.

Bind target claims/resources and component progress/attempts to one observation (borrow the admitted command transaction when present; dedicated admitted read snapshot otherwise). Startable/readiness must not invoke a scheduler; engine/calendar unavailability cannot hide them. Tests must directly prove ordinary unfinished FS excludes an otherwise ready local/remote successor, completion releases it, SS permits started but not unknown predecessor, FF permits start while exposing an unmet finish condition, and governed claim/start entry points agree with the startable result. Add a regression showing that established manual progress correction remains possible and is not mislabeled a scheduler-approved execution. Priority/rank changes must never flip execution admission. Preserve current hold/done/blocked/claim/resource tests while adding the explicitly changed prerequisite behavior.

## Capture integration and ownership

One integrator owns `work-item.resource.ts`, canonical preparation extraction, shared core/domain barrels, runtime wiring, `chain-snapshot.ts`, unit-of-work/source composition and existing LivePlanRead consumers. A placement worker owns `resolved-schedule-input.ts`, `schedule.ts` and boundary validation changes/tests; a core worker can own new connected derivation/calendar/readiness helpers after the boundary is frozen. Capture worker retains its active files until handoff; do not race it.

After the real Fast derivation exists, extend snapshot routing with an explicit connected topology arm and `LivePlanRead.kind = connected`, containing detached component projection plus required per-project live metadata. Do not overload old `projects` rank-chain meaning. Inside the current owned/borrowed snapshot callback: discover connected topology, capture the component once, capture required live metadata, call `deriveConnectedPlan`, derive readiness, select the target, then detach and return. The snapshot remains open during derivation and eventually task 7's captured cache selection. Owned close-on-success/refusal/throw and borrowed never-close behavior remain as approved.

Ordinary isolated and shared components without external links retain the old routes and early-close/rank-influencer behavior. Do not mark 5.1's real connected live integration complete after only adding a discriminant. Update every switch that currently assumes only isolated/shared, including tree, schedule arrangement, capture and export entry points. Where later connected history/export/optimization support is pending, retain a precise explicit unsupported/unavailable outcome and activation barrier; never serialize a partial connected plan as a compatible local document. This slice enables the genuine Fast/readiness producer and its capture callback, not final product activation.

## Bounded implementation slices and proofs

1. **6.1a, common engine seam:** extract resolved input, local adapter, strict boundary validator and runtime capability. Existing local golden corpus and pinned materialization remain unchanged. Negative proofs: omit a graph node/edge endpoint, corrupt endpoint position/step, bypass a real inequality; actual `scheduleResolved`/runtime calls must refuse or violate asserted bounds when the guard is removed.
2. **6.1b, component preparation and Fast:** real per-project slice preparation, reduced graph, namespaces, rank eligibility, per-project projection. Fixtures: A.design → B.build → A.test; lower-ranked prerequisite before high-ranked successor; local priority only eligible; distinct estimate rules, rounding, order, width and reach; zero/unknown/stepless nodes; partly/all-held external selectors; shared versus isolated person; identical team/resource catalog ID with different project capacities. Independently remove rank eligibility accounting, each FS/SS/FF bound, each capacity namespace, each hold reduction and own-project setting lookup. Assert final placements, not only captured arguments.
3. **6.2, calendar and missing dates:** different Monday/Wednesday anchors read from either project yield identical combined placement; fractional durations and numeric input floors/deadlines survive affine translation; different project floors/deadlines; weekend start/deadline; start-floor on a non-first-ranked project; all-held empty case; required undated external/shared peer; ordinary undated unconnected unchanged. Mutate target-anchor substitution, fraction rounding, start-floor omission, missing-date-to-zero independently and observe production derivation/read failures. Assert no complete dated answer on unavailability and graph/readiness remain present.
4. **6.3a, readiness and mounted reads:** combined row/node facts, explicit execution eligibility and attempts sidecar; startable predecessor resolution; actual observation callback and connected arm. Negatives independently remove remote progress, remote hold, remote attempt, external edge and required-project evidence; test false proxy/readiness, missing refusal and snapshot concurrency. Include a per-project foreign-step corruption case that the union-of-steps check alone would miss. Mount startable and tree routes, rather than testing only helpers.
5. **6.3b, governed admission:** inventory step-claim/start and attempt-begin consumers; apply the common prerequisite evaluator where they promise startable execution. Independently remove FS/SS admission checks and each governed consumer call; prove premature starts wrongly succeed under the fault, then restore green. Prove atomic refusal and current authority/evidence, local and external. FF finish conditions get domain/read proofs; manual progress/actual correction retains its established override policy. Record any completion workflow without hard FF enforcement honestly rather than inventing a new blanket refusal.
6. **Integration honesty proofs:** required optimized member (target and nontarget), adapter absent, local adapter present but connected unsupported, disabled optimization, enabled Fast comparison. Assert zero solver admissions/events and no single-project cache reads. Exercise the new scheduler callback's retained-lifetime refusal; cache-publication coherence remains task 5/7 observation evidence. Ordinary no-link paths must preserve their existing reads/cost/lifetimes.

Rerun existing `schedule-typed-dependency`, weighted, priority, deadline-order/lateness, placement-order, joint-capacity, resources/resource-corpus, elsewhere, shapes, algorithm identity/golden corpus, `without-held-subtrees`, workday/property, saved-plan input/schedule, node-readings, work-item-statuses, startable, claim/resource, shared-people and chain snapshot suites appropriate to each changed seam. Record exact commands and outcomes in verify.md. Watch each injected production-path fault fail before writing adjacent Proof comments. No tests or proofs in this document are claims of observed success.
