import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
let instant: number;
let ownerAttempt: (() => void) | undefined;

const projectId = 'creator-grant-parent';

beforeEach(async () => {
  instant = Date.now();
  ownerAttempt = undefined;
  harness = OrganizationHarness.openComposedWith({
    now: () => instant,
    onBorrowedUnitOfWork: () => ownerAttempt?.(),
  });
  for (const username of ['creator', 'administrator', 'foreign']) await harness.register(username);
  for (const org of ['org-a', 'org-b']) harness.organization(org);
  harness.member('org-a', 'creator', 'member', ['org-admin']);
  harness.member('org-a', 'administrator', 'member', ['org-admin']);
  harness.member('org-b', 'foreign', 'member', ['org-admin']);
  harness.bind('creator', 'org-a');
  harness.bind('administrator', 'org-a');
  harness.bind('foreign', 'org-b');
  harness.activate();
  harness.sqlite.run(
    "INSERT INTO project (id,organization_id,name,created_at,created_by) VALUES (?,'org-a','Creator grant parent',1,?)",
    [projectId, harness.userId('administrator')],
  );
  await harness.publicWrites().uow.run(async ({ stores }) => {
    for (const [id, code, name, position, defaultAllowancePercent] of [
      ['step-1', 'impl', 'Build', 10, 0],
      ['step-2', 'qa', 'QA', 20, 30],
    ] as const) {
      const bound = await stores.stepCatalogue.defineAndBindStep(
        'org-a',
        {
          id,
          code,
          name,
          position,
          defaultAllowancePercent,
          defaultEstimateUnit: 'workdays',
        },
        {
          bindingId: 'binding-' + id,
          scopeKind: 'project',
          scopeId: projectId,
          workItemTypeId: null,
          position,
        },
        { at: instant, by: harness.userId('administrator') },
      );
      expect(bound).toMatchObject({ ok: true });
    }
    return { commit: true, value: undefined };
  });
});
afterEach(async () => {
  await harness.closeComposed();
});

function createdPackageId(): string {
  const row = harness.sqlite
    .query<{ id: string }, []>('SELECT id FROM work_package ORDER BY rowid DESC LIMIT 1')
    .get();
  if (row === null) throw new Error('created package absent');
  return row.id;
}

test('the actual scoped creator restricts a new package and keeps writing through its creation grant', async () => {
  expect(
    (await harness.call('creator', 'POST', '/api/work-packages', { projectId, name: 'Created' }))
      .status,
  ).toBe(200);
  const id = createdPackageId();
  expect(
    (await harness.call('creator', 'PATCH', `/api/work-packages/${id}`, { restricted: true }))
      .status,
  ).toBe(200);
  const command = {
    commands: [{ kind: 'createWorkItem', name: 'Creator row', parentId: null, afterId: null }],
  };
  expect(
    (await harness.call('creator', 'POST', `/api/work-packages/${id}/commands`, command)).status,
  ).toBe(200);
  expect(
    (await harness.call('administrator', 'POST', `/api/work-packages/${id}/commands`, command))
      .status,
  ).toBe(403);
  expect((await harness.call('foreign', 'GET', `/api/work-packages/${id}`)).status).toBe(404);
  expect(
    harness.sqlite
      .query(
        "SELECT scope_kind,scope_id,subject_kind,subject_id,role_id,origin FROM access_grant WHERE scope_kind='work_package'",
      )
      .all(),
  ).toEqual([
    {
      scope_kind: 'work_package',
      scope_id: id,
      subject_kind: 'user',
      subject_id: harness.userId('creator'),
      role_id: 'package-manager',
      origin: 'creation',
    },
  ]);
});

test('the actual scoped import gives a file-restricted package creator a direct audited creation grant', async () => {
  const document = planDocumentFixture();
  document.settings.restricted = true;
  expect(
    (await harness.call('creator', 'POST', '/api/work-packages/import', { projectId, document }))
      .status,
  ).toBe(201);
  const id = createdPackageId();
  expect(
    (
      await harness.call('creator', 'POST', `/api/work-packages/${id}/commands`, {
        commands: [
          { kind: 'createWorkItem', name: 'Imported creator row', parentId: null, afterId: null },
        ],
      })
    ).status,
  ).toBe(200);
  const grants = harness.sqlite
    .query("SELECT id,origin FROM access_grant WHERE scope_kind='work_package' AND scope_id=?")
    .all(id);
  expect(grants).toHaveLength(1);
  expect(
    harness.sqlite
      .query(
        "SELECT subject_id,detail FROM organization_audit WHERE action='access_granted' AND json_extract(detail,'$.scopeId')=?",
      )
      .all(id),
  ).toHaveLength(1);
});

function domainState() {
  return Object.fromEntries(
    harness.sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map(({ name }) => [
        name,
        harness.sqlite.query(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
      ]),
  );
}

for (const stage of ['creator audit', 'later imported row'] as const)
  test(
    'a ' +
      stage +
      ' failure rolls the entire real import including directory, grants and address allocation back',
    async () => {
      if (stage === 'creator audit')
        harness.sqlite.run(
          "CREATE TRIGGER refuse_creator_audit BEFORE INSERT ON organization_audit WHEN NEW.action='access_granted' BEGIN SELECT RAISE(ABORT,'controlled import creator audit failure'); END",
        );
      else
        harness.sqlite.run(
          "CREATE TRIGGER refuse_imported_row BEFORE INSERT ON work_item BEGIN SELECT RAISE(ABORT,'controlled later import row failure'); END",
        );
      const before = domainState();
      expect(
        (
          await harness.call('creator', 'POST', '/api/work-packages/import', {
            projectId,
            document: planDocumentFixture(),
          })
        ).status,
      ).toBe(500);
      expect(domainState()).toEqual(before);
    },
  );

test('keeps birth at the existing service-time position after outer queuing and shares its one instant', async () => {
  let release: () => void = () => {
    throw new Error('held owner not entered');
  };
  const entered = Promise.withResolvers<undefined>();
  const held = harness.publicWrites().uow.run(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
      entered.resolve(undefined);
    });
    return { commit: true, value: undefined };
  });
  await entered.promise;
  const queued = Promise.withResolvers<undefined>();
  ownerAttempt = () => {
    queued.resolve(undefined);
  };
  const pending = harness.call('creator', 'POST', '/api/work-packages', {
    projectId,
    name: 'After queued owner',
  });
  await queued.promise;
  const before = instant;
  instant += 1000;
  release();
  await held;
  expect((await pending).status).toBe(200);
  ownerAttempt = undefined;
  const id = createdPackageId();
  expect(instant).toBeGreaterThan(before);
  expect(
    harness.sqlite.query('SELECT created_at,created_by FROM work_package WHERE id=?').get(id),
  ).toEqual({ created_at: instant, created_by: harness.userId('creator') });
  expect(
    harness.sqlite
      .query(
        "SELECT created_at,created_by FROM access_grant WHERE scope_kind='work_package' AND scope_id=?",
      )
      .get(id),
  ).toEqual({ created_at: instant, created_by: harness.userId('creator') });
  expect(
    harness.sqlite
      .query("SELECT created_at,actor_id FROM organization_audit WHERE action='access_granted'")
      .all(),
  ).toEqual([{ created_at: instant, actor_id: harness.userId('creator') }]);
});
