# S0 RunStore and ArtifactStore implementation plan

> **For agentic workers:** Use `subagent-driven-development` or `executing-plans` to execute one independently reviewed task at a time. Root owns dispatch, WBS updates and commits. Do not spawn additional workers without root's instruction.

**Goal:** Establish portable persistence contracts, a memory test provider and the first durable SQLite provider for the safe coordinator.

**Architecture:** Domain-specific atomic operations own admission, ownership, execution facts, outcomes and receipts. The core sees async RunStore/ArtifactStore ports; provider configuration and physical schema stay outside them. No coordinator, CTT integration or real external effects ship in this packet.

**Tech stack:** Existing Bun, Nx, ArkType, `@shared/validation`, `bun:sqlite`, Dash `WallClock` and repository test scratch preload; add no package.

**Spec:** Read [storage design](storage-design.md), [run-coordination requirements](specs/twilight/run-coordination/spec.md) and parent [tasks](tasks.md). The supplement owns exact final records and signatures; tasks introduce only their needed subset, not throwing placeholder methods.

## Global constraints

- Work only inside the isolated agentic-foundation worktree. Preserve other sessions' files.
- All source paths below are relative to `apps/twilight-structure/twilight-dash/cli/src/runs/` unless an absolute repository path is shown.
- No changes to auth/onboarding/credentials/tenant limits/compute providers/activation, cross-project dependencies or CTT. No real WBS mutations or model calls in tests.
- A local capacity reservation means potentially live physical work; owner loss does not release it. No state edit may manufacture quiescence.
- Ownership clocks and configured capacity are store dependencies, not request parameters.
- Every new safety check needs a production-path negative and an observed failing mutation/dependency fault before its adjacent `Proof:` comment. Do not prewrite proof claims.
- Expected domain conflicts return typed refusals; missing/malformed trusted state and I/O failures throw. No null/default recovery, unchecked cast, `any`, non-null assertion or silent skip in production.
- Parent 6a.1–6a.2 stay unchecked until all five tasks pass. 6a.3–6a.8 and 6b.3 remain separate prerequisites.

## Running each slice

Use focused tests from the repository root, including the existing scratch preload:

```sh
bun test --preload ./tools/test/scratch/preload.ts apps/twilight-structure/twilight-dash/cli/src/runs --timeout=60000
bunx nx run twilight-dash:typecheck
bunx nx run twilight-dash:lint
```

These are planned commands, not a claim they already pass. For the first task, narrow the
Bun path to `runs/admission.test.ts`; later use the whole new subtree. A red test must fail
for its intended invariant/import, not because preload, Bun, permissions or tooling failed.
On h2puni, full gates run only through the repository gate script under its heavy lock.
Root selects the exact commit and gate host after review.

### Task 1: Atomic admission and ownership in the memory test provider

**Files:** Create `records.ts`, `record-codecs.ts`, `run-store.ts`,
`plan-ownership.ts`, `plan-admission.ts`, `testing/memory-stores.ts`,
`testing/fixtures.ts`, `admission.test.ts`.
Update repository paths `apps/twilight-structure/twilight-dash/eslint.product.mjs` and
`tools/tool-devsync/src/eslint-boundaries.test.ts` only for an exact
`@twilight-burokrat/contracts` allowance at `runs/record-codecs.ts` and
`runs/plan-admission.ts`, reusing the existing canonical JSON/hash implementation. Prove
the effective policy still rejects sibling aliases, relative imports and peer files;
observe failures when removing the allowance or widening its alias/file scope.
Read existing `../clock.ts`, `../authority/authority-store.ts`,
`../authority/generations.ts` and their tests before implementing.

