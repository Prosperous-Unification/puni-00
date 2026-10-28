# Trusted-value recovery and atomic historical cuts

Approved for implementation, tests and review on 2026-10-28; architectural main merge remains held. [Intent](recovery-intent.md) and [ADR 0064](../../../docs/adr/0064-uncertain-runtime-requests-use-journaled-recovery.md) own the selected scope and trade-offs.

## Existing boundary

At baseline bb14bb1cf3afc0559e4d0864374e11c652751751, ordinary senders stage once and lookup duplicates; current pending/history guards remain. Receiver `runtime-authority.ts:80–164` plus SQLite `runtime-command.ts:209–235` already supply admitted exact replay/lookup and monotone CAS. Future expected generations are admissible (`runs/plan-runtime.ts:239–305`); the bounded model supplies no production proof.

Crucial precedent: `claim-history.acceptClaimReceipt` reads actual receipt bytes through verifyRuntimeReceipt, derives receiver claimId/actorId/basisAfter, and submits ClaimAcceptCommand to trusted synchronous persistence. R2 follows that pattern. An opaque ArtifactRef is never parsed by a RunStore transaction.

## Exact proposed value surface

All values are detached readonly records. Version1 applies to new envelopes; existing public RuntimeState, AuthorityReceipt, ClaimReceipt, ClaimAcceptCommand/Ack, RuntimeIntent and ArtifactRef keep their meanings. IDs are nonempty; new recovery/wire/local acceptance-command identities obey their appropriate global command uniqueness checks. Existing run/session IDs need not differ.

```ts
type AuthorityTarget = { kind: 'authority'; original: RuntimeIntent };
type ClaimTarget = {
  kind: 'claim';
  original: RuntimeIntent;
  runId: string;
  attemptId: string;
  stageCommandId: string;
  acceptanceCommandId: string;
};
type Target = AuthorityTarget | ClaimTarget;
type AuthorityGuard = RuntimeGuard & { expectedRecoveryRevision: number };
type ClaimGuard = ScopedAttemptGuard & { expectedRecoveryRevision: number };
type Intent<T extends Target = Target> = {
  version: 1;
  recoveryId: string;
  target: T;
  begunScopeRevision: number;
  resolver: Pick<Ownership, 'ownerId' | 'epoch'>;
};
type Context =
  | { kind: 'initial_state'; recoveryId: string }
  | {
      kind: 'fence_reply';
      recoveryId: string;
      ordinal: number;
      requestDigest: string;
      stagedRevision: number;
    }
  | {
      kind: 'original_lookup';
      recoveryId: string;
      ordinal: number;
      observationRevision: number;
      fenceExchange: ArtifactRef;
      fenceReceipt: ArtifactRef;
    }
  | {
      kind: 'supersession_state';
      recoveryId: string;
      previousOrdinal: number;
      previousRequestDigest: string;
    }
  | {
      kind: 'supersession_lookup';
      recoveryId: string;
      previousOrdinal: number;
      stateExchange: ArtifactRef;
    };
type Exchange = {
  version: 1;
  context: Context;
  scope: RuntimeScope;
  ledgerId: string;
  request:
    | { kind: 'state' }
    | { kind: 'lookup'; commandId: string }
    | { kind: 'authority'; canonicalRequest: string };
  status: number;
  body: ArtifactRef;
};
type ArtifactValue<T> = { artifact: ArtifactRef; value: T };
type ExchangeValue<T> = { envelope: ArtifactValue<Exchange>; body: ArtifactValue<T> };
type Absent = { error: 'runtime_receipt_not_found' };
type Conflict = { error: 'runtime_generation_conflict' };
type Basis =
  | { kind: 'initial'; state: ExchangeValue<RuntimeState> }
  | {
      kind: 'superseding';
      previousOrdinal: number;
      state: ExchangeValue<RuntimeState>;
      lookup: ExchangeValue<Absent>;
    };
type Fence = {
  version: 1;
  recoveryId: string;
  ordinal: number;
  canonicalRequest: string;
  requestDigest: string;
  owner: Pick<Ownership, 'ownerId' | 'epoch'>;
  stagedRevision: number;
  basis: Basis;
};
type FenceInput = { fence: Fence };
type FenceReplyInput =
  | { kind: 'accepted'; fence: Fence; reply: ExchangeValue<AuthorityReceipt> }
  | { kind: 'generation_conflict'; fence: Fence; reply: ExchangeValue<Conflict> };
type Observation = FenceReplyInput & { version: 1; observedRevision: number };
type AcceptedFence = { fence: Fence; observation: Extract<Observation, { kind: 'accepted' }> };
type AuthorityDecision =
  | { kind: 'accepted'; lookup: ExchangeValue<AuthorityReceipt> }
  | { kind: 'fenced_nonaccepted'; lookup: ExchangeValue<Absent> };
type ClaimDecision =
  | { kind: 'accepted'; lookup: ExchangeValue<ClaimReceipt>; command: ClaimAcceptCommand }
  | { kind: 'fenced_nonaccepted'; lookup: ExchangeValue<Absent> };
type BeginCall =
  | { kind: 'authority'; guard: AuthorityGuard; intent: Intent<AuthorityTarget> }
  | { kind: 'claim'; guard: ClaimGuard; intent: Intent<ClaimTarget> };
type Call<P> =
  | { kind: 'authority'; guard: AuthorityGuard; recoveryId: string; input: P }
  | { kind: 'claim'; guard: ClaimGuard; recoveryId: string; input: P };
type ResolveCall =
  | {
      kind: 'authority';
      guard: AuthorityGuard;
      recoveryId: string;
      fence: AcceptedFence;
      decision: AuthorityDecision;
    }
  | {
      kind: 'claim';
      guard: ClaimGuard;
      recoveryId: string;
      fence: AcceptedFence;
      decision: ClaimDecision;
    };
```

