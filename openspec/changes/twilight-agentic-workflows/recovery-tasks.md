# Authority and Claim Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover uncertain authority and claim requests through retained, verified receiver fences and one atomic logical closure while preserving populated format3 history and reserved capacity.

**Architecture:** Actual-byte verifiers produce detached typed values outside persistence. A complete recovery journal participates in current and historical folds; one pure closure planner computes all consequences from one valid locked predecessor, and the independent memory and SQLite providers publish those consequences atomically. Explicit adapter migration boundaries preserve genuine format3 stores; ordinary open never migrates.

**Tech Stack:** TypeScript, Bun, bun:sqlite, ArkType through `@shared/validation`, existing WBS runtime contracts/client/receiver, Nx and OpenSpec.

**Spec:** Read [approved intent](recovery-intent.md), [approved design](recovery-design.md), [run-coordination delta](specs/twilight/run-coordination/spec.md), [ADR 0064](../../../docs/adr/0064-uncertain-runtime-requests-use-journaled-recovery.md) and [verification record](recovery-verify.md). The design owns record semantics; this plan selects concrete source names and review boundaries.

## Global Constraints

- Approved for implementation, tests and review on 2026-10-28. Architectural merge remains held.
- Preserve and explicitly upgrade genuine populated format3 stores; never migrate during ordinary open.
- Append a named additive migration with guarded down, preserving every earlier migration byte.
- Keep all inherited guards installed, retain capacity throughout uncertainty, and require actual production-path negatives for each new safety check.
- Receiver/network and artifact validation remain outside synchronous provider transactions.
- Three fence identities and three POSTs per invocation bound convergence; later invocations resume identical attempts after pre-send/lost-reply crashes.
- No default empty witness collection hides a caller.
- Barriers are historical evidence, never current permission.
- Architectural main merge and production remain held.
- Use Bun and Nx only; never bypass hooks or introduce a second task runner. Read callers/tests before each behavior change and preserve unrelated edits.
- Full outcome/write recovery, physical continuation, producer lifecycle, remaining adapters, a second durable provider and S7a remain subsequent required work.

---

## Execution and evidence rules

Baseline is `bb14bb1cf3afc0559e4d0864374e11c652751751`, branch `feat/agentic-recovery-r2-20261028`, worktree `/tmp/puni-agentic-runtime-dispatch-20261026`. The source inventories are `/tmp/puni-r2-store-inventory-20261028.md` and `/tmp/puni-r2-migration-inventory-20261028.md`; their source observations are preparation, not passing tests. All checkboxes start uncompleted.

Commands below run from the repository root unless stated otherwise. Focused Bun tests include the repository scratch preload. An intended missing new module/export may establish the initial feature-absence RED; syntax, preload, dependency or environment errors do not. Import/type errors alone never establish a behavioral or R5 safety proof. After adding the minimum complete implementation, run the identical test GREEN. For every new/changed guard, temporarily remove only that guard or break its new dependency, run its production-path negative, observe the named unsafe publication/missing rejection/order violation, restore exactly and run GREEN. Keep inherited guards installed. A later unrelated refusal is not proof of the new guard. Record command, exit, observed assertion, restoration and adjacent `Proof:` location in `recovery-verify.md`; do not prewrite claims of observed proof.

The unchanged baseline currently hits a proven sandbox Bun socketpair `sendto` EPERM. Execute unchanged subprocess tests through the approved outside-sandbox route; do not weaken source, IPC or fixtures. Report blocked/skipped checks explicitly. Historical CI40630891442 failure is separate diagnosis, not an R2 failure or an R2 fix.

Each Task is one review boundary, containing small RED/GREEN/proof steps. Review its complete diff and run its focused tests plus `bunx nx run twilight-dash:typecheck` before its commit. The latter is a focused project check, not the host-wide gate. Use exact owned filenames in `git add`; never commit another worker's changes. Commit messages are supplied below; hooks must run. After each task, update this checklist and the verification record in that task's commit. No callable placeholder, optional recovery method or dummy throwing implementation may be committed.

## File ownership and concrete names

All abbreviated source paths in this document expand from **`D = apps/twilight-structure/twilight-dash/cli/src`** and **`R = apps/twilight-structure/twilight-dash/cli/src/runs`**. These are exact directory aliases for the tables, not shell environment variables. Commands use expanded paths.

| Owner      | Exact files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Responsibility                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Task 1     | `R/recovery-records.ts`, `R/recovery-codecs.ts`, `R/recovery-evidence.ts`, `R/recovery-evidence.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                    | New detached values, strict synchronous codecs, asynchronous actual-byte verification and receipt-derived claim command       |
| Task 2     | `R/plan-recovery-history.ts`, `R/plan-recovery-history.test.ts`, `R/recovery-history.ts`, `R/recovery-history.test.ts`; narrow `R/recovery-records.ts`, `R/recovery-codecs.ts`, `R/sqlite/schema.ts`; existing `runtime-records.ts`, `execution-records.ts`, `records.ts`, `record-codecs.ts`, `execution-codecs.ts`, `plan-runtime.ts`, `plan-claims.ts`, `plan-execution.ts`, `validate-history.ts`, `runtime-history.ts`, `claim-history.ts`, `build-claim-request.ts`, `dispatch-authority.ts`, `claim-activity.ts`, `dispatch-turn.ts` | Complete versioned reads, strict current/prefix folds, capacity-preserving hold and barrier-aware consumers                   |
| Tasks 2–6  | `R/testing/memory-stores.ts`, `R/sqlite/run-store.ts`, `R/sqlite/read-runtime.ts`, `R/sqlite/read-history.ts`, `R/sqlite/row-codecs.ts`, `R/run-store.ts`                                                                                                                                                                                                                                                                                                                                                                                   | Independent adapters and mandatory propagation; mutation ports are introduced only in their complete task                     |
| Task 3     | `R/sqlite/migrations/0004-runtime-recovery/{migration.sql,down.sql}`, `R/sqlite/format.ts`, `R/sqlite/schema.ts`, `R/sqlite/open-stores.ts`, `R/sqlite/migrate-recovery.ts`, `R/sqlite/recovery-store.ts`, `R/sqlite/read-recovery.ts`, `R/plan-recovery.ts`, `R/plan-outcome.ts`, `R/plan-receipt.ts`, `R/plan-signals.ts`                                                                                                                                                                                                                 | Additive storage, explicit preserving upgrade/down, begin and inseparable fresh-mutation interlocks                           |
| Tasks 3–6  | `R/testing/recovery-contract.ts`, `R/recovery.test.ts`, `R/sqlite/recovery.db.test.ts`, `R/sqlite/recovery-migration.db.test.ts`, `R/sqlite/recovery-races.db.test.ts`, `R/sqlite/store-lifecycle.db.test.ts`                                                                                                                                                                                                                                                                                                                               | Shared provider behavior, actual SQL/races/rollback/reopen/lifecycle                                                          |
| Tasks 4–6  | `R/plan-recovery.ts`, `R/plan-recovery.test.ts`, `R/sqlite/recovery-store.ts`; Task 6 also `R/sqlite/runtime-store.ts`                                                                                                                                                                                                                                                                                                                                                                                                                      | Fence/observation/closure plans and direct transaction-local writes                                                           |
| Task 7     | `R/dispatch-recovery.ts`, `R/recovery-dispatch-error.ts`, `R/testing/recovery-dispatch-contract.ts`, `R/recovery-dispatch.test.ts`, `R/sqlite/recovery-dispatch.db.test.ts`, `R/testing/recovery-receiver.ts`                                                                                                                                                                                                                                                                                                                               | Bounded real capture/commit/send/lookup workflow and actual receiver fixtures                                                 |
| Tasks 3, 8 | `R/testing/format3-worker.ts`, `R/testing/format3-fixture.ts`, `R/sqlite/recovery-compatibility.db.test.ts`; extend migration/race/lifecycle tests                                                                                                                                                                                                                                                                                                                                                                                          | Task3 creates genuine predecessor population/capture fixture; Task8 extends actual old-writer/concurrency acceptance coverage |

Tasks also own precise updates to existing `R/testing/{fixtures,runtime-history-contract,execution-history-contract,authority-dispatch-contract,claim-dispatch-contract,turn-dispatch-contract}.ts`, `R/{runtime-history,execution-history,claim-history}.test.ts` and `R/sqlite/{runtime-history,execution-history}.db.test.ts` when their mandatory signatures/version assertions change. Preserve tests of old acknowledgement versions. Do not create a nonexistent `runs/execution-history.ts`: verified execution history belongs to `claim-history.ts`. Do not change receiver behavior to make a recovery proof pass.

Design aliases map as follows: `Target/Intent/Context/Exchange/ArtifactValue/ExchangeValue/Basis/Fence/FenceInput/FenceReplyInput/Observation/AcceptedFence/AuthorityDecision/ClaimDecision/BeginCall/Call/ResolveCall/Closure/Hold` become `RecoveryTarget/RecoveryIntent/RecoveryContext/RecoveryExchange/RecoveryArtifactValue/RecoveryExchangeValue/RecoveryBasis/RecoveryFence/RecoveryFenceInput/RecoveryFenceReplyInput/RecoveryObservation/AcceptedRecoveryFence/AuthorityRecoveryDecision/ClaimRecoveryDecision/RecoveryBeginCall/RecoveryCall/RecoveryResolveCall/RecoveryClosure/RecoveryHold`. `AuthorityTarget/ClaimTarget/AuthorityGuard/ClaimGuard/Absent/Conflict` become `AuthorityRecoveryTarget/ClaimRecoveryTarget/AuthorityRecoveryGuard/ClaimRecoveryGuard/RecoveryReceiptAbsent/RecoveryGenerationConflict`. These are domain names for the exact approved relationships, not new protocol variants. `RecoveryHistory` keeps its name. `RuntimeState`, `AuthorityReceipt` and `ClaimReceipt` are imported from `@wbs/contracts` unchanged.

Preserve old shapes under `RuntimeScopeSnapshot1`, `ExecutionHistory1`, `RunSnapshot2`, `Attempt2`; add `RuntimeScopeSnapshot2`, `ExecutionHistory2`, `RunSnapshot3`, `Attempt3`. Existing public aliases become unions. Every old `ExecutionAck`, `ClaimStageAck`, `ClaimAcceptAck`, `TurnStageAck`, `RecordedCompletion`, `RecordedReceipt` and `RecordedConsumption` explicitly retains `Attempt2`. `decodeAttempt` continues decoding Attempt2; new `decodeCurrentAttempt(candidate: unknown): Attempt2 | Attempt3` dispatches current rows. Never widen the old state decoder. Private `RuntimeScopeView2` is the design's `ScopeView2`, with neither `activeRecoveryId` nor `recoveries`.

### Task 1: Verify detached recovery values from actual retained bytes

**Files:** Create the four Task 1 files above. Extend `apps/twilight-structure/twilight-dash/eslint.product.mjs` and `tools/tool-devsync/src/eslint-boundaries.test.ts` only for actual new direct `@wbs/contracts` consumers among these files. Read existing `runtime-state.ts`, `runtime-receipt.ts`, `artifact-integrity.ts`, `claim-history.ts`, `D/bridge/runtime-client.ts` and public runtime response schemas first. Do not modify RunStore.

**Interfaces:** Produce the complete renamed design types in `recovery-records.ts`. All fields and nested records are readonly; `RecoveryIntent<T extends RecoveryTarget = RecoveryTarget>` and `RecoveryCall<P>` preserve their design discriminants. Export these concrete boundaries:

For this first task, import the existing `execution-records.ts` `Attempt` as the local type name `Attempt2`; this is exactly the existing version2 record. Task2 introduces the public versioned aliases and union without changing that shape. Recovery types alone do not expose mutation ports or teach old decoders a new state.

```ts
decodeRecoveryExchange(candidate: unknown): RecoveryExchange;
decodeRecoveryHistory(candidate: unknown): RecoveryHistory;
decodeRecoveryBeginCall(candidate: unknown): RecoveryBeginCall;
decodeRecoveryFenceCall(candidate: unknown): RecoveryCall<RecoveryFenceInput>;
decodeRecoveryObservationCall(candidate: unknown): RecoveryCall<RecoveryFenceReplyInput>;
decodeRecoveryResolveCall(candidate: unknown): RecoveryResolveCall;

