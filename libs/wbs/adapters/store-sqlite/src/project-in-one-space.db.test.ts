import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { POSITION_STEP } from '@wbs/domain';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import {
  type AppliedMigration,
  migrationsToRollback,
  readMigrationFolders,
  rollbackAppliedRows,
} from './migrate-down';
import { isSqliteCleanupUnknown } from './sqlite-cleanup';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const BASELINE = '20261110110100_widen_organization_audit_projects';
let directory: string | undefined;
let hasUnknownOwner = false;

beforeEach(() => {
  if (directory !== undefined) throw Error('Previous space migration fixture is unsettled');
  directory = mkdtempSync(join(tmpdir(), 'wbs-project-space-'));
  hasUnknownOwner = false;
});

afterEach(() => {
  if (directory === undefined) return;
  if (hasUnknownOwner)
    throw Error('Uncertain space migration owner; fixture retained at ' + directory);
  rmSync(directory, { recursive: true });
  directory = undefined;
});

/** Owns the exact native connection, retaining primary and close failures in order. */
function withinStore<T>(path: string, use: (sqlite: Database) => T): T {
  let sqlite: Database;
  try {
    sqlite = openDatabase(path);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
    throw cause;
  }
  let outcome: { ok: true; value: T } | { ok: false; cause: unknown };
  try {
    outcome = { ok: true, value: use(sqlite) };
  } catch (cause: unknown) {
    outcome = { ok: false, cause };
  }
  let closeFailure: { cause: unknown } | undefined;
  try {
    sqlite.close(true);
  } catch (cause: unknown) {
    hasUnknownOwner = true;
    closeFailure = { cause };
  }
  if (closeFailure !== undefined) {
    if (!outcome.ok)
      throw new AggregateError(
        [outcome.cause, closeFailure.cause],
        'Space fixture operation and close failed',
        { cause: outcome.cause },
      );
    throw closeFailure.cause;
  }
  if (!outcome.ok) throw outcome.cause;
  return outcome.value;
}

function migrate(path: string, migrations: string) {
  try {
    runMigrations(path, migrations);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
    throw cause;
  }
}

/** Runs the actual predecessor ledger before seeding the former membership shape. */
function prepareStore() {
  if (directory === undefined) throw Error('Space migration directory was not acquired');
  const migrations = join(directory, 'migrations');
  mkdirSync(migrations);
  const predecessors = readMigrationFolders(FOLDER).filter(({ name }) => name <= BASELINE);
  expect(predecessors.at(-1)?.name).toBe(BASELINE);
  for (const predecessor of predecessors)
    cpSync(join(FOLDER, predecessor.name), join(migrations, predecessor.name), { recursive: true });
  const path = join(directory, 'store.db');
  migrate(path, migrations);
  withinStore(path, (sqlite) => {
    expect(
      sqlite
        .query<{ name: string }, []>('SELECT name FROM __drizzle_migrations ORDER BY created_at')
        .all()
        .map(({ name }) => name),
    ).toEqual(predecessors.map(({ name }) => name));
    sqlite.run("INSERT INTO users(id,username,created_at) VALUES('space-author','Space Author',1)");
    sqlite.run(
      "INSERT INTO organization(id,name,created_at) VALUES('space-org','Space Org',1),('space-foreign','Foreign',1)",
    );
  });
  return { path, migrations };
}

/** An absent new migration leaves the real predecessor schema for the initial RED. */
function install(
  store: { path: string; migrations: string },
  suffix: '_add_setting_value' | '_space_holds_projects_people_teams',
) {
  const selected = readMigrationFolders(FOLDER).filter(({ name }) => name.endsWith(suffix));
  if (selected.length > 1)
    throw Error('More than one space prerequisite migration exists: ' + suffix);
  for (const migration of selected) {
    if (migration.name <= BASELINE)
      throw Error('Space transition must follow its actual predecessor ledger');
    cpSync(join(FOLDER, migration.name), join(store.migrations, migration.name), {
      recursive: true,
    });
  }
  migrate(store.path, store.migrations);
}

function transition(store: { path: string; migrations: string }) {
  install(store, '_add_setting_value');
  install(store, '_space_holds_projects_people_teams');
}

