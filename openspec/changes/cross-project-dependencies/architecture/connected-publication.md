# Next connected optimization slice: domain publication

Read-only Astra ruling, 2026-10-22. Basis: integrated tree `/home/df/.codex/worktrees/b3b7/puni-00`, reported HEAD `734d5191d`; actual stage, canonical serialization, resolved engine, core connected derivation, local solver materialization/publication/deadline code inspected. This refines the concrete seam in `architecture/connected-optimization.md` §6; scheduling and rank-stage decisions remain binding. It does not activate external dependencies or complete OpenSpec 7.

## Decision and ownership

Start **one Sol domain publication worker now**, based on the integrated accepted stage/engine. It owns only:

- `libs/wbs/domain/domain/src/connected-publication.ts`
- `libs/wbs/domain/domain/src/connected-publication.test.ts`
- A separately named fixture/test helper in that same directory only if substantial fixtures warrant it.

No edits to shared `index.ts`, `contract-version.ts`, existing scheduler, canonical stage serializer, wire/contracts, Python, core, ports, source, boot, UI, database or task documents. Root integrates named domain exports after review. This is a reusable production function that executes the real engine, not an adapter stub or another scheduler. It can finish independently of both active workers.

The new file imports existing domain modules directly. Do not depend on `@wbs/solver-contracts`, quantum constants, mutable wire types, stored DTOs, ports or callbacks. No injectable fake scheduling function. All placement goes through actual `scheduleResolved`.

## Exact seam

```ts
export class ConnectedStageEvidenceError extends Error {}

export interface ConnectedPublicationDecision {
  readonly scope: {
    readonly kind: 'connected-stage';
    readonly projectId: string;
  };
  readonly chosen: PublicationChoice;
  readonly schedule: Schedule;
  readonly baseline: Schedule;
  readonly values: RealObjectiveValues;
  readonly optimizedValues: RealObjectiveValues;
  readonly baselineValues: RealObjectiveValues;
}

export function replayConnectedStage(stage: ConnectedOptimizationStage): Schedule;

export function guardConnectedPublication(
  stage: ConnectedOptimizationStage,
  localStarts: ReadonlyMap<string, number>,
  primary: RealPrimaryTerm,
  movementReference: ReadonlyMap<string, number>,
): ConnectedPublicationDecision;
```

Use existing `PublicationChoice`, `RealPrimaryTerm`, `Schedule` and `RealObjectiveValues`. Both maps contain **component-relative real workdays**, with exactly one entry per local slice. There is no unit conversion or integer validation here. The later strict wire boundary validates integer offsets and performs `/ request.quantum` exactly once for both candidate and reference. It also proves reference correspondence to the request and canonical question. The domain deliberately accepts valid fractional real starts, including 0.2; accepting one is not proof that a Q48 solver could produce it.

`scope` explicitly qualifies all three score records: they score only the current project's slices. `schedule` and `baseline` are complete component schedules. Scope identity/hashes, runtime evidence, objective proof and durable DTO versions remain contracts/core responsibilities. Do not fabricate a question hash from projectId.

`guardConnectedPublication` derives dense priority weights itself from `priorityWeights(priorityByLeaf(ownRows, indexTree(ownRows)))`, with `ownRows` selected by authoritative project ownership. Use `priorityWeightOf` for the legitimate unprioritized-leaf zero. Do not normalize against all projects, accept arbitrary weights, or parse ownership from encoded keys. This refines the earlier sketch accepting weights: the actual existing stage now contains all facts needed to derive the correct weights without a mutable wire dependency.

Two public functions are enough. A private helper may reuse baseline validation and candidate replay within the guard; a public materializer taking a caller-supplied `Schedule` or baseline is unnecessary and risks allowing unvalidated timing/effort fields. The baseline-only function is useful to core stage preparation before a request is built.

## Baseline replay and hard constraints

