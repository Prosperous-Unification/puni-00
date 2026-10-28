# Provider Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this coupled task. Root owns metadata, independent reviews, commits and publication; the implementer owns only declared source/tests and ignored evidence. No nested agents.

**Goal:** Make bundle close awaitable with immediate fencing, admitted-work drain and observed sticky disposal failure.

**Architecture:** Keep lifecycle outside semantic ports. Cache SQLite disposal completion; memory immediately fences and returns Promise.resolve(). Convert cleanup owners together. Preserve every transaction/planner/history/authorization guard and existing opening behavior.

**Tech Stack:** Existing Bun, bun:sqlite, TypeScript, node:assert/strict, bun:test and Nx. No new dependency or engine.

**Spec:** openspec/changes/twilight-agentic-workflows/specs/twilight/run-coordination/spec.md plus provider-lifecycle-design.md and provider-lifecycle-intent.md in that same change. Append the supplied delta to the existing ADDED Requirements document; do not create a second capability or overwrite existing requirements.

## Global constraints

- Work only in /home/df/.codex/worktrees/9a53/puni-00 on feat/agentic-store-lifecycle from b47a9363624067fcfbe194234b5c71ed42ef7a3e; read current status before edits. Root owns tracked metadata, reviews, commits, push and publication. No nested agents.
- No guard refactor, planner/history/SQL/schema/migration/version/provider/authentication change. Inherited guards remain installed verbatim during fault proofs too.
- No CTT, heartbeat, business-outcome, compute, activation, credentials, limits, transfer or production work.
- Never edit the separate runtime PR 766 source/gate checkout.
- Bun and Nx only; no new package install is needed for this slice.
- No claims of working behavior without fresh output. Baseline is parent evidence only.
- Testable behavior is the explicit queued-versus-active and old-failure-versus-sticky-failure delta in the design.

## Task 1: Complete the bundle lifecycle and every cleanup caller as one unit

This is one implementation/review unit because a partial return-type migration cannot compile against the fixtures and cleanup owners. Its red, green and proof steps are ordered below; do not commit broken intermediate signatures.

**Create, under apps/twilight-structure/twilight-dash/cli/src/runs/:**

- store-lifecycle.test.ts — memory temporal/public Promise contract.
- sqlite/store-lifecycle.db.test.ts — real held-writer drain, queue rejection, original disposal cause and actual fixture cleanup.
- testing/close-fixtures.ts — test-only all-settled cleanup for five shared afterEach hooks.

**Modify, relative to that same runs/ root:**

```text
open-stores.ts
testing/memory-stores.ts
sqlite/run-store.ts
testing/fixtures.ts
testing/run-store-contract.ts
testing/artifact-store-contract.ts
testing/manifest-binding-contract.ts
testing/authority-dispatch-contract.ts
testing/claim-dispatch-contract.ts
testing/claim-request-contract.ts
testing/execution-command-contract.ts
testing/execution-contract.ts
testing/execution-edge-contract.ts
testing/execution-history-contract.ts
testing/outcome-collision-contract.ts
testing/outcomes-contract.ts
testing/preparation-dispatch-contract.ts
testing/receipts-contract.ts
testing/runtime-dispatch-worker.ts
testing/runtime-history-contract.ts
testing/signal-edge-contract.ts
testing/signals-contract.ts
testing/turn-dispatch-contract.ts
testing/verified-operations-contract.ts
testing/verified-signals-contract.ts
admission.test.ts
artifact-store.test.ts
claim-history.test.ts
execution-history.test.ts
manifest-binding.test.ts
open-stores.test.ts
record-preparation.test.ts
runtime-history.test.ts
sqlite/admission-races.db.test.ts
sqlite/artifact-store.db.test.ts
sqlite/build-claim-request.db.test.ts
sqlite/capacity-integrity.db.test.ts
sqlite/claim-activity.db.test.ts
sqlite/dispatch-authority.db.test.ts
sqlite/dispatch-turn.db.test.ts
sqlite/execution-history.db.test.ts
sqlite/execution-integrity.db.test.ts
sqlite/manifest-binding.db.test.ts
sqlite/open-stores.db.test.ts
sqlite/outcomes.db.test.ts
sqlite/prepare-activity.db.test.ts
sqlite/run-store.db.test.ts
sqlite/runtime-history.db.test.ts
sqlite/runtime-races.db.test.ts
sqlite/signal-integrity.db.test.ts
sqlite/signals-receipts.db.test.ts
sqlite/snapshot.db.test.ts
```