**Interfaces:** Introduce the design's ownership/run/manifest/admission records and
`RunStore.acquireOwnership`, `renewOwnership`, `retainManifest`, `readManifest`, `createRun`,
`readRun`, `admitAttempt`. Expose only these methods in this slice. Define
`createMemoryStores(options: MemoryOptions)` returning `{ runs: RunStore; ownership:
OwnershipStatus; close(): void }`, where `MemoryOptions` requires `organizationId`, `capacity`,
`leaseMilliseconds` and `clock: WallClock`; `OwnershipStatus` is the exact status in the
design. `close` makes subsequent operations throw, including reads. Test factory creation
is explicit bootstrap; no production code imports the memory implementation. Production `planOwnership`, `planRenewal`
and `planAdmission` use the exact design signatures and return explicit mutation intents;
the memory provider only supplies a consistent view and applies those intents. Task 2
consumes the same functions inside SQLite transactions. `ArtifactRef` is needed now as a
manifest field; define its complete v1 record without an ArtifactStore implementation.
Task 1 proves manifest-content integrity, but verification of retained referenced bytes
is added in Task 3; do not claim full binding recovery before Task 6a.3.

- [x] Write `admission.test.ts`: capacity one, two runs, two concurrent admissions; exactly one applies, the other returns capacity_full, total reserved is one, losing run and attempts are unchanged. Admission with an absent retained manifest throws before any reservation. A mutable caller object must not mutate persisted records.
- [x] Run the focused test and record the intended red output in parent `verify.md`.
- [x] Implement codecs and pure admission/ownership planners, then a memory transaction adapter that applies their mutation intents only after all preconditions. Persist configured capacity and retry budget, allocate epochs from the store, reject invalid/overflowing integers, and isolate returned snapshots. Do not add outcome/receipt/inbox placeholders yet.
- [x] Add the stale-owner example below, clock-regression and renewal-expiry cases. Attempt takeover before expiry refuses; takeover after expiry keeps the old attempt queued with capacity held. An expired owner cannot mutate even before a replacement acquires.
- [x] Add immutable-manifest/hash mismatch, unknown record version, input snapshot isolation, owner from another store and closed-store cases. Same run/admission identity is idempotent; changed ID payload refuses. A stale revision cannot reserve capacity.
- [x] Run all new tests, typecheck and lint. Bypass capacity, owner-epoch and run-revision guards separately; observe the named test fail, restore each guard and rerun. Add only the observed `Proof:` comments and verification record.
- [x] Request root's review with changed files, exact commands and proof results; commit only when root directs.

The fixture helpers in `testing/fixtures.ts` construct validated records, not casts into
production brands. `createAdmissionFixture({ capacity, leaseMilliseconds })` returns
`{ runs, clock, ownership, run, admission }`; the mutable fixture clock has `read()` and
`advance(milliseconds)` and starts at 1000. It retains a canonical manifest and creates the
run through public methods. The admission example is a complete public-port assertion:

```ts
test('takeover fences writes without freeing surviving work', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  const guard = {
    ownership: fixture.ownership,
    runId: fixture.run.runId,
    expectedRevision: fixture.run.revision,
  };
  expect((await fixture.runs.admitAttempt(guard, fixture.admission)).kind).toBe('applied');
  const before = await fixture.runs.readRun(fixture.run.runId);
  fixture.clock.advance(101);
  const next = await fixture.runs.acquireOwnership(ownerId('replacement'), fixture.ownership.epoch);
  expect(next.kind).toBe('applied');
  expect(await fixture.runs.admitAttempt(guard, fixture.admission)).toEqual({
    kind: 'refused',
    reason: 'owner_stale',
  });
  expect(await fixture.runs.readRun(fixture.run.runId)).toEqual(before);
  expect(before.capacity.reserved).toBe(1);
});
```

`ownerId` is the decoder constructor exported from `record-codecs.ts`. The snapshot does
not contain current ownership, so takeover alone leaves its run/capacity contents equal.

### Task 2: Durable SQLite admission and shared conformance

**Files:** Create `sqlite/open-stores.ts`, `sqlite/run-store.ts`, `sqlite/schema.ts`,
`sqlite/row-codecs.ts`, `sqlite/migrations/0001-run-store/migration.sql`,
`sqlite/migrations/0001-run-store/down.sql`, `testing/run-store-contract.ts`,
`run-store.test.ts`, `sqlite/run-store.db.test.ts`, `sqlite/open-stores.db.test.ts`,
`sqlite/admission-races.db.test.ts`. Refactor `admission.test.ts` cases into the shared
contract without weakening their assertions.