Absent/Conflict are the existing public HTTP bodies, validated by their existing response schemas, not new receiver operations. ArtifactValue is an explicit trusted value/reference pair, not a proof brand. A direct malicious caller could fabricate it; trusted-port admission follows today's claim-acceptance boundary. Helpers and verified historical readers must independently read the referenced bytes. Persistence receives no IO capability and does not pretend to authenticate pairs.

```ts
beginRecovery(call:BeginCall):Promise<StoreReply<RecoveryHistory>>;
stageRecoveryFence(call:Call<FenceInput>):Promise<StoreReply<Fence>>;
recordRecoveryFence(call:Call<FenceReplyInput>):Promise<StoreReply<Observation>>;
resolveRecovery(call:ResolveCall):Promise<StoreReply<Closure>>;
```

Every method rechecks call.kind against retained target.kind; claim calls match guard runId/attemptId/scope to the retained stage/session, authority calls use only RuntimeGuard. Types do not replace locked correspondence checks. Fresh intent/fence provenance must equal current guard owner; historical replay retains original provenance.

RecoveryHistory is exactly `{version:1,intent:Intent,revision:number,fences:readonly Fence[],observations:readonly Observation[],closure:Closure|null}`. Hold is the discriminated union of recovery_hold/cause claim_nonaccepted/checkpoint claiming and recovery_hold/cause claim_accepted_fenced/checkpoint ready, each with closureId=recoveryId. Attempt3 is `Omit<Attempt2,'version'|'state'> & {version:3,state:Hold}`. No old Attempt2 decoder gains a state.

Closure is `{version:1,recoveryId:string,original:RuntimeIntent,fence:AcceptedFence,decision:AuthorityDecision|ClaimDecision,resolvedRevision:number,resolver:Pick<Ownership,'ownerId'|'epoch'>,scopeBefore:number,scopeAfter:number,originalReply:null|{kind:'authority',acceptance:RuntimeAcceptance}|{kind:'claim',command:ClaimAcceptCommand,ack:ClaimAcceptAck},attemptReply:Attempt3|null}`. Provider derives this union's target/decision/reply correspondence, rejecting claim command/projection on authority targets or missing command on accepted claims. Decisions retain complete typed exchanges; generated IDs come only from actual ClaimReceipt.

## Verifier → detached input → locked planning

Helper snapshots guard/journal before awaits. It retains/reads actual envelope and response bytes, verifies media type/digest/fatal UTF8, applies public response schema, and checks captured request/status/body/context correspondence. For receipts it uses verifyRuntimeReceipt against exact original/fence canonical bytes. It produces ExchangeValue pairs, with envelope.value.body exactly body.artifact. State values come from the actual public RuntimeState parser; no default authority is invented.

For accepted claims, it derives the complete existing ClaimProjection from receipt.acceptance.claim.claimId, receipt.actorId and receipt.acceptance.basisAfter, and generates ClaimAcceptCommand using the journal's acceptanceCommandId, original RuntimeIntent and lookup.body.artifact. This is the same value flow as acceptClaimReceipt. Absent input contains the validated actual404 body and purpose-bound request envelope, not a boolean certificate.

Provider clones typed inputs before queueing. Inside the write transaction it owns current-owner/clock fencing, complete catalog/capacity audits, immutable identity/replay, current revisions, active interlocks and exact historical links. Pure comparisons check envelope body reference equals supplied body reference; context names the retained recovery/fence/committed observation; accepted fence object equals retained observation; request/scope/ledger/command/digest match stored bytes; canonical increment matches typed authority receipt; decoded state generation permits the staged CAS; and ClaimAcceptCommand projection equals the supplied ClaimReceipt projection. It can perform all those comparisons without reading artifacts. Byte integrity, external public-schema parsing and actual transport capture occurred in the verifier, not SQL.

