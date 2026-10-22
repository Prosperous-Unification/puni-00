# Durable runtime authority history

## Intent

Retain the exact receiver authority request before a sender can dispatch it, and
retain complete matching acceptance independently of a coordinator's lease. A crash
must leave inspectable intent; a late acceptance from an older local epoch must not
establish the replacement owner's grant. The same RunStore owns this history before
any run exists. Both storage providers satisfy one semantic contract; SQLite proves
commit/reopen behavior. Verified application operations bind retained receipt bytes
to their exact request through existing WBS schemas and correspondence predicates.

This is an internal persistence slice in the durable-execution branch. It introduces
no HTTP dispatch, claims, worker launch, credentials, provider construction, spending,
CTT implementation, activation or deployment. Full preparation/locator/claim/turn
ordering and delivery reconciliation remain required before a coordinator is enabled.
It is not independently published or gated as a sender release; the later cohesive
composition needs its own whole-branch review and exact-SHA gate/CI.

## Existing ownership and boundaries

Use the existing RunStore, ArtifactStore, WallClock, ownership/lease and transaction
mechanisms. Local ownership and receiver authority are distinct: their owner labels
need not be equal, and a local epoch is not a receiver generation. History matching
proves retained content, not authenticated transport or current external permission.

Keep existing portable records unchanged. New runtime records use version1 and live
beside their codecs/planners. Scope is WBS's complete organization/project/person
address. One store remains bound to one organization. A scope's ledger pin is immutable;
neither a new installation nor a later observation silently changes it.

## Semantic interface

The following types are owned by runs/runtime-records.ts; WBS scope/authority types
come only from @wbs/contracts. Existing Ownership, ArtifactRef, ArtifactDigest and
Revision come from runs/records.ts. All nested values are readonly and detached at
public submission/return boundaries; never freeze caller objects.

```ts
interface RuntimePin {
  readonly version: 1;
  readonly scope: RuntimeScope;
  readonly ledgerId: string;
}
interface RuntimeGuard {
  readonly ownership: Ownership;
  readonly scope: RuntimeScope;
  readonly expectedRevision: Revision;
}
interface RuntimeIntent {
  readonly version: 1;
  readonly commandId: string;
  readonly canonicalRequest: string;
  readonly requestDigest: ArtifactDigest;
  readonly localOwner: Pick<Ownership, 'ownerId' | 'epoch'>;
  readonly stagedRevision: Revision;
}
interface RuntimeAcceptanceInput {
  readonly intent: RuntimeIntent;
  readonly evidence: ArtifactRef;
}
interface RuntimeAcceptance {
  readonly version: 1;
  readonly commandId: string;
  readonly requestDigest: ArtifactDigest;
  readonly evidence: ArtifactRef;
  readonly acceptedRevision: Revision;
}
interface RuntimeGrant {
  readonly localEpoch: number;
  readonly commandId: string;
  readonly authority: RuntimeAuthority;
}
type RuntimeScopeSnapshot =
  | {
      readonly version: 1;
      readonly kind: 'uninitialized';
      readonly scope: RuntimeScope;
      readonly ownerEpoch: number;
    }
  | {
      readonly version: 1;
      readonly kind: 'pinned';
      readonly pin: RuntimePin;
      readonly revision: Revision;
      readonly ownerEpoch: number;
      readonly intents: readonly RuntimeIntent[];
      readonly acceptances: readonly RuntimeAcceptance[];
      readonly pendingCommandId: string | null;
      readonly grant: RuntimeGrant | null;
    };
```

Extend RunStore with:

```ts
pinRuntimeScope(ownership: Ownership, pin: RuntimePin): Promise<StoreReply<RuntimePin>>;
readRuntimeScope(scope: RuntimeScope): Promise<RuntimeScopeSnapshot>;
stageRuntimeRequest(guard: RuntimeGuard, canonicalRequest: string): Promise<StoreReply<RuntimeIntent>>;
recordRuntimeAcceptance(guard: RuntimeGuard, input: RuntimeAcceptanceInput): Promise<StoreReply<RuntimeAcceptance>>;
```

This slice stages authority acquisitions only. A valid claim/write canonical envelope
is unsupported here and refuses state_conflict without history changes. No dispatch
permission follows from staging. Future prepared-claim integration must add its exact
ordering preconditions before extending supported operations.

### Pin and intent rules

1. Mutations validate the current live owner before retained target/duplicate lookup,
   using existing post-lock clock and greatest-observation semantics. Store/scope
   organization mismatch refuses authority_conflict. Read inspection is ownership-free;
   an address outside the store organization throws. Trusted missing/corrupt state throws.
