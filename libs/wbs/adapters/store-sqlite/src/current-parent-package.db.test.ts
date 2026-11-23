import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { type Connection, openConnection, openDatabase } from './db';
import { WriteCoordinator } from './gate';
import { SavedPlanRepository } from './saved-plan';
import { StepCatalogueRepository } from './step-catalogue';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { WorkPackageRepository } from './work-package';

let directory: string, sqlite: Database, connection: Connection, packages: WorkPackageRepository;
let custody: { hasUnknownOwner: boolean; sqlite?: Database; connection?: Connection };
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'current-parent-package-'));
  const path = join(directory, 'store.db');
  custody = { hasUnknownOwner: false };
  migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, custody);
  sqlite = openDatabase(path);
  custody.sqlite = sqlite;
  connection = openConnection(path);
  custody.connection = connection;
  packages = new WorkPackageRepository(connection.db, new WriteCoordinator());
  sqlite.run("INSERT INTO users(id,username,created_at) VALUES('creator','Creator',1)");
  sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('org-a','A',1),('org-b','B',1)");
  sqlite.run(
    "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','creator','member',1)",
  );
  sqlite.run(
    "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('parent','org-a','Parent',1,'creator'),('foreign','org-b','Foreign',1,'creator')",
  );
});
afterEach(() => {
  try {
    custody.connection?.close();
  } finally {
    custody.sqlite?.close();
  }
  if (!custody.hasUnknownOwner) rmSync(directory, { recursive: true });
});

