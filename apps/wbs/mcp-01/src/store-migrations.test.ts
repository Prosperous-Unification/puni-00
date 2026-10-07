import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database, SQLiteError } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';

import { type FamilyInput, McpSessionStore, switchToWal } from './session-store';
import {
  MCP_STORE_MIGRATIONS,
  migrateMcpStore,
  readCredentialEpoch,
  rollbackMcpStore,
} from './store-migrations';

const KEY = Buffer.alloc(32, 7);
const NOW = 1_000_000;
const BASELINE = '20260921090000_mcp_refresh_family';
const BINDING = '20260927120000_mcp_credential_binding';
const roots: string[] = [];

/** The exact constructor schema every store written before the ledger carries. */
const LEGACY_SCHEMA = `
CREATE TABLE IF NOT EXISTS mcp_family (family_id TEXT PRIMARY KEY, client_id TEXT NOT NULL, subject TEXT NOT NULL, scope TEXT NOT NULL, upstream_access_ct BLOB NOT NULL, upstream_refresh_ct BLOB, upstream_expires_at INTEGER NOT NULL, upstream_refreshed_at INTEGER, idle_expires_at INTEGER NOT NULL, absolute_expires_at INTEGER NOT NULL, revoked_at INTEGER, lease_owner TEXT, lease_until INTEGER, version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mcp_session (jti TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES mcp_family(family_id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mcp_refresh (token_digest BLOB PRIMARY KEY, family_id TEXT NOT NULL REFERENCES mcp_family(family_id) ON DELETE CASCADE, consumed_at INTEGER, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS mcp_session_family ON mcp_session(family_id);
CREATE INDEX IF NOT EXISTS mcp_refresh_family ON mcp_refresh(family_id);`;

/**
 * The dev mcp-01 store's `sqlite_master.sql`, verbatim, as read on 2026-09-27. SQLite drops
 * `IF NOT EXISTS` when it records DDL, so this is what a real pre-ledger store holds.
 */
const DEV_STORE_SCHEMA = [
  'CREATE TABLE mcp_family (family_id TEXT PRIMARY KEY, client_id TEXT NOT NULL, subject TEXT NOT NULL, scope TEXT NOT NULL, upstream_access_ct BLOB NOT NULL, upstream_refresh_ct BLOB, upstream_expires_at INTEGER NOT NULL, upstream_refreshed_at INTEGER, idle_expires_at INTEGER NOT NULL, absolute_expires_at INTEGER NOT NULL, revoked_at INTEGER, lease_owner TEXT, lease_until INTEGER, version INTEGER NOT NULL)',
  'CREATE TABLE mcp_refresh (token_digest BLOB PRIMARY KEY, family_id TEXT NOT NULL REFERENCES mcp_family(family_id) ON DELETE CASCADE, consumed_at INTEGER, expires_at INTEGER NOT NULL)',
  'CREATE INDEX mcp_refresh_family ON mcp_refresh(family_id)',
  'CREATE TABLE mcp_session (jti TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES mcp_family(family_id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)',
  'CREATE INDEX mcp_session_family ON mcp_session(family_id)',
] as const;

/** Orders DDL like `ORDER BY type, name`: indexes before tables, then by object name. */
function bySqliteMasterOrder(left: string, right: string): number {
  const key = (sql: string): string => sql.replace(/^CREATE (\w+) (\w+).*$/s, '$1 $2');
  return key(left).localeCompare(key(right));
}

function storePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'mcp-store-migrations-'));
  roots.push(root);
  return join(root, 'sessions.sqlite');
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function familyInput(familyId: string, binding?: FamilyInput['binding']): FamilyInput {
  return {
    familyId,
    clientId: 'client-1',
    subject: 'subject-1',
    scope: 'wbs:read',
    upstreamAccessToken: `${familyId}-access`,
    upstreamRefreshToken: `${familyId}-refresh`,
    upstreamExpiresAt: NOW + 60_000,
    idleExpiresAt: NOW + 120_000,
    absoluteExpiresAt: NOW + 240_000,
    ...(binding === undefined ? {} : { binding }),
  };
}

const BOUND = { organizationId: 'org-a', userId: 'user-1', issuer: 'https://idp.example/' };

