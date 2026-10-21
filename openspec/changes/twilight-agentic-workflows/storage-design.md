# S0 storage foundation

This supplement makes tasks 6a.1–6a.2 independently reviewable. The binding requirements
remain [run coordination](specs/twilight/run-coordination/spec.md); the ordered execution
plan is [storage tasks](storage-tasks.md). This packet supplies persistence primitives and
contract proofs. It does not supply a coordinator or make deployment/dogfood eligible.

## Scope and ownership

All production files belong under `apps/twilight-structure/twilight-dash/cli/src/runs/`.
Keep the run store separate from Dash's existing admission authority and activation
observation store. Existing `authority/authority-store.ts`, its `.db.test.ts`,
`authority/generations.ts` and `clock.ts` provide patterns for explicit bootstrap, trusted
clocks, fencing, failure classification and process races. Do not extract or modify those
subsystems as part of S0, and do not expose their generic transaction callbacks here.

Local execution capacity is the configured number of potentially live attempts across all
runs in one RunStore. It is not a tenant quota, billing limit, WBS resource fit or compute
provider entitlement. `ArtifactStore` retains immutable bytes; it does not provision
compute. The coordinator's existing/future credential port supplies credentials to the
WBS bridge; this store accepts only credential references and attributed identities, never
credential values. Authentication, credential issuance, onboarding, activation, compute
providers, tenant limits, cross-project dependencies and CTT changes are outside this packet.

Current WBS `setProgress` and `releaseWorkItem` shapes do not provide all exact-claim/run
preconditions required by the accepted coordinator spec. S0 can retain the desired authority
and refuse mismatched local receipts; it cannot create external fencing. Task 5/6a.5 must
prove the guarded bridge before any coordinator launches real work. Never silently lower
these preconditions to the existing weaker request shapes.

## Records and identity

Use readonly records and async semantic methods so future providers need not emulate a
synchronous SQLite connection. `records.ts` owns portable v1 shapes; `record-codecs.ts`
validates their serialized boundary with ArkType and `@shared/validation`. Unknown record
versions, unknown discriminants, missing trusted records and malformed persisted values
throw. Adapter schema versions are independent and never enter these records.

The following aliases are distinct branded strings constructed by boundary decoders:
`StoreId`, `OrganizationId`, `RunId`, `AttemptId`, `OwnerId`, `ManifestDigest`, `ArtifactDigest`, `OperationKey`,
`CommandId`, `DecisionId`, `CorrelationKey`, `ProjectId`, `WorkItemId`, `ClaimId`, `PersonId`,
`AgentRunId`, `OccurrenceId`. Digests are lowercase SHA-256; IDs are nonempty bounded strings.
`Revision`, `Epoch`, `Ordinal` and epoch-millisecond `Timestamp` are nonnegative safe integers;
epochs and attempt ordinals start at one. Increment overflow throws. No ambient clock read:
adapters consume Dash's existing `WallClock`, supplied explicitly at construction.