Persist the complete trusted state/exchange/receipt projections above alongside refs. New synchronous trusted-record decoders must validate stored shapes without invoking asynchronous public response validation inside SQL; missing fields throw, never cast/default. Raw folds validate structural associations; verified readers reread actual bytes through public schema validation and rederive every stored value/projection. A coherent same-ref value rewrite must fail verified read. This is the existing two-phase integrity boundary, not independent transport authentication or current authority.

## Complete scope reads and interlock

New pinned Snapshot2 is Snapshot1 pinned fields with version2 plus recoveries:readonly RecoveryHistory[], activeRecoveryId:string|null and generationFloor:number|null. Uninitialized2 has empty recoveries/null active/floor. New-format providers always return2; readRuntimeScope returns Snapshot1|Snapshot2. There is no readRecovery port. Verified readRuntimeHistory returns that union only after verifying all value/artifact pairs and barriers. Existing readExecutionHistory/readRun gain History2/Snapshot3 alternatives: unchanged old fields, version2/3, Attempt2|Attempt3 attempt(s), and recoveries:readonly Closure[]. Original Attempt2 reply rows remain exact.

Mandatory recovery witnesses flow through both adapters, runtime-history, schema reopen, scope reconstruction/audit/inspect, validate-history.scopePrefix, ClaimFacts/latestAuthority, authority winner, build-claim-request, dispatch-turn, verified execution history and lifecycle/contract fixtures. No default empty witness collection hides a caller. Latest-authority/claim/turn consumers reject an acquisition preceding the barrier, even if an old acceptance remains retained.

Begin locks/audits/replays before fresh revision/pending/stage checks, inserts one active journal and changes no scope revision. Acceptance first means begin refuses; begin first means fresh recordRuntimeAcceptance/recordClaimAcceptance refuses after existing operation-specific immutable replay but before fresh planning. Installed pending/state guards block fresh stageRuntimeRequest/stageClaim/stageTurn. Target recordExecution permits exact replay or recovery_required/unresolved preserving checkpoint/capacity; attachment/turn/settlement changes, commitOutcome/reconcileReceipt/consumeDecision interlock. Safe existing decision receipt/evidence retention cannot change target checkpoint/capacity; resolution must supply any changed run revision in a new explicit invocation. Submitted owner/run/attempt/scope guards remain fixed across awaits; recovery revision advances only through the invocation's own exact acknowledgements. Attempt3 blocks fresh generic mutations while legitimate stored execution replay remains. Unrelated work, ownership renewal/acquisition and artifact retention retain installed behavior. All inherited checks stay installed.

## Fence delivery and ordered evidence

Journal starts revision0; each fresh stage/observation/closure adds1; replay adds0. Additive collections retain exact operation/ordinal/scope keys, counts and bundle identity. One admitted observation per fence is immutable. Three fence identities and three POSTs per invocation bound convergence; later invocations resume identical attempts after pre-send/lost-reply crashes. Only the new recovery helper gets retransmission permission; ordinary duplicates remain lookup-only.

Initial state h must meet original nonnull threshold g; initialization defeats null. Accepted f=h+1 must exceed g. Supersession requires later state above the previous expected generation followed by exact prior-fence absence, bound by its stateExchange context. Below-threshold state, exhaustion, unavailable evidence, authorization/project/ledger refusal and overflow remain unresolved; corrupt trusted state throws.

Original lookup context is created only after awaited verified recordRecoveryFence commit and names its ordinal, observedRevision, envelope and receipt refs. The helper then performs and captures a new lookup; it accepts no caller-supplied body/exchange for capture. Supersession similarly captures state before its dependent lookup. Typed context links reject pre-fence404 envelopes; they alone prove neither transport authenticity nor chronology. Production helper ordering/trusted transport are explicit proof boundaries.

## One pure plan, atomic publish, historical cuts

Full published-catalog invariant: current active index identifies exactly one closure-null journal whose original is the **current** pending operation; current target checkpoint/capacity matches its stage. A closed journal has no active index and its reciprocal closure events. This invariant is never applied to a historical scope prefix. Recovery revision is independent of scope revision; pending=null at virtual n+1 does not establish historical absence of an active journal.

Private prefix reconstruction returns `ScopeView2 = Omit<Extract<Snapshot2,{kind:'pinned'}>,'activeRecoveryId'|'recoveries'>`, with **no activeRecoveryId**. It takes full witnesses separately for associations, but applies a barrier only at scopeAfter. A future closure may validate its original acceptance at n+1 without clearing grant/raising floor early. Public current Snapshot2 adds full histories/current active index only after complete catalog validation.

