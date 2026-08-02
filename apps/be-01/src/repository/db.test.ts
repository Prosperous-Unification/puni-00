import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { assertPragmas, openDatabase } from './db';

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

  it('assertPragmas throws when WAL is absent', () => {
    const db = openDatabase(join(dir, 'test.db'));
    db.run('PRAGMA journal_mode = DELETE;');
    expect(() => {
      assertPragmas(db);
    }).toThrow(/journal_mode/);
    db.close();
  });
});
