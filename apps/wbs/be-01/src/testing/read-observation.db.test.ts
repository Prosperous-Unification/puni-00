import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  observeCommitted,
  openDatabase,
  openReadOnlyConnection,
  poolReadConnections,
} from '@wbs/store-sqlite/db';
import { expect, test } from 'bun:test';

import { trackReadObservations } from './read-observation.fixture';

function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'actual-read-loan-'));
  const path = join(folder, 'store.sqlite');
  const writer = openDatabase(path);
  writer.run('CREATE TABLE observed (id INTEGER)');
  writer.run('INSERT INTO observed VALUES (1)');
  return { folder, path, writer };
}

test('counts actual unique loans, releases before callback and preserves idle physical readers', async () => {
  const f = fixture();
  const probe = trackReadObservations();
  const pool = poolReadConnections(() => probe.openConnection(f.path));
  const released: number[] = [];
  probe.onReleased = () => {
    released.push(probe.borrowed);
  };
  try {
    await observeCommitted(
      () => pool.acquire(),
      (db) => {
        expect(probe.readConnections.has(db)).toBe(true);
        expect(probe.borrowed).toBe(1);
        return db.all('SELECT id FROM observed');
      },
    );
    expect(probe.observations).toBe(1);
    expect(probe.released).toBe(1);
    expect(probe.borrowed).toBe(0);
    expect(released).toEqual([0]);
    expect(probe.physicalOpen).toBe(1);
    const first = [...probe.readConnections].at(0);
    if (typeof first !== 'object' || first === null) throw new Error('actual first loan missing');
    const next = pool.acquire();
    next.db.run('BEGIN DEFERRED');
    expect(probe.observations).toBe(2);
    expect(probe.borrowed).toBe(1);
    expect(probe.readConnections.has(next.db)).toBe(true);
    expect(() => {
      Reflect.get(first, 'run');
    }).toThrow('a pooled read connection was used after its release');
    next.db.run('ROLLBACK');
    next.close();
    await Promise.resolve();
    expect(released).toEqual([0, 0]);
    expect(probe.physicalOpened).toBe(1);
  } finally {
    pool.close();
    f.writer.close();
    rmSync(f.folder, { recursive: true, force: true });
    expect(probe.physicalOpen).toBe(0);
  }
});

test('beforeRead runs before the actual read transaction and onReleased runs before writer continuation', async () => {
  const f = fixture();
  const probe = trackReadObservations();
  const pool = poolReadConnections(() => probe.openConnection(f.path));
  const phases: string[] = [];
  probe.beforeRead = () => {
    phases.push('before-read');
    f.writer.run('INSERT INTO observed VALUES (2)');
  };
  probe.onReleased = () => {
    expect(probe.borrowed).toBe(0);
    phases.push('released');
  };
  try {
    const rows = await observeCommitted(
      () => pool.acquire(),
      (db) => db.all('SELECT id FROM observed ORDER BY id'),
    );
    phases.push('writer-continuation');
    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(phases).toEqual(['before-read', 'released', 'writer-continuation']);
  } finally {
    pool.close();
    f.writer.close();
    rmSync(f.folder, { recursive: true, force: true });
  }
});

test('unrelated property-access failures never count as expired loans', () => {
  const f = fixture();
  const probe = trackReadObservations((filename) => {
    const connection = openReadOnlyConnection(filename);
    return {
      ...connection,
      db: new Proxy(connection.db, {
        get(target, key, receiver): unknown {
          if (key === 'run') throw new Error('unrelated access failure');
          const member: unknown = Reflect.get(target, key, receiver);
          return member;
        },
      }),
    };
  });
  const pool = poolReadConnections(() => probe.openConnection(f.path));
  const loan = pool.acquire();
  try {
    expect(() => Reflect.get(loan.db, 'run')).toThrow('unrelated access failure');
    expect(() => probe.borrowed).toThrow('unrelated access failure');
  } finally {
    loan.close();
    pool.close();
    f.writer.close();
    rmSync(f.folder, { recursive: true, force: true });
  }
});

test('a logger-rejected real COMMIT schedules only the successful rollback release', async () => {
  const f = fixture();
  const probe = trackReadObservations((filename, logger) =>
    openReadOnlyConnection(filename, {
      logQuery(query, parameters) {
        logger?.logQuery(query, parameters);
        if (query.trim().toUpperCase() === 'COMMIT')
          throw new Error('injected COMMIT logger rejection');
      },
    }),
  );
  const pool = poolReadConnections(() => probe.openConnection(f.path));
  let callbacks = 0;
  probe.onReleased = () => {
    callbacks++;
  };
  try {
    let failure: unknown;
    try {
      await observeCommitted(
        () => pool.acquire(),
        (db) => db.all('SELECT id FROM observed'),
      );
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ message: 'injected COMMIT logger rejection' });
    expect(callbacks).toBe(1);
    expect(probe.borrowed).toBe(0);
  } finally {
    pool.close();
    f.writer.close();
    rmSync(f.folder, { recursive: true, force: true });
  }
});

test('missing real statement instrumentation refuses without a release callback', async () => {
  const f = fixture();
  const probe = trackReadObservations((filename) => openReadOnlyConnection(filename));
  const pool = poolReadConnections(() => probe.openConnection(f.path));
  let callbacks = 0;
  probe.onReleased = () => {
    callbacks++;
  };
  try {
    let failure: unknown;
    try {
      await observeCommitted(
        () => pool.acquire(),
        (db) => db.all('SELECT id FROM observed'),
      );
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ message: 'read statement observation was lost' });
    expect(callbacks).toBe(0);
    expect(probe.borrowed).toBe(0);
  } finally {
    pool.close();
    f.writer.close();
    rmSync(f.folder, { recursive: true, force: true });
  }
});

test('a retained run method still refuses the exact loan after release', async () => {
  const f = fixture();
  const probe = trackReadObservations();
  const pool = poolReadConnections(() => probe.openConnection(f.path));
  let retainedRun: (() => unknown) | undefined;
  try {
    await observeCommitted(
      () => pool.acquire(),
      (db) => {
        const run = db.run.bind(db);
        retainedRun = () => run('SELECT id FROM observed');
        return db.all('SELECT id FROM observed');
      },
    );
    if (retainedRun === undefined) throw new Error('actual retained run missing');
    expect(retainedRun).toThrow('a pooled read connection was used after its release');
  } finally {
    pool.close();
    f.writer.close();
    rmSync(f.folder, { recursive: true, force: true });
  }
});
