import { decodeCursor, encodeCursor } from '@wbs/core/service/list-query';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
let h: OrganizationHarness;
beforeEach(async () => {
  h = OrganizationHarness.open();
  for (const username of ['ada', 'grace']) await h.register(username);
  for (const organization of ['org-a', 'org-b']) h.organization(organization);
  h.member('org-a', 'ada', 'member');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
});
afterEach(() => {
  h.close();
});
async function create(username: string, name: string, abbreviation: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name, abbreviation });
  expect(answer.status).toBe(200);
  return (answer.body as { project: { id: string } }).project.id;
}
it('alphabetic prefix is bounded and organization scoped', async () => {
  await create('ada', 'Alpha one', 'AX');
  await create('ada', 'Alpha two', 'AY');
  await create('grace', 'Alpha foreign', 'AA');
  const answer = await h.call('ada', 'GET', '/api/project-addresses/projects?q=a&limit=1');
  expect(answer.status).toBe(200);
  const page = answer.body as { projects: { abbreviation: string }[]; nextCursor: string };
  expect(page.projects.map((project) => project.abbreviation)).toEqual(['AX']);
  expect(typeof page.nextCursor).toBe('string');
  const next = await h.call(
    'ada',
    'GET',
    `/api/project-addresses/projects?q=a&limit=1&cursor=${page.nextCursor}`,
  );
  expect(
    (next.body as { projects: { abbreviation: string }[] }).projects.map(
      (project) => project.abbreviation,
    ),
  ).toEqual(['AY']);
});
it('numeric input is not external discovery', async () => {
  await create('ada', '010 project', 'NUM');
  for (const q of ['010', '', '_']) {
    expect(await h.call('ada', 'GET', `/api/project-addresses/projects?q=${q}`)).toEqual({
      status: 200,
      body: { projects: [], nextCursor: null },
    });
  }
});
interface CandidatePage {
  project: { projectId: string };
  addressRevision: string;
  candidates: {
    workItemId: string;
    reference: string | null;
    endpoint: { scope: string; stepId?: string };
    step?: { id: string; code: string | null };
  }[];
  nextCursor: string | null;
}
async function candidates(id: string, query = ''): Promise<CandidatePage> {
  const answer = await h.call('ada', 'GET', `/api/projects/${id}/address-candidates?${query}`);
  expect(answer.status).toBe(200);
  return answer.body as CandidatePage;
}
function work(projectId: string, id: string, parentId: string | null = null): void {
  h.sqlite.run('INSERT INTO work_item (id,project_id,parent_id,position,name) VALUES (?,?,?,?,?)', [
    id,
    projectId,
    parentId,
    10,
    id,
  ]);
}
it('selected project scopes steps and work items and caps flattened candidates', async () => {
  const selected = await create('ada', 'Selected', 'PUNI-2');
  const other = await create('ada', 'Other', 'OTHER');
  work(selected, 'parent');
  work(selected, 'child', 'parent');
  work(other, 'elsewhere');
  const page = await candidates(selected, 'limit=2');
  expect(page.candidates.length).toBe(2);
  expect(page.candidates.map((candidate) => candidate.workItemId)).toEqual(['parent', 'parent']);
  expect(page.candidates.map((candidate) => candidate.endpoint.scope)).toEqual([
    'whole',
    'descendant-step',
  ]);
  expect(page.candidates[1].reference).toBeNull();
  expect(page.addressRevision.startsWith('qar1:')).toBe(true);
  expect(page.nextCursor).not.toBeNull();
  let next = page;
  const all = [...page.candidates];
  while (next.nextCursor !== null) {
    next = await candidates(selected, `limit=2&cursor=${next.nextCursor}`);
    all.push(...next.candidates);
  }
  expect(all.every((candidate) => ['parent', 'child'].includes(candidate.workItemId))).toBe(true);
  expect(all.some((candidate) => candidate.endpoint.scope === 'node')).toBe(true);
});
it('manual punctuation and lowercase resolve and malformed syntax precedes stale', async () => {
  const selected = await create('ada', 'Selected', 'PUNI-2_A');
  work(selected, 'leaf');
  const page = await candidates(selected);
  const answer = await h.call(
    'ada',
    'GET',
    `/api/projects/${selected}/address-references?reference=puni-2_a.010&revision=${page.addressRevision}`,
  );
  expect(answer.status).toBe(200);
  expect(answer.body).toEqual({
    projectId: selected,
    endpoint: { scope: 'whole', workItemId: 'leaf' },
    reference: 'PUNI-2_A.010',
    addressRevision: page.addressRevision,
  });
  expect(
    (
      await h.call(
        'ada',
        'GET',
        `/api/projects/${selected}/address-references?reference=bad.&revision=old`,
      )
    ).status,
  ).toBe(422);
  h.sqlite.run("UPDATE project_abbreviation SET abbreviation='NEW' WHERE project_id=?", [selected]);
  expect(
    (
      await h.call(
        'ada',
        'GET',
        `/api/projects/${selected}/address-references?reference=PUNI-2_A.010&revision=${page.addressRevision}`,
      )
    ).status,
  ).toBe(409);
});
it('foreign and absent addresses have identical refusal', async () => {
  const foreign = await create('grace', 'Secret', 'SECRET');
  for (const suffix of [
    'address-candidates',
    'address-references?reference=SECRET.010&revision=old',
  ]) {
    const answer = await h.call('ada', 'GET', `/api/projects/${foreign}/${suffix}`);
    expect(answer).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await h.call('ada', 'GET', `/api/projects/absent/${suffix}`)).toEqual(answer);
  }
});
it('refuses malformed queries and cursor reuse across query project organization and kind', async () => {
  const selected = await create('ada', 'Alpha', 'AX');
  const other = await create('ada', 'Alpha two', 'AY');
  work(selected, 'leaf');
  work(other, 'other');
  const page = await candidates(selected, 'limit=1');
  const search = await h.call('ada', 'GET', '/api/project-addresses/projects?q=a&limit=1');
  const projectCursor = (search.body as { nextCursor: string }).nextCursor;
  for (const path of [
    `/api/project-addresses/projects?q=b&cursor=${projectCursor}`,
    `/api/project-addresses/projects?q=a&cursor=${String(page.nextCursor)}`,
    `/api/projects/${selected}/address-candidates?q=x&cursor=${String(page.nextCursor)}`,
    `/api/projects/${other}/address-candidates?cursor=${String(page.nextCursor)}`,
    `/api/projects/${selected}/address-candidates?cursor=${projectCursor}`,
    '/api/project-addresses/projects?limit=0',
    '/api/project-addresses/projects?limit=201',
    '/api/project-addresses/projects?q=a&q=b',
    '/api/project-addresses/projects?cursor=bad',
    `/api/project-addresses/projects?q=${'a'.repeat(201)}`,
    `/api/projects/${selected}/address-references?reference=010`,
    `/api/projects/${selected}/address-references?reference=010&revision=x&revision=y`,
  ])
    expect(await h.call('ada', 'GET', path)).toEqual({
      status: 400,
      body: { error: 'invalid_query' },
    });
  expect(
    (await h.call('grace', 'GET', `/api/project-addresses/projects?q=a&cursor=${projectCursor}`))
      .status,
  ).toBe(400);
});
it('keeps exact Unicode name matching and literal punctuation', async () => {
  await create('ada', 'İSTANBUL _roof%', 'CITY');
  await create('ada', 'Plain roof', 'PLAIN');
  for (const [q, expected] of [
    ['i̇stan', 'CITY'],
    ['roof%', 'CITY'],
    ['roof_', 'none'],
  ] as const) {
    const answer = await h.call(
      'ada',
      'GET',
      `/api/project-addresses/projects?q=${encodeURIComponent(q)}`,
    );
    expect(answer.status).toBe(200);
    expect(
      (answer.body as { projects: { abbreviation: string }[] }).projects.map(
        (project) => project.abbreviation,
      ),
    ).toEqual(expected === 'none' ? [] : [expected]);
  }
});
it('refuses duplicate numbers and missing endpoints without changing database state', async () => {
  const selected = await create('ada', 'Selected', 'P');
  work(selected, 'first');
  work(selected, 'second');
  h.sqlite.run("UPDATE work_item SET frozen_number='080' WHERE project_id=?", [selected]);
  const page = await candidates(selected);
  const before = captureState();
  for (const [reference, status, body] of [
    ['P.080', 422, { error: 'unresolvable_reference', reason: 'ambiguous_work_item' }],
    ['P.999', 404, { error: 'not_found' }],
    ['OTHER.080', 404, { error: 'not_found' }],
    ['P.080.unknown', 422, { error: 'unresolvable_reference', reason: 'ambiguous_work_item' }],
    ['1P.080', 422, { error: 'unresolvable_reference', reason: 'malformed' }],
    ['P'.repeat(21) + '.080', 422, { error: 'unresolvable_reference', reason: 'malformed' }],
  ] as const)
    expect(
      await h.call(
        'ada',
        'GET',
        `/api/projects/${selected}/address-references?reference=${reference}&revision=${page.addressRevision}`,
      ),
    ).toEqual({ status, body });
  expect(captureState()).toEqual(before);
});
it('changes revision for leafhood and uncoded step order but keeps label-only edits', async () => {
  const selected = await create('ada', 'Selected', 'P');
  work(selected, 'leaf');
  const first = await candidates(selected, 'limit=1');
  h.sqlite.run("UPDATE work_item SET name='Renamed' WHERE id='leaf'");
  expect((await candidates(selected, 'limit=1')).addressRevision).toBe(first.addressRevision);
  work(selected, 'child', 'leaf');
  expect(
    (
      await h.call(
        'ada',
        'GET',
        `/api/projects/${selected}/address-candidates?cursor=${String(first.nextCursor)}`,
      )
    ).status,
  ).toBe(409);
  const second = await candidates(selected);
  h.sqlite.run('UPDATE step SET code=NULL,position=position+100 WHERE project_id=?', [selected]);
  expect((await candidates(selected)).addressRevision).not.toBe(second.addressRevision);
});
it('fails missing abbreviation evidence visibly even outside the discovery match', async () => {
  const selected = await create('ada', 'Broken', 'BROKEN');
  h.sqlite.run('DELETE FROM project_abbreviation WHERE project_id=?', [selected]);
  expect((await h.call('ada', 'GET', '/api/project-addresses/projects?q=unrelated')).status).toBe(
    500,
  );
  expect((await h.call('ada', 'GET', `/api/projects/${selected}/address-candidates`)).status).toBe(
    500,
  );
});
it('viewer can discover a restricted project and leaf steps belong to that project', async () => {
  const selected = await create('ada', 'Restricted', 'P');
  const other = await create('ada', 'Other', 'Q');
  work(selected, 'leaf');
  h.sqlite.run('UPDATE project SET restricted=1 WHERE id=?', [selected]);
  h.sqlite.run("UPDATE organization_membership SET role='viewer' WHERE organization_id='org-a'");
  const page = await candidates(selected);
  const stepIds = h.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id=?')
    .all(selected)
    .map((step) => step.id);
  const otherIds = h.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id=?')
    .all(other)
    .map((step) => step.id);
  expect(
    page.candidates
      .filter((candidate) => candidate.endpoint.scope === 'node')
      .map((candidate) => candidate.endpoint.stepId)
      .sort(),
  ).toEqual([...stepIds].sort());
  expect(
    page.candidates.some((candidate) => otherIds.includes(candidate.endpoint.stepId ?? '')),
  ).toBe(false);
  const coded = page.candidates.find(
    (candidate) => candidate.endpoint.scope === 'node' && candidate.reference !== null,
  );
  if (coded?.reference == null || coded.endpoint.stepId === undefined)
    throw new Error('coded node missing');
  const resolved = await h.call(
    'ada',
    'GET',
    `/api/projects/${selected}/address-references?reference=${coded.reference.toLowerCase()}&revision=${page.addressRevision}`,
  );
  expect(resolved.status).toBe(200);
  expect((resolved.body as { endpoint: { stepId: string } }).endpoint.stepId).toBe(
    coded.endpoint.stepId,
  );
});
it('legacy authority keeps duplicate organization codes as separate explicit choices', async () => {
  h.close();
  h = OrganizationHarness.open();
  await h.register('ada');
  await h.register('grace');
  h.organization('org-a');
  h.organization('org-b');
  const first = await create('ada', 'First', 'SAME');
  const second = await create('grace', 'Second', 'OTHER');
  h.sqlite.run("INSERT INTO project_organization(resource_id,organization_id) VALUES(?,'org-a')", [
    first,
  ]);
  h.sqlite.run("INSERT INTO project_organization(resource_id,organization_id) VALUES(?,'org-b')", [
    second,
  ]);
  h.sqlite.run("UPDATE project_abbreviation SET abbreviation='SAME' WHERE project_id=?", [second]);
  const answer = await h.call('ada', 'GET', '/api/project-addresses/projects?q=same');
  expect(answer.status).toBe(200);
  expect(
    (answer.body as { projects: { projectId: string }[] }).projects
      .map((project) => project.projectId)
      .sort(),
  ).toEqual([first, second].sort());
});

it('rejects impossible and malformed endpoint continuation coordinates', async () => {
  const selected = await create('ada', 'Selected', 'P');
  work(selected, 'leaf');
  const page = await candidates(selected, 'limit=1');
  if (page.nextCursor === null) throw new Error('continuation missing');
  const cursor = decodeCursor(page.nextCursor) as Record<string, unknown> & { v: 1 };
  for (const change of [
    { kind: 'wrong' },
    { workItemId: 'absent' },
    { scope: 'step' },
    { scope: 'whole', stepId: 'unexpected' },
    { extra: 'forged' },
  ]) {
    const altered = encodeCursor({ ...cursor, ...change });
    expect(
      await h.call('ada', 'GET', `/api/projects/${selected}/address-candidates?cursor=${altered}`),
    ).toEqual({ status: 400, body: { error: 'invalid_query' } });
  }
});

/** Reads every persisted table so another connection's side effects remain observable. */
function captureState() {
  return h.sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => ({
      name,
      rows: h.sqlite
        .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    }));
}
