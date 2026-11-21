import {
  type PlanDocument,
  planDocumentResponse,
  validateSchema,
  workPackageWithSteps,
} from '@wbs/contracts';
import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let h: OrganizationHarness;
beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['ada', 'grace', 'vic']) await h.register(username);
  for (const [organization, username, parent] of [
    ['org-a', 'ada', 'address-parent-a'],
    ['org-b', 'grace', 'address-parent-b'],
  ] as const) {
    h.organization(organization);
    h.sqlite.run(
      'INSERT INTO project(id,organization_id,name,created_by,created_at) VALUES(?,?,?,?,1)',
      [parent, organization, 'Address parent', h.userId(username)],
    );
  }
  h.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
  h.grantPermissions('org-a', 'ada', [
    'organization.create_project',
    'package.manage_settings',
    'organization.manage_directory',
  ]);
  h.member('org-a', 'vic', 'viewer', ['org-viewer']);
  h.member('org-b', 'grace', 'member', ['project-contributor', 'org-viewer']);
  h.grantPermissions('org-b', 'grace', [
    'organization.create_project',
    'package.manage_settings',
    'organization.manage_directory',
  ]);
  h.bind('ada', 'org-a');
  h.bind('vic', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
});
afterEach(() => {
  h.close();
});

async function create(name = 'Puni core', abbreviation?: string, username = 'ada') {
  const answer = await h.call(username, 'POST', '/api/work-packages', {
    projectId: username === 'grace' ? 'address-parent-b' : 'address-parent-a',
    name,
    ...(abbreviation === undefined ? {} : { abbreviation }),
  });
  expect(answer.status).toBe(200);
  return (answer.body as { workPackage: { id: string; abbreviation: string; revision: number } })
    .workPackage;
}

