# Awaited provider lifecycle

Source: b47a9363624067fcfbe194234b5c71ed42ef7a3e at /home/df/.codex/worktrees/9a53/puni-00. Existing run store, provider bundle, ownership, artifact and execution fact vocabulary is sufficient. No new glossary term or ADR is needed for this reversible lifecycle signature.

## Interfaces

Retain current fields and change only close(): void to close(): Promise<void> in seven explicit declarations:

- runs/open-stores.ts openStores return.
- runs/sqlite/run-store.ts createSqliteRunStore return.
- runs/testing/memory-stores.ts createMemoryStores return.
- runs/testing/run-store-contract.ts StoreFixture.
- runs/testing/fixtures.ts OutcomeFixture.
- runs/testing/manifest-binding-contract.ts BindingStores.
- runs/testing/artifact-store-contract.ts inline factory result.

Complete public shapes:

```ts
openStores(configuration: SqliteConfiguration, clock: WallClock): Promise<{
  runs: RunStore; artifacts: ArtifactStore; ownership: OwnershipStatus;
  close(): Promise<void>;
}>;
createSqliteRunStore(database: Database, options: TransactionOptions): {
  runs: RunStore; artifacts: ArtifactStore; close(): Promise<void>;
};
createMemoryStores(options: MemoryOptions): {
  runs: RunStore; artifacts: ArtifactStore; ownership: OwnershipStatus;
  close(): Promise<void>;
};
openSqliteStores(input: SqliteOptions): Promise<{
  runs: RunStore; artifacts: ArtifactStore; ownership: OwnershipStatus;
  close(): Promise<void>;
}>;
bootstrapSqliteStores(input: SqliteOptions): Promise<{
  runs: RunStore; artifacts: ArtifactStore; ownership: OwnershipStatus;
  close(): Promise<void>;
}>;
```

The SQLite open functions already infer their bundle from createSqliteRunStore. Their bodies and raw Database cleanup need no change. Preserve all eager file/format/configuration validation, bootstrap publication and provider validation. No lifecycle method or vendor import enters the 20-operation RunStore or 2-operation ArtifactStore.

## Timing and implementation

SQLite transact awaits the previous queue turn, checks closed, then enters bounded BEGIN/rollback/retry logic. Leave that entire function and every per-operation body unchanged. Set closed synchronously in close before any await; cache the Promise itself (a non-async public method avoids an extra wrapper). Exact Promise object identity is an implementation detail; acceptance requires one disposal and a shared completion/failure outcome.

```ts
let closing: Promise<void> | undefined;
// Existing queue, closed, transact and operation bodies remain unchanged.
close(): Promise<void> {
  if (closing !== undefined) return closing;
  closed = true;
  const accepted = queue;
  closing = (async () => {
    await accepted;
    database.close();
  })();
  return closing;
}
```

An operation invoked before close but still waiting for its turn rejects at the existing check without beginning a transaction. An operation already past that check may finish its existing bounded busy retries and commit or fail normally. New calls cannot enter transactions; existing argument clone/validation timing remains unchanged. Immediate fencing means immediate exclusion from publication, not synchronous throwing from async methods.

The captured queue tail resolves through every turn's existing finally even if an operation rejected. Drain does not convert an operation failure into a disposal failure: callers still observe their operation promises. Later calls may append rejected queue turns but cannot acquire resources and need not extend the captured drain boundary.

Memory publishes synchronously before returned operation promises settle. It owns no resource, pending disposal or failure outcome to cache. Setting its existing fence and returning Promise.resolve() already gives idempotent successful outcomes; Promise object identity is not the contract. Preserve every assertOpen and operation body:

```ts
close(): Promise<void> {
  isClosed = true;
  return Promise.resolve();
}
```

JSDoc on public close/factories states fencing, queued rejection, admitted-work drain, idempotence and sticky original-cause disposal failure. Link this design from storage-design.md lifecycle paragraph; do not duplicate mutable findings into LLM_README or CONTEXT.

## Explicit failure change and bounds

Old close calls database.close before closed=true. A throw is synchronous, leaves ports open, and permits another native attempt. New close returns a rejected Promise with the same cause object, leaves ports fenced and never retries native close. Failure cannot promise the resource was released. Fixture paths remain when disposal fails. Fault tests explicitly restore native close and release deliberately retained connections; production receives no retry/reset escape hatch.