2. Pinning creates scope revision0 insert-or-identical; a different ledger for the
   same scope refuses identity_conflict. A pin duplicate returns the original pin,
   never a changing snapshot. Explicitly never-pinned scope reads uninitialized only
   after complete runtime catalog integrity checks; lost history cannot look empty.
3. Parse exact canonical bytes through parseCanonicalRuntimeRequest. Scope and ledger
   must equal the guard and pin. Hash the exact UTF-8 canonical bytes with SHA256.
   Command IDs are unique across runtime histories in one store; WBS's string identity
   domain is preserved without adding a new arbitrary ID-length cap.
4. A fresh intent requires the expected scope revision and no unresolved pending
   command. It increments scope revision, records that revision and the current local
   owner/epoch, and persists before any future sender call. It touches no run, attempt
   or capacity reservation. Existing monotonic clock observations may still persist.
5. After owner validation, exact same command/scope/bytes returns its original immutable
   intent before stale revision checks, including after takeover/acceptance. Changed
   content or cross-scope reuse refuses identity_conflict. A different command while
   pending refuses state_conflict. There is no clear, replace, supersede or TTL API.
6. New expectedGeneration cannot move behind accepted local receiver history; null is
   allowed only before any accepted authority. External advancement may create gaps.
   A receiver/local owner label equality is deliberately not required.

### Acceptance and reconstruction

recordRuntimeAcceptance is trusted persistence: its caller already verified the exact
receipt artifact's complete shape and correspondence. It compares the entire supplied
intent with the retained immutable intent, including local provenance and canonical
bytes. An unrelated/changed submission refuses identity_conflict. Exact acceptance
redelivery returns its original immutable reply after current-owner/target validation,
before old scope revision checks, without changing current history or grant.

A fresh acceptance requires current scope revision and its exact pending command.
It atomically retains evidence/digest/acceptedRevision, increments scope revision and
clears pending. The expected receiver owner/generation is derived from that immutable
authority request; safe increment uses existing checked integer arithmetic. Do not
store a second mutable authority projection. All intents and acceptances are retained.

An acceptance staged in an older local epoch may be recorded under the new live owner,
but it never supplies that epoch's grant. Snapshot grant is derived only from the latest
accepted intent staged in the snapshot's current local epoch. Its labels are historical
mapping, not a promise that a lease is live or the receiver grant remains current. A
replacement must stage and accept its own acquisition. Old duplicate acceptance cannot
replace a newer mapping. Expiry/takeover changes no intents, claims or reservations.

Merge stagedRevision and acceptedRevision into one complete ordered scope history.
Starting at revision0, every next event is consecutive, one intent is pending at most,
and acceptance names that pending intent. Validate complete keys, scope/ledger, canonical
bytes/digest, generation progression, links and final revision before returning trusted
history. Missing events, conflicting duplicates, orphan rows or unexplained gaps throw.
For intents staged in the current local epoch, localOwner.ownerId must also equal the
owner label retained in the same admitted OwnershipStatus. Expiry alone retains that
label; takeover advances the epoch. Historical owner labels have no independent
ownership ledger, and coherent metadata/history forgery is outside this guarantee.
Reads and mutations audit runtime marker counts and owned row identities before absence.
The audit is proportional to retained history; no unbounded-scale benchmark is claimed.

## Verified artifact application boundary

runs/runtime-history.ts supplies:

```ts
acceptRuntimeReceipt(
  runs: Pick<RunStore, 'recordRuntimeAcceptance'>, artifacts: ArtifactStore,
  guard: RuntimeGuard, intent: RuntimeIntent, evidence: ArtifactRef,
): Promise<StoreReply<RuntimeAcceptance>>;
readRuntimeHistory(
  runs: Pick<RunStore, 'readRuntimeScope'>, artifacts: ArtifactStore, scope: RuntimeScope,
): Promise<RuntimeScopeSnapshot>;
```

Snapshot submitted guard/intent/evidence before awaits. Read/verify the retained JSON
artifact, decode strict UTF-8/JSON and await existing validateSchema with
lookupRuntimeReceipt.responses[0].schema. Reuse matchesRuntimeReceipt against the
independently computed canonical digest. Only then invoke trusted persistence with
that same snapshot. Malformed/mismatched trusted evidence throws; do not map corruption
to absence or manufacture authentication. Media type is application/json. No new
public WBS decoder or duplicate wire-schema tree is introduced. The existing response
schema deliberately ignores added wire fields; verified artifacts preserve that
forward-readable compatibility. Known-field shape, version, discriminants and complete
correspondence still validate, while local persistence records remain strict.

