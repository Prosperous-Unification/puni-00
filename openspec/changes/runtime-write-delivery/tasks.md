# Runtime write delivery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.
> One implementation writer per task; root owns metadata, Git, review, publication and gates.

**Goal:** Durably couple a validated outcome to one exact WBS write and recover its reply.

**Architecture:** Strict write records and pure transition plans, verified wrappers, then
memory/SQLite publication and the existing bounded recovery dispatcher. The caller owns
business-outcome policy. One unreleased format6 cohort preserves genuine format5.

**Tech stack:** Existing Bun1.4.4, TypeScript, ArkType, bun:sqlite, Bun tests and Nx.

**Spec:** [delta](specs/runtime-write-delivery/spec.md), [design](design.md),
[intent](proposal.md) and [ADR0068](../../../docs/adr/0068-outcomes-and-runtime-writes-stage-together.md).

## Global constraints

- Base `c12bb0e58215de3ba0c3da98a2198773d654a29c`; branch
  `feat/agentic-outcome-delivery-20261101` in the existing isolated worktree. CTT and CI
  repair refs/gates remain separate. No other worktree, upstream library or excluded-owner work.
- Preserve0001–0005 forward/down bytes, original format3/4 worker/protocol bytes, public WBS
  wire codecs, receiver behavior and generic completion/receipt semantics. No dependency change.
- No automatic business mapper, new business retry/budget policy, physical-work inference,
  operator-store migration, live provider spend or production action. The user's subsequent
  explicit commit/push/merge authorization permits publication after the required review and gates.
- All paths below are relative to `apps/twilight-structure/twilight-dash/cli/src/runs/` unless
  explicitly rooted. Symbol behavior/invariants belong in JSDoc. No unexplained unchecked casts.
- New runtime types are standalone during Task1; Task2 integrates complete read contracts.
  No throwing implementation placeholders or weakened providers to make an intermediate compile.
- Each safety slice includes semantic RED, restored GREEN and independent production-path
  faults, retaining weak/setup attempts separately. Record exact argv/cwd/source/exit/duration,
  original streams and source restoration hashes; add adjacent truthful Proof comments.
- Use actual retained artifacts and real provider operations. Reuse unchanged fixture defaults;
  never turn a generic Completion2 into an executable request by changing its fixture meaning.
- Source-changing mutation campaigns, timer-sensitive suites and static tools run sequentially.
  Root honors an explicit source/index/HEAD hold during final focused verification. Close and
  observe every owned resource before deleting its exact scratch path; retain uncertain state.
- Each task ends with normal root commit and independent spec/quality review. Format6 is not a
  supported separate release at an intermediate task. Final acceptance covers the entire packet.

## 1. Strict write values and pure coupled transitions

### Task 1: Portable values and plans

**Create:** `write-records.ts`, `write-codecs.ts`, `plan-writes.ts`,
`write-codecs.test.ts`, `plan-writes.test.ts`, `testing/write-fixture.ts`.

**Modify:** `execution-codecs.ts` only to export its unchanged `TurnCheckpointCodec`;
`apps/twilight-structure/twilight-dash/eslint.product.mjs` for exact public-contract aliases
at declared write files; `tools/tool-devsync/src/eslint-boundaries.test.ts` for effective
allowance/refusal tests. Preserve inherited ring/product/runtime rules.

**Interfaces:** Produce the complete WriteCompletion1, WriteStageCommand1,
WriteAcceptCommand1, WriteProjection1, WriteReceipt1, WriteObligation1, Attempt4,
WriteStageAck1, WriteAcceptAck1 and discriminated RecordedWrite1 from design.md. Keep new
records/codecs independent of the old current-row decoder until Task2. Reuse scalar, artifact,
outcome, quiescence, target and checkpoint codecs without importing record-codecs back into
an execution-codecs dependency cycle. Export `decodeWriteCompletion`, `decodeWriteStageCommand`,
`decodeWriteAcceptCommand`, `decodeWriteAttempt`, `decodeWriteObligation`,
`decodeRecordedWrite` and acknowledgement decoders; each snapshots/detaches its input.

