# Durable execution history design

This bounded phase implements [the execution-history intent](execution-history-intent.md).
The existing authority and retained-binding phases are accepted prerequisites. This design
supersedes their thin claim/launch integration only where explicitly versioned below.
The numbered suffixes distinguish contracts in this document; source keeps the existing
names for the new accepted versions. Required behavior is in the linked run-coordination
delta; [tasks](execution-history-tasks.md) order the implementation.

No executor open/turn, transport, provider construction, CTT adoption or host acceptance
is supplied by this phase. Exact outcome/write/release and production host ordering follow
as separate phases; current generic local delivery is explicitly versioned, not passed off
as an exact WBS write. No new public WBS contracts are needed.

## 1. Ownership and explicit versions

Use the existing names in source with the following version literals; the numeric suffixes below distinguish old/new contracts for this design. Every field and nested collection is readonly, and every public input/output is detached. Strict local codecs reject unknown keys, invalid discriminants and unsafe counters.

| Contract                                                           | Decision                                                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Manifest, Run, Ownership, ArtifactRef, ActivityIdentity            | Existing version1 unchanged                                                                              |
| Admission, RunGuard, AttemptGuard                                  | Existing shape unchanged                                                                                 |
| Preparation, ExecutorLocator, TurnRequest, TurnReply               | Existing portable shapes unchanged; complete snapshot/codec support added where absent                   |
| Attempt                                                            | Replace accepted shape with version2                                                                     |
| RunSnapshot                                                        | version2; Attempt2 and local delivery version2 payloads                                                  |
| Execution commands                                                 | Explicit version2 envelopes; do not accept old unversioned commands in format3                           |
| RuntimeIntent, RuntimeAcceptance, RuntimePin, RuntimeScopeSnapshot | Existing version1 fields unchanged; supported history operations expand through dedicated methods        |
| New local preparation/claim/turn/attachment records                | version1                                                                                                 |
| ProgressIntent, CommandReceipt, Completion                         | Explicit version2 adaptations described below; still generic local delivery, not exact WBS wire delivery |
| SQLite adapter                                                     | format3; no implicit old-format conversion                                                               |

### Exact cycle-free extraction

Create `runs/value-codecs.ts` as the shared leaf: the existing identifier/digest codec instances, safe integer primitives/helpers, Ownership/OwnershipStatus, ArtifactRef, ActivityIdentity and Locator codecs. Move, do not recreate, brand instances. `runs/record-codecs.ts` re-exports the old names so callers retain identity and imports.

Create `agents/execution-records.ts` and `agents/execution-codecs.ts` for the existing portable executor values and their snapshots. The codec owner imports only shared validation and `runs/value-codecs.ts`; it does not import `runs/record-codecs.ts` or the live port. Keep the live ActivityExecutor/ActivitySession/UI stream control and port-only replies in `activity-executor.ts`, re-exporting portable public names. ActivityDispatchError can move with its correlation snapshots and be re-exported, preserving constructor identity.

`runtime-codecs.ts` must consume common Ownership/ArtifactRef/identifier codecs and arithmetic from the same leaf instead of importing aggregate `record-codecs.ts`. It owns its local runtime record codecs and exports them only when aggregate composition consumes them. `record-codecs.ts` may then consume executor portable codecs and runtime record codecs without a back-edge. Burokrat-dependent manifest canonicalization/equality stays out of the shared leaf. API adapters may continue importing aggregate `equalRecords`/`assertInteger`: aggregate codecs never import those adapters.

No `identity.ts` is needed. The existing `records.ts` aliases are type-only imports of codec inference; portable executor records may type-import those aliases. These imports disappear at runtime. A type-only dependency is not a runtime initialization cycle. Add a separate type owner only if actual compiler/lint evidence requires it, not speculatively.

Task1 supplies `snapshotTurnReply(unknown): TurnReply` and reusable strict portable codecs in addition to the existing snapshots. It introduces no RunStore/SQL/version changes and keeps the existing public adapter contract compiling. Task2 owns focused `runs/execution-records.ts`, `runs/execution-codecs.ts` and `runs/claim-records.ts`; `records.ts` and `record-codecs.ts` remain the public facades. New pure claim transitions and cross-history validation live in `runs/plan-claims.ts` and `runs/validate-history.ts`. Do not create another re-export hierarchy.

## 2. Complete executor serialization

Retain the exact existing TurnReply union:

- completed: identity and outcome(text, usage, finish).
- not_started: identity and reason `cancelled_before_dispatch | session_busy`.
- unresolved: identity, reason, text and usage.

TurnIdentity retains full ExecutorLocator, turnKey and owner(ownerId, positive safe epoch). Usage is measured(inputTokens/outputTokens: nonnegative safe integers) or unknown with exactly `provider-usage-unavailable | interrupted-before-usage | acp-v1-no-usage | harness-usage-unavailable | tool | human`. Finish is exactly `end_turn | max_steps | output_truncated | refused | cancelled`. Uncertainty is exactly `unsupported | transport_lost | interrupted | observer_failed | approval_required | tool_input_required | provider_incomplete | turn_in_flight | recovery_required`.

Reject unknown nested fields and malformed numeric values; preserve measured zero, unknown reasons, empty/partial text and the full returned identity. No Error, AbortSignal, callback, ActivitySession, model/tool object or UIMessageChunk stream belongs in persisted payloads. A dispatch exception keeps the existing immutable pending TurnIntent and can add recovery evidence; it cannot be serialized as completed/not_started. Live UI parts are not replayed from stored TurnReply.

## 3. New local values

The following are exact field declarations; imported WBS names keep the public contract's domain. `Nonempty` means an unbounded nonempty string for receiver-owned IDs, not the RunStore identifier codec's 256-character cap. `LocalCommandId` means existing ExecutionCommandId. All counters use the existing safe integer checks.

