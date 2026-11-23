import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SEEDED_MEASURE_DEFINITIONS } from '@wbs/domain';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { drizzleReadTransaction, openConnection, openDatabase } from './db';
import { OPEN } from './gate';
import { createReadSnapshotLifetime } from './read-snapshot-lifetime';
import { readPlanInputIn } from './saved-plan-capture';
import { openSqliteSource, openSqliteSourceWithCaptureReadSeam } from './source';
import { StepCatalogueRepository } from './step-catalogue';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';

let directory: string,
  path: string,
  sqlite: ReturnType<typeof openDatabase>,
  source: ReturnType<typeof openSqliteSource>;
let activeSqlite: ReturnType<typeof openDatabase> | undefined;
let activeSource: ReturnType<typeof openSqliteSource> | undefined;
let custody = { hasUnknownOwner: false };
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'current-parent-capture-'));
  path = join(directory, 'source.db');
  custody = { hasUnknownOwner: false };
  migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, custody);
  custody.hasUnknownOwner = true;
  sqlite = openDatabase(path);
  activeSqlite = sqlite;
  sqlite.run("INSERT INTO users(id,username,created_at) VALUES('creator','Creator',1)");
  sqlite.run(
    "INSERT INTO organization(id,name,created_at) VALUES('org','Org',1),('foreign','Foreign',1)",
  );
  sqlite.run(
    "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org','creator','member',1)",
  );
  sqlite.run(
    "INSERT INTO project(id,organization_id,name,created_at) VALUES('parent','org','Parent',1),('foreign-parent','foreign','Foreign',1)",
  );
  source = openSqliteSource({
    dbPath: path,
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
  });
  activeSource = source;
  custody.hasUnknownOwner = false;
  const bound = await new StepCatalogueRepository(source.db, OPEN, 'owned').defineAndBindStep(
    'org',
    {
      id: 'dev',
      code: 'dev',
      name: 'Dev',
      position: 10,
      defaultAllowancePercent: 0,
      defaultEstimateUnit: 'workdays',
    },
    {
      bindingId: 'dev-binding',
      scopeKind: 'project',
      scopeId: 'parent',
      workItemTypeId: null,
      position: 10,
    },
    { by: 'creator', at: 1 },
  );
  expect(bound.ok).toBe(true);
  const created = await source.stores.workPackages.createInOrganization(
    workPackageRow({ id: 'package', projectId: 'parent' }),
    [],
    { by: 'creator', at: 1 },
    'org',
    { id: 'grant', auditId: 'audit' },
  );
  if (typeof created === 'string') throw Error('fixture birth refused ' + created);
});
afterEach(async () => {
  try {
    await activeSource?.close();
  } finally {
    activeSource = undefined;
    activeSqlite?.close();
    activeSqlite = undefined;
  }
  if (!custody.hasUnknownOwner) rmSync(directory, { recursive: true });
});
/** Awaits the actual operation, then checks its caught rejection synchronously. */
async function expectRejection(operation: Promise<unknown>, diagnostic: string): Promise<void> {
  let rejected = false;
  try {
    await operation;
  } catch (reason: unknown) {
    rejected = true;
    expect(() => {
      throw reason;
    }).toThrow(diagnostic);
  }
  expect(rejected).toBe(true);
}
function withTriggerRemoved(
  name: 'work_package_organization_frozen_delete' | 'work_package_project_organization_update',
  mutate: () => void,
) {
  const selected: unknown = sqlite
    .query<{ sql: unknown }, [string]>(
      "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?",
    )
    .get(name);
  if (
    typeof selected !== 'object' ||
    selected === null ||
    !('sql' in selected) ||
    typeof selected.sql !== 'string'
  )
    throw Error('required fixture trigger absent');
  const original = selected.sql;
  const failures: unknown[] = [];
  try {
    sqlite.run('DROP TRIGGER "' + name + '"');
    mutate();
  } catch (failure: unknown) {
    failures.push(failure);
  }
  try {
    sqlite.run(original);
    expect(
      sqlite.query("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?").get(name),
    ).toEqual({ sql: original });
  } catch (failure: unknown) {
    failures.push(failure);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'fixture corruption and trigger restoration failed', {
      cause: failures[0],
    });
}
function removeParent() {
  expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  const failures: unknown[] = [];
  try {
    sqlite.run('PRAGMA foreign_keys=OFF');
    sqlite.run("DELETE FROM project WHERE id='parent'");
  } catch (failure: unknown) {
    failures.push(failure);
  }
  try {
    sqlite.run('PRAGMA foreign_keys=ON');
    expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  } catch (failure: unknown) {
    failures.push(failure);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'fixture corruption and FK restoration failed', {
      cause: failures[0],
    });
  expect(sqlite.query("SELECT id,project_id FROM work_package WHERE id='package'").get()).toEqual({
    id: 'package',
    project_id: 'parent',
  });
  expect(sqlite.query("SELECT id FROM project WHERE id='parent'").get()).toBeNull();
}
test('refuses an existing package with a missing organization mapping during actual generic capture', async () => {
  withTriggerRemoved('work_package_organization_frozen_delete', () =>
    sqlite.run("DELETE FROM work_package_organization WHERE resource_id='package'"),
  );
  await expectRejection(
    source.history.savedPlanCapture.readPlanInput('package'),
    'settings organization mapping is absent or malformed',
  );
});
test('captures complete real organization definitions and parent in nonlegacy preactivation while absent package stays null', async () => {
  const captured = await source.history.savedPlanCapture.readPlanInput('package');
  expect(captured).not.toBeNull();
  if (captured === null) throw Error('missing capture');
  expect(captured.workPackage.projectId).toBe('parent');
  expect(captured.steps.map(({ id }) => id)).toEqual(['dev']);
  expect(captured.workPackage).not.toHaveProperty('ownerId');
  const definitions: unknown = captured.measureDefinitions?.map(({ id, ...fields }) => fields);
  expect(definitions).toEqual(SEEDED_MEASURE_DEFINITIONS);
  expect(await source.history.savedPlanCapture.readPlanInput('missing')).toBeNull();
});
test('refuses a missing trusted parent after fixture constraints are restored', async () => {
  removeParent();
  await expectRejection(source.history.savedPlanCapture.readPlanInput('package'), 'parent');
});
test('refuses a mismatched parent organization in the same capture observation', async () => {
  withTriggerRemoved('work_package_project_organization_update', () =>
    sqlite.run("UPDATE work_package SET project_id='foreign-parent' WHERE id='package'"),
  );
  await expectRejection(source.history.savedPlanCapture.readPlanInput('package'), 'parent');
});
test('does not decode a foreign mapped package parent through the scoped borrowed capture', async () => {
  removeParent();
  const connection = openConnection(path),
    lifetime = createReadSnapshotLifetime(),
    transaction = drizzleReadTransaction(connection.db);
  transaction.begin();
  try {
    expect(
      await readPlanInputIn(connection.db, 'package', lifetime, undefined, {
        kind: 'scoped',
        scope: { organizationId: 'foreign' },
      }),
    ).toBeNull();
    transaction.commit();
  } catch (cause) {
    transaction.rollback();
    throw cause;
  } finally {
    lifetime.expire();
    connection.close();
  }
});
test('retains parent association and complete definitions in the read snapshot across actual rival edits', async () => {
  await source.close();
  activeSource = undefined;
  custody.hasUnknownOwner = true;
  let changed = false;
  source = openSqliteSourceWithCaptureReadSeam(
    { dbPath: path, dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY },
    {
      afterFirstRead: () => {
        if (changed) return Promise.resolve();
        changed = true;
        removeParent();
        return Promise.resolve();
      },
    },
  );
  activeSource = source;
  custody.hasUnknownOwner = false;
  const captured = await source.history.savedPlanCapture.readPlanInput('package');
  expect(captured).toHaveProperty('workPackage.projectId', 'parent');
  const definitions: unknown = captured?.measureDefinitions?.map(({ id, ...fields }) => fields);
  expect(definitions).toEqual(SEEDED_MEASURE_DEFINITIONS);
  await expectRejection(source.history.savedPlanCapture.readPlanInput('package'), 'parent');
});

test('scoped generic capture distinguishes an orphan mapping from an absent package without foreign DTO decoding', async () => {
  withTriggerRemoved('work_package_organization_frozen_delete', () =>
    sqlite.run("DELETE FROM work_package_organization WHERE resource_id='package'"),
  );
  const connection = openConnection(path),
    lifetime = createReadSnapshotLifetime(),
    transaction = drizzleReadTransaction(connection.db);
  transaction.begin();
  try {
    await expectRejection(
      readPlanInputIn(connection.db, 'package', lifetime, undefined, {
        kind: 'scoped',
        scope: { organizationId: 'org' },
      }),
      'organization',
    );
    expect(
      await readPlanInputIn(connection.db, 'missing', lifetime, undefined, {
        kind: 'scoped',
        scope: { organizationId: 'org' },
      }),
    ).toBeNull();
    transaction.commit();
  } catch (cause) {
    transaction.rollback();
    throw cause;
  } finally {
    lifetime.expire();
    connection.close();
  }
});
