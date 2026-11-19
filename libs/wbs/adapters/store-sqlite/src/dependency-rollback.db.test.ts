import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';

import {
  activateDependencies,
  inspectDependencyActivation,
} from './cross-work-package-dependency-activation';
import { assertDependencyRollbackAdmitted } from './cross-work-package-dependency-rollback';
import { openDatabase } from './db';
import { runMigrations } from './migrate';
import {
  type AppliedMigration,
  readMigrationFolders,
  rollbackAppliedRows,
  rollbackTo,
} from './migrate-down';
import {
  captureAppliedMigrationSet,
  type MigrationSetCapture,
  restoreAppliedMigrationSet,
} from './migration-set';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const BASELINE = '20261022211000_add_external_dependencies';
const ACTIVATION = '20261022212000_add_cross_project_dependency_activation';
const LATER = '20261022213000_add_optimization_boundary_certificates';
const RENAME = '20261110100000_rename_project_to_work_package';
const RECEIPT = {
  protocol: 'wbs-dependency-activation',
  version: 1,
  activationId: 'synthetic-storage-fixture',
  databaseIdentity: 'isolated-rollback-test',
  candidateImage: `fixture@sha256:${'a'.repeat(64)}`,
  rollbackImage: `fixture@sha256:${'b'.repeat(64)}`,
  participantProofSha256: 'c'.repeat(64),
  migrationCaptureSha256: 'd'.repeat(64),
  activatedAt: 1,
} as const;
type Native = ReturnType<typeof openDatabase>;
interface Fixture {
  sqlite: Native;
  path: string;
  folder: string;
  capture: MigrationSetCapture;
}