No new SQLite timeout is needed: admitted operations retain finite maxBusyAttempts/busyDelayMilliseconds, then native close is synchronous. A future network adapter must choose and prove its own bounded disposal. This slice does not certify asynchronous network shutdown.

## Two viable alternatives

1. Keep synchronous close as an admission fence and add dispose(): Promise<void>. This makes the phases explicit, but creates two mandatory calls, still requires every owner to await dispose, and encourages forgotten cleanup. Prefer one observed close.
2. Fence new work but finish all operations invoked before close, including queued work. Conventional graceful drain is implementable by recording admission before queueing, but would permit queued writes where current SQLite rejects and require changing transact guard timing. Preserve queued rejection.

Fire-and-forget disposal and per-operation pools are not solutions to observed lifecycle completion.

## Caller ownership

.superpowers/sdd/provider-lifecycle-tasks/caller-inventory.json records 63 files and 701 candidate occurrences with context and AST binding scans, not 701 required changes. Factory-only memory registrations inherit the new return type without edits. Factory-name searches found no callsite outside runs in apps/libs at this SHA.

Every shared-contract finally awaits close. Five afterEach owners (run-store, runtime-history, authority-dispatch, claim-dispatch, turn-dispatch) await all closures and surface failures. A small test-only closeFixtures helper owns Promise.allSettled and AggregateError.errors; it maps each fixture through an async callback so a synchronous throw is captured without preventing attempts to close other peers. It never deletes storage.

Wrappers that remove paths must await close first. Existing boolean-idempotent wrappers in SQLite artifact-store and manifest-binding tests need cached promises; otherwise concurrent second close falsely reports completion. Preserve disposal failure and skip rmSync. No blanket replacement of all .close() is safe:

- runtime-history.db.test.ts and dispatch-authority.db.test.ts disconnect aliases must return the bundle promise and every caller must await it.
- execution-history.db.test.ts connection: stores and fixture.stores.connection refer to bundles.
- build-claim-request, claim-activity, prepare-activity and dispatch-turn DB tests also call bundles connection.
- dispatch-turn.db.test.ts reader is a bundle; admission-races.db.test.ts reader is raw Database.
- open-stores.test.ts captured connections are raw Database and stay synchronous.
- testing/fixtures.ts createAdmittedFixture close wrapper must return the promise.
- testing/runtime-dispatch-worker.ts awaits reopenedBefore, observer and writer before normal IPC disconnect. ActivityExecutor close: rejectRecovery stays unchanged.
- Embedded admission-races, runtime-races and snapshot child programs await bundle close before graceful completion. Outcome/coupled-history child programs intentionally await SIGKILL at crash barriers; preserve that crash behavior and do not claim forced termination can await cleanup.
- AST scan found no destructured close binding at this SHA. Reinspect final integration for newly added aliases.
- Existing try/finally cleanup must not delete paths or print store-cleanup success after rejected close. Preserve original causes in existing aggregation, especially closeAdmissionProcess.

ActivityExecutor.close(session: ActivitySession): Promise<void> in agents/activity-executor.ts is unrelated and unchanged. Low-level schema/open/bootstrap Database.close remains synchronous.

## Evidence limits

The disposable PostgreSQL receipt reports bytea round trip, bigint as string, rollback, Promise-returning close, post-close rejection and removal of its container under Bun 1.4.4/PostgreSQL 18.6. It is minimal SQL feasibility, not engine selection or complete lock/restart/lifecycle/conformance proof.

Parent baseline: 68 pass, 0 fail, 155 expectations, 4.19s for open-stores.test.ts and sqlite/run-store.db.test.ts; evidence .superpowers/sdd/provider-lifecycle-tasks/baseline-20261027a/. No proposed implementation tests were run by this planning agent.

This successful-close change is also deliberate: old close physically shut SQLite during a BUSY sleep, so the admitted operation could fail on its next native access. New close lets that already-admitted operation finish under unchanged fresh owner/clock/transaction checks before physical close. This is resource drain only; it says nothing about activity heartbeat, effect quiescence or business settlement.

All inherited guards remain installed verbatim during proof injections. The new close-body fence is proved against the explicit queued-before-close case while the original transaction guard remains present.
