import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import {
  captureReadEpoch as capture,
  type Drizzle,
  observeCommitted,
  openConnection,
  openReadOnlyConnection,
  poolReadConnections,
  type ReadEpoch as Epoch,
} from '../db';

async function assertFailure(pending: Promise<unknown>, fragment: string): Promise<void> {
  try {
    await pending;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    expect(cause.message).toContain(fragment);
    return;
  }
  throw Error('expected native evidence refusal');
}

function available(db: Drizzle): Extract<Epoch, { kind: 'available' }> {
  const epoch = capture(db);
  if (epoch.kind !== 'available') throw Error('expected available epoch');
  return epoch;
}

const directory = mkdtempSync(join(tmpdir(), 'puni-read-epoch-test-'));
const path = join(directory, 'read.sqlite');
const writer = openConnection(path);
writer.db.run('CREATE TABLE witness (id INTEGER PRIMARY KEY,value TEXT NOT NULL)');
writer.db.run("INSERT INTO witness VALUES(1,'original')");
const reader = openReadOnlyConnection(path);
const pool = poolReadConnections(() => openReadOnlyConnection(path));

afterAll(() => {
  pool.close();
  reader.close();
  writer.close();
});

test('a writable native owner visibly declines optional row reuse', async () => {
  await observeCommitted(
    () => ({
      db: writer.db,
      close() {
        return undefined;
      },
    }),
    (db) => {
      expect(capture(db)).toEqual({ kind: 'unavailable', reason: 'unregistered' });
    },
  );
});

test('a readonly owner without an active snapshot visibly declines optional row reuse', () => {
  expect(capture(reader.db)).toEqual({ kind: 'unavailable', reason: 'no_transaction' });
});

test('malformed native transaction state refuses instead of disabling optional reuse', () => {
  const client = Reflect.get(reader.db, '$client') as object;
  const preceding = Object.getOwnPropertyDescriptor(client, 'inTransaction');
  Object.defineProperty(client, 'inTransaction', { configurable: true, get: () => undefined });
  try {
    expect(() => capture(reader.db)).toThrow('transaction state');
  } finally {
    if (preceding === undefined) Reflect.deleteProperty(client, 'inTransaction');
    else Object.defineProperty(client, 'inTransaction', preceding);
  }
});

test('successive loans retain physical identity and concurrent readers never share it', async () => {
  const first = await observeCommitted(
    () => pool.acquire(),
    (db) => available(db).owner,
  );
  await observeCommitted(
    () => pool.acquire(),
    async (db) => {
      expect(available(db).owner).toBe(first);
      await observeCommitted(
        () => pool.acquire(),
        (other) => {
          expect(available(other).owner).not.toBe(first);
        },
      );
    },
  );
});

test('epoch invalidates a same-revision rival commit and stays pinned through a held snapshot', async () => {
  await observeCommitted(
    () => ({
      db: reader.db,
      close() {
        return undefined;
      },
    }),
    (db) => {
      const before = available(db);
      writer.db.run("UPDATE witness SET value='committed' WHERE id=1");
      expect(available(db)).toEqual(before);
      expect(db.get<{ value: string } | undefined>('SELECT value FROM witness WHERE id=1')).toEqual(
        { value: 'original' },
      );
    },
  );
  await observeCommitted(
    () => ({
      db: reader.db,
      close() {
        return undefined;
      },
    }),
    (db) => {
      expect(db.get<{ value: string } | undefined>('SELECT value FROM witness WHERE id=1')).toEqual(
        { value: 'committed' },
      );
    },
  );
  const before = await observeCommitted(
    () => ({
      db: reader.db,
      close() {
        return undefined;
      },
    }),
    available,
  );
  writer.db.run("UPDATE witness SET value='next' WHERE id=1");
  const after = await observeCommitted(
    () => ({
      db: reader.db,
      close() {
        return undefined;
      },
    }),
    available,
  );
  expect(after.version).not.toBe(before.version);
  expect(after.owner).toBe(before.owner);
});