| Record             | Exact fields in addition to `version: 1`                                                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ownership`        | `storeId: StoreId`, `organizationId: OrganizationId`, `ownerId: OwnerId`, `epoch: Epoch`, `expiresAt: Timestamp`                                                                                                                                           |
| `Run`              | `runId: RunId`, `revision: Revision`, `projectId: ProjectId`, `workItemId: WorkItemId`, `manifestDigest: ManifestDigest`, `maxAttempts: number`                                                                                                            |
| `ActivityIdentity` | `runId: RunId`, `occurrenceId: OccurrenceId`, `operationKey: OperationKey`                                                                                                                                                                                 |
| `ClaimAuthority`   | `claimId: ClaimId`, `personId: PersonId`, `agentRunId: AgentRunId`, `runId: RunId`, `attemptId: AttemptId`, `projectId: ProjectId`, `workItemId: WorkItemId`, `occurrenceId: OccurrenceId`                                                                 |
| `ArtifactRef`      | `digest: ArtifactDigest`, `byteLength: number`, `mediaType: string`, `retention: 'retain'`                                                                                                                                                                 |
| `Manifest`         | `digest: ManifestDigest`, `bindingVersion: number`, `canonicalBinding: string`, `prompts: readonly ArtifactRef[]`, `toolPolicies: readonly ArtifactRef[]`, `executorVersions: Readonly<Record<string, string>>`, `credentialReferences: readonly string[]` |
| `Locator`          | `workerId: string`, `sessionId: string`, `operationKey: OperationKey`                                                                                                                                                                                      |
| `Quiescence`       | `operationKey: OperationKey`, `observedAt: Timestamp`, `evidence: ArtifactRef`, `effect: 'absent' \| 'succeeded' \| 'failed' \| 'unknown'`                                                                                                                 |
| `HumanWait`        | `correlationKey: CorrelationKey`, `prompt: ArtifactRef`, `choices: readonly string[]`                                                                                                                                                                      |
| `Decision`         | `decisionId: DecisionId`, `attemptId: AttemptId`, `correlationKey: CorrelationKey`, `choice: string`, `actorId: PersonId`, `authorizationEvidence: ArtifactRef`                                                                                            |
| `AttemptOutcome`   | `kind: 'succeeded' \| 'failed' \| 'cancelled'`, `artifacts: readonly ArtifactRef[]`, `summary: string`                                                                                                                                                     |
| `ProgressIntent`   | `commandId: CommandId`, `authority: ClaimAuthority`, `expectedWbsRevision: string`, `outcome: AttemptOutcome`, `commandDigest: ArtifactDigest`                                                                                                             |
| `CommandReceipt`   | `commandId: CommandId`, `commandDigest: ArtifactDigest`, `authority: ClaimAuthority`, `acceptedWbsRevision: string`, `evidence: ArtifactRef`                                                                                                               |

`Manifest.digest` covers the canonical UTF-8 serialization of all manifest fields except
`digest`; `canonicalBinding` is itself canonical JSON, including the complete binding
content. `commandDigest` covers all intent fields except itself. Use the repository's
existing canonical JSON/hash helper after checking its accepted value domain. Admission
never accepts a digest alone. V1 retains all artifacts indefinitely: no TTL, delete or GC
API. This avoids inventing a distributed pin/delete protocol before a retention policy is
needed. Byte mutation, missing bytes or mismatched hashes on a later read throw.

`Attempt` contains `version`, `attemptId`, `identity: ActivityIdentity`, `ordinal`,
`revision`, `admittedEpoch`, `state: AttemptState`, and `holdsCapacity: boolean`.
`AttemptState` is a discriminated union with the following exact payloads:

| `kind`                     | Payload                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `queued`                   | `claim: ClaimAuthority \| null`                                                                         |
| `running`                  | `claim: ClaimAuthority`, `locator: Locator`                                                             |
| `reconciling`              | `claim: ClaimAuthority \| null`, `locator: Locator \| null`, `reason: string`                           |
| `unresolved`               | `claim: ClaimAuthority \| null`, `locator: Locator \| null`, `reason: string`, `evidence: ArtifactRef`  |
| `interrupted`              | `claim: ClaimAuthority \| null`, `quiescence: Quiescence`                                               |
| `waiting_for_person`       | `claim: ClaimAuthority`, `wait: HumanWait`, `quiescence: Quiescence`                                    |
| `outcome_pending_progress` | `claim: ClaimAuthority`, `outcome: AttemptOutcome`, `commandId: CommandId`, `quiescence: Quiescence`    |
| `terminal`                 | `claim: ClaimAuthority`, `outcome: AttemptOutcome`, `receipt: CommandReceipt`, `quiescence: Quiescence` |

Null is permitted only in the explicitly pre-claim/pre-launch recovery states above. It
means no locator/receipt has been recorded, never proof that an external call had no effect.
A successful worker turn alone cannot construct `AttemptOutcome`; the later coordinator
validates business outputs. S0 records that validated outcome without inventing a validator.

`RunSnapshot` contains `version: 1`, `run: Run`, `attempts: readonly Attempt[]`,
`pendingIntents: readonly ProgressIntent[]`, `receipts: readonly CommandReceipt[]`,
`decisions: readonly Decision[]`, `consumedDecisionIds: readonly DecisionId[]` and
`capacity: { limit: number; reserved: number }`. Read it consistently with the run revision
and the global capacity count. Every effective mutation of a run increments its revision;
attempt mutations also increment the affected attempt revision. Exact duplicates change
neither. Receipt presence in a terminal state, rather than local effect success, supplies
accepted facts to a future CTT adapter.

## Semantic ports

```ts
type StoreReply<T> =
  | { kind: 'applied'; value: T }
  | { kind: 'duplicate'; value: T }
  | { kind: 'refused'; reason: StoreRefusal };

