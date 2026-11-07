## Context

Implementation starts at reviewed recovery/identity candidate
`c12bb0e58215de3ba0c3da98a2198773d654a29c`. Its generic completion and receipt operations
are local facts. Its conditional runtime fold accepts claims only, and its recovery hold
requires reserved capacity. Existing write requests, immutable receipt lookup and complete
write-receipt matching already belong to WBS and are consumed unchanged.

[ADR 0068](../../../docs/adr/0068-outcomes-and-runtime-writes-stage-together.md) records the
selected coupling and alternatives. The caller supplies the business outcome and ordered
commands; this design supplies durable staging, delivery and reconciliation.

## Goals / Non-Goals

**Goals:** one atomic stage, one atomic accepted closure, complete reconstructable histories,
the existing bounded recovery protocol for uncertain writes, and a preserving format5 upgrade.

**Non-Goals:** autonomous business mapping, new retry/budget/release policy, physical worker
reconciliation, replacement/rebase/operator continuation, another adapter/provider and production.

## Decisions

### Separate write records preserve generic predecessors

Add `write-records.ts`, `write-codecs.ts` and `plan-writes.ts` under Dash's `src/runs/`.
Generic `Completion2`, `ProgressIntent2`, `CommandReceipt2`, `RecordedCompletion1`,
`RecordedReceipt` and original execution/recovery envelopes keep their exact decoders and
replay behavior. No generic digest or opaque WBS revision becomes wire identity.

The new write command journal is separate from existing execution submissions. Each record
contains independent run/attempt association, the complete command, a provider-owned
pre-operation scope revision, and the immutable original acknowledgement. The command's
retry identity excludes generated context and acknowledgement. Complete history folds merge
write events with execution, consumption and recovery events by their actual revisions.

Portable shapes use existing `AttemptOutcome`, `Quiescence`, `TurnCheckpoint`,
`TargetObservation`, `RuntimeIntent`, `RuntimeAcceptance`, scalar IDs and public WBS types:

```ts
import type { WriteReceipt as ReceiverWriteReceipt } from '@wbs/contracts';

interface WriteCompletion {
  readonly version: 1;
  readonly outcome: AttemptOutcome;
  readonly quiescence: Quiescence;
}
interface WriteStageCommand {
  readonly version: 1;
  readonly kind: 'stage_write';
  readonly commandId: ExecutionCommandId;
  readonly completion: WriteCompletion;
  readonly canonicalRequest: string;
  readonly observation: TargetObservation;
}
interface WriteProjection {
  readonly version: 1;
  readonly actorId: string;
  readonly basisAfter: RuntimeBasis;
  readonly applied: ReceiverWriteReceipt['acceptance']['applied'];
}
interface WriteAcceptCommand {
  readonly version: 1;
  readonly kind: 'accept_write';
  readonly commandId: ExecutionCommandId;
  readonly stageCommandId: ExecutionCommandId;
  readonly intent: RuntimeIntent;
  readonly evidence: ArtifactRef;
  readonly projection: WriteProjection;
}
interface WriteReceipt {
  readonly version: 1;
  readonly stageCommandId: ExecutionCommandId;
  readonly acceptance: RuntimeAcceptance;
  readonly projection: WriteProjection;
}
```

The public WBS `WriteReceipt` import is aliased `ReceiverWriteReceipt`;
the `applied` field refers to that public acceptance, avoiding a recursive local type.
Use `WriteReceipt` for the local versioned projection and retain the complete receiver body
as its evidence. All local shapes reject unknown fields; verified public receipt additions
remain in original artifact bytes rather than being dropped by recanonicalization.

`WriteObligation1` contains `stageCommandId`, original `RuntimeIntent`, `WriteCompletion`
and a disposition: `{ kind: 'pending' }` or
`{ kind: 'fenced_nonaccepted'; recoveryId: string }`. Only pending/nonaccepted obligations
are current outbox entries. Accepted history survives in the journal and local write receipt.

`Attempt4` preserves the existing identity/ordinal/revision/admittedEpoch fields, has
`holdsCapacity: false`, and a precise write state. Every state retains `checkpoint`,
`outcome`, `quiescence` and `stageCommandId`:

