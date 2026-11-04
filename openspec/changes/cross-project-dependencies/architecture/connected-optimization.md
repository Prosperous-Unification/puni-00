# Connected optimization implementation ruling: 7.1–7.4

2026-10-22, read-only Astra handoff. Basis: integration tree `/home/df/.codex/worktrees/b3b7/puni-00` at `6839d7ac4`, D6 and cross-project optimization delta; current resolved-input work inspected read-only in `/tmp/puni-cross-resolved-schedule`. Scheduling/ownership/calendar rules are in `architecture/connected-scheduling.md` under the change (original `/tmp/puni-connected-schedule-architecture.md`) and are not redefined here. No tests, probes, code or Git changes were performed. The output is implementable design, not verification evidence.

Task 7.3 cannot be called production-complete without the persistence/retry work explicitly numbered **7.4** in the current tasks. It is safe to build wire/Python and orchestration independently after freezing the values below. External authoring stays behind the complete compatibility activation barrier.

## 1. One stage question, one bounded selection pass

Begin with the actual combined Fast placement from 6.1–6.2. Visit captured projects once in `(rank, bytewise projectId)` order. At each visit, freeze **every foreign slice's real start and finish** from the current composite. The current project's slices are the only decision variables. Incoming and outgoing dependencies use the already resolved reduced graph; no new selector expansion is introduced. Capture local inputs and foreign evidence for this stage before selecting a variant.

A disabled project does not ask for optimization. An enabled Fast-selected project may read both objective variants for comparison/admission under current behavior, but never replaces its placement. An enabled optimized-selected project selects only its configured objective when a validated ready variant exists. Pending, idle, failed, corrupt or boundary-infeasible retains its current valid placement visibly. A missing required connected optimizer remains engine_unavailable for the whole selected component. Do not downgrade that requirement because another project selected Fast.

Apply at most one selected replacement per project and validate the complete resulting component before proceeding. Both PRI and Time variants of a stage share the same stage question and movement reference; they are alternatives, never successive stages. Every requested project projection comes from the **final** composite. A later stage cannot move an earlier project's starts. Earlier proof/comparison metadata continues to name the foreign boundary snapshot at which it was obtained; it is not relabeled as proof under the final later-stage placements or as global optimality.

The domain's resolved graph is authoritative. Its boundary validates exact nodes and every supplied endpoint, but cannot infer a missing authored edge. Core must build it from the approved connected resolver; request validation compares against that captured authoritative graph. Do not add a second endpoint-expansion engine to the solver layer.

## 2. Frozen core/domain handoff

Add a domain value `ConnectedOptimizationStage` in `domain/src/connected-optimization-input.ts`. This is detached scheduling evidence; it imports no core capture/store type:

```ts
interface ConnectedOptimizationStage {
  readonly kind: 'connected-stage';
  readonly projectId: string;
  readonly mode: CapacityMode;
  readonly originOrdinal: number;
  readonly projects: readonly {
    readonly projectId: string;
    readonly rank: number;
    readonly anchorOrdinal: number | null;
  }[];
  readonly input: ResolvedScheduleInput;
  readonly relationships: readonly ScopedTypedDependency[];
  readonly starts: ReadonlyMap<string, number>;
  readonly finishes: ReadonlyMap<string, number>;
}
```

`relationships` retains the complete scoped authored identities/endpoints/types, including original parent/node/descendant selectors; equivalent resolved leaf pairs must not erase an authored endpoint identity from the question. `input` is the whole reduced component on the common relative workday axis, including own-project capacity encoding, graph provenance, floors and deadlines. `starts`/`finishes` cover **exactly** its slices and describe the current real composite at this stage; the local part is the comparator/movement reference, the foreign part is fixed. Nullable anchors are permitted only for projects with no active reduced node, as in 6.2. A nonempty stage cannot have an unknown own anchor. Empty local slice sets produce explicit idle/no-stage metadata and do not build or spawn a request.

Core `buildConnectedOptimizationStage(preparedComponent, currentPlacement, projectId)` builds this from existing prepared facts. It validates membership and exact keys, and verifies that the current placement satisfies real dependency/floor/capacity constraints. It does not assume that Fast meets every requested deadline: existing Fast treats deadlines as wanted dates while CP-SAT constrains them. “Valid real composite” here means valid Fast hard constraints, not a fabricated proof that all solver deadlines are feasible.

