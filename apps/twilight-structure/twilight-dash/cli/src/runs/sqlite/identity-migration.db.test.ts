import { rejects } from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { organizationId, ownerId } from '../record-codecs';
import type { RecoveryBeginCall } from '../recovery-records';
import type { RunStore } from '../run-store';
import { constructFixture, settleFixture } from '../testing/construct-fixture';
import { createManifest, FixtureClock, unwrapReply } from '../testing/fixtures';
import { bootstrapFormat4Stores, openFormat4Stores } from '../testing/format4-fixture';
import { createFormat4Fixture, type Format4Capture } from '../testing/format4-fixture';
import {
  createRecoveryFenceCall,
  createRecoveryObservationCall,
  createRecoveryResolveCall,
} from '../testing/recovery-contract';
import { authorityRequest, runtimePin, runtimeScope } from '../testing/runtime-history-contract';
import { createStoreDirectory } from '../testing/store-directory';
import { FORMAT4_IDENTITY, FORMAT5_IDENTITY } from './format';
import { downgradeUnusedSqliteIdentityKeys, upgradeSqliteIdentityKeys } from './migrate-identities';
import { openSqliteStores } from './open-stores';

async function createPredecessor() {
  const directory = mkdtempSync(join(tmpdir(), 'identity-predecessor-'));
  const path = join(directory, 'runs.sqlite');
  const old = await constructFixture(
    () => createFormat4Fixture(path),
    [
      () => {
        rmSync(directory, { recursive: true, force: true });
      },
    ],
  );
  const options = {
    path,
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 10,
    busyDelayMilliseconds: 1,
  };
  return {
    old,
    options,
    async close() {
      await old.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test('genuine populated format4 preserves payloads and unused round trip', async () => {
  const fixture = await createPredecessor();
  try {
    expect(fixture.old.sourceCommit).toBe('b3b594dab4f0153d2ef00a2989bbeb02ea0cbbda');
    await fixture.old.populate('receipt_settled');
    const before = await fixture.old.capture();
    await rejects(openSqliteStores(fixture.options), /incompatible/);
    expect(await fixture.old.capture()).toEqual(before);
    expect(await upgradeSqliteIdentityKeys(fixture.options)).toEqual({
      kind: 'upgraded',
      before: FORMAT4_IDENTITY,
      after: FORMAT5_IDENTITY,
    });
    const current = await openSqliteStores(fixture.options);
    await current.close();
    expect(await downgradeUnusedSqliteIdentityKeys(fixture.options)).toEqual({
      kind: 'downgraded',
      before: FORMAT5_IDENTITY,
      after: FORMAT4_IDENTITY,
    });
    expect(await fixture.old.capture()).toEqual(before);
  } finally {
    await fixture.close();
  }
}, 60000);

test('genuine already-open format4 writer refuses after format5 publication', async () => {
  const fixture = await createPredecessor();
  try {
    const ownership = await fixture.old.populate('queued');
    await upgradeSqliteIdentityKeys(fixture.options);
    const before = await fixture.old.capture();
    await rejects(
      fixture.old.retainManifest(ownership, createManifest({ credentialReferences: ['new'] })),
      /incompatible|corrupt sqlite physical schema/,
    );
    expect(await fixture.old.capture()).toEqual(before);
  } finally {
    await fixture.close();
  }
}, 60000);

test('applied ownership prevents API downgrade of a genuine upgraded store', async () => {
  const fixture = await createPredecessor();
  try {
    await upgradeSqliteIdentityKeys(fixture.options);
    const current = await openSqliteStores(fixture.options);
    try {
      unwrapReply(await current.runs.acquireOwnership(ownerId('owner'), 0));
    } finally {
      await current.close();
    }
    const before = await fixture.old.capture();
    await rejects(downgradeUnusedSqliteIdentityKeys(fixture.options), /used_history/);
    expect(await fixture.old.capture()).toEqual(before);
  } finally {
    await fixture.close();
  }
}, 60000);

for (const queued of [1, 2] as const)
  test(`genuine format4 ${queued === 1 ? 'BUSY' : 'queued'} writers refuse after publication`, async () => {
    const fixture = await createPredecessor();
    const blocker = new Database(fixture.options.path);
    const pending: Promise<
      { kind: 'resolved'; value: unknown } | { kind: 'rejected'; cause: unknown }
    >[] = [];
    try {
      const ownership = await fixture.old.populate('queued');
      await fixture.old.armBusy(queued);
      blocker.run('BEGIN IMMEDIATE');
      for (let index = 0; index < queued; index += 1)
        pending.push(
          fixture.old
            .retainManifest(
              ownership,
              createManifest({ credentialReferences: ['queued-' + String(index)] }),
            )
            .then(
              (value) => ({ kind: 'resolved' as const, value }),
              (cause: unknown) => ({ kind: 'rejected' as const, cause }),
            ),
        );
      await fixture.old.waitForEvent('busy_paused');
      blocker.run('ROLLBACK');
      await upgradeSqliteIdentityKeys(fixture.options);
      const manifests = blocker.query('SELECT * FROM run_manifest ORDER BY digest').all();
      const ownershipBefore = blocker
        .query('SELECT ownership,last_observed_at FROM run_meta')
        .all();
      fixture.old.releaseBusy();
      for (const settled of await Promise.all(pending)) {
        expect(settled.kind).toBe('rejected');
        if (settled.kind !== 'rejected') throw new Error('old writer unexpectedly resolved');
        expect(String(settled.cause)).toMatch(/incompatible|corrupt sqlite physical schema/);
      }
      expect(blocker.query('SELECT * FROM run_manifest ORDER BY digest').all()).toEqual(manifests);
      expect(blocker.query('SELECT ownership,last_observed_at FROM run_meta').all()).toEqual(
        ownershipBefore,
      );
    } finally {
      fixture.old.releaseBusy();
      if (blocker.inTransaction) blocker.run('ROLLBACK');
      await Promise.all(pending);
      blocker.close();
      await fixture.close();
    }
  }, 60000);

test('unused identity down preserves greatest refusal clock and shared immutable artifact', async () => {
  const fixture = await createPredecessor();
  try {
    const ownership = await fixture.old.populate('queued');
    await fixture.old.retainManifest(ownership, createManifest());
    const before = await fixture.old.capture();
    await upgradeSqliteIdentityKeys(fixture.options);
    const current = await openSqliteStores(fixture.options);
    try {
      fixture.options.clock.advance(10);
      expect((await current.runs.retainManifest(ownership, createManifest())).kind).toBe(
        'duplicate',
      );
      fixture.options.clock.advance(90);
      expect(await current.runs.renewOwnership(ownership)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      const artifact = await current.artifacts.retainArtifact(
        new Uint8Array([4, 5]),
        'application/octet-stream',
      );
      expect(artifact.kind).toBe('retained');
    } finally {
      await current.close();
    }
    const beforeArtifact = await fixture.old.capture();
    const bytes = new Uint8Array([0, 255, 128, 10, 13]);
    const retained = await fixture.old.retainArtifact(bytes, 'application/octet-stream');
    expect(retained.kind).toBe('retained');
    expect(await fixture.old.retainArtifact(bytes, 'application/octet-stream')).toEqual(retained);
    expect(await fixture.old.retainArtifact(bytes, 'text/plain')).toEqual({
      kind: 'refused',
      reason: 'metadata_conflict',
    });
    const afterArtifact = await fixture.old.capture();
    expect(afterArtifact.schema).toEqual(beforeArtifact.schema);
    for (const table of beforeArtifact.tables)
      if (table.name !== 'run_artifact')
        expect(afterArtifact.tables.find((candidate) => candidate.name === table.name)).toEqual(
          table,
        );
    expect(
      afterArtifact.tables
        .find((table) => table.name === 'run_artifact')
        ?.rows.at(-1)
        ?.at(-1),
    ).toEqual(bytes);
    const database = new Database(fixture.options.path);
    try {
      expect(database.query('SELECT used FROM run5_usage').get()).toEqual({ used: 0 });
      await downgradeUnusedSqliteIdentityKeys(fixture.options);
      expect(database.query('SELECT last_observed_at FROM run_meta').get()).toEqual({
        last_observed_at: 1100,
      });
      const after = await fixture.old.capture();
      for (const table of before.tables.filter(
        (table) =>
          table.name !== 'run_meta' &&
          table.name !== 'run_artifact' &&
          !table.name.startsWith('run5_'),
      ))
        expect(after.tables.find((candidate) => candidate.name === table.name)).toEqual(table);
      expect(database.query('SELECT ownership FROM run_meta').get()).toEqual({
        ownership: JSON.stringify({
          storeId: ownership.storeId,
          organizationId: ownership.organizationId,
          epoch: ownership.epoch,
          owner: ownership,
        }),
      });
    } finally {
      database.close();
    }
  } finally {
    await fixture.close();
  }
}, 60000);

for (const fault of ['predecessor', 'successor', 'abort'] as const)
  test(`identity upgrade refuses ${fault} fault and retains the complete genuine predecessor`, async () => {
    const fixture = await createPredecessor();
    const database = new Database(fixture.options.path);
    try {
      await fixture.old.populate('queued');
      if (fault === 'predecessor') database.run("UPDATE run_record SET run_id='mismatch'");
      else
        database.run(
          `CREATE TRIGGER fail_identity_publication AFTER UPDATE OF schema_version ON run_meta WHEN NEW.schema_version=5 BEGIN ${fault === 'successor' ? 'DELETE FROM run5_usage' : "SELECT RAISE(ABORT,'identity publication fault')"}; END`,
        );
      const before = await fixture.old.capture();
      await rejects(upgradeSqliteIdentityKeys(fixture.options));
      expect(await fixture.old.capture()).toEqual(before);
    } finally {
      database.close();
      await fixture.close();
    }
  }, 60000);

for (const failure of ['absent', 'unreadable'] as const)
  test(`identity upgrade reports ${failure} without initializing trusted state`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'identity-access-'));
    const path = join(directory, 'runs.sqlite');
    const options = {
      path,
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock: new FixtureClock(),
      maxBusyAttempts: 2,
      busyDelayMilliseconds: 1,
    };
    try {
      if (failure === 'unreadable') {
        writeFileSync(path, 'trusted original bytes');
        chmodSync(path, 0);
      }
      await rejects(upgradeSqliteIdentityKeys(options), { failure, phase: 'preflight' });
      if (failure === 'absent') expect(existsSync(path)).toBe(false);
      else {
        chmodSync(path, 0o600);
        expect(readFileSync(path, 'utf8')).toBe('trusted original bytes');
      }
    } finally {
      if (existsSync(path)) chmodSync(path, 0o600);
      rmSync(directory, { recursive: true, force: true });
    }
  });

test('late identity down abort restores successor tables and unused marker', async () => {
  const fixture = await createPredecessor();
  const database = new Database(fixture.options.path);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Observe the actual transition connection immediately before restoring native closure.
  const nativeClose = Database.prototype.close;
  const transactions: boolean[] = [];
  const inspected: ReturnType<typeof captureRows>[] = [];
  try {
    await fixture.old.populate('receipt_settled');
    await upgradeSqliteIdentityKeys(fixture.options);
    database.run(
      "CREATE TRIGGER stop_identity_down BEFORE UPDATE OF schema_version ON run_meta WHEN NEW.schema_version=4 BEGIN SELECT RAISE(ABORT,'late identity down'); END",
    );
    const before = await fixture.old.capture();
    const physical = captureRows(database);
    Database.prototype.close = function (...parameters) {
      if (this.filename === fixture.options.path) {
        transactions.push(this.inTransaction);
        inspected.push(captureRows(this));
      }
      nativeClose.apply(this, parameters);
    };
    await rejects(downgradeUnusedSqliteIdentityKeys(fixture.options), /transition_failed/);
    Database.prototype.close = nativeClose;
    expect(transactions).toEqual([false, false]);
    expect(inspected).toEqual([physical, physical]);
    expect(await fixture.old.capture()).toEqual(before);
  } finally {
    Database.prototype.close = nativeClose;
    database.close();
    await fixture.close();
  }
}, 60000);

for (const method of [
  'acquireOwnership',
  'renewOwnership',
  'retainManifest',
  'createRun',
  'admitAttempt',
  'pinRuntimeScope',
  'stageRuntimeRequest',
  'recordRuntimeAcceptance',
  'recordExecution',
  'stageClaim',
  'recordClaimAcceptance',
  'stageTurn',
  'receiveDecision',
  'consumeDecision',
  'commitOutcome',
  'reconcileReceipt',
] as const)
  test(`genuine format4 ${method} is eligible before upgrade and fenced after publication`, async () => {
    const fixture = await createPredecessor();
    try {
      const invocation = await fixture.old.prepareMutation(method);
      const baseline = fixture.options.path + '.control';
      const database = new Database(fixture.options.path);
      try {
        database.query('VACUUM INTO ?').run(baseline);
      } finally {
        database.close();
      }
      const control = await createFormat4Fixture(baseline, 'open');
      try {
        expect(await control.invoke(invocation)).toMatchObject({ kind: 'applied' });
      } finally {
        await control.close();
      }
      const predecessor = await fixture.old.capture();
      await upgradeSqliteIdentityKeys(fixture.options);
      const before = await fixture.old.capture();
      await rejects(fixture.old.invoke(invocation), /incompatible|corrupt sqlite physical schema/);
      expect(await fixture.old.capture()).toEqual(before);
      await fixture.old.advanceClock(101);
      if (method === 'acquireOwnership') {
        await rejects(fixture.old.invoke(invocation), /incompatible/);
        expect(await fixture.old.capture()).toEqual(before);
      } else {
        expect(await fixture.old.invoke(invocation)).toEqual({
          kind: 'refused',
          reason: 'owner_stale',
        });
        expect(await fixture.old.capture()).toEqual(withObservedClock(before, 1101n));
        await fixture.old.advanceClock(-1);
        await rejects(fixture.old.invoke(invocation), /clock/);
        expect(await fixture.old.capture()).toEqual(withObservedClock(before, 1101n));
      }
      await downgradeUnusedSqliteIdentityKeys(fixture.options);
      expect(await fixture.old.capture()).toEqual(
        method === 'acquireOwnership' ? predecessor : withObservedClock(predecessor, 1101n),
      );
    } finally {
      await fixture.close();
    }
  }, 60000);

function captureRows(database: Database) {
  return {
    schema: database
      .query('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name')
      .all(),
    tables: database
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'run%' ORDER BY name",
      )
      .all()
      .map((table) => ({
        name: table.name,
        rows: database.query(`SELECT * FROM "${table.name}" ORDER BY rowid`).all(),
      })),
  };
}