/** Every durable table, including directories, ownership, associations, event/history and allocator state. */
function snapshot() {
  const tables = h.sqlite
    .query<{ name: string }, []>("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
    .all();
  return tables.map(({ name }) => ({
    name,
    rows: h.sqlite
      .query<Record<string, unknown>, []>(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
      .all()
      .map((row) => JSON.stringify(row))
      .sort(),
  }));
}

function newDirectoryImport(name: string) {
  const document = planDocumentFixture();
  document.settings.name = name;
  document.directory.services[0].name = 'New Exhaustion Service';
  document.directory.teams[0].name = 'New Exhaustion Team';
  document.directory.people[0].name = 'New Exhaustion Person';
  document.directory.tags[0].name = 'New Exhaustion Tag';
  document.directory.types[0].name = 'New Exhaustion Type';
  document.directory.externalSystems[0].name = 'New Exhaustion System';
  return document;
}

it('creates and normalizes abbreviation', async () => {
  const first = await create();
  const second = await create();
  const third = await create();
  const fourth = await create();
  expect([
    first.abbreviation,
    second.abbreviation,
    third.abbreviation,
    fourth.abbreviation,
  ]).toEqual(['PUN', 'PUNI', 'PUNIC', 'PUNAA']);
  const manual = await create('Manual', 'puni-core_2');
  expect(manual.abbreviation).toBe('PUNI-CORE_2');
  expect(await h.call('ada', 'GET', `/api/work-packages/${manual.id}`)).toMatchObject({
    status: 200,
    body: { workPackage: { abbreviation: 'PUNI-CORE_2' } },
  });
  const listed = await h.call('ada', 'GET', '/api/work-packages');
  expect(listed.status).toBe(200);
  const listing = listed.body as { workPackages: { id: string; abbreviation: string }[] };
  expect(listing.workPackages.find((workPackage) => workPackage.id === first.id)).toMatchObject({
    abbreviation: 'PUN',
  });
});

it('refuses invalid manual input without writes', async () => {
  const workPackage = await create();
  for (const abbreviation of [
    '',
    'A'.repeat(21),
    '1A',
    '-A',
    '_A',
    'A.B',
    ' A',
    'é',
    'ſ',
    'A\0B',
    'A\n',
  ]) {
    const before = snapshot();
    expect(
      await h.call('ada', 'PATCH', `/api/work-packages/${workPackage.id}`, {
        abbreviation,
        name: 'Must not write',
      }),
    ).toEqual({ status: 422, body: { error: 'invalid_abbreviation' } });
    expect(
      await h.call('ada', 'POST', '/api/work-packages', {
        projectId: 'address-parent-a',
        name: 'Must not create',
        abbreviation,
      }),
    ).toEqual({ status: 422, body: { error: 'invalid_abbreviation' } });
    expect(snapshot()).toEqual(before);
  }
  expect((await create('One', 'a')).abbreviation).toBe('A');
  expect((await create('Twenty', 'a'.repeat(20))).abbreviation).toBe('A'.repeat(20));
});

it('duplicate manual edit is a typed conflict', async () => {
  const first = await create('One', 'taken');
  const second = await create('Two', 'other');
  const before = snapshot();
  expect(
    await h.call('ada', 'PATCH', `/api/work-packages/${second.id}`, {
      name: 'Must not write',
      abbreviation: 'TaKeN',
    }),
  ).toEqual({ status: 409, body: { error: 'abbreviation_taken' } });
  expect(
    await h.call('ada', 'POST', '/api/work-packages', {
      projectId: 'address-parent-a',
      name: 'Must not create',
      abbreviation: 'taken',
    }),
  ).toEqual({ status: 409, body: { error: 'abbreviation_taken' } });
  expect(snapshot()).toEqual(before);
  expect((await create('Other organization', 'taken', 'grace')).abbreviation).toBe(
    first.abbreviation,
  );
});

it('rename preserves stable work package and relationship identities', async () => {
  const workPackage = await create();
  h.sqlite.run(
    "INSERT INTO work_item(id,work_package_id,parent_id,position,name) VALUES ('before',?,NULL,0,'Before'),('after',?,NULL,1,'After')",
    [workPackage.id, workPackage.id],
  );
  h.sqlite.run(
    "INSERT INTO dependency(work_package_id,predecessor_id,successor_id) VALUES (?,'before','after')",
    [workPackage.id],
  );
  const relationships = h.sqlite.query('SELECT * FROM dependency').all();
  const steps = h.sqlite.query('SELECT * FROM step').all();
  expect(
    await h.call('ada', 'PATCH', `/api/work-packages/${workPackage.id}`, { name: 'Renamed' }),
  ).toMatchObject({
    status: 200,
    body: { workPackage: { id: workPackage.id, abbreviation: 'PUN' } },
  });
  const before = snapshot();
  expect(
    await h.call('ada', 'PATCH', `/api/work-packages/${workPackage.id}`, { abbreviation: 'pun' }),
  ).toMatchObject({ status: 200 });
  expect(snapshot()).toEqual(before);
  expect(
    await h.call('ada', 'PATCH', `/api/work-packages/${workPackage.id}`, {
      name: 'Renamed again',
      abbreviation: 'new_2',
    }),
  ).toMatchObject({
    status: 200,
    body: { workPackage: { id: workPackage.id, abbreviation: 'NEW_2', revision: 2 } },
  });
  expect(h.sqlite.query('SELECT * FROM dependency').all()).toEqual(relationships);
  expect(h.sqlite.query('SELECT * FROM step').all()).toEqual(steps);
});

it('absent and malformed abbreviation rows refuse reads', async () => {
  const workPackage = await create();
  h.sqlite.run('DELETE FROM work_package_abbreviation WHERE work_package_id = ?', [workPackage.id]);
  expect((await h.call('ada', 'GET', `/api/work-packages/${workPackage.id}`)).status).toBe(500);
  expect((await h.call('ada', 'GET', '/api/work-packages')).status).toBe(500);
  h.sqlite.run('PRAGMA ignore_check_constraints = ON');
  h.sqlite.run(
    "INSERT INTO work_package_abbreviation(work_package_id,namespace,abbreviation) VALUES (?,'org:org-a','bad.code')",
    [workPackage.id],
  );
  expect((await h.call('ada', 'GET', `/api/work-packages/${workPackage.id}`)).status).toBe(500);
  expect((await h.call('ada', 'GET', '/api/work-packages')).status).toBe(500);
});

it('foreign organization cannot edit code', async () => {
  const workPackage = await create('Secret', 'secret', 'grace');
  const before = snapshot();
  expect(
    await h.call('ada', 'PATCH', `/api/work-packages/${workPackage.id}`, {
      abbreviation: 'secret',
    }),
  ).toEqual({ status: 404, body: { error: 'not_found' } });
  expect(
    await h.call('vic', 'PATCH', `/api/work-packages/${workPackage.id}`, {
      abbreviation: 'secret',
    }),
  ).toEqual({ status: 404, body: { error: 'not_found' } });
  expect(snapshot()).toEqual(before);
  h.sqlite.run('DELETE FROM work_package_abbreviation WHERE work_package_id = ?', [workPackage.id]);
  expect(await h.call('ada', 'GET', `/api/work-packages/${workPackage.id}`)).toEqual({
    status: 404,
    body: { error: 'not_found' },
  });
});

it('counter exhaustion rolls back creation and import', async () => {
  h.sqlite.run('UPDATE work_package_abbreviation_counter SET next = 11881376');
  const before = snapshot();
  expect(
    await h.call('ada', 'POST', '/api/work-packages', {
      projectId: 'address-parent-a',
      name: 'New',
    }),
  ).toEqual({
    status: 409,
    body: { error: 'abbreviation_exhausted' },
  });
  expect(snapshot()).toEqual(before);
  expect(
    await h.call('ada', 'POST', '/api/work-packages/import', {
      projectId: 'address-parent-a',
      document: newDirectoryImport('Counter exhausted'),
    }),
  ).toMatchObject({
    status: 409,
    body: { error: 'abbreviation_exhausted' },
  });
  expect(snapshot()).toEqual(before);
});

it('rejects forged trusted namespaces before rendering work package labels', async () => {
  const workPackage = await create();
  h.sqlite.run('DROP TRIGGER work_package_abbreviation_scope_update');
  h.sqlite.run(
    "UPDATE work_package_abbreviation SET namespace = 'org:org-b' WHERE work_package_id = ?",
    [workPackage.id],
  );
  expect((await h.call('ada', 'GET', `/api/work-packages/${workPackage.id}`)).status).toBe(500);
  expect((await h.call('ada', 'GET', '/api/work-packages')).status).toBe(500);
});

it('refuses trusted newline abbreviations', async () => {
  const workPackage = await create();
  h.sqlite.run('PRAGMA ignore_check_constraints = ON');
  h.sqlite.run('UPDATE work_package_abbreviation SET abbreviation = ? WHERE work_package_id = ?', [
    'PUN\n',
    workPackage.id,
  ]);
  expect((await h.call('ada', 'GET', `/api/work-packages/${workPackage.id}`)).status).toBe(500);
});

it('bounded name family exhaustion rolls back all work package and import writes', async () => {
  const holder = await create('Holder', 'HOLDER');
  const prefix = ['PUN', 'PUNI', 'PUNIC'];
  for (let first = 0; first < 26; first += 1)
    for (let second = 0; second < 26; second += 1)
      prefix.push('PUN' + String.fromCharCode(65 + first, 65 + second));
  for (const [at, code] of [...new Set(prefix)].entries()) {
    const id = `occupied-${String(at)}`;
    h.sqlite.run(
      "INSERT INTO work_package(id,name,created_by,project_id,created_at) VALUES (?,?,?,'address-parent-a',0)",
      [id, `Occupied ${String(at)}`, h.userId('ada')],
    );
    h.sqlite.run(
      'INSERT INTO work_package_organization(resource_id,organization_id) VALUES (?,?)',
      [id, 'org-a'],
    );
    h.sqlite.run(
      'UPDATE work_package_abbreviation SET abbreviation = ? WHERE work_package_id = ?',
      [code, id],
    );
  }
  const before = snapshot();
  expect(
    await h.call('ada', 'POST', '/api/work-packages', {
      projectId: 'address-parent-a',
      name: 'Puni core',
    }),
  ).toEqual({
    status: 409,
    body: { error: 'abbreviation_exhausted' },
  });
  expect(snapshot()).toEqual(before);
  expect(
    await h.call('ada', 'POST', '/api/work-packages/import', {
      projectId: 'address-parent-a',
      document: newDirectoryImport('Puni core'),
    }),
  ).toMatchObject({ status: 409, body: { error: 'abbreviation_exhausted' } });
  expect(snapshot()).toEqual(before);
  expect((await h.call('ada', 'GET', `/api/work-packages/${holder.id}`)).status).toBe(200);
});

it('creation excludes its own temporary code and older writers preserve their persisted code', async () => {
  await create('Short', 'AAA');
  await create('Medium', 'AAAA');
  h.sqlite.run('UPDATE work_package_abbreviation_counter SET next = 0');
  expect((await create('AAAAA')).abbreviation).toBe('AAAAA');
  h.sqlite.run(
    "INSERT INTO work_package(id,name,created_by,project_id,created_at) VALUES (?,?,?,'address-parent-a',0)",
    ['old-work-package', 'Old name', h.userId('ada')],
  );
  h.sqlite.run(
    "INSERT INTO work_package_organization(resource_id,organization_id) VALUES ('old-work-package','org-a')",
  );
  const before = await h.call('ada', 'GET', '/api/work-packages/old-work-package');
  expect(before).toMatchObject({ status: 200, body: { workPackage: { abbreviation: 'AAAAB' } } });
  h.sqlite.run(
    "UPDATE work_package SET name = 'Older writer renamed' WHERE id = 'old-work-package'",
  );
  expect(await h.call('ada', 'GET', '/api/work-packages/old-work-package')).toMatchObject({
    status: 200,
    body: { workPackage: { abbreviation: 'AAAAB' } },
  });
});

it('keeps ordinary version eleven documents independent of required live abbreviations', async () => {
  const workPackage = await create();
  const exported = await h.call(
    'ada',
    'GET',
    `/api/work-packages/${workPackage.id}/export?format=json`,
  );
  expect(exported.status).toBe(200);
  const historical = structuredClone(exported.body) as PlanDocument;
  expect(historical.document.version).toBe(15);
  delete historical.workPackage.abbreviation;
  expect((await validateSchema(planDocumentResponse, historical)).issues).toBeUndefined();
  expect(
    (await validateSchema(workPackageWithSteps, { workPackage: historical.workPackage, steps: [] }))
      .issues,
  ).toBeDefined();
  historical.workPackage.abbreviation = 'bad.code';
  expect((await validateSchema(planDocumentResponse, historical)).issues).toBeDefined();
  historical.workPackage.abbreviation = 'SOURCE';
  const imported = await h.call('ada', 'POST', '/api/work-packages/import', {
    projectId: 'address-parent-a',
    document: historical,
  });
  expect(imported.status).toBe(201);
  const importedId = (imported.body as { workPackageId: string }).workPackageId;
  expect(await h.call('ada', 'GET', `/api/work-packages/${importedId}`)).toMatchObject({
    status: 200,
    body: { workPackage: { abbreviation: 'PUNI' } },
  });
});

it('abbreviation-only edits stamp the parent work package audit and revision', async () => {
  const workPackage = await create();
  const creation = h.sqlite
    .query<{ created_at: number; created_by: string }, [string]>(
      'SELECT created_at,created_by FROM work_package WHERE id = ?',
    )
    .get(workPackage.id);
  h.sqlite.run('UPDATE work_package SET updated_at = 1 WHERE id = ?', [workPackage.id]);
  expect(
    await h.call('ada', 'PATCH', `/api/work-packages/${workPackage.id}`, { abbreviation: 'AUDIT' }),
  ).toMatchObject({ status: 200, body: { workPackage: { revision: 1, abbreviation: 'AUDIT' } } });
  const stored = h.sqlite
    .query<
      { updated_at: number; created_at: number; created_by: string; revision: number },
      [string]
    >('SELECT updated_at,created_at,created_by,revision FROM work_package WHERE id = ?')
    .get(workPackage.id);
  expect(stored?.created_by).toBe(creation?.created_by);
  expect(stored?.created_at).toBe(creation?.created_at);
  expect(stored?.updated_at).toBeGreaterThan(1);
  expect(stored?.revision).toBe(1);
});

for (const patch of [
  { abbreviation: 'zone_2', timezone: 'Europe/Kyiv' },
  { abbreviation: 'zone_2', timezone: 'Europe/Kyiv', name: 'Zoned rename' },
]) {
  it(`writes abbreviation and timezone in one revision${'name' in patch ? ' with a name' : ''}`, async () => {
    const workPackage = await create();
    const answer = await h.call('ada', 'PATCH', `/api/work-packages/${workPackage.id}`, patch);
    expect(answer).toMatchObject({
      status: 200,
      body: {
        workPackage: {
          id: workPackage.id,
          abbreviation: 'ZONE_2',
          timezone: 'Europe/Kyiv',
          revision: 1,
          ...('name' in patch ? { name: patch.name } : {}),
        },
      },
    });
    expect(
      h.sqlite
        .query<{ abbreviation: string; timezone: string; revision: number }, [string]>(
          'SELECT a.abbreviation,p.timezone,p.revision FROM work_package p JOIN work_package_abbreviation a ON a.work_package_id=p.id WHERE p.id=?',
        )
        .get(workPackage.id),
    ).toEqual({ abbreviation: 'ZONE_2', timezone: 'Europe/Kyiv', revision: 1 });
    expect(await h.call('ada', 'GET', `/api/work-packages/${workPackage.id}`)).toMatchObject({
      status: 200,
      body: { workPackage: { abbreviation: 'ZONE_2', timezone: 'Europe/Kyiv', revision: 1 } },
    });
  });
}