`WriteFacts` consumes run/attempt/manifest/ownership/execution facts, the pinned reconstructed
scope prefix and complete runtime catalog, plus independent `writes` and `obligations` arrays.
Its exact interface is the `WriteFacts` declaration in design.md: selected-attempt `executions`,
global `submissions`, global `writes`/`obligations`, existing manifest/ownership/run facts,
existing Attempt or standalone Attempt4 and the reconstructed scope/runtime catalog.
Store ownership/lease is already
authorized at the transaction boundary; planners still bind derived store/organization/owner
identities and independently supplied revisions. The complete local execution-submission
catalog supplies applied legacy/new submission IDs with their independent run/attempt targets;
preserve existing identity namespaces rather than rejecting unrelated lexical matches.
Produce:

```ts
interface WriteStagePlan {
  readonly runRevision: number;
  readonly ack: WriteStageAck;
  readonly record: RecordedWriteStage;
  readonly intent: RuntimeIntent;
  readonly obligation: WriteObligation;
}
interface WriteAcceptPlan {
  readonly runRevision: number;
  readonly ack: WriteAcceptAck;
  readonly record: RecordedWriteAcceptance;
  readonly acceptance: RuntimeAcceptance;
  readonly receipt: WriteReceipt;
  readonly obligationKey: ExecutionCommandId;
}
planWriteStage(facts: WriteFacts, guard: ScopedAttemptGuard, command: WriteStageCommand):
  StoreReply<WriteStagePlan>;
planWriteAcceptance(facts: WriteFacts, guard: ScopedAttemptGuard, command: WriteAcceptCommand):
  StoreReply<WriteAcceptPlan>;
```

Both plan values include `runRevision`, original `ack`, complete `record` with independent
scope context and the corresponding runtime intent/acceptance. Stage includes its obligation;
acceptance includes its local receipt and exact obligation key to remove. Expose pure
`writeStageTransition`/`writeAcceptanceTransition` for historical-prefix reconstruction, with
the same consequences and without today's revision/lease observations. No adapter mutation.

`createWriteFixture(stores: OutcomeFixture)` uses actual `prepareTurn`, its accepted original
claim/session, a newly retained RuntimeState containing that exact live runtime binding and
the caller-approved `setProgress`/final `releaseWorkItem` batch. Return `guard`, `command`,
`facts`, `stateEvidence`, `completion`, `canonicalRequest` and `currentGuard()`; the last
returns the exact current ScopedAttemptGuard. It supplies explicit pure catalog projections
for planner tests, not a fake implementation of RunStore. The caller owns `stores.close()`.

- [x] 1.1 Observe semantic RED then implement strict portable decoders and snapshots — tests:
      `write-codecs.test.ts` covers valid stage/acceptance/attempt/obligation records, historical
      codec identities, unknown/missing/version fields, precise pending/nonaccepted/terminal
      variants, false capacity, determinate effect, operation binding, canonical request bytes,
      unbounded wire versus bounded local IDs, nested mutation and caller ownership. Negative:
      independently bypass each new shape/semantic/snapshot dependency and observe its actual
      decoder test fail, then restore exactly. Do not use a missing import as semantic RED.
- [x] 1.2 Observe RED then implement pure stage/acceptance and immutable replay plans — tests:
      `plan-writes.test.ts` uses genuine prepared/claimed turn facts, accepted current authority,
      independent scope cut and exact target; stage frees capacity once, acceptance closes one
      obligation, original replay survives later facts, changed reuse and global local/wire
      association collisions refuse while the explicit design collision matrix permits unrelated
      local/wire lexical equality; stale scope/run/attempt guards and every coherent target mismatch refuse.
      Negative: independently omit each new stage/acceptance, grant/floor, correspondence,
      reservation, original-ack, collision and state/revision check and watch the named assertion fail.
