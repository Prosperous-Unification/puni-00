import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { migrateEmptyCatalogueFixture } from '@wbs/store-sqlite/testing/catalogue-database';
import { expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

const ORGANIZATION = 'catalogue-http-org',
  FOREIGN_ORGANIZATION = 'catalogue-http-foreign-org';
const PROJECT = 'catalogue-http-project',
  SIBLING = 'catalogue-http-sibling',
  SPACE_PEER = 'catalogue-http-space-peer';
const EMPTY_PROJECT = 'catalogue-http-empty',
  FOREIGN_PROJECT = 'catalogue-http-foreign-project';
const SPACE = 'catalogue-http-space',
  FOREIGN_SPACE = 'catalogue-http-foreign-space';
const STEP = 'catalogue-http-existing',
  FOREIGN_STEP = 'catalogue-http-foreign-step',
  RETIRABLE = 'catalogue-http-retirable';
const TYPE = 'catalogue-http-type',
  FOREIGN_TYPE = 'catalogue-http-foreign-type';
const actors = [
  'admin',
  'space-manager',
  'project-manager',
  'reader',
  'hidden',
  'nonmember',
] as const;
type Actor = (typeof actors)[number];
interface Fixture {
  readonly harness: OrganizationHarness;
  readonly stamp: WriteStamp;
  readonly pushes: unknown[];
}

/**
 * Actual mounted application, activated membership/grants and current catalogue-only SQLite.
 * The sixth local registration uses the existing controllable service clock after the real
 * 60-second password throttle window; all previously issued 12-hour sessions stay current.
 */
async function withinFixture(
  exercise: (fixture: Fixture) => Promise<void>,
  observePush?: (harness: OrganizationHarness) => void,
): Promise<void> {
  const custody = { hasUnknownOwner: false };
  const pushes: unknown[] = [];
  let now = Date.now();
  let namespace: string | undefined;
  let harness: OrganizationHarness;
  try {
    harness = OrganizationHarness.openComposedWith({
      now: () => now,
      migrate: (path) => {
        namespace = dirname(path);
        migrateEmptyCatalogueFixture({ path, directory: namespace, reportedAt: 100 }, custody);
      },
      pushFetch: (_url, request) => {
        pushes.push(request?.body);
        observePush?.(harness);
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      },
    });
  } catch (cause: unknown) {
    throw new Error('current catalogue HTTP acquisition failed; retain ' + String(namespace), {
      cause,
    });
  }
  let closing: Promise<void> | undefined;
  const close = () => (closing ??= harness.closeComposed());
  let primary: { cause: unknown } | undefined;
  try {
    for (const actor of actors) {
      if (actor === 'nonmember') now += 60_000;
      await harness.register(actor);
    }
    harness.organization(ORGANIZATION);
    harness.organization(FOREIGN_ORGANIZATION);
    for (const actor of actors) {
      if (actor !== 'nonmember') harness.member(ORGANIZATION, actor, 'member');
      harness.bind(actor, ORGANIZATION);
    }
    harness.member(FOREIGN_ORGANIZATION, 'admin', 'member');
    harness.grant(ORGANIZATION, 'admin', 'org-admin');
    harness.grant(ORGANIZATION, 'reader', 'org-viewer');
    harness.grantPermissions(ORGANIZATION, 'space-manager', [
      'organization.read',
      'organization.manage_spaces',
    ]);
    harness.activate();
    const stamp = { at: 100, by: harness.userId('admin') };
    for (const [id, organization] of [
      [SPACE, ORGANIZATION],
      [FOREIGN_SPACE, FOREIGN_ORGANIZATION],
    ] as const)
      harness.sqlite.run(
        'INSERT INTO space(id,organization_id,name,revision,created_at,created_by) VALUES(?,?,?,0,100,?)',
        [id, organization, id, stamp.by],
      );
    for (const [id, organization, spaceId, spacePosition] of [
      [PROJECT, ORGANIZATION, SPACE, 10],
      [SPACE_PEER, ORGANIZATION, SPACE, 20],
      [SIBLING, ORGANIZATION, null, null],
      [EMPTY_PROJECT, ORGANIZATION, null, null],
      [FOREIGN_PROJECT, FOREIGN_ORGANIZATION, FOREIGN_SPACE, 10],
    ] as const)
      harness.sqlite.run(
        'INSERT INTO project(id,organization_id,name,created_by,created_at,space_id,space_position) VALUES(?,?,?,?,100,?,?)',
        [id, organization, id, stamp.by, spaceId, spacePosition],
      );
    for (const [id, organization] of [
      [TYPE, ORGANIZATION],
      [FOREIGN_TYPE, FOREIGN_ORGANIZATION],
    ] as const) {
      harness.sqlite.run('INSERT INTO work_item_type(id,name) VALUES(?,?)', [id, id]);
      harness.sqlite.run(
        'INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES(?,?,?)',
        [id, organization, id],
      );
    }
    harness.grant(ORGANIZATION, 'project-manager', 'project-manager', 'project', PROJECT);
    harness.grant(ORGANIZATION, 'project-manager', 'project-viewer', 'project', SIBLING);
    await harness.publicWrites().uow.run(async ({ stores }) => {
      for (const [id, organization] of [
        [PROJECT, ORGANIZATION],
        [SPACE_PEER, ORGANIZATION],
        [SIBLING, ORGANIZATION],
        [FOREIGN_PROJECT, FOREIGN_ORGANIZATION],
      ] as const) {
        const created = await stores.workPackages.createInOrganization(
          workPackageRow({ id: id + ':package', projectId: id, name: id }),
          [],
          stamp,
          organization,
          { id: id + ':grant', auditId: id + ':audit' },
        );
        expect(typeof created).toBe('object');
        if (typeof created === 'string')
          throw new Error('catalogue HTTP package birth refused: ' + created);
      }
      for (const [id, organization, scopeKind, scopeId] of [
        [STEP, ORGANIZATION, 'organization', ORGANIZATION],
        [FOREIGN_STEP, FOREIGN_ORGANIZATION, 'organization', FOREIGN_ORGANIZATION],
        [RETIRABLE, ORGANIZATION, 'project', EMPTY_PROJECT],
      ] as const)
        expect(
          (
            await stores.stepCatalogue.defineAndBindStep(
              organization,
              {
                id,
                code: id,
                name: id,
                position: 1,
                defaultEstimateUnit: 'workdays',
                defaultAllowancePercent: 7,
              },
              {
                bindingId: id + ':binding',
                scopeKind,
                scopeId,
                workItemTypeId: null,
                position: 10,
              },
              stamp,
            )
          ).ok,
        ).toBe(true);
      const catalogue = await stores.stepCatalogue.readCatalogue(ORGANIZATION);
      if (catalogue === null) throw new Error('current catalogue fixture owner absent');
      expect(catalogue.definitions.map((definition) => definition.id).sort()).toEqual(
        [STEP, RETIRABLE].sort(),
      );
      expect(
        (await stores.stepCatalogue.readPackage(ORGANIZATION, PROJECT + ':package'))?.steps.map(
          (step) => step.stepId,
        ),
      ).toEqual([STEP]);
      return { commit: true, value: undefined };
    });
    expect(harness.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(
      harness.sqlite
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name='step'")
        .all(),
    ).toEqual([]);
    pushes.length = 0;
    await exercise({ harness, stamp, pushes });
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'current catalogue HTTP owner and close failed; retain ' + String(namespace),
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
  if (custody.hasUnknownOwner) throw new Error('current catalogue HTTP lower owner unresolved');
}

/** Detached complete persisted state, including schema, events, grants and package values. */
function snapshot(fixture: Fixture) {
  const db = fixture.harness.sqlite;
  const schema = db
    .query('SELECT type,name,tbl_name,rootpage,sql FROM sqlite_master ORDER BY type,name')
    .all();
  const tables = db
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map(({ name }) => {
      const rows = db.query('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all();
      rows.sort((left, right) =>
        Buffer.compare(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right))),
      );
      return { name, rows };
    });
  return structuredClone({ schema, tables });
}
function packageValues(fixture: Fixture) {
  return fixture.harness.sqlite
    .query('SELECT * FROM work_package_step ORDER BY work_package_id,step_id')
    .all();
}
function define(scopeKind: 'organization' | 'space' | 'project', scopeId: string, code: string) {
  return {
    scopeKind,
    scopeId,
    workItemTypeId: null,
    position: 30,
    define: {
      code,
      name: 'Created ' + code,
      position: 30,
      defaultEstimateUnit: 'minutes',
      defaultAllowanceBps: 1234,
    },
  };
}
async function list(fixture: Fixture, actor: Actor = 'admin') {
  return fixture.harness.call(actor, 'GET', '/api/organization/steps');
}
async function healthyList(fixture: Fixture) {
  expect(await list(fixture)).toMatchObject({
    status: 200,
    body: {
      definitions: expect.arrayContaining([
        {
          id: STEP,
          organizationId: ORGANIZATION,
          code: STEP,
          name: STEP,
          defaultEstimateUnit: 'workdays',
          defaultAllowanceBps: 700,
          position: 1,
          definedAt: { scopeKind: 'organization', scopeId: ORGANIZATION },
          origin: 'authored',
        },
      ]) as unknown,
      bindings: expect.arrayContaining([
        expect.objectContaining({
          bindingId: STEP + ':binding',
          stepId: STEP,
          scopeKind: 'organization',
          scopeId: ORGANIZATION,
          workItemTypeId: null,
        }),
      ]) as unknown,
    },
  });
}

for (const [scopeKind, scopeId, actor, expectedPackages] of [
  ['organization', ORGANIZATION, 'admin', [PROJECT, SPACE_PEER, SIBLING]],
  ['space', SPACE, 'space-manager', [PROJECT, SPACE_PEER]],
  ['project', PROJECT, 'project-manager', [PROJECT]],
] as const) {
  test(
    'current global catalogue HTTP atomically defines and binds at ' + scopeKind,
    async () => {
      await withinFixture(async (fixture) => {
        const before = packageValues(fixture);
        const code = 'http-' + scopeKind;
        const answer = await fixture.harness.call(
          actor,
          'POST',
          '/api/organization/step-bindings',
          define(scopeKind, scopeId, code),
        );
        expect(answer).toMatchObject({
          status: 201,
          body: {
            definition: {
              code,
              name: 'Created ' + code,
              defaultEstimateUnit: 'minutes',
              defaultAllowanceBps: 1234,
              definedAt: { scopeKind, scopeId },
            },
            binding: { scopeKind, scopeId, workItemTypeId: null, position: 30 },
          },
        });
        const definition = fixture.harness.sqlite
          .query<{ id: string }, [string, string]>(
            'SELECT id FROM step_definition WHERE organization_id=? AND code=?',
          )
          .get(ORGANIZATION, code);
        if (definition === null)
          throw new Error('successful define-and-bind did not persist a definition');
        expect(
          fixture.harness.sqlite
            .query(
              'SELECT scope_kind,scope_id,step_id,work_item_type_id,position FROM step_binding WHERE step_id=?',
            )
            .all(definition.id),
        ).toEqual([
          {
            scope_kind: scopeKind,
            scope_id: scopeId,
            step_id: definition.id,
            work_item_type_id: null,
            position: 30,
          },
        ]);
        expect(
          fixture.harness.sqlite
            .query(
              'SELECT work_package_id,estimate_unit,allowance_bps,allowance_revision FROM work_package_step WHERE step_id=? ORDER BY work_package_id',
            )
            .all(definition.id),
        ).toEqual(
          [...expectedPackages]
            .map((id) => ({
              work_package_id: id + ':package',
              estimate_unit: 'minutes',
              allowance_bps: 1234,
              allowance_revision: 0,
            }))
            .sort((left, right) => (left.work_package_id < right.work_package_id ? -1 : 1)),
        );
        expect(
          fixture.harness.sqlite
            .query(
              'SELECT * FROM work_package_step WHERE step_id<>? ORDER BY work_package_id,step_id',
            )
            .all(definition.id),
        ).toEqual(before);
        expect(fixture.harness.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
        const committed = snapshot(fixture),
          announcements = [...fixture.pushes];
        expect(
          await fixture.harness.call(actor, 'POST', '/api/organization/step-bindings', {
            scopeKind,
            scopeId,
            stepId: definition.id,
            workItemTypeId: null,
            position: 40,
          }),
        ).toEqual({ status: 409, body: { error: 'duplicate_binding' } });
        expect(snapshot(fixture)).toEqual(committed);
        expect(fixture.pushes).toEqual(announcements);
      });
    },
    60000,
  );
}

test('current global catalogue HTTP lists only the selected organization under organization read', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    expect(await list(fixture, 'reader')).toEqual(await list(fixture));
    expect(JSON.stringify((await list(fixture)).body)).not.toContain(FOREIGN_STEP);
    const before = snapshot(fixture),
      announcements = [...fixture.pushes];
    expect(await list(fixture, 'hidden')).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.read' },
    });
    expect(await list(fixture, 'nonmember')).toMatchObject({
      status: 403,
      body: { error: 'not_a_member' },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
  });
}, 60000);