test('TEMP shadowing changes evidence although all main counters remain equal', async () => {
  await observeCommitted(
    () => ({
      db: reader.db,
      close() {
        return undefined;
      },
    }),
    (db) => {
      const before = available(db);
      db.run("CREATE TEMP VIEW witness AS SELECT 1 AS id,'shadow' AS value");
      try {
        const after = available(db);
        expect(after.version).toBe(before.version);
        expect(after.schema).toBe(before.schema);
        expect(after.changes).toBe(before.changes);
        expect(after.tempSchema).not.toBe(before.tempSchema);
        expect(
          db.get<{ value: string } | undefined>('SELECT value FROM witness WHERE id=1'),
        ).toEqual({ value: 'shadow' });
      } finally {
        db.run('DROP VIEW temp.witness');
      }
    },
  );
});

test('TEMP row writes invalidate without changing either schema or the main version', async () => {
  await observeCommitted(
    () => ({
      db: reader.db,
      close() {
        return undefined;
      },
    }),
    (db) => {
      db.run('CREATE TEMP TABLE local_witness (id INTEGER PRIMARY KEY)');
      try {
        const before = available(db);
        db.run('INSERT INTO local_witness VALUES(1)');
        const after = available(db);
        expect(after.version).toBe(before.version);
        expect(after.schema).toBe(before.schema);
        expect(after.tempSchema).toBe(before.tempSchema);
        expect(after.changes).toBe(before.changes + 1);
      } finally {
        db.run('DROP TABLE temp.local_witness');
      }
    },
  );
});

test('attached databases visibly disable optional reuse until detached', async () => {
  await observeCommitted(
    () => ({
      db: reader.db,
      close() {
        return undefined;
      },
    }),
    (db) => {
      db.run("ATTACH DATABASE ':memory:' AS extra");
      try {
        expect(capture(db)).toEqual({ kind: 'unavailable', reason: 'attached' });
      } finally {
        db.run('DETACH DATABASE extra');
      }
      expect(available(db).kind).toBe('available');
    },
  );
});

test('an expired pooled loan cannot obtain native evidence', async () => {
  let retained: Drizzle | undefined;
  await observeCommitted(
    () => pool.acquire(),
    (db) => {
      retained = db;
      available(db);
    },
  );
  if (retained === undefined) throw Error('missing retained loan');
  const expired = retained;
  expect(() => capture(expired)).toThrow('release');
});

test('missing native client refuses instead of fabricating an unsupported-owner result', () => {
  const absent = new Proxy(reader.db, {
    get(target, key, receiver): unknown {
      return key === '$client' ? undefined : Reflect.get(target, key, receiver);
    },
  });
  expect(() => capture(absent)).toThrow('client');
});

test('missing main schema refuses instead of fabricating an epoch', async () => {
  const absent = new Proxy(reader.db, {
    get(target, key, receiver): unknown {
      return key === 'all' ? () => [] : Reflect.get(target, key, receiver);
    },
  });
  await assertFailure(
    observeCommitted(
      () => ({
        db: reader.db,
        close() {
          return undefined;
        },
      }),
      () => capture(absent),
    ),
    'main',
  );
});

test('malformed schema names refuse instead of treating corruption as an attachment', async () => {
  const malformed = new Proxy(reader.db, {
    get(target, key, receiver): unknown {
      return key === 'all' ? () => [{ name: null }] : Reflect.get(target, key, receiver);
    },
  });
  await assertFailure(
    observeCommitted(
      () => ({
        db: reader.db,
        close() {
          return undefined;
        },
      }),
      () => capture(malformed),
    ),
    'schema identity is malformed',
  );
});

test.each([undefined, {}, { data_version: '3' }, { data_version: -1 }, { data_version: NaN }])(
  'malformed native scalars refuse: %j',
  async (row) => {
    const malformed = new Proxy(reader.db, {
      get(target, key, receiver): unknown {
        return key === 'get' ? () => row : Reflect.get(target, key, receiver);
      },
    });
    await assertFailure(
      observeCommitted(
        () => ({
          db: reader.db,
          close() {
            return undefined;
          },
        }),
        () => capture(malformed),
      ),
      'integer',
    );
  },
);