for (const method of [
  'beginRecovery',
  'stageRecoveryFence',
  'recordRecoveryFence',
  'resolveRecovery',
  'closed round trip',
] as const)
  test(`genuine format4 recovery ${method} preserves history and fences old writes`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'identity-old-recovery-'));
    const options = {
      path: join(directory, 'runs.sqlite'),
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock: new FixtureClock(),
      maxBusyAttempts: 10,
      busyDelayMilliseconds: 1,
    };
    const old = await bootstrapFormat4Stores(options);
    const database = new Database(options.path);
    try {
      const ownership = unwrapReply(await old.runs.acquireOwnership(ownerId('owner'), 0));
      unwrapReply(await old.runs.pinRuntimeScope(ownership, runtimePin));
      const original = unwrapReply(
        await old.runs.stageRuntimeRequest(
          { ownership, scope: runtimeScope, expectedRevision: 0 },
          authorityRequest('original', 2),
        ),
      );
      const begin: RecoveryBeginCall = {
        kind: 'authority',
        guard: { ownership, scope: runtimeScope, expectedRevision: 1, expectedRecoveryRevision: 0 },
        intent: {
          version: 1,
          recoveryId: 'recovery',
          target: { kind: 'authority', original },
          begunScopeRevision: 1,
          resolver: { ownerId: ownership.ownerId, epoch: ownership.epoch },
        },
      };
      let invoke: (runs: RunStore) => Promise<unknown> = (runs) => runs.beginRecovery(begin);
      if (method !== 'beginRecovery') {
        unwrapReply(await old.runs.beginRecovery(begin));
        if (method === 'resolveRecovery' || method === 'closed round trip') {
          const call = await createRecoveryResolveCall(old, begin, true);
          invoke = (runs) => runs.resolveRecovery(call);
        } else {
          const fence = await createRecoveryFenceCall(old.artifacts, begin);
          invoke = (runs) => runs.stageRecoveryFence(fence);
          if (method === 'recordRecoveryFence') {
            unwrapReply(await old.runs.stageRecoveryFence(fence));
            const observation = await createRecoveryObservationCall(old.artifacts, fence);
            invoke = (runs) => runs.recordRecoveryFence(observation);
          }
        }
      }
      if (method === 'closed round trip')
        expect(await invoke(old.runs)).toMatchObject({ kind: 'applied' });
      else {
        const baseline = options.path + '.control';
        database.query('VACUUM INTO ?').run(baseline);
        const control = await openFormat4Stores({ ...options, path: baseline });
        try {
          expect(await invoke(control.runs)).toMatchObject({ kind: 'applied' });
        } finally {
          await control.close();
        }
      }
      const before = captureRows(database);
      const scope = await old.runs.readRuntimeScope(runtimeScope);
      await upgradeSqliteIdentityKeys(options);
      const upgraded = captureRows(database);
      const current = await openSqliteStores(options);
      try {
        expect(await current.runs.readRuntimeScope(runtimeScope)).toEqual(scope);
      } finally {
        await current.close();
      }
      await rejects(invoke(old.runs), /incompatible/);
      expect(captureRows(database)).toEqual(upgraded);
      await downgradeUnusedSqliteIdentityKeys(options);
      expect(captureRows(database)).toEqual(before);
    } finally {
      database.close();
      await old.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60000);