type RecoveryEvidenceSubject =
  | { readonly kind: 'state' }
  | { readonly kind: 'authority'; readonly intent: RuntimeIntent }
  | { readonly kind: 'claim'; readonly intent: RuntimeIntent }
  | { readonly kind: 'absent' }
  | { readonly kind: 'generation_conflict' };
type VerifiedRecoveryExchange =
  | { readonly kind: 'state'; readonly exchange: RecoveryExchangeValue<RuntimeState> }
  | { readonly kind: 'authority'; readonly exchange: RecoveryExchangeValue<AuthorityReceipt> }
  | { readonly kind: 'claim'; readonly exchange: RecoveryExchangeValue<ClaimReceipt> }
  | { readonly kind: 'absent'; readonly exchange: RecoveryExchangeValue<RecoveryReceiptAbsent> }
  | { readonly kind: 'generation_conflict'; readonly exchange: RecoveryExchangeValue<RecoveryGenerationConflict> };

readRecoveryExchange(
  artifacts: ArtifactStore,
  envelope: ArtifactRef,
  subject: RecoveryEvidenceSubject,
): Promise<VerifiedRecoveryExchange>;
deriveRecoveryClaimCommand(
  intent: RecoveryIntent<ClaimRecoveryTarget>,
  lookup: RecoveryExchangeValue<ClaimReceipt>,
): ClaimAcceptCommand;
```

`RecoveryHold` is exactly the cause/checkpoint-correlated union below; `closureId` equals the recovery ID. New histories preserve full typed pairs and nullable closure, never only hashes or a boolean certificate.

```ts
type RecoveryHold =
  | {
      readonly kind: 'recovery_hold';
      readonly cause: 'claim_nonaccepted';
      readonly closureId: string;
      readonly checkpoint: Extract<Checkpoint, { kind: 'claiming' }>;
    }
  | {
      readonly kind: 'recovery_hold';
      readonly cause: 'claim_accepted_fenced';
      readonly closureId: string;
      readonly checkpoint: Extract<Checkpoint, { kind: 'ready' }>;
    };
type Attempt3 = Omit<Attempt2, 'version' | 'state'> & {
  readonly version: 3;
  readonly state: RecoveryHold;
};
```

- [x] **RED — strict record shapes.** Add table-driven codec tests for every discriminant, missing nested typed value/ref, wrong target/guard, wrong hold/checkpoint, unknown fields, invalid safe-integer revisions/ordinals and a write target. Include a valid detached value first. Decode synchronously using `@shared/validation`; a transaction must not call asynchronous public response validation.
- [x] **RED — actual-byte reader.** Add this focused test using existing memory fixture construction (`FixtureClock`, `organizationId`, `createMemoryStores`, `runtimeScope`) and imported new `readRecoveryExchange`; `stores` is created/closed inside the test with the existing runtime-history fixture pattern:

```ts
const body = await stores.artifacts.retainArtifact(
  new TextEncoder().encode('{"error":"runtime_receipt_not_found"}'),
  'application/json',
);
if (body.kind !== 'retained') throw new Error('fixture artifact refused');
const envelope = await stores.artifacts.retainArtifact(
  new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      context: {
        kind: 'supersession_lookup',
        recoveryId: 'recover',
        previousOrdinal: 1,
        stateExchange: body.reference,
      },
      scope: runtimeScope,
      ledgerId: 'ledger',
      request: { kind: 'lookup', commandId: 'fence-1' },
      status: 404,
      body: body.reference,
    }),
  ),
  'application/json',
);
if (envelope.kind !== 'retained') throw new Error('fixture envelope refused');
const verified = await readRecoveryExchange(stores.artifacts, envelope.reference, {
  kind: 'absent',
});
expect(verified).toMatchObject({
  kind: 'absent',
  exchange: {
    body: { artifact: body.reference, value: { error: 'runtime_receipt_not_found' } },
  },
});
await expect(
  readRecoveryExchange(
    { ...stores.artifacts, readArtifact: () => Promise.reject(new Error('recovery unreadable')) },
    envelope.reference,
    { kind: 'absent' },
  ),
).rejects.toThrow('recovery unreadable');
```

This reader verifies the envelope/body; retained-journal association is deliberately a later planner responsibility. Add separate missing envelope and missing body cases, unreadable body, false digest/length/media type, invalid embedded UTF8, malformed JSON, public-schema refusal, mismatched status/request/subject and wrong receipt canonical bytes.

- [x] **Run RED:** `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/recovery-evidence.test.ts --timeout=60000`.
- [x] **RED/GREEN — exact contract admission.** Existing product policy admits only enumerated WBS-contract consumers, including type-only imports. Add effective-ESLint tests for each actual new consumer, sibling alias/relative import denials, an existing pure planner peer denial and an unlisted test denial. Require zero fatal parser/configuration errors before asserting the boundary diagnostic. Add only exact needed paths and `^@wbs/contracts$`, retain all inherited ring/scope rules, and never re-export a new external dependency through an old admitted file merely to evade policy. Remove the new allowance and independently widen its alias/relative/file scope; observe the named actual admission/denial tests fail, restore and record only those proofs. Name the selected suite with lowercase `recovery evidence` and run `bun test --preload ./tools/test/scratch/preload.ts ./tools/tool-devsync/src/eslint-boundaries.test.ts --test-name-pattern='recovery evidence' --timeout=60000`; verify the named cases actually execute, then lint the actual new sources under the effective configuration.
- [x] **GREEN — implement the boundary.** Clone arguments before the first await; read envelope and body independently; verify digest/length/media/UTF8; select existing public state/lookup/authority schemas; compare captured status and purpose; use `verifyRuntimeReceipt` for receipts. Return the detached envelope/value and body/value pairs. Derive claim command with retained `acceptanceCommandId`, original intent, actual lookup body reference and `{version:1, claimId: receipt.acceptance.claim.claimId, actorId:receipt.actorId, basisAfter:receipt.acceptance.basisAfter}`. Validate the complete existing projection; never derive claimId from a request.
- [x] **R5:** Break only the new reader's call to the inherited byte verifier or its new subject/context correspondence, keeping inherited verifier implementation unchanged. Observe absent/unreadable/same-ref-value or wrong-subject input accepted when that new dependency is bypassed; restore, rerun, and add truthful adjacent `Proof:` comments. Keep diagnostic-only cases distinct from publication safety.
- [x] **Validation:** Rerun the focused command, `bunx nx run twilight-dash:typecheck`, and existing runtime-state/runtime-history/claim-history focused tests. Record skips and actual output.
- [x] **Commit:** Stage Task 1 files plus these checklist/evidence updates; `git commit -m "feat(twilight-dash): verify recovery exchange values"`.

### Task 2: Fold complete recovery witnesses and exact historical cuts

**Files:** Task 2 ownership table, mandatory read/catalog propagation in both providers, and affected existing contracts/fixtures. No mutation port is added.

**Controller scope clarifications:** Task2 also owns the narrow `recovery-records.ts` import of the real `Attempt2`, the export/reuse of the existing `recovery-codecs.ts` `Attempt3Codec` from `record-codecs.ts` (one shape owner; old Attempt2 decoder unchanged), and extraction/reuse of exact compiled schema/metadata validation in `sqlite/schema.ts` before predecessor-zero conversion. The schema helper preserves inherited physical/version/migration/down/bundle guards without recursive history validation or a caller-selected legacy mode. Required `readRuntimeScope` capability propagates through verified execution readers and their full mocks; complete claim reciprocity stays in the mandatory full history audit reached by both public runtime readers. Local receipt annotations consume existing recovery-record types without a new external consumer or re-export. Fresh authority stage also applies the generation floor; immutable replay precedes that guard. Recovery/wire/reserved acceptance IDs follow design line13 command uniqueness; existing run/session coincidences remain allowed.

**Interfaces:** Add required `recovery: RecoveryCatalog` to `RuntimeCatalog`; `HistoryCatalog` obtains it through its required runtime catalog. Define in `plan-recovery-history.ts`:

```ts
interface RecoveryBarrier {
  readonly recoveryId: string; readonly scope: RuntimeScope;
  readonly scopeBefore: number; readonly scopeAfter: number; readonly generationFloor: number;
}
interface RecoveryCatalog {
  readonly histories: readonly RecoveryHistory[];
  readonly barriers: readonly RecoveryBarrier[];
  readonly active: readonly {readonly scope: RuntimeScope; readonly recoveryId: string}[];
  readonly counts: Readonly<{journals: number; fences: number; observations: number;
    closures: number; barriers: number; active: number}>;
}
type RuntimeScopeView2 = Omit<Extract<RuntimeScopeSnapshot2, {kind: 'pinned'}>,
  'activeRecoveryId' | 'recoveries'>;
