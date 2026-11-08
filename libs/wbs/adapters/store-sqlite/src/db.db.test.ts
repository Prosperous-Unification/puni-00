import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- switchToWal is tested on a file not yet in WAL, which openDatabase would already have switched
import { Database, SQLiteError } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import {
  assertPragmas,
  type Connection,
  observeCommitted,
  openDatabase,
  openReadOnlyConnection,
  poolReadConnections,
  STATEMENT_CACHE_SIZE,
  switchToWal,
} from './db';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-db-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('openDatabase', () => {
  it('enables WAL journal mode', () => {
    const db = openDatabase(join(dir, 'test.db'));
    const row = db.query<{ journal_mode: string }, []>('PRAGMA journal_mode;').get();
    expect(row?.journal_mode.toLowerCase()).toBe('wal');
    db.close();
  });

  it('sets a non-zero busy timeout', () => {
    const db = openDatabase(join(dir, 'test.db'));
    const row = db.query<{ timeout: number }, []>('PRAGMA busy_timeout;').get();
    expect(row?.timeout).toBeGreaterThanOrEqual(5000);
    db.close();
  });

  it('assertPragmas passes on a correctly opened database', () => {
    const db = openDatabase(join(dir, 'test.db'));
    expect(() => {
      assertPragmas(db);
    }).not.toThrow();
    db.close();
  });

  // `openDatabase` set the pragmas and `assertPragmas` verified them, but
  // calling the second was left to the caller — and the only caller was
  // repository/migrate.ts. Any future caller that forgot it would get a
  // connection whose pragmas were requested but never confirmed. Asserting
  // inside `openDatabase` makes "set" and "verified" one step.
  //
  // An in-memory database is the concrete case: SQLite silently keeps
  // journal_mode=memory there rather than failing, so `:memory:` used to hand
  // back a connection that looked fine and was not in WAL at all. Tests
  // reaching for `:memory:` are exactly how that would get normalised.
  it('refuses an in-memory database, which cannot honour WAL', () => {
    expect(() => openDatabase(':memory:')).toThrow(/journal_mode/);
  });

  it('assertPragmas throws when WAL is absent', () => {
    const db = openDatabase(join(dir, 'test.db'));
    db.run('PRAGMA journal_mode = DELETE;');
    expect(() => {
      assertPragmas(db);
    }).toThrow(/journal_mode/);
    db.close();
  });

  // The third pragma was set and never verified. It is the one the domain
  // schema leans on: `work_item.project_id` and `estimate.work_item_id` are
  // declared foreign keys, and with enforcement off SQLite parses them and
  // ignores them, so an orphan row inserts cleanly and nothing complains until
  // a read finds a work item whose project does not exist.
  it('assertPragmas throws when foreign keys are not enforced', () => {
    const db = openDatabase(join(dir, 'test.db'));
    db.run('PRAGMA foreign_keys = OFF;');
    expect(() => {
      assertPragmas(db);
    }).toThrow(/foreign_keys/);
    db.close();
  });
});

describe('statement cache', () => {
  // Proof: with the `Database.MAX_QUERY_CACHE_SIZE` assignment in db.ts removed, Bun's default
  // of 20 recompiled the first statement and this test failed `toBe` (watched 2026-10-28).
  it('keeps a request-sized set of statements compiled', () => {
    const db = openDatabase(join(dir, 'test.db'));
    db.run('CREATE TABLE t (a INTEGER)');
    const first = db.query('SELECT a FROM t WHERE a = 0');
    for (let n = 1; n < 200; n += 1) db.query(`SELECT a FROM t WHERE a = ${String(n)}`).all();
    expect(db.query('SELECT a FROM t WHERE a = 0')).toBe(first);
    expect(STATEMENT_CACHE_SIZE).toBeGreaterThanOrEqual(200);
    db.close();
  });

  it('never shares a compiled statement with a replaced handle', () => {
    const path = join(dir, 'test.db');
    const before = openDatabase(path);
    before.run('CREATE TABLE t (a INTEGER)');
    const statement = before.query('SELECT a FROM t');
    before.close();
    const after = openDatabase(path);
    expect(after.query('SELECT a FROM t')).not.toBe(statement);
    expect(after.query('SELECT a FROM t').all()).toEqual([]);
    after.close();
  });

  it('answers in the new shape after another connection changed the schema', () => {
    const path = join(dir, 'test.db');
    const db = openDatabase(path);
    db.run('CREATE TABLE t (a INTEGER)');
    db.run('INSERT INTO t VALUES (1)');
    expect(db.query('SELECT * FROM t').all()).toEqual([{ a: 1 }]);
    const other = openDatabase(path);
    other.run('ALTER TABLE t ADD COLUMN b INTEGER DEFAULT 7');
    other.close();
    expect(db.query('SELECT * FROM t').all()).toEqual([{ a: 1, b: 7 }]);
    db.close();
  });
});