```text
TargetObservation1 = {
  version: 1,
  evidence: ArtifactRef,
  scope: RuntimeScope,
  ledgerId: Nonempty,
  basis: RuntimeBasis,
  workItemId: WorkItemId,
  stepId: Nonempty,
  stepCode: Nonempty
}

PreparationIntent1 = {
  version: 1,
  preparation: Preparation,
  manifestDigest: ManifestDigest,
  selection: ExecutorLocator.selection,
  executor: { kind: ExecutorKind, version: Nonempty },
  target: { observation: TargetObservation1, parentClaimId: Nonempty | null },
  owner: DispatchOwner
}

Attachment1 =
  { version: 1, kind: 'opened', owner: DispatchOwner }
  | { version: 1, kind: 'reattached', owner: DispatchOwner, evidence: ArtifactRef }

ClaimProjection1 = {
  version: 1,
  claimId: Nonempty,
  actorId: Nonempty,
  basisAfter: RuntimeBasis
}

ClaimBinding1 = {
  version: 1,
  intent: RuntimeIntent,
  acceptance: RuntimeAcceptance,
  projection: ClaimProjection1
}

ClaimRef1 = {
  version: 1,
  commandId: Nonempty,
  requestDigest: ArtifactDigest,
  runId: RunId,
  attemptId: AttemptId
}

TurnIntent1 = {
  version: 1,
  locator: ExecutorLocator,
  claim: ClaimRef1,
  grantCommandId: Nonempty,
  request: TurnRequest
}
```

**ClaimProjection is deliberately not a copied wire receipt.** Canonical request plus acceptance plus projection reconstruct every known ClaimReceipt field: scope/ledger/command/digest from the intent, authority/request-known claim target and execution from its canonical request, actual claimId/actorId/basisAfter from the projection. Unknown compatible wire fields remain in the artifact. This is smaller than storing another complete RuntimeClaim/ClaimReceipt tree. Deriving RuntimeClaim uses the public request's exact workItemId/stepId/parentClaimId/execution plus the generated claimId; no late WBS observation fills missing fields.

ClaimRef points to that complete binding, not an authorization shortcut. Resolve it against retained history and compare all five fields. The local command IDs and RuntimeIntent.commandId are distinct namespaces. The latter remains the unbounded WBS string identity. The local workItemId is the already admitted Run's branded local identity; receiver-only person/claim/step/parent IDs retain WBS's full string domain.

### Target observation boundary

`TargetObservation1` is a strict local projection of an actual retained RuntimeState artifact, verified through `validateSchema(readRuntimeState.responses[0].schema, wire)`. A focused helper projects only after strict UTF-8/JSON and actual ArtifactStore read. It selects exactly one work item with the Run's workItemId and exactly one step with the requested stepId whose nonnull code equals selected stepCode; absent/ambiguous trusted rows throw. Match scope, ledger and basis exactly. Preserve the full artifact independently. This does not discover a graph, infer work-item type, prove complete topology, or authorize eligibility; caller-selected requestedType and parentClaimId remain explicit inputs and the receiver applies normal eligibility/parent checks.

Preparation retains its original target projection. Claim staging may supply a newly verified TargetObservation with a newer basis/evidence, but scope/ledger/workItemId/stepId/stepCode must remain identical to preparation. Only expectedBasis changes to the fresh observation's exact basis; parentClaimId remains preparation's explicit immutable value. This avoids freezing an unnecessarily stale preparation-time basis without inventing target rebinding or a second mutable target record. Once a claim request is staged, even its basis is immutable.

## 4. One Attempt2 state and a nonrecursive checkpoint

Use these exact component values. Each is embedded immutable content in the one Attempt state, not a separately mutable record or independently revisioned resource.

```text
Located1 = {
  version: 1,
  preparation: PreparationIntent1,
  locator: ExecutorLocator,
  attachment: Attachment1
}
Claimed1 = { version: 1, session: Located1, binding: ClaimBinding1 }
TurnCause = TurnRequest.cause

Checkpoint2 =
  { kind: 'queued' }
  | { kind: 'preparing', preparation: PreparationIntent1 }
  | { kind: 'prepared', session: Located1 }
  | { kind: 'claiming', session: Located1,
      intent: RuntimeIntent, observation: TargetObservation1 }
  | { kind: 'ready', execution: Claimed1, cause: TurnCause }
  | { kind: 'turn_pending', execution: Claimed1, turn: TurnIntent1 }
  | { kind: 'turn_returned', execution: Claimed1,
      turn: TurnIntent1, reply: Extract<TurnReply, kind='completed'> }

UnresolvedEvidence1 =
  { kind: 'artifact', reason: Nonempty, evidence: ArtifactRef }
  | { kind: 'turn', reply: Extract<TurnReply, kind='unresolved'> }

AttemptState2 =
  Checkpoint2
  | { kind: 'reconciling', checkpoint: Checkpoint2, reason: Nonempty }
  | { kind: 'unresolved', checkpoint: Checkpoint2,
      observation: UnresolvedEvidence1 }
  | { kind: 'interrupted', checkpoint: Checkpoint2, quiescence: Quiescence }
  | { kind: 'waiting_for_person',
      checkpoint: Extract<Checkpoint2, kind='turn_pending' | 'turn_returned'>,
      wait: HumanWait, quiescence: Quiescence }
  | { kind: 'outcome_pending_progress',
      checkpoint: Extract<Checkpoint2, kind='turn_pending' | 'turn_returned'>,
      outcome: AttemptOutcome, commandId: CommandId, quiescence: Quiescence }
  | { kind: 'terminal',
      checkpoint: Extract<Checkpoint2, kind='turn_pending' | 'turn_returned'>,
      outcome: AttemptOutcome, receipt: CommandReceipt2, quiescence: Quiescence }

Attempt2 = {
  version: 2, attemptId: AttemptId, identity: ActivityIdentity,
  ordinal: Ordinal, revision: Revision, admittedEpoch: Epoch,
  state: AttemptState2, holdsCapacity: boolean
}
```