test('current global catalogue HTTP renames immutable identity and retires only an unbound definition', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    const values = packageValues(fixture);
    expect(
      await fixture.harness.call('admin', 'PATCH', '/api/organization/steps/' + STEP, {
        name: 'Renamed current step',
      }),
    ).toMatchObject({
      status: 200,
      body: { definition: { id: STEP, code: STEP, name: 'Renamed current step' } },
    });
    expect(packageValues(fixture)).toEqual(values);
    const before = snapshot(fixture),
      announcements = [...fixture.pushes];
    expect(
      await fixture.harness.call('admin', 'DELETE', '/api/organization/steps/' + STEP),
    ).toEqual({ status: 409, body: { error: 'step_bound' } });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
    await fixture.harness.publicWrites().uow.run(async ({ stores }) => {
      expect(
        await stores.stepCatalogue.unbindStep(
          ORGANIZATION,
          RETIRABLE + ':binding',
          { dryRun: false },
          fixture.stamp,
        ),
      ).toMatchObject({ kind: 'unbound' });
      return { commit: true, value: undefined };
    });
    expect(
      (await fixture.harness.call('admin', 'DELETE', '/api/organization/steps/' + RETIRABLE))
        .status,
    ).toBe(204);
    expect(await list(fixture)).toMatchObject({
      status: 200,
      body: {
        definitions: expect.not.arrayContaining([
          expect.objectContaining({ id: RETIRABLE }),
        ]) as unknown,
      },
    });
    expect(packageValues(fixture)).toEqual(values);
  });
}, 60000);

test('current global catalogue HTTP admits each actual scope and conceals foreign scope type and definition', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    const before = snapshot(fixture),
      announcements = [...fixture.pushes];
    for (const [actor, scopeKind, scopeId, permission] of [
      ['space-manager', 'organization', ORGANIZATION, 'organization.manage_settings'],
      ['reader', 'space', SPACE, 'organization.manage_spaces'],
      ['project-manager', 'project', SIBLING, 'project.manage_settings'],
    ] as const)
      expect(
        await fixture.harness.call(
          actor,
          'POST',
          '/api/organization/step-bindings',
          define(scopeKind, scopeId, 'refused-' + scopeKind),
        ),
      ).toEqual({ status: 403, body: { error: 'forbidden', permission } });
    for (const [scopeKind, scopeId] of [
      ['organization', FOREIGN_ORGANIZATION],
      ['organization', 'absent-org'],
      ['space', FOREIGN_SPACE],
      ['space', 'absent-space'],
      ['project', FOREIGN_PROJECT],
      ['project', 'absent-project'],
    ] as const)
      expect(
        await fixture.harness.call(
          'admin',
          'POST',
          '/api/organization/step-bindings',
          define(scopeKind, scopeId, 'foreign'),
        ),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
    for (const workItemTypeId of [FOREIGN_TYPE, 'absent-type'])
      expect(
        await fixture.harness.call('admin', 'POST', '/api/organization/step-bindings', {
          ...define('project', PROJECT, 'foreign-type'),
          workItemTypeId,
        }),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
    for (const stepId of [FOREIGN_STEP, 'absent-step']) {
      expect(
        await fixture.harness.call('admin', 'POST', '/api/organization/step-bindings', {
          scopeKind: 'project',
          scopeId: PROJECT,
          workItemTypeId: null,
          position: 40,
          stepId,
        }),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
      expect(
        await fixture.harness.call('admin', 'PATCH', '/api/organization/steps/' + stepId, {
          name: 'Hidden',
        }),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
      expect(
        await fixture.harness.call('admin', 'DELETE', '/api/organization/steps/' + stepId),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
    }
    for (const actor of ['space-manager', 'project-manager'] as const) {
      expect(
        await fixture.harness.call(actor, 'PATCH', '/api/organization/steps/' + STEP, {
          name: 'No global authority',
        }),
      ).toEqual({
        status: 403,
        body: { error: 'forbidden', permission: 'organization.manage_settings' },
      });
      expect(
        await fixture.harness.call(actor, 'DELETE', '/api/organization/steps/' + RETIRABLE),
      ).toEqual({
        status: 403,
        body: { error: 'forbidden', permission: 'organization.manage_settings' },
      });
    }
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
  });
}, 60000);

test('current global catalogue HTTP rejects closed-body and definition uniqueness failures atomically', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    const body = define('project', PROJECT, 'closed-body');
    const before = snapshot(fixture),
      announcements = [...fixture.pushes];
    for (const malformed of [
      {},
      { ...body, stepId: STEP },
      { ...body, extra: true },
      { ...body, scopeKind: 'work_package' },
      { ...body, define: { ...body.define, code: 's1' } },
      { ...body, define: { ...body.define, defaultAllowanceBps: 1.5 } },
      { ...body, define: { ...body.define, defaultAllowanceBps: 100001 } },
      { ...body, define: { ...body.define, allowancePercent: 7 } },
      { ...body, define: { ...body.define, defaultEstimateUnit: 'hours' } },
    ])
      expect(
        (await fixture.harness.call('admin', 'POST', '/api/organization/step-bindings', malformed))
          .status,
      ).toBe(422);
    expect(
      await fixture.harness.call('admin', 'POST', '/api/organization/step-bindings', {
        ...body,
        define: { ...body.define, code: STEP },
      }),
    ).toEqual({ status: 409, body: { error: 'code_taken' } });
    expect(
      await fixture.harness.call('admin', 'POST', '/api/organization/step-bindings', {
        ...body,
        define: { ...body.define, name: STEP },
      }),
    ).toEqual({ status: 409, body: { error: 'name_taken' } });
    for (const malformed of [
      {},
      { name: 'Changed', code: 'mutated-code' },
      { name: 'Changed', extra: true },
    ])
      expect(
        (await fixture.harness.call('admin', 'PATCH', '/api/organization/steps/' + STEP, malformed))
          .status,
      ).toBe(422);
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
  });
}, 60000);

test('current global catalogue HTTP binds an existing definition by type without replacing package values', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    const values = packageValues(fixture);
    const definitions = fixture.harness.sqlite
      .query('SELECT * FROM step_definition ORDER BY id')
      .all();
    const body = {
      scopeKind: 'project',
      scopeId: PROJECT,
      stepId: STEP,
      workItemTypeId: TYPE,
      position: 50,
    };
    expect(
      await fixture.harness.call(
        'project-manager',
        'POST',
        '/api/organization/step-bindings',
        body,
      ),
    ).toMatchObject({
      status: 201,
      body: {
        binding: {
          scopeKind: 'project',
          scopeId: PROJECT,
          stepId: STEP,
          workItemTypeId: TYPE,
          position: 50,
        },
      },
    });
    expect(
      fixture.harness.sqlite
        .query(
          'SELECT scope_kind,scope_id,step_id,work_item_type_id,position FROM step_binding WHERE scope_id=? AND step_id=?',
        )
        .all(PROJECT, STEP),
    ).toEqual([
      {
        scope_kind: 'project',
        scope_id: PROJECT,
        step_id: STEP,
        work_item_type_id: TYPE,
        position: 50,
      },
    ]);
    expect(packageValues(fixture)).toEqual(values);
    expect(fixture.harness.sqlite.query('SELECT * FROM step_definition ORDER BY id').all()).toEqual(
      definitions,
    );
    const before = snapshot(fixture),
      announcements = [...fixture.pushes];
    expect(
      await fixture.harness.call(
        'project-manager',
        'POST',
        '/api/organization/step-bindings',
        body,
      ),
    ).toEqual({ status: 409, body: { error: 'duplicate_binding' } });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
  });
}, 60000);

