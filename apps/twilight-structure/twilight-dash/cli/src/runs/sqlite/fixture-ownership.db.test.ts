import { rejects } from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { organizationId } from '../record-codecs';
import { constructFixture } from '../testing/construct-fixture';
import { FixtureClock } from '../testing/fixtures';
import { createFormat3Fixture } from '../testing/format3-fixture';
import { createDispatchFixture } from '../testing/recovery-dispatch-contract';
import { createRecoveryReceiver } from '../testing/recovery-receiver';
import { createRecoveryInspection, createRecoveryStores } from '../testing/sqlite-fixture';
import { createStoreDirectory } from '../testing/store-directory';

function createOptions(directory: string) {
  return {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 2,
    busyDelayMilliseconds: 1,
  };
}

test('construction owner closes acquired SQLite when receiver setup rejects before body', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fixture-owner-receiver-'));
  const options = createOptions(directory);
  const stores = await createRecoveryStores(directory, options);
  const setupFailure = new Error('receiver setup failed');
  try {
    await rejects(
      createDispatchFixture(
        () => Promise.resolve({ ...stores, clock: options.clock }),
        async () =>
          await createRecoveryReceiver(() => {
            throw setupFailure;
          }),
      ),
      (cause: unknown) => {
        expect(cause).toBe(setupFailure);
        return true;
      },
    );
    await rejects(
      stores.runs.readRuntimeScope({
        organizationId: 'organization',
        projectId: 'project',
        personId: 'person',
      }),
      /closed/,
    );
    expect(existsSync(directory)).toBe(false);
  } finally {
    // Independent disposal remains installed when construction ownership is faulted.
    await closeIndependent(directory, [() => stores.closeConnection()]);
  }
});