reconstructRuntimePrefix(
  retained: RuntimeScopeRecord, catalog: RuntimeCatalog,
  ownership: OwnershipStatus, revision: number,
): RuntimeScopeView2;
auditRecoveryCatalog(catalog: RuntimeCatalog, ownership: OwnershipStatus): void;
verifyRecoveryHistory(artifacts: ArtifactStore, history: RecoveryHistory): Promise<void>;
```

Keep `reconstructRuntimeScope` as a current-publication entry point consuming a complete `RuntimeCatalog`, not filtered arrays. `scopePrefix` calls only `reconstructRuntimePrefix`. `auditRuntimeCatalog` calls the full recovery audit. Prefix associations inspect complete witnesses, but apply only events at or before the requested revision. Closed journals may justify original acceptance at n+1; they cannot introduce the n+2 barrier early. Scope views intentionally cannot answer current journal activity.

At this intermediate commit existing providers still store format3 and continue publishing legacy Snapshot1/ExecutionHistory1/RunSnapshot2 envelopes. Their internal catalog construction explicitly supplies a zero recovery catalog only after exact predecessor format/bundle/schema validation; in-memory creation explicitly initializes independent empty maps and counters. This is a recognized predecessor conversion, never a catch for a missing marker or an optional/default argument. Test successor envelopes/folds with complete explicit catalogs; do not relabel legacy stored state as a recovery-capable publication. Task3 switches both providers to successor read envelopes and replaces SQLite construction with mandatory physical recovery rows. No public format4 opening or recovery method exists yet.

- [x] **RED — old replies and hold capacity.** Add current-attempt union tests: Attempt3 hold reads as reserved, all old reply codecs still reject Attempt3, and a historical ClaimAcceptAck remains byte/value exact Attempt2. Add this focused positive/negative to `plan-recovery-history.test.ts`, obtaining `attempt` from existing `prepareSession`/`prepareClaimed` fixture at a claiming/ready checkpoint:

```ts
const held = decodeCurrentAttempt({
  ...attempt,
  version: 3,
  state: {
    kind: 'recovery_hold',
    cause: 'claim_accepted_fenced',
    closureId: 'recover-claim',
    checkpoint: attempt.state,
  },
});
expect(held.holdsCapacity).toBe(true);
expect(() => decodeAttempt(held)).toThrow();
expect(executionCheckpoint(held)).toEqual(attempt.state);
```

The fixture must narrow `attempt.state.kind === 'ready'` before this code; a wrong checkpoint has its own rejection test. `isExecuting` must continue accounting for the reservation; dispatch permission is checked separately.

- [x] **RED — valid complete catalogs and corrupted links.** Construct explicit valid catalogs for authority floor1/original expects2/accepted3/fence4, accepted claim authority1/fence2, and absent claim authority1/fence2. Include complete typed exchanges, original replies, closure/barrier/index/count rows and run/attempt revisions. Use table cases for same epoch1 and resolver epoch2. Assert authority floor1→3→4; claim floor1→1→2; absent claim1→2. Same epoch grant survives only the original acceptance prefix; resolver epoch2 projects null throughout. Assert `Object.hasOwn(prefix,'activeRecoveryId') === false` and `Object.hasOwn(prefix,'recoveries') === false`.
- [x] **Run RED:** `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/plan-recovery-history.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/recovery-history.test.ts --timeout=60000`.
- [x] **GREEN — complete read model.** Implement explicit version aliases, required witness propagation and strict folds. Current full catalog requires active index exactly equal to closure-null journals and the actual pending/staged target; closed journals require reciprocal barrier/closure/original acknowledgement/hold links and exact counts. Fold recovery hold as its own attempt event, and retain all original completion/outbox/decision/capacity checks. Add full witness verification to runtime and execution verified readers. Use `readRecoveryExchange` to rederive every value and claim projection, then compare the stored complete values; coherent same-ref rewrites must fail.
- [x] **GREEN — consumer propagation.** Pass required witnesses through `ClaimFacts/latestAuthority`, history `scopePrefix`, memory/SQLite raw reads and schema reopen. Reject acquisition preceding the latest applied barrier in claim building and turn dispatch before live reads/executor calls. Authority/claim winner lookup may replay original acknowledgement but must read complete verified history and must not grant live permission. Update all literal catalog fixtures and lifecycle/full-port mocks explicitly; search all references, not just compilation errors.
- [x] **R5:** Independently remove new active-index reciprocity, recovery counts, hold/closure linkage, barrier floor update and verified-value rederivation. Each production read/mutation/reopen negative must then admit its specific corruption or stale permission. Prefix positives must still pass with complete witnesses. Do not remove inherited pending/epoch/claim/attachment/outbox guards to manufacture failures.
- [x] **Validation:** Run focused commands, all existing runtime/execution/claim/turn contracts, and project typecheck. Inspect all `RuntimeCatalog`, `HistoryCatalog`, `reconstructRuntimeScope`, `ClaimFacts` and new snapshot union callers with `rg`; confirm no default empty recovery argument or unchecked current-row cast.
- [x] **Commit:** `git commit -m "feat(twilight-dash): fold complete recovery history and holds"` after staging only Task 2 files and evidence.

### Task 3: Preserve format3, install recovery storage, begin and interlock

**Files:** Task 3 table plus both adapters, shared recovery contracts/wrappers and lifecycle/race tests. Keep migrations0001–0003 byte-for-byte unchanged.

**Interfaces:** This task adds exactly one semantic method, with both providers fully implemented:

```ts
beginRecovery(call: RecoveryBeginCall): Promise<StoreReply<RecoveryHistory>>;
planRecoveryBegin(catalog: HistoryCatalog, call: RecoveryBeginCall): StoreReply<RecoveryHistory>;
```

`planRecoveryBegin` is pure; current-owner/clock admission stays in each provider's existing transaction boundary. Add explicit operator-callable adapter functions in `sqlite/migrate-recovery.ts`, exported directly from that module, outside RunStore:

```ts
interface SqliteMigrationIdentity {
  readonly name: string; readonly forwardHash: string; readonly downHash: string;
}
interface SqliteFormatIdentity {
  readonly version: 3 | 4; readonly bundleHash: string;
  readonly migrations: readonly SqliteMigrationIdentity[];
}
interface SqliteFormatTransition {
  readonly kind: 'upgraded' | 'downgraded';
  readonly before: SqliteFormatIdentity; readonly after: SqliteFormatIdentity;
}
type SqliteTransitionFailure = 'absent' | 'unreadable' | 'configuration' |
  'incompatible' | 'corrupt' | 'used_history' | 'contention' |
  'transition_failed' | 'cleanup_failed';