- `write_pending` also retains the exact `intent`.
- `write_nonaccepted` also retains the exact `intent` and resolving `recoveryId`.
- `write_terminal` retains the local `WriteReceipt`.

`WriteStageAck1 = { version: 1; kind: 'write_staged'; intent; obligation; attempt: Attempt4 }`.
`WriteAcceptAck1 = { version: 1; kind: 'write_accepted'; receipt; attempt: Attempt4 }`.
`RecordedWrite1` is a discriminated stage/accept record with `version: 1`,
`kind: 'stage_write' | 'accept_write'`, `runId`, `attemptId`, `context: ScopeContext`,
the corresponding `command` and original acknowledgement under `reply`, matching the
existing execution-journal naming. Export its exact variants as `RecordedWriteStage`
and `RecordedWriteAcceptance`.

`ExecutionHistory3` preserves the legacy arrays/nullable generic completion and receipt and
adds `writes: readonly RecordedWrite[]`. `RunSnapshot4` preserves generic pending intents
and receipts and adds `writeObligations` and `writeReceipts`. Both expose the precise current
attempt union. `RuntimeScopeSnapshot3` has the existing scope fields and mixed legacy/write
recovery histories. Earlier read versions remain valid historical input; new-format reads
return their new versions consistently, including empty lists.

Every version-sensitive consumer must distinguish all known versions explicitly. In
particular, new scope/history reads must retain generation-floor and recovery-evidence
checks currently guarded by `version === 2`; adding a read version must not bypass them.
Ordinary execution and admission must explicitly classify all three non-executing Attempt4
states. Unknown versions still throw rather than inheriting a fallback.

### One trusted stage and one trusted acceptance

Extend RunStore with:

```ts
stageWrite(guard: ScopedAttemptGuard, command: WriteStageCommand):
  Promise<StoreReply<WriteStageAck>>;
recordWriteAcceptance(guard: ScopedAttemptGuard, command: WriteAcceptCommand):
  Promise<StoreReply<WriteAcceptAck>>;
```

Pure planners consume the same complete authorized store view as claim planning and produce
all scope/run/attempt/journal/obligation changes before publication. Exact local ownership
and full-history integrity are checked first. Exact command replay returns the original
acknowledgement before fresh revision/state exclusions; changed reuse or another local command
borrowing a wire association refuses. Local command IDs and unbounded receiver IDs remain
separate namespaces, even if two lexical strings happen to match.

The complete planner input is explicit:

```ts
interface WriteFacts extends Omit<ExecutionFacts, 'attempt'> {
  readonly attempt: Attempt | Attempt4;
  readonly scope: ClaimFacts['scope'];
  readonly runtime: RuntimeCatalog;
  readonly submissions: readonly RecordedExecution[];
  readonly writes: readonly RecordedWrite[];
  readonly obligations: readonly WriteObligation[];
}
```

`executions` retains the selected attempt's complete execution prefix. `submissions` contains
every applied legacy execution submission in this store/organization, independently associated
with its original run/attempt. `writes` and `obligations` are complete global write catalogs;
each obligation resolves through its unique stage journal record to that independent target.
Providers authorize ownership and audit complete catalogs before planning. Scope is the exact
reconstructed prefix; historical transitions receive the prefix at their recorded context.
Replay searches the global local-submission domain before fresh revision/state exclusions,
and never returns a different run/attempt's acknowledgement.

The new write collision policy is:

| New identity                           | Existing local execution/write submission                                                     | Existing runtime wire command                                                  | Recovery ID, fence ID or reserved local acceptance                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Local write stage/accept ID            | Refuse changed reuse or another target; exact own replay returns its original acknowledgement | Lexical equality alone is permitted                                            | Refuse, except the exact associated write acceptance consumed by its recovery closure                  |
| Write wire command ID                  | Lexical equality alone is permitted                                                           | Refuse borrowing; exact own local-stage replay reuses its original association | Refuse                                                                                                 |
| Write recovery ID or new wire fence ID | Refuse                                                                                        | Refuse                                                                         | Refuse                                                                                                 |
| Reserved write recovery acceptance ID  | Refuse, except its exact associated terminal acceptance during closure/reconstruction         | Lexical equality alone is permitted, including the original write's wire ID    | Refuse another reservation, recovery ID or fence ID; exact recovery replay retains its own reservation |