Core `selectConnectedOptimizations(prepared, baseline, capturedOptimizer)` returns `{ placement, stages }`. Each stage record retains its immutable stage value, selected engine/objective, exact question identity, both variant states, and chosen placement contribution. `deriveConnectedPlan` calls this inside its owning capture callback. It never recursively calls a tree/live-plan reader.

Extend optimized capabilities with separate methods, not a fake `ScheduleInput`:

```ts
interface ConnectedOptimizedAsk {
  readonly stage: ConnectedOptimizationStage;
  readonly objective: SolverObjectiveName;
  readonly enabled: boolean;
}
interface ConnectedOptimizedRead {
  readonly inputHash: string;
  readonly generation: number | null;
  readonly contractVersion: string;
  readonly budgetMs: number;
  readonly variants: Readonly<Record<SolverObjectiveName, ConnectedVariantState>>;
  readonly candidates: Readonly<Record<SolverObjectiveName, ConnectedOptimizedResult | null>>;
}
```

`ConnectedVariantState` extends the existing state vocabulary with `{ state: 'boundary-infeasible'; certificate: BoundaryInfeasibleCertificate }`; ready variants carry fixed-boundary scope. `ConnectedOptimizedResult` contains stage identity, local real starts/finishes or its projected local Schedule, objective/proof evidence and publication choice. It never claims ownership of foreign placements. Keep `readConnectedCaptured` synchronous/non-admitting and `readConnectedLive` admitting **after closure**; required runtime capability is explicit, not inferred from local `supports('optimized')`. Runtime and snapshot wrappers enforce borrowed lifetime on every new captured method.

Domain `canonicalConnectedStageInput(stage)` returns stable bytes; SQLite owns SHA-256. It must serialize component resolved nodes/edges/provenance, authored scoped endpoint identities/types, ownership, exact finite real starts/finishes, local settings reflected by slices, capacities, floors/deadlines, anchors, mode and ordered ranks. Include local current starts too: they are the real comparator and movement origin. Sort sets/maps bytewise and preserve per-leaf step positions. Do not round floats or substitute labels. Using all component constraint facts is deliberately safe over-invalidation; do not attempt a minimal dependency-influence cache in this slice. Stage `projectId` is included. Objective remains the existing separate cache-key dimension; both variants share `inputHash`. Budget and installed contract remain separate key dimensions and are included in the full question identity.

The **full question identity** is `(projectId, inputHash, objective, contractVersion, budgetMs, quantum, wireVersion)`. A printable `questionHash` is a deterministic hash of that tuple, computed in the hashing adapter, not a caller-supplied arbitrary token. Generation/cancel epoch/attempt token remain runtime fencing, not mathematical identity.

## 3. Versioned request shape

Observed current versions: scheduler contract **17**, solver wire **4**, Python **0.3.0**, optimized-result envelope **1**. Proposed coordinated allocation is scheduler **18**, wire **5**, Python **0.4.0**, connected result envelope **2**, boundary certificate envelope **1**. **Root alone reserves the numbers after checking the integrated branch and active worker changes.** If another semantic change has consumed 18, allocate the next unused scheduler value; do not overwrite that allocation. Pure resolved-engine extraction with identical old corpus is not an independent reason for a competing bump.

Keep historical wire files intact; add `solver-wire.v5.json` and its byte-identical Python installed copy. Update active TS constants, Python `SCHEMA_FILENAME`, package version, compatibility preflight, fixtures, schema-copy/version tests, installed supervisor/launcher handshake, setup/runtime manifests and pinned runtime tests together. `contractVersionOf(actualInstalledSolverVersion)` stays the only composer. Do not merely change the request constant while the installed runtime still reads wire 4. Old runtime/request mismatch fails before spawn. No schema field is optional merely to keep a fixture compiling.

Wire 5 is a strict discriminated request/response union: `scope: { kind: 'local' }` retains ordinary local semantics; `scope: { kind: 'connected-stage', projectId, inputHash, questionHash, originOrdinal, projects, fixed, boundaries, occupancy }` identifies a connected stage. Top-level common fields retain current wire version, installed contract/solver version, objective, budget/split, quantum, horizon, local slices/internal edges, pools and resources. Local-only requests retain `baselineOffsets` and `fastHint`. Connected requests instead require:

- `movementReferenceOffsets: SolverOffsetMap`, one safe nonnegative integer per local slice, **not** asserted feasible;
- `feasibleBaselineOffsets: SolverOffsetMap | null`, an optional actual feasible quantized witness;
- `seedOffsets: SolverOffsetMap | null`, a search seed whose presence does not prove feasibility;
- existing `elsewhere` integer person intervals, deterministically derived from scope occupancy.

`fixed` is an ordered list of `{ projectId, key, start, finish }` for **all** foreign slices in component workdays. `projects` carries stable IDs, ranks and anchor ordinals from the stage. `occupancy` retains original holder-bearing shared-person intervals `{ personId, projectId, key, start, finish }`, independent of rounded union intervals. This supplies provenance that current `SolverElsewhere` tuples intentionally omit. No foreign team/resource pool is imported into the local decision model.

Each resolved cross-project edge becomes one `boundaries` entry, retaining every expanded pair:

```ts
type SolverBoundary = {
  readonly localKey: string;
  readonly foreignProjectId: string;
  readonly foreignKey: string;
  readonly relationshipId: string;
  readonly type: 'FS' | 'SS' | 'FF';
} & (
  | { readonly direction: 'incoming'; readonly minimumStartUnits: number }
  | { readonly direction: 'outgoing'; readonly maximumStartUnits: number }
);
```

All cross-project authored edges have relationship identity; workflow/legacy edges remain local and keep their existing internal-edge builder. Do not deduplicate boundaries by node pair alone: distinct relationship IDs/types and expanded pairs remain diagnosable. Required own-scope references, integer domains and foreign owner/evidence consistency are validated. Negative upper/lower start bounds are legitimate signed safe integers; an upper below zero is an infeasible constraint, **not malformed input**. Unknown keys, unknown fields, impossible type/direction combinations and missing fixed endpoints are malformed. The schema must allow a well-formed contradictory integer window.

Wire responses echo `scope` identity only (kind/projectId/inputHash/questionHash), not the full constraints. Connected `feasible` carries local offsets/objective values; `unknown` carries neither; connected initial-model proof of infeasibility returns **`boundary-infeasible`** when its effective fixed external constraints are nonempty. Ordinary local `infeasible` remains its existing outcome. Request-relative Bun validation checks the echoed identity; a response cannot be accepted because the process happened to hold the right slot. If a connected stage has no effective incident bounds or shared-person occupancy after hold reduction, preserve ordinary infeasible/deadline classification rather than claiming its unrelated foreign metadata made the subproblem boundary-constrained.

Update `wire-vocabulary` to read each union arm's normative field sets, rather than skipping its drift guard because top-level `required` no longer describes every arm.

## 4. Exact boundary equations and conservative integers

All solver variables remain nonnegative units from the component relative origin. This avoids clamping negative differences between project anchors. Let `Q = 48`, local real duration `d`, local quantized duration `D = durationUnits(slice)`, and foreign real start/finish `S,F`. Keep existing duration quantization and internal FF strengthening. External bounds use conservative `ceil`/`floor` **without drift snapping that could weaken the external inequality**:

| Edge direction/type | Real inequality  | Normalized integer start bound                |
| ------------------- | ---------------- | --------------------------------------------- |
| incoming FS         | local start ≥ F  | minimum = ceil(QF)                            |
| incoming SS         | local start ≥ S  | minimum = ceil(QS)                            |
| incoming FF         | local finish ≥ F | minimum = max(ceil(QF) − D, ceil(Q(F − d)))   |
| outgoing FS         | local finish ≤ S | maximum = min(floor(QS) − D, floor(Q(S − d))) |
| outgoing SS         | local start ≤ S  | maximum = floor(QS)                           |
| outgoing FF         | local finish ≤ F | maximum = min(floor(QF) − D, floor(Q(F − d))) |

The FF incoming real-start term is essential: rounding up the local duration can make an integer finish appear to satisfy a real lower finish that materialization violates. The outgoing min retains both the integer finish model and the real constraint even around current duration snapping. Do not replace a finish constraint with a plain foreign start floor or turn FF/SS into FS. These are inclusive boundary inequalities; person occupancy remains half-open.