test('current global catalogue HTTP changes defaults without rewriting authored package values or vetoing existing estimates', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    const { harness, stamp } = fixture;
    const leaf = 'catalogue-http-defaults-leaf',
      createdPackage = 'catalogue-http-new-default-package';
    await harness.publicWrites().uow.run(async ({ stores }) => {
      expect(
        await stores.workPackages.setStepUnit(PROJECT + ':package', STEP, 'minutes', stamp),
      ).toMatchObject({ ok: true, step: { estimateUnit: 'minutes' } });
      expect(
        await stores.workPackages.setStepAllowance(PROJECT + ':package', STEP, 12.34, stamp),
      ).toMatchObject({ ok: true, revision: 1 });
      expect(
        await stores.workPackages.setStepAllowance(SIBLING + ':package', STEP, 56.78, stamp),
      ).toMatchObject({ ok: true, revision: 1 });
      await stores.workItems.insert(
        workItemRow({
          id: leaf,
          workPackageId: PROJECT + ':package',
          name: 'Estimated before default change',
          position: 10,
        }),
        [],
        stamp,
      );
      expect(
        await stores.estimates.set(
          { workItemId: leaf, stepId: STEP, optimistic: 1, realistic: 2, pessimistic: 3 },
          stamp,
        ),
      ).toBe('written');
      expect(await stores.estimates.listByWorkPackage(PROJECT + ':package')).toEqual([
        { workItemId: leaf, stepId: STEP, optimistic: 1, realistic: 2, pessimistic: 3 },
      ]);
      return { commit: true, value: undefined };
    });
    const values = packageValues(fixture);
    expect(values as unknown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          work_package_id: PROJECT + ':package',
          step_id: STEP,
          estimate_unit: 'minutes',
          allowance_bps: 1234,
          allowance_revision: 1,
        }),
        expect.objectContaining({
          work_package_id: SIBLING + ':package',
          step_id: STEP,
          estimate_unit: 'workdays',
          allowance_bps: 5678,
          allowance_revision: 1,
        }),
      ]),
    );
    const estimates = harness.sqlite
      .query('SELECT * FROM estimate ORDER BY work_item_id,step_id')
      .all();
    const answer = await harness.call('admin', 'PATCH', '/api/organization/steps/' + STEP, {
      defaultEstimateUnit: 'minutes',
      defaultAllowanceBps: 2345,
    });
    expect(answer).toMatchObject({
      status: 200,
      body: {
        definition: {
          id: STEP,
          code: STEP,
          name: STEP,
          defaultEstimateUnit: 'minutes',
          defaultAllowanceBps: 2345,
        },
      },
    });
    expect(packageValues(fixture)).toEqual(values);
    expect(
      harness.sqlite.query('SELECT * FROM estimate ORDER BY work_item_id,step_id').all(),
    ).toEqual(estimates);
    await harness.publicWrites().uow.run(async ({ stores }) => {
      expect(
        (await stores.stepCatalogue.readPackage(ORGANIZATION, PROJECT + ':package'))
          ?.steps as unknown,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stepId: STEP,
            estimateUnit: 'minutes',
            allowancePercent: 12.34,
            allowanceRevision: 1,
          }),
        ]),
      );
      expect(
        (await stores.stepCatalogue.readPackage(ORGANIZATION, SIBLING + ':package'))
          ?.steps as unknown,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stepId: STEP,
            estimateUnit: 'workdays',
            allowancePercent: 56.78,
            allowanceRevision: 1,
          }),
        ]),
      );
      const created = await stores.workPackages.createInOrganization(
        workPackageRow({ id: createdPackage, projectId: SIBLING, name: 'New default recipient' }),
        [],
        stamp,
        ORGANIZATION,
        { id: createdPackage + ':grant', auditId: createdPackage + ':audit' },
      );
      expect(typeof created).toBe('object');
      if (typeof created === 'string')
        throw new Error('new default package birth refused: ' + created);
      expect(
        (await stores.stepCatalogue.readPackage(ORGANIZATION, createdPackage))?.steps as unknown,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stepId: STEP,
            estimateUnit: 'minutes',
            allowancePercent: 23.45,
            allowanceRevision: 0,
          }),
        ]),
      );
      return { commit: true, value: undefined };
    });
    expect(
      harness.sqlite
        .query(
          'SELECT estimate_unit,allowance_bps,allowance_revision FROM work_package_step WHERE work_package_id=? AND step_id=?',
        )
        .all(createdPackage, STEP),
    ).toEqual([{ estimate_unit: 'minutes', allowance_bps: 2345, allowance_revision: 0 }]);
    expect(
      harness.sqlite
        .query(
          'SELECT * FROM work_package_step WHERE work_package_id<>? ORDER BY work_package_id,step_id',
        )
        .all(createdPackage),
    ).toEqual(values);
    const before = snapshot(fixture),
      announcements = [...fixture.pushes];
    for (const malformed of [
      { defaultAllowanceBps: 1.5 },
      { defaultAllowanceBps: 100001 },
      { defaultEstimateUnit: 'hours' },
      { defaultAllowancePercent: 7 },
      { defaultEstimateUnit: 'minutes', extra: true },
      {},
    ])
      expect(
        (await harness.call('admin', 'PATCH', '/api/organization/steps/' + STEP, malformed)).status,
      ).toBe(422);
    expect(
      await harness.call('project-manager', 'PATCH', '/api/organization/steps/' + STEP, {
        defaultAllowanceBps: 900,
      }),
    ).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.manage_settings' },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
  });
}, 60000);

test('current global catalogue HTTP refreshes each actual affected package once after committed definition and binding writes', async () => {
  let phase: 'idle' | 'defined' | 'renamed' | 'typed' = 'idle';
  const observations: {
    phase: string;
    definitions: unknown;
    values: unknown;
    typedBindings: unknown;
  }[] = [];
  await withinFixture(
    async (fixture) => {
      await healthyList(fixture);
      const body = define('space', SPACE, 'http-fanout'),
        before = packageValues(fixture);
      phase = 'defined';
      expect(
        (
          await fixture.harness.call(
            'space-manager',
            'POST',
            '/api/organization/step-bindings',
            body,
          )
        ).status,
      ).toBe(201);
      const emitted = () =>
        fixture.pushes
          .map((raw) => {
            if (typeof raw !== 'string')
              throw new Error('actual catalogue gateway frame is not serialized JSON');
            const frame: unknown = JSON.parse(raw);
            // Bun1.4.4 replaces matched fields with asymmetric matcher objects; keep the actual decoded frame for its next typed read.
            expect(structuredClone(frame)).toMatchObject({
              subscription: expect.any(String) as unknown,
              seq: expect.any(Number) as unknown,
              message: { type: 'step_catalogue_changed' },
            });
            if (
              frame === null ||
              typeof frame !== 'object' ||
              !('subscription' in frame) ||
              typeof frame.subscription !== 'string'
            )
              throw new Error(
                'actual catalogue frame lacks its subscription: ' + JSON.stringify(frame),
              );
            return frame.subscription;
          })
          .sort();
      expect(emitted()).toEqual(
        [PROJECT, SPACE_PEER].map((id) => 'work-package:' + id + ':package').sort(),
      );
      const definition = fixture.harness.sqlite
        .query<{ id: string }, [string]>('SELECT id FROM step_definition WHERE code=?')
        .get('http-fanout');
      if (definition === null)
        throw new Error('actual fanout definition missing after successful route');
      const values = fixture.harness.sqlite
        .query(
          'SELECT work_package_id,estimate_unit,allowance_bps,allowance_revision FROM work_package_step WHERE step_id=? ORDER BY work_package_id',
        )
        .all(definition.id);
      expect(values).toEqual(
        [PROJECT, SPACE_PEER].sort().map((id) => ({
          work_package_id: id + ':package',
          estimate_unit: 'minutes',
          allowance_bps: 1234,
          allowance_revision: 0,
        })),
      );
      expect(observations).toEqual(
        [0, 1].map(() => ({
          phase: 'defined',
          definitions: [{ id: definition.id, name: 'Created http-fanout' }],
          values,
          typedBindings: [],
        })),
      );
      expect(
        fixture.harness.sqlite
          .query(
            'SELECT * FROM work_package_step WHERE step_id<>? ORDER BY work_package_id,step_id',
          )
          .all(definition.id),
      ).toEqual(before);
      fixture.pushes.length = 0;
      observations.length = 0;
      phase = 'renamed';
      expect(
        (
          await fixture.harness.call('admin', 'PATCH', '/api/organization/steps/' + definition.id, {
            name: 'One shared new label',
          })
        ).status,
      ).toBe(200);
      expect(emitted()).toEqual(
        [PROJECT, SPACE_PEER].map((id) => 'work-package:' + id + ':package').sort(),
      );
      expect(observations).toEqual(
        [0, 1].map(() => ({
          phase: 'renamed',
          definitions: [{ id: definition.id, name: 'One shared new label' }],
          values,
          typedBindings: [],
        })),
      );
      fixture.pushes.length = 0;
      observations.length = 0;
      phase = 'typed';
      expect(
        (
          await fixture.harness.call('project-manager', 'POST', '/api/organization/step-bindings', {
            scopeKind: 'project',
            scopeId: PROJECT,
            stepId: STEP,
            workItemTypeId: TYPE,
            position: 50,
          })
        ).status,
      ).toBe(201);
      expect(emitted()).toEqual(['work-package:' + PROJECT + ':package']);
      expect(observations).toEqual([
        {
          phase: 'typed',
          definitions: [{ id: definition.id, name: 'One shared new label' }],
          values,
          typedBindings: [
            {
              scope_kind: 'project',
              scope_id: PROJECT,
              step_id: STEP,
              work_item_type_id: TYPE,
              position: 50,
            },
          ],
        },
      ]);
      expect(
        fixture.harness.sqlite
          .query(
            'SELECT * FROM work_package_step WHERE step_id<>? ORDER BY work_package_id,step_id',
          )
          .all(definition.id),
      ).toEqual(before);
      phase = 'idle';
    },
    (harness) => {
      if (phase === 'idle') return;
      // Harness.sqlite is the actual second connection, so uncommitted writer state is not visible here.
      observations.push({
        phase,
        definitions: harness.sqlite
          .query('SELECT id,name FROM step_definition WHERE code=? ORDER BY id')
          .all('http-fanout'),
        values: harness.sqlite
          .query(
            'SELECT v.work_package_id,v.estimate_unit,v.allowance_bps,v.allowance_revision FROM work_package_step v JOIN step_definition d ON d.id=v.step_id WHERE d.code=? ORDER BY v.work_package_id',
          )
          .all('http-fanout'),
        typedBindings: harness.sqlite
          .query(
            'SELECT scope_kind,scope_id,step_id,work_item_type_id,position FROM step_binding WHERE scope_kind=? AND scope_id=? AND step_id=? AND work_item_type_id=? ORDER BY id',
          )
          .all('project', PROJECT, STEP, TYPE),
      });
    },
  );
}, 60000);

function readBinding(fixture: Fixture, code: string) {
  const binding = fixture.harness.sqlite
    .query<{ bindingId: string; stepId: string }, [string]>(
      'SELECT b.id AS "bindingId",b.step_id AS "stepId" FROM step_binding b JOIN step_definition d ON d.id=b.step_id WHERE d.code=?',
    )
    .get(code);
  if (binding === null) throw new Error('actual unbind fixture binding is absent: ' + code);
  return binding;
}
function readRevision(fixture: Fixture, table: 'project' | 'work_package', id: string): number {
  const row = fixture.harness.sqlite
    .query<{ revision: number }, [string]>('SELECT revision FROM ' + table + ' WHERE id=?')
    .get(id);
  if (row === null || !Number.isSafeInteger(row.revision))
    throw new Error('actual unbind fixture revision is absent or malformed');
  return row.revision;
}