**Interfaces:** Implement the exact bootstrap/open options and return shape from the design,
initially returning `runs`, `ownership`, `close`; add `artifacts` when Task 3 implements it.
`runStoreContract(name: string, create: () => Promise<StoreFixture>): void` registers the
same admission suite for each provider. `StoreFixture` exposes `runs`, `ownership`, a
controlled clock and `close`; SQLite-specific reopen/process helpers stay in `.db.test.ts`.
Create one independent SQLite connection per simulated owner. No physical schema types
escape `sqlite/`. Consume Task 1's production planners; select only the named run, occurrence
history, attempt-ID collision and store-wide owner/capacity facts, then apply row-level
mutation intents. Do not duplicate the admission algorithm or serialize/rewrite a whole
store snapshot.

- [ ] Register the shared contract for memory and SQLite; verify the SQLite registration fails because its adapter does not exist, while the memory suite remains green.
- [ ] Write bootstrap/open negatives: absent path creates no file/directory; unreadable database and unreadable parent report unreadable; existing bootstrap refuses without changing bytes; corrupt bytes, unknown schema version, malformed portable record and missing required tables refuse. Run unreadability tests as a non-root uid; root execution throws a clear prerequisite failure, never silently passes.
- [ ] Implement explicit bootstrap publication and open validation, schema/migration pair, store-local settings and semantic transactions. Use `BEGIN IMMEDIATE` for writes and consistent read transactions; retain the independent portable version. Configure and verify SQLite foreign keys, WAL and FULL synchronization.
- [ ] Write a real production-path rollback test: install a SQLite trigger that aborts the reservation insert, call `admitAttempt`, reopen, and assert no attempt, revision increment or reservation survived. Then drop the trigger and prove admission succeeds. This exercises the real transaction, not a fake method that throws before entering it.
- [ ] Write independent-process capacity-one contention using ready/go barriers. Both children call the public provider methods; exactly one wins admission and all other outcomes are typed capacity/revision/owner refusals according to the chosen identical-owner fixture. A database lock held through the configured retry budget must throw contention and preserve state.
- [ ] Write crash-before-commit and crash-after-commit subprocess tests. In the dedicated test child, intercept the real SQLite COMMIT call only around public `admitAttempt`: assert an active transaction and its staged attempt/reservation/revision, publish a synchronous barrier marker, then block with a bounded timeout. The parent verifies its independent reader still sees the old snapshot, kills the child and reopens. Delegate every other driver call unchanged; add no production test hook. Before commit yields neither admission nor reservation; after committed acknowledgement yields both. Timeouts fail loudly and all children are cleaned up. Bun 1.4.2 has no `Database.function`, so a pause-trigger UDF is not the barrier mechanism.
- [ ] Run contract and focused SQLite tests, typecheck and lint. Bypass the transaction boundary, persisted capacity lookup and open-without-create refusal separately; watch their negative tests fail. Restore guards, rerun and record actual proofs in `verify.md`.
- [ ] Request root review. Do not claim a second durable provider or power-loss validation.

### Task 3: Immutable artifacts, execution facts and atomic outcome/outbox

**Files:** Extend `records.ts`, `record-codecs.ts`, `run-store.ts`,
`testing/memory-stores.ts`, `sqlite/run-store.ts`, `sqlite/schema.ts` and the initial migration
pair before their first released schema. Create `artifact-store.ts`, `record-outcome.ts`,
`sqlite/artifact-store.ts`, `testing/artifact-store-contract.ts`, `artifact-store.test.ts`,
`outcomes.test.ts`, `sqlite/outcomes.db.test.ts`.

**Interfaces:** Introduce `ArtifactStore`, `ArtifactRef`, `ExecutionFact`, `Completion`,
`ProgressIntent` and `RunStore.recordExecution/commitOutcome` exactly as the design defines.
Add `artifacts` to both factories. Export
`recordOutcome(runs: RunStore, artifacts: ArtifactStore, guard: AttemptGuard,
completion: Completion): Promise<StoreReply<Attempt>>` and
`verifyArtifacts(artifacts: ArtifactStore, references: readonly ArtifactRef[]): Promise<void>`.
The latter verifies retained evidence; it is not an authorization checker.