function addSpace(sqlite: Database, id: string, createdAt: number, organizationId = 'space-org') {
  sqlite.run(
    "INSERT INTO space(id,organization_id,name,revision,created_at,created_by) VALUES(?,?,?,0,?,'space-author')",
    [id, organizationId, id, createdAt],
  );
}

function addProject(sqlite: Database, id: string, createdAt: number, packages = 1) {
  sqlite.run(
    "INSERT INTO project(id,organization_id,name,revision,created_at,updated_at,created_by) VALUES(?,'space-org',?,3,?,9,'space-author')",
    [id, id, createdAt],
  );
  for (let index = 0; index < packages; index++) {
    const packageId = id + '-package-' + String(index);
    sqlite.run(
      "INSERT INTO work_package(id,project_id,name,restricted,created_at,created_by) VALUES(?,?,?,0,1,'space-author')",
      [packageId, id, packageId],
    );
    sqlite.run(
      "INSERT INTO work_package_organization(resource_id,organization_id) VALUES(?,'space-org')",
      [packageId],
    );
  }
}

function addMembership(
  sqlite: Database,
  spaceId: string,
  projectId: string,
  position: number,
  packageIndex = 0,
) {
  sqlite.run(
    "INSERT INTO space_work_package(space_id,work_package_id,organization_id,position,created_at,created_by) VALUES(?,?,'space-org',?,1,'space-author')",
    [spaceId, projectId + '-package-' + String(packageIndex), position],
  );
}