class SqliteFormatTransitionError extends Error {
  readonly failure: SqliteTransitionFailure;
  readonly path: string;
  readonly before: SqliteFormatIdentity;
  readonly after: SqliteFormatIdentity;
  readonly phase: 'preflight' | 'transaction' | 'committed';
  constructor(failure: SqliteTransitionFailure, path: string,
    before: SqliteFormatIdentity, after: SqliteFormatIdentity,
    phase: 'preflight' | 'transaction' | 'committed', cause: unknown);
}
upgradeSqliteStores(options: SqliteOptions): Promise<SqliteFormatTransition>;
downgradeUnusedSqliteStores(options: SqliteOptions): Promise<SqliteFormatTransition>;
```

Both functions open/close their own connection, validate required options/path/configuration, use existing bounded BUSY policy and one `BEGIN IMMEDIATE`, and return only after commit and successful owned cleanup. Their `SqliteFormatTransitionError` preserves the exact failure category, original cause, phase and intended complete before/after identities; map existing `SqliteOpenError` categories without losing absence versus unreadability and retain that error as cause. Complete intended identities never assert that unreadable/corrupt state was successfully inspected. A post-commit cleanup failure reports cleanup_failed with phase committed; it cannot claim rollback. Neither API bootstraps an absent path, repairs state, acquires semantic ownership, claims host-wide close, nor silently treats the wrong version as a duplicate. Retain exported immutable `FORMAT3_IDENTITY` and `FORMAT4_IDENTITY` in `format.ts`; the former hashes the unchanged first three artifacts and equals `d11130ee5ca84e51cb843daf8fbfc5695b704e3aecea1fb6d7c00234b2f43aed`. The latter is calculated from all four actual forward/down artifacts, not a made-up literal.

Pin these complete predecessor migration identities in compatibility assertions (source hashes, not proof of an inspected DB):

| Name                     | Forward SHA256                                                     | Down SHA256                                                        |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `0001-run-store`         | `eac7079d3b5ce666ce83ad10fc152fed03c63d095cbece5be3650260d5515e2b` | `51c0699efa5f96a726474052a0ecb736ecf0adb6acd22d5c1be0d384e8d70772` |
| `0002-runtime-authority` | `828fca1d887833f8f21f60863c68bb4396853e6132a62b50c844987976421393` | `ae045a2e32f92ba9f6d4c73ce488d923b16d850ba30ff76e314c068e255036dd` |
| `0003-execution-history` | `f61904834a9bfceaba5b4264684ada8d6c7f65704f4292816688b91db5fe2fab` | `fcb81adc1aab74ce96d5f87605e78a39f603cf481ffb13a599d2443b15c8aab9` |

- [x] **RED — genuine predecessor fixture.** Create `testing/format3-worker.ts`, `testing/format3-fixture.ts` and `recovery-migration.db.test.ts` using the pinned BASE provider and the boot/populate/capture/close subset of the concrete protocol defined in Task8. This task implements that subset completely; Task8 extends it for races. It must actually load source from that immutable revision before creating the DB. Preserve initial/current runs, Attempt2 states, all execution records/replies/contexts, admissions, decisions/consumptions, completions/receipts/pending outbox, runtime intents/acceptances, reservations, artifacts, metadata owner/clock and old schema declarations. Ordinary current open of format3 must refuse without migration; explicit upgrade must preserve old values/bytes while adding format4 metadata and empty new families.
- [x] **RED — begin/replay/interlock in both providers.** In shared `recoveryContract(name, create)` with `create: () => Promise<StoreFixture & {artifacts:ArtifactStore}>`, copy the existing contract fixture lifecycle. This executable example uses only existing setup and the new begin port:

```ts
const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
const original = unwrapReply(
  await stores.runs.stageRuntimeRequest(
    { ownership, scope: runtimeScope, expectedRevision: 0 },
    authorityRequest('original', 2),
  ),
);
const call: RecoveryBeginCall = {
  kind: 'authority',
  guard: { ownership, scope: runtimeScope, expectedRevision: 1, expectedRecoveryRevision: 0 },
  intent: {
    version: 1,
    recoveryId: 'recover-authority',
    target: { kind: 'authority', original },
    begunScopeRevision: 1,
    resolver: { ownerId: ownership.ownerId, epoch: ownership.epoch },
  },
};
expect(await stores.runs.beginRecovery(call)).toMatchObject({
  kind: 'applied',
  value: {
    version: 1,
    revision: 0,
    fences: [],
    observations: [],
    closure: null,
  },
});
expect(await stores.runs.beginRecovery(call)).toMatchObject({ kind: 'duplicate' });
expect(
  await stores.runs.recordRuntimeAcceptance(
    { ownership, scope: runtimeScope, expectedRevision: 1 },
    { intent: original, evidence: runtimeEvidence },
  ),
).toEqual({ kind: 'refused', reason: 'state_conflict' });
expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
  version: 2,
  revision: 1,
  pendingCommandId: 'original',
  activeRecoveryId: 'recover-authority',
});
```

Add acceptance-before-begin and begin-before-acceptance races through separate real SQLite connections/processes; claim equivalents use actual retained stage/session and correct attempt/run guards. Wrong retained target kind, original, scope, stage, acceptance identity, guard provenance and stale revisions must fail without a journal.

- [x] **Run RED:** `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/recovery.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/recovery.db.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/recovery-migration.db.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/recovery-races.db.test.ts --timeout=60000`.
- [x] **GREEN — additive storage.** Add `run_recovery_journal`, `run_recovery_fence`, `run_recovery_observation`, `run_recovery_closure`, `run_recovery_barrier`, `run_recovery_active` and `run_recovery_format`. Use strict physical keys/FKs: journal links original command+scope; fence/observation key `(recovery_id,ordinal)`; closure key recovery ID; barrier key `(scope_key,scope_after)`; active scope unique and recovery ID unique. The singleton tracks exact journal/fence/observation/closure/barrier/active counts separately from unchanged `run_format` shape. Persist full canonical JSON records plus required independent keys/revisions. Enforce command collisions against ordinary runtime/execution identities in the locked catalog. Preserve artifact storage and old metadata shapes.
- [x] **GREEN — explicit migration boundary.** Schema/history readers may use a required private format descriptor to validate exactly format3 or4 inside the adapter migration boundary. Ordinary open and current semantic mutations always select the compiled current identity; neither caller configuration nor inspected metadata may select a legacy descriptor for those paths. Keep every installed guard effective and do not expose a general allow-legacy option. Derive exact predecessor schema from the first three unchanged migrations, run all original metadata/bundle/full-history/capacity/quick/foreign-key checks under the write lock, execute each0004 statement fail-fast, initialize new empty families/marker, update version and complete bundle together, validate complete successor and commit. Fresh bootstrap executes0004 and initializes the same marker once. There is no accepted format3 path that merely skips format4 validation after a catch.
- [x] **GREEN — unused down.** Add adjacent complete-statement `down.sql`. Validate full format4 identity/history first. Refuse any new journal/fence/observation/closure/barrier/active use, inconsistent counts/markers, Attempt3 or other successor-only discriminants even if the active index is empty. Allow old populated attempts/executions/outcomes when new recovery is unused. Drop only new structures in FK-safe order; restore exact format3 bundle/version and validate predecessor before commit. Never copy0003's blanket no-attempt/no-execution guard. A late failure rolls back SQL and temporary guard state; no destructive used-history reversal exists.
- [x] **GREEN — begin plus all interlocks.** Clone calls before queueing; preserve owner-before-target audit, full history audit, then immutable replay before fresh checks. Begin inserts one journal/index, revision0, unchanged scope/run/attempt/capacity. Add new fresh checks to recordRuntimeAcceptance, recordClaimAcceptance and recordExecution after their own immutable replay. For the exact active claiming target, retain the existing outcome turn-checkpoint, receipt pending-outcome and consumption matching-wait guards; prove their public refusal and unchanged checkpoint/capacity instead of adding redundant predicates. A future broader recovery target must revisit those implications. Active-target recordExecution may only record recovery_required/unresolved while retaining checkpoint and capacity. Installed pending/state guards continue blocking stageRuntimeRequest/stageClaim/stageTurn. SQLite current Attempt3 reads and closed used-history down refusal are covered by a complete physical fixture; memory current-row decoding and resolver-produced hold parity are the mandatory Task6 obligation below. Generic hold-state planners retain their existing refusal/replay rules. Safe decision/evidence retention may advance the run revision; resolver must use the actual current revision. Unrelated work, renew/acquire ownership and artifact retention keep installed behavior.
- [x] **R5:** Remove each new interlock independently after legitimate replay and show its public mutation bypasses the active journal/hold. Add missing/extra marker, family deletion, wrong physical key/count, target association and wrong format identity negatives through read/mutate/reopen. Fault the new migration's complete-bundle publication dependency and demonstrate an actual pinned old writer admits work; keep its inherited bundle check installed. Inject a late migration/down SQL failure and compare all rows/schema/metadata after rollback.
- [x] **Validation:** Run focused tests and typecheck, old runtime/execution/outcome/receipt/decision contracts and local lifecycle tests. Read exact0001–0003 forward/down hashes before/after. Record upgrade/down reports with both complete identities. This commit supports a safe retained recovery halt, not completed recovery.
- [x] **Commit:** `git commit -m "feat(twilight-dash): preserve stores and interlock recovery journals"` with only complete Task 3 files/evidence.

**Task3 fixture and proof boundaries (controller rulings):** The original-source worker is pinned to BB14 and implements only boot, ten population histories, exact main/temp capture, close and a typed fresh `retainManifest` invocation. A separate current-provider worker implements only begin/authority acceptance/claim acceptance, with a real SQLite trigger callback and bounded entered/release handshake; the competitor observes actual BUSY. Full old-writer mutation and queue matrices remain Task8. New0004 source-byte refusal tests use isolated copied source and fresh processes for forward-only and down-only edits. Down's API precheck is a typed `used_history` diagnostic refinement; the independently executed production SQL guard owns direct-artifact destruction refusal. No test removes both guards.

### Task 4: Stage exact dominating fences with bounded identities

**Files:** Extend `R/plan-recovery.ts`, `R/plan-recovery.test.ts`, `R/recovery-codecs.ts`, both providers, `R/sqlite/recovery-store.ts`, `R/testing/recovery-contract.ts`, both recovery wrappers and lifecycle enumeration.

**Interfaces:** Add only this complete method to RunStore and both providers:

```ts
stageRecoveryFence(call: RecoveryCall<RecoveryFenceInput>): Promise<StoreReply<RecoveryFence>>;
planRecoveryFence(
  catalog: HistoryCatalog, call: RecoveryCall<RecoveryFenceInput>,
): StoreReply<RecoveryFence>;
```

The provider persists the returned fence, increments the retained journal revision once and its fence count once. `RecoveryFence.stagedRevision` is the new recovery revision, not a scope or attempt revision. Scope/run/attempt/capacity remain unchanged. Ordinals are1–3. New fence/request/recovery/local acceptance IDs participate in the appropriate global immutable identity domains. Replays return retained original provenance and do not increment anything.

- [x] **RED — initial domination and null boundary.** Add positive tests at original expected2 with typed state2 and fence accepted generation3; for accepted-original recovery Task6 later requires a further fence above actual accepted3. Reject initial state1 for original expected2, state-null for nonnull original, overflow at MAX_SAFE_INTEGER and null-initialization fence if it would fail to defeat the old null expectation. Pin/scope/ledger/context/value/ref and exact canonical digest must match. Include allowed original-null/state-null fence expecting null, whose acceptance generation1 defeats a delayed null request; if the original actually accepted1, its receipt forces a stronger fence before closure.
- [x] **RED — supersession and replay.** Build initial fence using actual-byte state exchanges from Task1. Stage with retained owner and expectedRecoveryRevision0; test immutable duplicate after revisions advance and identity conflict for changed bytes under that ID. Supersession requires actual later state strictly above the prior expected generation, followed by exact prior-fence404 whose context names that state envelope. Reject a receipt-found lookup, wrong prior ordinal/digest/state link, generation regression, ordinal gap, fourth identity and claim/authority call-kind substitution.
- [x] **Add this executable shared-contract assertion** after constructing `call: RecoveryCall<RecoveryFenceInput>` with validated initial state/retained journal; all these input types are defined in Task1:

```ts
const before = await stores.runs.readRuntimeScope(call.guard.scope);
const staged = unwrapReply(await stores.runs.stageRecoveryFence(call));
expect(staged.stagedRevision).toBe(call.guard.expectedRecoveryRevision + 1);
expect(await stores.runs.stageRecoveryFence(call)).toEqual({ kind: 'duplicate', value: staged });
const changed = structuredClone(call);
Object.assign(changed.input.fence, { requestDigest: artifactDigest('f'.repeat(64)) });
await expect(stores.runs.stageRecoveryFence(changed)).rejects.toThrow();
const after = await stores.runs.readRuntimeScope(call.guard.scope);
if (before.kind !== 'pinned' || after.kind !== 'pinned') throw new Error('fixture pin missing');
expect(after.revision).toBe(before.revision);
expect(after.pendingCommandId).toBe(before.pendingCommandId);
```

A malformed canonical digest throws at the boundary; a valid changed canonical request with the same command identity returns existing `identity_conflict`. Test those separately.

- [x] **Run RED:** `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/plan-recovery.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/recovery.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/recovery.db.test.ts --test-name-pattern='recovery fence' --timeout=60000`.
- [x] **GREEN — pure plan and both adapters.** Decode/clone before queueing; owner/clock and complete audits precede immutable replay, which precedes fresh guard/revision/pending checks. Compare every retained target association and trusted typed basis without artifact IO. Check safe increment and expected generation against state and original threshold. Preserve complete supersession witnesses. Apply one independent memory-map update set or transaction-local SQL insertion/revision/count update. No HTTP occurs in these methods.
- [x] **R5:** Independently bypass new threshold domination, supersession state→lookup linkage, ordinal/count budget, global identity and target-kind guards. Public stage/read tests must observe acceptance of the precise invalid fence, not only a changed diagnostic. The real receiver delayed-original control proving domination is Task7; pure planner tests alone do not earn that credit.
- [x] **Validation:** Rerun RED command GREEN, complete recovery contracts, typecheck and closed/queued lifecycle cases with stageRecoveryFence included.
- [x] **Commit:** `git commit -m "feat(twilight-dash): stage bounded recovery fences"`.

### Task 5: Record immutable verified fence observations

**Files:** Same provider/planner/contract files as Task4; extend `R/recovery-history.test.ts`, `R/runtime-history.ts`, `R/claim-history.ts` and SQLite recovery reopen cases only as needed for actual observation records.

**Interfaces:** Add only this fully implemented port:

```ts
recordRecoveryFence(call: RecoveryCall<RecoveryFenceReplyInput>): Promise<StoreReply<RecoveryObservation>>;
planRecoveryObservation(
  catalog: HistoryCatalog, call: RecoveryCall<RecoveryFenceReplyInput>,
): StoreReply<RecoveryObservation>;
```

`RecoveryObservation` preserves its full accepted/generation_conflict discriminant, exact retained fence, exchange/body values and observedRevision. One observation per fence is immutable; fresh adds one journal revision, duplicate adds zero. `AcceptedRecoveryFence` is the retained fence plus its actual accepted observation, never an arbitrary authority certificate.

- [x] **RED — correspondence and original retained value.** Test accepted and generation_conflict observations with exact fence_reply context, recovery/ordinal/requestDigest/stagedRevision and body reference. Verify accepted authority generation equals expected+1 (null→1), owner and ledger/scope match canonical request and full supplied fence equals retained fence. Reject future/foreign/missing staged fence, changed observation under same ordinal, wrong guard kind or stale fresh revision. Return original retained observation on identical replay even under a later legal resolver epoch.
- [x] **Add this executable shared-contract assertion** with a successfully staged `fence`, actual verified `reply`, and current `guard`:

```ts
const call: RecoveryCall<RecoveryFenceReplyInput> = {
  kind: 'authority',
  guard,
  recoveryId: fence.recoveryId,
  input: { kind: 'accepted', fence, reply },
};
const observed = unwrapReply(await stores.runs.recordRecoveryFence(call));
expect(observed.observedRevision).toBe(fence.stagedRevision + 1);
expect(await stores.runs.recordRecoveryFence(call)).toEqual({ kind: 'duplicate', value: observed });
const scope = await stores.runs.readRuntimeScope(guard.scope);
if (scope.kind !== 'pinned' || scope.version !== 2)
  throw new Error('fixture recovery scope missing');