Line-level callers, special aliases, raw native exclusions and context are in .superpowers/sdd/provider-lifecycle-tasks/caller-inventory.json. Registration-only tests build-claim-request, claim-activity, dispatch-authority, dispatch-turn, outcomes, prepare-activity, receipts, run-store and signals inherit the new fixture contract and ordinarily need no edit. sqlite/open-stores.ts and sqlite/schema.ts are inspected owners whose raw cleanup stays unchanged.

**OpenSpec documents are root-owned:** root installs provider-lifecycle-{intent,design,tasks}.md, appends the delta to specs/twilight/run-coordination/spec.md and evidence to verify.md, and links the prerequisite from tasks.md and storage-design.md. Preserve existing second-provider/transfer work. Implementer does not edit these tracked documents or CONTEXT.

**Interfaces produced:**

- Every bundle factory has the complete shapes shown in provider-lifecycle-design.md; close(): Promise<void>.
- StoreFixture keeps runs: RunStore, ownership: OwnershipStatus, clock: FixtureClock, close(): Promise<void>.
- OutcomeFixture keeps runs: RunStore, artifacts: ArtifactStore, ownership: { readonly epoch: number }, clock: FixtureClock, close(): Promise<void>.
- BindingStores keeps runs: RunStore, artifacts: ArtifactStore, ownership: { readonly epoch: number }, close(): Promise<void>.
- artifactStoreContract create remains () => Promise<{ artifacts: ArtifactStore; close(): Promise<void> }>.
- closeFixtures(fixtures: readonly { close(): Promise<void> }[]): Promise<void> attempts every fixture even if a Promise-typed close throws synchronously, awaits every settlement and preserves original causes in AggregateError.errors.
- Fixture-only disconnect(): Promise<void> returns bundle.close(); every caller awaits it.
- SQLite TransactionOptions, SqliteOptions, MemoryOptions, RunStore, ArtifactStore and ActivityExecutor are otherwise unchanged.

- [x] **Step 1: Write the lifecycle tests, then observe meaningful red.**

Copy the complete test bodies below into their stated files. The test-only closeFixtures implementation below may be placed with these tests so red fails on lifecycle behavior, not missing import. Run the two new files against unchanged adapter bodies:

```sh
bun test ./apps/twilight-structure/twilight-dash/cli/src/runs/store-lifecycle.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/store-lifecycle.db.test.ts --timeout 60000
```

Expected meaningful failures: old memory close returns undefined; old SQLite close invokes native disposal before drain; native close failure throws synchronously and leaves ports open. Capture exact actual assertions. Missing module, type typo, setup timeout or unsupported instrumentation is not the intended red; correct the test setup before proceeding. These drafts have not been compiled or run.

- [x] **Step 2: Apply both lifecycle bodies and seven signature changes.**

Use the exact SQLite and memory bodies in the design. Add closing: Promise<void> | undefined beside SQLite's existing lifecycle state only. Memory sets isClosed=true and returns Promise.resolve() without a cache or new branch. Update only close JSDoc, signatures and bodies. No changes to transact, rollback, any port method or its guard text/order.

- [x] **Step 3: Carry completion through every registered cleanup owner.**

Ordinary cleanup keeps the existing try body and changes its finally clause:

```ts
finally {
  await stores.close();
}
```