function capture(sqlite: Database) {
  return {
    schema: sqlite
      .query('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name')
      .all(),
    tables: sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map(({ name }) => ({
        name,
        rows: sqlite
          .query('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
          .all()
          .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
      })),
    foreignKeys: sqlite.query('PRAGMA foreign_keys').all(),
    violations: sqlite.query('PRAGMA foreign_key_check').all(),
  };
}

function expectRefusal(use: () => void, diagnostic: string) {
  let rejected: { cause: unknown } | undefined;
  try {
    use();
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
    rejected = { cause };
  }
  expect(rejected).toBeDefined();
  if (rejected === undefined) throw Error('Space transition unexpectedly succeeded');
  let cause = rejected.cause;
  const seen = new Set<Error>();
  while (cause instanceof Error && cause.cause !== undefined) {
    if (seen.has(cause))
      throw new Error('Space refusal has a cyclic cause', { cause: rejected.cause });
    seen.add(cause);
    cause = cause.cause;
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
  }
  if (!(cause instanceof Error)) throw new Error('Space refusal was not an Error', { cause });
  expect(cause.message).toContain(diagnostic);
}

it('backfills one project space by minimum pair position then space age and id, reports every discarded pair, and orders project ties by age and id', () => {
  const store = prepareStore();
  const before = withinStore(store.path, (sqlite) => {
    for (const [id, createdAt] of [
      ['s-position', 20],
      ['s-old', 10],
      ['s-new', 20],
      ['s-a', 10],
      ['s-z', 10],
      ['s-rank', 30],
    ] as const)
      addSpace(sqlite, id, createdAt);
    for (const id of ['position', 'time', 'id', 'none']) addProject(sqlite, id, 1);
    addProject(sqlite, 'collapse', 1, 3);
    addProject(sqlite, 'rank-b', 200);
    addProject(sqlite, 'rank-a', 200);
    addProject(sqlite, 'rank-z', 100);
    addMembership(sqlite, 's-old', 'position', 70);
    addMembership(sqlite, 's-position', 'position', 5);
    addMembership(sqlite, 's-new', 'time', 10);
    addMembership(sqlite, 's-old', 'time', 10);
    addMembership(sqlite, 's-z', 'id', 10);
    addMembership(sqlite, 's-a', 'id', 10);
    addMembership(sqlite, 's-old', 'collapse', 100);
    addMembership(sqlite, 's-old', 'collapse', 30, 1);
    addMembership(sqlite, 's-new', 'collapse', 60, 2);
    for (const id of ['rank-b', 'rank-a', 'rank-z']) addMembership(sqlite, 's-rank', id, 40);
    expect(sqlite.query('SELECT * FROM space_work_package').all()).toHaveLength(12);
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    return {
      projects: sqlite.query('SELECT * FROM project ORDER BY id').all(),
      packageIds: sqlite.query('SELECT id,project_id FROM work_package ORDER BY id').all(),
    };
  });
  transition(store);
  withinStore(store.path, (sqlite) => {
    expect(
      sqlite.query('SELECT id,space_id,space_position FROM project ORDER BY id').all(),
    ).toEqual([
      { id: 'collapse', space_id: 's-old', space_position: 2 * POSITION_STEP },
      { id: 'id', space_id: 's-a', space_position: POSITION_STEP },
      { id: 'none', space_id: null, space_position: null },
      { id: 'position', space_id: 's-position', space_position: POSITION_STEP },
      { id: 'rank-a', space_id: 's-rank', space_position: 2 * POSITION_STEP },
      { id: 'rank-b', space_id: 's-rank', space_position: 3 * POSITION_STEP },
      { id: 'rank-z', space_id: 's-rank', space_position: POSITION_STEP },
      { id: 'time', space_id: 's-old', space_position: POSITION_STEP },
    ]);
    expect(
      sqlite.query('SELECT * FROM space_project_dropped ORDER BY project_id,space_id').all(),
    ).toEqual([
      {
        project_id: 'collapse',
        space_id: 's-new',
        kept_space_id: 's-old',
        organization_id: 'space-org',
        position: 60,
      },
      {
        project_id: 'id',
        space_id: 's-z',
        kept_space_id: 's-a',
        organization_id: 'space-org',
        position: 10,
      },
      {
        project_id: 'position',
        space_id: 's-old',
        kept_space_id: 's-position',
        organization_id: 'space-org',
        position: 70,
      },
      {
        project_id: 'time',
        space_id: 's-new',
        kept_space_id: 's-old',
        organization_id: 'space-org',
        position: 10,
      },
    ]);
    expect(
      sqlite
        .query(
          'SELECT id,organization_id,name,revision,created_at,updated_at,created_by FROM project ORDER BY id',
        )
        .all(),
    ).toEqual(before.projects);
    expect(sqlite.query('SELECT id,project_id FROM work_package ORDER BY id').all()).toEqual(
      before.packageIds,
    );
    expect(
      sqlite.query("SELECT name FROM sqlite_master WHERE name='space_work_package'").all(),
    ).toEqual([]);
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

it('refuses foreign project-space links and reciprocal space organization changes without changing persisted state', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) => {
    addSpace(sqlite, 'own-space', 1);
    addSpace(sqlite, 'foreign-space', 1, 'space-foreign');
    addProject(sqlite, 'project', 1);
    addMembership(sqlite, 'own-space', 'project', 10);
  });
  transition(store);
  withinStore(store.path, (sqlite) => {
    const before = capture(sqlite);
    for (const [statement, diagnostic] of [
      [
        "INSERT INTO project(id,organization_id,name,created_at,space_id,space_position) VALUES('foreign-link','space-org','Foreign link',1,'foreign-space',10)",
        'project space organization mismatch',
      ],
      [
        "UPDATE project SET space_id='foreign-space' WHERE id='project'",
        'project space organization mismatch',
      ],
      [
        "UPDATE space SET organization_id='space-foreign' WHERE id='own-space'",
        'space project organization mismatch',
      ],
    ]) {
      expectRefusal(() => {
        sqlite.run(statement);
      }, diagnostic);
      expect(capture(sqlite)).toEqual(before);
    }
  });
});

it('keeps space person and team membership organization-scoped for insert and update and removes only deleted-space links', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) => {
    addSpace(sqlite, 'kept-space', 1);
    addSpace(sqlite, 'deleted-space', 1);
    addProject(sqlite, 'project', 1);
    addMembership(sqlite, 'deleted-space', 'project', 10);
    sqlite.run(
      "INSERT INTO person(id,name) VALUES('own-person','Own person'),('foreign-person','Foreign person')",
    );
    sqlite.run(
      "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('own-person','space-org','Own person'),('foreign-person','space-foreign','Foreign person')",
    );
    sqlite.run(
      "INSERT INTO service_team(id,name) VALUES('own-team','Own team'),('foreign-team','Foreign team')",
    );
    sqlite.run(
      "INSERT INTO service_team_organization(resource_id,organization_id,name) VALUES('own-team','space-org','Own team'),('foreign-team','space-foreign','Foreign team')",
    );
  });
  transition(store);
  withinStore(store.path, (sqlite) => {
    for (const spaceId of ['kept-space', 'deleted-space']) {
      sqlite.run(
        "INSERT INTO space_person(space_id,person_id,organization_id,created_at,created_by) VALUES(?,'own-person','space-org',1,'space-author')",
        [spaceId],
      );
      sqlite.run(
        "INSERT INTO space_team(space_id,service_team_id,organization_id,created_at,created_by) VALUES(?,'own-team','space-org',1,'space-author')",
        [spaceId],
      );
    }
    const before = capture(sqlite);
    for (const statement of [
      "INSERT INTO space_person(space_id,person_id,organization_id,created_at,created_by) VALUES('kept-space','foreign-person','space-org',1,'space-author')",
      "UPDATE space_person SET person_id='foreign-person' WHERE space_id='kept-space'",
      "INSERT INTO space_team(space_id,service_team_id,organization_id,created_at,created_by) VALUES('kept-space','foreign-team','space-org',1,'space-author')",
      "UPDATE space_team SET service_team_id='foreign-team' WHERE space_id='kept-space'",
    ]) {
      expectRefusal(() => {
        sqlite.run(statement);
      }, 'space member organization mismatch');
      expect(capture(sqlite)).toEqual(before);
    }
    sqlite.run("DELETE FROM space WHERE id='deleted-space'");
    expect(sqlite.query('SELECT id,space_id,space_position FROM project').all()).toEqual([
      { id: 'project', space_id: null, space_position: null },
    ]);
    expect(sqlite.query('SELECT space_id,person_id FROM space_person').all()).toEqual([
      { space_id: 'kept-space', person_id: 'own-person' },
    ]);
    expect(sqlite.query('SELECT space_id,service_team_id FROM space_team').all()).toEqual([
      { space_id: 'kept-space', service_team_id: 'own-team' },
    ]);
    expect(sqlite.query('SELECT id,project_id FROM work_package').all()).toEqual([
      { id: 'project-package-0', project_id: 'project' },
    ]);
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

it('refuses an incoherent former membership atomically before publishing project-space backfill', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) => {
    addSpace(sqlite, 'foreign-space', 1, 'space-foreign');
    addProject(sqlite, 'project', 1);
  });
  install(store, '_add_setting_value');
  const before = withinStore(store.path, (sqlite) => {
    sqlite.run('PRAGMA foreign_keys=OFF');
    addMembership(sqlite, 'foreign-space', 'project', 10);
    sqlite.run('PRAGMA foreign_keys=ON');
    expect(sqlite.query('PRAGMA foreign_keys').all()).toEqual([{ foreign_keys: 1 }]);
    const violations = sqlite
      .query<{ table: string; parent: string }, []>('PRAGMA foreign_key_check')
      .all();
    expect(violations.map(({ table, parent }) => ({ table, parent }))).toEqual([
      { table: 'space_work_package', parent: 'space' },
    ]);
    return capture(sqlite);
  });
  expectRefusal(() => {
    install(store, '_space_holds_projects_people_teams');
  }, 'incoherent project organization');
  expect(withinStore(store.path, capture)).toEqual(before);
});

