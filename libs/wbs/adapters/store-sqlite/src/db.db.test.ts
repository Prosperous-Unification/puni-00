import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- switchToWal is tested on a file not yet in WAL, which openDatabase would already have switched
import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { assertPragmas, openDatabase, switchToWal } from './db';

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

describe('switchToWal', () => {
  /** A rival opener inside its first write: it holds the write lock on a file not yet in WAL. */
  function rivalHoldingTheWriteLock(): { path: string; rival: Database } {
    const path = join(dir, 'test.db');
    const rival = new Database(path, { create: true });
    rival.run('BEGIN IMMEDIATE');
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

  it('throws any other error without retrying', () => {
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
});