type StoreRefusal =
  | 'owner_busy'
  | 'owner_stale'
  | 'revision_conflict'
  | 'identity_conflict'
  | 'capacity_full'
  | 'retry_exhausted'
  | 'attempt_active'
  | 'state_conflict'
  | 'authority_conflict'
  | 'decision_conflict';

interface RunGuard {
  readonly ownership: Ownership;
  readonly runId: RunId;
  readonly expectedRevision: Revision;
}
interface AttemptGuard extends RunGuard {
  readonly attemptId: AttemptId;
  readonly expectedAttemptRevision: Revision;
}
interface RunStore {
  acquireOwnership(ownerId: OwnerId, expectedEpoch: Epoch): Promise<StoreReply<Ownership>>;
  renewOwnership(ownership: Ownership): Promise<StoreReply<Ownership>>;
  retainManifest(ownership: Ownership, manifest: Manifest): Promise<StoreReply<Manifest>>;
  readManifest(digest: ManifestDigest): Promise<Manifest>;
  createRun(ownership: Ownership, run: Run): Promise<StoreReply<Run>>;
  readRun(runId: RunId): Promise<RunSnapshot>;
  admitAttempt(guard: RunGuard, admission: Admission): Promise<StoreReply<Attempt>>;
  recordExecution(guard: AttemptGuard, fact: ExecutionFact): Promise<StoreReply<Attempt>>;
  commitOutcome(guard: AttemptGuard, completion: Completion): Promise<StoreReply<Attempt>>;
  receiveDecision(ownership: Ownership, decision: Decision): Promise<StoreReply<Decision>>;
  consumeDecision(guard: AttemptGuard, decisionId: DecisionId): Promise<StoreReply<Attempt>>;
  reconcileReceipt(guard: AttemptGuard, receipt: CommandReceipt): Promise<StoreReply<Attempt>>;
}
interface ArtifactStore {
  retainArtifact(content: Uint8Array, mediaType: string): Promise<ArtifactRef>;
  readArtifact(reference: ArtifactRef): Promise<Uint8Array>;
}
interface Admission {
  readonly attemptId: AttemptId;
  readonly identity: ActivityIdentity;
  readonly ordinal: Ordinal;
}
type ExecutionFact =
  | { kind: 'claim_acquired'; claim: ClaimAuthority }
  | { kind: 'launch_recorded'; claim: ClaimAuthority; locator: Locator }
  | { kind: 'recovery_required'; reason: string }
  | { kind: 'unresolved'; reason: string; evidence: ArtifactRef }
  | { kind: 'interrupted'; quiescence: Quiescence }
  | { kind: 'waiting'; claim: ClaimAuthority; wait: HumanWait; quiescence: Quiescence };