Checkpoint2 is **not recursive**: it never contains AttemptState2, recovery states, mutable history or another revision. A recovery state carries the last meaningful execution checkpoint. Each transition replaces the single Attempt.state and increments the existing attempt/run revisions once. The planner owns all updates, including attachment changes. This avoids nullable-field combinations while keeping the number of recovery variants small.

Capacity is held for Checkpoint2/reconciling/unresolved and released only for the four settled variants under existing determinate-quiescence rules. `waiting_for_person` and business outcome accept a pending turn checkpoint only with separately established determinate effect/quiescence: authoritative reconciliation may establish settlement without an executor's original completed reply. Never fabricate that reply. A pending/unresolved turn cannot be cleared merely by reattachment, owner takeover or cancellation acknowledgement.

Admitted revision0 is queued with held capacity. No old queued.claim, thin launch state or legacy dispatcher branch remains. Initial ready cause is initial. The full preparation/session/claim survive recovery, waiting, continuation and settled outcomes through the embedded checkpoint.

### Continuation and retry

`consumeDecision` retains its existing guard/decision identity API and original reply semantics. From the exact waiting state it atomically records consumption plus held reservation and yields ready with the identical Claimed1 and cause `{kind:'decision', decisionId}`. It does not mutate the session/claim or synthesize an initial cause. `stageTurn` must exactly match that cause. Fresh initial turns are allowed only from the first initial ready or an explicitly not_started initial return. Completed/uncertain turn history cannot return to initial ready. Distinct waits retain distinct correlation keys as today.

A retained not_started reply returns to ready with the pending intent's cause. Its turnKey remains bound to the exact durable request in history, even though the adapter itself leaves a fresh refused key unbound. Exact re-staging under a new local command may reuse that turnKey only with identical full TurnIntent and only after the corresponding not_started observation; changing any request field refuses identity_conflict. A new key with that same ready cause is also allowed. Reconciliation cannot use not_started without an actual trustworthy nondispatch fact.

Claimed predecessors remain ineligible for a replacement attempt until future exact guarded release evidence exists. Task2 has no release API, so it refuses claimed retries, including failed terminal ones. Pre-claim proven-absent interruption can still admit a fresh ordinal under existing budget/capacity rules. This is a visible bounded limitation, not a fabricated release, a second retry mode or a weakening of exact claims.

## 5. Execution facts, command identities and paired replies

Four command families share one store-wide local execution-command namespace and the existing `run_execution` physical primary key. Every retained envelope records the exact public submission, allowing replay to compare it before current revisions. Provider-generated scope revisions and provenance belong in the retained acknowledgement and are reconstructed from immutable linked scope events.

```text
ExecutionFact2 =
  { kind: 'preparation_intended', intent: PreparationIntent1 }
  | { kind: 'session_prepared', locator: ExecutorLocator, owner: DispatchOwner }
  | { kind: 'session_reattached', locator: ExecutorLocator,
      owner: DispatchOwner, evidence: ArtifactRef }
  | { kind: 'turn_observed', reply: TurnReply }
  | { kind: 'recovery_required', reason: Nonempty }
  | { kind: 'unresolved', reason: Nonempty, evidence: ArtifactRef }
  | { kind: 'interrupted', quiescence: Quiescence }
  | { kind: 'waiting', wait: HumanWait, quiescence: Quiescence }

ExecutionCommand2 = {
  version: 2, kind: 'execution', commandId: LocalCommandId, fact: ExecutionFact2
}
ClaimStageCommand2 = {
  version: 2, kind: 'stage_claim', commandId: LocalCommandId,
  canonicalRequest: string, observation: TargetObservation1
}
ClaimAcceptCommand2 = {
  version: 2, kind: 'accept_claim', commandId: LocalCommandId,
  intent: RuntimeIntent, evidence: ArtifactRef, projection: ClaimProjection1
}
TurnStageCommand2 = {
  version: 2, kind: 'stage_turn', commandId: LocalCommandId, request: TurnRequest
}
ExecutionSubmission2 =
  ExecutionCommand2 | ClaimStageCommand2 | ClaimAcceptCommand2 | TurnStageCommand2

ExecutionAck1 = { version: 1, kind: 'execution', attempt: Attempt2 }
ClaimStageAck1 = {
  version: 1, kind: 'claim_staged', intent: RuntimeIntent, attempt: Attempt2
}
ClaimAcceptAck1 = {
  version: 1, kind: 'claim_accepted', acceptance: RuntimeAcceptance,
  binding: ClaimBinding1, attempt: Attempt2
}
TurnStageAck1 = { version: 1, kind: 'turn_staged', intent: TurnIntent1, attempt: Attempt2 }
ScopeContext1 = { version: 1, scopeRevision: Revision }
ExecutionRecord1 = correlated union of
  { version: 1, command: ExecutionCommand2, context: null },
  { version: 1, command: ClaimStageCommand2, context: ScopeContext1 },
  { version: 1, command: ClaimAcceptCommand2, context: ScopeContext1 },
  { version: 1, command: TurnStageCommand2, context: ScopeContext1 }
RecordedExecution2 = correlated union of
  { version: 1, command: ExecutionCommand2, context: null, reply: ExecutionAck1 },
  { version: 1, command: ClaimStageCommand2, context: ScopeContext1, reply: ClaimStageAck1 },
  { version: 1, command: ClaimAcceptCommand2, context: ScopeContext1, reply: ClaimAcceptAck1 },
  { version: 1, command: TurnStageCommand2, context: ScopeContext1, reply: TurnStageAck1 }
```