it('refuses down migration in both an empty and a populated transitioned store without changing schema rows or ledger', () => {
  const store = prepareStore();
  transition(store);
  for (const populated of [false, true]) {
    if (populated)
      withinStore(store.path, (sqlite) => {
        addSpace(sqlite, 'space', 1);
        addProject(sqlite, 'project', 1);
      });
    const before = withinStore(store.path, capture);
    expectRefusal(() => {
      withinStore(store.path, (sqlite) => {
        const folders = new Map(
          readMigrationFolders(store.migrations).map((folder) => [folder.name, folder]),
        );
        const applied = sqlite
          .query<AppliedMigration, []>('SELECT id,hash,created_at,name FROM __drizzle_migrations')
          .all();
        rollbackAppliedRows(sqlite, folders, migrationsToRollback(applied, BASELINE));
      });
    }, 'verified window snapshot');
    expect(withinStore(store.path, capture)).toEqual(before);
  }
});

it('keeps finite fractional former membership positions in the migration ordering and dropped report', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) => {
    addSpace(sqlite, 'fractional-first', 2);
    addSpace(sqlite, 'fractional-second', 1);
    addProject(sqlite, 'fractional-project', 1, 2);
    addMembership(sqlite, 'fractional-first', 'fractional-project', 0.5);
    addMembership(sqlite, 'fractional-second', 'fractional-project', 0.75, 1);
  });
  transition(store);
  withinStore(store.path, (sqlite) => {
    expect(sqlite.query('SELECT id,space_id,space_position FROM project').all()).toEqual([
      { id: 'fractional-project', space_id: 'fractional-first', space_position: POSITION_STEP },
    ]);
    expect(sqlite.query('SELECT * FROM space_project_dropped').all()).toEqual([
      {
        project_id: 'fractional-project',
        space_id: 'fractional-second',
        kept_space_id: 'fractional-first',
        organization_id: 'space-org',
        position: 0.75,
      },
    ]);
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

it.each([
  [
    'blob position',
    "UPDATE space_work_package SET position=x'80' WHERE work_package_id='invalid-project-package-0'",
    'space membership position',
  ],
  [
    'text position',
    "UPDATE space_work_package SET position='not-a-position' WHERE work_package_id='invalid-project-package-0'",
    'space membership position',
  ],
  [
    'infinite position',
    "UPDATE space_work_package SET position=1e999 WHERE work_package_id='invalid-project-package-0'",
    'space membership position',
  ],
  [
    'blob space age',
    "UPDATE space SET created_at=x'80' WHERE id='invalid-space'",
    'space creation timestamp',
  ],
  [
    'blob project age',
    "UPDATE project SET created_at=x'80' WHERE id='invalid-project'",
    'project creation timestamp',
  ],
] as const)(
  'refuses malformed %s before reducing duplicate memberships or ordering projects and leaves the complete store unchanged',
  (_label, statement, diagnostic) => {
    const store = prepareStore();
    withinStore(store.path, (sqlite) => {
      addSpace(sqlite, 'invalid-space', 1);
      addProject(sqlite, 'invalid-project', 1, 2);
      addMembership(sqlite, 'invalid-space', 'invalid-project', 100);
      addMembership(sqlite, 'invalid-space', 'invalid-project', 5, 1);
    });
    install(store, '_add_setting_value');
    const before = withinStore(store.path, (sqlite) => {
      sqlite.run(statement);
      expect(sqlite.query('PRAGMA foreign_keys').all()).toEqual([{ foreign_keys: 1 }]);
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(
        sqlite
          .query('SELECT work_package_id FROM space_work_package ORDER BY work_package_id')
          .all(),
      ).toEqual([
        { work_package_id: 'invalid-project-package-0' },
        { work_package_id: 'invalid-project-package-1' },
      ]);
      return capture(sqlite);
    });
    expectRefusal(() => {
      install(store, '_space_holds_projects_people_teams');
    }, diagnostic);
    expect(withinStore(store.path, capture)).toEqual(before);
  },
);

it('uses finite fractional stored space ages without silently replacing them during tied-position backfill', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) => {
    addSpace(sqlite, 'age-later', 10.75);
    addSpace(sqlite, 'age-earlier', 10.5);
    addProject(sqlite, 'age-project', 1, 2);
    addMembership(sqlite, 'age-later', 'age-project', 10);
    addMembership(sqlite, 'age-earlier', 'age-project', 10, 1);
  });
  transition(store);
  withinStore(store.path, (sqlite) => {
    expect(sqlite.query('SELECT id,space_id,space_position FROM project').all()).toEqual([
      { id: 'age-project', space_id: 'age-earlier', space_position: POSITION_STEP },
    ]);
    expect(sqlite.query('SELECT id,created_at FROM space ORDER BY id').all()).toEqual([
      { id: 'age-earlier', created_at: 10.5 },
      { id: 'age-later', created_at: 10.75 },
    ]);
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

it('refuses a fractional stored project creation timestamp before backfill and preserves the complete store', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) => {
    addSpace(sqlite, 'fractional-age-space', 1);
    addProject(sqlite, 'fractional-age-project', 1);
    addMembership(sqlite, 'fractional-age-space', 'fractional-age-project', 10);
  });
  install(store, '_add_setting_value');
  const before = withinStore(store.path, (sqlite) => {
    sqlite.run("UPDATE project SET created_at=1.5 WHERE id='fractional-age-project'");
    expect(sqlite.query('PRAGMA foreign_keys').all()).toEqual([{ foreign_keys: 1 }]);
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    return capture(sqlite);
  });
  expectRefusal(() => {
    install(store, '_space_holds_projects_people_teams');
  }, 'project creation timestamp');
  expect(withinStore(store.path, capture)).toEqual(before);
});