For the existing createAdmittedFixture wrapper:

```ts
close: () => stores.close(),
```

For deletion wrappers use a cached completion that fences the bundle immediately and only removes storage after completion:

```ts
let closing: Promise<void> | undefined;
return {
  ...stores,
  close(): Promise<void> {
    if (closing !== undefined) return closing;
    closing = (async () => {
      await stores.close();
      rmSync(directory, { recursive: true });
    })();
    return closing;
  },
};
```

Retain each fixture's existing rmSync options/path; add its other returned fields unchanged. Remove old boolean-only close caching in artifact-store and manifest-binding DB fixtures. Raw probe Databases close synchronously before removing their paths; do not await or change their API.

For disconnect aliases:

```ts
disconnect: (() => stores.close(),
  // At every existing call:
  await stores.disconnect());
```

Five shared hooks become:

```ts
afterEach(async () => {
  await closeFixtures(opened.splice(0));
});
```

Import closeFixtures from './close-fixtures' in those testing/ files. Retain opened array element types. Use the helper implementation below.

Preserve immediate-fence assertions: initiate close, invoke rejection checks before awaiting it, then await it before restoring interceptors/deleting storage:

```ts
const closing = stores.close();
const repeated = stores.close();
for (const [name, operation] of Object.entries(operations))
  await rejects(operation(), /closed/, name + ' must refuse a closed store');
await closing;
await repeated;
```

In the all-22-method retained-connection test, keep every original operation and method-set equality assertion. Ensure await closing occurs before restoring Database.prototype.close; native captured connection cleanup remains synchronous. Shared fixtures may wrap bundle close; exact Promise identity is an implementation detail, not an acceptance requirement. Observe shared completion, disposal count and original failure instead.

In sqlite/admission-races.db.test.ts closeAdmissionProcess, change setup.close() inside its existing try to await setup.close(); retain all-settled child cleanup and collected causes. Avoid logging successful fixture closure when disposal failed. In any existing catch that adds context/rethrows work failure, preserve that cause if cleanup also fails (AggregateError with both originals where needed), and do not remove paths after failed disposal.

Child-source strings in admission-races, runtime-races and snapshot use await stores.close(). Wrap the opened-store-owned body of outcomes childSource and execution-history coupledChildSource in try/finally { await stores.close(); } for ordinary errors/timeouts; preserve SIGKILL and before/after-COMMIT barriers unchanged. A forced kill does not execute finally and remains the intended crash proof.

testing/runtime-dispatch-worker.ts awaits reopenedBefore.close(), observer.close(), observer?.close() and writer.close(). Its nested finally still disconnects IPC to avoid a hanging child on failure, but a rejected close must propagate; do not print a successful shutdown receipt for it. The forbidden ActivityExecutor.close test double is unchanged.

Review all aliases and caller contexts in the JSON, then re-scan factory returns, close references, disconnect and source strings. Do not merely search stores.close().

- [x] **Step 4: Run green and preserve existing negative coverage.**

Run the new focused files, then:

```sh
bun test ./apps/twilight-structure/twilight-dash/cli/src/runs --timeout 60000
bunx nx run twilight-dash:typecheck
bunx nx run twilight-dash:lint
```

Follow root coordination for heavier checks; these are proposed commands, not results. The root baseline has already run; do not rerun it just to relabel it. Full runs coverage includes all factory registrations, child scripts, real BUSY snapshots, native retained-connection checks, provider validation and schema/open negatives. Fix only lifecycle-related failures; report unrelated baseline changes.

- [x] **Step 5: Prove changed checks break, one fault at a time.**

