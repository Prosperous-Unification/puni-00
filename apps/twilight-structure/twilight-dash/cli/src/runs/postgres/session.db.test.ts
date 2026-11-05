import { doesNotReject, rejects } from 'node:assert/strict';

import { type ReservedSQL, SQL } from 'bun';
import { describe, expect, test } from 'bun:test';

import { awaitCompletion } from './deadline';
import { openPostgresSession, type PostgresBudgets, type PostgresClientFactory } from './session';

const testUrl = process.env['TWILIGHT_POSTGRES_TEST_URL'];
const testOwner = process.env['TWILIGHT_POSTGRES_TEST_OWNER'];
const configured = testUrl !== undefined || testOwner !== undefined;
if (configured) {
  if (testUrl === undefined || testOwner === undefined || testOwner.trim() === '')
    throw new Error('PostgreSQL test URL and owner must both be supplied');
  if (!['postgres:', 'postgresql:'].includes(new URL(testUrl).protocol))
    throw new Error('PostgreSQL test URL must use postgres or postgresql');
}
const budgets: PostgresBudgets = {
  openMilliseconds: 2000,
  operationMilliseconds: 2000,
  closeMilliseconds: 1000,
  statementMilliseconds: 1500,
  lockMilliseconds: 1500,
  pollMilliseconds: 5,
};
type Purpose = 'writer' | 'observer';
interface Faults {
  inspect?: (command: string, execute: () => Promise<unknown>) => Promise<unknown>;
  reserve?: (purpose: Purpose) => Promise<void>;
  query?: (command: string, execute: () => Promise<unknown>) => Promise<unknown>;
  close?: (
    purpose: Purpose,
    kind: 'reservation' | 'pool',
    execute: () => Promise<void>,
  ) => Promise<void>;
  cookie?: (purpose: Purpose, name: string) => string;
}
async function openNative(name: string) {
  if (testUrl === undefined || testOwner === undefined)
    throw new Error('missing PostgreSQL fixture');
  const pool = new SQL(testUrl, { max: 1, connection: { application_name: name } });
  try {
    const connection = await pool.reserve();
    const owners = await connection<
      { owner: unknown }[]
    >`SELECT current_setting('puni_test.owner') AS owner`;
    if (owners.length !== 1 || owners[0]?.owner !== testOwner)
      throw new Error('PostgreSQL fixture owner does not match');
    return { pool, connection };
  } catch (cause) {
    try {
      await pool.close({ timeout: 0 });
    } catch (cleanup) {
      throw new AggregateError([cause, cleanup], 'fixture startup and cleanup failed', {
        cause: cleanup,
      });
    }
    throw cause;
  }
}
async function withFixture(
  inspect: (fixture: {
    open: (changes?: Partial<PostgresBudgets>) => ReturnType<typeof openPostgresSession>;
    faults: Faults;
    connections: Map<Purpose, ReservedSQL>;
    closeCalls: string[];
    commands: string[];
    administrator: ReservedSQL;
    table: string;
  }) => Promise<void>,
) {
  const administrator = await openNative(
    'session_admin_' + crypto.randomUUID().replaceAll('-', ''),
  );
  const table = 'session_' + crypto.randomUUID().replaceAll('-', '');
  const pools: SQL[] = [];
  const connections = new Map<Purpose, ReservedSQL>();
  const faults: Faults = {};
  const closeCalls: string[] = [];
  const commands: string[] = [];
  const factory: PostgresClientFactory = (purpose, applicationName) => {
    if (testUrl === undefined || testOwner === undefined)
      throw new Error('missing PostgreSQL fixture');
    const pool = new SQL(testUrl, {
      max: 1,
      connection: {
        application_name: faults.cookie?.(purpose, applicationName) ?? applicationName,
      },
    });
    pools.push(pool);
    return new Proxy(pool, {
      get(target, property) {
        if (property === 'reserve')
          return async () => {
            const connection = await target.reserve();
            connections.set(purpose, connection);
            const owners = await connection<
              { owner: unknown }[]
            >`SELECT current_setting('puni_test.owner') AS owner`;
            if (owners.length !== 1 || owners[0]?.owner !== testOwner)
              throw new Error('PostgreSQL fixture owner does not match');
            await faults.reserve?.(purpose);
            return new Proxy(connection, {
              apply(callable, receiver, parameters) {
                const command = (parameters[0] as readonly string[]).join('?').trim();
                if (purpose === 'writer') commands.push(command);
                const execute = async (): Promise<unknown> => {
                  const rows: unknown = await Reflect.apply(callable, receiver, parameters);
                  return rows;
                };
                const query = purpose === 'writer' ? faults.query : faults.inspect;
                return query === undefined ? execute() : query(command, execute);
              },
              get(reserved, key) {
                if (key === 'close')
                  return async () => {
                    closeCalls.push(purpose + ':reservation');
                    const execute = async () => {
                      await reserved.close({ timeout: 0 });
                    };
                    await (faults.close?.(purpose, 'reservation', execute) ?? execute());
                  };
                const value: unknown = Reflect.get(reserved, key);
                return typeof value === 'function' ? (value.bind(reserved) as unknown) : value;
              },
            });
          };
        if (property === 'close')
          return async () => {
            closeCalls.push(purpose + ':pool');
            const execute = async () => {
              await target.close({ timeout: 0 });
            };
            await (faults.close?.(purpose, 'pool', execute) ?? execute());
          };
        const value: unknown = Reflect.get(target, property);
        return typeof value === 'function' ? (value.bind(target) as unknown) : value;
      },
    });
  };
  const failures: unknown[] = [];
  try {
    await administrator.connection.unsafe(
      'CREATE TABLE ' + table + ' (id integer PRIMARY KEY, value integer NOT NULL)',
    );
    await administrator.connection.unsafe('INSERT INTO ' + table + ' VALUES (1, 0)');
    await inspect({
      open: (changes) => openPostgresSession(factory, { ...budgets, ...changes }),
      faults,
      connections,
      closeCalls,
      commands,
      administrator: administrator.connection,
      table,
    });
  } catch (cause) {
    failures.push(cause);
  } finally {
    const closed = await Promise.allSettled(
      [...connections.values()]
        .map(async (connection) => {
          await connection.close({ timeout: 0 });
        })
        .concat(
          pools.map(async (pool) => {
            await pool.close({ timeout: 0 });
          }),
        ),
    );
    for (const completion of closed)
      if (completion.status === 'rejected') failures.push(completion.reason);
    try {
      await administrator.connection`ROLLBACK`;
      await administrator.connection.unsafe('DROP TABLE IF EXISTS ' + table);
    } catch (cause) {
      failures.push(cause);
    }
    try {
      await administrator.connection.close({ timeout: 0 });
    } catch (cause) {
      failures.push(cause);
    }
    try {
      await administrator.pool.close({ timeout: 0 });
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'session fixture and cleanup failed');
}
async function readValue(connection: ReservedSQL, table: string): Promise<number> {
  const rows = await connection.unsafe<{ value: number }[]>(
    'SELECT value FROM ' + table + ' WHERE id = 1',
  );
  const value = rows.at(0)?.value;
  if (value === undefined) throw new Error('missing fixture row');
  return value;
}
function track<T>(pending: Promise<T>) {
  let settled = false;
  void pending.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  return () => settled;
}
function expectSticky(close: () => Promise<void>, closing: Promise<void>): void {
  const repeated = close();
  track(repeated);
  expect(repeated).toBe(closing);
}
function contains(failure: unknown, cause: unknown): boolean {
  return (
    failure === cause ||
    (failure instanceof AggregateError &&
      failure.errors.some((nested: unknown) => contains(nested, cause))) ||
    (failure instanceof Error && contains(failure.cause, cause))
  );
}
async function reached(pending: Promise<unknown>) {
  await awaitCompletion(pending, AbortSignal.timeout(1500));
}
const databaseTests = configured ? describe : describe.skip;
databaseTests('private PostgreSQL session (requires explicitly owned fixture)', () => {
  test('writes in READ COMMITTED and snapshots in read-only REPEATABLE READ', async () => {
    await withFixture(async ({ open, administrator, table }) => {
      const session = await open();
      const modes = await session.write(
        1n,
        async (connection) =>
          await connection<
            { isolation: string; readOnly: string }[]
          >`SELECT current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS "readOnly"`,
      );
      expect(modes[0]).toEqual({ isolation: 'read committed', readOnly: 'off' });
      await session.snapshot(async (connection) => {
        const modes = await connection<
          { isolation: string; readOnly: string }[]
        >`SELECT current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS "readOnly"`;
        expect(modes[0]).toEqual({ isolation: 'repeatable read', readOnly: 'on' });
        expect(await readValue(connection, table)).toBe(0);
        await administrator.unsafe('UPDATE ' + table + ' SET value = 9');
        expect(await readValue(connection, table)).toBe(0);
      });
      await rejects(
        session.snapshot(async (connection) => {
          await connection.unsafe('UPDATE ' + table + ' SET value = 11');
        }),
        /read-only/,
      );
      expect(await readValue(administrator, table)).toBe(9);
      await session.close();
    });
  });
  test('locks before a separate fresh lookup after another writer commits', async () => {
    await withFixture(async ({ open, administrator, table, commands }) => {
      const session = await open();
      await administrator`BEGIN`;
      await administrator`SELECT pg_advisory_xact_lock(721)`;
      let entered = false;
      const pending = session.write(721n, async (connection) => {
        entered = true;
        return await readValue(connection, table);
      });
      track(pending);
      try {
        await Bun.sleep(50);
        expect(entered).toBe(false);
        await administrator.unsafe('UPDATE ' + table + ' SET value = 9');
        await administrator`COMMIT`;
        expect(await pending).toBe(9);
        const lock = commands.findIndex((command) => command.includes('pg_advisory_xact_lock'));
        expect(lock).toBeGreaterThan(-1);
        expect(commands[lock]).not.toContain(table);
      } finally {
        await administrator`ROLLBACK`;
        await session.close();
      }
    });
  });
  test('rolls back callback mutations and preserves its original failure', async () => {
    await withFixture(async ({ open, administrator, table }) => {
      const session = await open();
      const original = new Error('callback failed');
      await rejects(
        session.write(1n, async (connection) => {
          await connection.unsafe('UPDATE ' + table + ' SET value = 12');
          throw original;
        }),
        (cause) => cause === original,
      );
      expect(await readValue(administrator, table)).toBe(0);
      expect(await session.write(1n, () => Promise.resolve(17))).toBe(17);
      expect(await readValue(administrator, table)).toBe(0);
      await session.close();
    });
  });
  test('waits for COMMIT acknowledgement before returning the callback value', async () => {
    await withFixture(async ({ open, faults, administrator, table }) => {
      const committed = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      faults.query = async (command, execute) => {
        const rows = await execute();
        if (command === 'COMMIT') {
          committed.resolve(undefined);
          await release.promise;
        }
        return rows;
      };
      const session = await open();
      const pending = session.write(1n, async (connection) => {
        await connection.unsafe('UPDATE ' + table + ' SET value = 13');
        return 42;
      });
      const settled = track(pending);
      try {
        await reached(committed.promise);
        expect(await readValue(administrator, table)).toBe(13);
        expect(settled()).toBe(false);
      } finally {
        release.resolve(undefined);
      }
      expect(await pending).toBe(42);
      await session.close();
    });
  });
  test('keeps an ambiguous COMMIT unknown, fences further work and never retries', async () => {
    await withFixture(async ({ open, faults, administrator, table }) => {
      const lost = new Error('COMMIT acknowledgement lost');
      let commits = 0;
      let callbacks = 0;
      faults.query = async (command, execute) => {
        const rows = await execute();
        if (command === 'COMMIT') {
          commits++;
          throw lost;
        }
        return rows;
      };
      const session = await open();
      await rejects(
        session.write(1n, async (connection) => {
          callbacks++;
          await connection.unsafe('UPDATE ' + table + ' SET value = 14');
        }),
        (cause) => contains(cause, lost),
      );
      expect(await readValue(administrator, table)).toBe(14);
      await rejects(
        session.write(1n, () => {
          callbacks++;
          return Promise.resolve();
        }),
        /fenced/,
      );
      expect(callbacks).toBe(1);
      expect(commits).toBe(1);
      await session.close();
    });
  });
  test('retains callback and rollback failure and fences the valid native writer', async () => {
    await withFixture(async ({ open, faults, connections }) => {
      const original = new Error('callback failure');
      const rollback = new Error('rollback acknowledgement lost');
      faults.query = async (command, execute) => {
        const rows = await execute();
        if (command === 'ROLLBACK') throw rollback;
        return rows;
      };
      const session = await open();
      await rejects(
        session.write(1n, () => Promise.reject(original)),
        (cause) => contains(cause, original) && contains(cause, rollback),
      );
      const writer = connections.get('writer');
      if (writer === undefined) throw new Error('missing writer');
      expect((await writer<{ alive: number }[]>`SELECT 1 AS alive`)[0]?.alive).toBe(1);
      await rejects(
        session.snapshot(() => Promise.resolve(19)),
        /fenced/,
      );
      await doesNotReject(session.close());
    });
  });
  test('synchronously fences new calls, rejects queued calls and drains admitted work', async () => {
    await withFixture(async ({ open, connections }) => {
      const session = await open();
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      const admitted = session.write(1n, async () => {
        entered.resolve(undefined);
        await release.promise;
        return 17;
      });
      await reached(entered.promise);
      let queued = false;
      const waiting = session.snapshot(() => {
        queued = true;
        return Promise.resolve(18);
      });
      track(waiting);
      const closing = session.close();
      const settled = track(closing);
      try {
        const writer = connections.get('writer');
        if (writer === undefined) throw new Error('missing writer');
        const alive = await writer<{ alive: number }[]>`SELECT 1 AS alive`;
        expect(alive[0]?.alive).toBe(1);
        await rejects(
          awaitCompletion(
            session.write(1n, () => Promise.resolve(19)),
            AbortSignal.timeout(80),
          ),
          /fenced/,
        );
        await rejects(
          session.snapshot(() => Promise.resolve(20)),
          /fenced/,
        );
        await rejects(awaitCompletion(waiting, AbortSignal.timeout(80)), /fenced/);
        expect(queued).toBe(false);
        expect(settled()).toBe(false);
      } finally {
        release.resolve(undefined);
        await Promise.allSettled([admitted, closing]);
      }
      expect(await admitted).toBe(17);
      await closing;
      expect(queued).toBe(false);
      expectSticky(() => session.close(), closing);
    });
  });
  test('caller timeout cannot substitute for actual callback settlement', async () => {
    await withFixture(async ({ open, administrator, table }) => {
      const session = await open({ operationMilliseconds: 35, closeMilliseconds: 1000 });
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      let published = false;
      const pending = session.write(1n, async (connection) => {
        entered.resolve(undefined);
        await release.promise;
        await connection.unsafe('UPDATE ' + table + ' SET value = 15');
        published = true;
      });
      track(pending);
      await reached(entered.promise);
      await rejects(pending, /timed out|Timeout/);
      await rejects(
        session.snapshot(() => Promise.resolve(99)),
        /fenced/,
      );
      const closing = session.close();
      const settled = track(closing);
      await Bun.sleep(60);
      expect(settled()).toBe(false);
      release.resolve(undefined);
      await closing;
      expect(published).toBe(true);
      expect(await readValue(administrator, table)).toBe(0);
    });
  });
  test('close deadline retains uncertainty and observes a late callback rejection', async () => {
    await withFixture(async ({ open, closeCalls }) => {
      const session = await open({ operationMilliseconds: 25, closeMilliseconds: 65 });
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      const finished = Promise.withResolvers<undefined>();
      const pending = session.write(1n, async () => {
        entered.resolve(undefined);
        await release.promise;
        finished.resolve(undefined);
        throw new Error('late callback rejection');
      });
      track(pending);
      await reached(entered.promise);
      await rejects(pending);
      const start = performance.now();
      const closing = session.close();
      await rejects(closing);
      expect(performance.now() - start).toBeLessThan(500);
      for (const call of [
        'writer:reservation',
        'writer:pool',
        'observer:reservation',
        'observer:pool',
      ])
        expect(closeCalls).toContain(call);
      release.resolve(undefined);
      await finished.promise;
      await Bun.sleep(20);
      expectSticky(() => session.close(), closing);
      await rejects(session.close());
    });
  });
  test('requires actual server writer disappearance after locally fulfilled closes', async () => {
    await withFixture(async ({ open, faults, connections }) => {
      faults.close = async (purpose, _kind, execute) => {
        if (purpose !== 'writer') await execute();
      };
      const session = await open({ closeMilliseconds: 90 });
      const writer = connections.get('writer');
      if (writer === undefined) throw new Error('missing writer');
      const closing = session.close();
      const settled = track(closing);
      await Bun.sleep(35);
      const alive = await writer<{ alive: number }[]>`SELECT 1 AS alive`;
      expect(alive[0]?.alive).toBe(1);
      expect(settled()).toBe(false);
      await rejects(closing);
      expectSticky(() => session.close(), closing);
    });
  });
  test('waits for real writer disappearance before closing the observer', async () => {
    await withFixture(async ({ open, faults, connections, closeCalls }) => {
      faults.close = async (purpose, _kind, execute) => {
        if (purpose !== 'writer') await execute();
      };
      const session = await open();
      const closing = session.close();
      const settled = track(closing);
      await Bun.sleep(35);
      expect(settled()).toBe(false);
      expect(closeCalls).not.toContain('observer:reservation');
      const writer = connections.get('writer');
      if (writer === undefined) throw new Error('missing writer');
      await writer.close({ timeout: 0 });
      await closing;
      expect(closeCalls).toContain('observer:reservation');
    });
  });
  test('preserves both independent disposal failures with a sticky outcome', async () => {
    await withFixture(async ({ open, faults, closeCalls }) => {
      const writerFailure = new Error('writer close failure');
      const observerFailure = new Error('observer close failure');
      faults.close = async (purpose, kind, execute) => {
        await execute();
        if (kind === 'reservation') throw purpose === 'writer' ? writerFailure : observerFailure;
      };
      const session = await open();
      const closing = session.close();
      await rejects(
        closing,
        (cause) => contains(cause, writerFailure) && contains(cause, observerFailure),
      );
      for (const call of [
        'writer:reservation',
        'writer:pool',
        'observer:reservation',
        'observer:pool',
      ])
        expect(closeCalls).toContain(call);
      expectSticky(() => session.close(), closing);
      await rejects(session.close());
    });
  });
  test('one close deadline bounds hung independent disposal attempts', async () => {
    await withFixture(async ({ open, faults, closeCalls }) => {
      const held = Promise.withResolvers<undefined>();
      faults.close = async (_purpose, _kind, execute) => {
        await execute();
        await held.promise;
      };
      const session = await open({ closeMilliseconds: 100 });
      const start = performance.now();
      const closing = session.close();
      try {
        await rejects(closing);
        expect(performance.now() - start).toBeLessThan(180);
        expect(closeCalls).toHaveLength(4);
      } finally {
        held.resolve(undefined);
      }
      expectSticky(() => session.close(), closing);
    });
  });
  test('startup cookie mismatch fails before admission and disposes both clients', async () => {
    await withFixture(async ({ open, faults, closeCalls }) => {
      faults.cookie = (purpose, name) => (purpose === 'writer' ? 'wrong_cookie' : name);
      await rejects(open(), /cookie/);
      for (const call of [
        'writer:reservation',
        'writer:pool',
        'observer:reservation',
        'observer:pool',
      ])
        expect(closeCalls).toContain(call);
    });
  });
  test('bounds queued caller time while retaining the admitted callback', async () => {
    await withFixture(async ({ open }) => {
      const session = await open({ operationMilliseconds: 80 });
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      const admitted = session.write(1n, async () => {
        entered.resolve(undefined);
        await release.promise;
      });
      track(admitted);
      await reached(entered.promise);
      let invoked = false;
      const queued = session.snapshot(() => {
        invoked = true;
        return Promise.resolve();
      });
      track(queued);
      try {
        await rejects(admitted, /timed out|Timeout/);
        await rejects(
          awaitCompletion(queued, AbortSignal.timeout(400)),
          /fenced|timed out|Timeout/,
        );
        expect(invoked).toBe(false);
      } finally {
        release.resolve(undefined);
      }
      await session.close();
    });
  });
  test('queued work cannot escape its caller deadline behind several successful transactions', async () => {
    await withFixture(async ({ open }) => {
      const session = await open({ operationMilliseconds: 150 });
      const first = session.write(1n, async () => {
        await Bun.sleep(90);
      });
      track(first);
      const second = session.write(1n, async () => {
        await Bun.sleep(90);
      });
      track(second);
      let entered = false;
      const third = session.snapshot(() => {
        entered = true;
        return Promise.resolve();
      });
      track(third);
      await first;
      await rejects(second, /timed out|Timeout/);
      await rejects(third, /fenced|timed out|Timeout/);
      expect(entered).toBe(false);
      await session.close();
    });
  });
  test('late COMMIT acknowledgement does not turn a caller timeout into retry or success', async () => {
    await withFixture(async ({ open, faults, administrator, table }) => {
      const committed = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      let commits = 0;
      faults.query = async (command, execute) => {
        const rows = await execute();
        if (command === 'COMMIT') {
          commits++;
          committed.resolve(undefined);
          await release.promise;
        }
        return rows;
      };
      const session = await open({ operationMilliseconds: 45 });
      const pending = session.write(1n, async (connection) => {
        await connection.unsafe('UPDATE ' + table + ' SET value = 23');
        return 24;
      });
      track(pending);
      await reached(committed.promise);
      await rejects(pending, /timed out|Timeout/);
      const closing = session.close();
      const settled = track(closing);
      try {
        await Bun.sleep(30);
        expect(settled()).toBe(false);
        expect(await readValue(administrator, table)).toBe(23);
        await rejects(
          session.write(1n, () => Promise.resolve(25)),
          /fenced/,
        );
      } finally {
        release.resolve(undefined);
      }
      await closing;
      expect(commits).toBe(1);
      await rejects(pending, /timed out|Timeout/);
    });
  });
  test('real connection loss fences and never replays its callback', async () => {
    await withFixture(async ({ open, administrator }) => {
      const session = await open();
      let calls = 0;
      await rejects(
        session.write(1n, async (connection) => {
          calls++;
          const rows = await connection<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
          const pid = rows.at(0)?.pid;
          if (pid === undefined) throw new Error('missing backend pid');
          await administrator`SELECT pg_terminate_backend(${pid})`;
          await connection`SELECT 1`;
        }),
      );
      await rejects(
        session.snapshot(() => {
          calls++;
          return Promise.resolve();
        }),
        /fenced/,
      );
      expect(calls).toBe(1);
      await session.close();
    });
  });
  test('finite server statement and lock budgets abort real blocked commands', async () => {
    await withFixture(async ({ open, administrator }) => {
      const session = await open({ statementMilliseconds: 40, lockMilliseconds: 25 });
      await rejects(
        session.snapshot(async (connection) => {
          await connection`SELECT pg_sleep(1)`;
        }),
        /statement timeout/,
      );
      await administrator`BEGIN`;
      await administrator`SELECT pg_advisory_xact_lock(722)`;
      let entered = false;
      try {
        await rejects(
          session.write(722n, () => {
            entered = true;
            return Promise.resolve();
          }),
          /lock timeout/,
        );
        expect(entered).toBe(false);
      } finally {
        await administrator`ROLLBACK`;
      }
      await session.close();
    });
  });
  test('observer inspection failure stays sticky and still attempts final local disposals', async () => {
    await withFixture(async ({ open, connections, closeCalls }) => {
      const session = await open();
      const observer = connections.get('observer');
      if (observer === undefined) throw new Error('missing observer');
      await observer`DEALLOCATE twilight_observer_probe`;
      const closing = session.close();
      await rejects(
        closing,
        (cause) =>
          cause instanceof AggregateError &&
          cause.errors.some((nested) => String(nested).includes('prepared statement')),
      );
      expect(closeCalls).toHaveLength(4);
      expectSticky(() => session.close(), closing);
      await rejects(session.close());
    });
  });
  test('failed open preserves the original error and independent cleanup failures', async () => {
    await withFixture(async ({ open, faults, closeCalls }) => {
      const writerFailure = new Error('writer disposal refused');
      const observerFailure = new Error('observer disposal refused');
      faults.cookie = (purpose, name) => (purpose === 'writer' ? 'wrong_cookie' : name);
      faults.close = async (purpose, kind, execute) => {
        await execute();
        if (kind === 'pool') throw purpose === 'writer' ? writerFailure : observerFailure;
      };
      await rejects(
        open(),
        (cause) =>
          cause instanceof AggregateError &&
          String(cause.cause).includes('cookie') &&
          contains(cause, writerFailure) &&
          contains(cause, observerFailure),
      );
      expect(closeCalls).toHaveLength(4);
    });
  });
  test('open timeout retains late reservations for disposal without admission', async () => {
    await withFixture(async ({ open, faults, closeCalls }) => {
      const release = Promise.withResolvers<undefined>();
      const entered = Promise.withResolvers<undefined>();
      faults.reserve = async (purpose) => {
        if (purpose === 'writer') {
          entered.resolve(undefined);
          await release.promise;
        }
      };
      const pending = open({ openMilliseconds: 30, closeMilliseconds: 40 });
      track(pending);
      await reached(entered.promise);
      await rejects(
        pending,
        (cause) => cause instanceof AggregateError && String(cause.cause).includes('timed out'),
      );
      for (const call of ['writer:pool', 'observer:reservation', 'observer:pool'])
        expect(closeCalls).toContain(call);
      release.resolve(undefined);
      await Bun.sleep(20);
      expect(closeCalls).toContain('writer:reservation');
    });
  });
  test('requires acknowledged writer registration before admitting any work', async () => {
    await withFixture(async ({ open, faults, closeCalls }) => {
      const refusal = new Error('writer registration inspection refused');
      let scans = 0;
      faults.inspect = async (command, execute) => {
        const rows = await execute();
        if (command === 'EXECUTE twilight_observer_probe' && ++scans === 2) throw refusal;
        return rows;
      };
      await rejects(open(), (cause) => cause === refusal);
      expect(closeCalls).toHaveLength(4);
    });
  });
  test('does not invoke a timed-out callback after its lock finally arrives', async () => {
    await withFixture(async ({ open, administrator }) => {
      const session = await open({ operationMilliseconds: 35 });
      await administrator`BEGIN`;
      await administrator`SELECT pg_advisory_xact_lock(723)`;
      let entered = false;
      const pending = session.write(723n, () => {
        entered = true;
        return Promise.resolve();
      });
      track(pending);
      await rejects(pending, /timed out|Timeout/);
      const closing = session.close();
      const settled = track(closing);
      expect(settled()).toBe(false);
      await administrator`COMMIT`;
      await closing;
      expect(entered).toBe(false);
    });
  });
  test('failed BEGIN acknowledgement fences a still-valid native writer', async () => {
    await withFixture(async ({ open, faults, connections }) => {
      const refusal = new Error('BEGIN acknowledgement lost');
      faults.query = async (command, execute) => {
        if (command.startsWith('BEGIN')) throw refusal;
        return await execute();
      };
      const session = await open();
      await rejects(
        session.write(1n, () => Promise.resolve(10)),
        (cause) => cause === refusal,
      );
      const writer = connections.get('writer');
      if (writer === undefined) throw new Error('missing writer');
      expect((await writer<{ alive: number }[]>`SELECT 1 AS alive`)[0]?.alive).toBe(1);
      faults.query = undefined;
      await rejects(
        session.snapshot(() => Promise.resolve(11)),
        /fenced/,
      );
      await session.close();
    });
  });
  test('refuses a ROLLBACK command tag instead of acknowledging a successful COMMIT', async () => {
    await withFixture(async ({ open, administrator, table }) => {
      const session = await open();
      await rejects(
        session.write(1n, async (connection) => {
          await connection.unsafe('UPDATE ' + table + ' SET value = 31');
          await rejects(connection`SELECT 1 / 0`, /division by zero/);
          return 32;
        }),
        /COMMIT/,
      );
      expect(await readValue(administrator, table)).toBe(0);
      await session.close();
    });
  });
  test('missing COMMIT metadata stays uncertain even when its native command committed', async () => {
    for (const acknowledgement of [
      undefined,
      null,
      [],
      {},
      { command: undefined },
      {
        get command(): never {
          throw new Error('unreadable COMMIT metadata');
        },
      },
    ]) {
      await withFixture(async ({ open, faults, administrator, table }) => {
        const session = await open();
        faults.query = async (command, execute) => {
          const rows = await execute();
          return command === 'COMMIT' ? acknowledgement : rows;
        };
        await rejects(
          session.write(1n, async (connection) => {
            await connection.unsafe('UPDATE ' + table + ' SET value = 33');
          }),
          /COMMIT outcome unknown/,
        );
        expect(await readValue(administrator, table)).toBe(33);
        await rejects(
          session.snapshot(() => Promise.resolve(34)),
          /fenced/,
        );
        await session.close();
      });
    }
  });
  test('sticky close retains callback and rollback causes arriving after the caller timeout', async () => {
    await withFixture(async ({ open, faults, closeCalls, administrator, table }) => {
      const original = new Error('late callback failed');
      const rollback = new Error('late rollback acknowledgement failed');
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      const session = await open({ operationMilliseconds: 50, closeMilliseconds: 1000 });
      faults.query = async (command, execute) => {
        const rows = await execute();
        if (command === 'ROLLBACK') throw rollback;
        return rows;
      };
      let observed = false;
      faults.inspect = async (command, execute) => {
        const rows = await execute();
        if (command === 'EXECUTE twilight_observer_probe') observed = true;
        return rows;
      };
      const pending = session.write(1n, async (connection) => {
        await connection.unsafe('UPDATE ' + table + ' SET value = 41');
        entered.resolve(undefined);
        await release.promise;
        throw original;
      });
      track(pending);
      await reached(entered.promise);
      let timeout: unknown;
      await rejects(pending, (cause) => {
        timeout = cause;
        return cause instanceof DOMException && cause.name === 'TimeoutError';
      });
      const closing = session.close();
      track(closing);
      release.resolve(undefined);
      let failure: unknown;
      await rejects(closing, (cause) => {
        failure = cause;
        return contains(cause, original) && contains(cause, rollback);
      });
      expect(observed).toBe(true);
      expect(closeCalls.toSorted()).toEqual([
        'observer:pool',
        'observer:reservation',
        'writer:pool',
        'writer:reservation',
      ]);
      expect(await readValue(administrator, table)).toBe(0);
      expectSticky(() => session.close(), closing);
      await rejects(session.close(), (cause) => cause === failure);
      await rejects(pending, (cause) => cause === timeout);
    });
  });
  test('acknowledged rollback of a late callback error does not poison close', async () => {
    await withFixture(async ({ open, administrator, table }) => {
      const original = new Error('ordinary late callback failure');
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      const session = await open({ operationMilliseconds: 50, closeMilliseconds: 1000 });
      const pending = session.write(1n, async (connection) => {
        await connection.unsafe('UPDATE ' + table + ' SET value = 42');
        entered.resolve(undefined);
        await release.promise;
        throw original;
      });
      track(pending);
      await reached(entered.promise);
      let timeout: unknown;
      await rejects(pending, (cause) => {
        timeout = cause;
        return cause instanceof DOMException && cause.name === 'TimeoutError';
      });
      const closing = session.close();
      track(closing);
      release.resolve(undefined);
      await closing;
      expect(await readValue(administrator, table)).toBe(0);
      expectSticky(() => session.close(), closing);
      await rejects(pending, (cause) => cause === timeout);
    });
  });
});