test('identity transition reports committed cleanup failure without claiming rollback', async () => {
  const fixture = await createPredecessor();
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Restore the exact native function; fault wrappers invoke it with its original receiver.
  const close = Database.prototype.close;
  const injected = new Error('identity final native close fault');
  let observed = false;
  try {
    Database.prototype.close = function (...parameters) {
      const version = this.query<{ schema_version: number }, []>(
        'SELECT schema_version FROM run_meta',
      ).get()?.schema_version;
      close.apply(this, parameters);
      if (version === 5) {
        observed = true;
        throw injected;
      }
    };
    await rejects(upgradeSqliteIdentityKeys(fixture.options), {
      failure: 'cleanup_failed',
      phase: 'committed',
      cause: injected,
    });
    Database.prototype.close = close;
    expect(observed).toBe(true);
    const current = await openSqliteStores(fixture.options);
    await current.close();
  } finally {
    Database.prototype.close = close;
    await fixture.close();
  }
}, 60000);

test('identity upgrade classifies a partial known successor family before DDL', async () => {
  const fixture = await createPredecessor();
  const database = new Database(fixture.options.path);
  try {
    database.run('CREATE TABLE run5_record(marker TEXT)');
    const before = await fixture.old.capture();
    await rejects(upgradeSqliteIdentityKeys(fixture.options), { failure: 'corrupt' });
    expect(await fixture.old.capture()).toEqual(before);
  } finally {
    database.close();
    await fixture.close();
  }
}, 60000);