Local stage and acceptance IDs are distinct. These rows govern only new write operations;
legacy authority/claim recovery exclusions and historical JSON remain unchanged. Existing
generic completion/receipt command IDs are not execution-submission IDs and acquire no new
collision exclusions. Apply this same matrix at runtime planning, recovery reservation,
history reconstruction and reciprocal publication checks. In particular, a staged write with
local acceptance ID equal to its original wire ID remains recoverable after a lost reply.

Fresh stage requires the same settled-turn conditions as determinate generic completion,
matching operation/effect/outcome evidence, a retained exact claim/session, current accepted
authority in the local epoch above the generation floor, a pinned scope/ledger, independently
submitted revisions, an empty pending scope slot and no conflicting active recovery. It
checks exact request operation, authority, basis, claim and every batch target. Release is
permitted only in the receiver-supported final position and exact person/step shape. It does
not append release or decide which business commands belong to an outcome.

Stage advances run/attempt/scope once, releases the local reservation once, and retains the
write event, completion, runtime intent and obligation atomically. Acceptance verifies the
same immutable association and publishes runtime acceptance, terminal attempt/local receipt,
original acceptance acknowledgement and obligation removal atomically. Late accepted bytes
can belong to the original epoch; the current local owner still fences publication. An active
recovery closes through its recovery transaction, not an independent ordinary acceptance.

### Verified wrappers and request construction

`stageWriteRequest` snapshots guard/input before awaits, verifies complete retained execution
and runtime histories, outcome/quiescence artifacts and the actual supplied WBS state bytes,
then derives `TargetObservation` and calls `stageWrite` once. State verification includes the
live runtime claim inventory, exact original binding, selected work item/step/code, ledger,
scope, authority and basis. Its trusted persistence command carries that verified projection;
the store never performs artifact IO inside its transaction.

`acceptWriteReceipt` snapshots guard/input, verifies actual complete original receipt bytes
through existing `verifyRuntimeReceipt`, requires the write variant, derives `WriteProjection`
and calls `recordWriteAcceptance` once. Verified public history readers independently reread
all write/state/recovery evidence and rederive projections. Metadata-only provider reads are
not authenticated remote acceptance.

`buildWriteRequest` is a read-only helper analogous to `buildClaimRequest`. Input is an
unbounded nonempty wire `commandId`, actual `stateEvidence` and approved ordered
`RuntimePlanCommand[]`; output is `{ kind: 'built'; request: { canonicalRequest; stateEvidence } }`
or a typed local refusal. It reads independently supplied revisions and verified current
grant/binding/state, and calls the existing public canonical request owner. A historical claim
receipt's `basisAfter` is not substituted for fresh state. Exact retries reuse their retained
request and original state evidence rather than invoking a builder to change bytes.

### Sender election and uncertainty

`deliverOutcome` consumes the existing injected `RuntimeClient`, stores, scoped guard,
signal, distinct local stage/acceptance IDs, `WriteCompletion`, canonical request and state
evidence. Return variants follow `claimActivity`: accepted with original `WriteAcceptAck`,
typed local refusal, or pending with exact intent and controlled observation.

Await durable stage first. Only `applied` elects one initial POST, after awaited ownership
renewal. `duplicate` verifies an original winner for the same local acceptance ID or performs
only immutable lookup. Fresh acceptance advances the submitted run/attempt/scope cut once;
duplicate lookup does not refresh independently submitted revisions. Keep raw exchange
capture per call and retain original bytes before acceptance verification.

Cancellation controls network dispatch, not the supplied business outcome. A pre-aborted
call can still complete durable staging and return pending without POST. Typed receiver
refusal/transport loss preserves pending. Unexpected post-stage exceptions use the existing
correlated dispatch error boundary. Neither a missing ordinary lookup nor a local timeout
authorizes another initial POST, new identity or replacement attempt.

