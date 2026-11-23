import { rejects } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ResourceAccess } from '@wbs/core';
import { LEGACY_ACCESS } from '@wbs/core/ports/organization-access';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { createLivePlanStore } from './chain-snapshot';
import { openDatabase, openReadOnlyConnection } from './db';
import { createReadSnapshotLifetime } from './read-snapshot-lifetime';
import { openSqliteSource, openSqliteSourceWithCaptureReadSeam } from './source';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';

let directory: string,
  sqlite: ReturnType<typeof openDatabase>,
  source: ReturnType<typeof openSqliteSource>;
let closeSqlite: (() => void) | undefined;
let closeSource: (() => Promise<void>) | undefined;
const custody = { hasUnknownOwner: false };

async function releaseSource(): Promise<void> {
  const close = closeSource;
  closeSource = undefined;
  await close?.();
}

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'plan-export-'));
  const path = join(directory, 'source.db');
  custody.hasUnknownOwner = false;
  closeSqlite = undefined;
  closeSource = undefined;
  migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, custody);
  sqlite = openDatabase(path);
  closeSqlite = sqlite.close.bind(sqlite, true);
  sqlite.run(
    "INSERT INTO users(id,username,created_at) VALUES('creator','Creator',1),('other','Other',1)",
  );
  sqlite.run(
    "INSERT INTO organization(id,name,legacy,created_at) VALUES('org','Org',0,1),('foreign','Foreign',0,1)",
  );
  sqlite.run(
    "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org','creator','member',1),('org','other','member',1)",
  );
  sqlite.run(
    "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('parent','org','Parent',1,'creator')",
  );
  source = openSqliteSource({
    dbPath: path,
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
  });
  closeSource = source.close.bind(source);
  const created = await source.stores.workPackages.createInOrganization(
    workPackageRow({ id: 'package', projectId: 'parent' }),
    [],
    { by: 'creator', at: 1 },
    'org',
    { id: 'grant', auditId: 'audit' },
  );
  if (typeof created === 'string' || created.id !== 'package')
    throw Error('plan export fixture package birth refused');
  sqlite.run("UPDATE organization SET legacy=1 WHERE id='org'");
});
afterEach(async () => {
  await releaseSource();
  closeSqlite?.();
  if (!custody.hasUnknownOwner) rmSync(directory, { recursive: true });
});
const access = (id = 'creator'): ResourceAccess => ({
  kind: 'scoped',
  scope: { organizationId: 'org', userId: id, cap: null },
  principal: { id },
});
const reader = () => {
  const configured = source.bindLivePlans({ schedulerOf: () => fastScheduler });
  const plans = configured.stores.livePlans;
  if (plans === undefined) throw Error('configured reader absent');
  return plans;
};
test('captures actual legacy isolated export with required parent and ownerless package', async () => {
  const captured = await reader().readExport('package', LEGACY_ACCESS);
  expect(captured.kind).toBe('local');
  if (captured.kind !== 'local') return;
  expect(captured.document.project).toEqual({ id: 'parent', name: 'Parent' });
  expect(captured.workPackage).not.toHaveProperty('ownerId');
  expect(captured.chain).not.toHaveProperty('document');
});
test('uses actual creator grants and hides absent foreign and ungranted scoped packages', async () => {
  sqlite.run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  expect((await reader().readExport('package', access())).kind).toBe('local');
  expect(await reader().readExport('package', access('other'))).toEqual({ kind: 'not_found' });
  expect(await reader().readExport('missing', access('other'))).toEqual({ kind: 'not_found' });
});

