import { dirname } from 'node:path';

import { withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { migrateEmptyCatalogueFixture } from '@wbs/store-sqlite/testing/catalogue-database';
import { expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

const ORGANIZATION = 'import-http-org',
  PROJECT = 'import-http-project',
  SIBLING = 'import-http-sibling';

async function withinFixture(
  exercise: (harness: OrganizationHarness, pushes: unknown[]) => Promise<void>,
) {
  const custody = { hasUnknownOwner: false },
    pushes: unknown[] = [];
  const harness = OrganizationHarness.openComposedWith({
    now: () => Date.now(),
    migrate: (path) => {
      migrateEmptyCatalogueFixture({ path, directory: dirname(path), reportedAt: 100 }, custody);
    },
    pushFetch: (_url, request) => {
      pushes.push(request?.body);
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    },
  });
  await withinClaimFixture(
    async () => {
      await harness.closeComposed();
      if (custody.hasUnknownOwner) throw new Error('Import HTTP migration owner is unresolved');
    },
    async () => {
      for (const actor of ['admin', 'manager', 'importer']) await harness.register(actor);
      harness.organization(ORGANIZATION);
      for (const actor of ['admin', 'manager', 'importer']) {
        harness.member(ORGANIZATION, actor, 'member');
        harness.bind(actor, ORGANIZATION);
      }
      harness.grant(ORGANIZATION, 'admin', 'org-admin');
      harness.grantPermissions(ORGANIZATION, 'importer', [
        'organization.navigate',
        'project.read',
        'project.manage_packages',
      ]);
      harness.activate();
      for (const id of [PROJECT, SIBLING])
        harness.sqlite.run(
          'INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES(?,?,?,100,?)',
          [id, ORGANIZATION, id, harness.userId('admin')],
        );
      harness.grant(ORGANIZATION, 'manager', 'project-manager', 'project', PROJECT);
      await exercise(harness, pushes);
    },
  );
}

/** Complete persisted state, not a selected list of expected import writes. */
function snapshot(harness: OrganizationHarness) {
  const db = harness.sqlite;
  return {
    schema: db.query('SELECT * FROM sqlite_master ORDER BY type,name').all(),
    tables: db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map(({ name }) => ({
        name,
        rows: db
          .query('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
          .all()
          .toSorted((left, right) =>
            Buffer.compare(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right))),
          ),
      })),
  };
}

/** Focus catalogue authority while retaining actual imported estimate/actual/progress writes. */
function document() {
  const document = planDocumentFixture();
  document.capacity = [];
  document.calendarMarkers = [];
  document.directory = {
    teams: [],
    people: [],
    tags: [],
    services: [],
    types: [],
    externalSystems: [],
    resources: [],
  };
  document.workItems = document.workItems.map((row) => ({
    ...row,
    serviceTeamId: null,
    serviceId: null,
    teamIds: [],
    tagIds: [],
    serviceIds: [],
    typeIds: [],
    externalRefs: [],
    assignees: {},
    measures: {},
  }));
  return document;
}

test('mounted import rejects malformed definition flags and groups unknown codes without writes', async () => {
  await withinFixture(async (harness, pushes) => {
    const archived = document();
    archived.steps[0].position = 20;
    archived.steps[1].position = 10;
    const before = snapshot(harness);
    for (const defineMissing of ['true', 1, null, [], {}]) {
      expect(
        await harness.call('manager', 'POST', '/api/work-packages/import', {
          projectId: PROJECT,
          document: archived,
          defineMissing,
        }),
      ).toEqual({ status: 422, body: { error: 'invalid_body' } });
      expect(snapshot(harness)).toEqual(before);
    }
    for (const additions of [{}, { defineMissing: false }]) {
      expect(
        await harness.call('manager', 'POST', '/api/work-packages/import', {
          projectId: PROJECT,
          document: archived,
          ...additions,
        }),
      ).toEqual({ status: 422, body: { error: 'unknown_step_codes', codes: ['qa', 'impl'] } });
      expect(snapshot(harness)).toEqual(before);
    }
    expect(pushes).toEqual([]);
  });
}, 60000);

test('mounted import requires project settings for definition and binding, but reuse needs no extra edit grant', async () => {
  await withinFixture(async (harness) => {
    const archived = document(),
      before = snapshot(harness);
    expect(
      await harness.call('importer', 'POST', '/api/work-packages/import', {
        projectId: PROJECT,
        document: archived,
        defineMissing: true,
      }),
    ).toEqual({ status: 403, body: { error: 'forbidden', permission: 'project.manage_settings' } });
    expect(snapshot(harness)).toEqual(before);
    const created = await harness.call('manager', 'POST', '/api/work-packages/import', {
      projectId: PROJECT,
      document: archived,
      defineMissing: true,
    });
    expect(created).toMatchObject({ status: 201, body: { rows: 1 } });
    // The manager has only the actual project grant, without organization.manage_settings or manage_directory.
    expect(
      harness.sqlite.query('SELECT code,name FROM step_definition ORDER BY position').all(),
    ).toEqual([
      { code: 'impl', name: 'Build' },
      { code: 'qa', name: 'QA' },
    ]);
    expect(
      (
        await harness.call('importer', 'POST', '/api/work-packages/import', {
          projectId: PROJECT,
          document: archived,
        })
      ).status,
    ).toBe(201);
    const boundBefore = snapshot(harness);
    expect(
      await harness.call('importer', 'POST', '/api/work-packages/import', {
        projectId: SIBLING,
        document: archived,
      }),
    ).toEqual({ status: 403, body: { error: 'forbidden', permission: 'project.manage_settings' } });
    expect(snapshot(harness)).toEqual(boundBefore);
    expect(
      (
        await harness.call('admin', 'POST', '/api/work-packages/import', {
          projectId: SIBLING,
          document: archived,
        })
      ).status,
    ).toBe(201);
    expect(
      harness.sqlite
        .query('SELECT scope_id,work_item_type_id FROM step_binding ORDER BY scope_id,position')
        .all(),
    ).toEqual([
      { scope_id: PROJECT, work_item_type_id: null },
      { scope_id: PROJECT, work_item_type_id: null },
      { scope_id: SIBLING, work_item_type_id: null },
      { scope_id: SIBLING, work_item_type_id: null },
    ]);
  });
}, 60000);

test('mounted import refuses retired codes with and without definition opt-in before unknown codes', async () => {
  await withinFixture(async (harness, pushes) => {
    const stamp = { at: 100, by: harness.userId('admin') };
    await harness.publicWrites().uow.run(async ({ stores }) => {
      expect(
        await stores.stepCatalogue.defineAndBindStep(
          ORGANIZATION,
          {
            id: 'retired-impl',
            code: 'impl',
            name: 'Retained Build',
            position: 10,
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 0,
          },
          {
            bindingId: 'retired-binding',
            scopeKind: 'project',
            scopeId: PROJECT,
            workItemTypeId: null,
            position: 10,
          },
          stamp,
        ),
      ).toMatchObject({ ok: true });
      expect(
        await stores.stepCatalogue.unbindStep(
          ORGANIZATION,
          'retired-binding',
          { dryRun: false },
          stamp,
        ),
      ).toMatchObject({ kind: 'unbound' });
      expect(
        await stores.stepCatalogue.retireStepDefinition(ORGANIZATION, 'retired-impl', stamp),
      ).toEqual({ ok: true });
      return { commit: true, value: undefined };
    });
    const before = snapshot(harness),
      beforePushes = structuredClone(pushes);
    for (const defineMissing of [false, true]) {
      expect(
        await harness.call('importer', 'POST', '/api/work-packages/import', {
          projectId: PROJECT,
          document: document(),
          defineMissing,
        }),
      ).toEqual({ status: 422, body: { error: 'retired_step_codes', codes: ['impl'] } });
      expect(snapshot(harness)).toEqual(before);
      expect(pushes).toEqual(beforePushes);
    }
  });
}, 60000);

test('mounted import rolls back catalogue birth, explicit values, grants and facts after a late native failure', async () => {
  await withinFixture(async (harness, pushes) => {
    harness.sqlite.run(
      "CREATE TRIGGER import_late_fault BEFORE INSERT ON work_item BEGIN SELECT RAISE(ABORT,'import-late-fault'); END",
    );
    const before = snapshot(harness);
    expect(
      (
        await harness.call('manager', 'POST', '/api/work-packages/import', {
          projectId: PROJECT,
          document: document(),
          defineMissing: true,
        })
      ).status,
    ).toBe(500);
    expect(snapshot(harness)).toEqual(before);
    expect(pushes).toEqual([]);
  });
}, 60000);