/** Actual immutable SQL history; synthetic authority is storage state, never activation permission. */
function withFixture(layout: 'historical' | 'current', check: (fixture: Fixture) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-dependency-rollback-'));
  try {
    const path = join(directory, 'store.db');
    const baseline = join(directory, 'baseline');
    const folder = join(directory, 'candidate');
    mkdirSync(baseline);
    mkdirSync(folder);
    const migrations = readMigrationFolders(FOLDER);
    for (const { name } of migrations.filter(({ name }) => name <= BASELINE))
      cpSync(join(FOLDER, name), join(baseline, name), { recursive: true });
    runMigrations(path, baseline);
    const end = layout === 'historical' ? LATER : RENAME;
    for (const { name } of migrations.filter(({ name }) => name <= end))
      cpSync(join(FOLDER, name), join(folder, name), { recursive: true });
    const capture = captureAppliedMigrationSet(path, folder, {
      target: 'isolated-test',
      attempt: 'ordinary-rollback',
      candidate: 'immutable-test-artifact',
    });
    if (layout === 'current') {
      for (const { name } of migrations.filter(({ name }) => name > BASELINE && name < RENAME))
        cpSync(join(FOLDER, name), join(baseline, name), { recursive: true });
      runMigrations(path, baseline);
    }
    runMigrations(path, folder);
    const sqlite = openDatabase(path);
    try {
      check({ sqlite, path, folder, capture });
    } finally {
      sqlite.close(true);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Every durable schema definition and row, including the complete name/hash migration ledger. */
function certificate(sqlite: Native): unknown {
  const schema = sqlite
    .query<{ type: string; name: string; tbl_name: string; sql: string | null }, []>(
      'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name',
    )
    .all();
  return {
    schema,
    tables: schema
      .filter(({ type }) => type === 'table')
      .map(({ name }) => ({
        name,
        rows: sqlite.query(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all(),
      })),
  };
}
function enable(sqlite: Native, layout: 'historical' | 'current' = 'historical'): void {
  const table =
    layout === 'historical'
      ? 'cross_project_dependency_activation'
      : 'cross_work_package_dependency_activation';
  sqlite.run(`INSERT INTO ${table}_receipt(id,receipt) VALUES (1,?)`, [JSON.stringify(RECEIPT)]);
  sqlite.run(`UPDATE ${table} SET state='ENABLED' WHERE id=1`);
}
function retainEdge(sqlite: Native): void {
  sqlite.run("INSERT INTO users(id,username,password_hash,created_at) VALUES('u','owner','x',1)");
  sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('org','Org',1)");
  sqlite.run(
    "INSERT INTO project(id,name,owner_id,created_at) VALUES('a','A','u',1),('b','B','u',1)",
  );
  sqlite.run(
    "INSERT INTO project_organization(resource_id,organization_id) VALUES('a','org'),('b','org')",
  );
  sqlite.run(
    "INSERT INTO work_item(id,project_id,name,position,revision) VALUES('a','a','A',1,0),('b','b','B',1,0)",
  );
  enable(sqlite);
  sqlite.run(
    "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type) VALUES('edge','org','a','b','a','whole','b','whole','FS')",
  );
  sqlite.run("UPDATE cross_project_dependency_activation SET state='DISABLED'");
  sqlite.run('DELETE FROM cross_project_dependency_activation_receipt');
}
const routes = ['target', 'capture'] as const;
function reverse(fixture: Fixture, route: (typeof routes)[number]): string[] {
  return route === 'target'
    ? rollbackTo(fixture.path, fixture.folder, BASELINE)
    : restoreAppliedMigrationSet(fixture.path, fixture.folder, fixture.capture);
}
function expectPreserved(fixture: Fixture, invoke: () => unknown, message?: string): void {
  const before = certificate(fixture.sqlite);
  let failure: unknown;
  try {
    invoke();
  } catch (cause) {
    failure = cause;
  }
  // Check the durable certificate first: a late SQL guard must not hide an earlier committed down.
  expect(certificate(fixture.sqlite)).toEqual(before);
  expect(failure).toBeInstanceOf(Error);
  if (message !== undefined) expect(failure instanceof Error && failure.message).toContain(message);
}

it('dispatches the actual authority identity on a closed native connection', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-closed-rollback-'));
  try {
    const sqlite = openDatabase(join(directory, 'store.db'));
    sqlite.close(true);
    expect(() => {
      assertDependencyRollbackAdmitted(sqlite, [ACTIVATION]);
    }).toThrow();
    expect(() => {
      assertDependencyRollbackAdmitted(sqlite, []);
    }).not.toThrow();
    expect(() => {
      assertDependencyRollbackAdmitted(sqlite, ['unrelated']);
    }).not.toThrow();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const faults: readonly { name: string; apply: (sqlite: Native) => void }[] = [
  {
    name: 'enabled-empty authority',
    apply: (sqlite) => {
      enable(sqlite);
    },
  },
  { name: 'dormant retained external edge', apply: retainEdge },
  {
    name: 'missing marker',
    apply: (sqlite) => sqlite.run('DELETE FROM cross_project_dependency_activation'),
  },
  {
    name: 'wrong marker identity',
    apply: (sqlite) => {
      sqlite.run('PRAGMA ignore_check_constraints=ON');
      sqlite.run('UPDATE cross_project_dependency_activation SET id=2');
    },
  },
  {
    name: 'unknown marker state',
    apply: (sqlite) => {
      sqlite.run('PRAGMA ignore_check_constraints=ON');
      sqlite.run("UPDATE cross_project_dependency_activation SET state='UNKNOWN'");
    },
  },
  {
    name: 'missing marker table',
    apply: (sqlite) => sqlite.run('DROP TABLE cross_project_dependency_activation'),
  },
  {
    name: 'missing receipt table',
    apply: (sqlite) => sqlite.run('DROP TABLE cross_project_dependency_activation_receipt'),
  },
  {
    name: 'replaced marker schema',
    apply: (sqlite) => {
      sqlite.run('DROP TABLE cross_project_dependency_activation');
      sqlite.run('CREATE TABLE cross_project_dependency_activation(id,state)');
      sqlite.run("INSERT INTO cross_project_dependency_activation VALUES(1,'DISABLED')");
    },
  },
  {
    name: 'replaced receipt schema',
    apply: (sqlite) => {
      sqlite.run('DROP TABLE cross_project_dependency_activation_receipt');
      sqlite.run('CREATE TABLE cross_project_dependency_activation_receipt(id,receipt)');
    },
  },
  {
    name: 'disabled receipt',
    apply: (sqlite) =>
      sqlite.run("INSERT INTO cross_project_dependency_activation_receipt VALUES(1,'{}')"),
  },
  {
    name: 'enabled missing receipt',
    apply: (sqlite) => {
      enable(sqlite);
      sqlite.run('DELETE FROM cross_project_dependency_activation_receipt');
    },
  },
  {
    name: 'enabled wrong receipt identity',
    apply: (sqlite) => {
      enable(sqlite);
      sqlite.run('PRAGMA ignore_check_constraints=ON');
      sqlite.run('UPDATE cross_project_dependency_activation_receipt SET id=2');
    },
  },
  {
    name: 'enabled malformed receipt body',
    apply: (sqlite) => {
      enable(sqlite);
      sqlite.run("UPDATE cross_project_dependency_activation_receipt SET receipt='{}'");
    },
  },
  {
    name: 'enabled invalid receipt JSON',
    apply: (sqlite) => {
      enable(sqlite);
      sqlite.run('PRAGMA ignore_check_constraints=ON');
      sqlite.run("UPDATE cross_project_dependency_activation_receipt SET receipt='malformed'");
    },
  },
  {
    name: 'duplicate authority ledger',
    apply: (sqlite) =>
      sqlite.run(
        'INSERT INTO __drizzle_migrations(hash,created_at,name) SELECT hash,created_at,name FROM __drizzle_migrations WHERE name=?',
        [ACTIVATION],
      ),
  },
  ...(['insert', 'update', 'delete'] as const).flatMap((action) => [
    {
      name: `missing ${action} trigger`,
      apply: (sqlite: Native) => sqlite.run(`DROP TRIGGER external_dependency_admit_${action}`),
    },
    {
      name: `altered ${action} trigger`,
      apply: (sqlite: Native) => {
        sqlite.run(`DROP TRIGGER external_dependency_admit_${action}`);
        sqlite.run(
          `CREATE TRIGGER external_dependency_admit_${action} BEFORE ${action.toUpperCase()} ON external_dependency BEGIN SELECT 1; END`,
        );
      },
    },
  ]),
];
for (const route of routes) {
  for (const fault of faults) {
    it(`historical ${route} refuses ${fault.name} before any down`, () => {
      withFixture('historical', (fixture) => {
        fault.apply(fixture.sqlite);
        expectPreserved(fixture, () => reverse(fixture, route));
      });
    });
  }
  it(`historical ${route} reverses genuine disabled authority and repeats as a no-op`, () => {
    withFixture('historical', (fixture) => {
      expect(reverse(fixture, route)).toEqual([LATER, ACTIVATION]);
      expect(
        fixture.sqlite
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE name IN ('cross_project_dependency_activation','cross_project_dependency_activation_receipt','optimization_boundary_certificate')",
          )
          .all(),
      ).toEqual([]);
      expect(
        fixture.sqlite
          .query<{ name: string; hash: string }, []>(
            'SELECT name,hash FROM __drizzle_migrations ORDER BY created_at,name',
          )
          .all(),
      ).toEqual(fixture.capture.applied);
      expect(reverse(fixture, route)).toEqual([]);
    });
  });
  it(`current ${route} refuses enabled authority before any down`, () => {
    withFixture('current', (fixture) => {
      enable(fixture.sqlite, 'current');
      expectPreserved(
        fixture,
        () => reverse(fixture, route),
        'dependency activation requires compatible recovery',
      );
    });
  });
  it(`current ${route} preserves the snapshot-only rename rollback refusal`, () => {
    withFixture('current', (fixture) => {
      expect(() => {
        assertDependencyRollbackAdmitted(fixture.sqlite, [ACTIVATION]);
      }).not.toThrow();
      expectPreserved(
        fixture,
        () => reverse(fixture, route),
        'work-package rename rollback requires restoring the verified window snapshot',
      );
    });
  });
}

it('historical no-op and unrelated later rollback do not inspect enabled authority', () => {
  withFixture('historical', (fixture) => {
    enable(fixture.sqlite);
    expect(rollbackTo(fixture.path, fixture.folder, LATER)).toEqual([]);
    expect(rollbackTo(fixture.path, fixture.folder, ACTIVATION)).toEqual([LATER]);
    expect(
      fixture.sqlite
        .query<{ state: string }, []>('SELECT state FROM cross_project_dependency_activation')
        .get()?.state,
    ).toBe('ENABLED');
  });
});

it('missing authority ledger refuses an already selected rollback before newer downs', () => {
  withFixture('historical', (fixture) => {
    const selected = fixture.sqlite
      .query<AppliedMigration, [string]>(
        'SELECT * FROM __drizzle_migrations WHERE name>=? ORDER BY created_at DESC',
      )
      .all(ACTIVATION);
    expect(selected.map(({ name }) => name)).toEqual([LATER, ACTIVATION]);
    fixture.sqlite.run('DELETE FROM __drizzle_migrations WHERE name=?', [ACTIVATION]);
    expectPreserved(
      fixture,
      () =>
        rollbackAppliedRows(
          fixture.sqlite,
          new Map(readMigrationFolders(fixture.folder).map((folder) => [folder.name, folder])),
          selected,
        ),
      'missing dependency activation migration',
    );
  });
});

for (const layout of ['historical', 'current'] as const) {
  it(`${layout} refuses mixed authority namespaces instead of choosing a passing reader`, () => {
    withFixture(layout, (fixture) => {
      const other =
        layout === 'historical'
          ? 'cross_work_package_dependency_activation'
          : 'cross_project_dependency_activation';
      fixture.sqlite.run(`CREATE TABLE ${other}(id,state)`);
      fixture.sqlite.run(`CREATE TABLE ${other}_receipt(id,receipt)`);
      expectPreserved(
        fixture,
        () => {
          assertDependencyRollbackAdmitted(fixture.sqlite, [ACTIVATION]);
        },
        'dependency activation layout differs from applied rename migration',
      );
    });
  });
  it(`${layout} refuses an altered trigger on its ledger-selected schema`, () => {
    withFixture(layout, (fixture) => {
      fixture.sqlite.run('DROP TRIGGER external_dependency_admit_insert');
      expectPreserved(
        fixture,
        () => {
          assertDependencyRollbackAdmitted(fixture.sqlite, [ACTIVATION]);
        },
        'invalid dependency activation triggers',
      );
    });
  });
}
it('historical schema refuses a ledger claiming the actual rename', () => {
  withFixture('historical', (fixture) => {
    const rename = readMigrationFolders(FOLDER).find(({ name }) => name === RENAME);
    if (rename === undefined) throw new Error('missing immutable rename fixture');
    fixture.sqlite.run('INSERT INTO __drizzle_migrations(hash,created_at,name) VALUES(?,?,?)', [
      rename.hash,
      Number(RENAME.split('_')[0]),
      RENAME,
    ]);
    expectPreserved(
      fixture,
      () => {
        assertDependencyRollbackAdmitted(fixture.sqlite, [ACTIVATION]);
      },
      'dependency activation layout differs from applied rename migration',
    );
  });
});
it('current schema refuses a missing rename ledger entry', () => {
  withFixture('current', (fixture) => {
    fixture.sqlite.run('DELETE FROM __drizzle_migrations WHERE name=?', [RENAME]);
    expectPreserved(
      fixture,
      () => {
        assertDependencyRollbackAdmitted(fixture.sqlite, [ACTIVATION]);
      },
      'dependency activation layout differs from applied rename migration',
    );
  });
});
it('duplicate applied rename identities refuse without changing the certificate', () => {
  withFixture('current', (fixture) => {
    fixture.sqlite.run(
      'INSERT INTO __drizzle_migrations(hash,created_at,name) SELECT hash,created_at,name FROM __drizzle_migrations WHERE name=?',
      [RENAME],
    );
    expectPreserved(
      fixture,
      () => {
        assertDependencyRollbackAdmitted(fixture.sqlite, [ACTIVATION]);
      },
      'duplicate dependency activation rename migration',
    );
  });
});
it('public current inspection and activation reject historical authority without changing it', () => {
  withFixture('historical', (fixture) => {
    expectPreserved(
      fixture,
      () => inspectDependencyActivation(drizzle({ client: fixture.sqlite })),
      'invalid dependency activation schema',
    );
    expectPreserved(
      fixture,
      () => activateDependencies(fixture.path, fixture.folder, RECEIPT),
      'invalid dependency activation schema',
    );
  });
});