- [x] 1.3 Verify effective lint boundaries and Task1 quality — tests:
      `eslint-boundaries.test.ts` permits only declared exact public aliases and rejects sibling,
      relative, subpath and unlisted-peer imports with zero fatal parser errors. Run focused source
      tests, actual named Dash/tool-devsync lint/typecheck and changed formatting. Negative:
      remove/narrow/widen each new policy edge and observe the production ESLint consumer fail;
      restore original source/configuration, report all streams/hashes and obtain independent review.

The focused stage assertion is:

```ts
const stage = planWriteStage(fixture.facts, fixture.guard, fixture.command);
expect(stage.kind).toBe('applied');
if (stage.kind !== 'applied') throw new Error('expected write stage plan');
expect(stage.value.ack.attempt.holdsCapacity).toBe(false);
expect(stage.value.ack.intent.canonicalRequest).toBe(fixture.canonicalRequest);
expect(stage.value.ack.obligation.disposition).toEqual({ kind: 'pending' });
```

## 2. Complete store publication and preserving upgrade

### Task 2: Both providers, complete reads and format6

**Create:** `write-history.ts`, `build-write-request.ts`, `write-history.test.ts`,
`build-write-request.test.ts`, `testing/write-store-contract.ts`, `write-store.test.ts`,
`sqlite/write-store.db.test.ts`, `sqlite/read-writes.ts`, `sqlite/write-store.ts`,
`sqlite/write-usage.ts`, `sqlite/migrate-writes.ts`,
`sqlite/write-migration.db.test.ts`, `sqlite/inspect-format.ts`,
`sqlite/inspect-format.db.test.ts`, `testing/format5-lifetime-preload.ts`,
`sqlite/migrations/0006-runtime-write/{migration.sql,down.sql}` and genuine pinned
`testing/format5-{fixture,provider,protocol,worker}.ts` with focused lifecycle/protocol tests.

**Modify:** `records.ts`, `execution-records.ts`, `record-codecs.ts`, `run-store.ts`,
`runtime-records.ts`, `plan-execution.ts`, `plan-admission.ts`, `plan-runtime.ts`,
`build-claim-request.ts`, `plan-recovery.ts`, `dispatch-recovery.ts` for known scope2/3
dispatch with all existing floor/recovery checks and unknown-version refusal preserved;
`plan-recovery.ts` also gains reciprocal legacy recovery/fence exclusions against global local
write submission IDs. Existing execution publication gains the same reciprocal local-command
exclusions; generic completion/receipt and unrelated local/wire namespaces stay independent.
No write-recovery branch is introduced in Task2;
`plan-recovery-history.ts`, `validate-history.ts`, `claim-history.ts`, `runtime-history.ts`,
`testing/memory-stores.ts`, `testing/write-fixture.ts` for optional existing ownership/suffix
context and suffix-derived write IDs only; SQLite `format.ts`, `schema.ts`, `open-stores.ts`,
`run-store.ts`, `read-history.ts`, `read-runtime.ts`;
`testing/predecessor-fixture.ts` only for a precise format5 source/protocol route;
`apps/twilight-structure/twilight-dash/cli/project.json` for the exact format5 lifetime preload,
and the exact export/policy/test owners reached by these new modules. Historical tests use
the new genuine format5 bridge where they require5; preserve their behavior/assertions.

Inspected and reused unchanged: SQLite `runtime-store.ts`, `read-outcomes.ts`,
`read-executions.ts`, `read-signals.ts` and `row-codecs.ts`. These already route through
`CURRENT_FORMAT`/`FormatDescriptor`, complete `readHistory`, or shared `decodeCurrentAttempt`;
the changed descriptor/history/decoder owners supply the new behavior. Generic completion
and receipt semantics remain unchanged; no source edit is required in these five owners.