`buildConnectedSolverBoundaries(stage, localSlices)` owns these equations and derives every pair from the authoritative graph and exact fixed values. Bun revalidation independently compares the complete computed boundary list/values with what was requested and checks responses against it; do not validate only boundaries returned by Python. Python implements the normalized start inequality and validates endpoint ownership/types against `fixed`; it need not reproduce the application's floating-duration arithmetic to claim independent integer constraint enforcement.

Shared mode takes positive-duration foreign slices with a person into occupancy; isolated mode has no foreign person occupancy. Use existing `quantiseElsewhere`: floor start, ceil finish, union rounded overlaps, retain original holder evidence in scope. Include only persons assigned to local positive-duration slices in the local blocking calendar; all foreign placements still remain fixed evidence. Zero-time nodes retain dependency bounds and consume no people/team/resource interval.

Horizon preparation remains a safe serial upper bound, not the smallest outgoing upper bound. Extend its floor input with incoming normalized minima and its booking extent with fixed occupancy ends; preserve duration and internal FF excess terms. Include movement-reference extrema where needed for valid reference-domain representation. A restrictive outgoing upper bound must not turn into horizon-overflow or malformed-request. Check arithmetic in bigint/safe integer order before multiplication results reach CP-SAT; out-of-range values are the existing typed preflight failures. Apply objective/movement bound checks using the stage's actual movement reference, never a zero placeholder presented as evidence.

## 5. Preparation without a fictitious feasible baseline

Add `buildConnectedSolverRequestPair(stage, identity, installedRuntime)` beside the local builder. Reuse slice/pool/resource/priority/internal-edge projection helpers by extracting their already-resolved-edge conversion; do not invoke `buildSolverEdges` with a fake common reach. The builder returns a per-objective discriminated preparation:

```ts
type ConnectedPreparedRequest =
  | { readonly kind: 'request'; readonly request: ConnectedSolverRequest }
  | { readonly kind: 'boundary-infeasible'; readonly certificate: BoundaryInfeasibleCertificate }
  | { readonly kind: 'failed'; readonly failure: SolverPreflightFailure; readonly detail: string };
```

Validate all trusted stage evidence and request shape/canonical correspondence first. Build constraints and arithmetic bounds **before** asking for any feasible integer witness. Start with `feasibleBaselineOffsets: null`; no feasibility search is required in preparation. Use the deterministic nearest integer `Math.round(Q * currentLocalStart)` for movement reference after safe-domain checks. Use that as an explicitly untrusted candidate seed or set seed null; the fixed implementation choice here is **seed equal to the movement reference**, accepted as a hint only after a bounded full-model feasibility probe. Both objective requests share one reference/seed map. If the probe cannot prove it feasible, install no baseline bound and no hint; ordinary search continues. Unknown probe status never proves infeasibility.

Python replaces direct baseline indexing with explicit helpers for movement reference, optional feasible witness and seed. `baseline_is_feasible`/`baseline_bound` validates a supplied witness against the complete model including external bounds/bookings/deadlines. A declared feasible witness that does not satisfy the model is rejected as malformed evidence, not used to cut off legal schedules. A seed may be infeasible without making the request malformed. Do not install `primary <= referencePrimary` unless the referenced placement was actually proved feasible. Current three-stage budget/order/status discipline stays; an infeasible later lexicographic stage after an incumbent is still an internal model failure, not a new boundary certificate.

A direct contradictory-bounds preflight may return a certificate once the complete request is validated. Effective lower includes zero, the local floor and every incoming minimum; effective upper includes horizon and outgoing maxima. `lower > upper` for one local key is a mathematical witness. Record the exact bound contributors. More complex infeasibility goes to CP-SAT; no arbitrary retry/convergence loop.

Mandatory example: fixed A finish **0.2**, B duration **1**, fixed C start **1.2**, Q **48**. B lower = ceil(9.6) = **10**; outgoing FS upper = floor(57.6) − 48 = **9**. Real B at 0.2→1.2 remains a valid component placement. Preparation produces a boundary certificate or a valid solver request with an empty integer window; it never calls the old `quantisedFastBaseline` to manufacture a witness, never defaults baseline offsets to zero, and never calls that window malformed. The same result with an unrelated local deadline still means only the captured fixed-boundary quantized stage is infeasible.

Exercise both routes: the production preflight proves the direct example; a direct valid request through Python proves model/response handling; a nontrivial graph/occupancy infeasibility that the direct interval preflight does not catch proves the real process-exit-to-certificate path.