test('current global catalogue HTTP previews and unbinds only the owned project binding after commit', async () => {
  let observe = false,
    address: string | undefined;
  const committed: unknown[] = [];
  await withinFixture(
    async (fixture) => {
      await healthyList(fixture);
      expect(
        (
          await fixture.harness.call(
            'project-manager',
            'POST',
            '/api/organization/step-bindings',
            define('project', PROJECT, 'unbind-http-local'),
          )
        ).status,
      ).toBe(201);
      const binding = readBinding(fixture, 'unbind-http-local');
      address = binding.bindingId;
      const before = snapshot(fixture),
        values = packageValues(fixture),
        announcements = [...fixture.pushes];
      const projectRevision = readRevision(fixture, 'project', PROJECT),
        packageRevision = readRevision(fixture, 'work_package', PROJECT + ':package');
      expect(
        await fixture.harness.call(
          'project-manager',
          'DELETE',
          '/api/organization/step-bindings/' + address,
          { dryRun: true },
        ),
      ).toEqual({ status: 200, body: { wouldRefuse: null } });
      expect(snapshot(fixture)).toEqual(before);
      expect(fixture.pushes).toEqual(announcements);
      observe = true;
      expect(
        await fixture.harness.call(
          'project-manager',
          'DELETE',
          '/api/organization/step-bindings/' + address,
          { dryRun: false },
        ),
      ).toEqual({ status: 204, body: null });
      observe = false;
      expect(
        fixture.harness.sqlite.query('SELECT id FROM step_binding WHERE id=?').all(address),
      ).toEqual([]);
      expect(packageValues(fixture)).toEqual(values);
      expect(readRevision(fixture, 'project', PROJECT)).toBe(projectRevision + 1);
      expect(readRevision(fixture, 'work_package', PROJECT + ':package')).toBe(packageRevision + 1);
      expect(fixture.pushes.length).toBe(announcements.length + 1);
      expect(committed).toEqual([[]]);
      const after = snapshot(fixture),
        sent = [...fixture.pushes];
      expect(
        await fixture.harness.call(
          'project-manager',
          'DELETE',
          '/api/organization/step-bindings/' + address,
          { dryRun: false },
        ),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
      expect(snapshot(fixture)).toEqual(after);
      expect(fixture.pushes).toEqual(sent);
    },
    (harness) => {
      if (!observe) return;
      if (address === undefined)
        throw new Error('unbind publication precedes actual binding acquisition');
      // The actual second connection observes the removal only after the writer commits.
      committed.push(harness.sqlite.query('SELECT id FROM step_binding WHERE id=?').all(address));
    },
  );
}, 60000);

test('current global catalogue HTTP preserves protected facts when inherited binding still resolves the step', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    expect(
      (
        await fixture.harness.call('project-manager', 'POST', '/api/organization/step-bindings', {
          scopeKind: 'project',
          scopeId: PROJECT,
          stepId: STEP,
          workItemTypeId: null,
          position: 30,
        })
      ).status,
    ).toBe(201);
    const binding = fixture.harness.sqlite
      .query<{ id: string }, [string, string]>(
        "SELECT id FROM step_binding WHERE scope_kind='project' AND scope_id=? AND step_id=?",
      )
      .get(PROJECT, STEP);
    if (binding === null) throw new Error('actual redundant project binding is absent');
    await fixture.harness.publicWrites().uow.run(async ({ stores }) => {
      await stores.workItems.insert(
        workItemRow({
          id: 'unbind-redundant-leaf',
          workPackageId: PROJECT + ':package',
          name: 'Still inherited',
          position: 10,
        }),
        [],
        fixture.stamp,
      );
      expect(
        await stores.estimates.set(
          {
            workItemId: 'unbind-redundant-leaf',
            stepId: STEP,
            optimistic: 1,
            realistic: 2,
            pessimistic: 3,
          },
          fixture.stamp,
        ),
      ).toBe('written');
      return { commit: true, value: undefined };
    });
    const before = snapshot(fixture),
      values = packageValues(fixture),
      estimates = fixture.harness.sqlite
        .query('SELECT * FROM estimate ORDER BY work_item_id,step_id')
        .all(),
      announcements = [...fixture.pushes];
    expect(
      await fixture.harness.call(
        'project-manager',
        'DELETE',
        '/api/organization/step-bindings/' + binding.id,
        { dryRun: true },
      ),
    ).toEqual({ status: 200, body: { wouldRefuse: null } });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
    expect(
      await fixture.harness.call(
        'project-manager',
        'DELETE',
        '/api/organization/step-bindings/' + binding.id,
        { dryRun: false },
      ),
    ).toEqual({ status: 204, body: null });
    expect(
      fixture.harness.sqlite.query('SELECT * FROM estimate ORDER BY work_item_id,step_id').all(),
    ).toEqual(estimates);
    expect(packageValues(fixture)).toEqual(values);
    expect(
      fixture.harness.sqlite.query('SELECT id FROM step_binding WHERE id=?').all(STEP + ':binding'),
    ).toEqual([{ id: STEP + ':binding' }]);
  });
}, 60000);

test('current global catalogue HTTP unbind admission uses stored scope for preview and apply', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    expect(
      (
        await fixture.harness.call(
          'admin',
          'POST',
          '/api/organization/step-bindings',
          define('project', SIBLING, 'unbind-http-sibling'),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.harness.call(
          'space-manager',
          'POST',
          '/api/organization/step-bindings',
          define('space', SPACE, 'unbind-http-space'),
        )
      ).status,
    ).toBe(201);
    const sibling = readBinding(fixture, 'unbind-http-sibling'),
      space = readBinding(fixture, 'unbind-http-space');
    const before = snapshot(fixture),
      announcements = [...fixture.pushes];
    for (const dryRun of [true, false]) {
      for (const actor of ['reader', 'project-manager'] as const)
        expect(
          await fixture.harness.call(
            actor,
            'DELETE',
            '/api/organization/step-bindings/' + STEP + ':binding',
            { dryRun },
          ),
        ).toEqual({
          status: 403,
          body: { error: 'forbidden', permission: 'organization.manage_settings' },
        });
      expect(
        await fixture.harness.call(
          'project-manager',
          'DELETE',
          '/api/organization/step-bindings/' + sibling.bindingId,
          { dryRun },
        ),
      ).toEqual({
        status: 403,
        body: { error: 'forbidden', permission: 'project.manage_settings' },
      });
      expect(
        await fixture.harness.call(
          'project-manager',
          'DELETE',
          '/api/organization/step-bindings/' + space.bindingId,
          { dryRun },
        ),
      ).toEqual({
        status: 403,
        body: { error: 'forbidden', permission: 'organization.manage_spaces' },
      });
      expect(
        await fixture.harness.call(
          'admin',
          'DELETE',
          '/api/organization/step-bindings/' + FOREIGN_STEP + ':binding',
          { dryRun },
        ),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
      expect(
        await fixture.harness.call('admin', 'DELETE', '/api/organization/step-bindings/absent', {
          dryRun,
        }),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
    }
    for (const body of [
      {},
      { dryRun: 'true' },
      { dryRun: 0 },
      { dryRun: true, scopeId: PROJECT },
      { dryRun: false, unexpected: true },
    ])
      expect(
        (
          await fixture.harness.call(
            'admin',
            'DELETE',
            '/api/organization/step-bindings/' + STEP + ':binding',
            body,
          )
        ).status,
      ).toBe(422);
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
    expect(
      await fixture.harness.call(
        'space-manager',
        'DELETE',
        '/api/organization/step-bindings/' + space.bindingId,
        { dryRun: false },
      ),
    ).toEqual({ status: 204, body: null });
  });
}, 60000);

test('current global catalogue HTTP unbind preview and refusal retain exact 201 protected pairs with response cap', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    const protectedPairs = Array.from({ length: 201 }, (_, index) => ({
      id: 'unbind-protected-' + String(index).padStart(3, '0'),
      name: 'Protected ' + String(index).padStart(3, '0'),
      stepId: STEP,
      workPackageId: PROJECT + ':package',
      facts: ['estimate'],
    }));
    await fixture.harness.publicWrites().uow.run(async ({ stores }) => {
      for (const [index, pair] of protectedPairs.entries()) {
        await stores.workItems.insert(
          workItemRow({
            id: pair.id,
            workPackageId: pair.workPackageId,
            name: pair.name,
            position: index + 1,
          }),
          [],
          fixture.stamp,
        );
        expect(
          await stores.estimates.set(
            { workItemId: pair.id, stepId: STEP, optimistic: 1, realistic: 2, pessimistic: 3 },
            fixture.stamp,
          ),
        ).toBe('written');
      }
      return { commit: true, value: undefined };
    });
    const before = snapshot(fixture),
      announcements = [...fixture.pushes];
    expect(
      await fixture.harness.call(
        'admin',
        'DELETE',
        '/api/organization/step-bindings/' + STEP + ':binding',
        { dryRun: true },
      ),
    ).toEqual({
      status: 200,
      body: { wouldRefuse: 'step_nodes_in_use', count: 201, pairs: protectedPairs.slice(0, 200) },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
    expect(
      await fixture.harness.call(
        'admin',
        'DELETE',
        '/api/organization/step-bindings/' + STEP + ':binding',
        { dryRun: false },
      ),
    ).toEqual({
      status: 409,
      body: { error: 'step_nodes_in_use', count: 201, pairs: protectedPairs.slice(0, 200) },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
  });
}, 60000);

test('current catalogue unbind protects sparse parallelism without disclosing it to other callers', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    const id = 'parallel-leaf',
      name = 'Parallel leaf',
      workPackageId = PROJECT + ':package';
    await fixture.harness.publicWrites().uow.run(async ({ stores }) => {
      await stores.workItems.insert(workItemRow({ id, name, workPackageId }), [], fixture.stamp);
      const parallel = { workItemId: id, stepId: STEP, maxParallel: 2 };
      await stores.stepParallels.set(parallel, fixture.stamp);
      expect(await stores.stepParallels.listByWorkItems(workPackageId, [id])).toEqual([parallel]);
      return { commit: true, value: undefined };
    });
    const before = snapshot(fixture);
    const announcements = [...fixture.pushes];
    const path = '/api/organization/step-bindings/' + STEP + ':binding';
    const unbind = (actor: Actor, dryRun: boolean) =>
      fixture.harness.call(actor, 'DELETE', path, { dryRun });
    const protectedFacts = {
      count: 1,
      pairs: [{ id, name, workPackageId, stepId: STEP, facts: ['parallel'] }],
    };
    expect(await unbind('admin', true)).toEqual({
      status: 200,
      body: { wouldRefuse: 'step_nodes_in_use', ...protectedFacts },
    });
    expect(await unbind('admin', false)).toEqual({
      status: 409,
      body: { error: 'step_nodes_in_use', ...protectedFacts },
    });
    const denied = await unbind('reader', false);
    expect(denied.status).toBe(403);
    expect(denied.body).not.toHaveProperty('pairs');
    fixture.harness.bind('admin', FOREIGN_ORGANIZATION);
    expect(await unbind('admin', false)).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
  });
}, 60000);