expect(
  scope.recoveries.find((history) => history.intent.recoveryId === fence.recoveryId),
).toMatchObject({ revision: observed.observedRevision, observations: [observed], closure: null });
```

Derive `reply` by retaining a real response and using Task1 reader, not casting a partial receipt. Protocol simulations are allowed in shared storage contracts; real receiver causality is separately required in Task7.

- [x] **Run RED:** `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/recovery.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/recovery.db.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/recovery-history.test.ts --test-name-pattern='recovery observation' --timeout=60000`.
- [x] **GREEN — apply complete observation.** Implement pure structural/value comparisons and direct independent provider persistence. Retain complete typed exchange values with references; strict synchronous row decoding must reject missing fields. Reopen audits use the same complete recovery catalog and count rules. Verified history rereads the actual envelope/body bytes, including old observations after a later accepted fence supersedes them.
- [x] **R5:** Bypass only new retained-fence equality, fence_reply context/body-reference correlation or exact increment validation and observe an invalid public observation admission. Rewrite coherent stored state/receipt values with unchanged refs so raw structural audit succeeds but verified read rejects; bypassing the new verification delegation must expose the forged value. Test missing and unreadable historical bytes independently.
- [x] **Validation:** Run focused tests GREEN, complete recovery contracts, typecheck and observation closed/queued/reopen coverage.
- [x] **Commit:** `git commit -m "feat(twilight-dash): retain verified recovery observations"`.

**Task5 completion boundary:** Implemented and locally verified in `c2ba5d9f97a2ca5701f5ebe704b56706f2a49233`; the scoped workflow-record follow-up and exact commands/proofs are in [Task5 verification](recovery-verify.md#task5-immutable-verified-fence-observations-2026-10-29). Existing Tasks1–2 observation verification was reused unchanged; its omission proof is inherited-owner coverage, not new validation or transport authenticity. Independent task review remains pending. Task6, R2 parent acceptance and architectural main merge remain open.

### Task 6: Plan and publish closure atomically from one valid predecessor

**Completed producer-dependent adapter repair (Task3 controller ruling, 2026-10-29):** Task6 reproduced both strict-current-row failures using actual resolver-produced holds, then changed memory `requireAttempt` and `admitAttempt`'s all-row scan to `decodeCurrentAttempt`; historical decoders remain strict. See the Task6 verification record. The original acceptance requirement follows: Task3 cannot publish Attempt3 through any memory mutation port; leave its intermediate safe-halt commit explicitly unready for full R2. Before exposing or committing complete `resolveRecovery`, reproduce and fix these current-row paths using the first actual resolver-produced valid closed hold. Both providers must pass `resolveRecovery → readRun`, unrelated valid admission with a held attempt present, typed fresh hold refusal preserving checkpoint/capacity, and exact old acknowledgement replay. Current rows must use `decodeCurrentAttempt`; all stored historical acknowledgement decoders stay strict Attempt2. No synthetic public seeding port, no Task6 completion, and no R2 main merge before these controls pass.

**Files:** `R/plan-recovery.ts`, `R/plan-recovery.test.ts`, `R/plan-claims.ts`, `R/validate-history.ts`, both adapters, `R/sqlite/recovery-store.ts`, `R/sqlite/runtime-store.ts`, shared recovery contracts and SQLite recovery/race/migration/lifecycle tests.

**Interfaces:** Add the final semantic port and its pure plan:

```ts
interface RecoveryResolutionPlan {
  readonly closure: RecoveryClosure;
  readonly originalAcceptance: RuntimeAcceptance | null;
  readonly originalExecution: Extract<RecordedExecution, {command: ClaimAcceptCommand}> | null;
  readonly barrier: RecoveryBarrier;
  readonly attempt: Attempt3 | null;
  readonly run: Run | null;
  readonly history: RecoveryHistory;
  readonly counts: RecoveryCatalog['counts'];
  readonly active: RecoveryCatalog['active'];
}
planRecoveryResolution(
  catalog: HistoryCatalog, call: RecoveryResolveCall,
): StoreReply<RecoveryResolutionPlan>;
resolveRecovery(call: RecoveryResolveCall): Promise<StoreReply<RecoveryClosure>>;
```

`originalExecution` is the ordinary accept_claim record with its old-shaped ready acknowledgement and exact historical scope context. `attempt` is the final hold; `run` contains the final revision. The plan contains final complete counts/index/history so writers perform no consequential planning after their first write. On duplicate, return the retained closure and no writes; implement the adapter's duplicate path before constructing a fresh resolution plan so the plan is never applied twice. The plan type is internal production composition, not another RunStore port.

- [x] **RED — actual predecessor/cuts.** Use accepted authority original expects2/accepted3/fence4 with same epoch and new resolver; assert scope n+1 original acceptance then n+2 barrier. Accepted claim uses actual ClaimReceipt fields and current claiming/reconciling/unresolved predecessor: existing pure `claimAcceptTransition` derives ready Attempt2/binding, then separate hold increments attempt/run again. Absent claim creates claiming hold in one increment, no binding/claimId. Authority creates no attempt/run consequence. Assert floor/grant/capacity/provenance at every cut from the approved design table and preserve original replay exactly.
- [x] **RED — one valid predecessor.** Tests must refuse a copied old guard masquerading as current ownership, mismatched retained target/stage/session/acceptance command, resolver epoch before stage/fence, accepted fence no longer matching its immutable observation, fence generation equal to original accepted generation, pre-fence404 context, unbound envelope/body and accepted-claim command inconsistent with actual receipt. Keep all installed ownership/claim/attachment/capacity/outbox guards. Accepted authority and claim decisions have distinct reply correspondence; authority cannot carry a claim command/hold.
- [x] **Add this executable shared-contract assertion** with current `call: RecoveryResolveCall` built from verified actual lookup and the retained accepted fence:

```ts
const closed = unwrapReply(await stores.runs.resolveRecovery(call));
expect(await stores.runs.resolveRecovery(call)).toEqual({ kind: 'duplicate', value: closed });
const scope = await stores.runs.readRuntimeScope(call.guard.scope);
expect(scope).toMatchObject({
  version: 2,
  pendingCommandId: null,
  activeRecoveryId: null,
  grant: null,
  revision: closed.scopeAfter,
});
if (call.kind === 'claim') {
  const run = await stores.runs.readRun(call.guard.runId);
  const attempt = run.attempts.find((candidate) => candidate.attemptId === call.guard.attemptId);
  expect(attempt).toEqual(closed.attemptReply);
  expect(attempt).toMatchObject({
    version: 3,
    holdsCapacity: true,
    state: { kind: 'recovery_hold', closureId: closed.recoveryId },
  });
  if (closed.originalReply?.kind === 'claim') {
    expect(closed.originalReply.ack.attempt).toMatchObject({
      version: 2,
      state: { kind: 'ready' },
    });
    const { expectedRecoveryRevision: _recoveryRevision, ...ordinaryGuard } = call.guard;
    expect(
      await stores.runs.recordClaimAcceptance(ordinaryGuard, closed.originalReply.command),
    ).toEqual({ kind: 'duplicate', value: closed.originalReply.ack });
  }
}
```

Project only the recovery-only `expectedRecoveryRevision` out of the ordinary guard; preserve its current ownership and every submitted ordinary revision unchanged. The old strict guard decoder remains unchanged. Use a current valid ownership guard for replay; stale-owner refusal remains ahead of immutable replay. Run/attempt/scope stale revision values on an otherwise valid exact replay retain the installed replay behavior.

- [x] **Run RED:** `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/plan-recovery.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/recovery.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/recovery.db.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/recovery-races.db.test.ts --test-name-pattern='recovery closure' --timeout=60000`.
- [x] **GREEN — pure closure.** Audit the complete catalog and owner once at a valid locked predecessor, perform all fresh revision/correspondence checks, derive original acceptance and claimAcceptTransition consequences without fabricating old Ownership, compute barrier/hold/closure/count/index/final revisions, then apply all low-level writes directly. Neither provider calls public recordClaimAcceptance, operational planClaimAcceptance, requireAttempt or full readHistory between partial writes. Memory prepares cloned map changes before publication; SQLite uses its existing synchronous callback under BEGIN IMMEDIATE. Only original n and final n+2/n+1 are externally published.
- [x] **RED/GREEN — late rollback.** Add real BEFORE triggers that raise ABORT after original acceptance/execution was inserted and after closure plus barrier/hold was written but before journal/index/count finalization (the existing immediate barrier-to-closure foreign key requires closure insertion first). Trigger predicates assert earlier writes exist, so they cannot accidentally fail before the tested boundary. Capture all run_% rows, sqlite_schema/temp schema, metadata and artifacts; assert exact predecessor after rollback and reopen, including reservation/index/counts, then remove trigger and succeed. Inject rollback/commit/cleanup dependency faults using existing error-preservation seams and retain all causes. Instrument the new write application boundary so a full history read between writes makes the test fail.
- [x] **R5:** Break only the new closure's transaction/application dependency or one new exact association/order check. Observe durable partial publication or invalid closure through real provider calls/reopen, restore and rerun. Test hold generic mutation refusal and original acknowledgement replay side by side. Down refuses used closed histories even when active count is0; it leaves rows/schema unchanged.
- [x] **Validation:** Run focused tests GREEN, complete read/recovery/execution contracts, all late-abort cases, typecheck and local lifecycle with all four methods. Confirm no external IO/await inside the synchronous SQL planning/apply callback.
- [x] **Commit:** `git commit -m "feat(twilight-dash): close recovery atomically with retained capacity"`.

### Task 7: Dispatch recovery through actual receiver fences and ordered capture

**Files:** Exact new consumer policy selectors in `apps/twilight-structure/twilight-dash/eslint.product.mjs` and effective-policy tests in `tools/tool-devsync/src/eslint-boundaries.test.ts` also belong to Task7; only the receiver fixture may import the exact composed organization harness, all peer/alias/relative/helper denials remain. All Task7 files in ownership table; extend existing authority/claim dispatch regressions without changing their lookup-only duplicate policy. Reuse actual receiver/controller fixture mechanisms in `apps/wbs/be-01/src/controller/runtime-authority.db.test.ts` and `runtime-command.controller.db.test.ts` through owned recovery test composition, not a source import from a `.test.ts` that executes its suite.

**Interfaces:** The helper accepts identity/guard inputs, never caller-supplied lookup bytes or exchange envelopes:

```ts
type RecoveryDispatchCall =
  | {readonly kind: 'authority'; readonly guard: AuthorityRecoveryGuard;
      readonly recoveryId: string}
  | {readonly kind: 'claim'; readonly guard: ClaimRecoveryGuard;
      readonly recoveryId: string};