describe('poolReadConnections', () => {
  /** A file with one row, its writer, and a factory that counts the connections still open. */
  function seeded() {
    const path = join(dir, 'test.db');
    const writer = openDatabase(path);
    writer.run('CREATE TABLE t (a INTEGER)');
    writer.run('INSERT INTO t VALUES (1)');
    const opened = { now: 0, ever: 0 };
    const open = (): Connection => {
      const connection = openReadOnlyConnection(path);
      opened.now += 1;
      opened.ever += 1;
      return {
        db: connection.db,
        close: () => {
          connection.close();
          opened.now -= 1;
        },
      };
    };
    return { writer, opened, open };
  }

  /** The Bun client under a lent handle, read through drizzle's `$client`. */
  function clientOf(lent: Connection): unknown {
    return (lent.db as unknown as { $client: unknown }).$client;
  }

  /** Whether a full checkpoint ran: a reader's snapshot blocks it. */
  function checkpointed(writer: Database): boolean {
    const row = writer.query<{ busy: number }, []>('PRAGMA wal_checkpoint(TRUNCATE);').get();
    return row?.busy === 0;
  }

  it('lends one connection again, reading what was committed since', () => {
    const { writer, opened, open } = seeded();
    const pool = poolReadConnections(open);
    const first = pool.acquire();
    expect(first.db.all<{ a: number }>(sql`SELECT a FROM t`)).toEqual([{ a: 1 }]);
    first.close();
    writer.run('INSERT INTO t VALUES (2)');
    const second = pool.acquire();
    second.db.run(sql.raw('BEGIN DEFERRED'));
    expect(second.db.all<{ a: number }>(sql`SELECT a FROM t ORDER BY a`)).toEqual([
      { a: 1 },
      { a: 2 },
    ]);
    second.db.run(sql.raw('COMMIT'));
    second.close();
    expect(opened.ever).toBe(1);
    expect(checkpointed(writer)).toBe(true);
    pool.close();
    expect(opened.now).toBe(0);
    writer.close();
  });

  it('lends a connection to one caller at a time', () => {
    const { writer, opened, open } = seeded();
    const pool = poolReadConnections(open);
    const first = pool.acquire();
    const second = pool.acquire();
    const secondClient = clientOf(second);
    expect(secondClient).not.toBe(clientOf(first));
    first.close();
    first.close();
    second.close();
    expect(opened).toEqual({ now: 2, ever: 2 });
    expect(clientOf(pool.acquire())).toBe(secondClient);
    pool.close();
    writer.close();
  });

  // Proof: handing out the connection's own `db` made this read through the released handle
  // (watched 2026-10-28).
  it('refuses a pooled handle used after its release', () => {
    const { writer, open } = seeded();
    const pool = poolReadConnections(open);
    const lent = pool.acquire();
    const kept = lent.db;
    lent.close();
    expect(() => kept.all(sql`SELECT a FROM t`)).toThrow(
      'a pooled read connection was used after its release',
    );
    const next = pool.acquire();
    expect(next.db.all<{ a: number }>(sql`SELECT a FROM t`)).toEqual([{ a: 1 }]);
    next.close();
    pool.close();
    writer.close();
  });

  // Proof: closing every released connection made this count { now: 0, ever: 2 }; with
  // `observeCommitted`'s rollback omitted, the connection was released inside its transaction,
  // closed, and a second opened ({ now: 1, ever: 2 }) (watched 2026-10-28).
  it('reuses a connection after a failed read and sees later commits', async () => {
    const { writer, opened, open } = seeded();
    const pool = poolReadConnections(open);
    const failed = await observeCommitted(
      () => pool.acquire(),
      (db) => {
        db.all(sql`SELECT a FROM t`);
        throw new Error('the read failed');
      },
    ).catch((cause: unknown) => cause);
    expect((failed as Error).message).toBe('the read failed');
    writer.run('INSERT INTO t VALUES (2)');
    const rows = await observeCommitted(
      () => pool.acquire(),
      (db) => db.all<{ a: number }>(sql`SELECT a FROM t ORDER BY a`),
    );
    expect(rows).toEqual([{ a: 1 }, { a: 2 }]);
    expect(opened).toEqual({ now: 1, ever: 1 });
    expect(checkpointed(writer)).toBe(true);
    pool.close();
    writer.close();
  });

  // Proof: rethrowing the read's failure alone lost the rollback's (watched 2026-10-28).
  it('reports a read failure and its failed rollback together', async () => {
    const { writer, opened, open } = seeded();
    const pool = poolReadConnections(open);
    const failure = await observeCommitted(
      () => pool.acquire(),
      (db) => {
        db.run(sql.raw('COMMIT'));
        throw new Error('the read failed');
      },
    ).catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(AggregateError);
    const [read, rollback] = (failure as AggregateError).errors as [Error, Error];
    expect(read.message).toBe('the read failed');
    expect(String(rollback.cause)).toContain('no transaction is active');
    expect(opened.now).toBe(1);
    pool.close();
    writer.close();
  });

  it('closes a connection released inside a transaction', () => {
    const { writer, opened, open } = seeded();
    const pool = poolReadConnections(open);
    const reader = pool.acquire();
    reader.db.run(sql.raw('BEGIN DEFERRED'));
    reader.db.all(sql`SELECT a FROM t`);
    writer.run('INSERT INTO t VALUES (2)');
    reader.close();
    expect(opened.now).toBe(0);
    expect(checkpointed(writer)).toBe(true);
    pool.close();
    writer.close();
  });

  // Proof: with the `idle.length >= idleLimit` test dropped, this counted three open
  // connections; with the `closed` test dropped, one stayed open after the pool closed
  // (watched 2026-10-28).
  it('keeps at most its idle limit, and nothing after it closed', () => {
    const { writer, opened, open } = seeded();
    const pool = poolReadConnections(open, 2);
    const lent = [pool.acquire(), pool.acquire(), pool.acquire()];
    for (const connection of lent) connection.close();
    expect(opened.now).toBe(2);
    const late = pool.acquire();
    pool.close();
    expect(opened.now).toBe(1);
    late.close();
    expect(opened.now).toBe(0);
    expect(() => pool.acquire()).toThrow('the read connection pool is closed');
    writer.close();
  });
});