interface Completion {
  readonly outcome: AttemptOutcome;
  readonly intent: ProgressIntent;
  readonly quiescence: Quiescence;
}
```

`recordExecution` records named facts with a closed transition table; it is not a patch or
an arbitrary status setter. `commitOutcome` is the indivisible outcome/outbox operation,
not an external API call. All expected conflicts return the union above; operational
failures (unreadability, corrupt records, exhausted database contention) throw named errors.
No connection, table, SQL fragment, filesystem path, generic transaction or arbitrary JSON
patch crosses either port. Construction and close remain provider lifecycle concerns.

## Operation rules

1. **Ownership.** One store-wide owner fences all runs and capacity. Bootstrap persists
   epoch zero with no owner. Acquisition compares the expected epoch, refuses an unexpired
   owner, then increments the epoch and sets a configured lease duration using the trusted
   clock. Renewal requires exact store/owner/epoch and a still-live lease. All mutations
   check those values and live expiry before deduplication or revision checks. Never trust
   caller-supplied `expiresAt`; compare against persisted expiry. Persist the greatest clock
   observation and throw on regression. Expiry/takeover changes no attempts or reservations.
   Read-only inspection remains available without ownership. Epoch zero can be discovered
   through provider bootstrap's returned initial ownership status; opening returns the
   current status alongside the ports, without acquiring it.
2. **Manifest/run.** Retention is insert-or-identical; a different manifest under an existing
   digest or a computed digest mismatch throws integrity failure. `createRun` requires
   revision zero, a retained manifest and positive safe-integer retry budget. Same run ID
   with different initial identity/configuration refuses. Do not re-pin existing runs in S0.
   Full binding validation and credential-value exclusion belong to task 6a.3's typed
   manifest builder; S0's JSON/hash boundary alone does not establish those properties.
3. **Admission.** In one commit, compare owner/run revision, manifest existence, operation
   identity, retry count and predecessor state; check global reserved slots; insert queued
   intent with capacity held; increment run revision. One live attempt per occurrence.
   Ordinals start at one, advance by one and cannot exceed the run's stored `maxAttempts`.
   Retry preserves the operation key. A new operation key is an explicit later repair epoch,
   unavailable here. A predecessor must be interrupted, or terminal with a failed outcome
   and confirmed receipt, with quiescence and `effect: 'absent'` or `'failed'`. Cancelled,
   unknown-effect and successful-effect predecessors never automatically retry.
4. **Execution facts.** Claim acquisition moves queued-without-claim to queued-with-claim;
   exact authority must match run/attempt/project/work item/occurrence. Launch requires that
   claim and matching operation key, then records the locator and running state. Recovery
   and unresolved transitions preserve claim/locator and held capacity. Interrupted requires
   verified quiescence; effect unknown remains unresolved. Waiting requires the exact claim,
   a nonempty unique choice set and quiescence. Quiescence must name the attempt's operation
   and retained evidence. Only its acceptance releases capacity, exactly once. A queued
   launch intent whose response was lost cannot be declared absent merely by lacking a locator.
5. **Completion.** Only claimed queued/running/reconciling/unresolved attempts can complete;
   the completion's intent authority and outcome must equal the recorded attempt and supplied
   outcome. Success requires quiescence with effect succeeded; failure/cancellation requires
   a determinate settled effect. One transaction writes outcome, intent and pending-progress
   state, increments revisions and releases held capacity. No rerun is admissible while
   progress is pending, regardless of whether the outcome succeeded, failed or was cancelled.
6. **Receipts.** Reconcile only a pending command with exact command ID, command digest and
   claim/run/attempt authority. Persist receipt, remove the pending intent and set terminal
   state atomically. Identical duplicates return duplicate even if the supplied revision is
   now old, but only after current owner validation and exact content/identity comparison.
   Conflicting duplicates refuse. An unrelated WBS revision or generic work-item progress
   read cannot prove that this command committed. The bridge must provide authenticated
   exact-command acceptance evidence; S0 proves storage matching only.
7. **Decisions.** After current-owner validation, compare an existing decision ID and its
   entire recorded content before requiring a still-waiting attempt. Thus identical redelivery
   remains idempotent after consumption or restart; changed content refuses. A new decision
   requires a persisted wait, matching correlation and allowed choice. Retain actor and
   authorization evidence. Inbox uniqueness is global by decision ID. Consume checks the exact
   wait and run/attempt revisions, atomically marks the decision consumed, reacquires capacity
   and moves the same attempt to claimed queued continuation. Capacity refusal leaves it
   unconsumed. The worker adapter must distinguish the persisted decision ID when continuing
   the existing session; it must not launch the original activity again. No second decision
   may consume the same wait. Authorization is checked before this trusted persistence port
   by the later inbox consumer; storage does not issue or validate credentials.

For all idempotent methods, an exact duplicate returns its committed value before checking
old expected revisions but after ownership and full identity equality. An ID collision with
different content refuses rather than becoming a duplicate. Persist enough immutable request
identity to recognize duplicates after state changes; do not deduplicate from state kind alone.

## Artifact boundary

`retainArtifact` computes the digest, durably retains bytes and metadata, reads them back,
checks digest/length, then returns a reference. Repetition is idempotent only for equal bytes
and metadata. Returned/read byte arrays cannot mutate stored content. `readArtifact` throws
on absence, unreadability, truncation or digest mismatch.

`recordOutcome(runStore, artifactStore, guard, completion): Promise<StoreReply<Attempt>>`
in `record-outcome.ts` reads and verifies every referenced artifact, including quiescence
evidence, before calling `commitOutcome`. A dangling or corrupted artifact therefore cannot
produce a successful outcome/outbox through the production composition boundary. The same
verification helper is used when retaining manifest prompt/policy references and accepting
wait/decision/evidence references. The coordinator cannot import an unchecked convenience
writer. Artifact writes precede run writes: a crash may leave an unreferenced retained blob,
but never justifies committing a reference to an unverified blob. No garbage collection or
replacement means a verified reference stays valid unless storage is damaged; subsequent
reads fail loudly on such damage. Out-of-process power-loss guarantees remain bounded by the
provider's documented durability contract, not demonstrated by a memory fixture.

## Pure planning and transactional adapters

Share domain rules through production `plan-ownership.ts` and `plan-admission.ts`, then
extend focused planners beside the operations added in later slices. Both adapters execute
the same planner against a consistent view and atomically apply its explicit mutation
intent. The SQLite implementation does not wrap the memory fixture and does not rewrite a
store-wide snapshot: it selects the owner/configuration, named run and relevant occurrence,
then inserts/updates only the records named by the plan while holding its transaction.

The initial admission planner has this exact surface:

```ts
interface AdmissionFacts {
  readonly ownership: Ownership;
  readonly observedAt: Timestamp;
  readonly lastObservedAt: Timestamp;
  readonly capacity: { readonly limit: number; readonly reserved: number };
  readonly run: Run;
  readonly manifest: Manifest;
  readonly attempts: readonly Attempt[];
  readonly admissions: readonly Admission[];
}
interface AdmissionChange {
  readonly attempt: Attempt;
  readonly runRevision: Revision;
  readonly reserveSlot: boolean;
}
function planAdmission(
  facts: AdmissionFacts,
  guard: RunGuard,
  admission: Admission,
): StoreReply<AdmissionChange>;
```

`attempts` and immutable `admissions` include the requested attempt-ID collision, if any,
and this run's occurrence history, not other runs' contents. A conflicting attempt ID
from another run is therefore visible. The provider supplies the persisted store-wide
reservation count in the same transaction. Applied plans reserve one slot and increment
the run revision; duplicate plans reserve none and retain revisions. The provider maps the
plan's value to its public `Attempt` response only after commit. The store's own ownership,
not the request's ownership, fills `facts.ownership`.

`planOwnership(status: OwnershipStatus, ownerId: OwnerId, expectedEpoch: Epoch,
observedAt: Timestamp, lastObservedAt: Timestamp, leaseMilliseconds: number):
StoreReply<Ownership>` handles acquisition; `planRenewal(current: Ownership,
requested: Ownership, observedAt: Timestamp, lastObservedAt: Timestamp,
leaseMilliseconds: number): StoreReply<Ownership>` handles renewal. These functions perform
no I/O and never read an ambient clock. The adapters persist the returned ownership and
clock observation within the same transaction. A typed refusal persists a validated clock
observation without changing ownership, runs, attempts or reservations: refused requests
also observed time and must not make later clock regression acceptable. Throws roll back
the transaction. Conflicts publish no partial domain mutation.
`OwnershipStatus` has the exact fields defined with provider lifecycle below.

## Providers and configuration

The memory factory is only in `runs/testing/memory-stores.ts`. It invokes the production
planners against a copied view and publishes their mutation intents only on success; clones
isolate inputs and reads. Domain transitions live in production planners, not test fixtures. Contract tests must also exercise a separate SQLite implementation, not a SQLite
wrapper around that memory fixture.

`runs/sqlite/open-stores.ts` exposes explicit `bootstrapSqliteStores(options)` and
`openSqliteStores(options)`, returning `{ runs, artifacts, ownership, close }`. Options are
`path: string`, `organizationId: OrganizationId`, `capacity: number`,
`leaseMilliseconds: number`, `clock: WallClock`,
`maxBusyAttempts: number`, `busyDelayMilliseconds: number`. Capacity and lease configuration
and organization identity are persisted at bootstrap; opening with different values refuses rather than changing
policy underneath active reservations. The persisted ownership status is
`{ storeId: StoreId; organizationId: OrganizationId; epoch: Epoch; owner: Ownership | null }`. No auto-create on open, reset-on-corruption,
unknown-version migration or default capacity. Existing state, initialization races, missing
paths and unreadability are distinct failures. Creation publishes a fully initialized store
exclusively; opening never mistakes a partially initialized file for an empty valid store.

SQLite uses its own schema version and additive migration pair under
`runs/sqlite/migrations/0001-run-store/{migration,down}.sql`. Tables cover metadata/owner,
manifest, run, attempt, held reservation, outbox, receipt, decision and immutable artifact
BLOBs. Uniqueness enforces run ID, attempt ID, occurrence/ordinal, one active occurrence,
command ID and decision ID; foreign keys keep run/manifest and outcome/intent references
consistent. Conditional mutations check revision and ownership inside `BEGIN IMMEDIATE`.
Snapshot reads use one transaction. Enable foreign keys, WAL and FULL synchronous durability;
assert the selected modes. Bounded busy retries may repeat only local database operations,
never artifact uploads, WBS requests or executor calls. A SQLite conflict must not escape as
a generic success or trigger reinitialization.

Keep schema SQL, row codecs, migrations and restart helpers inside this provider. V1 bootstrap
applies the initial migration; open only validates. Later upgrades use an explicit provider
migration command, not implicit schema changes in the core. Retain migration hashes and
paired down SQL for provider tests; no WBS database migration or deploy script changes here.

`runs/open-stores.ts` accepts only `{ provider: 'sqlite'; path; organizationId; capacity;
leaseMilliseconds; maxBusyAttempts; busyDelayMilliseconds }` plus `WallClock`, and calls
open, never bootstrap. Memory is not selectable in production configuration. One store is bound to one organization, including
all of its runs and incoming ownership tokens. Later bridge integration must verify the
credential's organization capability matches that binding before using the store. This
configuration invariant does not implement tenant authentication or authorization. The core only
receives the ports. CLI bootstrap/inspect commands remain task 6a.8.

## Evidence boundaries

Shared conformance proves semantics for memory and SQLite. SQLite additionally requires
independent-process admission races, held-lock exhaustion, crash-before-commit and
crash-after-commit reopen tests. No SQLite-only assertion can substitute for the shared
semantic contract; no memory restart claim can establish durability. A second durable
provider and paused-writer transfer remain task 6b.3.

The packet's fault matrix and exact test commands live in [storage tasks](storage-tasks.md).
No R5 proof is claimed until its production check has been bypassed or dependency damaged,
the relevant negative test observed failing, and the check restored with a passing rerun.