## 6. Independent publication and baseline comparison

Add `revalidateConnectedSolverResult(stage, request, response)` and `evaluateConnectedSolverOutcome(stage, request, processOutcome)`; share lower-level numeric/key/capacity/deadline checks with local validation. **Request validation precedes outcome classification**, as the existing TASK-329 fix requires. Recompute correspondence with canonical local slices, internal edges, complete boundary list, fixed identities, occupancy, quantization, references and full question identity even on unknown/infeasible responses. A missing edge is malformed-request, not permission to certify the smaller question.

For a feasible response, require exactly local slice keys, integer domains, floors, local edges including FF real-weight constraints, all incoming/outgoing bounds, deadlines and team/resource/person capacities. Then create a full start map by copying **the immutable stage starts** and replacing only local keys with `offset/Q`. Call the existing `scheduleResolved(stage.input, fullPinnedStarts)` to materialize the complete component. No independent local leveller or schedule stitching is allowed.

After materialization, compare **every foreign start and finish exactly** to the immutable stage values. Existing pinned replay can reconcile tiny arithmetic drift; it is not allowed to mutate a fixed foreign boundary unnoticed. If replay cannot reproduce those fixed values, refuse the candidate rather than silently shifting foreign work. Validate real FS/SS/FF, manual/project floors and capacity/person nonoverlap over the whole materialized component. All local and foreign schedule keys must remain exact. Validate local real deadlines with existing milestone semantics.

Do **not** call current `guardRealPublication` unchanged: it recomputes unpinned local Fast, which is a different fixed-boundary question. Add a domain `guardConnectedPublication(stage, candidate, weights, movementReference)` that replays/validates the captured real baseline from `stage.starts`, projects both baseline and candidate onto **only stage.projectId**, and reuses `scoreReal` with the same sorted local keys. The primary is the project's existing PRI/Time primary; tie behavior remains existing strict `worse`, not an invented strict-improvement policy. Compare movement to the same integer reference divided by Q. The baseline is thus derived from immutable canonical stage facts and pins, not a caller-supplied arbitrary Schedule.

If a feasible solver candidate loses to the real baseline because of quantization, retain baseline with existing quantisation-floor proof rules scoped to this stage (no false optimality). Boundary-infeasible is a different terminal state with **no candidate schedule**. Replacing a stage never copies foreign latest times/critical flags from a cached full component; full replay/annotation for the final composite remains authoritative.

Cached ready stage results must be revalidated against the current exact stage question before selection, including current foreign pins and real materialization. Hash equality is necessary, not a substitute for strict payload/placement validation. Cache corruption remains visible and non-auto-retrying under established policy.

## 7. Certificate, persistence and retry constraints

Define a strict versioned `BoundaryInfeasibleCertificate` in solver contracts, with no imports from core:

```ts
interface BoundaryInfeasibleCertificate {
  readonly dtoVersion: 1;
  readonly kind: 'boundary-infeasible';
  readonly identity: ConnectedQuestionIdentity;
  readonly stage: StoredConnectedOptimizationStage;
  readonly request: ConnectedSolverRequest;
  readonly evidence:
    | {
        readonly kind: 'contradictory-bounds';
        readonly key: string;
        readonly lower: number;
        readonly upper: number;
        readonly contributors: readonly string[];
      }
    | { readonly kind: 'solver-proven-infeasible'; readonly response: ConnectedSolverResponse };
}
```

The stored stage serializes maps explicitly, carries exact baseline real placement, graph/provenance/anchors/constraints, and has a strict independent decoder. `identity` must equal request scope and the canonical stage-derived hash/key. A certificate records all effective local constraints (including local deadlines/capacities), not merely an external ID list. Decoder verifies structural/arithmetic consistency; a solver certificate is evidence of that solver's proved status under that request, not an independently machine-checked unsat proof. No claim of mathematical proof stronger than that is made. Labels can be stored separately for presentation; they never replace stable endpoint/value evidence.