type RecoveryClientReply = Awaited<ReturnType<RuntimeClient['readState']>>['reply'] |
  Awaited<ReturnType<RuntimeClient['lookupReceipt']>>['reply'] |
  Awaited<ReturnType<RuntimeClient['acquireAuthority']>>['reply'];
type RecoveryDispatchObservation =
  | Extract<RecoveryClientReply, {kind: 'refusal'}>
  | Extract<RecoveryClientReply, {kind: 'failure'}>
  | {readonly kind: 'cancelled_before_dispatch'}
  | {readonly kind: 'below_threshold'; readonly state: RecoveryExchangeValue<RuntimeState>};
type RecoveryDispatchReply =
  | {readonly kind: 'resolved'; readonly closure: RecoveryClosure}
  | {readonly kind: 'refused'; readonly reason: StoreRefusal}
  | {readonly kind: 'pending'; readonly recoveryId: string;
      readonly reason: 'cancelled' | 'transport' | 'receiver_refused' | 'below_threshold';
      readonly observation: RecoveryDispatchObservation};
type RecoveryRuns = Pick<RunStore, 'readRuntimeScope' | 'readExecutionHistory' | 'readRun' | 'readManifest' |
  'renewOwnership' | 'stageRecoveryFence' | 'recordRecoveryFence' | 'resolveRecovery'>;