No `claim_acquired`, `launch_recorded` or `turn_intended` ordinary fact can bypass dedicated scope-aware operations. `recordExecution` returns Attempt2 as before; its stored reply has the ExecutionAck envelope. Dedicated APIs return their matching paired acknowledgement. The SQLite reply-revision query must read `$.attempt.revision` for every execution-row envelope; do not retain the old `$.revision` SQL accidentally.

Exact duplicate requires identical family, local command ID, target run/attempt and submitted payload. Current-owner fencing precedes retained lookup; exact old commands return their immutable original acknowledgement before stale revision checks. Changed family/payload/target refuses. Fresh local command IDs pass current revisions and state rules; matching old facts do not auto-replay. A runtime command cannot be staged a second time by a different local stage command: the one-to-one cross-history association refuses that identity reuse, rather than returning a new acknowledgement under a second local identity. Likewise one runtime acceptance has one local claim-acceptance association. Lost callers recover the retained local identity through history; they do not invent a replacement.

ExecutionCommandId remains bounded 1..256 as existing local storage policy. Runtime request command IDs remain unbounded nonempty WBS IDs, globally unique in the runtime-intent table. CreationKey keeps the existing adapter key bound and is immutable for this attempt; persistence rejects its reuse across attempts in the same store/executor identity to avoid a process-local adapter's creation-key collision. TurnKey is scoped to the exact prepared session/attempt, with immutable payload history. DecisionId remains its existing store-wide inbox identity. These domains are not aliases.

## 6. Guards and APIs

Keep one ownership object in each guard. Reuse the existing AttemptGuard field names for run and attempt revisions; add a separate scope revision explicitly.

```text
ScopedAttemptGuard = AttemptGuard & {
  scope: RuntimeScope,
  expectedScopeRevision: Revision
}
```

`scope` must equal the immutable preparation target. Its organization equals store organization and its project equals Run.projectId. All coupled mutations use one locked provider view of ownership, run, attempt, scope, histories and reservations. External artifact verification occurs before that transaction; current guards/revisions are rechecked inside it.

RunStore signatures, using `Promise<StoreReply<T>>`:

```text
recordExecution(AttemptGuard, ExecutionCommand2) -> Attempt2
stageClaim(ScopedAttemptGuard, ClaimStageCommand2) -> ClaimStageAck1
recordClaimAcceptance(ScopedAttemptGuard, ClaimAcceptCommand2) -> ClaimAcceptAck1
stageTurn(ScopedAttemptGuard, TurnStageCommand2) -> TurnStageAck1
consumeDecision(AttemptGuard, DecisionId) -> Attempt2
readExecutionHistory(RunId, AttemptId) -> Promise<ExecutionHistory1>
```

Existing manifest/admission/authority methods stay. Existing outcome/receipt methods adopt the explicitly adapted version2 local records below. `stageRuntimeRequest`/`recordRuntimeAcceptance` continue to be authority-only; claim operations cannot enter through them. Raw claim acceptance requires the caller to have verified the exact artifact and projected receipt. All trusted boundaries enforce local shapes and correspondence regardless of that precondition.

`ExecutionHistory1` contains version1, Run, current Attempt2, ordered RecordedExecution2[], existing recorded decision consumptions with Attempt2 original replies, decisions, optional Completion2 record, optional CommandReceipt2/original terminal reply. Explicit null represents absent completion/receipt. It is a consistent validated snapshot; it is not an event-subscription or an alternate mutation API. ReadRun2 retains its existing public field purposes and updated payload versions.

### Verified application signatures

These functions receive only the stated RunStore capabilities plus ArtifactStore. Their input records are snapshotted before the first await; they never invoke an executor or WBS transport.

```text
recordPreparation(
  runs: Pick<RunStore, 'readRun' | 'readManifest' | 'recordExecution'>,
  artifacts: ArtifactStore, guard: AttemptGuard,
  input: {
    commandId: LocalCommandId, preparation: Preparation,
    requestedType: string, stepCode: string, stepId: Nonempty,
    scope: RuntimeScope, parentClaimId: Nonempty | null,
    stateEvidence: ArtifactRef,
    executor: {kind: ExecutorKind, version: Nonempty}
  }
) -> Promise<StoreReply<Attempt2>>

stageClaimRequest(
  runs: Pick<RunStore, 'readExecutionHistory' | 'stageClaim'>,
  artifacts: ArtifactStore, guard: ScopedAttemptGuard,
  input: {
    commandId: LocalCommandId, canonicalRequest: string,
    stateEvidence: ArtifactRef
  }
) -> Promise<StoreReply<ClaimStageAck1>>

acceptClaimReceipt(
  runs: Pick<RunStore, 'recordClaimAcceptance'>,
  artifacts: ArtifactStore, guard: ScopedAttemptGuard,
  input: {
    commandId: LocalCommandId, intent: RuntimeIntent, evidence: ArtifactRef
  }
) -> Promise<StoreReply<ClaimAcceptAck1>>

recordExecution(
  runs: Pick<RunStore, 'recordExecution'>, artifacts: ArtifactStore,
  guard: AttemptGuard, command: ExecutionCommand2
) -> Promise<StoreReply<Attempt2>>

readExecutionHistory(
  runs: Pick<RunStore, 'readExecutionHistory' | 'readManifest'>,
  artifacts: ArtifactStore, runId: RunId, attemptId: AttemptId
) -> Promise<ExecutionHistory1>
```

The existing verified `recordExecution` helper must reject direct `preparation_intended` submission (or narrow its accepted command type to exclude that variant); preparation goes through `recordPreparation`. Raw `RunStore.recordExecution` still accepts the internal preparation fact with its documented verification precondition. No boolean approval flag or branded JSON is claimed as unforgeable authorization.