The write fixture forwards its optional ownership/suffix context unchanged to `prepareTurn`.
Use returned `setup.suffix` for `wire-write${suffix}` and `stage-write${suffix}`; an empty suffix
preserves the original fixture bytes and identities. Its original one-argument overload keeps
the fresh single-target pure-plan `facts` witness; explicit context arguments, including an explicit `undefined`, return
only the actual prepared target members and omit `facts` from both their type and runtime shape.
No incomplete global catalog or new global-list port is introduced. Cross-attempt tests establish two
independently eligible actual targets, then isolate local-ID and wire-association collisions.
The private inspection helper is advisory, never authority to bypass the actual-path complete
audit or ignore live WAL. The approved portable contract preserves PUNI records/schema/migration
identities/persistent settings on incompatible admission; engine bookkeeping is allowed. Closed
predecessors retain SQLite's stronger initial-inspection byte/sidecar guarantee. A real6-to5 race
must prove logical-state refusal; retain its original strict-sidecar RED separately. Authoritative
admission and persistent journal-mode conversion require native exclusion across any handoff;
preserve supported non-WAL opening. PostgreSQL feasibility is documented in design.md; no
PostgreSQL adapter or conformance completion is implied by this SQLite task.

**Interfaces:** Add the two RunStore operations in design.md, ExecutionHistory3,
RunSnapshot4 and RuntimeScopeSnapshot3. Keep complete generic legacy fields and add write
events/obligations/local receipts explicitly. `stageWriteRequest` consumes stores/artifacts,
scoped guard and `{ commandId, completion, canonicalRequest, stateEvidence }` and returns
`StoreReply<WriteStageAck>` after verified bytes. `acceptWriteReceipt` consumes guard and
`{ commandId, stageCommandId, intent, evidence }`, derives the complete WriteProjection and
returns `StoreReply<WriteAcceptAck>`. Extend the existing verified execution/runtime readers;
do not add an ownership-free bypass into trusted publication.

`buildWriteRequest` consumes the same stores/artifacts/guard plus
`{ commandId: string; commands: readonly RuntimePlanCommand[]; stateEvidence: ArtifactRef }`
and returns the built/refused union from design.md. It uses actual fresh state, not a cached
claim basis. `upgradeSqliteWrites`/`downgradeUnusedSqliteWrites` return the existing
SqliteFormatTransition type; `FORMAT6_IDENTITY` contains the exact six-name/hash ledger.

- [x] 2.1 Observe RED then integrate memory and SQLite atomic stage/acceptance with complete
      public read contracts — test: identical `write-store-contract.ts` through both providers,
      actual verified artifact wrappers and read-only builder, semantic state/revision/capacity
      parity, stale current owner, original acknowledgement replay and global identity collisions.
      New stage/accept events are counted once alongside legacy completion/receipt records.
      Negative: bypass each direct publication half, current-owner/revision check, scope context,
      request/claim/authority/state association and wrapper verification dependency; observe the
      actual provider or wrapper contract fail, restore exactly and retain original causes.
- [x] 2.2 Complete full-history and successor-version consumption — tests:
      `write-history.test.ts`, `sqlite/write-store.db.test.ts` and existing history contracts
      remove/alter/reorder reciprocal scope/write/obligation/receipt/original-ack links behind
      otherwise plausible projections; every public read/replay/mutation/reopen throws. Keep
      generic rows inspectable and strict. Test all new read versions with empty and populated
      histories, claim/generation-floor/recovery verification on the new versions and precise
      non-executing Attempt4 states. Negative: independently bypass each new fold/link/current-row/
      version dispatch dependency; demonstrate a named semantic assertion rather than only a crash.
