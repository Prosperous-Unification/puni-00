import {
  type PlanDocument,
  planDocumentResponse,
  projectWithSteps,
  validateSchema,
} from '@wbs/contracts';
import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let h: OrganizationHarness;
beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['ada', 'grace', 'vic']) await h.register(username);
  for (const organization of ['org-a', 'org-b']) h.organization(organization);
  h.member('org-a', 'ada', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('vic', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
});
afterEach(() => {
  h.close();
});

async function create(name = 'Puni core', abbreviation?: string, username = 'ada') {
  const answer = await h.call(username, 'POST', '/api/projects', {
    name,
    ...(abbreviation === undefined ? {} : { abbreviation }),
  });
  expect(answer.status).toBe(200);
  return (answer.body as { project: { id: string; abbreviation: string; revision: number } })
    .project;
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
  expect(await h.call('ada', 'GET', `/api/projects/${manual.id}`)).toMatchObject({
    status: 200,
    body: { project: { abbreviation: 'PUNI-CORE_2' } },
  });
  const listed = await h.call('ada', 'GET', '/api/projects');
  expect(listed.status).toBe(200);
  const listing = listed.body as { projects: { id: string; abbreviation: string }[] };
  expect(listing.projects.find((project) => project.id === first.id)).toMatchObject({
    abbreviation: 'PUN',
  });
});

it('refuses invalid manual input without writes', async () => {
  const project = await create();
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
      await h.call('ada', 'PATCH', `/api/projects/${project.id}`, {
        abbreviation,
        name: 'Must not write',
      }),
    ).toEqual({ status: 422, body: { error: 'invalid_abbreviation' } });
    expect(
      await h.call('ada', 'POST', '/api/projects', { name: 'Must not create', abbreviation }),
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
    await h.call('ada', 'PATCH', `/api/projects/${second.id}`, {
      name: 'Must not write',
      abbreviation: 'TaKeN',
    }),
  ).toEqual({ status: 409, body: { error: 'abbreviation_taken' } });
  expect(
    await h.call('ada', 'POST', '/api/projects', {
      name: 'Must not create',
      abbreviation: 'taken',
    }),
  ).toEqual({ status: 409, body: { error: 'abbreviation_taken' } });
  expect(snapshot()).toEqual(before);
  expect((await create('Other organization', 'taken', 'grace')).abbreviation).toBe(
    first.abbreviation,
  );
});

it('rename preserves stable project and relationship identities', async () => {
  const project = await create();
  h.sqlite.run(
    "INSERT INTO work_item(id,project_id,parent_id,position,name) VALUES ('before',?,NULL,0,'Before'),('after',?,NULL,1,'After')",
    [project.id, project.id],
  );
  h.sqlite.run(
    "INSERT INTO dependency(project_id,predecessor_id,successor_id) VALUES (?,'before','after')",
    [project.id],
  );
  const relationships = h.sqlite.query('SELECT * FROM dependency').all();
  const steps = h.sqlite.query('SELECT * FROM step').all();
  expect(
    await h.call('ada', 'PATCH', `/api/projects/${project.id}`, { name: 'Renamed' }),
  ).toMatchObject({ status: 200, body: { project: { id: project.id, abbreviation: 'PUN' } } });
  const before = snapshot();
  expect(
    await h.call('ada', 'PATCH', `/api/projects/${project.id}`, { abbreviation: 'pun' }),
  ).toMatchObject({ status: 200 });
  expect(snapshot()).toEqual(before);
  expect(
    await h.call('ada', 'PATCH', `/api/projects/${project.id}`, {
      name: 'Renamed again',
      abbreviation: 'new_2',
    }),
  ).toMatchObject({
    status: 200,
    body: { project: { id: project.id, abbreviation: 'NEW_2', revision: 2 } },
  });
  expect(h.sqlite.query('SELECT * FROM dependency').all()).toEqual(relationships);
  expect(h.sqlite.query('SELECT * FROM step').all()).toEqual(steps);
});