Current SQLite `optimized_schedule_cache` has a CHECK limiting status to `ok`, `failed`, `plan-infeasible`, and generation allocation deletes old-generation rows. Therefore **do not just widen a TypeScript enum or rebuild this shared table destructively**. Use an additive `optimization_boundary_certificate` companion table, keyed by `(projectId, inputHash, objective, contractVersion, budgetMs)`, storing certificate JSON, producing generation/attempt attribution and createdAt. It represents a terminal outcome in the unified repository read API while preserving the old physical table. Use actual project FK/ownership conventions. Its forward/down migration is allocated by root after checking current identities; down refuses while retained evidence requires the feature, or follows an explicitly verified compatible export/recovery procedure. Do not erase certificates silently for rollback.

The boundary table is immutable and is **not** deleted by generation turnover or the old live-budget cache pruning. A changed question creates a new identity while the old certificate remains. Returning later to an exactly identical question must consult the retained certificate before admission, even if the current generation differs or no generation exists. Read both physical sources coherently; conflicting terminal/ready evidence for one exact key is corrupt trusted state and not last-writer-wins. A legitimate explicit Retry that replaces an older failed/corrupt cache row with a boundary certificate must conditionally retire that old row in the same fenced transaction, preserving its diagnostic in the existing attempt/event history. An old failure must not accidentally mask the new terminal certificate, and a ready/plan-infeasible row is not replaceable through this route.

Extend `CachedOutcome`, `optimizationVariantState`, outcome-write contracts, event vocabulary and HTTP/frontend DTOs with the distinct boundary state. Do not store it as failed/internal-error, use a deadline certificate payload, or mark it ready/quantisation-floor. Connected successful result payloads need a **separate strict scope-bearing envelope** (proposed version 2), selected by request scope; local envelope-v1 decoding remains explicit under its existing contract namespace. A decoder must not accept a connected result as an ordinary local Schedule. The old nested Schedule DTO version changes only if its actual fields change.

Reuse existing slot/generation/cancel-epoch/attempt-token fencing. Add exact current `inputHash`/question identity checks to publication; generation alone must not substitute for identity. Write terminal outcome durably, record its committed event, then release the slot. A validated preflight certificate may use the existing reserved-slot preflight-outcome path with **no child process**, followed by release in finally; a solver certificate waits for normal child terminal evidence. Do not release a running child merely because a desired certificate exists.

Automatic admission still asks only for misses. Boundary certificates are terminal independent of slot liveness and never become retrying. Retry order remains stale identity → terminal retryability → live attempt → capacity, and the same certified identity returns `{ kind: 'not-retryable', state: 'boundary-infeasible' }` without slot/generation/queue/event allocation. Re-check certificate presence inside admission's transaction to close concurrent duplicate admission. A changed boundary (e.g. C start **1.25**) produces a fresh question and normal admission; it does not mutate the old certificate.

## 8. Capture, live admission and restart

All stage cache selection is synchronous/non-admitting under the **same** owned or borrowed SQLite snapshot used for component capture. A publication committed between stage selections is invisible until the next observation, in isolated as well as shared mode. Nothing allocates generations, queues, slots or events inside that callback. Return detached stage questions and their visible selected states with the final composite.

After the callback closes, the ordinary live/background owner may register/admit the exact detached missing stage questions. Do not replace the captured UI state by rereading while admission occurs; existing “return the observed pair” behavior remains. Enablement and generation/ownership fences are rechecked during admission. Stale questions may be superseded, never presented as current. Saved captures perform no post-close admission.

Change the coordinator's `inputOf`/`captureOf` boundary to a precise local-versus-connected-stage union. Initial admission, queued drain, restart reconciliation and manual Retry must all use the same discriminant and preparation/evaluation functions. A queued stage re-captures the component and derives the stage question with read-only selection of prior ranks, then compares full identity; it does not rebuild a bare local `ScheduleInput` or recursively request live trees. If identity changed, release the unlaunched slot before admitting the fresh question under current settings, preserving existing ordering/fences. Stage reconstruction is one bounded component pass; optimize this only after correctness.

Within one observation, later selected variants do not recompute earlier hashes. In the next observation every pass starts at combined Fast again; selection of an earlier current variant changes the fixed evidence/hash for later stages. A stage never feeds its own cached answer into the baseline used to ask itself, which would create perpetual hash churn. Add a repeated-read identity stability test after all variants are settled.

Publication stores the answer for its **captured** question and checks fencing/identity; selecting that answer in a later live view again requires the exact current stage match. Do not attempt to prove “latest whole organization” by a series of nontransactional reads at child exit. If current identity has been invalidated, the generation/question fence refuses the write. Capture isolation and selection validation are still required even with this fence.