test('current global catalogue HTTP unbind touches an empty project once without package announcements', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    const before = snapshot(fixture),
      revision = readRevision(fixture, 'project', EMPTY_PROJECT),
      announcements = [...fixture.pushes];
    expect(
      await fixture.harness.call(
        'admin',
        'DELETE',
        '/api/organization/step-bindings/' + RETIRABLE + ':binding',
        { dryRun: true },
      ),
    ).toEqual({ status: 200, body: { wouldRefuse: null } });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
    expect(
      await fixture.harness.call(
        'admin',
        'DELETE',
        '/api/organization/step-bindings/' + RETIRABLE + ':binding',
        { dryRun: false },
      ),
    ).toEqual({ status: 204, body: null });
    expect(readRevision(fixture, 'project', EMPTY_PROJECT)).toBe(revision + 1);
    expect(fixture.pushes).toEqual(announcements);
    expect(
      fixture.harness.sqlite.query('SELECT id FROM step_definition WHERE id=?').all(RETIRABLE),
    ).toEqual([{ id: RETIRABLE }]);
  });
}, 60000);
for (const [scopeKind, scopeId, actor, projects, packages] of [
  [
    'organization',
    ORGANIZATION,
    'admin',
    [PROJECT, SPACE_PEER, SIBLING, EMPTY_PROJECT],
    [PROJECT, SPACE_PEER, SIBLING],
  ],
  ['space', SPACE, 'space-manager', [PROJECT, SPACE_PEER], [PROJECT, SPACE_PEER]],
  ['project', PROJECT, 'project-manager', [PROJECT], [PROJECT]],
] as const) {
  test(
    'current global catalogue HTTP reorders only complete own ' +
      scopeKind +
      ' binding set after commit',
    async () => {
      let observing = false;
      const observations: unknown[] = [];
      await withinFixture(
        async (fixture) => {
          await healthyList(fixture);
          for (const suffix of ['a', 'b'])
            expect(
              (
                await fixture.harness.call(actor, 'POST', '/api/organization/step-bindings', {
                  ...define(scopeKind, scopeId, 'reorder-http-' + suffix),
                  workItemTypeId: suffix === 'b' ? TYPE : null,
                })
              ).status,
            ).toBe(201);
          const ordered = fixture.harness.sqlite
            .query<{ id: string; position: number }, [string, string]>(
              'SELECT id,position FROM step_binding WHERE scope_kind=? AND scope_id=? ORDER BY position,id COLLATE BINARY',
            )
            .all(scopeKind, scopeId);
          const ids = ordered.map((binding) => binding.id),
            next = [...ids].reverse();
          expect(ids.length).toBe(scopeKind === 'organization' ? 3 : 2);
          const outside = scopeKind === 'organization' ? RETIRABLE + ':binding' : STEP + ':binding';
          fixture.pushes.length = 0;
          const before = snapshot(fixture),
            values = packageValues(fixture);
          const firstId = ids.at(0);
          if (firstId === undefined) throw Error('test populated scope has no binding');
          for (const stale of [
            [],
            ids.slice(1),
            [...ids.slice(0, -1), firstId],
            [...ids.slice(0, -1), outside],
            [...ids, firstId],
            [...ids, outside],
          ]) {
            expect(
              await fixture.harness.call(actor, 'POST', '/api/organization/step-bindings/reorder', {
                scopeKind,
                scopeId,
                ids: stale,
              }),
            ).toEqual({ status: 409, body: { error: 'stale_order' } });
            expect(snapshot(fixture)).toEqual(before);
            expect(fixture.pushes).toEqual([]);
          }
          expect(
            await fixture.harness.call(actor, 'POST', '/api/organization/step-bindings/reorder', {
              scopeKind,
              scopeId,
              ids,
            }),
          ).toEqual({ status: 204, body: null });
          expect(snapshot(fixture)).toEqual(before);
          expect(fixture.pushes).toEqual([]);
          const projectRevisions = [
            PROJECT,
            SPACE_PEER,
            SIBLING,
            EMPTY_PROJECT,
            FOREIGN_PROJECT,
          ].map((id) => ({ id, revision: readRevision(fixture, 'project', id) }));
          const packageRevisions = [PROJECT, SPACE_PEER, SIBLING, FOREIGN_PROJECT].map((id) => ({
            id,
            revision: readRevision(fixture, 'work_package', id + ':package'),
          }));
          observing = true;
          expect(
            await fixture.harness.call(actor, 'POST', '/api/organization/step-bindings/reorder', {
              scopeKind,
              scopeId,
              ids: next,
            }),
          ).toEqual({ status: 204, body: null });
          observing = false;
          const positions = next.map((id, index) => ({ id, position: (index + 1) * 10 }));
          expect(
            fixture.harness.sqlite
              .query(
                'SELECT id,position FROM step_binding WHERE scope_kind=? AND scope_id=? ORDER BY position,id COLLATE BINARY',
              )
              .all(scopeKind, scopeId),
          ).toEqual(positions);
          expect(observations).toEqual(packages.map(() => positions));
          expect(packageValues(fixture)).toEqual(values);
          for (const project of projectRevisions)
            expect(readRevision(fixture, 'project', project.id)).toBe(
              project.revision + (projects.some((id) => id === project.id) ? 1 : 0),
            );
          for (const workPackage of packageRevisions)
            expect(readRevision(fixture, 'work_package', workPackage.id + ':package')).toBe(
              workPackage.revision + (packages.some((id) => id === workPackage.id) ? 1 : 0),
            );
          const subscriptions = fixture.pushes
            .map((raw) => {
              if (typeof raw !== 'string') throw Error('test push frame is not serialized');
              const frame: unknown = JSON.parse(raw);
              expect(structuredClone(frame)).toMatchObject({
                message: { type: 'step_catalogue_changed' },
              });
              if (
                frame === null ||
                typeof frame !== 'object' ||
                !('subscription' in frame) ||
                typeof frame.subscription !== 'string'
              )
                throw Error('test push subscription absent');
              return frame.subscription;
            })
            .sort();
          expect(subscriptions).toEqual(
            packages.map((id) => 'work-package:' + id + ':package').sort(),
          );
          const after = snapshot(fixture),
            pushes = [...fixture.pushes];
          expect(
            await fixture.harness.call(actor, 'POST', '/api/organization/step-bindings/reorder', {
              scopeKind,
              scopeId,
              ids: next,
            }),
          ).toEqual({ status: 204, body: null });
          expect(snapshot(fixture)).toEqual(after);
          expect(fixture.pushes).toEqual(pushes);
        },
        (harness) => {
          if (observing)
            observations.push(
              harness.sqlite
                .query(
                  'SELECT id,position FROM step_binding WHERE scope_kind=? AND scope_id=? ORDER BY position,id COLLATE BINARY',
                )
                .all(scopeKind, scopeId),
            );
        },
      );
    },
    60000,
  );
}

test('current global catalogue HTTP reorder admits the actual scope and rejects malformed census requests', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    const before = snapshot(fixture);
    for (const actor of ['reader', 'project-manager'] as const)
      expect(
        await fixture.harness.call(actor, 'POST', '/api/organization/step-bindings/reorder', {
          scopeKind: 'organization',
          scopeId: ORGANIZATION,
          ids: [STEP + ':binding'],
        }),
      ).toEqual({
        status: 403,
        body: { error: 'forbidden', permission: 'organization.manage_settings' },
      });
    expect(
      await fixture.harness.call(
        'project-manager',
        'POST',
        '/api/organization/step-bindings/reorder',
        { scopeKind: 'project', scopeId: SIBLING, ids: [] },
      ),
    ).toEqual({ status: 403, body: { error: 'forbidden', permission: 'project.manage_settings' } });
    expect(
      await fixture.harness.call(
        'project-manager',
        'POST',
        '/api/organization/step-bindings/reorder',
        { scopeKind: 'space', scopeId: SPACE, ids: [] },
      ),
    ).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.manage_spaces' },
    });
    for (const [scopeKind, scopeId] of [
      ['organization', FOREIGN_ORGANIZATION],
      ['space', FOREIGN_SPACE],
      ['project', FOREIGN_PROJECT],
      ['project', 'absent'],
    ] as const)
      expect(
        await fixture.harness.call('admin', 'POST', '/api/organization/step-bindings/reorder', {
          scopeKind,
          scopeId,
          ids: [],
        }),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
    for (const body of [
      {},
      { scopeKind: 'work_package', scopeId: PROJECT, ids: [] },
      { scopeKind: 'project', scopeId: '', ids: [] },
      { scopeKind: 'project', scopeId: PROJECT },
      { scopeKind: 'project', scopeId: PROJECT, ids: 'all' },
      { scopeKind: 'project', scopeId: PROJECT, ids: [3] },
      { scopeKind: 'project', scopeId: PROJECT, ids: [''] },
      { scopeKind: 'project', scopeId: PROJECT, ids: [], unexpected: true },
    ])
      expect(
        (
          await fixture.harness.call(
            'admin',
            'POST',
            '/api/organization/step-bindings/reorder',
            body,
          )
        ).status,
      ).toBe(422);
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual([]);
    expect(
      await fixture.harness.call(
        'project-manager',
        'POST',
        '/api/organization/step-bindings/reorder',
        { scopeKind: 'project', scopeId: PROJECT, ids: [] },
      ),
    ).toEqual({ status: 204, body: null });
    expect(
      await fixture.harness.call(
        'space-manager',
        'POST',
        '/api/organization/step-bindings/reorder',
        { scopeKind: 'space', scopeId: SPACE, ids: [] },
      ),
    ).toEqual({ status: 204, body: null });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual([]);
  });
}, 60000);

test('current global catalogue HTTP reorder advances empty project without package announcements', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    expect(
      (
        await fixture.harness.call(
          'admin',
          'POST',
          '/api/organization/step-bindings',
          define('project', EMPTY_PROJECT, 'reorder-http-empty'),
        )
      ).status,
    ).toBe(201);
    const binding = readBinding(fixture, 'reorder-http-empty'),
      before = readRevision(fixture, 'project', EMPTY_PROJECT),
      values = packageValues(fixture);
    expect(fixture.pushes).toEqual([]);
    expect(
      await fixture.harness.call('admin', 'POST', '/api/organization/step-bindings/reorder', {
        scopeKind: 'project',
        scopeId: EMPTY_PROJECT,
        ids: [binding.bindingId, RETIRABLE + ':binding'],
      }),
    ).toEqual({ status: 204, body: null });
    expect(readRevision(fixture, 'project', EMPTY_PROJECT)).toBe(before + 1);
    expect(packageValues(fixture)).toEqual(values);
    expect(fixture.pushes).toEqual([]);
  });
}, 60000);

