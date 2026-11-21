import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { authorizePackage } from '@wbs/core';
import { CONTRIBUTOR_CAP } from '@wbs/domain';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { openSqliteSource, type SqliteSource } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';

let directory: string, sqlite: Database, source: SqliteSource;
const migrations = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'creator-store-'));
  const path = join(directory, 'store.db');
  runMigrations(path, migrations);
  sqlite = openDatabase(path);
  source = openSqliteSource({
    dbPath: path,
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
  });
  sqlite.run("INSERT INTO users(id,username,created_at) VALUES('creator','Creator',1)");
  sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('org-a','A',1)");
  sqlite.run(
    "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('parent-a','org-a','Parent',1,'creator')",
  );
  sqlite.run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  sqlite.run(
    "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','creator','member',1)",
  );
});
afterEach(async () => {
  await source.close();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

function birth(id = 'p') {
  return {
    draft: structuredClone(workPackageRow({ id, projectId: 'parent-a', createdAt: 17 })),
    stamp: { at: 17, by: 'creator' },
    grant: { id: id + '-grant', auditId: id + '-audit' },
  };
}
function startingStepsFor(workPackageId: string) {
  return [
    {
      id: workPackageId + '-step',
      workPackageId,
      name: 'Dev',
      position: 10,
      code: 'DEV',
      allowancePercent: 0,
      estimateUnit: 'workdays' as const,
    },
  ];
}

function snapshot() {
  return Object.fromEntries(
    [
      'work_package',
      'work_package_organization',
      'step',
      'work_package_abbreviation',
      'work_package_abbreviation_counter',
      'access_grant',
      'organization_audit',
    ].map((table) => [table, sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()]),
  );
}
async function failure(pending: Promise<unknown>, diagnostic: string) {
  let cause: unknown;
  try {
    await pending;
  } catch (error: unknown) {
    cause = error;
  }
  expect(cause).toBeInstanceOf(Error);
  const messages: string[] = [];
  while (cause instanceof Error) {
    messages.push(cause.message);
    cause = cause.cause;
  }
  expect(messages.join('\n')).toContain(diagnostic);
}

it('writes one actual creator grant and audit with the package birth stamp', async () => {
  const { draft, stamp, grant } = birth();
  await source.stores.workPackages.createInOrganization(
    draft,
    startingStepsFor(draft.id),
    stamp,
    'org-a',
    grant,
  );
  expect(
    sqlite
      .query('SELECT id,scope_id,subject_id,role_id,origin,created_at,created_by FROM access_grant')
      .all(),
  ).toEqual([
    {
      id: 'p-grant',
      scope_id: 'p',
      subject_id: 'creator',
      role_id: 'package-manager',
      origin: 'creation',
      created_at: 17,
      created_by: 'creator',
    },
  ]);
  expect(
    sqlite.query('SELECT id,actor_id,action,subject_id,created_at FROM organization_audit').all(),
  ).toEqual([
    {
      id: 'p-audit',
      actor_id: 'creator',
      action: 'access_granted',
      subject_id: 'p-grant',
      created_at: 17,
    },
  ]);
});

for (const stage of ['grant', 'audit'] as const)
  it('rolls every constituent back when creator ' + stage + ' insertion fails', async () => {
    const { draft, stamp, grant } = birth();
    const table = stage === 'grant' ? 'access_grant' : 'organization_audit';
    sqlite.run(
      `CREATE TRIGGER refuse_creator BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'controlled creator ${stage} failure'); END`,
    );
    const before = snapshot();
    await failure(
      source.stores.workPackages.createInOrganization(
        draft,
        startingStepsFor(draft.id),
        stamp,
        'org-a',
        grant,
      ),
      'controlled creator ' + stage + ' failure',
    );
    expect(snapshot()).toEqual(before);
  });

for (const state of ['membership', 'role'] as const)
  it('rolls package insertion back on the borrowed creator ' + state + ' refusal', async () => {
    const { draft, stamp, grant } = birth();
    if (state === 'membership') sqlite.run('DELETE FROM organization_membership');
    else sqlite.run("DELETE FROM access_role WHERE id='package-manager'");
    const before = snapshot();
    await failure(
      source.stores.workPackages.createInOrganization(
        draft,
        startingStepsFor(draft.id),
        stamp,
        'org-a',
        grant,
      ),
      'package creator grant refused: ' +
        (state === 'membership' ? 'not_a_member' : 'unknown_role'),
    );
    expect(snapshot()).toEqual(before);
  });

it('rolls creator rows and all package constituents back with a later borrowed Source refusal', async () => {
  const { draft, stamp, grant } = birth(),
    before = snapshot();
  await source.uow.run(async (scope) => {
    await scope.stores.workPackages.createInOrganization(
      draft,
      startingStepsFor(draft.id),
      stamp,
      'org-a',
      grant,
    );
    return { commit: false, value: undefined };
  });
  expect(snapshot()).toEqual(before);
});

it('retains the complete explicit birth before its repository waits', async () => {
  const { draft, stamp, grant } = birth();
  let release: () => void = () => {
    throw new Error('held owner is not entered');
  };
  const held = source.gate.enter(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await Promise.resolve();
  const starting = startingStepsFor(draft.id);
  const pending = source.stores.workPackages.createInOrganization(
    draft,
    starting,
    stamp,
    'org-a',
    grant,
  );
  draft.name = 'Changed';
  Object.assign(draft.pertWeights, { optimistic: 99 });
  starting[0].name = 'Changed';
  stamp.by = 'absent';
  stamp.at = 999;
  grant.id = 'changed';
  grant.auditId = 'changed-audit';
  release();
  await held;
  await pending;
  expect(await source.stores.workPackages.findById('p')).toMatchObject({
    name: 'Rewire the shed',
    pertWeights: { optimistic: 1 },
    createdAt: 17,
  });
  expect(sqlite.query('SELECT id,created_at,created_by FROM access_grant').all()).toEqual([
    { id: 'p-grant', created_at: 17, created_by: 'creator' },
  ]);
  expect(await source.stores.workPackages.stepsOf('p')).toMatchObject([
    { id: 'p-step', name: 'Dev' },
  ]);
});

it('keeps the legitimate account creator grant separate from credential grants and their contributor cap', async () => {
  const { draft, stamp, grant } = birth();
  const credentialId = crypto.randomUUID();
  draft.restricted = true;
  await source.stores.workPackages.createInOrganization(
    draft,
    startingStepsFor(draft.id),
    stamp,
    'org-a',
    grant,
  );
  const human = {
    kind: 'scoped' as const,
    principal: { id: 'creator' },
    scope: { organizationId: 'org-a', userId: 'creator', cap: null },
  };
  expect(
    await authorizePackage(
      source.stores.accessDecisions,
      human,
      draft,
      'creator',
      'package.manage_settings',
    ),
  ).toMatchObject({ ok: true });
  sqlite.run(
    "INSERT INTO person(id,name,kind,account_id) VALUES('agent','Agent','agent','creator')",
  );
  sqlite.run(
    "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('agent','org-a','Agent')",
  );
  sqlite.run(
    "INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,created_at,created_by) VALUES(?,'org-a','agent','creator','api_key','Agent',1,'creator')",
    [credentialId],
  );
  const machine = {
    ...human,
    principal: {
      id: 'creator',
      authentication: { kind: 'machine' as const, credentialId, personId: 'agent' },
    },
    scope: { ...human.scope, cap: CONTRIBUTOR_CAP },
  };
  expect(
    await authorizePackage(
      source.stores.accessDecisions,
      machine,
      draft,
      'creator',
      'package.write',
    ),
  ).toMatchObject({ ok: false, reason: 'not_found' });
  sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('explicit-credential','org-a','work_package','p','machine_credential',?,'package-manager','route',1)",
    [credentialId],
  );
  expect(
    await authorizePackage(
      source.stores.accessDecisions,
      machine,
      draft,
      'creator',
      'package.write',
    ),
  ).toMatchObject({ ok: true });
  expect(
    await authorizePackage(
      source.stores.accessDecisions,
      machine,
      draft,
      'creator',
      'package.manage_settings',
    ),
  ).toMatchObject({ ok: false, reason: 'forbidden', permission: 'package.manage_settings' });
  expect(
    sqlite.query("SELECT id,origin FROM access_grant WHERE subject_kind='user'").all(),
  ).toEqual([{ id: 'p-grant', origin: 'creation' }]);
});

it('never commits duplicate package birth or missing/reused creator identities', async () => {
  const { draft, stamp, grant } = birth();
  await source.stores.workPackages.createInOrganization(
    draft,
    startingStepsFor(draft.id),
    stamp,
    'org-a',
    grant,
  );
  const before = snapshot();
  await failure(
    source.stores.workPackages.createInOrganization(draft, [], stamp, 'org-a', {
      id: 'other-grant',
      auditId: 'other-audit',
    }),
    'UNIQUE',
  );
  expect(snapshot()).toEqual(before);
  for (const identities of [
    { id: '', auditId: 'new-audit' },
    { id: 'same', auditId: 'same' },
  ]) {
    await failure(
      source.stores.workPackages.createInOrganization(
        { ...draft, id: 'q' },
        [],
        stamp,
        'org-a',
        identities,
      ),
      'present and distinct',
    );
    expect(snapshot()).toEqual(before);
  }
});