- [x] 2.3 Append complete additive format6 and explicit preserving transition — tests:
      `write-migration.db.test.ts` uses the genuine c12 format5 producer for populated pending,
      terminal, authority/claim/recovery rows and opaque Unicode/NUL identities; compare original
      serialized bytes, acknowledgements and full ledgers. Prove initial private-inspection refusal
      leaves closed predecessor bytes/sidecars intact; a real supported6-to5 race preserves PUNI
      state/schema/ledger/persistent settings while refusing, even if WAL/SHM appears. Prove native
      compatibility/configuration exclusion, supported non-WAL admission and its configuration
      handoff under a competing transition both before the protected audit and after valid supported
      conversion/close. Re-audit on normal reconnect; distinguish committed supported configuration
      from later incompatible refusal. Retain original strict-race RED and independent guard
      faults. Prove exact unused down, used down refusal, changed applied artifact refusal, partial
      physical declarations, late DDL/copy/metadata failure rollback and cleanup-phase causes.
      Negative: break each new format/physical/hash/copy/key/usage/down/rollback dependency once
      through the actual transition. Preserve0001–0005 bytes and original4-to5 semantics.
- [x] 2.4 Prove genuine old-writer fencing and actual atomic crash cuts — tests:
      `write-migration.db.test.ts` drives already-open, queued, BUSY and callback format5 writers
      across upgrade, preserving the old artifact/refusal-clock exceptions. `write-store.db.test.ts`
      injects late INSERT aborts and separate owned processes before/after actual staging and
      acceptance COMMIT; verify exact reopened bundles, reservations, replies and obligations.
      Negative: remove the format fence or one transaction/publication edge and watch the real
      old writer/crash contract fail. Observe native close, process exit and available stream EOF;
      preserve unavailable observations rather than infer cleanup.
- [x] 2.5 Run migration lint, focused new/neighbor contracts and actual affected static/policy
      checks under one declared source hold; report counts, commands, full source/index/HEAD
      fingerprints, all retained faults/restorations and limits. Obtain independent task review.
      This is a local storage checkpoint; sender/recovery and final packet gates remain required.

The provider contract's acceptance cut is:

```ts
const stage = unwrapReply(await stores.runs.stageWrite(guard, command));
expect((await stores.runs.readRun(guard.runId)).capacity.reserved).toBe(0);
expect((await stores.runs.readRun(guard.runId)).writeObligations).toEqual([stage.obligation]);
const accepted = unwrapReply(
  await acceptWriteReceipt(stores.runs, stores.artifacts, acceptanceGuard, input),
);
expect(accepted.attempt.state.kind).toBe('write_terminal');
expect((await stores.runs.readRun(guard.runId)).writeObligations).toEqual([]);
```

Here `acceptanceGuard` is the independently captured post-stage scoped guard; `input` uses
the fixture's actual retained receipt and distinct acceptance identity. No current revisions
are silently substituted into a caller's stale guard.

## 3. Real sender and bounded write recovery

### Task 3: Exact delivery, accepted closure and fenced nonacceptance

**Create:** `deliver-outcome.ts`, `deliver-outcome.test.ts`,
`testing/write-dispatch-contract.ts`, `sqlite/deliver-outcome.db.test.ts`,
`write-recovery-records.ts`, `write-recovery-codecs.ts`,
`write-recovery.test.ts`, `sqlite/write-recovery.db.test.ts`.

**Modify:** `recovery-records.ts`, `recovery-codecs.ts`, `recovery-evidence.ts`,
`recovery-history.ts`, `plan-recovery.ts`, `plan-recovery-history.ts`, `dispatch-recovery.ts`,
`validate-history.ts`, `claim-history.ts`, `runtime-history.ts`, `testing/memory-stores.ts`,
SQLite `recovery-store.ts`, `read-recovery.ts`, `run-store.ts`, `read-history.ts`,
`testing/recovery-receiver.ts` for exact owned receiver reopen/response-loss support,
and relevant shared recovery contracts. Preserve receiver-owned production source.