function withObservedClock(capture: Format4Capture, clock: bigint): Format4Capture {
  return {
    ...capture,
    tables: capture.tables.map((table) =>
      table.name !== 'run_meta'
        ? table
        : {
            ...table,
            rows: table.rows.map((row) =>
              row.map((cell, index) =>
                table.columns[index] === 'last_observed_at' ? clock : cell,
              ),
            ),
          },
    ),
  };
}

test('genuine format4 admitted callback commits before format5 publication and later writes are fenced', async () => {
  const fixture = await createPredecessor();
  const owner = createStoreDirectory(dirname(fixture.options.path), {
    recursive: true,
    force: true,
  });
  owner.retainStore(fixture.old);
  const observer = await constructFixture(
    () => owner.retainProbe(new Database(fixture.options.path, { readonly: true })),
    [() => owner.close()],
  );
  let writing: Promise<unknown> | undefined;
  let upgrading: Promise<unknown> | undefined;
  const publication: {
    admitted?: {
      run_id: string;
      manifest_digest: string;
      record: string;
      initial_record: string;
    }[];
  } = {};
  // eslint-disable-next-line @typescript-eslint/unbound-method -- The real native receiver is used for every call and the exact function is restored before request draining.
  const nativeRun = Database.prototype.run;
  await settleFixture(async () => {
    const invocation = await fixture.old.prepareMutation('createRun');
    if (invocation.method !== 'createRun') throw new Error('old callback invocation differs');
    await fixture.old.armCallback();
    writing = fixture.old.invoke(invocation);
    await fixture.old.waitForEvent('callback_entered');
    let busy = 0;
    Database.prototype.run = function (sql, ...parameters) {
      try {
        const completion = nativeRun.call(this, sql, ...parameters);
        if (sql === 'BEGIN IMMEDIATE' && this.filename === fixture.options.path) {
          publication.admitted = this.query<
            { run_id: string; manifest_digest: string; record: string; initial_record: string },
            []
          >('SELECT * FROM run_record ORDER BY run_id').all();
          expect(this.query('SELECT schema_version FROM run_meta').get()).toEqual({
            schema_version: 4,
          });
        }
        return completion;
      } catch (cause) {
        if (
          sql === 'BEGIN IMMEDIATE' &&
          cause instanceof Error &&
          'code' in cause &&
          cause.code === 'SQLITE_BUSY'
        )
          busy += 1;
        throw cause;
      }
    };
    upgrading = upgradeSqliteIdentityKeys({ ...fixture.options, maxBusyAttempts: 15000 });
    const deadline = Date.now() + 15000;
    while (busy === 0) {
      if (Date.now() >= deadline)
        throw new Error('format5 upgrade did not reach actual contention');
      await Bun.sleep(2);
    }
    expect(busy).toBeGreaterThan(0);
    expect(publication.admitted).toBeUndefined();
    expect(observer.query('SELECT schema_version FROM run_meta').get()).toEqual({
      schema_version: 4,
    });
    expect(observer.query("SELECT name FROM sqlite_schema WHERE name='run5_record'").all()).toEqual(
      [],
    );
    fixture.old.releaseCallback();
    expect(await writing).toMatchObject({ kind: 'applied', value: invocation.parameters[1] });
    expect(await upgrading).toEqual({
      kind: 'upgraded',
      before: FORMAT4_IDENTITY,
      after: FORMAT5_IDENTITY,
    });
    const admitted = publication.admitted;
    if (admitted === undefined) throw new Error('pre-publication committed rows were not observed');
    expect(admitted).toHaveLength(1);
    expect(observer.query('SELECT * FROM run_record ORDER BY run_id').all()).toEqual(admitted);
    expect(observer.query('SELECT * FROM run5_record ORDER BY run_id').all()).toEqual(
      admitted.map((row) => ({ ...row, run_id: JSON.stringify(row.run_id) })),
    );
    expect(observer.query('SELECT used FROM run5_usage').get()).toEqual({ used: 0 });
    const current = owner.retainStore(await openSqliteStores(fixture.options));
    expect((await current.runs.readRun(invocation.parameters[1].runId)).run).toEqual(
      invocation.parameters[1],
    );
    const before = await fixture.old.capture();
    await rejects(
      fixture.old.retainManifest(
        invocation.parameters[0],
        createManifest({ credentialReferences: ['after-admitted-callback'] }),
      ),
      /incompatible|corrupt sqlite physical schema/,
    );
    expect(await fixture.old.capture()).toEqual(before);
  }, [
    () => {
      Database.prototype.run = nativeRun;
      fixture.old.releaseCallback();
    },
    async () => {
      const settlements = await Promise.allSettled(
        [writing, upgrading].filter((request) => request !== undefined),
      );
      const failures: unknown[] = [];
      for (const settlement of settlements)
        if (settlement.status === 'rejected') failures.push(settlement.reason);
      if (failures.length !== 0)
        throw new AggregateError(failures, 'admitted format4 callback requests failed');
    },
    () => owner.close(),
  ]);
}, 60000);