`recordPreparation` consumes the committed `readManifestBinding` and public `selectWorkflowActivity(binding, requestedType, stepCode)`. It verifies actual state evidence and target mapping, exact own `manifest.executorVersions[selected.settings.executor]`, matching supplied descriptor kind/version, run manifest identity and preparation identity; then builds PreparationIntent and records it. The raw planner independently checks stored manifest pin fields, immutable run/attempt/target bindings, and current owner on fresh preparation. The supplied executor descriptor is configuration metadata; the future host must compare it to the actual configured adapter before calling open/turn.

`stageClaimRequest` validates its actual state artifact against the owning WBS response schema, projects the fresh observation for the retained preparation target, parses exact canonical request bytes through the public parser, checks claim variant, and submits the complete projection. The raw transaction checks the same local projection/target/basis correspondence but does not decode external artifacts synchronously. The extra history read supplies immutable target context; scoped/run/attempt revision checks prevent a stale snapshot from becoming an effective mutation.

The artifact-free `stageTurn` needs no separate verification wrapper: it snapshots/validates a complete TurnRequest, derives locator/ClaimRef/current grant link inside the transaction, and enforces ready cause/attachment/current scope authority. It records intent only, never dispatches.

`session_prepared` and `session_reattached` are trusted observations. The verified generic helper checks referenced evidence bytes, not their backend truth. The future production host must supply session_prepared only from its owning live OpenReply and reattached only from a supported backend resume/lookup recovery with exact full locator. No positive reattachment is available from the actual all-unsupported API-model adapter. This evidence ownership is an explicit limitation of a history-only foundation.

## 7. Exact claim transitions, turn provenance and receipts

### Claim stage

Require prepared; exact complete locator and pin; matching target and current observation; exact canonical claim request with storeId/runId/attemptId/sessionId from the persisted locator/admission; scope/ledger/authority equal the pinned scope and its accepted current-local-epoch grant; expectedBasis equal the verified fresh observation; parentClaimId equal preparation's explicit retained parent; and no pending scope command. Check live owner first and all three revisions for a fresh command. Atomically create RuntimeIntent, increment scope/counter, retain the ClaimStage command/original acknowledgement, and advance attempt/run to claiming.

### Claim acceptance

Require the identical pending RuntimeIntent, claiming predecessor, expected scope/run/attempt revisions and exact projection/evidence correspondence. Atomically retain RuntimeAcceptance/counter, ClaimBinding, original paired acknowledgement, and ready(initial) attempt. Old-epoch intent acceptance is allowed under a new live owner but supplies no current-epoch attachment/grant. Exact duplicates replay unchanged. Claim acceptance never increments authority generation: the scope fold retains its current accepted acquisition mapping and checks the request's staged mapping. Only authority acceptance derives a new generation/grant.

### Turn admission and post-takeover recovery

Fresh stageTurn requires ready, the exact ready cause, no pending scope request, a current-local-epoch accepted authority mapping, and `execution.session.attachment.owner` exactly equal to current live local owner/epoch. It snapshots the full locator and a ClaimRef, records `grantCommandId` from that exact scope history, and requires request.owner equal current owner. An old claim acceptance alone cannot meet these requirements.

After takeover, the old Attachment stays historical. A fresh `session_reattached` fact must retain current owner/epoch, the exact complete original locator and evidence; changing sessionId/workerId/executorVersion/selection/preparation refuses. It updates attachment only within the single Attempt transition. Allowed checkpoints are prepared/claiming/ready/turn_pending/turn_returned, directly or inside reconciling; an unresolved checkpoint may be reattached only without clearing its unresolved wrapper. Reattachment never clears pending runtime or turn identity, never changes claim, and never manufactures a completed reply. A turn_pending checkpoint stays turn_pending; subsequent exact observation or independently determinate effect/quiescence is still required. A ready checkpoint can become ready under the new attachment after successful reattachment. A late completed reply can be recorded under the current owner with its original TurnIdentity owner unchanged.

A same-epoch process restart still needs a real owning ActivitySession from the adapter before external execution. The store's owner provenance does not identify an OS process or certify the opaque live object. This remains a host responsibility, and the API-model adapter will reject a foreign attachment. No state-history boolean converts its unsupported recovery to supported.

### Public WBS validation reuse

Actual public sources inspected: `libs/wbs/domain/contracts/src/runtime-request.ts`, `runtime-receipt.ts`, `http/runtime-command-shapes.ts`, and `http/schema-shape.ts`.

Use `parseCanonicalRuntimeRequest` for strict request parsing/recanonicalization and `canonicalRuntimeRequest` when producing bytes. For receipt artifacts use actual bytes -> fatal UTF-8 -> JSON -> awaited `validateSchema(lookupRuntimeReceipt.responses[0].schema, wire)` -> `matchesRuntimeReceipt(scope, operation, independently computed SHA256, checked.value)`. Narrow to claim variant. No new public WBS decoder or duplicate receipt shape tree is necessary. The schema intentionally tolerates added response fields; local persistence stays strict. The current private runtime-history verifier returns void: refactor it privately to return the already schema-validated RuntimeReceipt so both authority and claim application reuse one verified-byte owner. Do not add a second partial matcher.

Build ClaimProjection from the validated receipt's generated claimId, actorId and basisAfter. The verified helper supplies that projected snapshot to raw acceptance; verified history independently reprojects actual bytes and compares exactly with the persisted projection. Raw persistence cannot independently establish a generated claimId from request-only fields: it validates local projection shape, exact pending links and every request-known binding under its documented verified-byte precondition. The strict local projection codec validates those three owned fields (nonempty strings and rb1 digest spelling) and version; it does not substitute for full wire validation. Reconstructing a known-field ClaimReceipt from intent+projection and invoking the public matcher checks all request-known bindings. Verified reads independently re-read artifact bytes and compare the freshly projected values, detecting coherent local projection/claimId changes that a request-only matcher cannot detect.