- [ ] Write shared artifact cases: identical retention is idempotent, different metadata is refused, returned-byte mutation cannot affect stored bytes, missing reference throws, length/digest mismatch throws. SQLite adds corruption-after-close and reopen verification.
- [ ] Write the execution transition matrix: no launch without exact claim; wrong operation key refuses; takeover does not imply interruption; unknown effect stays unresolved and keeps capacity; determinate quiescence releases once; retry increments ordinal, preserves operation key and cannot exceed maxAttempts. A lost launch acknowledgement with no locator is still uncertain.
- [ ] Write completion cases through `recordOutcome`: missing/corrupt evidence or output produces no outcome, intent or revision change; valid completion stores matching intent and outcome together, releases only settled capacity and enters pending progress. End-of-turn text alone is insufficient input.
- [ ] Implement immutable blob retention/readback, closed transition table, evidence verification and indivisible outcome/outbox mutation. Persist exact command identity for idempotency; same command with conflicting authority/outcome refuses even after a later state transition.
- [ ] Install an SQLite abort trigger on outbox insertion, invoke `recordOutcome`, reopen, and assert the prior running state, revision and reservation remain. Remove the trigger and prove both outcome and outbox persist. Kill/reopen after successful commit and show the outcome stays pending without new admission.
- [ ] Break artifact bytes in the real durable provider and remove the production verification call separately; the missing/corrupt-artifact test must expose the missing guard. Bypass the outcome transaction and quiescence requirement separately; capture failing rollback/capacity tests. Restore checks and run the whole new subtree, typecheck and lint.
- [ ] Record observed proofs, review the initial schema/hash changes and ask root to review the packet before proceeding.

Example rollback oracle after constructing a valid claimed/running attempt via the public
methods (fixture setup belongs in `testing/fixtures.ts`):

```ts
const before = await runs.readRun(guard.runId);
await expect(recordOutcome(runs, artifacts, guard, completion)).rejects.toThrow(
  'injected outbox fault',
);
expect(await reopened.runs.readRun(guard.runId)).toEqual(before);
```

The SQLite test installs `CREATE TRIGGER fail_outbox BEFORE INSERT ON run_outbox BEGIN
SELECT RAISE(ABORT, 'injected outbox fault'); END;` through its separate test connection.
`run_outbox` is the provider table name fixed by this test, not a port concept. Close/open
`reopened` after the failed operation before making the equality assertion.

### Task 4: Deduplicated decisions and exact command receipts

**Files:** Extend `records.ts`, `record-codecs.ts`, `run-store.ts`,
`testing/memory-stores.ts`, `sqlite/run-store.ts`, `sqlite/schema.ts`, migration pair and
`testing/run-store-contract.ts`. Create `signals.test.ts`, `receipts.test.ts`,
`sqlite/signals-receipts.db.test.ts`.

**Interfaces:** Add `Decision`, `HumanWait`, `CommandReceipt`,
`RunStore.receiveDecision`, `consumeDecision`, `reconcileReceipt`. All incoming evidence is
verified through `ArtifactStore` before calling the trusted store; real authentication and
WBS readback remain the bridge/inbox caller's responsibility outside S0.

- [ ] Write shared receipt cases: exact pending intent becomes terminal and removes outbox atomically; duplicate acknowledgement is idempotent across reopen; wrong command digest, claim, run, attempt or project refuses without mutation. A generic WBS progress observation cannot be constructed as exact receipt evidence by the fixture.
- [ ] Write shared inbox cases: same authorized decision before/after reopen is consumed once; identical receive after consumption is still duplicate; changed actor/choice under one ID refuses; wrong correlation/choice refuses; a competing decision cannot consume an already-resumed wait. A wait never satisfies business completion.
- [ ] Fill local capacity with another run before consuming a decision: capacity_full leaves the decision unconsumed and attempt waiting. After proven quiescence releases the other slot, consume once, reacquire one slot and retain claim/continuation identity. Owner takeover and stale expected revisions refuse consumption.
- [ ] Implement atomic receipt reconciliation and inbox consumption. Persist request identities so exact duplicate retries work after revision/state advances, while stale owners remain refused before deduplication.
- [ ] Add SQLite abort triggers at receipt insert and decision-consumption/reservation insert; failed operations preserve the whole preceding snapshot across reopen. Simulate progress accepted remotely but acknowledgement lost with a fake receipt source: reopen reconciles the exact recorded command and never creates a new attempt. This establishes persistence behavior only, not the live WBS API contract.
- [ ] Remove receipt authority matching, inbox uniqueness and consumption atomicity separately; watch the corresponding production-path negative fail, restore and rerun. Record proofs and request root review.