function ledger(path: string): string[] {
  const db = new Database(path, { readonly: true });
  try {
    return db
      .query<{ name: string }, []>('SELECT name FROM mcp_migration ORDER BY name')
      .all()
      .map((row) => row.name);
  } finally {
    db.close();
  }
}

/** A store written by the pre-ledger constructor, holding one legacy family. */
function legacyStore(): string {
  const path = storePath();
  const db = new Database(path, { create: true, strict: true });
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- fixture DDL
  db.exec(LEGACY_SCHEMA);
  db.close();
  return path;
}

function withDb<T>(path: string, use: (db: Database) => T): T {
  const db = new Database(path, { strict: true });
  try {
    return use(db);
  } finally {
    db.close();
  }
}

describe('MCP store migrations', () => {
  it('creates an absent store at epoch 0 with both migrations recorded once', () => {
    const path = storePath();
    const store = new McpSessionStore(path, [KEY]);
    store.createFamily(familyInput('family-1'), 'session-1', NOW + 60_000, 'refresh-1');
    store.close();
    const reopened = new McpSessionStore(path, [KEY]);
    expect(reopened.familyForSession('session-1', NOW)?.credentialEpoch).toBe(0);
    reopened.close();
    expect(ledger(path)).toEqual([BASELINE, BINDING]);
    expect(withDb(path, readCredentialEpoch)).toBe(0);
  });

  it('adopts an exact legacy store and keeps its sessions and refresh tokens usable', () => {
    const scratch = storePath();
    const writer = new McpSessionStore(scratch, [KEY]);
    writer.createFamily(familyInput('legacy'), 'legacy-session', NOW + 60_000, 'legacy-refresh');
    writer.close();
    const path = legacyStore();
    withDb(path, (db) => {
      db.run(`ATTACH DATABASE '${scratch}' AS scratch`);
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- fixture copy of legacy rows
      db.exec(`
        INSERT INTO mcp_family SELECT family_id, client_id, subject, scope, upstream_access_ct,
          upstream_refresh_ct, upstream_expires_at, upstream_refreshed_at, idle_expires_at,
          absolute_expires_at, revoked_at, lease_owner, lease_until, version
          FROM scratch.mcp_family;
        INSERT INTO mcp_session SELECT jti, family_id, expires_at FROM scratch.mcp_session;
        INSERT INTO mcp_refresh SELECT * FROM scratch.mcp_refresh;`);
      db.run('DETACH DATABASE scratch');
    });
    const store = new McpSessionStore(path, [KEY]);
    expect(ledger(path)).toEqual([BASELINE, BINDING]);
    const legacy = store.familyForSession('legacy-session', NOW);
    expect(legacy?.upstreamAccessToken).toBe('legacy-access');
    expect(legacy?.upstreamRefreshToken).toBe('legacy-refresh');
    expect(
      store.consumeRefresh(
        'legacy-refresh',
        'client-1',
        'legacy-successor',
        'legacy-session-2',
        NOW + 60_000,
        NOW + 120_000,
        NOW,
      ).outcome,
    ).toBe('ok');
    expect(store.familyForSession('legacy-session-2', NOW)?.credentialEpoch).toBe(0);
    store.close();
  });

  it('adopts the dev store schema read from its sqlite_master on 2026-09-27', () => {
    const path = storePath();
    withDb(path, (db) => {
      for (const statement of DEV_STORE_SCHEMA) db.run(statement);
      expect(
        db
          .query<{ sql: string }, []>(
            'SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name',
          )
          .all()
          .map((row) => row.sql),
      ).toEqual([...DEV_STORE_SCHEMA].sort(bySqliteMasterOrder));
    });
    new McpSessionStore(path, [KEY]).close();
    expect(ledger(path)).toEqual([BASELINE, BINDING]);
  });

  it.each([
    ['a missing table', 'DROP TABLE mcp_refresh'],
    [
      'an unconstrained epoch table',
      `DROP TABLE mcp_credential_epoch;
       CREATE TABLE mcp_credential_epoch (singleton INTEGER PRIMARY KEY, epoch INTEGER);
       INSERT INTO mcp_credential_epoch VALUES (1, 0);`,
    ],
  ])('refuses a ledgered store whose schema drifted: %s', (_label, drift) => {
    const path = storePath();
    new McpSessionStore(path, [KEY]).close();
    withDb(path, (db) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- fault injection
      db.exec(drift);
    });
    expect(() => new McpSessionStore(path, [KEY])).toThrow(/schema differs from the migrations/);
  });

  it('refuses a partial pre-ledger store', () => {
    const path = storePath();
    withDb(path, (db) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- fixture DDL
      db.exec(
        LEGACY_SCHEMA.replace(/CREATE TABLE IF NOT EXISTS mcp_refresh[^;]*;/, '').replace(
          /CREATE INDEX IF NOT EXISTS mcp_refresh_family[^;]*;/,
          '',
        ),
      );
    });
    expect(() => new McpSessionStore(path, [KEY])).toThrow(/not exactly the baseline/);
  });

  it('refuses a pre-ledger store with an extra object', () => {
    const path = legacyStore();
    withDb(path, (db) => db.run('CREATE INDEX extra ON mcp_family(subject)'));
    expect(() => new McpSessionStore(path, [KEY])).toThrow(/not exactly the baseline/);
  });

  it.each([
    [
      'zero-byte',
      (path: string) => {
        writeFileSync(path, '');
      },
    ],
    [
      'empty-schema',
      (path: string) => {
        const db = new Database(path, { create: true });
        db.run('PRAGMA user_version = 1');
        db.close();
      },
    ],
  ])('refuses an existing %s file instead of initializing it', (_label, prepare) => {
    const path = storePath();
    prepare(path);
    expect(() => new McpSessionStore(path, [KEY])).toThrow(/exists but is empty/);
    expect(withDb(path, (db) => db.query('SELECT COUNT(*) AS n FROM sqlite_master').get())).toEqual(
      { n: 0 },
    );
  });

  it('refuses an unreadable store', () => {
    const path = legacyStore();
    chmodSync(path, 0o000);
    try {
      expect(() => new McpSessionStore(path, [KEY])).toThrow(/MCP_STORE_PATH/);
    } finally {
      chmodSync(path, 0o600);
    }
  });

  it('applies nothing and records nothing when a migration fails midway', () => {
    const path = legacyStore();
    const [baseline] = MCP_STORE_MIGRATIONS;
    const broken = [
      baseline,
      {
        name: BINDING,
        up: 'ALTER TABLE mcp_family ADD COLUMN probe TEXT; SELECT * FROM missing_table;',
        down: '',
      },
    ];
    withDb(path, (db) => {
      expect(() => {
        migrateMcpStore(db, false, broken);
      }).toThrow(/missing_table/);
      expect(
        db.query("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'mcp_migration'").get(),
      ).toEqual({ n: 0 });
      expect(
        db
          .query<{ name: string }, []>("SELECT name FROM pragma_table_info('mcp_family')")
          .all()
          .map((c) => c.name),
      ).not.toContain('probe');
    });
  });

  it('refuses edited SQL and unknown history', () => {
    const path = storePath();
    new McpSessionStore(path, [KEY]).close();
    const [baseline, binding] = MCP_STORE_MIGRATIONS;
    withDb(path, (db) => {
      expect(() => {
        migrateMcpStore(db, false, [baseline, { ...binding, up: `${binding.up}\n` }]);
      }).toThrow(/edited after it was applied/);
      expect(() => {
        migrateMcpStore(db, false, [baseline]);
      }).toThrow(/not a prefix/);
    });
  });

  it('applies each migration once when two processes start on one absent store', async () => {
    const path = storePath();
    const script = join(path, '..', 'start.ts');
    writeFileSync(
      script,
      `import { McpSessionStore } from ${JSON.stringify(join(import.meta.dir, 'session-store.ts'))};
      try { new McpSessionStore(process.argv[2], [Buffer.alloc(32, 7)]).close(); console.log('opened'); }
      catch (error) { console.log('refused', String(error)); }`,
    );
    const starts = [0, 1].map(() =>
      Bun.spawn(['bun', script, path], { stdout: 'pipe', stderr: 'pipe' }),
    );
    const outputs = await Promise.all(starts.map((start) => new Response(start.stdout).text()));
    // The rival of the start that created the file may refuse it as empty, but the creator must
    // open. `database is locked` is no longer an accepted refusal: it was the WAL switch refusing
    // the creator, which then left both starts refused and the store an empty file (switchToWal).
    expect(outputs, outputs.join('\n')).toSatisfy((all) =>
      all.some((output) => output.startsWith('opened')),
    );
    for (const output of outputs) expect(output).toMatch(/^opened|^refused.*exists but is empty/);
    new McpSessionStore(path, [KEY]).close();
    expect(ledger(path)).toEqual([BASELINE, BINDING]);
  });

  it('lets the creator finish migration after a transient WAL SQLITE_BUSY', async () => {
    const path = storePath();
    const script = join(path, '..', 'busy-start.ts');
    writeFileSync(
      script,
      `import { Database } from 'bun:sqlite';
       const originalRun = Database.prototype.run;
       let injected = false;
       Database.prototype.run = function (sql, ...parameters) {
         if (!injected && sql === 'PRAGMA journal_mode = WAL') {
           injected = true;
           throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
         }
         return originalRun.call(this, sql, ...parameters);
       };
       const { McpSessionStore } = await import(${JSON.stringify(join(import.meta.dir, 'session-store.ts'))});
       new McpSessionStore(process.argv[2], [Buffer.alloc(32, 7)]).close();
       console.log('opened');`,
    );
    const start = Bun.spawn(['bun', script, path], { stdout: 'pipe', stderr: 'pipe' });
    const [output, failure, exitCode] = await Promise.all([
      new Response(start.stdout).text(),
      new Response(start.stderr).text(),
      start.exited,
    ]);
    expect({ exitCode, output, failure }).toEqual({ exitCode: 0, output: 'opened\n', failure: '' });
    expect(ledger(path)).toEqual([BASELINE, BINDING]);
  });

  it('stops retrying a persistent WAL SQLITE_BUSY within its deadline', async () => {
    const path = storePath();
    const script = join(path, '..', 'busy-deadline.ts');
    writeFileSync(
      script,
      `import { Database } from 'bun:sqlite';
       let ticks = 0;
       performance.now = () => ++ticks * 1000;
       const originalRun = Database.prototype.run;
       let attempts = 0;
       Database.prototype.run = function (sql, ...parameters) {
         if (sql === 'PRAGMA journal_mode = WAL') {
           attempts += 1;
           throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
         }
         return originalRun.call(this, sql, ...parameters);
       };
       const { McpSessionStore } = await import(${JSON.stringify(join(import.meta.dir, 'session-store.ts'))});
       try { new McpSessionStore(process.argv[2], [Buffer.alloc(32, 7)]).close(); console.log('opened'); }
       catch (error) { console.log(JSON.stringify({ attempts, code: error.cause?.code })); }`,
    );
    const start = Bun.spawn(['bun', script, path], { stdout: 'pipe', stderr: 'pipe' });
    const [output, failure, exitCode] = await Promise.all([
      new Response(start.stdout).text(),
      new Response(start.stderr).text(),
      start.exited,
    ]);
    expect(failure).toBe('');
    expect(exitCode).toBe(0);
    const refusal: unknown = JSON.parse(output);
    if (
      typeof refusal !== 'object' ||
      refusal === null ||
      !('attempts' in refusal) ||
      typeof refusal.attempts !== 'number' ||
      !('code' in refusal)
    )
      throw new Error('WAL retry outcome is missing');
    expect(refusal.code).toBe('SQLITE_BUSY');
    expect(refusal.attempts).toBeGreaterThan(1);
    expect(refusal.attempts).toBeLessThan(12);
  });

  it('does not retry WAL SQLITE_BUSY for a pre-existing empty file', async () => {
    const path = storePath();
    writeFileSync(path, '');
    const script = join(path, '..', 'existing-busy.ts');
    writeFileSync(
      script,
      `import { Database } from 'bun:sqlite';
       const originalRun = Database.prototype.run;
       let attempts = 0;
       Database.prototype.run = function (sql, ...parameters) {
         if (sql === 'PRAGMA journal_mode = WAL') {
           attempts += 1;
           if (attempts === 1) throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
         }
         return originalRun.call(this, sql, ...parameters);
       };
       const { McpSessionStore } = await import(${JSON.stringify(join(import.meta.dir, 'session-store.ts'))});
       try { new McpSessionStore(process.argv[2], [Buffer.alloc(32, 7)]).close(); console.log('opened'); }
       catch (error) { console.log(JSON.stringify({ attempts, code: error.cause?.code })); }`,
    );
    const start = Bun.spawn(['bun', script, path], { stdout: 'pipe', stderr: 'pipe' });
    const [output, failure, exitCode] = await Promise.all([
      new Response(start.stdout).text(),
      new Response(start.stderr).text(),
      start.exited,
    ]);
    expect({ exitCode, output, failure }).toEqual({
      exitCode: 0,
      output: '{"attempts":1,"code":"SQLITE_BUSY"}\n',
      failure: '',
    });
    expect(withDb(path, (db) => db.query('SELECT COUNT(*) AS n FROM sqlite_master').get())).toEqual(
      { n: 0 },
    );
  });
});