describe('switchToWal', () => {
  /** A rival opener inside its first write: it holds the write lock on a file not yet in WAL. */
  function rivalHoldingTheWriteLock(lockMode: 'IMMEDIATE' | 'EXCLUSIVE' = 'IMMEDIATE'): {
    path: string;
    rival: Database;
  } {
    const path = join(dir, 'test.db');
    const rival = new Database(path, { create: true });
    rival.run(`BEGIN ${lockMode}`);
    return { path, rival };
  }

  function opening(path: string): Database {
    const db = new Database(path, { create: false, readwrite: true });
    db.run('PRAGMA busy_timeout = 5000;');
    return db;
  }

  it('waits out a rival that holds the write lock, which busy_timeout does not', () => {
    const { path, rival } = rivalHoldingTheWriteLock();
    const db = opening(path);
    try {
      // The mechanism itself: the plain pragma is refused at once despite busy_timeout.
      expect(() => db.run('PRAGMA journal_mode = WAL;')).toThrow(/database is locked/);
      const pauses: number[] = [];
      // Proof: 2026-09-29, with WAL_SWITCH_ATTEMPTS set to 1 this threw `database is locked`.
      switchToWal(db, (ms) => {
        pauses.push(ms);
        rival.run('COMMIT');
      });
      expect(pauses).toEqual([50]);
      expect(db.query('PRAGMA journal_mode;').get()).toEqual({ journal_mode: 'wal' });
      expect(db.query('PRAGMA busy_timeout;').get()).toEqual({ timeout: 5000 });
    } finally {
      db.close();
      rival.close();
    }
  });

  it('waits out WAL recovery reported as an extended busy error', () => {
    const { path, rival } = rivalHoldingTheWriteLock();
    const db = opening(path);
    const run = db.run.bind(db);
    // Inject the native extended code observed when two processes recover the WAL.
    // Keep the actual SQLite lock refusal and all successful pragma side effects.
    db.run = (...arguments_) => {
      try {
        return run(...arguments_);
      } catch (cause) {
        if (cause instanceof SQLiteError && cause.code === 'SQLITE_BUSY') {
          const recovery = Object.create(cause) as SQLiteError;
          Object.defineProperties(recovery, {
            code: { value: 'SQLITE_BUSY_RECOVERY' },
            errno: { value: 261 },
          });
          throw recovery;
        }
        throw cause;
      }
    };
    try {
      const pauses: number[] = [];
      // Proof: the base-only classifier threw the injected recovery refusal before this pause.
      switchToWal(db, (ms) => {
        pauses.push(ms);
        rival.run('COMMIT');
      });
      expect(pauses).toEqual([50]);
      expect(db.query('PRAGMA journal_mode;').get()).toEqual({ journal_mode: 'wal' });
      expect(db.query('PRAGMA busy_timeout;').get()).toEqual({ timeout: 5000 });
    } finally {
      db.close();
      rival.close();
    }
  });

  it('gives up with the lock error after 100 refused attempts', () => {
    const { path, rival } = rivalHoldingTheWriteLock();
    const db = opening(path);
    try {
      let pauses = 0;
      expect(() => {
        switchToWal(db, () => {
          pauses += 1;
        });
      }).toThrow(/database is locked/);
      expect(pauses).toBe(99);
    } finally {
      db.close();
      rival.run('ROLLBACK');
      rival.close();
    }
  });

  it('bounds an exclusive rival and restores the caller busy timeout', () => {
    const { path, rival } = rivalHoldingTheWriteLock('EXCLUSIVE');
    const db = opening(path);
    db.run('PRAGMA busy_timeout = 20;');
    try {
      let pauses = 0;
      const started = performance.now();
      // Proof: with the busy handler left at 20 ms, 100 attempts took about 2 s;
      // turning it off only for the switch keeps the wait inside the 99 pauses.
      expect(() => {
        switchToWal(db, () => {
          pauses += 1;
        });
      }).toThrow(/database is locked/);
      expect(performance.now() - started).toBeLessThan(1_000);
      expect(pauses).toBe(99);
      expect(db.query('PRAGMA busy_timeout;').get()).toEqual({ timeout: 20 });
    } finally {
      db.close();
      rival.run('ROLLBACK');
      rival.close();
    }
  });

  it('refuses a closed connection before any WAL attempt', () => {
    const db = new Database(':memory:');
    db.close();
    let pauses = 0;
    expect(() => {
      switchToWal(db, () => {
        pauses += 1;
      });
    }).toThrow();
    expect(pauses).toBe(0);
  });

  it('does not retry SQLITE_READONLY and restores the caller busy timeout', () => {
    const path = join(dir, 'readonly.db');
    const writer = new Database(path, { create: true });
    writer.run('CREATE TABLE readonly_probe (id INTEGER)');
    writer.close();
    const db = new Database(path, { readonly: true });
    db.run('PRAGMA busy_timeout = 1234;');
    try {
      let pauses = 0;
      let refusal: unknown = null;
      try {
        switchToWal(db, () => {
          pauses += 1;
        });
      } catch (cause) {
        refusal = cause;
      }
      if (!(refusal instanceof SQLiteError)) throw new Error('WAL did not refuse with SQLiteError');
      expect(refusal.code).toBe('SQLITE_READONLY');
      expect(pauses).toBe(0);
      expect(db.query('PRAGMA busy_timeout;').get()).toEqual({ timeout: 1234 });
    } finally {
      db.close();
    }
  });

  it('refuses an absent busy-timeout reading before changing the connection', () => {
    const unreadable = {
      query: () => ({ get: () => null }),
      run: () => {
        throw new Error('changed the connection before validating the timeout');
      },
    } as unknown as Database;
    expect(() => {
      switchToWal(unreadable);
    }).toThrow('SQLite did not report a valid busy timeout before the WAL switch');
  });
});
