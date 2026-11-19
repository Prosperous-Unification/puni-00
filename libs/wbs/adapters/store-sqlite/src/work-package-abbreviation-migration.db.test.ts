import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Drizzle, openConnection, openDatabase } from './db';
import { runMigrations } from './migrate';
import { readMigrationFolders, rollbackTo } from './migrate-down';
import { project } from './schema';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const BASE = '20261022140100_widen_organization_audit_compute_providers';
const ABBREVIATIONS = '20261022210000_add_project_abbreviations';
let writersSettled = true;
let directory: string;
let path: string;
function raw<T>(use: (sqlite: Database) => T): T {
  const sqlite = openDatabase(path);
  try {
    return use(sqlite);
  } finally {
    sqlite.close(true);
  }
}
function insert(sqlite: Database, id: string, projectId: string): void {
  sqlite.run(
    'INSERT INTO work_package (id,name,created_by,project_id,created_at) VALUES (?,?,?,?,1)',
    [id, id, 'u', projectId],
  );
}
function own(sqlite: Database, id: string, organization: string): void {
  sqlite.run('INSERT INTO work_package_organization (resource_id,organization_id) VALUES (?,?)', [
    id,
    organization,
  ]);
}
function codes(sqlite: Database) {
  return sqlite
    .query<{ work_package_id: string; namespace: string; abbreviation: string }, []>(
      'SELECT * FROM work_package_abbreviation ORDER BY work_package_id',
    )
    .all();
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-abbreviation-'));
  path = join(directory, 'store.db');
  writersSettled = true;
});
afterEach(() => {
  if (!writersSettled) throw new Error('writer settlement unknown; retained ' + directory);
  rmSync(directory, { recursive: true, force: true });
});
function seedCurrent(): void {
  runMigrations(path, FOLDER);
  raw((sqlite) => {
    sqlite.run("INSERT INTO users (id,username,created_at) VALUES ('u','Owner',1)");
    sqlite.run("INSERT INTO organization (id,name,created_at) VALUES ('a','A',1),('b','B',1)");
  });
  withDrizzle((db) =>
    db
      .insert(project)
      .values([
        { id: 'parent-a', organizationId: 'a', name: 'A parent', createdBy: 'u', createdAt: 1 },
        { id: 'parent-b', organizationId: 'b', name: 'B parent', createdBy: 'u', createdAt: 1 },
      ])
      .run(),
  );
}
function withDrizzle<T>(use: (db: Drizzle) => T): T {
  const connection = openConnection(path);
  try {
    return use(connection.db);
  } finally {
    connection.close();
  }
}
/** Copies exact original migration/down bytes, stopping before later schema boundaries. */
function copyPrefix(through: string): string {
  const folder = join(directory, through);
  mkdirSync(folder);
  const names = readdirSync(FOLDER, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name <= through)
    .map((entry) => entry.name)
    .sort();
  if (names.at(-1) !== through)
    throw new Error('historical abbreviation prefix absent: ' + through);
  for (const name of names) {
    const target = join(folder, name);
    mkdirSync(target);
    for (const file of ['migration.sql', 'down.sql'])
      copyFileSync(join(FOLDER, name, file), join(target, file));
  }
  return folder;
}