1. Reuse `canonicalConnectedStageInput(stage)` for existing structural/identity/graph/provenance validation. Calling it and discarding the bytes is acceptable at this bounded seam. Do not copy its checks, extract it while the wire worker consumes it, hash it here, or expand dependencies again. Its successful return does **not** establish placement feasibility.
2. Refuse an empty local slice set. This is a core omission/error at this boundary; the future stage visitor skips empty projects before asking for a stage. Require finite nonnegative captured starts. Require finite finishes (already structurally checked). Canonical exact key coverage is retained.
3. Run `scheduleResolved(stage.input, stage.starts)` using the complete original input, including the authoritative reduced graph, encoded capacities/people, all floor/deadline maps and existing `elsewhere`.
4. Verify output slice keys exactly match canonical stage slice keys. Compare every output `earliestStart` and `earliestFinish` to captured starts/finishes with ordinary exact numeric equality, with no tolerance. Baseline replay must reproduce **all** local and foreign timings. Do not demand equality of `boundBy`, resource-predecessor explanations, latest times or traversal counts: pinned replay legitimately recomputes these.
5. A structurally invalid stage, infeasible baseline or exact timing mismatch is a `ConnectedStageEvidenceError` with original cause/context retained. It is malformed trusted stage evidence, not a solver candidate failure, boundary infeasibility or optional missing baseline. Catching an exception solely to wrap this trusted-boundary context and rethrow is allowed; never return a fallback schedule. The guard invokes this before reading candidate feasibility.

The authoritative graph is the engine's edge set. This function can reject a bad supplied edge or timing that violates an edge; it **cannot infer an authored edge omitted from the resolved graph**. Original authored selectors support provenance/canonical identity but are not permission to build a second expansion engine. Future wire correspondence tests must detect an edge omitted from a request relative to this graph.

Real baseline hard feasibility means the scheduler's actual floor, dependency, capacity, person and booking constraints. **Deadlines are Fast lateness annotations, not Fast feasibility refusals.** A late real baseline is valid captured stage evidence. No baseline quantization and no purported feasible integer witness is derived here.

## Candidate replay and exact foreign boundary preservation

Validate that `localStarts` has exactly the local key set: missing, surplus and foreign keys are refusals; every start must be finite and nonnegative. Candidate validation failures use existing `ScheduleInvalidOptimizedStartError` with a meaningful key/reason. Build a fresh full pin map by copying `stage.starts` and replacing only the validated local entries; never mutate the stage or input maps.

Run `scheduleResolved(stage.input, fullPins)`. This is the one leveller/materializer. Validate exact full output key coverage and compare every foreign output start AND finish to the captured stage. Any foreign drift, including one ulp, refuses the candidate using `ScheduleInvalidOptimizedStartError`. Do not quantize foreign pins, splice cached foreign rows into a local schedule, overwrite replay output to conceal drift, or relax comparisons with `withinDrift`.

Local candidate starts retain the existing scheduler's narrowly bounded pin reconciliation semantics: the authoritative published starts are the real replay output. Do not add a new epsilon or assert exact candidate pin equality and thereby break existing optimizer reconciliation. The request-relative integer validation remains independently mandatory later. `scheduleResolved` already invokes strict `validateResolvedRealBoundaries`; its replay also applies the existing floor/capacity/person placement rules. Do not implement a second leveller or pretend the boundary-only validator checks resources/durations. Tests must exercise those actual engine refusals through this public guard. If a capacity/floor defect is exposed, report it to root for a separately owned scheduler fix; this lane must not quietly weaken validation or edit the active shared engine.

Timing duration is determined by real slices and the scheduler's cumulative tiling arithmetic. No candidate supplies duration, width, effort, estimated state or finish. Those are generated from stage slices. A forged captured finish is rejected by baseline exact replay. Check preservation of the real input fields in tests; **never validate `finish === start + durationOf(slice)` or `finish - start === durationOf(slice)`**. Those equalities are false for valid existing tiling. The same applies to a home-grown finish formula for fixed foreign evidence.

## Deadline check and scoped comparison

After candidate replay, enforce only the local project's effective real deadlines. Use existing `indexTree`, `leafDeadlinesOf`, `workItemIdsWithPositiveDuration`, `durationOf`, `WORK_ITEM_PROJECTION_START` and `isOnTime`; no copied date/day rounding. For a leaf containing positive real duration, evaluate its projected final finish with projection start zero against its folded effective deadline. For an all-zero leaf, evaluate each actual slice point using that slice's real start and finish; do not treat separated zero steps as a positive span from the first point to the last. This preserves zero-step behavior within a positive item and the all-zero milestone distinction. Fractional effective deadline offsets are retained; do not floor/clamp them here. A missing projected leaf with a deadline is an error, not a skipped validation. Deadline violation refuses the candidate with `ScheduleInvalidOptimizedStartError` and a diagnostic naming the leaf/deadline. The later contract evaluator maps this candidate refusal to invalid-output under established policy; it must not issue an infeasibility certificate.