describe('switchToWal', () => {
  /** A rival start inside its migration: it holds the write lock on a store not yet in WAL. */
  function rivalHoldingTheWriteLock(lockMode: 'IMMEDIATE' | 'EXCLUSIVE' = 'IMMEDIATE'): {
    path: string;
    rival: Database;
  } {
    const path = storePath();
    writeFileSync(path, '');
    const rival = new Database(path, { strict: true });
    rival.run(`BEGIN ${lockMode}`);
    return { path, rival };
  }

  function starting(path: string): Database {
    const db = new Database(path, { create: false, readwrite: true, strict: true });
    db.run('PRAGMA busy_timeout = 5000');
    return db;
  }

  it('waits out a rival that holds the write lock, which busy_timeout does not', () => {
    const { path, rival } = rivalHoldingTheWriteLock();
    const db = starting(path);
    try {
      // The mechanism itself: the plain pragma is refused at once despite busy_timeout.
      expect(() => db.run('PRAGMA journal_mode = WAL')).toThrow(/database is locked/);
      const pauses: number[] = [];
      // Proof: 2026-09-29, with the retry removed (a single attempt) this threw `database is
      // locked`; under 24 CPU hogs the two-process start then ended with both starts refused.
      switchToWal(db, (ms) => {
        pauses.push(ms);
        rival.run('COMMIT');
      });
      expect(pauses).toEqual([50]);
      expect(db.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
      expect(db.query('PRAGMA busy_timeout').get()).toEqual({ timeout: 5000 });
    } finally {
      db.close();
      rival.close();
    }
  });

  it('gives up with the lock error after 100 refused attempts', () => {
    const { path, rival } = rivalHoldingTheWriteLock();
    const db = starting(path);
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
    const db = starting(path);
    db.run('PRAGMA busy_timeout = 20');
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
      expect(db.query('PRAGMA busy_timeout').get()).toEqual({ timeout: 20 });
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
    const path = storePath();
    const writer = new Database(path, { create: true });
    writer.run('CREATE TABLE readonly_probe (id INTEGER)');
    writer.close();
    const db = new Database(path, { readonly: true });
    db.run('PRAGMA busy_timeout = 1234');
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
      expect(db.query('PRAGMA busy_timeout').get()).toEqual({ timeout: 1234 });
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

describe('MCP credential bindings', () => {
  function freshStore() {
    const path = storePath();
    return { path, store: new McpSessionStore(path, [KEY]) };
  }

  it('stores a complete binding and copies it to every session of the family', () => {
    const { path, store } = freshStore();
    store.createFamily(familyInput('family-1', BOUND), 'session-1', NOW + 60_000, 'refresh-1');
    store.consumeRefresh(
      'refresh-1',
      'client-1',
      'refresh-2',
      'session-2',
      NOW + 60_000,
      NOW + 120_000,
      NOW,
    );
    expect(store.familyForSession('session-2', NOW)?.binding).toEqual(BOUND);
    store.close();
    expect(
      withDb(path, (db) =>
        db
          .query(
            'SELECT DISTINCT organization_id, user_id, issuer, credential_epoch FROM mcp_session',
          )
          .all(),
      ),
    ).toEqual([
      {
        organization_id: 'org-a',
        user_id: 'user-1',
        issuer: 'https://idp.example/',
        credential_epoch: 0,
      },
    ]);
  });

  it.each([
    [
      'partial family binding',
      "INSERT INTO mcp_family (family_id, client_id, subject, scope, upstream_access_ct, upstream_expires_at, idle_expires_at, absolute_expires_at, version, organization_id) VALUES ('f2', 'c', 's', 'x', x'00', 1, 2, 3, 0, 'org-a')",
      /CHECK constraint failed/,
    ],
    [
      'empty family binding',
      "INSERT INTO mcp_family (family_id, client_id, subject, scope, upstream_access_ct, upstream_expires_at, idle_expires_at, absolute_expires_at, version, organization_id, user_id, issuer) VALUES ('f2', 'c', 's', 'x', x'00', 1, 2, 3, 0, '', 'u', 'i')",
      /CHECK constraint failed/,
    ],
    [
      'family without organization',
      "INSERT INTO mcp_family (family_id, client_id, subject, scope, upstream_access_ct, upstream_expires_at, idle_expires_at, absolute_expires_at, version, user_id, issuer) VALUES ('f2', 'c', 's', 'x', x'00', 1, 2, 3, 0, 'u', 'i')",
      /CHECK constraint failed/,
    ],
    [
      'session unlike its family',
      "INSERT INTO mcp_session (jti, family_id, expires_at, organization_id, user_id, issuer) VALUES ('s2', 'family-1', 1, 'org-b', 'user-1', 'https://idp.example/')",
      /mcp_session binding must equal/,
    ],
    [
      'unbound session of a bound family',
      "INSERT INTO mcp_session (jti, family_id, expires_at) VALUES ('s2', 'family-1', 1)",
      /mcp_session binding must equal/,
    ],
    [
      'family at a future epoch',
      "INSERT INTO mcp_family (family_id, client_id, subject, scope, upstream_access_ct, upstream_expires_at, idle_expires_at, absolute_expires_at, version, organization_id, user_id, issuer, credential_epoch) VALUES ('f2', 'c', 's', 'x', x'00', 1, 2, 3, 0, 'o', 'u', 'i', 1)",
      /must equal the durable epoch/,
    ],
    [
      'changed family binding',
      "UPDATE mcp_family SET organization_id = 'org-b'",
      /mcp_family binding is immutable/,
    ],
    [
      'changed session binding',
      "UPDATE mcp_session SET user_id = 'user-2'",
      /mcp_session binding is immutable/,
    ],
    ['deleted epoch', 'DELETE FROM mcp_credential_epoch', /cannot be deleted/],
    [
      'decreased epoch',
      'UPDATE mcp_credential_epoch SET epoch = 1; UPDATE mcp_credential_epoch SET epoch = 0',
      /cannot decrease/,
    ],
    [
      'replaced epoch',
      'UPDATE mcp_credential_epoch SET epoch = 1; INSERT OR REPLACE INTO mcp_credential_epoch VALUES (1, 0)',
      /seeded once/,
    ],
  ])('rejects a %s', (_label, statement, message) => {
    const { path, store } = freshStore();
    store.createFamily(familyInput('family-1', BOUND), 'session-1', NOW + 60_000, 'refresh-1');
    store.close();
    withDb(path, (db) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- fault injection
      expect(() => db.exec(statement)).toThrow(message);
    });
  });

  it('refuses to refresh a family issued before the epoch advanced', () => {
    const { path, store } = freshStore();
    store.createFamily(familyInput('family-1'), 'session-1', NOW + 60_000, 'refresh-1');
    withDb(path, (db) => db.run('UPDATE mcp_credential_epoch SET epoch = 1'));
    expect(() =>
      store.consumeRefresh(
        'refresh-1',
        'client-1',
        'refresh-2',
        'session-2',
        NOW + 60_000,
        NOW + 120_000,
        NOW,
      ),
    ).toThrow(/mcp_session binding must equal its family and the durable epoch/);
    expect(store.familyForSession('session-2', NOW)).toBeNull();
    store.close();
  });

  it('refuses unbound issuance once the epoch has advanced', () => {
    const { path, store } = freshStore();
    withDb(path, (db) => db.run('UPDATE mcp_credential_epoch SET epoch = 1'));
    expect(() => {
      store.createFamily(familyInput('family-1'), 'session-1', NOW + 60_000, 'refresh-1');
    }).toThrow(/CHECK constraint failed/);
    store.close();
  });
});

describe('MCP credential epoch at startup', () => {
  function migrated(): string {
    const path = storePath();
    new McpSessionStore(path, [KEY]).close();
    return path;
  }

  it.each([
    ['missing table', 'DROP TABLE mcp_credential_epoch', /schema differs from the migrations/],
    [
      'missing row',
      'DROP TRIGGER mcp_credential_epoch_no_delete; DELETE FROM mcp_credential_epoch',
      /credential epoch is missing or malformed/,
    ],
    [
      'malformed value',
      "PRAGMA ignore_check_constraints = ON; UPDATE mcp_credential_epoch SET epoch = 'zero'",
      /credential epoch is missing or malformed/,
    ],
    ['unsupported epoch', 'UPDATE mcp_credential_epoch SET epoch = 1', /epoch 1 needs/],
  ])('refuses startup on a %s without reseeding', (_label, fault, message) => {
    const path = migrated();
    withDb(path, (db) => {
      const triggers = db
        .query<{ sql: string }, []>(
          "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'mcp_credential_epoch'",
        )
        .all();
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- fault injection
      db.exec(fault);
      // Restore any guard the fault had to lift, so only the injected state differs.
      for (const { sql } of triggers) {
        const name = /TRIGGER (\w+)/.exec(sql)?.[1] ?? '';
        const present = db
          .query<{ n: number }, [string]>('SELECT COUNT(*) AS n FROM sqlite_master WHERE name = ?')
          .get(name)?.n;
        if (present === 0 && fault !== 'DROP TABLE mcp_credential_epoch') db.run(sql);
      }
    });
    const before = withDb(path, (db) =>
      db.query("SELECT sql FROM sqlite_master WHERE name = 'mcp_credential_epoch'").all(),
    );
    expect(() => new McpSessionStore(path, [KEY])).toThrow(message);
    expect(
      withDb(path, (db) =>
        db.query("SELECT sql FROM sqlite_master WHERE name = 'mcp_credential_epoch'").all(),
      ),
    ).toEqual(before);
  });
});

describe('readCredentialEpoch', () => {
  it('refuses an unreadable epoch table instead of defaulting it', () => {
    const db = new Database(':memory:');
    expect(() => readCredentialEpoch(db)).toThrow(/credential epoch is unreadable/);
    db.close();
  });
});

describe('MCP store rollback', () => {
  function bound(expiry: 'live' | 'expired', sessions: 'with' | 'without') {
    const path = storePath();
    const store = new McpSessionStore(path, [KEY]);
    store.createFamily(familyInput('legacy'), 'legacy-session', NOW + 60_000, 'legacy-refresh');
    store.createFamily(familyInput('bound', BOUND), 'bound-session', NOW + 60_000, 'bound-refresh');
    if (sessions === 'without') store.endSession('bound-session');
    store.close();
    return { path, at: expiry === 'live' ? NOW : NOW + 1_000_000 };
  }

  it('refuses while a bound family without sessions can still refresh', () => {
    const { path, at } = bound('live', 'without');
    withDb(path, (db) => {
      expect(() => rollbackMcpStore(db, BASELINE, at)).toThrow(/1 usable bound families/);
      expect(ledger(path)).toEqual([BASELINE, BINDING]);
    });
  });

  it('refuses while a bound session is live', () => {
    const { path } = bound('live', 'with');
    withDb(path, (db) => {
      db.run("UPDATE mcp_family SET idle_expires_at = 0 WHERE family_id = 'bound'");
      expect(() => rollbackMcpStore(db, BASELINE, NOW)).toThrow(/1 live bound sessions/);
    });
  });

  it('refuses at an advanced epoch', () => {
    const { path, at } = bound('expired', 'with');
    withDb(path, (db) => {
      db.run('UPDATE mcp_credential_epoch SET epoch = 1');
      expect(() => rollbackMcpStore(db, BASELINE, at)).toThrow(/credential epoch is 1/);
    });
  });

  it('purges dead bound credentials, preserves legacy ones and reaches the baseline', () => {
    const { path, at } = bound('expired', 'with');
    withDb(path, (db) => {
      expect(rollbackMcpStore(db, BASELINE, at)).toEqual([BINDING]);
      expect(db.query('SELECT family_id FROM mcp_family').all()).toEqual([{ family_id: 'legacy' }]);
      expect(db.query('SELECT jti FROM mcp_session').all()).toEqual([{ jti: 'legacy-session' }]);
      expect(db.query('SELECT family_id FROM mcp_refresh').all()).toEqual([
        { family_id: 'legacy' },
      ]);
      expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
    });
    expect(ledger(path)).toEqual([BASELINE]);
    const reopened = new McpSessionStore(path, [KEY]);
    expect(reopened.familyForSession('legacy-session', NOW)?.familyId).toBe('legacy');
    reopened.close();
  });
});