Use L1–L6 in verify.md in an isolated proof checkout, never on the frozen runtime lane. Run only the named lifecycle/retained-connection test for each injected fault. Capture actual emitted failure and its explicit MEMORY-LIFECYCLE or SQLITE-LIFECYCLE assertion diagnostic; never classify a source excerpt or default true/false mismatch as the oracle. Restore exact source before the next. Every inherited guard remains installed verbatim in every proof. L1 mutates only the new SQLite close body's closed=true assignment and must exercise the explicit queued-before-close case with the original transaction guard intact, as well as the retained-connection negative. L5 mutates the actual deleting fixture wrapper in the new DB test; L6 independently removes awaited settlement and removes the async callback boundary from the shared helper; its tests exercise actual SQLite resource ownership and a Promise-typed fixture close that throws synchronously.

Native disposal is synchronous here; the meaningful delayed completion proof is a real SQLite held writer, actual queued production operations and observed native close invocation. A fake Promise returned by Database.close would violate its real contract and is not proof of network disposal.

- [x] **Step 6: Review the complete diff and finish parent-owned verification.**

Compare per-operation and transact executable text against the baseline byte-for-byte; only adjacent observed Proof comments may change there. Other adapter changes are limited to the documented factory JSDoc/signature/state/close body. Confirm no changes to guards, schema, bootstrap, versions, provider selection or unrelated owners. Report actual commands, failures, restored passes and skipped checks; root updates verify.md. Parent runs format with --all, OpenSpec validation and canonical host gate on the reviewed final SHA, and owns any commit/review/publication. Reconcile accepted boot callers after the separate runtime patch is integrated, without editing its active checkout.