Do not enforce foreign deadlines as a new candidate condition; foreign work may already be late and cannot move in this stage. Do not reject the baseline because it misses a deadline, reject the whole stage before considering a valid solver order, or set a non-null feasible integer witness because real replay succeeded.

Require exact local reference key coverage and finite nonnegative reference values. Reference corruption is trusted-question evidence failure (`ConnectedStageEvidenceError`), not an excuse to use current starts or zero. Reference values may be infeasible; they are movement origins, not hard bounds.

Project baseline and candidate onto local slice maps solely for `scoreReal` (a private transient copy of the schedule with filtered slices is sufficient; never publish that as a component schedule). Reuse the scorer's sorted-key summation. Both sides use identical local weights and reference. Refuse nonfinite score values rather than publish NaN/Infinity. Choose baseline iff `optimizedValues[primary] > baselineValues[primary]`; ties choose optimized. Movement/secondary terms do not introduce a new strict-improvement condition.

A chosen baseline can remain deadline-late: it is the preserved real baseline/quantisation-floor outcome under the existing primary comparison, never described as a deadline-feasible solver candidate. Candidate deadline validity is established before comparison. Future publishing must map a baseline choice to the existing scoped quantisation-floor proof restrictions (no solver-optimal claim), and preserve the distinction from terminal boundary-infeasible (which has no candidate at all).

## Minimum substantive tests and R5 obligations

Use real stage fixtures and actual `scheduleResolved`. Build captured pins from an actual initial component placement or a previously validated stage replacement, not invented successful scheduler callbacks. Include at least:

1. A → B → C, A finish 0.2, B duration 1, C start 1.2. Baseline replay and real candidate B=0.2 preserve foreign timings exactly. Document that a Q48 request may be boundary-infeasible despite this success; this lane does not claim solver feasibility.
2. A fractional multi-step tile with width 3 and floor 0.1; verify valid cumulative finish survives. Corrupt a captured finish by one ulp and prove baseline refusal. Separate a candidate change that reconciles a foreign start/finish and prove exact foreign refusal. Cover both foreign start and finish comparisons independently.
3. Incoming and outgoing FS/SS/FF, including later-step endpoints and all supplied expanded pairs; legal and illegal local placements through the public guard. At least one weighted FF case and one zero-duration endpoint.
4. Same-person overlap in shared mode; isolated encoded people remain independent. Project-local team and resource contention, existing elsewhere booking and fractional manual/project floor. Exercise these through real full replay, not a mocked validator.
5. Missing, surplus, foreign, NaN, Infinity and negative local starts; missing/surplus/nonfinite reference; malformed captured key set and an invalid baseline pin. Stage evidence error remains distinct from candidate refusal. Inputs/maps unchanged after success and failure.
6. Candidate local deadline violation, inherited deadline, fractional deadline offset, zero steps inside positive work, all-zero milestone including separated zero points. Baseline locally late must still allow considering a valid candidate; a foreign late deadline must not invalidate a legal local candidate.
7. Local Time and PRI scores exclude foreign slices and use local dense ranks. A very long foreign task must not mask a local makespan regression. Include inherited priorities, absent priority, equal primary accepted and worse primary baseline selection. Use reference distinct from exact stage starts to prove movement uses the supplied real reference.
8. A later rank stage whose baseline includes an earlier accepted local replacement; comparison must retain that composite and its new foreign bounds, rather than recompute original/unpinned Fast. Whole output latest/critical annotations come from replay, not merged cached annotations.

Every new refusal/selection guard needs an observed production-path mutation negative before its adjacent `Proof:` comment is claimed. Remove key checks, foreign-start comparison, foreign-finish comparison, captured equality, deadline invocation and local-score filtering/strict comparison separately. Verify the expected semantic assertion fails and restore green. For redundant guards, state which combined injected fault actually reaches the safety boundary instead of claiming a mutation that another guard masks. Existing scheduler guards already have proofs; this lane needs proof that the new entry point passes the real input/graph/bookings/pins through, not duplicate levelling code/tests. In particular, dropping graph edges from the replay or switching to unpinned Fast must break an actual publication assertion.

Run focused new suite and relevant existing `schedule-connected`, typed-dependency, resources, elsewhere, deadline/zero-step and publication-guard/score suites using Bun/Nx per repo. No schema/Python/full host gate is required in this isolated lane. Root owns integrated package typecheck/lint and final full gate. Worker reports exact commands, mutation failures, restored output and unrun checks; this ruling supplies no R5 proof claims.