dispatchRecovery(
  runs: RecoveryRuns, artifacts: ArtifactStore, client: RuntimeClient,
  call: RecoveryDispatchCall, signal: AbortSignal,
): Promise<RecoveryDispatchReply>;
```

The complete validated observation accompanies each modeled pending reason; no opaque trusted-state observation is accepted. Only cancellation/transport client failure codes are modeled pending outcomes; invalid response/schema/helper-capture failures throw. Inherited client clone/body-read faults retain transport classification and exact cause; third-POST transport throws exhausted, earlier transport remains pending, cancellation remains controlled. Define `RecoveryDispatchError extends Error` with frozen `recoveryId: string`, `original: RuntimeIntent`, `fence: RecoveryFence | null`, `code: 'exhausted' | 'unexpected'` and original cause; exhaustion throws this correlated error.

`dispatchRecovery` consumes an already committed begin journal discovered through complete verified scope history; callers use beginRecovery explicitly. Guard snapshots precede the first await; discovered journals are immediately cloned before verification IO. Discovery without an original throws a contextual ordinary Error with recoveryId/scope/cause. Claim recovery uses the complete verified execution-history reader and its required existing readManifest capability. Internal `captureRecoveryExchange` takes an actual RuntimeClient response and the helper-generated context/request, retains its exact body bytes and envelope, then calls Task1 reader. It is private and offers no caller-provided capture shortcut. The original lookup context can be constructed only from the awaited successful recordRecoveryFence return.

- [x] **RED — actual receiver fixture.** Build `createRecoveryReceiver(): Promise<RecoveryReceiverFixture>` in `testing/recovery-receiver.ts` using existing WBS SQLite source and real receiver/controller composition. Define the fixture with `client: RuntimeClient`, `scope: RuntimeScope`, `ledgerId: string`, `requests: readonly {operationId:string;commandId:string|null}[]`, `close():Promise<void>`, and narrowly controlled request barriers `pause(commandId:string): {entered:Promise<void>;release():void}`. The client uses `createRuntimeClient` over actual Response transport; pause observes the real request before receiver admission. Seed real organization/person/work/step, authority and claim through production APIs; obtain actual returned claimId/actor/basis. Add complete cleanup/child/connection ownership and bounded waits.
- [x] **RED — delayed-original counterexample/control.** At receiver generation1, retain an original authority request expecting2 and hold its delivery. A weak expected1 fence accepts2, after which delayed original accepts3: this is the decisive unsafe control. Production recovery must refuse state1 below threshold2, or after real advancement use state≥2 and commit a fence strictly above original's accepted generation if lookup finds acceptance. For claim authority1, real fence2 must make delayed claim1 refuse. Check actual receiver receipt lookup and durable ledger, not a mocked comparison or model. Demonstrate accepted original ready binding and subsequent hold with actual receipt-derived fields.
- [x] **RED — commit then capture.** Wrap the real provider recordRecoveryFence with an owned deferred return after invocation but before acknowledgement; block the helper's original lookup while the commit acknowledgement is unresolved. Record trace events at actual transaction commit/return and actual transport entry. The critical assertion is:

```ts
expect(trace).toContain('fence-stage-committed');
expect(trace.indexOf('fence-post')).toBeGreaterThan(trace.indexOf('fence-stage-committed'));
expect(trace).not.toContain('original-lookup');
releaseObservation.resolve(undefined);
await dispatch;
expect(trace.indexOf('original-lookup')).toBeGreaterThan(trace.indexOf('observation-committed'));
```

`trace: string[]`, `releaseObservation = Promise.withResolvers<void>()`, and `dispatch` are owned by this test; append entries at the actual wrapper/transport events. Before releasing, assert the trace after the transport/commit entered handshake, never a sleep guess. Add supersession state-before-dependent-lookup ordering and stale pre-fence404 association rejection with plausible but mismatched typed links. Fully fabricated identical later links are not distinguishable here; only real helper/transport handshakes and faults earn chronology credit.

- [x] **Run RED:** `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/recovery-dispatch.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/recovery-dispatch.db.test.ts --timeout=60000`.
- [x] **GREEN — bounded orchestration.** Read and verify complete retained history; replay closed journal without POST. Renew current ownership and check live cancellation before every POST. Reuse retained exact fence bytes after pre-send/lost-reply crashes; only this helper has retransmission permission. Track POST count per invocation independently from persisted three-identity limit. Use actual state and receipt lookup for supersession; no fourth identity. On accepted fence, retain/verify reply, await recordRecoveryFence, create original_lookup context naming observation ordinal/revision/envelope/body refs, perform a new capture, verify it and derive accepted/absent decision. For accepted claim derive command through Task1. Preserve the submitted owner, run, attempt and scope preconditions across awaits; advance recovery revision only by this invocation's exact successful acknowledgements. A concurrent safe evidence change that advances a guarded revision causes the precise refusal and leaves recovery unresolved; a new explicit invocation may inspect and supply current guards. Never refresh captured guards after a lookup. Corrupt/unavailable trusted evidence throws correlated unexpected error; cancellation/transport/validated receiver refusal/below-threshold stays unresolved with precise observation. POST-budget exhaustion throws correlated exhausted error, journal active and capacity reserved.
- [x] **RED/GREEN — crash, contention and bounds.** Test before-send crash, lost fence reply after real acceptance, generation conflict, late accepted lookup, original lookup unavailable/forbidden/wrong project/wrong ledger, state below threshold, overflow, owner takeover, cancelled before/after waits and resume under new resolver. Assert ≤3 POSTs per invocation and ≤3 unique canonical fence identities per journal. The fourth attempted send is prevented; a new invocation may retry the identical retained third fence. After exhaustion inspect journal/attempt/reservation. Test first two real conflicts plus third acceptance/lost reply, then successful exact-third retransmission. Separately test three durable conflicts stay safely unresolved with no fourth identity; that cap can leave a terminal safe halt requiring subsequent operator/replacement work. Original authority and claim duplicate helpers still send zero POSTs.
- [x] **R5:** Break only new helper await/capture/budget/threshold dependencies and observe actual premature POST/lookup, fourth send or real receiver unsafe control. Keep receiver monotone CAS, public schema, canonical digest, old replay and store guards installed. Typed contexts alone earn no chronology/authenticity credit.
- [x] **Validation:** Run focused tests GREEN plus ordinary authority/claim/turn dispatch contracts, typecheck and provider recovery suites. Record actual receiver state/receipt observations, not only trace ordering.
- [x] **Commit:** `git commit -m "feat(twilight-dash): dispatch bounded journaled recovery"`.

### Task 8: Prove populated-store compatibility and deliver the review packet

**Files:** Extend `R/testing/format3-worker.ts`, `R/testing/format3-fixture.ts`, `R/sqlite/recovery-migration.db.test.ts`; create `R/sqlite/recovery-compatibility.db.test.ts`; extend recovery race/lifecycle tests; update this checklist and `recovery-verify.md`. No production weakening and no production deploy.

**Interfaces:** The Task3 minimal fixture grows into a process protocol with discriminated requests `populate | capture | invoke | hold_write | release_write | close`. Define exact typed request/response records in `format3-fixture.ts` for those actions; invocation family is the explicit public mutation method-name union, with each method's `Parameters<RunStore[Method]>` selected by its discriminator. Never send an arbitrary evaluation string. Worker readiness reports `{kind:'ready', sourceCommit:string, format:SqliteFormatIdentity}` after old module/constants load; parent requires BASE SHA and complete format3 bundle. Every call has a unique request ID, bounded response wait, owned cancellation and complete pipe/exit cleanup.

The concrete process messages are defined below. `parameters` for invoke are decoded at the worker boundary by the exact old command/guard codecs; errors preserve their code/name/message and original diagnostic causes in the test record. Include `ArtifactStore.retainArtifact` separately for the approved exception, using base64 bytes in JSON transport and decoding before the actual provider call.

```ts
type Format3Mutation =
  | 'acquireOwnership'
  | 'renewOwnership'
  | 'retainManifest'
  | 'createRun'
  | 'admitAttempt'
  | 'pinRuntimeScope'
  | 'stageRuntimeRequest'
  | 'recordRuntimeAcceptance'
  | 'recordExecution'
  | 'stageClaim'
  | 'recordClaimAcceptance'
  | 'stageTurn'
  | 'receiveDecision'
  | 'consumeDecision'
  | 'commitOutcome'
  | 'reconcileReceipt';
type Format3Invocation = {
  [M in Format3Mutation]: {
    readonly kind: 'invoke';
    readonly requestId: string;
    readonly method: M;
    readonly parameters: Parameters<RunStore[M]>;
  };
}[Format3Mutation];
type Format3Population =
  | 'queued'
  | 'prepared'
  | 'authority_pending'
  | 'authority_accepted'
  | 'claim_pending'
  | 'claim_accepted'
  | 'decision_consumed'
  | 'outbox_pending'
  | 'receipt_settled'
  | 'ownership_takeover';
type Format3Request =
  | Format3Invocation
  | {
      readonly kind: 'populate';
      readonly requestId: string;
      readonly population: Format3Population;
    }
  | {
      readonly kind: 'retain_artifact';
      readonly requestId: string;
      readonly base64: string;
      readonly mediaType: string;
    }
  | {
      readonly kind: 'capture' | 'hold_write' | 'release_write' | 'close';
      readonly requestId: string;
    };