## 9. Edit ownership and dependency order

**Wire/Python lane** owns new wire-v5 schema and installed copy; `wire-types`, vocabulary/parser, connected request builder, resolved internal-edge conversion, conservative boundary projection, shared numeric validation helpers, Python validation/model/solve, strict fixtures and focused contract/Python tests. It consumes frozen domain stage values. It does not edit backend coordinator, SQLite schema, runtime wiring or the active resolved leveller. The root integrator owns actual version allocation/installation assets and coordinates any schema-common helper edits.

**Core orchestration lane** owns new `connected-optimization.ts` and its tests, immutable stage construction, bounded stage selection and local projection/scoped comparison metadata. Root assigns one owner for scheduler port/barrel changes and `connected-plan.ts` integration. This lane does not rebuild graph expansion or invent optimizer responses.

**Adapter/persistence lane** owns connected captured-reader/hash helpers, certificate codec integration, additive table/migration and terminal cache/retry behavior, after root reserves migration/version identities. Backend coordinator/exits/queued-drain/restart and shared composition files have one root-appointed integrator; no two workers edit `optimization.feature.ts`, `chain-snapshot.ts`, schema, barrels or installed runtime manifest concurrently.

Suggested bounded merge units: (a) stage values/canonical bytes; (b) wire/projection and Python valid/infeasible behavior; (c) independent materialization/publication; (d) core sequential selection with truthful unsupported capability until (b/c) are wired; (e) persistence/Retry/restart and capture lifetime; (f) installed runtime/version/public DTO integration and activation evidence. 7.1/7.2 can proceed while 6.1's shared leveller lands; production 7.3 needs actual `scheduleResolved`, completed calendar preparation and captured connected metadata. 7.4 is mandatory before declaring terminal outcome or live admission delivered.

## 10. Behavioral and R5 proof obligations

- Every incoming/outgoing FS/SS/FF case, including later-step endpoint and each parent-expanded pair. Remove each inequality separately in the real builder, Python model and Bun validator. Assert actual admitted/mathematical placement violations, not only JSON snapshots. A fixture with equivalent redundant guards needs a combined fault that reaches the production refusal, plus an honest note about redundancy.
- The 0.2/1/1.2/Q48 example with no deadline and with a nonbinding deadline; preparation, Python, exit classification, stored certificate, capture, restart, Retry. Remove the baseline distinction, classify by deadline presence, fabricate zeros or map boundary-infeasible to failed independently and watch the production-path assertion fail.
- All foreign keys/owners/fixed values, each normalized bound/value, all anchors/mode/ranks/local slices/widths/capacities/floors/deadlines/current starts, graph provenance/type/identity, runtime contract/version and budget identity. Field-by-field hash sweep, including earlier variant changing only a later stage question. Labels changing alone do not redefine constraint meaning.
- Two-project interleaving and mixed Fast/optimized/disabled projects, two objectives, selected versus nonselected variant, one stage per project, no recursive read, no same-stage self-feedback across repeated reads. Pending/failed/corrupt/boundary-infeasible retain the exact current composite, required engine absence refuses visibly.
- Shared foreign person occupancy (including rounded interval union and fractional boundaries), isolated people, local teams/resources, no capacity for zero-duration nodes. Drop booking/name ownership and each capacity namespace independently.
- Request mismatch validation before unknown/infeasible disposition; corrupted question echo, omitted expanded pair, bad witness/seed, signed contradictory upper bound, horizon/objective overflow, unsupported old wire/runtime. Both schema copies reject unknown fields and incompatible versions. Only a genuine CP-SAT initial-model INFEASIBLE or validated direct contradiction certifies; UNKNOWN/timeout/bad output never does.
- Whole-component real replay: forged foreign movement, rounded-valid real-invalid FF/FS/SS, one omitted edge, person overlap, local deadline/milestone, surplus/missing local offsets. Remove foreign pin/finish equality and complete real checks independently. Assert no partial replacement/cache publication.
- Scoped comparator: mutate back to current unpinned `guardRealPublication`, wrong objective, another project's weights, original global Fast after earlier selections, or final-stage boundaries substituted into earlier proof. Tests must fail on selected result/claimed scope.
- Exact question/generation/cancel epoch/attempt-token publication fences, terminal durability before release, preflight no-child release, old certificate retention across new generation/budget pruning and return-to-same-question. Bypass terminal auto-admit and Retry checks through real repository/coordinator paths and observe an unwanted attempt.
- Snapshot selects all stages under one connection, even isolated mode; inject publication after first read, replace captured reader with live admitting reader, retain callback past scope, throw/refuse after capture and assert close/borrow behavior. No queue/generation/slot/event writes during capture.