test('construction owner removes directory after actual partial bootstrap failure', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fixture-owner-bootstrap-'));
  const setupFailure = new Error('bootstrap clock failed with native connection acquired');
  try {
    await rejects(
      createRecoveryStores(directory, {
        ...createOptions(directory),
        clock: {
          read() {
            throw setupFailure;
          },
        },
      }),
      (cause: unknown) => {
        expect(cause).toBe(setupFailure);
        return true;
      },
    );
    expect(existsSync(directory)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('construction owner closes store when inspection constructor fails', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fixture-owner-inspection-'));
  const setupFailure = new Error('inspection constructor failed');
  let acquired: Awaited<ReturnType<typeof createRecoveryStores>> | undefined;
  try {
    await rejects(
      createRecoveryInspection(directory, createOptions(directory), (_path, stores) => {
        acquired = stores;
        throw setupFailure;
      }),
      (cause: unknown) => {
        expect(cause).toBe(setupFailure);
        return true;
      },
    );
    if (acquired === undefined) throw new Error('store never acquired');
    await rejects(
      acquired.runs.readRuntimeScope({
        organizationId: 'organization',
        projectId: 'project',
        personId: 'person',
      }),
      /closed/,
    );
    expect(existsSync(directory)).toBe(false);
  } finally {
    if (acquired !== undefined) {
      const stores = acquired;
      await closeIndependent(directory, [() => stores.closeConnection()]);
    }
  }
});

test('construction owner retains directory when bootstrap closure is unestablished', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fixture-owner-opaque-bootstrap-'));
  try {
    await rejects(
      createRecoveryStores(directory, {
        ...createOptions(directory),
        clock: { read: () => Number.NaN },
      }),
      (cause: unknown) => {
        expect(existsSync(directory)).toBe(true);
        if (!(cause instanceof AggregateError))
          throw new Error('bootstrap retention cause absent', { cause });
        const bootstrapFailure: unknown = cause.errors[0];
        expect(bootstrapFailure).toBeInstanceOf(Error);
        expect(cause.errors[1]).toMatchObject({
          message:
            'fixture storage retained because bootstrap closure is unestablished: ' + directory,
          cause: bootstrapFailure,
        });
        return true;
      },
    );
  } finally {
    // This injected post-clock validation error completes the unchanged bootstrap's native finally.
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const failure of [
  { name: 'undefined', cause: undefined },
  { name: 'object', cause: { reason: 'non-Error clock failure' } },
])
  test(
    'construction owner preserves exact clock throw and established cleanup ' + failure.name,
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'fixture-owner-clock-cause-'));
      try {
        const completion = await createRecoveryStores(directory, {
          ...createOptions(directory),
          clock: {
            read() {
              // eslint-disable-next-line @typescript-eslint/only-throw-error -- This control deliberately exercises exact undefined and non-Error clock throws across native cleanup.
              throw failure.cause;
            },
          },
        }).then(
          () => ({ kind: 'returned' as const }),
          (cause: unknown) => ({ kind: 'rejected' as const, cause }),
        );
        expect(completion).toEqual({ kind: 'rejected', cause: failure.cause });
        expect(existsSync(directory)).toBe(false);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

test('construction owner removes caller directory after actual old fixture setup and independent cleanup fail', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fixture-owner-old-'));
  const cleanupFailure = new Error('independent non-storage cleanup failure');
  let setupFailure: unknown;
  try {
    await rejects(
      constructFixture(async () => {
        try {
          return await createFormat3Fixture(join(directory, 'missing', 'runs.sqlite'));
        } catch (cause) {
          setupFailure = cause;
          throw cause;
        }
      }, [
        () => {
          throw cleanupFailure;
        },
        () => {
          rmSync(directory, { recursive: true });
        },
      ]),
      (cause: unknown) => {
        expect(cause).toBeInstanceOf(AggregateError);
        if (!(cause instanceof AggregateError)) throw new Error('combined failure absent');
        expect(setupFailure).toBeInstanceOf(Error);
        expect(cause.errors).toEqual([setupFailure, cleanupFailure]);
        return true;
      },
    );
    expect(existsSync(directory)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('construction owner retains receiver setup and disposal causes while closing earlier SQLite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fixture-owner-causes-'));
  const options = createOptions(directory);
  const stores = await createRecoveryStores(directory, options);
  const setupFailure = new Error('receiver setup failure');
  const cleanupFailure = new Error('receiver independent cleanup failure');
  try {
    await rejects(
      createDispatchFixture(
        () => Promise.resolve({ ...stores, clock: options.clock }),
        async () =>
          await createRecoveryReceiver((harness) => {
            const close = harness.closeComposed.bind(harness);
            harness.closeComposed = async () => {
              await close();
              throw cleanupFailure;
            };
            throw setupFailure;
          }),
      ),
      (cause: unknown) => {
        if (!(cause instanceof AggregateError))
          throw new Error('combined receiver failure absent', { cause });
        expect(cause.errors).toEqual([setupFailure, cleanupFailure]);
        return true;
      },
    );
    await rejects(
      stores.runs.readRuntimeScope({
        organizationId: 'organization',
        projectId: 'project',
        personId: 'person',
      }),
      /closed/,
    );
    expect(existsSync(directory)).toBe(false);
  } finally {
    await closeIndependent(directory, [() => stores.closeConnection()]);
  }
});

test('construction owner retains storage when native inspection closure fails and closes independent store', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fixture-owner-retain-'));
  const fixture = await createRecoveryInspection(directory, createOptions(directory));
  const closeInspection = fixture.database.close.bind(fixture.database);
  const closeFailure = new Error('native inspection close failed');
  fixture.database.close = () => {
    throw closeFailure;
  };
  try {
    await rejects(fixture.close(), (cause: unknown) => {
      expectRetainedCauses(cause, directory, [closeFailure]);
      return true;
    });
    expect(existsSync(directory)).toBe(true);
    expect(fixture.database.query('SELECT 1 AS alive').get()).toEqual({ alive: 1 });
    await rejects(
      fixture.stores.runs.readRuntimeScope({
        organizationId: 'organization',
        projectId: 'project',
        personId: 'person',
      }),
      /closed/,
    );
  } finally {
    fixture.database.close = closeInspection;
    await closeIndependent(directory, [closeInspection, () => fixture.stores.closeConnection()]);
  }
});

test('construction owner retains storage until pending store close settles', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fixture-owner-pending-'));
  const fixture = await createRecoveryInspection(directory, createOptions(directory));
  const close = fixture.stores.closeConnection;
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  let pendingClose: Promise<void> | undefined;
  fixture.stores.closeConnection = () => {
    pendingClose = (async () => {
      entered.resolve(undefined);
      await release.promise;
      await close();
    })();
    return pendingClose;
  };
  let settled = false;
  const closing = fixture.close().then(() => {
    settled = true;
  });
  try {
    await entered.promise;
    await Bun.sleep(0);
    expect(settled).toBe(false);
    expect(existsSync(directory)).toBe(true);
    release.resolve(undefined);
    await closing;
    expect(existsSync(directory)).toBe(false);
  } finally {
    release.resolve(undefined);
    await closeIndependent(directory, [
      () => closing,
      async () => {
        if (pendingClose !== undefined) await pendingClose;
      },
      close,
      () => waitForDirectoryRemoval(directory),
    ]);
  }
});

test('construction owner retains storage and both independent failed closure causes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fixture-owner-two-closures-'));
  const fixture = await createRecoveryInspection(directory, createOptions(directory));
  const closeInspection = fixture.database.close.bind(fixture.database);
  const closeConnection = fixture.stores.closeConnection;
  const inspectionFailure = new Error('inspection did not close');
  const storeFailure = new Error('store did not close');
  fixture.database.close = () => {
    throw inspectionFailure;
  };
  fixture.stores.closeConnection = () => Promise.reject(storeFailure);
  try {
    await rejects(fixture.close(), (cause: unknown) => {
      expectRetainedCauses(cause, directory, [inspectionFailure, storeFailure]);
      return true;
    });
    expect(existsSync(directory)).toBe(true);
    await fixture.stores.runs.readRuntimeScope({
      organizationId: 'organization',
      projectId: 'project',
      personId: 'person',
    });
  } finally {
    fixture.database.close = closeInspection;
    fixture.stores.closeConnection = closeConnection;
    await closeIndependent(directory, [closeInspection, closeConnection]);
  }
});