Authority `readRuntimeHistory` still verifies every acceptance artifact. The verified execution history additionally verifies every ClaimBinding projection, original and fresh TargetObservation against its artifact, manifest selection/version pin, and referenced recovery/wait/outcome evidence. No artifact IO occurs inside a transaction. Correspondence does not authenticate the receiver or establish a live lease.

**Pending rule:** authority/claim and future write share one scope pending slot. Refusal, 404, timeout, changed basis/generation and cancellation never clear it. No replacement command, automatic retry-with-new-bytes or supersession API. The next slice can remain unresolved indefinitely. A nonacceptance/fence-over-pending protocol is separate work.

## 8. Necessary adaptation of generic local completion records

ClaimAuthority1 is unsuitable for new claims: it omits step/parent and bounds receiver claim/person IDs to256. Do not cast a WBS claim into it, weaken its old version1 codec silently, or keep a legacy execution branch.

Adapt only the generic local delivery records, preserving their present atomic/outbox semantics:

```text
ProgressIntent2 = {
  version: 2, commandId: CommandId, claim: ClaimRef1,
  expectedWbsRevision: string(nonempty), outcome: AttemptOutcome,
  commandDigest: ArtifactDigest
}
CommandReceipt2 = {
  version: 2, commandId: CommandId, commandDigest: ArtifactDigest,
  claim: ClaimRef1, acceptedWbsRevision: string(nonempty), evidence: ArtifactRef
}
Completion2 = {
  version: 2, outcome: AttemptOutcome,
  intent: ProgressIntent2, quiescence: Quiescence
}
```

Existing local command digest canonicalizes the entire new record excluding commandDigest. Its opaque expected/accepted revision strings remain generic storage fields. These are **not** RuntimeWriteRequest or WriteReceipt and cannot authorize a WBS sender. They reference the exact immutable claim binding; raw planners compare that reference against the checkpoint and complete retained binding. Physical completion/receipt attempt identity comes from ClaimRef.attemptId, checked against the linked command and run/attempt, instead of old authority.attemptId.

Successful completion still requires determinate succeeded effect and verified artifacts. A completed turn alone is insufficient. Outbox removal and terminal state still require an exact generic local receipt. Even terminal does not count as a confirmed exact WBS write/release for successor scheduling or claimed retry in this bounded slice. The later exact write/outcome task replaces this local transport-neutral delivery shape with explicit canonical bytes and shared scope atomics; Task2 does not pretend that work is already done.

## 9. One reconstruction owner and minimal format3

Use one adapter snapshot owner (`sqlite/read-history.ts` is the proposed name) with four sequential phases: decode physical rows/keys/counts; fold runtime scopes without attempt-reader calls; fold attempts using the immutable runtime-event index; perform a shared pure bidirectional claim-link audit and final projection/reservation checks. Memory uses the same pure folds/link audit. Low-level readers never call each other recursively. All public reads, duplicate replay, mutation and reopen route through this audit within one consistent transaction/snapshot.

Each attempt fold starts queued/revision0 and merges execution acknowledgements at reply.attempt.revision with consumption replies and completion/receipt transitions. Check consecutive revisions and the true predecessor for every event, not only current phase. Original paired scope/attempt replies must equal independently reconstructed consequences at their original positions. Every runtime claim intent has exactly one local stage command and every runtime claim acceptance exactly one acceptance command, and vice versa. Authority-only events need no attempt association. Claims reuse a receiver generation; authority acquisitions alone advance it.

Use existing SQL columns:

- `run_attempt.record`: Attempt2; immutable `admission` unchanged.
- `run_execution.record`: ExecutionRecord1, including the original command and provider-owned scope context; `reply`: its exact correlated acknowledgement.
- Existing consumption/completion/receipt columns carry adapted nested versions.
- Existing runtime intent/acceptance tables carry their unchanged version1 records; accepted claim projection resides in the exact execution command/acknowledgement history.
- No new mutable session/turn/claim table, second per-attempt revision, or whole-store snapshot writer.

Append0003-execution-history with a forward metadata schema-version3 update and sibling guarded down; keep0001/0002 bytes unchanged. Existing run_format has no version CHECK; update its complete bundle hash through bootstrap as today. A JSON record change still earns adapter format3 even with unchanged physical declarations. Forward metadata update is a no-op while building the empty physical reference; final bootstrap metadata insertion installs schema3 and full bundle hash. Registry identity includes all three ordered forward/down hashes.

Down preconditions: complete format3/physical/history prevalidation, one explicit transaction, required metadata/marker singleton, fail-fast complete statements. Refuse any attempt or any new execution/consumption/completion/receipt row, including otherwise queued Attempt2; refuse any non-authority runtime request/acceptance even if its attempt rows are missing. Corrupt cross-links reject during prevalidation first. Authority-only scope histories, generic manifests, runs and artifacts remain compatible. Restore schema_version2 and exact known format2 bundle hash; keep its three runtime counts/authority rows unchanged. The0003 down's old hash is a fixed predecessor constant derived from the unchanged0001/0002 registry, not a hash of itself. No new table is needed solely to version the marker.

Read-only compatibility inspection rejects genuine format1/2 before configuring WAL or mutating bytes. No old record upgrader, reset, mode switch or migration CLI. Existing missing-family limitations remain: retained revisions/links detect inconsistent loss; coherent deletion/reset of all independent evidence is outside the local-integrity claim unless a separately specified retained marker is added. Do not promise an unexplained new cryptographic history guarantee.

## 10. Two implementation tasks and fixture consequences