## Root integration hunks and merge order

1. Merge reviewed new domain files. Root adds **only** exports for `ConnectedStageEvidenceError`, `ConnectedPublicationDecision`, `replayConnectedStage`, `guardConnectedPublication` to the domain barrel, coordinated after the wire worker's stage-type export hunk. No contract/version increment beyond the already reserved scheduler18/wire5/Python0.4.0.
2. Wire worker can finish independently. Its request preparation must continue to retain full stage evidence; canonical validation alone is not baseline replay. The later core builder calls `replayConnectedStage` before asking for a request. If a standalone wire-builder caller also accepts unchecked stages, the eventual integrator must compose this validation there before terminal classification, rather than assuming every caller was core.
3. Later contracts integration owns strict request/response correspondence and offset/reference integer validation, converts local maps to real workdays, then calls `guardConnectedPublication`. Request validation occurs even for unknown/infeasible responses; those do not call a candidate guard or invent offsets. Map only modeled candidate errors to invalid-output; trusted stage evidence corruption is not swallowed as optimizer absence or ordinary pending.
4. Later core selection exposes the existing encoded `ResolvedScheduleInput` currently created inline in `deriveConnectedPlan` immediately before `scheduleFast`, obtains the initial actual Fast composite once, visits projects rank/id once, constructs immutable stage pins from the current composite, and passes ready exact-question candidates through this guard. This new lane does **not** reconstruct that encoded input from restored project displays or build a second preparation pipeline.
5. Actual captured stage reader, required runtime port/capability, hashing/caches, terminal DTO/persistence/retry, publication fences and live/saved consumers remain assigned integrator work. Keep current explicit connected-optimization unsupported behavior until wired. Pure domain tests permit merging the primitive; they do not prove that any external optimizer was called, anything was durably published, or external-authoring activation is safe.

## Wire worker's immediate boundary-infeasible seam

It is safe to defer the strict persisted certificate/envelope decoder to the adapter lane. The prepared wire outcome must retain:

```ts
{
  kind: 'boundary-infeasible',
  stage: ConnectedOptimizationStage,
  request: ConnectedSolverRequest,
  evidence: {
    kind: 'contradictory-bounds',
    key: string,
    lower: number,
    upper: number,
    contributors: readonly string[],
  },
}
```

Validate the complete request/correspondence and contradiction first. Retain any identity fields not carried by the request separately if introduced. The request already carries inputHash/questionHash/projectId, objective, installed/runtime versions, budget/split/quantum, all fixed/boundary/occupancy evidence; the stage retains canonical source graph/selectors and exact pins. Build each objective's full request before returning its terminal finding; do not return the same identity-free evidence object for both variants or take an early return that bypasses request validation. Contributors must identify the exact referenced boundaries (including expanded pair where a relationship has several pairs); ambiguous relationship ID alone is insufficient unless joined unambiguously to the retained request list.

This is a **prepared terminal finding**, not yet a `BoundaryInfeasibleCertificate`, serialized DTO, durable cache record or retry suppression proof. The adapter later validates/encodes the strict envelope. Evidence alone is insufficient, and no speculative stored-stage type is needed in this lane.

## Observed feasibility and remaining risk

Two narrow read-only Bun stdin probes ran against the actual engine, both exit 0. A 0.2/1/1 FS chain replayed exactly at A0→0.2, B0.2→1.2, C1.2→2.2. A width3 sequence with effort0.1 and floor0.1 demonstrated valid second-slice start 0.13333333333333333, duration 0.03333333333333333, finish 0.16666666666666669, while naive start+duration is 0.16666666666666666. This establishes the basic seam and disproves naive duration equality; it does not prove every fractional/weighted replay case.

Exact foreign replay remains the important usability risk: some otherwise valid real stage may not reproduce its pins under a changed replay ordering. The accepted policy is explicit refusal, never foreign movement. Worker must cover representative weighted/fractional cases and report any reproducible real baseline failure for a separately allocated scheduler repair. No blanket claim that every Fast composite replays exactly is authorized by these two probes.

No repo files, Git metadata or WBS changed, no implementation or full test/gate run performed by this ruling. Optimization, history, live observations, UI and final activation remain required in the full feature; this bounded parallel lane does not narrow that goal.