type SqliteCaptureCell = null | string | number | bigint | Uint8Array;
interface Format3Capture {
  readonly schema: readonly {
    readonly database: 'main' | 'temp';
    readonly type: string;
    readonly name: string;
    readonly table: string;
    readonly sql: string | null;
  }[];
  readonly tables: readonly {
    readonly name: string;
    readonly columns: readonly string[];
    readonly rows: readonly (readonly SqliteCaptureCell[])[];
  }[];
}
```

Capture encoding preserves cell type and byte content (tag bigint decimal and blob base64 for JSON IPC); it must not compare only parsed semantic objects. `hold_write` owns a separate blocker connection for BUSY/queued cases. To prove an old **production callback** already in its transaction, use a fixture-installed SQLite trigger calling a bounded synchronous test function: it emits an entered marker and waits for a parent-created release file under the fixture directory, then resumes the real old provider operation. The pinned `createSqliteRunStore(database, options)` accepts the fixture-owned native connection; validate/configure it through the pinned schema functions first, register the fault function/trigger, and call the actual old adapter. The parent concurrently starts upgrade and confirms it cannot obtain the lock until release. Deadline throws, cleanup always releases/terminates owned children, and no production callback is made asynchronous. Native close/checkpoint/WAL/SHM activity must be captured and attributed separately from prohibited logical-row mutations.

The fixture materializes source from `git archive bb14bb1cf3afc0559e4d0864374e11c652751751` into an owned scratch directory, checks extracted source identity and mounts the established locked dependencies without changing their contents. Invoke Bun with that pinned source as worker import root; the worker implementation may be current test code but every provider/format import resolves beneath the pinned root. Reject absent old source/dependencies. An import of moving current source followed by metadata relabeling is forbidden. These helpers are testing boundaries, not shipping migration APIs.

- [ ] **RED — full populated3 matrix.** Through the actual pinned provider create independent stores spanning queued/prepared/pending/accepted authority and claims, turns/decisions/consumptions, waiting/settled states, complete receipt/outbox variants, ownership takeover and artifacts. Capture exact rows/text/blob bytes and declarations before upgrade. Assert explicit upgrade modifies only format version/bundle plus additive structures/marker; existing attempts stay Attempt2. Original migrations remain exact. Reopen through new verified readers without rewriting old rows. Then unused down must restore the exact populated predecessor, and pinned old readers must accept it.
- [ ] **RED — used down and rollback.** Independently populate journal, fence, observation, closed barrier/hold and successor-only current-row cases. Down refuses even when active index0; mismatched markers/counts/family deletion refuse. Test absent file, unreadable file and unreadable directory distinctly with the non-root mechanism. Late failures during up/down roll back all rows/schema/temp guard state and preserve cleanup errors. Ordinary open on predecessor still refuses before configuration, without silently migrating it.
- [ ] **RED — actual already-open/queued/BUSY writers.** Keep old module constants loaded before upgrade. Exercise (1) old callback already holding BEGIN IMMEDIATE, (2) old same-instance queue waiting behind another call, (3) independent old process in SQLITE_BUSY/LOCKED retry and (4) old new-open after upgrade. Synchronize via readiness/lock-entered/attempt-entered handshakes with bounded waits. The already-committing callback completes or rolls back before upgrade obtains the lock; queued/BUSY callbacks execute after upgrade publishes the complete bundle.
- [ ] **Cover every mutation family.** acquire/renew ownership, retainManifest, createRun, admitAttempt, pinRuntimeScope, stageRuntimeRequest, recordRuntimeAcceptance, recordExecution, stageClaim, recordClaimAcceptance, stageTurn, receiveDecision, consumeDecision, commitOutcome and reconcileReceipt must not alter execution/ownership/history/reservations/outbox after changed bundle publication. Test current and stale owner paths. Old retainArtifact insert/exact duplicate/metadata conflict remains permitted under its installed immutable integrity checks; no new total-artifact count may make it corrupt. Stale-owner refusal may advance last_observed_at monotonically; clock regression still throws. Capture all rows and allow only the specifically asserted artifact/clock differences. A newer clock affects future admission, so do not label it inert. Old close/drain remains local, not host-wide exclusion or physical worker stop.
- [ ] **Add this executable migration identity assertion** using `options: SqliteOptions` from the pinned fixture and imported production adapter APIs:

```ts
const upgraded = await upgradeSqliteStores(options);
expect(upgraded.before).toEqual(FORMAT3_IDENTITY);
expect(upgraded.after).toEqual(FORMAT4_IDENTITY);
expect(upgraded.before.bundleHash).toBe(
  'd11130ee5ca84e51cb843daf8fbfc5695b704e3aecea1fb6d7c00234b2f43aed',
);
expect(upgraded.after.migrations.slice(0, 3)).toEqual(upgraded.before.migrations);
const downgraded = await downgradeUnusedSqliteStores(options);
expect(downgraded).toEqual({
  kind: 'downgraded',
  before: FORMAT4_IDENTITY,
  after: FORMAT3_IDENTITY,
});
```

Pair this with full physical capture comparisons and actual old reader success; the returned report alone proves neither preservation nor compatibility.

- [ ] **Run RED/GREEN:** `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/recovery-migration.db.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/recovery-compatibility.db.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/recovery-races.db.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/store-lifecycle.db.test.ts --timeout=60000`. Complete missing fixture coverage and implementation defects within the affected earlier boundary; do not substitute mocked old writers or sleep-based races.
- [ ] **R5 — changed bundle dependency.** Temporarily break only new upgrade's bundle publication while preserving old-compatible tables and all old checks; an actual pinned queued/BUSY writer must then perform an otherwise forbidden mutation. Restore and show refusal with exact physical rows unchanged except approved exceptions. Distinguish this proof from new-only schema-version/open checks. Execute each outstanding new guard's named production negative, restore, and place actual `Proof:` comments beside its production check.
- [ ] **Focused validation:** Run `bunx nx run twilight-dash:test`, `bunx nx run twilight-dash:lint`, `bunx nx run twilight-dash:typecheck`, `bunx nx run twilight-dash:build`; run receiver tests touched/reused by actual fixture composition. Run the existing CI migration lint entry point explicitly: `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/migrations/0004-runtime-recovery/migration.sql apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/migrations/0004-runtime-recovery/down.sql`. Run `bunx nx format:check --all` and `bunx openspec validate --all --json`. Record exact outputs and any unavailable tooling; a missing required tool blocks completion. Do not report the initial EPERM baseline or historical main CI as passing.
- [ ] **Commit candidate:** Stage only owned files and evidence; `git commit -m "test(twilight-dash): prove recovery format compatibility"`. Record `git rev-parse HEAD`; inspect `git status --short` and `git diff --check`. Evidence follow-up changes create a new candidate and require checks appropriate to that changed SHA.
- [ ] **Canonical gate:** On h2puni use a clean isolated gate worktree, never `/home/puni1/wbs-dev/src`; run `bin/h2puni-gate.sh <candidate-sha>` without checking that SHA out first. Alternative h4claw uses its separate documented lock/tree. Trust printed `h2puni gate: running on <sha>` and actual exit. Exit65 requires preserving/committing named dirty paths; exit66 permits the documented mode-repair rerun. Never raw full Nx gates on the gate host or unattended clean. Record full gate SHA/output, CI secret/migration lint and OpenSpec outcomes; a stale SHA is not this candidate's evidence.
- [ ] **Independent review:** Request scoped reviews for type/value trust boundaries, complete current/prefix folds, explicit populated3/down compatibility, transaction closure and real receiver chronology. Resolve findings with fresh focused verification; final review must inspect the actual candidate and remaining scope. Keep architectural main merge and production held. Neither successful gate nor reviewer approval authorizes those actions.
- [ ] **Deliver evidence:** Update `recovery-verify.md` with every RED/GREEN/fault/restoration and gate/review record, explicitly mark any skipped/unavailable checks and all remaining work. Do not mark parent full recovery/S0/S7a tasks complete. Report logical closure and compatibility only to the extent observed, with physical quiescence/authenticity/current authority limits intact.

## Coverage and handoff

| Approved requirement                                                                                    | Task boundary                       |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Detached complete typed witnesses, actual bytes/public schema, actual claim projection                  | 1, verified historical reread in2/5 |
| Versioned current snapshots; immutable old acknowledgements; hold capacity                              | 2, closure6                         |
| Full publication versus prefix cuts; barrier floor/current grant and all consumers                      | 2, actual closure6                  |
| Genuine populated3 explicit upgrade, unchanged old migrations, guarded unused down                      | 3, pinned complete matrix8          |
| Begin and fresh interlocks after legitimate replay, unrelated work preserved                            | 3                                   |
| Fence identities/generations/supersession, immutable observations                                       | 4–5                                 |
| One pure valid-predecessor plan; no intermediate full read; atomic publish/rollback                     | 6                                   |
| Actual receiver domination; committed observation before captured lookup; bounded correlated exhaustion | 7                                   |
| Actual old executable, local queue/BUSY/held writer, artifact/clock exceptions                          | 8                                   |
| New R5 production negatives, inherited guards retained, exact candidate gate/review                     | Every task and8                     |

Execution is authorized; no new design approval question is required. Use the selected execution skill task-by-task, preserving this ordering. The only supported rollout at the end is reviewable authority/claim logical recovery with explicit adapter migration APIs. Complete write/outbox recovery, physical lookup/effect/quiescence/ownership transfer and continuation, producer budget/business lifecycle, remaining adapters, second durable provider and S7a are still required subsequent packets.
