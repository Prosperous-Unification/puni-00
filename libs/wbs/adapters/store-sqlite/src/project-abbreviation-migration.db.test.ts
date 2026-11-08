import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { readMigrationFolders, rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const BASE = '20261022140100_widen_organization_audit_compute_providers';
let directory: string;
let path: string;
function raw<T>(use: (sqlite: Database) => T): T {
  const sqlite = openDatabase(path);
  try {
    return use(sqlite);
  } finally {
    sqlite.close();
  }
}
function insert(sqlite: Database, id: string): void {
  sqlite.run('INSERT INTO project (id,name,owner_id,created_at) VALUES (?,?,?,1)', [id, id, 'u']);
}
function own(sqlite: Database, id: string, organization: string): void {
  sqlite.run('INSERT INTO project_organization (resource_id,organization_id) VALUES (?,?)', [
    id,
    organization,
  ]);
}
function codes(sqlite: Database) {
  return sqlite
    .query<{ project_id: string; namespace: string; abbreviation: string }, []>(
      'SELECT * FROM project_abbreviation ORDER BY project_id',
    )
    .all();
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-abbreviation-'));
  path = join(directory, 'store.db');
  runMigrations(path, FOLDER);
  raw((sqlite) => {
    sqlite.run("INSERT INTO users (id,username,created_at) VALUES ('u','Owner',1)");
    sqlite.run("INSERT INTO organization (id,name,created_at) VALUES ('a','A',1),('b','B',1)");
  });
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

it('old writer insert allocates five letters', () => {
  raw((sqlite) => {
    insert(sqlite, 'p');
    insert(sqlite, 'q');
    expect(codes(sqlite)).toEqual([
      { project_id: 'p', namespace: 'legacy', abbreviation: 'AAAAA' },
      { project_id: 'q', namespace: 'legacy', abbreviation: 'AAAAB' },
    ]);
  });
});
it('backfills every project and rollback preserves old project rows and complete ledger', () => {
  // Proof: deleting the retained resource-provider ledger row after rollback
  // failed the complete baseline snapshot comparison (2026-10-25).
  rollbackTo(path, FOLDER, BASE);
  const before = raw((sqlite) => {
    insert(sqlite, 'p');
    insert(sqlite, 'q');
    own(sqlite, 'q', 'a');
    return {
      projects: sqlite.query('SELECT * FROM project ORDER BY id').all(),
      ownership: sqlite.query('SELECT * FROM project_organization ORDER BY resource_id').all(),
      ledger: sqlite.query('SELECT name,hash FROM __drizzle_migrations ORDER BY name').all(),
    };
  });
  const additions = readMigrationFolders(FOLDER)
    .filter(({ name }) => name > BASE)
    .map(({ name, hash }) => ({ name, hash }));
  runMigrations(path, FOLDER);
  expect(raw(codes)).toHaveLength(2);
  expect(
    raw((sqlite) => sqlite.query('SELECT name,hash FROM __drizzle_migrations ORDER BY name').all()),
  ).toEqual([...before.ledger, ...additions]);
  expect(raw((sqlite) => codes(sqlite).find((row) => row.project_id === 'q')?.namespace)).toBe(
    'org:a',
  );
  expect(rollbackTo(path, FOLDER, BASE)).toEqual(additions.map(({ name }) => name).reverse());
  expect(
    raw((sqlite) => ({
      projects: sqlite.query('SELECT * FROM project ORDER BY id').all(),
      ownership: sqlite.query('SELECT * FROM project_organization ORDER BY resource_id').all(),
      ledger: sqlite.query('SELECT name,hash FROM __drizzle_migrations ORDER BY name').all(),
    })),
  ).toEqual(before);
  raw((sqlite) => {
    expect(
      sqlite.query("SELECT name FROM sqlite_master WHERE name LIKE 'project_abbreviation%'").all(),
    ).toEqual([]);
    insert(sqlite, 'old-after-down');
    expect(sqlite.query("SELECT id FROM project WHERE id='old-after-down'").get()).toEqual({
      id: 'old-after-down',
    });
  });
});
it('organization mapping moves namespace atomically', () => {
  raw((sqlite) => {
    insert(sqlite, 'p');
    own(sqlite, 'p', 'a');
    expect(codes(sqlite)[0]?.namespace).toBe('org:a');
    insert(sqlite, 'q');
    sqlite.run(
      "UPDATE project_abbreviation SET abbreviation='SHARED' WHERE project_id IN ('p','q')",
    );
    expect(() => {
      own(sqlite, 'q', 'a');
    }).toThrow();
    expect(
      sqlite.query("SELECT organization_id FROM project_organization WHERE resource_id='q'").get(),
    ).toBeNull();
    expect(codes(sqlite)[1]?.namespace).toBe('legacy');
  });
});
it('manual uniqueness is organization scoped and grammar requires normalized codes', () => {
  raw((sqlite) => {
    for (const id of ['p', 'q', 'r']) insert(sqlite, id);
    own(sqlite, 'p', 'a');
    own(sqlite, 'q', 'a');
    own(sqlite, 'r', 'b');
    sqlite.run("UPDATE project_abbreviation SET abbreviation='A-1_' WHERE project_id IN ('p','r')");
    expect(() =>
      sqlite.run("UPDATE project_abbreviation SET abbreviation='A-1_' WHERE project_id='q'"),
    ).toThrow();
    for (const abbreviation of ['', 'a', '1A', 'A.B', 'A B', 'A\0B', 'A'.repeat(21)]) {
      expect(() =>
        sqlite.run("UPDATE project_abbreviation SET abbreviation=? WHERE project_id='q'", [
          abbreviation,
        ]),
      ).toThrow();
    }
    expect(() =>
      sqlite.run("UPDATE project_abbreviation SET namespace='org:b' WHERE project_id='q'"),
    ).toThrow();
  });
});
it('allocator skips occupied codes and refuses exhaustion without inserting a project', () => {
  raw((sqlite) => {
    insert(sqlite, 'manual');
    own(sqlite, 'manual', 'a');
    sqlite.run("UPDATE project_abbreviation SET abbreviation='AAAAB' WHERE project_id='manual'");
    insert(sqlite, 'p');
    expect(codes(sqlite).find((row) => row.project_id === 'p')?.abbreviation).toBe('AAAAC');
    sqlite.run('UPDATE project_abbreviation_counter SET next=11881375');
    insert(sqlite, 'last');
    expect(codes(sqlite).find((row) => row.project_id === 'last')?.abbreviation).toBe('ZZZZZ');
    expect(() => {
      insert(sqlite, 'overflow');
    }).toThrow('project abbreviation exhausted');
    expect(sqlite.query("SELECT id FROM project WHERE id='overflow'").get()).toBeNull();
  });
});
it('legacy organization bridge works in both project trigger orders', () => {
  raw((sqlite) => {
    sqlite.run("UPDATE organization SET legacy=1 WHERE id='a'");
    insert(sqlite, 'before');
    expect(codes(sqlite)[0]?.namespace).toBe('org:a');
    const bridge = sqlite
      .query<{ sql: string }, []>(
        "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='project_organization_bridge'",
      )
      .get();
    if (bridge === null) throw new Error('bridge is absent');
    sqlite.run('DROP TRIGGER project_organization_bridge');
    sqlite.run(bridge.sql);
    insert(sqlite, 'after');
    expect(codes(sqlite).every((row) => row.namespace === 'org:a')).toBe(true);
  });
});
it('storage read and write require a persisted row and preserve stable identity', async () => {
  const { readProjectAbbreviation, writeProjectAbbreviation } =
    await import('./project-abbreviation');
  const { openDrizzle } = await import('./db');
  raw((sqlite) => {
    insert(sqlite, 'p');
    own(sqlite, 'p', 'a');
  });
  const db = openDrizzle(path);
  writeProjectAbbreviation(db, 'p', 'P-1_');
  expect(readProjectAbbreviation(db, 'p')).toEqual({
    projectId: 'p',
    namespace: 'org:a',
    abbreviation: 'P-1_',
  });
  expect(readProjectAbbreviation(db, 'absent')).toBeUndefined();
  raw((sqlite) => sqlite.run("DELETE FROM project_abbreviation WHERE project_id='p'"));
  expect(() => readProjectAbbreviation(db, 'p')).toThrow('missing');
  expect(() => {
    writeProjectAbbreviation(db, 'p', 'P');
  }).toThrow('missing');
});
it('allocator crosses more than one thousand occupied codes', () => {
  raw((sqlite) => {
    sqlite.transaction(() => {
      for (let ordinal = 0; ordinal < 1101; ordinal++) insert(sqlite, `p${String(ordinal)}`);
    })();
    sqlite.run('UPDATE project_abbreviation_counter SET next=0');
    insert(sqlite, 'after');
    expect(codes(sqlite).find((row) => row.project_id === 'after')?.abbreviation).toBe('AABQJ');
  });
});
it('occupied final code and absent counter refuse atomically', () => {
  raw((sqlite) => {
    insert(sqlite, 'p');
    sqlite.run("UPDATE project_abbreviation SET abbreviation='ZZZZZ' WHERE project_id='p'");
    sqlite.run('UPDATE project_abbreviation_counter SET next=11881375');
    const before = sqlite.query('SELECT * FROM project_abbreviation_counter').all();
    expect(() => {
      insert(sqlite, 'occupied');
    }).toThrow('project abbreviation exhausted');
    expect(sqlite.query('SELECT * FROM project_abbreviation_counter').all()).toEqual(before);
    expect(sqlite.query("SELECT id FROM project WHERE id='occupied'").get()).toBeNull();
    sqlite.run('DELETE FROM project_abbreviation_counter');
    expect(() => {
      insert(sqlite, 'absent');
    }).toThrow('counter missing');
    expect(sqlite.query("SELECT id FROM project WHERE id='absent'").get()).toBeNull();
  });
});
it('counter refuses malformed ordinals and project deletion cascades', () => {
  raw((sqlite) => {
    for (const ordinal of [-1, 11881377, 1.5, 'broken'])
      expect(() =>
        sqlite.run('UPDATE project_abbreviation_counter SET next=?', [ordinal]),
      ).toThrow();
    expect(() =>
      sqlite.run('INSERT INTO project_abbreviation_counter(singleton,next) VALUES (2,0)'),
    ).toThrow();
    insert(sqlite, 'p');
    own(sqlite, 'p', 'a');
    sqlite.run("DELETE FROM project WHERE id='p'");
    expect(codes(sqlite)).toEqual([]);
  });
});
it('storage read refuses malformed trusted code', async () => {
  const { readProjectAbbreviation } = await import('./project-abbreviation');
  const { openDrizzle } = await import('./db');
  raw((sqlite) => {
    insert(sqlite, 'p');
    sqlite.run('PRAGMA ignore_check_constraints=ON');
    sqlite.run("UPDATE project_abbreviation SET abbreviation='bad.code' WHERE project_id='p'");
  });
  expect(() => readProjectAbbreviation(openDrizzle(path), 'p')).toThrow('malformed');
});
it('concurrent old and new writers never collide', async () => {
  const source = `import {openDatabase} from ${JSON.stringify(new URL('./db.ts', import.meta.url).pathname)};
  import {writeFileSync} from 'node:fs';
  const [path,kind,ready] = process.argv.slice(1);
  const sqlite=openDatabase(path);
  writeFileSync(ready,'ready');
  for(let ordinal=0;ordinal<30;ordinal++) {
    sqlite.transaction(() => {
      const id=kind+ordinal;
      sqlite.run('INSERT INTO project(id,name,owner_id,created_at) VALUES (?,?,?,1)',[id,id,'u']);
      sqlite.run('INSERT INTO project_organization(resource_id,organization_id) VALUES (?,?)',[id,kind==='old'?'a':'b']);
      if(kind==='new') sqlite.run('UPDATE project_abbreviation SET abbreviation=? WHERE project_id=?',['NEW-'+ordinal,id]);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2);
    }).immediate();
  }
  if(kind==='new') {
    let refused=false;
    try {
      sqlite.transaction(() => {
        sqlite.run("INSERT INTO project(id,name,owner_id,created_at) VALUES ('duplicate','duplicate','u',1)");
        sqlite.run("INSERT INTO project_organization(resource_id,organization_id) VALUES ('duplicate','b')");
        sqlite.run("UPDATE project_abbreviation SET abbreviation='NEW-0' WHERE project_id='duplicate'");
      }).immediate();
    } catch(error) {
      if (!(error instanceof Error) || !error.message.includes('UNIQUE constraint failed')) throw error;
      refused=true;
    }
    if(!refused) throw new Error('duplicate manual code committed');
  }
  sqlite.close();`;
  const locker = openDatabase(path);
  const { existsSync } = await import('node:fs');
  locker.run('BEGIN IMMEDIATE');
  const writers = ['old', 'new'].map((kind) =>
    Bun.spawn([process.execPath, '-e', source, path, kind, join(directory, kind)], {
      stdout: 'pipe',
      stderr: 'pipe',
    }),
  );
  try {
    const deadline = Date.now() + 4000;
    while (!['old', 'new'].every((kind) => existsSync(join(directory, kind)))) {
      if (Date.now() > deadline) throw new Error('writers did not reach held SQLite lock');
      await Bun.sleep(5);
    }
  } finally {
    locker.run('ROLLBACK');
    locker.close();
  }
  for (const writer of writers) {
    const status = await writer.exited;
    const errors = await new Response(writer.stderr).text();
    expect({ status, errors }).toEqual({ status: 0, errors: '' });
  }
  raw((sqlite) => {
    expect(sqlite.query("SELECT id FROM project WHERE id='duplicate'").get()).toBeNull();
    expect(
      sqlite
        .query("SELECT resource_id FROM project_organization WHERE resource_id='duplicate'")
        .get(),
    ).toBeNull();
    const stored = codes(sqlite);
    expect(stored).toHaveLength(60);
    expect(new Set(stored.map((row) => `${row.namespace}:${row.abbreviation}`)).size).toBe(60);
    expect(
      stored
        .filter((row) => row.project_id.startsWith('old'))
        .every((row) => row.namespace === 'org:a' && /^[A-Z]{5}$/.test(row.abbreviation)),
    ).toBe(true);
    expect(
      stored
        .filter((row) => row.project_id.startsWith('new'))
        .every((row) => row.namespace === 'org:b' && row.abbreviation.startsWith('NEW-')),
    ).toBe(true);
  });
});

it('namespace scope insert and project identity constraints reject forged rows', () => {
  raw((sqlite) => {
    insert(sqlite, 'p');
    own(sqlite, 'p', 'a');
    expect(() =>
      sqlite.run(
        "INSERT INTO project_abbreviation(project_id,namespace,abbreviation) VALUES ('p','org:a','OTHER')",
      ),
    ).toThrow();
    sqlite.run("DELETE FROM project_abbreviation WHERE project_id='p'");
    expect(() =>
      sqlite.run(
        "INSERT INTO project_abbreviation(project_id,namespace,abbreviation) VALUES ('p','org:b','OTHER')",
      ),
    ).toThrow('namespace');
    expect(() =>
      sqlite.run(
        "INSERT INTO project_abbreviation(project_id,namespace,abbreviation) VALUES ('absent','legacy','OTHER')",
      ),
    ).toThrow('FOREIGN KEY');
  });
});

it('storage read refuses trailing line breaks in trusted code', async () => {
  const { readProjectAbbreviation } = await import('./project-abbreviation');
  const { openDrizzle } = await import('./db');
  raw((sqlite) => {
    insert(sqlite, 'p');
    sqlite.run('PRAGMA ignore_check_constraints=ON');
    sqlite.run("UPDATE project_abbreviation SET abbreviation=? WHERE project_id='p'", ['A\n']);
  });
  expect(() => readProjectAbbreviation(openDrizzle(path), 'p')).toThrow('malformed');
});
it('storage read refuses forged trusted namespace', async () => {
  const { readProjectAbbreviation } = await import('./project-abbreviation');
  const { openDrizzle } = await import('./db');
  raw((sqlite) => {
    insert(sqlite, 'p');
    own(sqlite, 'p', 'a');
    sqlite.run('DROP TRIGGER project_abbreviation_scope_update');
    sqlite.run("UPDATE project_abbreviation SET namespace='org:b' WHERE project_id='p'");
  });
  expect(() => readProjectAbbreviation(openDrizzle(path), 'p')).toThrow('namespace');
});