### Write recovery uses the existing fence chronology

Add a `WriteRecoveryTarget` with exact original intent, run/attempt and local stage/acceptance
IDs. Preserve legacy recovery version1 shapes. Write intent/history/closure use version2,
while unchanged fence, observation and exchange envelopes retain their versions. The public
recovery call union gains `kind: 'write'` with a scoped attempt/recovery guard; no second retry
engine is introduced.

Begin associates the exact pending obligation without advancing its run/attempt/scope
revisions or changing its false reservation. Existing active-journal interlocks prevent an
ordinary sender from publishing a competing acceptance. `dispatchRecovery` uses its existing
three-fence and per-invocation POST bounds, durable fence/reply ordering, contextual original
lookup and controlled cancellation/error behavior. Write receipt evidence is valid only as
the original lookup subject, never as authority-fence evidence.

Write recovery uses the new-write collision matrix above; it does not reuse the legacy claim
acceptance exclusion against all runtime wire IDs. Complete-history audits preserve this
distinction and prove original-wire/local-acceptance lexical equality through actual lost-reply
recovery, alongside unrelated lexical equality and borrowed-association refusal controls.

Accepted closure includes the derived `WriteAcceptCommand` and original paired acknowledgement.
It applies write acceptance once (run/attempt +1, scope +1), then the existing generation
barrier (scope +1) in the same transaction. The closure's attempt reply is the same terminal
Attempt4; no extra claim-style hold or duplicate attempt event is invented.

Fenced nonacceptance retains the original completion/request, marks the obligation unsendable,
advances run/attempt once to `write_nonaccepted`, publishes the scope barrier once and removes
the active recovery index. It preserves false capacity and blocks admission/retry/rebase for
that occurrence. Other work does not inherit permission from released local capacity.

Complete scope and attempt folds validate reciprocal write intent/acceptance/journal/obligation
and recovery links, independent scope cuts and original acknowledgements. A recovery-contained
write acceptance is counted once through its write event; its closure validates the barrier
and association rather than replaying the business transition twice. Nonacceptance has no
accepted write event and is reconstructed from its closure. Missing or rewritten trusted
links throw across reads, duplicates, mutations and reopen.

### Explicit format6 preserving transition

Append `0006-runtime-write` with sibling `down.sql`; preserve0001–0005 bytes and identities.
Use a parallel `run6_*` keyed family plus write-journal/obligation/local-receipt structures,
and copy existing serialized fields verbatim. Existing generic rows do not acquire new write
records. Descriptors explicitly distinguish raw predecessors and keyed formats5/6; no
`version === 5` fallback can select raw keys, counters or usage semantics for6.

`upgradeSqliteWrites(options)` and `downgradeUnusedSqliteWrites(options)` use the existing
`transitionFormat` lifecycle with exact FORMAT5/FORMAT6 descriptors. Advisory preflight and
locked complete audits surround all finite DDL/copy/metadata writes. A new successor usage
marker is set by semantic changes; used downgrade refuses. Full known-family physical
validation detects partial successor declarations, including empty tables/indexes. Preserve
original identity4-to5 transitions as exactly4-to5 operations.

Add a genuine c12-pinned format5 producer/provider/worker and its explicit protocol path,
using the existing source archive/lifetime ownership mechanisms. Keep format3/4 protocols and
workers byte-identical. Historical compatibility tests use genuine historical providers;
they do not relabel newly bootstrapped6 as5. Test populated pending/terminal/runtime/recovery
rows, opaque IDs, old open/queued/BUSY writers and permitted artifact/refusal-clock exceptions.
Ordinary open never upgrades; operator transitions and production remain held.

### Admission protects logical state across database engines

Incompatible admission preserves PUNI records, schema, migration identities and persistent
database settings. Engine bookkeeping is allowed. Private paired main/WAL inspection is
bounded advisory classification, never an atomic snapshot or publication authority; it never
copies source SHM, ignores live WAL, or deletes source sidecars. Closed genuine predecessors
detected there retain the stronger SQLite byte/sidecar-set guarantee.