Run focused Bun suites for solver contracts, domain publication/quantization/golden corpus, core stage selection, SQLite cache/generation/queue/captured-reader/outcomes, backend coordinator/restart/Retry/supervisor paths. Python runs only via configured `bunx nx run wbs-solver-py:test`; it currently invokes unittest internally, not a second user-facing runner. Run installed solver handshake/image checks when runtime assets change. Final required host gate follows repo policy. Each adjacent Proof comment requires observed fault, exact failing assertion and restored green in verify.md; none are supplied by this ruling.

## Remaining risk, stated precisely

1. The new resolved materializer must replay fixed foreign real starts/finishes exactly despite floating tiling reconciliation. If it cannot, the candidate is refused; do not relax the constraint with a convenient epsilon. This needs the fractional production fixture before claiming usable optimization.
2. Infeasibility certificates attest the validated conservative integer subproblem. CP-SAT's status is trusted solver evidence, not a separately verified unsat proof; real Fast may remain feasible. UI/proof wording must preserve that distinction.
3. Current cache generation deletion and status CHECK make terminal persistence an actual additive storage task, not DTO plumbing. Without the companion-table retention/read/admission integration, same-question retry suppression across history/restart is incomplete.
4. The coordinator currently recaptures only local/shared `ScheduleInput`; every initial/queued/retry/restart entry point must branch correctly. A correct pure builder does not prove a real connected solve was ever asked or fenced.
5. A local optimizer installation is not connected support until the new schema/runtime, parser, full publication validator, certificate persistence and captured stage reader are all wired. Keep the explicit unavailable state and external-authoring activation barrier until that is verified.

## Immediate 6.x parallel ownership handoff

After capture and domain review, the **core Fast/calendar worker** may own new `core/src/service/schedule-parts.ts`, `connected-plan.ts`, `connected-plan-calendar.ts`, `connected-plan-projection.ts`, their focused tests, and extensions to `connected-plan-values.ts` only after capture's handoff. `schedule-parts.ts` extracts the current shared canonical preparation and returns the existing display side facts; it is not a second implementation beside the existing two. The worker may edit `core/src/module/saved-plans/saved-plan-schedule.ts` (and its compatibility service wrapper if needed) to call it, preserving the historical capture contract. It must supply an exact integration hunk replacing `work-item.resource.ts`'s canonical preparation body with the same helper. Do not leave both independent implementations in the integrated tree.

The **single admission/history integrator** owns `work-item.resource.ts`, services/source/boot, shared core/domain exports, scheduler ports, snapshot/live consumer switches and shared fixture wiring. It also owns replacing the live preparation wrapper from the worker's hunk. That worker need not touch any of those files. The Fast/calendar worker's direct tests use the real imported domain `scheduleResolved` as `CapturedScheduler.readResolvedFast`; no fake placement, optional missing capability or optimizer-success placeholder is acceptable. The local scheduler fixture can be adapted by the integrator first if needed.

`runtime-portable/src/scheduler.ts` and its focused test are safe worker-owned files only if root explicitly assigns them with the already-frozen required port signature; composition/constructor call sites remain integrator-owned. Otherwise give runtime wiring wholly to the integrator: it is not required for independently testing core derivation against the real domain function. No worker creates another scheduler abstraction to avoid this ownership boundary.

Merge order: **(1)** approved domain resolved engine and capture value; **(2)** shared required scheduler-port/barrel/fixture seam from integrator; **(3)** preparation extraction + captured wrapper + live-wrapper integration hunk together, verifying old local/captured equivalence; **(4)** new connected Fast/calendar derivation with real-domain tests; **(5)** runtime constructor wiring and actual connected snapshot/live consumers by integrator; **(6)** connected readiness and governed admission integration. Pure wire/Python optimization can proceed after stage input types are frozen, without editing these 6.x files.