**Task1: portable execution values and codecs.** Move exact shared codec instances into `runs/value-codecs.ts`; split portable executor records/codecs from live `activity-executor.ts`; redirect runtime-codecs common imports; preserve facades and adapter runtime behavior; add complete TurnReply serialization/snapshot tests and meaningful negatives. Exports of original names and class identity remain intact. This task leaves all existing adapters/storage compiling with Attempt1/schema2 and adds no unused RunStore methods or format stubs. It is a usable refactor/codec prerequisite, not durable history acceptance.

**Task2: one coherent durable execution provider change.** Introduce all new versions/states/facts/APIs, verified preparation/target/claim operations, scope+attempt atomics, current-owner reattachment provenance, adapted continuation/local outcome shapes, full reconstruction, and format3 together. Implement both memory and SQLite providers and all conformance/fixture changes in the same task. Internal TDD slices are ordered preparation -> locator -> atomic claim -> turn -> continuation/history -> format compatibility/proofs, but no intermediate incompatible state/SQL-only stage is presented as a separate complete adapter. No unimplemented methods, cast-away unions or temporary legacy branch.

Affected implementation paths (relative to Dash `cli/src/`):

- Task1: new `runs/value-codecs.ts`, `agents/execution-records.ts`, `agents/execution-codecs.ts`; existing `runs/record-codecs.ts`, `runs/runtime-codecs.ts`, `agents/activity-executor.ts`, its portable tests, and direct imports only as required.
- Task2: `runs/records.ts`, `record-codecs.ts`, `run-store.ts`, `plan-admission.ts`, `plan-execution.ts`, `plan-signals.ts`, `plan-outcome.ts`, `plan-receipt.ts`, `record-execution.ts`, `record-outcome.ts`, `record-signals.ts`; proposed `record-preparation.ts`, `claim-records.ts`, `claim-history.ts` (verified claim/target operations); shared pure claim planners/link validation; `runtime-records.ts` only for shared exported types, `runtime-codecs.ts`, `plan-runtime.ts`, `runtime-history.ts`; `testing/memory-stores.ts`.
- SQLite: `run-store.ts`, `read-executions.ts`, proposed `read-history.ts`, `row-codecs.ts`, `read-signals.ts`, `read-outcomes.ts`, `read-runtime.ts`, `runtime-store.ts`, `schema.ts`, `format.ts`, new0003 pair and bootstrap/compatibility tests.
- Product policy: exact new Burokrat selection/portable type and WBS verified-helper/projection consumers in `apps/twilight-structure/twilight-dash/eslint.product.mjs`, plus existing effective-policy tests. No `agents/**`/`runs/**` broad alias exception.

Keep `createManifest()` storage fixtures generic. Add accepted binding+prompt fixture and real retained RuntimeState/ClaimReceipt artifacts for execution. Split admission-only helper from prepared/claimed/turn-pending helpers; helpers must traverse actual provider and verified APIs. With no recovery events, expected attempt revisions are admission0, preparation1, locator2, claim-stage3, claim-acceptance4, turn-stage5, turn-observation6; initial run revision is one higher after admission. Scope revisions advance on authority and claim events only; turn-stage checks scope revision but does not increment it. Avoid spreading hard-coded revision arithmetic through tests: retain snapshots/current-guard helpers, while a small dedicated transition test asserts exact increments.

Update shared execution/edge/command, outcomes/collisions, signals/edges, receipts, verified operations/signals contracts and SQLite corruption/race/reopen/abort fixtures. Old claim-only completion cases now build a real turn intent; locator-free continuation expectations become same-session/claim expectations. Claimed retry cases assert refusal pending the future exact release protocol; pre-claim proven-absent retry remains covered. Preserve every existing invariant test purpose through the new prerequisites; do not keep an old public dispatch path just to preserve setup code.

New proof focus: each required ordering predecessor, full locator/pin/target mismatch, unknown/lost state artifacts, projection-versus-actual-receipt mismatch, one-sided scope/attempt aborts, pending refusal/404 not clearing, original paired replies after takeover, old attachment preventing new turn, reattachment preserving unresolved pending turn, decision consumption preserving same session/claim, not_started key immutability, full TurnReply round trips, missing/reordered events, changed original reply envelopes and read-only old-format rejection. Actual guarded production-path faults and observed failures belong in implementation verify.md; this appendix claims none.

The later host must still prove preparation COMMIT -> open without execution -> complete locator COMMIT -> exact claim stage/send/acceptance -> turn-intent COMMIT -> turn against real durable composition. Static state/API design, capable fakes at a port, and the current all-unsupported API-model adapter do not establish that production ordering or recovery capability.

## Replay and attachment clarifications

For every coupled mutation the exact order is: snapshot submission; enter the provider transaction; validate current live owner; audit retained target/history integrity; locate the store-wide local executionCommandId; compare family, complete immutable payload, run/attempt and scope target; return its original paired acknowledgement if identical; only a genuinely fresh command proceeds to scope/run/attempt revision checks and construction. A retry's current guard ownership is authorization to read/replay the retained command, not a replacement for its recorded intent.localOwner. Even when the new owner supplies its own epoch, old scope/run/attempt revisions and an old exact intent, duplicate staging returns the original RuntimeIntent.localOwner/stagedRevision and original Attempt reply unchanged. Acceptance similarly returns original acceptedRevision/ClaimBinding/Attempt. No fresh ownership observations are copied into these original acknowledgements. Changed guard scope is a target conflict; changed expected revisions alone do not alter immutable identity.