it('backfills every original project and rollback preserves rows and complete historical ledger', () => {
  // Proof: deleting the retained resource-provider ledger row after rollback
  // failed the complete baseline snapshot comparison (2026-10-25).
  const baselinePrefix = copyPrefix(BASE);
  const abbreviationPrefix = copyPrefix(ABBREVIATIONS);
  runMigrations(path, baselinePrefix);
  const before = raw((sqlite) => {
    sqlite.run("INSERT INTO users(id,username,created_at) VALUES ('u','Owner',1)");
    sqlite.run("INSERT INTO organization(id,name,created_at) VALUES ('a','A',1)");
    for (const id of ['p', 'q'])
      sqlite.run('INSERT INTO project(id,name,owner_id,created_at) VALUES (?,?,?,1)', [
        id,
        id,
        'u',
      ]);
    sqlite.run("INSERT INTO project_organization(resource_id,organization_id) VALUES ('q','a')");
    return {
      projects: sqlite.query('SELECT * FROM project ORDER BY id').all(),
      ownership: sqlite.query('SELECT * FROM project_organization ORDER BY resource_id').all(),
      ledger: sqlite
        .query('SELECT name,hash,created_at FROM __drizzle_migrations ORDER BY name')
        .all(),
    };
  });
  const additions = readMigrationFolders(abbreviationPrefix)
    .filter(({ name }) => name > BASE)
    .map(({ name, hash }) => ({ name, hash, created_at: Date.UTC(2026, 9, 22, 21, 0, 0) }));
  expect(additions.map(({ name }) => name)).toEqual([ABBREVIATIONS]);
  runMigrations(path, abbreviationPrefix);
  expect(
    raw((sqlite) =>
      sqlite.query('SELECT name,hash,created_at FROM __drizzle_migrations ORDER BY name').all(),
    ),
  ).toEqual([...before.ledger, ...additions]);
  expect(
    raw((sqlite) => sqlite.query('SELECT * FROM project_abbreviation ORDER BY project_id').all()),
  ).toEqual([
    { project_id: 'p', namespace: 'legacy', abbreviation: 'AAAAA' },
    { project_id: 'q', namespace: 'org:a', abbreviation: 'AAAAB' },
  ]);
  expect(rollbackTo(path, abbreviationPrefix, BASE)).toEqual([ABBREVIATIONS]);
  expect(
    raw((sqlite) => ({
      projects: sqlite.query('SELECT * FROM project ORDER BY id').all(),
      ownership: sqlite.query('SELECT * FROM project_organization ORDER BY resource_id').all(),
      ledger: sqlite
        .query('SELECT name,hash,created_at FROM __drizzle_migrations ORDER BY name')
        .all(),
    })),
  ).toEqual(before);
  raw((sqlite) => {
    expect(
      sqlite.query("SELECT name FROM sqlite_master WHERE name LIKE 'project_abbreviation%'").all(),
    ).toEqual([]);
    sqlite.run(
      "INSERT INTO project(id,name,owner_id,created_at) VALUES ('old-after-down','old-after-down','u',1)",
    );
    expect(sqlite.query("SELECT id FROM project WHERE id='old-after-down'").get()).toEqual({
      id: 'old-after-down',
    });
  });
});

