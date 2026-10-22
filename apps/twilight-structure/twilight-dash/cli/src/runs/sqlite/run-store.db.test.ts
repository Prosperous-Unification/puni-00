import { doesNotReject, rejects } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { attemptId, decodeAdmission, occurrenceId, ownerId } from '../record-codecs';
import { organizationId } from '../record-codecs';
import { createManifest, createRun, unwrapReply } from '../testing/fixtures';
import { FixtureClock } from '../testing/fixtures';
import { runStoreContract } from '../testing/run-store-contract';
import { openSqliteStores } from './open-stores';
import { bootstrapSqliteStores } from './open-stores';
runStoreContract('sqlite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'run-store-contract-'));
  const clock = new FixtureClock();
  const stores = await bootstrapSqliteStores({
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 10,
    busyDelayMilliseconds: 1,
  });
  return {
    ...stores,
    clock,
    close() {
      stores.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
});

async function durableFixture(capacity = 1) {
  const directory = mkdtempSync(join(tmpdir(), 'run-store-db-'));
  const clock = new FixtureClock();
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 10,
    busyDelayMilliseconds: 2,
  };
  const stores = await bootstrapSqliteStores(options);
  const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('owner'), 0));
  unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
  const run = unwrapReply(await stores.runs.createRun(ownership, createRun()));
  const admission = decodeAdmission({
    attemptId: 'attempt',
    identity: {
      version: 1,
      runId: run.runId,
      occurrenceId: 'occurrence',
      operationKey: 'operation',
    },
    ordinal: 1,
  });
  return {
    options,
    stores,
    guard: { ownership, runId: run.runId, expectedRevision: 0 },
    admission,
    close() {
      stores.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
test('reservation trigger abort rolls back attempt revision and capacity across reopen', async () => {
  const fixture = await durableFixture();
  const database = new Database(fixture.options.path);
  try {
    const before = await fixture.stores.runs.readRun(fixture.guard.runId);
    expect(before.attempts).toEqual([]);
    database.run(
      "CREATE TRIGGER fail_reservation BEFORE INSERT ON run_reservation BEGIN SELECT RAISE(ABORT,'injected reservation fault'); END",
    );
    await rejects(
      fixture.stores.runs.admitAttempt(fixture.guard, fixture.admission),
      new RegExp('injected reservation fault'),
    );
    expect(database.query('SELECT * FROM run_attempt').all()).toEqual([]);
    expect(database.query('SELECT * FROM run_reservation').all()).toEqual([]);
    fixture.stores.close();
    const reopened = await openSqliteStores(fixture.options);
    try {
      expect(await reopened.runs.readRun(fixture.guard.runId)).toEqual(before);
      database.run('DROP TRIGGER fail_reservation');
      expect((await reopened.runs.admitAttempt(fixture.guard, fixture.admission)).kind).toBe(
        'applied',
      );
      const admitted = await reopened.runs.readRun(fixture.guard.runId);
      expect(admitted.attempts).toHaveLength(1);
      expect(admitted.run.revision).toBe(1);
      expect(admitted.capacity.reserved).toBe(1);
    } finally {
      reopened.close();
    }
  } finally {
    database.close();
    fixture.close();
  }
});
test('held write lock exhausts asynchronous retry budget without changing work', async () => {
  const fixture = await durableFixture();
  const database = new Database(fixture.options.path);
  try {
    const before = await fixture.stores.runs.readRun(fixture.guard.runId);
    expect(before.capacity.reserved).toBe(0);
    database.run('BEGIN IMMEDIATE');
    let yielded = false;
    const timer = setTimeout(() => {
      yielded = true;
    }, 1);
    try {
      await rejects(
        fixture.stores.runs.admitAttempt(fixture.guard, fixture.admission),
        new RegExp('contention exhausted after 10 attempts'),
      );
      expect(yielded).toBe(true);
    } finally {
      clearTimeout(timer);
      database.run('ROLLBACK');
    }
    expect(await fixture.stores.runs.readRun(fixture.guard.runId)).toEqual(before);
  } finally {
    database.close();
    fixture.close();
  }
});
test('clock is observed after lock acquisition so waiting cannot renew an expired lease', async () => {
  const fixture = await durableFixture();
  const database = new Database(fixture.options.path);
  try {
    expect(fixture.guard.ownership.expiresAt).toBe(1100);
    database.run('BEGIN IMMEDIATE');
    const timer = setTimeout(() => {
      fixture.options.clock.advance(100);
      database.run('ROLLBACK');
    }, 3);
    try {
      expect(await fixture.stores.runs.renewOwnership(fixture.guard.ownership)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
    } finally {
      clearTimeout(timer);
      if (database.inTransaction) database.run('ROLLBACK');
    }
    expect((await fixture.stores.runs.readRun(fixture.guard.runId)).capacity.reserved).toBe(0);
  } finally {
    database.close();
    fixture.close();
  }
});

for (const fault of ['throw', 'skip'] as const)
  test(`rollback ${fault} failure preserves original cause and stops retry`, async () => {
    const fixture = await durableFixture();
    const database = new Database(fixture.options.path);
    const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'run');
    if (descriptor === undefined) throw new Error('Database.run descriptor absent');
    const original = descriptor.value as Database['run'];
    let rollbackCalls = 0;
    try {
      database.run(
        "CREATE TRIGGER fail_reservation BEFORE INSERT ON run_reservation BEGIN SELECT RAISE(ABORT,'injected reservation fault'); END",
      );
      function run(
        this: Database,
        sql: string,
        ...parameters: Parameters<Database['run']> extends [string, ...infer Rest] ? Rest : never
      ) {
        if (sql === 'ROLLBACK') {
          rollbackCalls += 1;
          if (fault === 'throw') throw new Error('injected rollback fault');
          return undefined;
        }
        return original.call(this, sql, ...parameters);
      }
      Object.defineProperty(Database.prototype, 'run', { ...descriptor, value: run });
      await rejects(
        fixture.stores.runs.admitAttempt(fixture.guard, fixture.admission),
        (cause: unknown) => {
          expect(cause).toBeInstanceOf(AggregateError);
          if (!(cause instanceof AggregateError))
            throw new Error('expected aggregate rollback failure');
          expect(String(cause.errors[0])).toContain('injected reservation fault');
          expect(String(cause.errors[1])).toContain(
            fault === 'throw' ? 'injected rollback fault' : 'remains open after rollback',
          );
          return true;
        },
      );
      expect(rollbackCalls).toBe(1);
    } finally {
      Object.defineProperty(Database.prototype, 'run', descriptor);
      database.close();
      fixture.close();
    }
  });
test('reservation counts above persisted capacity throw during reads and reopen', async () => {
  const fixture = await durableFixture(2);
  const database = new Database(fixture.options.path);
  try {
    unwrapReply(await fixture.stores.runs.admitAttempt(fixture.guard, fixture.admission));
    unwrapReply(
      await fixture.stores.runs.admitAttempt(
        { ...fixture.guard, expectedRevision: 1 },
        {
          ...fixture.admission,
          attemptId: attemptId('second'),
          identity: { ...fixture.admission.identity, occurrenceId: occurrenceId('second') },
        },
      ),
    );
    expect((await fixture.stores.runs.readRun(fixture.guard.runId)).capacity.reserved).toBe(2);
    database.run('UPDATE run_meta SET capacity=1');
    await rejects(
      fixture.stores.runs.readRun(fixture.guard.runId),
      /corrupt sqlite capacity reservations/,
    );
    fixture.stores.close();
    await rejects(
      openSqliteStores({ ...fixture.options, capacity: 1 }),
      (cause: unknown) =>
        cause instanceof Error &&
        cause.cause instanceof Error &&
        cause.cause.message === 'corrupt sqlite capacity reservations',
    );
  } finally {
    database.close();
    fixture.close();
  }
});

test('stale ownership refuses manifest and run mutations before decoding corrupted targets', async () => {
  const fixture = await durableFixture();
  const database = new Database(fixture.options.path);
  try {
    database.run(`UPDATE run_manifest SET record='{}'`);
    database.run(`UPDATE run_record SET record='{}'`);
    fixture.options.clock.advance(100);
    expect(fixture.guard.ownership.epoch).toBe(1);
    await doesNotReject(async () => {
      expect(
        await fixture.stores.runs.retainManifest(fixture.guard.ownership, createManifest()),
      ).toEqual({ kind: 'refused', reason: 'owner_stale' });
      expect(await fixture.stores.runs.createRun(fixture.guard.ownership, createRun())).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
    });
  } finally {
    database.close();
    fixture.close();
  }
});

test('exclusive lifecycle lock exhausts contention instead of misclassifying corruption', async () => {
  const fixture = await durableFixture();
  try {
    const before = await fixture.stores.runs.readRun(fixture.guard.runId);
    fixture.stores.close();
    const database = new Database(fixture.options.path);
    let yielded = false;
    const timer = setTimeout(() => {
      yielded = true;
    }, 1);
    try {
      database.run('PRAGMA locking_mode=EXCLUSIVE');
      database.run('BEGIN EXCLUSIVE');
      expect(database.inTransaction).toBe(true);
      await rejects(openSqliteStores(fixture.options), /contention exhausted after 10 attempts/);
      expect(yielded).toBe(true);
    } finally {
      clearTimeout(timer);
      if (database.inTransaction) database.run('ROLLBACK');
      database.close();
    }
    const reopened = await openSqliteStores(fixture.options);
    try {
      expect(await reopened.runs.readRun(fixture.guard.runId)).toEqual(before);
    } finally {
      reopened.close();
    }
  } finally {
    fixture.close();
  }
});

for (const request of ['renewal', 'manifest', 'run', 'admission'] as const) {
  test(`queued ${request} keeps submitted objects through real writer contention`, async () => {
    const fixture = await durableFixture();
    const database = new Database(fixture.options.path);
    try {
      const ownership = { ...fixture.guard.ownership };
      const manifest = createManifest({ credentialReferences: ['submitted'] });
      const run = createRun({ runId: fixture.guard.runId, maxAttempts: 3 });
      const admission = structuredClone(fixture.admission);
      const guard = { ...fixture.guard, ownership };
      database.run('BEGIN IMMEDIATE');
      let blockerFinished = false;
      const blocker = fixture.stores.runs.renewOwnership(fixture.guard.ownership).then((reply) => {
        blockerFinished = true;
        return reply;
      });
      const pending =
        request === 'renewal'
          ? fixture.stores.runs.renewOwnership(ownership)
          : request === 'manifest'
            ? fixture.stores.runs.retainManifest(ownership, manifest)
            : request === 'run'
              ? fixture.stores.runs.createRun(ownership, run)
              : fixture.stores.runs.admitAttempt(guard, admission);
      await Bun.sleep(4);
      expect(database.inTransaction).toBe(true);
      expect(blockerFinished).toBe(false);
      ownership.ownerId = ownerId('mutated');
      Object.assign(manifest, createManifest({ credentialReferences: ['mutated'] }));
      Object.assign(run, { maxAttempts: 9 });
      Object.assign(admission.identity, { occurrenceId: 'mutated' });
      fixture.options.clock.advance(10);
      database.run('COMMIT');
      expect((await blocker).kind).toBe('applied');
      const reply = await pending;
      expect(reply.kind).toBe(request === 'run' ? 'duplicate' : 'applied');
      if (request === 'renewal')
        expect(reply).toMatchObject({
          kind: 'applied',
          value: { ownerId: 'owner', expiresAt: 1110 },
        });
      if (request === 'manifest')
        expect(
          (
            await fixture.stores.runs.readManifest(
              createManifest({ credentialReferences: ['submitted'] }).digest,
            )
          ).credentialReferences,
        ).toEqual(['submitted']);
      const snapshot = await fixture.stores.runs.readRun(fixture.guard.runId);
      expect(snapshot.run.maxAttempts).toBe(3);
      if (request === 'admission')
        expect(String(snapshot.attempts[0]?.identity.occurrenceId)).toBe('occurrence');
    } finally {
      if (database.inTransaction) database.run('ROLLBACK');
      database.close();
      fixture.close();
    }
  });
}