test('current global catalogue HTTP project steps resolves typed and untyped actual chains with complete provenance', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    expect(
      (
        await fixture.harness.call('admin', 'POST', '/api/organization/step-bindings', {
          ...define('organization', ORGANIZATION, 'read-research'),
          workItemTypeId: TYPE,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.harness.call(
          'space-manager',
          'POST',
          '/api/organization/step-bindings',
          define('space', SPACE, 'read-space'),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.harness.call(
          'project-manager',
          'POST',
          '/api/organization/step-bindings',
          define('project', PROJECT, 'read-project'),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.harness.call(
          'admin',
          'POST',
          '/api/organization/step-bindings',
          define('project', SIBLING, 'read-sibling'),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.harness.call('project-manager', 'POST', '/api/organization/step-bindings', {
          scopeKind: 'project',
          scopeId: PROJECT,
          workItemTypeId: TYPE,
          position: 5,
          stepId: STEP,
        })
      ).status,
    ).toBe(201);
    const research = readBinding(fixture, 'read-research'),
      space = readBinding(fixture, 'read-space'),
      project = readBinding(fixture, 'read-project');
    const extra = fixture.harness.sqlite
      .query<{ bindingId: string }, [string, string]>(
        "SELECT id AS bindingId FROM step_binding WHERE step_id=? AND scope_kind='project' AND scope_id=?",
      )
      .get(STEP, PROJECT);
    if (extra === null) throw Error('required actual typed project provenance absent');
    const base = {
      stepId: STEP,
      code: STEP,
      name: STEP,
      via: [
        {
          bindingId: STEP + ':binding',
          scopeKind: 'organization',
          scopeId: ORGANIZATION,
          workItemTypeId: null,
        },
      ],
    };
    const scoped = [
      {
        stepId: space.stepId,
        code: 'read-space',
        name: 'Created read-space',
        via: [
          { bindingId: space.bindingId, scopeKind: 'space', scopeId: SPACE, workItemTypeId: null },
        ],
      },
      {
        stepId: project.stepId,
        code: 'read-project',
        name: 'Created read-project',
        via: [
          {
            bindingId: project.bindingId,
            scopeKind: 'project',
            scopeId: PROJECT,
            workItemTypeId: null,
          },
        ],
      },
    ];
    const before = snapshot(fixture),
      pushes = [...fixture.pushes];
    expect(
      await fixture.harness.call('reader', 'GET', '/api/projects/' + PROJECT + '/steps'),
    ).toEqual({ status: 200, body: { steps: [base, ...scoped] } });
    expect(
      await fixture.harness.call(
        'project-manager',
        'GET',
        '/api/projects/' + PROJECT + '/steps?type=' + TYPE,
      ),
    ).toEqual({
      status: 200,
      body: {
        steps: [
          {
            ...base,
            via: [
              ...base.via,
              {
                bindingId: extra.bindingId,
                scopeKind: 'project',
                scopeId: PROJECT,
                workItemTypeId: TYPE,
              },
            ],
          },
          {
            stepId: research.stepId,
            code: 'read-research',
            name: 'Created read-research',
            via: [
              {
                bindingId: research.bindingId,
                scopeKind: 'organization',
                scopeId: ORGANIZATION,
                workItemTypeId: TYPE,
              },
            ],
          },
          ...scoped,
        ],
      },
    });
    const sibling = readBinding(fixture, 'read-sibling');
    expect(
      await fixture.harness.call('project-manager', 'GET', '/api/projects/' + SIBLING + '/steps'),
    ).toEqual({
      status: 200,
      body: {
        steps: [
          base,
          {
            stepId: sibling.stepId,
            code: 'read-sibling',
            name: 'Created read-sibling',
            via: [
              {
                bindingId: sibling.bindingId,
                scopeKind: 'project',
                scopeId: SIBLING,
                workItemTypeId: null,
              },
            ],
          },
        ],
      },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(pushes);
  });
}, 60000);

test('current global catalogue HTTP project steps admits actual project permission before type lookup', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    expect(await list(fixture, 'project-manager')).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.read' },
    });
    const before = snapshot(fixture);
    expect(
      (await fixture.harness.call('project-manager', 'GET', '/api/projects/' + PROJECT + '/steps'))
        .status,
    ).toBe(200);
    expect(
      (await fixture.harness.call('project-manager', 'GET', '/api/projects/' + SIBLING + '/steps'))
        .status,
    ).toBe(200);
    expect(
      await fixture.harness.call(
        'hidden',
        'GET',
        '/api/projects/' + PROJECT + '/steps?type=' + TYPE,
      ),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(
      await fixture.harness.call(
        'project-manager',
        'GET',
        '/api/projects/' + SPACE_PEER + '/steps',
      ),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(
      await fixture.harness.call('space-manager', 'GET', '/api/projects/' + PROJECT + '/steps'),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    for (const id of [FOREIGN_PROJECT, 'absent'])
      expect(
        await fixture.harness.call('admin', 'GET', '/api/projects/' + id + '/steps?type=' + TYPE),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
    for (const type of [FOREIGN_TYPE, 'absent'])
      expect(
        await fixture.harness.call(
          'reader',
          'GET',
          '/api/projects/' + PROJECT + '/steps?type=' + type,
        ),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
    for (const query of ['?type=', '?type=' + TYPE + '&type=' + TYPE, '?unexpected=true'])
      expect(
        await fixture.harness.call('reader', 'GET', '/api/projects/' + PROJECT + '/steps' + query),
        query,
      ).toEqual({ status: 400, body: { error: 'invalid_query' } });
    expect(
      await fixture.harness.call('nonmember', 'GET', '/api/projects/' + PROJECT + '/steps'),
    ).toEqual({ status: 403, body: { error: 'not_a_member' } });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual([]);
  });
}, 60000);

test('current global catalogue HTTP project steps reads empty projects without inventing package values', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    expect(
      fixture.harness.sqlite
        .query('SELECT id FROM work_package WHERE project_id=?')
        .all(EMPTY_PROJECT),
    ).toEqual([]);
    expect(
      fixture.harness.sqlite
        .query('SELECT step_id FROM work_package_step WHERE step_id=?')
        .all(RETIRABLE),
    ).toEqual([]);
    const before = snapshot(fixture);
    expect(
      await fixture.harness.call('reader', 'GET', '/api/projects/' + EMPTY_PROJECT + '/steps'),
    ).toEqual({
      status: 200,
      body: {
        steps: [
          {
            stepId: STEP,
            code: STEP,
            name: STEP,
            via: [
              {
                bindingId: STEP + ':binding',
                scopeKind: 'organization',
                scopeId: ORGANIZATION,
                workItemTypeId: null,
              },
            ],
          },
          {
            stepId: RETIRABLE,
            code: RETIRABLE,
            name: RETIRABLE,
            via: [
              {
                bindingId: RETIRABLE + ':binding',
                scopeKind: 'project',
                scopeId: EMPTY_PROJECT,
                workItemTypeId: null,
              },
            ],
          },
        ],
      },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual([]);
  });
}, 60000);

test('current global catalogue HTTP project steps preserves visible package-only shell refusals', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    fixture.harness.grant(
      ORGANIZATION,
      'hidden',
      'package-viewer',
      'work_package',
      PROJECT + ':package',
    );
    const before = snapshot(fixture);
    const forbidden = { status: 403, body: { error: 'forbidden', permission: 'project.read' } };
    expect(await fixture.harness.call('hidden', 'GET', '/api/projects/' + PROJECT)).toEqual(
      forbidden,
    );
    for (const query of ['', '?type=' + TYPE, '?type=' + FOREIGN_TYPE]) {
      expect(
        await fixture.harness.call('hidden', 'GET', '/api/projects/' + PROJECT + '/steps' + query),
      ).toEqual(forbidden);
    }
    for (const id of [SIBLING, EMPTY_PROJECT, FOREIGN_PROJECT, 'absent']) {
      expect(await fixture.harness.call('hidden', 'GET', '/api/projects/' + id + '/steps')).toEqual(
        { status: 404, body: { error: 'not_found' } },
      );
    }
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual([]);
  });
}, 60000);

test('current global catalogue HTTP project steps conceals projects when only unrelated packages are readable', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    fixture.harness.grant(
      ORGANIZATION,
      'hidden',
      'package-viewer',
      'work_package',
      SIBLING + ':package',
    );
    const before = snapshot(fixture);
    expect(await fixture.harness.call('hidden', 'GET', '/api/projects/' + PROJECT)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(
      await fixture.harness.call('hidden', 'GET', '/api/projects/' + PROJECT + '/steps'),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(
      await fixture.harness.call('hidden', 'GET', '/api/projects/' + SIBLING + '/steps'),
    ).toEqual({ status: 403, body: { error: 'forbidden', permission: 'project.read' } });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual([]);
  });
}, 60000);

test('current global catalogue HTTP project usage reports facts even while redundant bindings still resolve the step', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    expect(
      (
        await fixture.harness.call('project-manager', 'POST', '/api/organization/step-bindings', {
          scopeKind: 'project',
          scopeId: PROJECT,
          stepId: STEP,
          workItemTypeId: null,
          position: 30,
        })
      ).status,
    ).toBe(201);
    const binding = fixture.harness.sqlite
      .query<{ id: string }, [string, string]>(
        "SELECT id FROM step_binding WHERE scope_kind='project' AND scope_id=? AND step_id=?",
      )
      .get(PROJECT, STEP);
    if (binding === null) throw Error('usage redundant binding premise absent');
    await fixture.harness.publicWrites().uow.run(async ({ stores }) => {
      await stores.workItems.insert(
        workItemRow({
          id: 'usage-read-leaf',
          workPackageId: PROJECT + ':package',
          name: 'Still used',
          position: 10,
        }),
        [],
        fixture.stamp,
      );
      expect(
        await stores.estimates.set(
          {
            workItemId: 'usage-read-leaf',
            stepId: STEP,
            optimistic: 1,
            realistic: 2,
            pessimistic: 3,
          },
          fixture.stamp,
        ),
      ).toBe('written');
      await stores.workItems.insert(
        workItemRow({
          id: 'usage-read-sibling',
          workPackageId: SIBLING + ':package',
          name: 'Other project usage',
          position: 10,
        }),
        [],
        fixture.stamp,
      );
      expect(
        await stores.estimates.set(
          {
            workItemId: 'usage-read-sibling',
            stepId: STEP,
            optimistic: 1,
            realistic: 2,
            pessimistic: 3,
          },
          fixture.stamp,
        ),
      ).toBe('written');
      return { commit: true, value: undefined };
    });
    const before = snapshot(fixture),
      pushes = [...fixture.pushes];
    expect(
      await fixture.harness.call(
        'project-manager',
        'DELETE',
        '/api/organization/step-bindings/' + binding.id,
        { dryRun: true },
      ),
    ).toEqual({ status: 200, body: { wouldRefuse: null } });
    expect(
      await fixture.harness.call(
        'project-manager',
        'GET',
        '/api/projects/' + PROJECT + '/step-nodes-in-use?stepId=' + STEP,
      ),
    ).toEqual({
      status: 200,
      body: {
        count: 1,
        pairs: [
          {
            id: 'usage-read-leaf',
            name: 'Still used',
            stepId: STEP,
            workPackageId: PROJECT + ':package',
            facts: ['estimate'],
          },
        ],
      },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(pushes);
  });
}, 60000);