test('construction owner retains directory when store closure is unestablished', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fixture-owner-store-close-'));
  const stores = await createRecoveryStores(directory, createOptions(directory));
  const closeConnection = stores.closeConnection;
  const closeFailure = new Error('store closure failed before native disposal');
  stores.closeConnection = () => Promise.reject(closeFailure);
  try {
    await rejects(stores.close(), (cause: unknown) => {
      expectRetainedCauses(cause, directory, [closeFailure]);
      return true;
    });
    expect(existsSync(directory)).toBe(true);
    await stores.runs.readRuntimeScope({
      organizationId: 'organization',
      projectId: 'project',
      personId: 'person',
    });
  } finally {
    stores.closeConnection = closeConnection;
    await closeIndependent(directory, [closeConnection]);
  }
});

function expectRetainedCauses(cause: unknown, directory: string, expected: readonly unknown[]) {
  expect(cause).toMatchObject({
    message: 'fixture storage retained after failed connection closure: ' + directory,
  });
  const collected: unknown[] = [];
  function collect(failure: unknown) {
    collected.push(failure);
    if (failure instanceof AggregateError) for (const nested of failure.errors) collect(nested);
    if (failure instanceof Error && failure.cause !== undefined) collect(failure.cause);
  }
  collect(cause);
  for (const failure of expected)
    expect(collected.some((candidate) => Object.is(candidate, failure))).toBe(true);
}

/** Independent of the new fixture registrations under fault; inherited disposal failures still retain storage. */
async function closeIndependent(
  directory: string,
  closes: readonly (() => void | Promise<void>)[],
) {
  const owner = createStoreDirectory(directory, { recursive: true, force: true });
  for (const close of closes)
    owner.retainStore({
      close: async () => {
        await close();
      },
    });
  await owner.close();
}

/** Observes the faulted delegation's directory owner finishing after its raw close has been released. */
async function waitForDirectoryRemoval(directory: string) {
  const deadline = Date.now() + 1000;
  while (existsSync(directory)) {
    if (Date.now() >= deadline) throw new Error('directory owner did not finish removal');
    await Bun.sleep(1);
  }
}
