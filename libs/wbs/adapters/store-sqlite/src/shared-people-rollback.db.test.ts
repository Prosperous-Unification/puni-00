import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import * as database from './db';
import { type Connection, type Drizzle, openConnection, openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import * as rankBackup from './project-rank-rollback';
import { organization } from './schema';
import {
  removeSharedPeople,
  restoreSharedPeople,
  saveSharedPeople,
} from './shared-people-rollback';
import { MIGRATIONS_FOLDER, openSpaceDatabase } from './testing/space-database';

let directory: string;
let path: string;
let connection: Connection;
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-shared-rollback-'));
  path = await openSpaceDatabase(directory);
  connection = openConnection(path);
  execute(
    "INSERT INTO project_rank (project_id, organization_id, position, created_at, updated_at, created_by) VALUES ('a1','org-a',3,1,2,'ada'),('b1','org-b',7,4,NULL,'ada')",
  );
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
function execute(statement: string) {
  const db = openDatabase(path);
  try {
    return db.query(statement).all();
  } finally {
    db.close();
  }
}
const save = () => saveSharedPeople(path);
const organizationRows = () => execute('SELECT * FROM organization ORDER BY id');
const ranks = () => execute('SELECT * FROM project_rank ORDER BY project_id');

describe('combined shared people recovery', () => {
  it('saves every organization mode including isolated, and every rank column, deterministically', () => {
    execute("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const saved = save();
    expect(saved).toEqual({
      format: 'shared-people-save',
      version: 1,
      organizations: [
        { organizationId: 'org-a', mode: 'shared' },
        { organizationId: 'org-b', mode: 'isolated' },
      ],
      ranks: [
        {
          projectId: 'a1',
          organizationId: 'org-a',
          position: 3,
          createdAt: 1,
          updatedAt: 2,
          createdBy: 'ada',
        },
        {
          projectId: 'b1',
          organizationId: 'org-b',
          position: 7,
          createdAt: 4,
          updatedAt: null,
          createdBy: 'ada',
        },
      ],
    });
    expect(JSON.stringify(save())).toBe(JSON.stringify(saved));
  });

  it('refuses an injected write on the dedicated save connection', () => {
    const readRanks = rankBackup.saveProjectRanks;
    const intercepted = spyOn(rankBackup, 'saveProjectRanks').mockImplementation((db) => {
      // Deliberately violate the reader capability to prove the physical connection is read-only.
      (db as Drizzle).update(organization).set({ name: 'unsafe' }).run();
      return readRanks(db);
    });
    try {
      expect(() => save()).toThrow('Failed query');
    } finally {
      intercepted.mockRestore();
    }
    expect(execute("SELECT name FROM organization WHERE id='org-a'")).toEqual([{ name: 'A' }]);
  });

  it('closes the dedicated save connection when a snapshot read throws', () => {
    const open = database.openReadOnlyConnection;
    let closes = 0;
    const opener = spyOn(database, 'openReadOnlyConnection').mockImplementation((dbPath) => {
      const snapshot = open(dbPath);
      return {
        ...snapshot,
        close() {
          closes++;
          snapshot.close();
        },
      };
    });
    const reader = spyOn(rankBackup, 'saveProjectRanks').mockImplementation(() => {
      throw new Error('injected rank read');
    });
    try {
      expect(() => save()).toThrow('injected rank read');
      expect(closes).toBe(1);
    } finally {
      reader.mockRestore();
      opener.mockRestore();
    }
  });

  it('captures mode and rank from one snapshot during a concurrent combined edit', () => {
    const readRanks = rankBackup.saveProjectRanks;
    const intercepted = spyOn(rankBackup, 'saveProjectRanks').mockImplementation((db) => {
      const writer = openDatabase(path);
      try {
        writer.run(
          "BEGIN IMMEDIATE; UPDATE organization SET shared_people=1 WHERE id='org-a'; UPDATE project_rank SET position=99 WHERE project_id='a1'; COMMIT;",
        );
      } finally {
        writer.close();
      }
      return readRanks(db);
    });
    try {
      const saved = save();
      expect(saved.organizations[0]?.mode).toBe('isolated');
      expect(saved.ranks[0]?.position).toBe(3);
    } finally {
      intercepted.mockRestore();
    }
    expect(save().organizations[0]?.mode).toBe('shared');
    expect(save().ranks[0]?.position).toBe(99);
  });

  for (const [label, changed] of [
    ['mode', "UPDATE organization SET shared_people=1 WHERE id='org-a'"],
    ['rank', "UPDATE project_rank SET position=99 WHERE project_id='a1'"],
    ['organization identity', "INSERT INTO organization(id,name,created_at) VALUES('org-c','C',1)"],
  ]) {
    it(`refuses a stale ${label} change without mutation`, () => {
      const saved = save();
      execute(changed);
      const before = save();
      expect(() => removeSharedPeople(connection.db, saved, 101)).toThrow('does not match');
      expect(save()).toEqual(before);
    });
  }

  it('removes modes and ranks together then permits guarded downgrade', () => {
    execute("UPDATE organization SET shared_people=1 WHERE id='org-a'");
    const saved = save();
    expect(removeSharedPeople(connection.db, saved, 101)).toEqual({ organizations: 2, ranks: 2 });
    expect(save().organizations.every((each) => each.mode === 'isolated')).toBe(true);
    expect(ranks()).toEqual([]);
    expect(
      rollbackTo(path, MIGRATIONS_FOLDER, '20261001010000_add_browser_credential_revocations'),
    ).toEqual(['20261005110000_add_shared_people']);
    runMigrations(path, MIGRATIONS_FOLDER);
    expect(() => restoreSharedPeople(connection.db, saved, 202)).toThrow(
      'unsupported capacity mode shared',
    );
    expect(ranks()).toEqual([]);
  });

  it('rolls back a late remove failure including already deleted ranks and cleared modes', () => {
    execute("UPDATE organization SET shared_people=1 WHERE id='org-a'");
    const saved = save();
    execute(
      "CREATE TRIGGER refuse_mode BEFORE UPDATE OF shared_people ON organization WHEN OLD.id='org-b' BEGIN SELECT RAISE(ABORT,'injected mode write'); END;",
    );
    const beforeOrganizations = organizationRows();
    expect(() => removeSharedPeople(connection.db, saved, 101)).toThrow('Failed query');
    expect(save()).toEqual(saved);
    expect(organizationRows()).toEqual(beforeOrganizations);
  });

  it('restores isolated state exactly after removing it', () => {
    const saved = save();
    removeSharedPeople(connection.db, saved, 101);
    expect(restoreSharedPeople(connection.db, JSON.parse(JSON.stringify(saved)), 202)).toEqual({
      organizations: 2,
      ranks: 2,
    });
    expect(save()).toEqual(saved);
  });

  it('stamps partial organization recovery at the supplied instants while preserving rank history', () => {
    const saved = save();
    const historicalRanks = ranks();
    removeSharedPeople(connection.db, saved, 101);
    expect(execute('SELECT id,updated_at FROM organization ORDER BY id')).toEqual([
      { id: 'org-a', updated_at: 101 },
      { id: 'org-b', updated_at: 101 },
    ]);
    restoreSharedPeople(connection.db, saved, 202);
    expect(execute('SELECT id,updated_at FROM organization ORDER BY id')).toEqual([
      { id: 'org-a', updated_at: 202 },
      { id: 'org-b', updated_at: 202 },
    ]);
    expect(ranks()).toEqual(historicalRanks);
  });

  it('rejects shared restoration before the first write on this isolated-only release', () => {
    execute("UPDATE organization SET shared_people=1 WHERE id='org-a'");
    const saved = save();
    removeSharedPeople(connection.db, saved, 101);
    execute(
      "CREATE TRIGGER observe_restore BEFORE UPDATE OF shared_people ON organization BEGIN SELECT RAISE(ABORT,'restore mutated before refusing'); END;",
    );
    const before = save();
    expect(() => restoreSharedPeople(connection.db, saved, 202)).toThrow(
      'unsupported capacity mode shared',
    );
    expect(save()).toEqual(before);
  });

  it('leaves additional isolated organizations untouched during restore', () => {
    const saved = save();
    removeSharedPeople(connection.db, saved, 101);
    execute("INSERT INTO organization(id,name,created_at) VALUES('org-c','C',1)");
    const extra = execute("SELECT * FROM organization WHERE id='org-c'");
    expect(restoreSharedPeople(connection.db, saved, 202)).toEqual({ organizations: 2, ranks: 2 });
    expect(execute("SELECT * FROM organization WHERE id='org-c'")).toEqual(extra);
    expect(save()).toEqual({
      ...saved,
      organizations: [...saved.organizations, { organizationId: 'org-c', mode: 'isolated' }],
    });
  });

  it('refuses an additional shared organization without modifying saved organizations or ranks', () => {
    const saved = save();
    removeSharedPeople(connection.db, saved, 101);
    execute("INSERT INTO organization(id,name,created_at,shared_people) VALUES('org-c','C',1,1)");
    const before = save();
    expect(() => restoreSharedPeople(connection.db, saved, 202)).toThrow(
      'isolated modes and no ranks',
    );
    expect(save()).toEqual(before);
  });

  it('refuses a missing saved organization before restoring any state', () => {
    const saved = save();
    removeSharedPeople(connection.db, saved, 101);
    const writer = openDatabase(path);
    try {
      writer.run("PRAGMA foreign_keys=OFF; DELETE FROM organization WHERE id='org-b'");
    } finally {
      writer.close();
    }
    const before = save();
    expect(() => restoreSharedPeople(connection.db, saved, 202)).toThrow(
      'saved organization org-b is missing',
    );
    expect(save()).toEqual(before);
  });

  it('refuses restore into nonempty ranks or shared current modes', () => {
    const saved = save();
    removeSharedPeople(connection.db, saved, 101);
    execute("UPDATE organization SET shared_people=1 WHERE id='org-a'");
    expect(() => restoreSharedPeople(connection.db, saved, 202)).toThrow(
      'isolated modes and no ranks',
    );
    execute("UPDATE organization SET shared_people=0 WHERE id='org-a'");
    execute(
      "INSERT INTO project_rank(project_id,organization_id,position,created_at,created_by) VALUES('a2','org-a',1,1,'ada')",
    );
    expect(() => restoreSharedPeople(connection.db, saved, 202)).toThrow(
      'isolated modes and no ranks',
    );
    expect(ranks()).toHaveLength(1);
  });

  it('restores all or none when a later rank write fails', () => {
    const saved = save();
    removeSharedPeople(connection.db, saved, 101);
    execute(
      "CREATE TRIGGER refuse_rank BEFORE INSERT ON project_rank WHEN NEW.project_id='b1' BEGIN SELECT RAISE(ABORT,'injected rank write'); END;",
    );
    const beforeOrganizations = organizationRows();
    expect(() => restoreSharedPeople(connection.db, saved, 202)).toThrow('Failed query');
    expect(organizationRows()).toEqual(beforeOrganizations);
    expect(ranks()).toEqual([]);
    expect(save().organizations.every((each) => each.mode === 'isolated')).toBe(true);
  });

  it('locks restore eligibility against a concurrent write before restoring ranks', () => {
    const saved = save();
    removeSharedPeople(connection.db, saved, 101);
    const before = save();
    const restoreRanks = rankBackup.restoreProjectRanks;
    const intercepted = spyOn(rankBackup, 'restoreProjectRanks').mockImplementation((db, ranks) => {
      const writer = openDatabase(path);
      try {
        writer.run(
          "PRAGMA busy_timeout=0; UPDATE organization SET shared_people=1 WHERE id='org-a'",
        );
        return restoreRanks(db, ranks);
      } finally {
        writer.close();
      }
    });
    try {
      expect(() => restoreSharedPeople(connection.db, saved, 202)).toThrow('database is locked');
      expect(save()).toEqual(before);
    } finally {
      intercepted.mockRestore();
    }
  });

  it('refuses malformed and duplicate complete-state backups before any mutation', () => {
    const saved = save();
    const malformed: unknown[] = [
      { ...saved, version: 2 },
      { ...saved, extra: true },
      { ...saved, organizations: [...saved.organizations, saved.organizations[0]] },
      { ...saved, organizations: [{ organizationId: 'org-a', mode: 'unsupported' }] },
      { ...saved, ranks: [...saved.ranks, saved.ranks[0]] },
      { ...saved, ranks: [{ ...saved.ranks[0], createdBy: '' }] },
    ];
    for (const invalid of malformed) {
      expect(() => removeSharedPeople(connection.db, invalid, 101)).toThrow('invalid');
      expect(() => restoreSharedPeople(connection.db, invalid, 202)).toThrow('invalid');
      expect(save()).toEqual(saved);
    }
  });
});

const cli = new URL(
  '../../../../../apps/wbs/be-01/src/shared-people-rollback-cli.ts',
  import.meta.url,
).pathname;
async function invoke(args: readonly string[], dbPath: string = path) {
  const environment = { ...process.env };
  environment['DB_PATH'] = dbPath;
  const child = Bun.spawn(['bun', cli, ...args], {
    env: environment,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}

describe('combined recovery CLI', () => {
  it('saves, removes and restores through the real process boundary', async () => {
    const file = join(directory, 'backup.json');
    const before = save();
    expect((await invoke(['save', file])).exit).toBe(0);
    expect(await Bun.file(file).json()).toEqual(before);
    expect((await invoke(['remove', file])).exit).toBe(0);
    expect(ranks()).toEqual([]);
    expect((await invoke(['restore', file])).exit).toBe(0);
    expect(save()).toEqual(before);
  });

  it('creates a private backup exclusively and leaves an existing backup unchanged', async () => {
    const file = join(directory, 'exclusive.json');
    expect((await invoke(['save', file])).exit).toBe(0);
    const first = await Bun.file(file).text();
    expect(statSync(file).mode & 0o777).toBe(0o600);
    execute("UPDATE project_rank SET position=99 WHERE project_id='a1'");
    const repeated = await invoke(['save', file]);
    expect(repeated.exit).not.toBe(0);
    expect(repeated.stderr).toContain('EEXIST');
    expect(await Bun.file(file).text()).toBe(first);
  });

  it('refuses bad arguments and missing DB_PATH before opening a database', async () => {
    for (const args of [['erase', 'backup'], ['save'], ['save', ''], ['save', 'backup', 'extra']]) {
      const attempt = await invoke(args);
      expect(attempt.exit).not.toBe(0);
      expect(attempt.stderr).toContain('usage:');
    }
    const environment = { ...process.env };
    delete environment['DB_PATH'];
    const child = Bun.spawn(['bun', cli, 'save', join(directory, 'backup.json')], {
      env: environment,
      stderr: 'pipe',
    });
    expect(await child.exited).not.toBe(0);
    expect(await new Response(child.stderr).text()).toContain('DB_PATH must be set');
  });

  it('refuses absent, unreadable and malformed backup files without changing state', async () => {
    const before = save();
    const malformed = join(directory, 'malformed.json');
    await Bun.write(malformed, '{');
    for (const [file, message] of [
      [join(directory, 'absent.json'), 'ENOENT'],
      [directory, 'Directories cannot be read like files'],
      [malformed, 'JSON Parse error'],
    ]) {
      const attempt = await invoke(['remove', file]);
      expect(attempt.exit).not.toBe(0);
      expect(attempt.stderr).toContain(message);
      expect(save()).toEqual(before);
    }
  });
});