test('current global catalogue HTTP project usage filters private packages before counting and limiting pairs', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    const privatePackage = 'aaa-private-usage-package';
    await fixture.harness.publicWrites().uow.run(async ({ stores }) => {
      const created = await stores.workPackages.createInOrganization(
        workPackageRow({ id: privatePackage, projectId: PROJECT, name: 'Private package' }),
        [],
        fixture.stamp,
        ORGANIZATION,
        { id: privatePackage + ':grant', auditId: privatePackage + ':audit' },
      );
      expect(typeof created).toBe('object');
      if (typeof created === 'string') throw Error('private usage package birth refused');
      for (const [workPackageId, prefix] of [
        [privatePackage, 'private'],
        [PROJECT + ':package', 'visible'],
      ] as const) {
        for (let index = 0; index < 201; index++) {
          const id = prefix + '-' + String(index).padStart(3, '0');
          await stores.workItems.insert(
            workItemRow({ id, name: id, workPackageId, position: index }),
            [],
            fixture.stamp,
          );
          expect(
            await stores.estimates.set(
              { workItemId: id, stepId: STEP, optimistic: 1, realistic: 2, pessimistic: 3 },
              fixture.stamp,
            ),
          ).toBe('written');
        }
      }
      return { commit: true, value: undefined };
    });
    fixture.harness.grantPermissions(ORGANIZATION, 'hidden', ['project.read']);
    fixture.harness.grant(
      ORGANIZATION,
      'hidden',
      'package-viewer',
      'work_package',
      PROJECT + ':package',
    );
    const before = snapshot(fixture),
      pushes = [...fixture.pushes];
    const visiblePairs = Array.from({ length: 200 }, (_, index) => ({
      id: 'visible-' + String(index).padStart(3, '0'),
      name: 'visible-' + String(index).padStart(3, '0'),
      workPackageId: PROJECT + ':package',
      stepId: STEP,
      facts: ['estimate'],
    }));
    expect(
      await fixture.harness.call(
        'hidden',
        'GET',
        '/api/projects/' + PROJECT + '/step-nodes-in-use?stepId=' + STEP,
      ),
    ).toEqual({ status: 200, body: { count: 201, pairs: visiblePairs } });
    const privatePairs = Array.from({ length: 200 }, (_, index) => ({
      id: 'private-' + String(index).padStart(3, '0'),
      name: 'private-' + String(index).padStart(3, '0'),
      workPackageId: privatePackage,
      stepId: STEP,
      facts: ['estimate'],
    }));
    expect(
      await fixture.harness.call(
        'reader',
        'GET',
        '/api/projects/' + PROJECT + '/step-nodes-in-use?stepId=' + STEP,
      ),
    ).toEqual({ status: 200, body: { count: 402, pairs: privatePairs } });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(pushes);
  });
}, 60000);

test('current global catalogue HTTP project usage admits actual project before scoped step lookup', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    fixture.harness.grant(
      ORGANIZATION,
      'hidden',
      'package-viewer',
      'work_package',
      PROJECT + ':package',
    );
    const before = snapshot(fixture);
    const path = '/api/projects/' + PROJECT + '/step-nodes-in-use';
    expect(await fixture.harness.call('hidden', 'GET', path + '?stepId=' + FOREIGN_STEP)).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'project.read' },
    });
    expect(await fixture.harness.call('space-manager', 'GET', path + '?stepId=' + STEP)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    for (const id of [FOREIGN_PROJECT, 'absent'])
      expect(
        await fixture.harness.call(
          'admin',
          'GET',
          '/api/projects/' + id + '/step-nodes-in-use?stepId=' + STEP,
        ),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
    for (const stepId of [FOREIGN_STEP, RETIRABLE, 'absent'])
      expect(
        await fixture.harness.call('project-manager', 'GET', path + '?stepId=' + stepId),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
    for (const query of [
      '',
      '?stepId=',
      '?stepId=' + STEP + '&stepId=' + STEP,
      '?stepId=' + STEP + '&unknown=true',
    ])
      expect(await fixture.harness.call('reader', 'GET', path + query)).toEqual({
        status: 400,
        body: { error: 'invalid_query' },
      });
    expect(await fixture.harness.call('nonmember', 'GET', path + '?stepId=' + STEP)).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual([]);
  });
}, 60000);

test('current global catalogue HTTP project usage reads unused steps in empty projects without materializing values', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    const before = snapshot(fixture);
    expect(
      await fixture.harness.call(
        'reader',
        'GET',
        '/api/projects/' + EMPTY_PROJECT + '/step-nodes-in-use?stepId=' + RETIRABLE,
      ),
    ).toEqual({ status: 200, body: { count: 0, pairs: [] } });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual([]);
  });
}, 60000);

test('current global catalogue HTTP project usage refuses malformed owned facts outside the readable project selection', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    await fixture.harness.publicWrites().uow.run(async ({ stores }) => {
      await stores.workItems.insert(
        workItemRow({
          id: 'usage-corrupt-parent',
          name: 'Private parent',
          workPackageId: SIBLING + ':package',
          position: 0,
        }),
        [],
        fixture.stamp,
      );
      await stores.workItems.insert(
        workItemRow({
          id: 'usage-corrupt-child',
          name: 'Private child',
          workPackageId: SIBLING + ':package',
          parentId: 'usage-corrupt-parent',
          position: 0,
        }),
        [],
        fixture.stamp,
      );
      return { commit: true, value: undefined };
    });
    expect(
      await fixture.harness.call(
        'project-manager',
        'GET',
        '/api/projects/' + PROJECT + '/step-nodes-in-use?stepId=' + STEP,
      ),
    ).toEqual({ status: 200, body: { count: 0, pairs: [] } });
    fixture.harness.sqlite.run(
      'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic,created_at,created_by) VALUES(?,?,1,2,3,100,?)',
      ['usage-corrupt-parent', STEP, fixture.stamp.by],
    );
    expect(fixture.harness.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    const before = snapshot(fixture);
    expect(
      (
        await fixture.harness.call(
          'project-manager',
          'GET',
          '/api/projects/' + PROJECT + '/step-nodes-in-use?stepId=' + STEP,
        )
      ).status,
    ).toBe(500);
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual([]);
  });
}, 60000);

test('current global catalogue HTTP project manifest resolves every owned type by stable identity and untyped default', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    for (const id of ['default', 'unbound-manifest-type']) {
      fixture.harness.sqlite.run('INSERT INTO work_item_type(id,name) VALUES(?,?)', [
        id,
        'Display ' + id,
      ]);
      fixture.harness.sqlite.run(
        'INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES(?,?,?)',
        [id, ORGANIZATION, 'Display ' + id],
      );
    }
    expect(
      (
        await fixture.harness.call('admin', 'POST', '/api/organization/step-bindings', {
          ...define('organization', ORGANIZATION, 'manifest-research'),
          workItemTypeId: TYPE,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.harness.call(
          'space-manager',
          'POST',
          '/api/organization/step-bindings',
          define('space', SPACE, 'manifest-space'),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.harness.call(
          'project-manager',
          'POST',
          '/api/organization/step-bindings',
          define('project', PROJECT, 'manifest-project'),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.harness.call('project-manager', 'POST', '/api/organization/step-bindings', {
          ...define('project', PROJECT, 'manifest-default'),
          workItemTypeId: 'default',
          position: 40,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.harness.call(
          'admin',
          'POST',
          '/api/organization/step-bindings',
          define('project', SIBLING, 'manifest-sibling'),
        )
      ).status,
    ).toBe(201);
    expect(await list(fixture, 'project-manager')).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.read' },
    });
    const revision = readRevision(fixture, 'project', PROJECT),
      before = snapshot(fixture),
      pushes = [...fixture.pushes];
    const untyped = [STEP, 'manifest-space', 'manifest-project'];
    expect(
      await fixture.harness.call(
        'project-manager',
        'GET',
        '/api/projects/' + PROJECT + '/step-manifest',
      ),
    ).toEqual({
      status: 200,
      body: {
        version: 1,
        project: { id: PROJECT, revision },
        default: untyped,
        types: [
          {
            workItemTypeId: TYPE,
            codes: [STEP, 'manifest-research', 'manifest-space', 'manifest-project'],
          },
          { workItemTypeId: 'default', codes: [...untyped, 'manifest-default'] },
          { workItemTypeId: 'unbound-manifest-type', codes: untyped },
        ],
      },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(pushes);
  });
}, 60000);

test('current global catalogue HTTP project manifest reads empty and zero-step mappings without materialization', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    expect(
      fixture.harness.sqlite
        .query('SELECT id FROM work_package WHERE project_id=?')
        .all(EMPTY_PROJECT),
    ).toEqual([]);
    let before = snapshot(fixture);
    expect(
      await fixture.harness.call(
        'reader',
        'GET',
        '/api/projects/' + EMPTY_PROJECT + '/step-manifest',
      ),
    ).toEqual({
      status: 200,
      body: {
        version: 1,
        project: { id: EMPTY_PROJECT, revision: readRevision(fixture, 'project', EMPTY_PROJECT) },
        default: [STEP, RETIRABLE],
        types: [{ workItemTypeId: TYPE, codes: [STEP, RETIRABLE] }],
      },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual([]);
    expect(
      await fixture.harness.call(
        'admin',
        'DELETE',
        '/api/organization/step-bindings/' + STEP + ':binding',
        { dryRun: false },
      ),
    ).toEqual({ status: 204, body: null });
    before = snapshot(fixture);
    const pushes = [...fixture.pushes];
    expect(
      await fixture.harness.call('reader', 'GET', '/api/projects/' + PROJECT + '/step-manifest'),
    ).toEqual({
      status: 200,
      body: {
        version: 1,
        project: { id: PROJECT, revision: readRevision(fixture, 'project', PROJECT) },
        default: [],
        types: [{ workItemTypeId: TYPE, codes: [] }],
      },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(pushes);
  });
}, 60000);

test('current global catalogue HTTP project manifest preserves project shells and current organization admission', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    fixture.harness.grant(
      ORGANIZATION,
      'hidden',
      'package-viewer',
      'work_package',
      PROJECT + ':package',
    );
    const before = snapshot(fixture),
      path = '/api/projects/' + PROJECT + '/step-manifest';
    expect(await fixture.harness.call('hidden', 'GET', path)).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'project.read' },
    });
    expect(await fixture.harness.call('space-manager', 'GET', path)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(
      await fixture.harness.call('hidden', 'GET', '/api/projects/' + SIBLING + '/step-manifest'),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    for (const id of [FOREIGN_PROJECT, 'absent'])
      expect(
        await fixture.harness.call('admin', 'GET', '/api/projects/' + id + '/step-manifest'),
      ).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await fixture.harness.call('nonmember', 'GET', path)).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
    for (const query of ['?type=' + TYPE, '?revision=0'])
      expect(await fixture.harness.call('reader', 'GET', path + query)).toEqual({
        status: 400,
        body: { error: 'invalid_query' },
      });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual([]);
  });
}, 60000);

test('current global catalogue HTTP project manifest follows actual empty-project revision and ordered binding changes', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    const revision = readRevision(fixture, 'project', EMPTY_PROJECT),
      path = '/api/projects/' + EMPTY_PROJECT + '/step-manifest';
    expect(
      (
        await fixture.harness.call(
          'admin',
          'POST',
          '/api/organization/step-bindings',
          define('project', EMPTY_PROJECT, 'manifest-fresh'),
        )
      ).status,
    ).toBe(201);
    const fresh = readBinding(fixture, 'manifest-fresh');
    expect(readRevision(fixture, 'project', EMPTY_PROJECT)).toBe(revision + 1);
    expect(await fixture.harness.call('reader', 'GET', path)).toEqual({
      status: 200,
      body: {
        version: 1,
        project: { id: EMPTY_PROJECT, revision: revision + 1 },
        default: [STEP, RETIRABLE, 'manifest-fresh'],
        types: [{ workItemTypeId: TYPE, codes: [STEP, RETIRABLE, 'manifest-fresh'] }],
      },
    });
    expect(
      (
        await fixture.harness.call('admin', 'PATCH', '/api/organization/steps/' + fresh.stepId, {
          name: 'Renamed without changing its code',
        })
      ).status,
    ).toBe(200);
    expect(readRevision(fixture, 'project', EMPTY_PROJECT)).toBe(revision + 2);
    expect(
      await fixture.harness.call('admin', 'POST', '/api/organization/step-bindings/reorder', {
        scopeKind: 'project',
        scopeId: EMPTY_PROJECT,
        ids: [fresh.bindingId, RETIRABLE + ':binding'],
      }),
    ).toEqual({ status: 204, body: null });
    const before = snapshot(fixture),
      pushes = [...fixture.pushes];
    expect(readRevision(fixture, 'project', EMPTY_PROJECT)).toBe(revision + 3);
    expect(await fixture.harness.call('reader', 'GET', path)).toEqual({
      status: 200,
      body: {
        version: 1,
        project: { id: EMPTY_PROJECT, revision: revision + 3 },
        default: [STEP, 'manifest-fresh', RETIRABLE],
        types: [{ workItemTypeId: TYPE, codes: [STEP, 'manifest-fresh', RETIRABLE] }],
      },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(pushes);
  });
}, 60000);