After private inspection, authoritative complete compatibility/configuration/history checks
must run under native database exclusion. An inspection that observed6 may race a legitimate
unused downgrade to5: actual admission must then refuse without semantic or persistent-setting
changes, while SQLite may create WAL/SHM. Preserve the original strict no-sidecar race failure
as evidence of the rejected stronger contract; prove the new logical-state contract separately.
Connection-local settings and persistent journal-mode conversion have different lifecycles.
Already-WAL admission must not convert journal mode before the authoritative check. Supported
non-WAL opening remains supported: any conversion requires compatibility validation and native
exclusion retained across the transaction/configuration handoff, followed by complete admission
before exposing stores. A stale advisory result cannot authorize conversion. Use no new external
file-lock protocol; the native handoff needs an observed concurrency proof before acceptance.

The non-WAL path may use a short-lived native-exclusive connection for the supported-state
audit and conversion, positively close it, then perform fresh normal-connection admission.
The exclusion must span the compatibility check and persistent conversion; it need not transfer
between connections. A downgrade before the protected configuration check must leave settings
unchanged. A downgrade after a valid supported conversion may cause final admission to refuse:
that refusal preserves the post-downgrade state, while the earlier supported conversion remains
committed. Tests retain both independent cuts rather than claiming zero writes for the whole
call across a successful configuration phase. No provider or workflow mutation escapes the
final audit; normal connection concurrency and per-operation format fencing remain required.

This contract is feasible on PostgreSQL using a transaction-scoped schema guard shared by
workflow operations and exclusively held by format transitions, with format/current-ownership
validation and mutation under that same guard. A stable guard row with native shared/exclusive
row locks or a cooperative transaction-level advisory lock can supply the exclusion; the exact
mechanism and fresh-state isolation remain adapter design choices. Every migration/operation
entry point must participate; a stale transaction snapshot must fail or reread current state,
never authorize old-format mutation. Guard waiting and retries must be bounded. PostgreSQL
[read-only transactions](https://www.postgresql.org/docs/current/sql-set-transaction.html)
do not prohibit all disk writes; its [transaction locks](https://www.postgresql.org/docs/current/explicit-locking.html)
provide the relevant exclusion. This is a feasibility argument, not an implemented PostgreSQL
adapter, selected driver/schema/index, or completed conformance proof. Those remain required
under the full foundation goal.

PostgreSQL feasibility also preserves the existing opaque-ID and original-byte contracts.
Its [JSON types](https://www.postgresql.org/docs/18/datatype-json.html) are not interchangeable
with exact serialized records: `jsonb` rejects escaped NUL and malformed surrogate pairs and
normalizes representation. Escaped JSON retained as uninterpreted text, or exact bytes in
[`bytea`](https://www.postgresql.org/docs/current/datatype-binary.html), provide feasible storage
boundaries without narrowing domain IDs. Exact comparison, long wire-ID indexing, integer
conversion, unknown-COMMIT reconciliation and backend-quiescence proofs remain PostgreSQL
adapter obligations; this packet selects none of their physical implementations.

## Risks / Trade-offs

The explicit conservative restart cost belongs to ADR0068. Additional risks are incomplete
cross-history folds, double-counted accepted recovery, raw-family fallback in a successor and
accidental replacement of historical original replies. Tests target each owner directly and
through both actual providers. Real receiver commit/reply-loss/reopen and separate-process
local COMMIT cuts supplement semantic tests; none establishes power loss or worker termination.

The format6 packet is one unreleased cohort. Intermediate task commits are review checkpoints,
not separately supported format6 releases. Publication/readiness follows complete recovery,
R5 proofs, reviews and exact-source verification. Full foundation work still includes automatic
business policy, physical continuation, remaining adapters, second durability and S7a.

## Migration Plan

Keep the ordinary current opener fail-closed. Prove explicit upgrade and unused down only on
owned test databases. Publish migration capability and operator instructions only as reviewed
documentation; perform no operator-store upgrade. Preserve all original failure receipts and
verify physical/hash-ledger identity after rollback.

## Open Questions

No blocking product choice remains for this packet. Business mapping, replacement/operator
continuation and physical recovery are subsequent required design work, not implicit defaults.