Verified history reads validate every accepted artifact and its link to the retained
intent. Raw readRuntimeScope validates local persistence only and documents that it
has not read independent artifact bytes. No asynchronous artifact/schema work occurs
inside SQLite transactions. Later driver composition must receive the verified
operations rather than raw artifact-bearing mutation/provider capabilities.

## Physical format and providers

[ADR0060](../../../docs/adr/0060-run-store-formats-bootstrap-complete-bundles.md)
preserves both0001-run-store SQL files byte-for-byte and adds0002-runtime-authority
with down.sql. Adapter schema2 bootstraps both ordered migrations atomically; opening
never creates/upgrades/reset state. An old format1 store rejects incompatible before
mode-changing setup, and its bytes/schema/records remain unchanged. External retained
branch stores were not inventoried; an upgrade API is not invented here.

Keep the existing first migration/down exports and hashes unchanged. The registry
exposes ordered, complete, trimmed forwardStatements, consumed fail-fast by both
bootstrap and physical reference construction. The pinned0001 contains simple DDL
and is narrowly split on semicolons; new0002 uses explicit statement breakpoints.
A future compound migration needs an explicit representation update and new proofs;
this is no general SQL parser. Required intermediate SQL failure rejects bootstrap
without publishing its target and removes staging. Add a named ordered migration
registry and FORMAT_HASH: SHA256 of UTF-8 JSON.stringify of
['run-store-format',2,[[name,forwardHash,downHash],...]] in registry order. Validate
run_meta schema_version2 and its original0001 hashes, plus a required run_format
singleton containing bundle_hash and scope_count/intent_count/acceptance_count.
The counts start0 and commit with their rows. Exact count/key/link validation makes
deleted families refuse rather than appear uninitialized. Coherent full-store restore
and hostile metadata forgery remain outside this local integrity guarantee.

New tables are run_format, run_runtime_scope, run_runtime_intent and
run_runtime_acceptance; command IDs are global primary keys and child rows reference
their exact scope/intent. The SQLite adapter writes only named rows and counters in
its existing transaction, not a serialized store-wide snapshot. Physical schema is
derived from the entire ordered bundle, including empty declarations. New down refuses
any runtime pin/history or nonzero retained counters; an unused reverse removes only
new tables and restores schema_version1, preserving the original declarations/records.
The supported raw down caller first validates the complete installed format, then
executes trimmed complete breakpoint statements in order inside an explicit caller
transaction, stops at the first error and rolls back/rethrows. The down script checks
the required schema2 run_meta singleton before any DROP. Its SQL guards establish
runtime-use/count consistency, not independent cryptographic authentication of the
full format. Bun1.4.2 whole-script run/exec can continue after an intermediate CHECK
error; that invocation is outside this supported down contract. No incremental
migration/rollback CLI, new public rollback API or power-loss claim is supplied.

Both providers use shared pure planners and the same complete semantic conformance.
SQLite additionally proves concurrent staging/acceptance, real abort rollback and
process death before/after COMMIT. Preserve existing RunStore/ArtifactStore behavior,
all WBS migration bytes, guarded rollback and owner/clock checks.

## Consumption and validation scope

Allow @wbs/contracts only at runtime-records.ts, runtime-codecs.ts,
runtime-history.ts and testing/runtime-history-contract.ts. Extend actual product
policy and effective-config tests narrowly; peers, private products and relative
shortcuts stay refused. No broad product exception or new helper framework.

Fresh source inventory found CTT main94ff58f5 already contains the unified API,
but the integrity-verified published0.8.0 declarations lack DEFER_READY/summary/settle.
This slice needs no CTT dependency and changes none of its separately owned source.
Also, installed ACP SDK remains1.4.0: no2.x compatibility is established by this work.
The earlier parent pin spike must not be read as a completed2.x adapter proof.

Every new/changed check needs an isolated production-path fault and exact restoration;
existing reused guards are not blanket recertified. Faults cover authority fencing,
immutable identity, pending serialization, revision/history integrity, old-epoch grant
mapping, artifact validation/correspondence, complete format/schema identity, counters
and down protection. Preserve all failed trials, warnings, skips and proof limits.
Finish one complete RunStore suite after edits/proofs/formatting under a source,
HEAD, status and semantic staged-index freeze; raw index hashes are recorded without
equating cache-byte identity with semantic staging. Root owns all Git/docs/reviews.