### Task 5: Production provider selection and foundation acceptance

**Files:** Create `open-stores.ts`, `open-stores.test.ts`; finish symbol JSDoc in the touched
ports/providers; update parent `verify.md` with measured results. Do not edit deployment or
CLI commands. Keep knowledge about methods on their symbols, using links to the owning
OpenSpec design only for cross-file rationale.

**Interfaces:** `openStores(configuration: SqliteConfiguration, clock: WallClock)` returns
`{ runs: RunStore; artifacts: ArtifactStore; ownership: OwnershipStatus; close(): void }`.
`SqliteConfiguration` is the exact discriminator/configuration shape in storage-design.md.
Its decoder rejects unknown providers and missing settings. The production path has no
memory fallback and cannot bootstrap missing trusted state.

- [ ] Write selection tests: valid SQLite configuration reopens persisted state; memory/unknown provider, missing required settings, altered persisted organization/capacity/lease and absent database all throw. Double close is idempotent; every operation after close throws. Malformed values are rejected at the configuration boundary.
- [ ] Implement the small composition factory and verify there is no `bun:sqlite`, SQL, path or adapter-schema type import in either port/core record module. Test import boundaries structurally using the existing repository TypeScript AST pattern; injecting a forbidden adapter import must fail the assertion.
- [ ] Run all new shared and SQLite tests plus Dash typecheck/lint. Record every skipped/unavailable check explicitly. Do not broaden into full host gates outside the required script.
- [ ] Execute each unproven safety negative from the matrix below; add the observed `Proof:` comments only after its failure is seen and the restored production path passes.
- [ ] Have root review final code, exact diff and verification evidence. Root runs the full clean-worktree gate for the selected SHA and decides when parent 6a.1–6a.2 may be checked. This packet does not check 6a.3–6a.8, 6b.3 or product W0–W12.

## Required fault oracles

| Boundary              | Injected fault                                  | Observable failing assertion                                          |
| --------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| Owner                 | Omit epoch/expiry/store-identity predicate      | Stale/foreign owner admits or commits                                 |
| Revision              | Omit expected revision predicate                | Competing write changes stale snapshot                                |
| Capacity              | Ignore stored cap or release on takeover        | Capacity-one fixture has two potentially live attempts                |
| Admission transaction | Split attempt/reservation writes; abort latter  | Reopen contains an orphan attempt or changed revision                 |
| Trusted open          | Enable create-on-open; map EACCES to absent     | Missing path created or unreadable misclassified                      |
| Version/integrity     | Bypass decoder/hash check                       | Unknown/malformed record or altered bytes returned                    |
| Quiescence            | Skip operation/effect/evidence check            | Uncertain attempt frees slot or retries                               |
| Outcome/outbox        | Split commit; abort outbox write                | Outcome survives without matching intent                              |
| Artifact boundary     | Skip verified reads; delete/corrupt output      | Outcome accepted despite absent/corrupt retained output               |
| Receipt               | Ignore command/authority identity               | Unrelated receipt terminalizes an attempt                             |
| Inbox                 | Remove uniqueness/atomic consumption            | One decision consumes twice or is lost on failed capacity reservation |
| Snapshot              | Read run/attempts/capacity outside one snapshot | Controlled competing commit produces impossible combined revision     |
| Close                 | Omit closed-store check                         | Post-close public operation succeeds                                  |
| Port isolation        | Inject provider import into a port              | AST boundary test names forbidden dependency                          |

Each row is a minimum oracle; every additional safety branch needs its own meaningful
negative. Faults must enter through real production methods. Test fixtures may inject a
fault into a provider dependency or deliberately damage its storage; they may not replace
the method being tested with a fake that already returns the desired refusal.