async function bindParentStep() {
  const catalogue = new StepCatalogueRepository(connection.db, new WriteCoordinator(), 'owned');
  const bound = await catalogue.defineAndBindStep(
    'org-a',
    {
      id: 'dev',
      name: 'Dev',
      code: 'dev',
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
}

function create(parent = 'parent', id = 'package') {
  sqlite.run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  return packages.createInOrganization(
    { ...workPackageRow({ id, projectId: parent, createdAt: 17 }), projectId: parent },
    [],
    { by: 'creator', at: 17 },
    'org-a',
    { id: id + '-grant', auditId: id + '-audit' },
  );
}
function snapshot() {
  return Object.fromEntries(
    [
      'work_package',
      'work_package_organization',
      'work_package_step',
      'setting_value',
      'work_package_abbreviation',
      'work_package_abbreviation_counter',
      'access_grant',
      'organization_audit',
    ].map((table) => [table, sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()]),
  );
}
it('creates an ownerless package under its explicit current-schema parent with creator grant and audit', async () => {
  await bindParentStep();
  const created = await create();
  expect(created).toMatchObject({ id: 'package', projectId: 'parent' });
  expect(created).not.toHaveProperty('ownerId');
  expect(
    sqlite
      .query(
        'SELECT work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision FROM work_package_step',
      )
      .all(),
  ).toEqual([
    {
      work_package_id: 'package',
      step_id: 'dev',
      estimate_unit: 'workdays',
      allowance_bps: 0,
      allowance_revision: 0,
    },
  ]);
  expect(sqlite.query('SELECT project_id,created_by FROM work_package').all()).toEqual([
    { project_id: 'parent', created_by: 'creator' },
  ]);
  expect(
    (await packages.listForInOrganization('creator', 'org-a')).map((row) => ({
      id: row.id,
      createdByName: row.createdByName,
    })),
  ).toEqual([{ id: 'package', createdByName: 'Creator' }]);
  expect(sqlite.query('SELECT scope_id,subject_id,role_id,origin FROM access_grant').all()).toEqual(
    [
      {
        scope_id: 'package',
        subject_id: 'creator',
        role_id: 'package-manager',
        origin: 'creation',
      },
    ],
  );
  expect(sqlite.query('SELECT id,actor_id,action FROM organization_audit').all()).toEqual([
    { id: 'package-audit', actor_id: 'creator', action: 'access_granted' },
  ]);
});
it.each(['missing', 'foreign'])(
  'refuses parent %s identically before any constituent write',
  async (parent) => {
    await bindParentStep();
    const before = snapshot();
    expect(await create(parent)).toBe('not_found');
    expect(snapshot()).toEqual(before);
  },
);
it.each(['work_package_organization', 'work_package_step', 'access_grant', 'organization_audit'])(
  'rolls all birth state back when %s insertion fails',
  async (table) => {
    await bindParentStep();
    sqlite.run(
      'CREATE TRIGGER fail_birth BEFORE INSERT ON ' +
        table +
        " BEGIN SELECT RAISE(ABORT,'birth failure'); END",
    );
    const before = snapshot();
    let failure: unknown;
    try {
      await create();
    } catch (cause: unknown) {
      failure = cause;
    }
    const messages: string[] = [];
    while (failure instanceof Error) {
      messages.push(failure.message);
      failure = failure.cause;
    }
    expect(messages.join('\n')).toContain('birth failure');
    expect(snapshot()).toEqual(before);
  },
);

it.each(['rename', 'delete'] as const)(
  'refuses a legacy %s admitted before activation after the actual marker changes',
  async (operation) => {
    sqlite.run("UPDATE organization SET legacy=1 WHERE id='org-a'");
    await packages.create(
      { ...workPackageRow({ id: 'package', projectId: 'parent', createdAt: 1 }) },
      [],
      { by: 'creator', at: 1 },
    );
    const plans = new SavedPlanRepository({
      openConnection: () => openConnection(join(directory, 'store.db')),
    });
    await plans.write(
      {
        id: 'save',
        workPackageId: 'package',
        name: 'Before',
        createdBy: 'Creator',
        createdById: 'creator',
        createdAt: 1,
        input: { schemaVersion: 11, bytes: '{}', sha256: '1'.repeat(64) },
        schedule: { present: false, absentReason: 'not_asked' },
      },
      () => Promise.resolve(null),
    );
    const context = {
      kind: 'legacy' as const,
      actorId: 'creator',
      source: 'internal' as const,
      operation,
    };
    sqlite.run(
      "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
    );
    const outcome =
      operation === 'rename'
        ? await plans.renameTo('save', 'After', context)
        : await plans.deleteOf('save', context);
    expect(outcome).toBe('no_active_organization');
    expect(sqlite.query("SELECT name FROM saved_plan WHERE id='save'").all()).toEqual([
      { name: 'Before' },
    ]);
  },
);

async function legacyPlan(author: string | null = 'creator') {
  sqlite.run("UPDATE organization SET legacy=1 WHERE id='org-a'");
  sqlite.run(
    "INSERT INTO users(id,username,created_at) VALUES('author','Author',1),('other','Other',1)",
  );
  await packages.create(workPackageRow({ id: 'package', projectId: 'parent' }), [], {
    by: 'creator',
    at: 1,
  });
  const plans = new SavedPlanRepository({
    openConnection: () => openConnection(join(directory, 'store.db')),
  });
  await plans.write(
    {
      id: 'save',
      workPackageId: 'package',
      name: 'Before',
      createdBy: 'Same display',
      createdById: author,
      createdAt: 1,
      input: {
        schemaVersion: 11,
        bytes: 'corrupt body remains maintainable',
        sha256: '1'.repeat(64),
      },
      schedule: { present: false, absentReason: 'not_asked' },
    },
    () => Promise.resolve(null),
  );
  return plans;
}
it.each(['rename', 'delete'] as const)(
  'lets the actual legacy saved author %s without body decoding',
  async (operation) => {
    const plans = await legacyPlan('author');
    const before = await plans.readOf('save');
    const touch = {
      kind: 'legacy' as const,
      source: 'internal' as const,
      actorId: 'author',
      operation,
    };
    expect(
      operation === 'rename'
        ? await plans.renameTo('save', 'After', touch)
        : await plans.deleteOf('save', touch),
    ).toBe('touched');
    const after = await plans.readOf('save');
    if (operation === 'rename') {
      expect(after?.header.name).toBe('After');
      expect(after?.bodies).toEqual(before?.bodies);
      expect(after?.header.inputSha256).toBe(before?.header.inputSha256);
    } else {
      expect(after).toBeNull();
      expect(
        sqlite.query("SELECT * FROM saved_plan_body WHERE saved_plan_id='save'").all(),
      ).toEqual([]);
    }
  },
);
it.each(['author', null])(
  'does not grant package creator authority over saved author %s',
  async (author) => {
    const plans = await legacyPlan(author),
      before = await plans.readOf('save');
    expect(
      await plans.deleteOf('save', {
        kind: 'legacy',
        source: 'internal',
        actorId: 'creator',
        operation: 'delete',
      }),
    ).toBe('forbidden');
    expect(await plans.readOf('save')).toEqual(before);
  },
);
it('rechecks current saved authorship after an earlier principals read and actual account deletion', async () => {
  const plans = await legacyPlan('author');
  expect((await plans.principalsOf('save'))?.createdById).toBe('author');
  sqlite.run("DELETE FROM users WHERE id='author'");
  expect(
    await plans.renameTo('save', 'After', {
      kind: 'legacy',
      source: 'internal',
      actorId: 'author',
      operation: 'rename',
    }),
  ).toBe('forbidden');
  expect((await plans.readOf('save'))?.header).toMatchObject({ name: 'Before', createdById: null });
});
it('retains the explicit touch actor before acquiring its actual connection', async () => {
  await legacyPlan('author');
  const touch = {
    kind: 'legacy' as const,
    source: 'internal' as const,
    actorId: 'author',
    operation: 'rename' as const,
  };
  const plans = new SavedPlanRepository({
    openConnection: () => {
      touch.actorId = 'other';
      return openConnection(join(directory, 'store.db'));
    },
  });
  expect(await plans.renameTo('save', 'After', touch)).toBe('touched');
  expect(sqlite.query("SELECT name FROM saved_plan WHERE id='save'").all()).toEqual([
    { name: 'After' },
  ]);
});
it('keeps snapshot_busy when another real connection holds the writer lock', async () => {
  const plans = await legacyPlan(),
    locked = openDatabase(join(directory, 'store.db'));
  locked.run('BEGIN IMMEDIATE');
  try {
    expect(
      await plans.renameTo('save', 'After', {
        kind: 'legacy',
        source: 'internal',
        actorId: 'creator',
        operation: 'rename',
      }),
    ).toBe('snapshot_busy');
  } finally {
    locked.run('ROLLBACK');
    locked.close();
  }
  expect((await plans.readOf('save'))?.header.name).toBe('Before');
});
it.each(['absent', 'malformed'] as const)(
  'refuses an actual %s activation marker without touching the saved header',
  async (state) => {
    const plans = await legacyPlan();
    sqlite.run('DROP TABLE organization_activation');
    if (state === 'malformed') {
      sqlite.run(
        'CREATE TABLE organization_activation(singleton INTEGER,state TEXT,activated_at INTEGER)',
      );
      sqlite.run("INSERT INTO organization_activation VALUES(1,'unknown',NULL)");
    }
    await expectFailure(
      plans.deleteOf('save', {
        kind: 'legacy',
        source: 'internal',
        actorId: 'creator',
        operation: 'delete',
      }),
      state === 'absent' ? 'activation marker is absent' : 'activation marker is malformed',
    );
    expect((await plans.readOf('save'))?.header.name).toBe('Before');
  },
);
it('refuses omitted legacy writer admission instead of treating it as success', async () => {
  const plans = await legacyPlan();
  await expectFailure(
    Reflect.apply(plans.renameTo.bind(plans), undefined, ['save', 'After']),
    'admission is missing',
  );
  expect((await plans.readOf('save'))?.header.name).toBe('Before');
});
it('checks the actual explicit parent after a queued writer begins', async () => {
  sqlite.run(
    "UPDATE organization_activation SET state='activated',activated_at=1 WHERE singleton=1",
  );
  const gate = new WriteCoordinator(),
    queued = new WorkPackageRepository(connection.db, gate);
  let release: () => void = () => {
    throw new Error('release latch not installed');
  };
  let entered: () => void = () => {
    throw new Error('entry latch not installed');
  };
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const first = gate.enter(async () => {
    entered();
    await held;
  });
  await inside;
  const pending = queued.createInOrganization(
    workPackageRow({ id: 'queued', projectId: 'parent' }),
    [],
    { by: 'creator', at: 1 },
    'org-a',
    { id: 'queued-grant', auditId: 'queued-audit' },
  );
  sqlite.run("DELETE FROM project WHERE id='parent'");
  const before = snapshot();
  release();
  await first;
  expect(await pending).toBe('not_found');
  expect(snapshot()).toEqual(before);
});

async function expectFailure(pending: unknown, diagnostic: string) {
  let failure: unknown;
  try {
    await Promise.resolve(pending);
  } catch (cause: unknown) {
    failure = cause;
  }
  const messages: string[] = [];
  while (failure instanceof Error) {
    messages.push(failure.message);
    failure = failure.cause;
  }
  expect(messages.join('\n')).toContain(diagnostic);
}

it('refuses a missing required rename payload without interpreting it as deletion', async () => {
  await legacyPlan();
  let acquisitions = 0;
  const plans = new SavedPlanRepository({
    openConnection: () => {
      acquisitions += 1;
      return openConnection(join(directory, 'store.db'));
    },
  });
  let failure: unknown;
  try {
    await Promise.resolve(
      Reflect.apply(plans.renameTo.bind(plans), undefined, [
        'save',
        undefined,
        { kind: 'legacy', source: 'internal', actorId: 'creator', operation: 'rename' },
      ]),
    );
  } catch (cause: unknown) {
    failure = cause;
  }
  expect(acquisitions).toBe(0);
  expect((await plans.readOf('save'))?.header.name).toBe('Before');
  expect(failure).toBeInstanceOf(Error);
});