resolveRecovery plans from one valid locked predecessor: current resolver ownership; full catalog/pending/target associations; exact cuts; immutable typed inputs and actual receipt-derived values. It returns all original acceptance/execution rows, barrier, hold, closure, final revisions/counts/index changes. It invokes neither public persistence methods nor readHistory between writes. Apply the complete plan directly, then commit. Late failure rolls back all writes through existing rollback behavior; no invalid half-written state is audited as a published catalog.

For claims the new pure recovery planner uses the actual current attempt predecessor, claiming checkpoint (direct/reconciling/unresolved), exact stage/session/pending intent and historical scope cut n. It runs existing claimAcceptTransition consequences with the generated ClaimAcceptCommand, not operational planClaimAcceptance under fabricated old Ownership. Independent current resolver checks authorize this transaction. Accepted reply retains real binding/ready Attempt2; the following hold retains that exact ready checkpoint. Nonaccepted hold retains claiming unchanged. Stage/fence epochs cannot regress; resolver epoch cannot precede them. Old intent/attachment provenance never changes.

| Cut | Accepted authority                                                    | Accepted claim                                                         | Nonaccepted claim                                                     |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| n   | original pending; prior floor b/grant G; no attempt                   | original pending; floor g/grant G; claiming/wrapper Attempt2, reserved | same claim predecessor                                                |
| n+1 | pending null; floor g+1; grant from original iff its epoch is current | pending null; floor g; original ready/binding Attempt2, reserved       | barrier f; pending null; grant null; claiming Hold Attempt3, reserved |
| n+2 | barrier f; pending null; grant null                                   | barrier f; pending null; grant null; ready Hold Attempt3, reserved     | not used                                                              |

Here g is original expected generation (authority) or guarded generation (claim), f is the accepted fence; null authority expectation yields accepted generation1. For accepted authority require f strictly greater than its decoded accepted generation as well as g: two distinct acquisitions cannot share a generation. G follows existing current-epoch projection; with old epoch1/new resolver2 it is null, including the original authority's virtual n+1 grant. Same-epoch fixtures must also exercise the temporary historical grant. Barriers are historical evidence, never current permission. Accepted claims advance attempt/run twice, absent claims once; authority changes no attempt. Only n and the complete final cut are externally published.

Concrete positive fixtures: authority b=1/original expects2/actual accepted3/fence4 yields floor1→3→4 and same-epoch grant1→3→null (new-resolver epoch2: null→null→null). Claim authority1/fence2 yields floor1→1→2, same-epoch grant1→1→null, and claiming2→ready2 with the **actual returned** claimId/basis→ready-hold3, reserved throughout. New-resolver epoch2 keeps all grant projections null without relabeling the old attachment. Absent claim authority1/fence2 yields floor1→2 and claiming2→claiming-hold3 with no binding/claimId invented. Full current active index is absent after closure; prefix views deliberately make no journal-activity claim.

## Adopted compatibility and rollout

The owner approved the recommended R2 choices on 2026-10-28 for implementation, tests and review. Preserve and explicitly upgrade genuine populated format3 stores, retain every old record and original acknowledgement, and keep ordinary open free of migration or repair. The approved authority/claim successor uses the new additive0004-runtime-recovery migration; earlier unaccepted outcome-format proposals reserve no predecessor or migration number.

Authority and claim logical recovery ships first. Complete write/outbox recovery and physical continuation remain required subsequent packets, with their own migration/read-contract review. This ordering gives existing uncertain authority/claim requests a supported recovery path sooner while accepting the cost of an intermediate storage version.

Keep the documented legacy artifact-retention and monotone refusal-clock exceptions. All execution, ownership and history mutations must encounter the changed complete bundle identity under the existing transaction boundary. Prove actual already-open, queued and BUSY predecessor behavior; local close/drain is not host-wide shutdown. Used-history reversal requires preservation tooling; unused successor down restores the exact populated predecessor without deleting old attempts or acknowledgements.

Exhausting the bounded per-call recovery POST budget throws a correlated exhaustion error while the retained journal remains unresolved and capacity stays reserved. Ordinary duplicates remain lookup-only. Artifact references and typed links establish neither transport authenticity nor physical quiescence.

Architectural main merge and production remain held. Implementation and proof work are recorded in [recovery verification](recovery-verify.md); no proposed behavior is credited before its real tests and faults run.

## Remaining full-goal requirements

V1 rejects write targets. Later write recovery must retain complete coupled acceptance/receipt/outbox acknowledgement or an explicit nonaccepted unsendable completion/outbox obligation with unchanged capacity status. Failure/release mapping and replacement/rebase/operator transitions remain unaccepted. Physical lookup/effect/quiescence and ownership transfer are prerequisites for continuation/replacement; producer budget/business lifecycle and S7a remain separate. No engine/credential/provider/prod selection or implementation readiness is claimed.