Parent-owned publication and the accepted boot callers are complete through
[PR #766](https://github.com/Prosperous-Unification/puni-00/pull/766); the exact-source
gate, actual-merge CI and retained coverage limits are recorded in [verify.md](verify.md).

## Complete test-only helper

Destination: apps/twilight-structure/twilight-dash/cli/src/runs/testing/close-fixtures.ts

```ts
/** Waits for every registered fixture and preserves all cleanup failures, including synchronous throws. */
export async function closeFixtures(
  fixtures: readonly { close(): Promise<void> }[],
): Promise<void> {
  const settled = await Promise.allSettled(
    fixtures.map(async (fixture) => {
      await fixture.close();
    }),
  );
  const failures: unknown[] = [];
  for (const completion of settled) {
    if (completion.status === 'rejected') {
      const failure: unknown = completion.reason;
      failures.push(failure);
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, 'store fixture cleanup failed');
}
```

## Complete memory test

Destination: apps/twilight-structure/twilight-dash/cli/src/runs/store-lifecycle.test.ts

```ts
import { ok, rejects, strictEqual } from 'node:assert/strict';

import { test } from 'bun:test';

import { organizationId, ownerId } from './record-codecs';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';

test('memory close repeats successful outcome and immediately fences both ports', async () => {
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
  });
  const active = stores.runs.acquireOwnership(ownerId('active'), 0);
  const closing = stores.close();
  ok(
    closing instanceof Promise,
    'MEMORY-LIFECYCLE-01: close must return observable Promise completion',
  );
  const repeated = stores.close();
  ok(
    repeated instanceof Promise,
    'MEMORY-LIFECYCLE-02: close must return observable Promise completion',
  );
  const lateRun = rejects(
    stores.runs.acquireOwnership(ownerId('late'), 0),
    /closed/,
    'MEMORY-LIFECYCLE-03: operation invoked after close must reject through the existing lifecycle fence',
  );
  const lateArtifact = rejects(
    stores.artifacts.retainArtifact(new Uint8Array([9]), 'test/bytes'),
    /closed/,
    'MEMORY-LIFECYCLE-04: operation invoked after close must reject through the existing lifecycle fence',
  );
  strictEqual(
    (await active).kind,
    'applied',
    'MEMORY-LIFECYCLE-05: an operation published before close retains its original outcome',
  );
  await lateRun;
  await lateArtifact;
  await closing;
  await repeated;
  await stores.close();
});
```

## Complete real SQLite test

Destination: apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/store-lifecycle.db.test.ts

Instrumentation observes actual SQLite BUSY from the instance's native run method and rethrows it. It never substitutes a simulated BUSY. The failure test injects native close failure into a real provider connection. release() is explicit test-only recovery after assertions, not a proposed production retry.

```ts
import { deepEqual, ok, rejects, strictEqual } from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { test } from 'bun:test';

import { manifestDigest, organizationId, ownerId } from '../record-codecs';
import { closeFixtures } from '../testing/close-fixtures';
import { FixtureClock } from '../testing/fixtures';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';
import { createSqliteRunStore, isBusy, RunStoreContentionError } from './run-store';
import { configureDatabase } from './schema';

async function createLifecycleFixture(maxBusyAttempts = 100) {
  const directory = mkdtempSync(join(tmpdir(), 'store-lifecycle-'));
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts,
    busyDelayMilliseconds: 5,
  };
  await (await bootstrapSqliteStores(options)).close();
  const database = new Database(options.path, { create: false, strict: true });
  configureDatabase(database);
  const stores = createSqliteRunStore(database, options);
  const blocker = new Database(options.path, { create: false, strict: true });
  const busy = Promise.withResolvers<void>();
  const originalRun = database.run;
  const originalClose = database.close;
  let nativeCloses = 0;
  let nativeReleased = false;
  let blockerReleased = false;
  let failure: Error | undefined;
  let cleanup: Promise<void> | undefined;
  Object.defineProperty(database, 'run', {
    configurable: true,
    value(...parameters: Parameters<Database['run']>) {
      try {
        return originalRun.apply(database, parameters);
      } catch (cause) {
        if (parameters[0] === 'BEGIN IMMEDIATE' && isBusy(cause)) busy.resolve();
        throw cause;
      }
    },
  });
  Object.defineProperty(database, 'close', {
    configurable: true,
    value() {
      nativeCloses += 1;
      if (failure !== undefined) throw failure;
      originalClose.call(database);
      nativeReleased = true;
    },
  });
  return {
    directory,
    options,
    database,
    blocker,
    stores,
    busy: busy.promise,
    nativeCloses: () => nativeCloses,
    unlock() {
      if (!blockerReleased && blocker.inTransaction) blocker.run('ROLLBACK');
    },
    failClose(cause: Error) {
      failure = cause;
    },
    close(): Promise<void> {
      if (cleanup !== undefined) return cleanup;
      cleanup = (async () => {
        await stores.close();
        blocker.close();
        blockerReleased = true;
        rmSync(directory, { recursive: true });
      })();
      return cleanup;
    },
    // Test-only fault recovery: restore native methods and release deliberately retained resources.
    release() {
      if (!blockerReleased) {
        if (blocker.inTransaction) blocker.run('ROLLBACK');
        blocker.close();
        blockerReleased = true;
      }
      Object.defineProperty(database, 'run', { configurable: true, value: originalRun });
      Object.defineProperty(database, 'close', { configurable: true, value: originalClose });
      if (!nativeReleased) originalClose.call(database);
      if (existsSync(directory)) rmSync(directory, { recursive: true });
    },
  };
}

async function waitForBusy(busy: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      busy,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('real SQLite BUSY was not observed')), 1000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

for (const outcome of ['release', 'exhaust'] as const)
  test(
    'close drains admitted real SQLite writer and rejects queued calls: ' + outcome,
    async () => {
      const fixture = await createLifecycleFixture(outcome === 'release' ? 100 : 3);
      const pending: Promise<unknown>[] = [];
      try {
        fixture.blocker.run('BEGIN IMMEDIATE');
        const active = fixture.stores.runs.acquireOwnership(ownerId('active'), 0);
        pending.push(active);
        // Attach the rejection observer before allowing the contention budget to expire.
        const activeCheck =
          outcome === 'exhaust'
            ? rejects(
                active,
                (cause: unknown) => cause instanceof RunStoreContentionError,
                'SQLITE-LIFECYCLE-01: admitted operation must preserve the bounded SQLite contention failure',
              )
            : active.then((reply) => {
                strictEqual(
                  reply.kind,
                  'applied',
                  'SQLITE-LIFECYCLE-02: already admitted operation must finish successfully when its lock is released',
                );
              });
        pending.push(activeCheck);
        await waitForBusy(fixture.busy);
        const queued = fixture.stores.runs.acquireOwnership(ownerId('queued'), 0);
        const queuedCheck = rejects(
          queued,
          /run store is closed/,
          'SQLITE-LIFECYCLE-03: queued-before-close operation must reject at the unchanged transaction fence',
        );
        pending.push(queuedCheck);
        const closing = fixture.stores.close();
        ok(
          closing instanceof Promise,
          'SQLITE-LIFECYCLE-04: close must return observable Promise completion',
        );
        const repeated = fixture.stores.close();
        ok(
          repeated instanceof Promise,
          'SQLITE-LIFECYCLE-05: close must return observable Promise completion',
        );
        pending.push(repeated);
        let repeatedFinished = false;
        const observedRepeated = repeated.then(() => {
          repeatedFinished = true;
        });
        pending.push(observedRepeated);
        let finished = false;
        const observed = closing.then(() => {
          finished = true;
        });
        pending.push(observed);
        const lateRun = rejects(
          fixture.stores.runs.acquireOwnership(ownerId('late'), 0),
          /run store is closed/,
          'SQLITE-LIFECYCLE-06: operation invoked after close must reject through the existing lifecycle fence',
        );
        const lateArtifact = rejects(
          fixture.stores.artifacts.retainArtifact(new Uint8Array([9]), 'test/bytes'),
          /run store is closed/,
          'SQLITE-LIFECYCLE-07: operation invoked after close must reject through the existing lifecycle fence',
        );
        pending.push(lateRun, lateArtifact);
        await Bun.sleep(1);
        strictEqual(
          finished,
          false,
          'SQLITE-LIFECYCLE-08: cleanup completion must stay pending while the real writer remains blocked',
        );
        strictEqual(
          repeatedFinished,
          false,
          'SQLITE-LIFECYCLE-09: repeated close must stay pending while admitted work is blocked',
        );
        strictEqual(
          fixture.nativeCloses(),
          0,
          'SQLITE-LIFECYCLE-10: native disposal must not run before admitted work drains',
        );
        if (outcome === 'release') fixture.blocker.run('ROLLBACK');
        await activeCheck;
        await queuedCheck;
        await lateRun;
        await lateArtifact;
        await observed;
        await observedRepeated;
        await fixture.stores.close();
        strictEqual(
          fixture.nativeCloses(),
          1,
          'SQLITE-LIFECYCLE-11: native disposal must run exactly once even across repeated or failed cleanup',
        );
        fixture.unlock();
        const reopened = await openSqliteStores(fixture.options);
        try {
          strictEqual(
            reopened.ownership.owner?.ownerId,
            outcome === 'release' ? ownerId('active') : undefined,
            'SQLITE-LIFECYCLE-12: reopened ownership must reflect only the admitted operation outcome',
          );
          deepEqual(
            fixture.blocker.query('SELECT * FROM run_artifact').all(),
            [],
            'SQLITE-LIFECYCLE-13: rejected late artifact operation must publish no rows',
          );
        } finally {
          await reopened.close();
        }
      } finally {
        fixture.unlock();
        await Promise.allSettled(pending);
        fixture.release();
      }
    },
  );

test('fixture cleanup waits for real drain before deleting storage', async () => {
  const fixture = await createLifecycleFixture();
  const pending: Promise<unknown>[] = [];
  try {
    fixture.blocker.run('BEGIN IMMEDIATE');
    const active = fixture.stores.runs.acquireOwnership(ownerId('active'), 0);
    pending.push(active);
    await waitForBusy(fixture.busy);
    const closing = fixture.close();
    pending.push(closing);
    const repeated = fixture.close();
    pending.push(repeated);
    await Bun.sleep(1);
    strictEqual(
      existsSync(fixture.directory),
      true,
      'SQLITE-LIFECYCLE-14: fixture storage must remain while close is pending or has failed',
    );
    strictEqual(
      fixture.nativeCloses(),
      0,
      'SQLITE-LIFECYCLE-15: native disposal must not run before admitted work drains',
    );
    fixture.blocker.run('ROLLBACK');
    strictEqual(
      (await active).kind,
      'applied',
      'SQLITE-LIFECYCLE-16: already admitted operation must finish successfully when its lock is released',
    );
    await closing;
    await repeated;
    strictEqual(
      existsSync(fixture.directory),
      false,
      'SQLITE-LIFECYCLE-17: fixture storage must be deleted only after successful close',
    );
    strictEqual(
      fixture.nativeCloses(),
      1,
      'SQLITE-LIFECYCLE-18: native disposal must run exactly once even across repeated or failed cleanup',
    );
  } finally {
    fixture.unlock();
    await Promise.allSettled(pending);
    fixture.release();
  }
});

test('native close failure stays fenced and cannot delete fixture storage or retry', async () => {
  const fixture = await createLifecycleFixture();
  const failure = new Error('injected native close failure');
  try {
    fixture.failClose(failure);
    const closing = fixture.close();
    await rejects(
      closing,
      (cause: unknown) => cause === failure,
      'SQLITE-LIFECYCLE-19: close must reject with the original native disposal cause',
    );
    await rejects(
      fixture.close(),
      (cause: unknown) => cause === failure,
      'SQLITE-LIFECYCLE-20: close must reject with the original native disposal cause',
    );
    const bundleClosing = fixture.stores.close();
    await rejects(
      bundleClosing,
      (cause: unknown) => cause === failure,
      'SQLITE-LIFECYCLE-21: close must reject with the original native disposal cause',
    );
    await rejects(
      fixture.stores.runs.acquireOwnership(ownerId('late'), 0),
      /closed/,
      'SQLITE-LIFECYCLE-22: operation invoked after close must reject through the existing lifecycle fence',
    );
    await rejects(
      fixture.stores.runs.readManifest(manifestDigest('a'.repeat(64))),
      /closed/,
      'SQLITE-LIFECYCLE-23: operation invoked after close must reject through the existing lifecycle fence',
    );
    await rejects(
      fixture.stores.artifacts.retainArtifact(new Uint8Array([9]), 'test/bytes'),
      /closed/,
      'SQLITE-LIFECYCLE-24: operation invoked after close must reject through the existing lifecycle fence',
    );
    strictEqual(
      fixture.nativeCloses(),
      1,
      'SQLITE-LIFECYCLE-25: native disposal must run exactly once even across repeated or failed cleanup',
    );
    strictEqual(
      existsSync(fixture.directory),
      true,
      'SQLITE-LIFECYCLE-26: fixture storage must remain while close is pending or has failed',
    );
  } finally {
    fixture.release();
  }
});

test('shared fixture cleanup awaits real drain and reports native failures after closing peers', async () => {
  const delayed = await createLifecycleFixture();
  const failing = await createLifecycleFixture();
  const failure = new Error('injected peer native close failure');
  const pending: Promise<unknown>[] = [];
  try {
    delayed.blocker.run('BEGIN IMMEDIATE');
    const active = delayed.stores.runs.acquireOwnership(ownerId('active'), 0);
    pending.push(active);
    await waitForBusy(delayed.busy);
    failing.failClose(failure);
    let finished = false;
    const checked = rejects(
      closeFixtures([failing, delayed]),
      (cause: unknown) => {
        ok(
          cause instanceof AggregateError,
          'SQLITE-LIFECYCLE-28: shared cleanup must reject with an aggregate after all peers settle',
        );
        deepEqual(
          cause.errors,
          [failure],
          'SQLITE-LIFECYCLE-29: aggregate cleanup failure must preserve every original cause in fixture order',
        );
        return true;
      },
      'SQLITE-LIFECYCLE-27: shared cleanup must report all original failures after attempting every peer',
    ).then(() => {
      finished = true;
    });
    pending.push(checked);
    await Bun.sleep(1);
    strictEqual(
      finished,
      false,
      'SQLITE-LIFECYCLE-30: cleanup completion must stay pending while the real writer remains blocked',
    );
    strictEqual(
      existsSync(delayed.directory),
      true,
      'SQLITE-LIFECYCLE-31: fixture storage must remain while close is pending or has failed',
    );
    delayed.blocker.run('ROLLBACK');
    strictEqual(
      (await active).kind,
      'applied',
      'SQLITE-LIFECYCLE-32: already admitted operation must finish successfully when its lock is released',
    );
    await checked;
    strictEqual(
      existsSync(delayed.directory),
      false,
      'SQLITE-LIFECYCLE-33: fixture storage must be deleted only after successful close',
    );
    strictEqual(
      existsSync(failing.directory),
      true,
      'SQLITE-LIFECYCLE-34: fixture storage must remain while close is pending or has failed',
    );
    strictEqual(
      failing.nativeCloses(),
      1,
      'SQLITE-LIFECYCLE-35: native disposal must run exactly once even across repeated or failed cleanup',
    );
  } finally {
    delayed.unlock();
    await Promise.allSettled(pending);
    delayed.release();
    failing.release();
  }
});

test('shared fixture cleanup attempts every peer after synchronous close throws', async () => {
  const peer = await createLifecycleFixture();
  const failing = await createLifecycleFixture();
  const synchronousFailure = new Error('injected synchronous fixture close failure');
  const nativeFailure = new Error('injected peer native close failure');
  const synchronous = {
    close(): Promise<void> {
      throw synchronousFailure;
    },
  };
  try {
    failing.failClose(nativeFailure);
    await rejects(
      closeFixtures([synchronous, peer, failing]),
      (cause: unknown) => {
        ok(
          cause instanceof AggregateError,
          'SQLITE-LIFECYCLE-37: shared cleanup must reject with an aggregate after all peers settle',
        );
        deepEqual(
          cause.errors,
          [synchronousFailure, nativeFailure],
          'SQLITE-LIFECYCLE-38: aggregate cleanup failure must preserve every original cause in fixture order',
        );
        return true;
      },
      'SQLITE-LIFECYCLE-36: shared cleanup must report all original failures after attempting every peer',
    );
    strictEqual(
      peer.nativeCloses(),
      1,
      'SQLITE-LIFECYCLE-39: native disposal must run exactly once even across repeated or failed cleanup',
    );
    strictEqual(
      failing.nativeCloses(),
      1,
      'SQLITE-LIFECYCLE-40: native disposal must run exactly once even across repeated or failed cleanup',
    );
    strictEqual(
      existsSync(peer.directory),
      false,
      'SQLITE-LIFECYCLE-41: fixture storage must be deleted only after successful close',
    );
    strictEqual(
      existsSync(failing.directory),
      true,
      'SQLITE-LIFECYCLE-42: fixture storage must remain while close is pending or has failed',
    );
  } finally {
    peer.release();
    failing.release();
  }
});
```

## Self-review and limits

Every delta scenario maps to a new test or the retained portable-import/all-method test. Inventory includes aliases and embedded programs and explicitly reports zero destructured lifecycle bindings. No new domain term is needed. Cleanup helper is test-only and part of this coupled unit, not a new production lifecycle framework. No engine choice is made.

The draft tests and helper are concrete code, but uncompiled and unexecuted. Source reads establish call ownership, not test success. The first executor must observe meaningful red before treating instrumentation as valid. No source, tracked metadata, install, commit, push or gate was changed/run by this planning agent.