describe('current allocator and persisted abbreviation state', () => {
  beforeEach(seedCurrent);

  it('current automatic insert allocates five letters', () => {
    raw((sqlite) => {
      insert(sqlite, 'p', 'parent-a');
      insert(sqlite, 'q', 'parent-a');
      expect(codes(sqlite)).toEqual([
        { work_package_id: 'p', namespace: 'legacy', abbreviation: 'AAAAA' },
        { work_package_id: 'q', namespace: 'legacy', abbreviation: 'AAAAB' },
      ]);
    });
  });
  it('organization mapping moves namespace atomically', () => {
    raw((sqlite) => {
      insert(sqlite, 'p', 'parent-a');
      own(sqlite, 'p', 'a');
      expect(codes(sqlite)[0]?.namespace).toBe('org:a');
      insert(sqlite, 'q', 'parent-a');
      sqlite.run(
        "UPDATE work_package_abbreviation SET abbreviation='SHARED' WHERE work_package_id IN ('p','q')",
      );
      expect(() => {
        own(sqlite, 'q', 'a');
      }).toThrow();
      expect(
        sqlite
          .query("SELECT organization_id FROM work_package_organization WHERE resource_id='q'")
          .get(),
      ).toBeNull();
      expect(codes(sqlite)[1]?.namespace).toBe('legacy');
    });
  });
  it('manual uniqueness is organization scoped and grammar requires normalized codes', () => {
    raw((sqlite) => {
      for (const [id, parent] of [
        ['p', 'parent-a'],
        ['q', 'parent-a'],
        ['r', 'parent-b'],
      ] as const)
        insert(sqlite, id, parent);
      own(sqlite, 'p', 'a');
      own(sqlite, 'q', 'a');
      own(sqlite, 'r', 'b');
      sqlite.run(
        "UPDATE work_package_abbreviation SET abbreviation='A-1_' WHERE work_package_id IN ('p','r')",
      );
      expect(() =>
        sqlite.run(
          "UPDATE work_package_abbreviation SET abbreviation='A-1_' WHERE work_package_id='q'",
        ),
      ).toThrow();
      for (const abbreviation of ['', 'a', '1A', 'A.B', 'A B', 'A\0B', 'A'.repeat(21)]) {
        expect(() =>
          sqlite.run(
            "UPDATE work_package_abbreviation SET abbreviation=? WHERE work_package_id='q'",
            [abbreviation],
          ),
        ).toThrow();
      }
      expect(() =>
        sqlite.run(
          "UPDATE work_package_abbreviation SET namespace='org:b' WHERE work_package_id='q'",
        ),
      ).toThrow();
    });
  });
  it('allocator skips occupied codes and refuses exhaustion without inserting a work package', () => {
    raw((sqlite) => {
      insert(sqlite, 'manual', 'parent-a');
      own(sqlite, 'manual', 'a');
      sqlite.run(
        "UPDATE work_package_abbreviation SET abbreviation='AAAAB' WHERE work_package_id='manual'",
      );
      insert(sqlite, 'p', 'parent-a');
      expect(codes(sqlite).find((row) => row.work_package_id === 'p')?.abbreviation).toBe('AAAAC');
      sqlite.run('UPDATE work_package_abbreviation_counter SET next=11881375');
      insert(sqlite, 'last', 'parent-a');
      expect(codes(sqlite).find((row) => row.work_package_id === 'last')?.abbreviation).toBe(
        'ZZZZZ',
      );
      expect(() => {
        insert(sqlite, 'overflow', 'parent-a');
      }).toThrow('work_package abbreviation exhausted');
      expect(sqlite.query("SELECT id FROM work_package WHERE id='overflow'").get()).toBeNull();
    });
  });
  it('legacy organization bridge works in both work package trigger orders', () => {
    raw((sqlite) => {
      sqlite.run("UPDATE organization SET legacy=1 WHERE id='a'");
      insert(sqlite, 'before', 'parent-a');
      expect(codes(sqlite)[0]?.namespace).toBe('org:a');
      const bridge = sqlite
        .query<{ sql: string }, []>(
          "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='work_package_organization_bridge'",
        )
        .get();
      if (bridge === null) throw new Error('bridge is absent');
      sqlite.run('DROP TRIGGER work_package_organization_bridge');
      sqlite.run(bridge.sql);
      insert(sqlite, 'after', 'parent-a');
      expect(codes(sqlite).every((row) => row.namespace === 'org:a')).toBe(true);
    });
  });
  it('storage read and write require a persisted row and preserve stable identity', async () => {
    const { readWorkPackageAbbreviation, writeWorkPackageAbbreviation } =
      await import('./work-package-abbreviation');
    raw((sqlite) => {
      insert(sqlite, 'p', 'parent-a');
      own(sqlite, 'p', 'a');
    });
    withDrizzle((db) => {
      writeWorkPackageAbbreviation(db, 'p', 'P-1_');
      expect(readWorkPackageAbbreviation(db, 'p')).toEqual({
        workPackageId: 'p',
        namespace: 'org:a',
        abbreviation: 'P-1_',
      });
      expect(readWorkPackageAbbreviation(db, 'absent')).toBeUndefined();
      raw((sqlite) =>
        sqlite.run("DELETE FROM work_package_abbreviation WHERE work_package_id='p'"),
      );
      expect(() => readWorkPackageAbbreviation(db, 'p')).toThrow('missing');
      expect(() => {
        writeWorkPackageAbbreviation(db, 'p', 'P');
      }).toThrow('missing');
    });
  });
  it('allocator crosses more than one thousand occupied codes', () => {
    raw((sqlite) => {
      sqlite.transaction(() => {
        for (let ordinal = 0; ordinal < 1101; ordinal++)
          insert(sqlite, `p${String(ordinal)}`, 'parent-a');
      })();
      sqlite.run('UPDATE work_package_abbreviation_counter SET next=0');
      insert(sqlite, 'after', 'parent-a');
      expect(codes(sqlite).find((row) => row.work_package_id === 'after')?.abbreviation).toBe(
        'AABQJ',
      );
    });
  });
  it('occupied final code and absent counter refuse atomically', () => {
    raw((sqlite) => {
      insert(sqlite, 'p', 'parent-a');
      sqlite.run(
        "UPDATE work_package_abbreviation SET abbreviation='ZZZZZ' WHERE work_package_id='p'",
      );
      sqlite.run('UPDATE work_package_abbreviation_counter SET next=11881375');
      const before = sqlite.query('SELECT * FROM work_package_abbreviation_counter').all();
      expect(() => {
        insert(sqlite, 'occupied', 'parent-a');
      }).toThrow('work_package abbreviation exhausted');
      expect(sqlite.query('SELECT * FROM work_package_abbreviation_counter').all()).toEqual(before);
      expect(sqlite.query("SELECT id FROM work_package WHERE id='occupied'").get()).toBeNull();
      sqlite.run('DELETE FROM work_package_abbreviation_counter');
      expect(() => {
        insert(sqlite, 'absent', 'parent-a');
      }).toThrow('counter missing');
      expect(sqlite.query("SELECT id FROM work_package WHERE id='absent'").get()).toBeNull();
    });
  });
  it('counter refuses malformed ordinals and work package deletion cascades', () => {
    raw((sqlite) => {
      for (const ordinal of [-1, 11881377, 1.5, 'broken'])
        expect(() =>
          sqlite.run('UPDATE work_package_abbreviation_counter SET next=?', [ordinal]),
        ).toThrow();
      expect(() =>
        sqlite.run('INSERT INTO work_package_abbreviation_counter(singleton,next) VALUES (2,0)'),
      ).toThrow();
      insert(sqlite, 'p', 'parent-a');
      own(sqlite, 'p', 'a');
      sqlite.run("DELETE FROM work_package WHERE id='p'");
      expect(codes(sqlite)).toEqual([]);
    });
  });
  it('storage read refuses malformed trusted code', async () => {
    const { readWorkPackageAbbreviation } = await import('./work-package-abbreviation');
    raw((sqlite) => {
      insert(sqlite, 'p', 'parent-a');
      sqlite.run('PRAGMA ignore_check_constraints=ON');
      sqlite.run(
        "UPDATE work_package_abbreviation SET abbreviation='bad.code' WHERE work_package_id='p'",
      );
    });
    expect(() => withDrizzle((db) => readWorkPackageAbbreviation(db, 'p'))).toThrow('malformed');
  });
  it('concurrent automatic and manual current writers never collide', async () => {
    const source = `import {openDatabase} from ${JSON.stringify(new URL('./db.ts', import.meta.url).pathname)};
  import {writeFileSync} from 'node:fs';
  const [path,kind,ready] = process.argv.slice(1);
  const sqlite=openDatabase(path);
  try {
    writeFileSync(ready,'ready');
    const parent=kind==='old'?'parent-a':'parent-b';
    for(let ordinal=0;ordinal<30;ordinal++) {
      sqlite.transaction(() => {
        const id=kind+ordinal;
        sqlite.run('INSERT INTO work_package(id,name,created_by,project_id,created_at) VALUES (?,?,?,?,1)',[id,id,'u',parent]);
        sqlite.run('INSERT INTO work_package_organization(resource_id,organization_id) VALUES (?,?)',[id,kind==='old'?'a':'b']);
        if(kind==='new') sqlite.run('UPDATE work_package_abbreviation SET abbreviation=? WHERE work_package_id=?',['NEW-'+ordinal,id]);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2);
      }).immediate();
    }
    if(kind==='new') {
      let refused=false;
      try {
        sqlite.transaction(() => {
          sqlite.run("INSERT INTO work_package(id,name,created_by,project_id,created_at) VALUES ('duplicate','duplicate','u','parent-b',1)");
          sqlite.run("INSERT INTO work_package_organization(resource_id,organization_id) VALUES ('duplicate','b')");
          sqlite.run("UPDATE work_package_abbreviation SET abbreviation='NEW-0' WHERE work_package_id='duplicate'");
        }).immediate();
      } catch(error) {
        if (!(error instanceof Error) || !error.message.includes('UNIQUE constraint failed')) throw error;
        refused=true;
      }
      if(!refused) throw new Error('duplicate manual code committed');
    }
  } finally { sqlite.close(true); }`;
    type Writer = ReturnType<typeof Bun.spawn>;
    const writers: Writer[] = [];
    type WriterObservation =
      | {
          readonly ok: true;
          readonly status: number;
          readonly signal: NodeJS.Signals | null;
          readonly output: string;
          readonly errors: string;
        }
      | { readonly ok: false; readonly failure: unknown };
    const observations = new Map<Writer, Promise<WriterObservation>>();
    function observe(writer: Writer) {
      const existing = observations.get(writer);
      if (existing !== undefined) return existing;
      // Boundary: both pipes are explicitly requested at this test's only spawn below.
      const stdout: unknown = writer.stdout,
        stderr: unknown = writer.stderr;
      if (!(stdout instanceof ReadableStream) || !(stderr instanceof ReadableStream))
        throw new Error('writer pipes unavailable');
      const exit = writer.exited.then((status) => ({ status, signal: writer.signalCode }));
      const observed = Promise.all([
        exit,
        new Response(stdout).text(),
        new Response(stderr).text(),
      ]).then(
        ([exit, output, errors]): WriterObservation => ({ ok: true, ...exit, output, errors }),
        (failure: unknown): WriterObservation => ({ ok: false, failure }),
      );
      observations.set(writer, observed);
      return observed;
    }
    async function bounded<T>(operation: Promise<T>): Promise<T> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          operation,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error('owned writer settlement exceeded 10000ms'));
            }, 10000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    const locker = openDatabase(path);
    let lockHeld = false;
    let lockerClosed = false;
    let lockerCloseAttempted = false;
    const failures: unknown[] = [];
    writersSettled = false;
    try {
      locker.run('BEGIN IMMEDIATE');
      lockHeld = true;
      for (const kind of ['old', 'new']) {
        const writer = Bun.spawn(
          [process.execPath, '-e', source, path, kind, join(directory, kind)],
          { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
        );
        writers.push(writer);
        void observe(writer);
      }
      const deadline = Date.now() + 4000;
      while (!['old', 'new'].every((kind) => existsSync(join(directory, kind)))) {
        if (Date.now() > deadline) throw new Error('writers did not reach held SQLite lock');
        await Bun.sleep(5);
      }
      locker.run('ROLLBACK');
      lockHeld = false;
      lockerCloseAttempted = true;
      locker.close(true);
      lockerClosed = true;
      const outcomes = await bounded(Promise.all(writers.map(observe)));
      for (const outcome of outcomes)
        expect(outcome).toEqual({ ok: true, status: 0, signal: null, output: '', errors: '' });
    } catch (failure) {
      failures.push(failure);
    } finally {
      if (lockHeld) {
        try {
          locker.run('ROLLBACK');
        } catch (failure) {
          failures.push(failure);
        }
      }
      if (!lockerCloseAttempted) {
        try {
          locker.close(true);
          lockerClosed = true;
        } catch (failure) {
          failures.push(failure);
        }
      }
      for (const writer of writers) {
        if (writer.exitCode === null && writer.signalCode === null) {
          try {
            writer.kill('SIGKILL');
          } catch (failure) {
            failures.push(failure);
          }
        }
      }
      try {
        const settled = await bounded(Promise.all(writers.map(observe)));
        const observationFailures = settled.flatMap((observation) =>
          observation.ok ? [] : [observation.failure],
        );
        failures.push(...observationFailures);
        writersSettled = lockerClosed && observationFailures.length === 0;
      } catch (failure) {
        failures.push(failure);
      }
    }
    if (failures.length > 0)
      throw new AggregateError(failures, 'abbreviation writers or cleanup failed', {
        cause: failures[0],
      });
    raw((sqlite) => {
      expect(sqlite.query("SELECT id FROM work_package WHERE id='duplicate'").get()).toBeNull();
      expect(
        sqlite
          .query("SELECT resource_id FROM work_package_organization WHERE resource_id='duplicate'")
          .get(),
      ).toBeNull();
      const stored = codes(sqlite);
      expect(stored).toHaveLength(60);
      expect(new Set(stored.map((row) => `${row.namespace}:${row.abbreviation}`)).size).toBe(60);
      expect(
        stored
          .filter((row) => row.work_package_id.startsWith('old'))
          .every((row) => row.namespace === 'org:a' && /^[A-Z]{5}$/.test(row.abbreviation)),
      ).toBe(true);
      expect(
        stored
          .filter((row) => row.work_package_id.startsWith('new'))
          .every((row) => row.namespace === 'org:b' && row.abbreviation.startsWith('NEW-')),
      ).toBe(true);
    });
  });

  it('namespace scope insert and work package identity constraints reject forged rows', () => {
    raw((sqlite) => {
      insert(sqlite, 'p', 'parent-a');
      own(sqlite, 'p', 'a');
      expect(() =>
        sqlite.run(
          "INSERT INTO work_package_abbreviation(work_package_id,namespace,abbreviation) VALUES ('p','org:a','OTHER')",
        ),
      ).toThrow();
      sqlite.run("DELETE FROM work_package_abbreviation WHERE work_package_id='p'");
      expect(() =>
        sqlite.run(
          "INSERT INTO work_package_abbreviation(work_package_id,namespace,abbreviation) VALUES ('p','org:b','OTHER')",
        ),
      ).toThrow('namespace');
      expect(() =>
        sqlite.run(
          "INSERT INTO work_package_abbreviation(work_package_id,namespace,abbreviation) VALUES ('absent','legacy','OTHER')",
        ),
      ).toThrow('FOREIGN KEY');
    });
  });

  it('storage read refuses trailing line breaks in trusted code', async () => {
    const { readWorkPackageAbbreviation } = await import('./work-package-abbreviation');
    raw((sqlite) => {
      insert(sqlite, 'p', 'parent-a');
      sqlite.run('PRAGMA ignore_check_constraints=ON');
      sqlite.run("UPDATE work_package_abbreviation SET abbreviation=? WHERE work_package_id='p'", [
        'A\n',
      ]);
    });
    expect(() => withDrizzle((db) => readWorkPackageAbbreviation(db, 'p'))).toThrow('malformed');
  });
  it('storage read refuses forged trusted namespace', async () => {
    const { readWorkPackageAbbreviation } = await import('./work-package-abbreviation');
    raw((sqlite) => {
      insert(sqlite, 'p', 'parent-a');
      own(sqlite, 'p', 'a');
      sqlite.run('DROP TRIGGER work_package_abbreviation_scope_update');
      sqlite.run(
        "UPDATE work_package_abbreviation SET namespace='org:b' WHERE work_package_id='p'",
      );
    });
    expect(() => withDrizzle((db) => readWorkPackageAbbreviation(db, 'p'))).toThrow('namespace');
  });
});