test('current global catalogue HTTP project manifest revision advances with actual organization type set changes', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    expect(
      (
        await fixture.harness.call(
          'reader',
          'GET',
          '/api/projects/' + EMPTY_PROJECT + '/step-manifest',
        )
      ).status,
    ).toBe(200);
    const projects = [EMPTY_PROJECT, PROJECT, SPACE_PEER, SIBLING],
      revisions = new Map(projects.map((id) => [id, readRevision(fixture, 'project', id)])),
      foreign = readRevision(fixture, 'project', FOREIGN_PROJECT),
      values = packageValues(fixture);
    const create = { commands: [{ kind: 'createWorkItemType', name: 'Manifest revision type' }] };
    expect(
      (await fixture.harness.call('admin', 'POST', '/api/directory/commands', create)).status,
    ).toBe(200);
    const created = fixture.harness.sqlite
      .query<{ id: string }, [string, string]>(
        'SELECT resource_id AS id FROM work_item_type_organization WHERE organization_id=? AND name=?',
      )
      .get(ORGANIZATION, 'Manifest revision type');
    if (created === null) throw Error('actual mapped type creation premise absent');
    for (const id of projects) {
      const before = revisions.get(id);
      if (before === undefined) throw Error('actual project revision premise absent');
      expect(readRevision(fixture, 'project', id)).toBe(before + 1);
    }
    expect(readRevision(fixture, 'project', FOREIGN_PROJECT)).toBe(foreign);
    const observed = await fixture.harness.call(
      'reader',
      'GET',
      '/api/projects/' + EMPTY_PROJECT + '/step-manifest',
    );
    expect(observed).toMatchObject({
      status: 200,
      body: {
        project: { id: EMPTY_PROJECT, revision: revisions.get(EMPTY_PROJECT)! + 1 },
        types: expect.arrayContaining([
          { workItemTypeId: created.id, codes: [STEP, RETIRABLE] },
        ]) as unknown,
      },
    });
    expect(
      (await fixture.harness.call('admin', 'POST', '/api/directory/commands', create)).status,
    ).toBe(200);
    for (const id of projects) {
      const before = revisions.get(id);
      if (before === undefined) throw Error('actual project revision premise absent');
      expect(readRevision(fixture, 'project', id)).toBe(before + 1);
    }
    expect(
      (
        await fixture.harness.call('admin', 'POST', '/api/directory/commands', {
          commands: [{ kind: 'deleteWorkItemType', typeId: created.id }],
        })
      ).status,
    ).toBe(200);
    for (const id of projects) {
      const before = revisions.get(id);
      if (before === undefined) throw Error('actual project revision premise absent');
      expect(readRevision(fixture, 'project', id)).toBe(before + 2);
    }
    expect(readRevision(fixture, 'project', FOREIGN_PROJECT)).toBe(foreign);
    expect(packageValues(fixture)).toEqual(values);
  });
}, 60000);

test('current global catalogue HTTP project manifest type writes roll back native failures and refuse unauthorized actors', async () => {
  for (const operation of ['create', 'remove'] as const) {
    await withinFixture(async (fixture) => {
      await healthyList(fixture);
      const create = { commands: [{ kind: 'createWorkItemType', name: 'Atomic manifest type' }] };
      if (operation === 'remove')
        expect(
          (await fixture.harness.call('admin', 'POST', '/api/directory/commands', create)).status,
        ).toBe(200);
      const created =
        operation === 'remove'
          ? fixture.harness.sqlite
              .query<{ id: string }, [string, string]>(
                'SELECT resource_id AS id FROM work_item_type_organization WHERE organization_id=? AND name=?',
              )
              .get(ORGANIZATION, 'Atomic manifest type')
          : null;
      if (operation === 'remove' && created === null)
        throw Error('actual mapped removal fixture absent');
      const command =
        created === null
          ? create
          : { commands: [{ kind: 'deleteWorkItemType', typeId: created.id }] };
      let before = snapshot(fixture);
      for (const actor of ['reader', 'project-manager'] as const) {
        expect(
          (await fixture.harness.call(actor, 'POST', '/api/directory/commands', command)).status,
        ).toBe(403);
        expect(snapshot(fixture)).toEqual(before);
      }
      fixture.harness.sqlite.run(
        "CREATE TRIGGER manifest_type_second_touch BEFORE UPDATE ON project WHEN OLD.id='" +
          PROJECT.replaceAll("'", "''") +
          "' AND NEW.revision=OLD.revision+1 BEGIN SELECT RAISE(IGNORE); END",
      );
      before = snapshot(fixture);
      expect(
        (await fixture.harness.call('admin', 'POST', '/api/directory/commands', command)).status,
      ).toBe(500);
      expect(snapshot(fixture)).toEqual(before);
      fixture.harness.sqlite.run('DROP TRIGGER manifest_type_second_touch');
      expect(
        (await fixture.harness.call('admin', 'POST', '/api/directory/commands', command)).status,
      ).toBe(200);
    });
  }
}, 60000);

test('current global catalogue HTTP project manifest interoperates with actual offline Burokrat revision validation', async () => {
  await withinFixture(async (fixture) => {
    await healthyList(fixture);
    const directory = mkdtempSync(join(tmpdir(), 'catalogue-burokrat-'));
    let primary: { cause: unknown } | undefined;
    try {
      const revision = readRevision(fixture, 'project', PROJECT);
      const before = snapshot(fixture);
      const exported = await fixture.harness.call(
        'reader',
        'GET',
        '/api/projects/' + PROJECT + '/step-manifest',
      );
      expect(exported).toEqual({
        status: 200,
        body: {
          version: 1,
          project: { id: PROJECT, revision },
          default: [STEP],
          types: [{ workItemTypeId: TYPE, codes: [STEP] }],
        },
      });
      const binding = {
        version: 2,
        project: { id: PROJECT, revision },
        default: [{ code: STEP, class: 'verify' }],
        types: [],
        classes: { verify: { executor: 'tool', command: 'verify' } },
      };
      writeFileSync(join(directory, 'workflow.json'), JSON.stringify(binding));
      writeFileSync(join(directory, 'manifest.json'), JSON.stringify(exported.body));
      function invoke(label: string) {
        const stdoutPath = join(directory, label + '.stdout'),
          stderrPath = join(directory, label + '.stderr');
        const stdout = openSync(stdoutPath, 'wx', 0o600);
        let child: ReturnType<typeof Bun.spawnSync>;
        try {
          const stderr = openSync(stderrPath, 'wx', 0o600);
          try {
            child = Bun.spawnSync({
              cmd: [
                process.execPath,
                resolve(
                  import.meta.dir,
                  '../../../../twilight-structure/twilight-burokrat/cli/src/cli.ts',
                ),
                'validate',
                'workflow-binding',
                'workflow.json',
                '--manifest',
                'manifest.json',
              ],
              cwd: directory,
              stdin: 'ignore',
              stdout,
              stderr,
              timeout: 30000,
            });
          } finally {
            closeSync(stderr);
          }
        } finally {
          closeSync(stdout);
        }
        if (child.signalCode !== undefined)
          throw Error('offline Burokrat terminated by signal: ' + child.signalCode);
        return {
          exitCode: child.exitCode,
          stdout: readFileSync(stdoutPath, 'utf8'),
          stderr: readFileSync(stderrPath, 'utf8'),
        };
      }
      const accepted = invoke('accepted');
      expect(accepted.exitCode, accepted.stderr).toBe(0);
      expect(accepted.stdout).toMatch(/^[0-9a-f]{64}\n$/);
      expect(accepted.stderr).toBe('');
      expect(snapshot(fixture)).toEqual(before);
      expect(fixture.pushes).toEqual([]);
      expect(
        (
          await fixture.harness.call('admin', 'POST', '/api/directory/commands', {
            commands: [{ kind: 'createWorkItemType', name: 'Offline manifest type' }],
          })
        ).status,
      ).toBe(200);
      const created = fixture.harness.sqlite
        .query<{ id: string }, [string, string]>(
          'SELECT resource_id AS id FROM work_item_type_organization WHERE organization_id=? AND name=?',
        )
        .get(ORGANIZATION, 'Offline manifest type');
      if (created === null) throw Error('actual type-set change premise absent');
      const changedState = snapshot(fixture),
        changedPushes = structuredClone(fixture.pushes);
      const refreshed = await fixture.harness.call(
        'reader',
        'GET',
        '/api/projects/' + PROJECT + '/step-manifest',
      );
      // Bun1.4.4 replaces nested arrays with asymmetric matchers in toMatchObject;
      // assert a detached observation so the original wire bytes stay intact.
      expect(structuredClone(refreshed)).toMatchObject({
        status: 200,
        body: {
          project: { id: PROJECT, revision: revision + 1 },
          default: [STEP],
          types: expect.arrayContaining([
            { workItemTypeId: created.id, codes: [STEP] },
            { workItemTypeId: TYPE, codes: [STEP] },
          ]) as unknown,
        },
      });
      writeFileSync(join(directory, 'manifest.json'), JSON.stringify(refreshed.body));
      const refused = invoke('stale');
      expect(refused.exitCode).toBe(1);
      expect(refused.stdout).toBe('');
      expect(refused.stderr).toContain('manifest_mismatch');
      expect(refused.stderr).toContain('project.revision');
      binding.project.revision = revision + 1;
      writeFileSync(join(directory, 'workflow.json'), JSON.stringify(binding));
      const rebound = invoke('rebound');
      expect(rebound.exitCode, rebound.stderr).toBe(0);
      expect(rebound.stdout).toMatch(/^[0-9a-f]{64}\n$/);
      expect(rebound.stdout).not.toBe(accepted.stdout);
      expect(rebound.stderr).toBe('');
      expect(snapshot(fixture)).toEqual(changedState);
      expect(fixture.pushes).toEqual(changedPushes);
    } catch (cause: unknown) {
      primary = { cause };
    }
    try {
      rmSync(directory, { recursive: true });
    } catch (cleanup: unknown) {
      if (primary !== undefined)
        throw new AggregateError(
          [primary.cause, cleanup],
          'offline interoperability and temporary ownership cleanup failed',
          { cause: cleanup },
        );
      throw cleanup;
    }
    if (primary !== undefined) throw primary.cause;
  });
}, 60000);