it('absent and malformed abbreviation rows refuse reads', async () => {
  const project = await create();
  h.sqlite.run('DELETE FROM project_abbreviation WHERE project_id = ?', [project.id]);
  expect((await h.call('ada', 'GET', `/api/projects/${project.id}`)).status).toBe(500);
  expect((await h.call('ada', 'GET', '/api/projects')).status).toBe(500);
  h.sqlite.run('PRAGMA ignore_check_constraints = ON');
  h.sqlite.run(
    "INSERT INTO project_abbreviation(project_id,namespace,abbreviation) VALUES (?,'org:org-a','bad.code')",
    [project.id],
  );
  expect((await h.call('ada', 'GET', `/api/projects/${project.id}`)).status).toBe(500);
  expect((await h.call('ada', 'GET', '/api/projects')).status).toBe(500);
});

it('foreign organization cannot edit code', async () => {
  const project = await create('Secret', 'secret', 'grace');
  const before = snapshot();
  expect(
    await h.call('ada', 'PATCH', `/api/projects/${project.id}`, { abbreviation: 'secret' }),
  ).toEqual({ status: 404, body: { error: 'not_found' } });
  expect(
    await h.call('vic', 'PATCH', `/api/projects/${project.id}`, { abbreviation: 'secret' }),
  ).toEqual({ status: 404, body: { error: 'not_found' } });
  expect(snapshot()).toEqual(before);
  h.sqlite.run('DELETE FROM project_abbreviation WHERE project_id = ?', [project.id]);
  expect(await h.call('ada', 'GET', `/api/projects/${project.id}`)).toEqual({
    status: 404,
    body: { error: 'not_found' },
  });
});

it('counter exhaustion rolls back creation and import', async () => {
  h.sqlite.run('UPDATE project_abbreviation_counter SET next = 11881376');
  const before = snapshot();
  expect(await h.call('ada', 'POST', '/api/projects', { name: 'New' })).toEqual({
    status: 409,
    body: { error: 'abbreviation_exhausted' },
  });
  expect(snapshot()).toEqual(before);
  expect(
    await h.call('ada', 'POST', '/api/projects/import', newDirectoryImport('Counter exhausted')),
  ).toMatchObject({
    status: 409,
    body: { error: 'abbreviation_exhausted' },
  });
  expect(snapshot()).toEqual(before);
});

it('rejects forged trusted namespaces before rendering project labels', async () => {
  const project = await create();
  h.sqlite.run('DROP TRIGGER project_abbreviation_scope_update');
  h.sqlite.run("UPDATE project_abbreviation SET namespace = 'org:org-b' WHERE project_id = ?", [
    project.id,
  ]);
  expect((await h.call('ada', 'GET', `/api/projects/${project.id}`)).status).toBe(500);
  expect((await h.call('ada', 'GET', '/api/projects')).status).toBe(500);
});

it('refuses trusted newline abbreviations', async () => {
  const project = await create();
  h.sqlite.run('PRAGMA ignore_check_constraints = ON');
  h.sqlite.run('UPDATE project_abbreviation SET abbreviation = ? WHERE project_id = ?', [
    'PUN\n',
    project.id,
  ]);
  expect((await h.call('ada', 'GET', `/api/projects/${project.id}`)).status).toBe(500);
});

it('bounded name family exhaustion rolls back all project and import writes', async () => {
  const holder = await create('Holder', 'HOLDER');
  const prefix = ['PUN', 'PUNI', 'PUNIC'];
  for (let first = 0; first < 26; first += 1)
    for (let second = 0; second < 26; second += 1)
      prefix.push('PUN' + String.fromCharCode(65 + first, 65 + second));
  for (const [at, code] of [...new Set(prefix)].entries()) {
    const id = `occupied-${String(at)}`;
    h.sqlite.run('INSERT INTO project(id,name,owner_id,created_at) VALUES (?,?,?,0)', [
      id,
      `Occupied ${String(at)}`,
      h.userId('ada'),
    ]);
    h.sqlite.run('INSERT INTO project_organization(resource_id,organization_id) VALUES (?,?)', [
      id,
      'org-a',
    ]);
    h.sqlite.run('UPDATE project_abbreviation SET abbreviation = ? WHERE project_id = ?', [
      code,
      id,
    ]);
  }
  const before = snapshot();
  expect(await h.call('ada', 'POST', '/api/projects', { name: 'Puni core' })).toEqual({
    status: 409,
    body: { error: 'abbreviation_exhausted' },
  });
  expect(snapshot()).toEqual(before);
  expect(
    await h.call('ada', 'POST', '/api/projects/import', newDirectoryImport('Puni core')),
  ).toMatchObject({ status: 409, body: { error: 'abbreviation_exhausted' } });
  expect(snapshot()).toEqual(before);
  expect((await h.call('ada', 'GET', `/api/projects/${holder.id}`)).status).toBe(200);
});