test('rechecks grant membership and activation before document scheduling', async () => {
  sqlite.run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  sqlite.run("DELETE FROM access_grant WHERE id='grant'");
  expect(await reader().readExport('package', access())).toEqual({ kind: 'not_found' });
  sqlite.run(
    "DELETE FROM organization_membership WHERE organization_id='org' AND user_id='creator'",
  );
  expect(await reader().readExport('package', access())).toEqual({
    kind: 'access_refused',
    refusal: 'not_a_member',
  });
  expect(await reader().readExport('package', LEGACY_ACCESS)).toEqual({
    kind: 'access_refused',
    refusal: 'no_active_organization',
  });
});
test('retains nested authenticated access before actual pool acquisition', async () => {
  sqlite.run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  await releaseSource();
  const caller = {
    kind: 'scoped' as const,
    scope: { organizationId: 'org', userId: 'creator', cap: null },
    principal: { id: 'creator', authentication: { kind: 'first_party' as const, issuedAt: 1 } },
  };
  source = openSqliteSource({
    dbPath: join(directory, 'source.db'),
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    openReadOnlyConnection: (path) => {
      caller.scope.userId = 'other';
      caller.principal.id = 'other';
      caller.principal.authentication.issuedAt = 999;
      return openReadOnlyConnection(path);
    },
  });
  closeSource = source.close.bind(source);
  expect((await reader().readExport('package', caller)).kind).toBe('local');
  expect(caller.principal.id).toBe('other');
});
test('keeps actual parent and grant from one observation across a rival write and detaches returned metadata', async () => {
  sqlite.run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  await releaseSource();
  let changed = false;
  source = openSqliteSourceWithCaptureReadSeam(
    {
      dbPath: join(directory, 'source.db'),
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    },
    {
      afterFirstRead: async () => {
        if (changed) return;
        changed = true;
        sqlite.run("UPDATE project SET name='Later' WHERE id='parent'");
        sqlite.run("DELETE FROM access_grant WHERE id='grant'");

        return Promise.resolve();
      },
    },
  );
  closeSource = source.close.bind(source);
  const captured = await reader().readExport('package', access());
  expect(captured).toHaveProperty('document.project.name', 'Parent');
  if (captured.kind !== 'local') throw Error('missing local capture');
  Reflect.set(captured.document.project, 'name', 'Caller');
  expect(sqlite.query("SELECT name FROM project WHERE id='parent'").get()).toEqual({
    name: 'Later',
  });
  expect(await reader().readExport('package', access())).toEqual({ kind: 'not_found' });
});
test('throws on selected malformed catalog rather than successful partial export', async () => {
  sqlite.run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  sqlite.run(
    "INSERT INTO access_role_permission(role_id,permission) VALUES('package-manager','unknown.permission')",
  );
  await rejects(reader().readExport('package', access()), (cause: unknown) => {
    expect(() => {
      throw cause;
    }).toThrow('permission vocabulary');
    return true;
  });
  sqlite.run(
    "DELETE FROM access_role_permission WHERE role_id='package-manager' AND permission='unknown.permission'",
  );
});
test('keeps foreign and absent target opaque and checks actual principal coherence', async () => {
  sqlite.run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  sqlite.run(
    "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('foreign','creator','member',1)",
  );
  const foreign: ResourceAccess = {
    kind: 'scoped',
    scope: { organizationId: 'foreign', userId: 'creator', cap: null },
    principal: { id: 'creator' },
  };
  expect(await reader().readExport('package', foreign)).toEqual({ kind: 'not_found' });
  expect(await reader().readExport('absent', foreign)).toEqual({ kind: 'not_found' });
  await rejects(
    reader().readExport('package', {
      kind: 'scoped',
      scope: { organizationId: 'org', userId: 'creator', cap: null },
      principal: { id: 'other' },
    }),
    (cause: unknown) => {
      expect(() => {
        throw cause;
      }).toThrow('principal differs');
      return true;
    },
  );
});
test('a retained purpose reader refuses acquisitions after its real Source closes', async () => {
  const plans = source.bindLivePlans({ schedulerOf: () => fastScheduler }).planExports;
  await releaseSource();
  await rejects(plans.readExport('package', LEGACY_ACCESS), (cause: unknown) => {
    expect(() => {
      throw cause;
    }).toThrow();
    return true;
  });
});

test('borrowed export refuses expiry at the real capture continuation', async () => {
  const lifetime = createReadSnapshotLifetime();
  const plans = createLivePlanStore({
    kind: 'borrowed',
    db: source.db,
    lifetime,
    schedulerOf: () => fastScheduler,
    captureRead: {
      afterFirstRead: async () => {
        lifetime.expire();

        return Promise.resolve();
      },
    },
  });
  await rejects(plans.readExport('package', LEGACY_ACCESS), (cause: unknown) => {
    expect(() => {
      throw cause;
    }).toThrow();
    return true;
  });
});

test('throws for the exact missing trusted parent after fixture constraints are restored', async () => {
  expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  let failed = false;
  let primary: unknown;
  try {
    sqlite.run('PRAGMA foreign_keys=OFF');
    sqlite.run("DELETE FROM project WHERE id='parent'");
  } catch (cause) {
    failed = true;
    primary = cause;
  }
  try {
    sqlite.run('PRAGMA foreign_keys=ON');
    expect(sqlite.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  } catch (restoration) {
    if (failed)
      throw new AggregateError(
        [primary, restoration],
        'missing-parent fixture and constraint restoration failed',
        { cause: restoration },
      );
    throw restoration;
  }
  if (failed) throw primary;
  expect(sqlite.query("SELECT id,project_id FROM work_package WHERE id='package'").get()).toEqual({
    id: 'package',
    project_id: 'parent',
  });
  expect(sqlite.query("SELECT id FROM project WHERE id='parent'").get()).toBeNull();
  await rejects(reader().readExport('package', LEGACY_ACCESS), (cause: unknown) => {
    expect(() => {
      throw cause;
    }).toThrow('settings target parent is absent, malformed or foreign');
    return true;
  });
});

test('supports legacy export of actual mapped nonlegacy preactivation packages', async () => {
  sqlite.run("UPDATE organization SET legacy=0 WHERE id='org'");
  expect(await reader().readExport('package', LEGACY_ACCESS)).toHaveProperty(
    'document.project.name',
    'Parent',
  );
});