**Interfaces:** `deliverOutcome` uses the claim-style accepted/refused/pending reply union
with WriteAcceptAck, input `{ commandId, acceptanceCommandId, completion, canonicalRequest,
stateEvidence }` and existing injected RuntimeClient, stores, scoped guard and AbortSignal.
WriteRecoveryTarget associates original intent/run/attempt/local stage/accept IDs. New write
intent/history/closure versions are2; unchanged legacy recovery envelopes remain1. Extend
existing recovery call/decision types with a precise write branch and the same four public
RecoveryStore operations. The current generation barrier and fence bounds remain unchanged.

- [x] 3.1 Observe RED then implement the actual sender over verified wrappers — tests:
      shared `write-dispatch-contract.ts` on memory and SQLite proves durable-stage/renewal barriers,
      exactly one applied-stage sender, lookup-only duplicates, original winner/evidence and
      distinct local identity, preserved submitted cuts, nested mutable inputs, cancellation,
      typed receiver refusal, transport loss and correlated unexpected faults. Negative: move POST
      ahead of either awaited barrier, elect duplicate POST, borrow another acceptance winner,
      advance duplicate cuts, substitute parsed reply or skip evidence verification; observe the
      actual injected client/provider path fail and restore exactly.
- [x] 3.2 Observe RED then implement write recovery across complete pure folds and both
      adapters — tests: shared recovery contract plus `write-recovery.test.ts`/
      `sqlite/write-recovery.db.test.ts` proves durable fence chronology, contextual original
      lookup, three-fence bounds, accepted atomic write/terminal/obligation/barrier publication,
      single-counted attempt consequence and nonaccepted unsendable obligation with unchanged
      false capacity. Different identity/rebase/retry stays blocked. Legacy held claim recovery
      remains true-capacity and old JSON remains unchanged. Negative: bypass each new subject,
      receipt/projection/closure/index/floor/context/hold/capacity/link check or publication edge;
      retain meaningful semantic failures and exact restorations.
      Include lost-reply recovery whose local acceptance ID equals the original wire ID, unrelated
      local/wire lexical equality, genuinely borrowed-association refusal and unchanged legacy
      cross-namespace refusal controls; use the same matrix in planners and complete-history audits.
- [x] 3.3 Prove real receiver effects across lost replies and restart — tests:
      `sqlite/deliver-outcome.db.test.ts` composes the real owned WBS SQLite/controller receiver,
      commits ordered progress/reference/measurement/final release, drops the reply after commit,
      closes/reopens receiver and sender, and recovers the same receipt without repeated effects.
      Exercise stage-before-POST crash, after-acceptance-before-ack crash, local/receiver takeover,
      fence-before-lookup, current authorization refusal, malformed raw replies and late sender
      acceptance rollback. Negative: break actual sender capture/lookup or atomic closure and
      observe duplicate effect, lost original correspondence or partial state; do not alter
      receiver guards to make the sender pass.
- [x] 3.4 Run final focused sender/recovery/history/provider/lifecycle contracts once after
      all proofs and source restoration, then actual affected static/policy checks and independent
      task review. Keep failed/setup runs and explicit skip/unsupported boundaries. Release the
      source hold; no canonical acceptance is inferred from these focused results.

## 4. Cohesive verification and held publication

### Task 4: Final review and source-specific acceptance

- [ ] 4.1 Reconcile parent recovery/coordinator tasks without closing full S0/S7a, verify every
      new requirement/scenario and proof from original receipts, and obtain whole-branch independent
      review. Run the complete actual RunStore source inventory once after final source changes,
      applicable static/policy/format/migration checks and all-change OpenSpec validation. Record
      existing warnings, exclusions, old worker/pipe/native closure and cleanup limits explicitly.
- [ ] 4.2 Normally commit/push the cohesive packet, run its own applicable hosted CI and the
      exact-SHA canonical gate from a clean isolated host tree, then write `verify.md` from actual
      source-bound outputs and normal hooks. Merge only after review and source-specific gates
      pass, under the user's explicit authorization; operator migration and production remain
      outside scope. Maintain accurate WBS and retained checkpoints;
      no complete-foundation or deployment claim follows from this packet alone.