A local ID already used by stage cannot be reused for acceptance, ordinary execution or turn staging. Stage's wire runtime commandId must be globally unused for a fresh stage and receives exactly one local stage association. Acceptance uses a different local ID but names the identical wire command/RuntimeIntent and receives exactly one local acceptance association. An acceptance whose wire command was staged by another attempt refuses; a second new local acceptance ID for an already associated acceptance refuses even if evidence matches. Exact replay uses the retained original local ID. Cross-scope wire reuse conflicts independently of local command uniqueness. These association checks precede any insertion/counter/revision change.

Fresh session_prepared records the owner provenance of the opened preparation, which must equal PreparationIntent.owner; it does not relabel the session as belonging to whichever owner persisted a late reply. A current owner may therefore retain a late old-owner opened locator, but the resulting Attachment(opened, old owner) blocks stageTurn. If preparation lookup discovers a locator after a crash, that discovery alone is not an owning live attachment: the later host must obtain supported resume evidence and record a current-owner reattachment before another turn. Current-owner reattachment provenance is visible in Located1 in the current checkpoint and retained in its original execution reply. Newly acquiring a scope grant does not change that Attachment.

An old stageTurn duplicate is likewise historical acknowledgement only. It is not a fresh permission to call turn under the new owner. The eventual host must inspect the current checkpoint, local ownership, current scope grant and supported attachment/turn-recovery evidence before choosing an external action. Exact recovery of an old pending turn must preserve its original immutable request/owner and requires the backend's actual deduplication/reconciliation support; it is not implemented by the history task. New post-takeover turns use fresh current-owner requests only after the old turn's uncertainty is settled and the exact session is reattached.

## File responsibilities and phase boundaries

Task1 extracts shared values without changing Attempt1, SQL or RunStore. The reusable
portable codec exports are PreparationCodec, ExecutorLocatorCodec, TurnRequestCodec,
TurnIdentityCodec, UsageCodec and TurnReplyCodec. Snapshot functions retain their existing
public signatures; snapshotTurnReply accepts unknown. ActivityDispatchError is the same
constructor through the live facade and portable owner. No aggregate import enters the
portable owner, even through a re-export. Existing exact Burokrat type consumption moves
to agents/execution-records.ts with one exact policy admission.

Task2 uses execution-records/codecs for local Attempt2, command/ack and checkpoint values;
claim-records owns target/preparation/claim values, plan-claims owns pure coupled claim/turn
rules, validate-history owns pure joined event integrity, record-preparation owns verified
manifest/target preparation, and claim-history owns verified target staging, claim acceptance
and execution-history reads. Reuse one receipt-byte verifier in runtime-history; moving
that private verification to a focused runtime-receipt.ts owner is permitted if needed to
avoid a back-edge, preserving its existing schema and matcher semantics.

All other ownership follows section10. A necessary caller outside its exact inventory must
be named with its actual compiler/test evidence before editing. No general JSON/freezing
framework, raw SQL callback API, second mutable current state or second task runner.

Task1 is independently reviewable as a codec prerequisite. Task2's internal slices are one
coherent provider change; no half-format, unimplemented method or temporary legacy path
counts as complete. The whole phase then needs independent final review. Final cohesive
branch review, printed-SHA canonical host gate and applicable CI remain separate required
acceptance; the old3fdc gate and failed browser runs do not verify these changes.

## Independent scope context for historical reconstruction

A grantCommandId alone cannot identify which scope state an attempt observed. Each fresh
scoped operation therefore retains ExecutionRecord1.context.scopeRevision from its locked
provider view after checking expectedScopeRevision. Ordinary execution records use explicit
null. The record column is independent of the generated reply/current Attempt; history
returns version, original command, context and original reply. No extra SQL table, caller
input, TurnIntent field or global sequencer is introduced.

Context is provider-owned and excluded from caller retry identity. Exact replay under current
ownership returns the original acknowledgement/context before stale revision checks. It must
never compare or restamp the retained context against today's expectedScopeRevision. Fresh
commands capture today's actual locked revision; they cannot borrow an older context.

The pure joined audit reconstructs a complete consecutive scope prefix at that retained
revision. A turn uses command.request.owner and the latest accepted authority acquisition
at the prefix; that acquisition must have matching immutable localOwner and its command ID
must equal the derived TurnIntent.grantCommandId. Do not search backward past a newer accepted
acquisition to find an older matching grant. The prefix must have no pending command. Today's
RuntimeScopeSnapshot.grant is not historical input. Reconstruct the complete expected paired
reply using that prefix and independently folded attempt predecessor, then compare it.

Claim stage context r requires its independent runtime intent stagedRevision=r+1; claim
acceptance context r requires its independent runtime acceptance acceptedRevision=r+1 and
the exact pending intent. Stage provenance comes from the independent runtime intent row,
not the copied acknowledgement. RuntimeAcceptance1 has no accepting-owner field; do not
invent an audit promise about who recorded a late acceptance.

A turn's context cannot precede its ClaimBinding.acceptance.acceptedRevision. While folding
an attempt, derive a scope lower bound from each coupled claim event's resulting revision
and each turn's observed revision. Later scoped events cannot observe below that bound.
Repeated turn stages may observe the same revision because they do not increment scope.
This bound is computed during validation, not separately persisted mutable state.

Tests must distinguish two same-epoch accepted grants, a pending scope prefix, an old turn
read after later scope advancement/takeover, a cut before claim acceptance, and a continuation
whose cut moves backward. Changing only the original reply/current projection to an older
same-epoch grant must fail against the retained independent record context. Prove these
through actual provider reads/reopen and targeted guard-removal faults.

This establishes live current-scope checks and consistency of retained original replies with
their independently retained context and causal links. Coherently rewriting record context,
reply, projections and every contradictory independent fact can describe another valid
interleaving; no wall-clock chronology or tamper-proof history is claimed. Complete historical
lease ownership/expiry is also not independently retained. Existing latest-owner label and
nondecreasing staged-epoch checks remain; old source provenance is not relabeled as current.