it('creation excludes its own temporary code and older writers preserve their persisted code', async () => {
  await create('Short', 'AAA');
  await create('Medium', 'AAAA');
  h.sqlite.run('UPDATE project_abbreviation_counter SET next = 0');
  expect((await create('AAAAA')).abbreviation).toBe('AAAAA');
  h.sqlite.run('INSERT INTO project(id,name,owner_id,created_at) VALUES (?,?,?,0)', [
    'old-project',
    'Old name',
    h.userId('ada'),
  ]);
  h.sqlite.run(
    "INSERT INTO project_organization(resource_id,organization_id) VALUES ('old-project','org-a')",
  );
  const before = await h.call('ada', 'GET', '/api/projects/old-project');
  expect(before).toMatchObject({ status: 200, body: { project: { abbreviation: 'AAAAB' } } });
  h.sqlite.run("UPDATE project SET name = 'Older writer renamed' WHERE id = 'old-project'");
  expect(await h.call('ada', 'GET', '/api/projects/old-project')).toMatchObject({
    status: 200,
    body: { project: { abbreviation: 'AAAAB' } },
  });
});

it('keeps ordinary version eleven documents independent of required live abbreviations', async () => {
  const project = await create();
  const exported = await h.call('ada', 'GET', `/api/projects/${project.id}/export?format=json`);
  expect(exported.status).toBe(200);
  const historical = structuredClone(exported.body) as PlanDocument;
  expect(historical.document.version).toBe(11);
  delete historical.project.abbreviation;
  expect((await validateSchema(planDocumentResponse, historical)).issues).toBeUndefined();
  expect(
    (await validateSchema(projectWithSteps, { project: historical.project, steps: [] })).issues,
  ).toBeDefined();
  historical.project.abbreviation = 'bad.code';
  expect((await validateSchema(planDocumentResponse, historical)).issues).toBeDefined();
  historical.project.abbreviation = 'SOURCE';
  const imported = await h.call('ada', 'POST', '/api/projects/import', historical);
  expect(imported.status).toBe(201);
  const importedId = (imported.body as { projectId: string }).projectId;
  expect(await h.call('ada', 'GET', `/api/projects/${importedId}`)).toMatchObject({
    status: 200,
    body: { project: { abbreviation: 'PUNI' } },
  });
});

it('abbreviation-only edits stamp the parent project audit and revision', async () => {
  const project = await create();
  const creation = h.sqlite
    .query<{ created_at: number; created_by: string }, [string]>(
      'SELECT created_at,created_by FROM project WHERE id = ?',
    )
    .get(project.id);
  h.sqlite.run('UPDATE project SET updated_at = 1 WHERE id = ?', [project.id]);
  expect(
    await h.call('ada', 'PATCH', `/api/projects/${project.id}`, { abbreviation: 'AUDIT' }),
  ).toMatchObject({ status: 200, body: { project: { revision: 1, abbreviation: 'AUDIT' } } });
  const stored = h.sqlite
    .query<
      { updated_at: number; created_at: number; created_by: string; revision: number },
      [string]
    >('SELECT updated_at,created_at,created_by,revision FROM project WHERE id = ?')
    .get(project.id);
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
    const project = await create();
    const answer = await h.call('ada', 'PATCH', `/api/projects/${project.id}`, patch);
    expect(answer).toMatchObject({
      status: 200,
      body: {
        project: {
          id: project.id,
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
          'SELECT a.abbreviation,p.timezone,p.revision FROM project p JOIN project_abbreviation a ON a.project_id=p.id WHERE p.id=?',
        )
        .get(project.id),
    ).toEqual({ abbreviation: 'ZONE_2', timezone: 'Europe/Kyiv', revision: 1 });
    expect(await h.call('ada', 'GET', `/api/projects/${project.id}`)).toMatchObject({
      status: 200,
      body: { project: { abbreviation: 'ZONE_2', timezone: 'Europe/Kyiv', revision: 1 } },
    });
  });
}
