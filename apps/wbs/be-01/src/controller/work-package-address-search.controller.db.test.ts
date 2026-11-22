import { createProject, createWorkPackage } from '@wbs/contracts';
import { decodeCursor, encodeCursor } from '@wbs/core/service/list-query';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
import { readFixturePackage } from '../testing/space-rollup';
let h: OrganizationHarness;
let ordinal: number;
beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  ordinal = 0;
  for (const username of ['ada', 'grace']) await h.register(username);
  for (const organization of ['org-a', 'org-b']) h.organization(organization);
  h.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
  h.grantPermissions('org-a', 'ada', ['organization.create_project']);
  h.member('org-b', 'grace', 'member', ['project-contributor', 'org-viewer']);
  h.grantPermissions('org-b', 'grace', ['organization.create_project']);
  h.bind('ada', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
});
afterEach(async () => {
  await h.closeComposed();
});
async function create(username: string, name: string, abbreviation: string): Promise<string> {
  const organizationId = username === 'ada' ? 'org-a' : 'org-b';
  const number = String(++ordinal);
  const created = await h.call(username, createProject.method, createProject.path, { name });
  expect(created.status).toBe(201);
  const parent = await createProject.responses[0].schema.validator['~standard'].validate(
    created.body,
  );
  if (parent.issues !== undefined) throw new Error('address fixture Project reply malformed');
  const projectId = parent.value.project.id;
  const answer = await h.call(username, createWorkPackage.method, createWorkPackage.path, {
    projectId,
    name,
    abbreviation,
  });
  expect(answer.status).toBe(200);
  const plan = await createWorkPackage.responses[0].schema.validator['~standard'].validate(
    answer.body,
  );
  if (plan.issues !== undefined) throw new Error('address fixture Work Package reply malformed');
  await h.publicWrites().uow.run(async ({ stores }) => {
    for (const [code, position] of [
      ['dev', 10],
      ['qa', 20],
    ] as const) {
      const id = code + '-' + number;
      const bound = await stores.stepCatalogue.defineAndBindStep(
        organizationId,
        {
          id,
          code: id,
          name: id,
          position,
          defaultAllowancePercent: 0,
          defaultEstimateUnit: 'workdays',
        },
        {
          bindingId: id + '-binding',
          scopeKind: 'project',
          scopeId: projectId,
          workItemTypeId: null,
          position,
        },
        { at: 1, by: h.userId(username) },
      );
      if (!bound.ok) throw new Error('address fixture Step binding refused: ' + bound.reason);
    }
    return { commit: true, value: undefined };
  });
  return plan.value.workPackage.id;
}
it('alphabetic prefix is bounded and organization scoped', async () => {
  await create('ada', 'Alpha one', 'AX');
  await create('ada', 'Alpha two', 'AY');
  await create('grace', 'Alpha foreign', 'AA');
  const answer = await h.call(
    'ada',
    'GET',
    '/api/work-package-addresses/work-packages?q=a&limit=1',
  );
  expect(answer.status).toBe(200);
  const page = answer.body as { workPackages: { abbreviation: string }[]; nextCursor: string };
  expect(page.workPackages.map((workPackage) => workPackage.abbreviation)).toEqual(['AX']);
  expect(typeof page.nextCursor).toBe('string');
  const next = await h.call(
    'ada',
    'GET',
    `/api/work-package-addresses/work-packages?q=a&limit=1&cursor=${page.nextCursor}`,
  );
  expect(
    (next.body as { workPackages: { abbreviation: string }[] }).workPackages.map(
      (workPackage) => workPackage.abbreviation,
    ),
  ).toEqual(['AY']);
});
it('numeric input is not external discovery', async () => {
  await create('ada', '010 work package', 'NUM');
  for (const q of ['010', '', '_']) {
    expect(await h.call('ada', 'GET', `/api/work-package-addresses/work-packages?q=${q}`)).toEqual({
      status: 200,
      body: { workPackages: [], nextCursor: null },
    });
  }
});
interface CandidatePage {
  workPackage: { workPackageId: string };
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
  const answer = await h.call('ada', 'GET', `/api/work-packages/${id}/address-candidates?${query}`);
  expect(answer.status).toBe(200);
  return answer.body as CandidatePage;
}
function work(workPackageId: string, id: string, parentId: string | null = null): void {
  h.sqlite.run(
    'INSERT INTO work_item (id,work_package_id,parent_id,position,name) VALUES (?,?,?,?,?)',
    [id, workPackageId, parentId, 10, id],
  );
}
it('selected work package scopes steps and work items and caps flattened candidates', async () => {
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
  expect(page.addressRevision).toMatch(/^qar2:[0-9a-f]{64}$/);
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
    `/api/work-packages/${selected}/address-references?reference=puni-2_a.010&revision=${page.addressRevision}`,
  );
  expect(answer.status).toBe(200);
  expect(answer.body).toEqual({
    workPackageId: selected,
    endpoint: { scope: 'whole', workItemId: 'leaf' },
    reference: 'PUNI-2_A.010',
    addressRevision: page.addressRevision,
  });
  expect(
    (
      await h.call(
        'ada',
        'GET',
        `/api/work-packages/${selected}/address-references?reference=bad.&revision=old`,
      )
    ).status,
  ).toBe(422);
  h.sqlite.run("UPDATE work_package_abbreviation SET abbreviation='NEW' WHERE work_package_id=?", [
    selected,
  ]);
  expect(
    (
      await h.call(
        'ada',
        'GET',
        `/api/work-packages/${selected}/address-references?reference=PUNI-2_A.010&revision=${page.addressRevision}`,
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
    const answer = await h.call('ada', 'GET', `/api/work-packages/${foreign}/${suffix}`);
    expect(answer).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await h.call('ada', 'GET', `/api/work-packages/absent/${suffix}`)).toEqual(answer);
  }
});
it('refuses malformed queries and cursor reuse across query work package organization and kind', async () => {
  const selected = await create('ada', 'Alpha', 'AX');
  const other = await create('ada', 'Alpha two', 'AY');
  work(selected, 'leaf');
  work(other, 'other');
  const page = await candidates(selected, 'limit=1');
  const search = await h.call(
    'ada',
    'GET',
    '/api/work-package-addresses/work-packages?q=a&limit=1',
  );
  const workPackageCursor = (search.body as { nextCursor: string }).nextCursor;
  for (const path of [
    `/api/work-package-addresses/work-packages?q=b&cursor=${workPackageCursor}`,
    `/api/work-package-addresses/work-packages?q=a&cursor=${String(page.nextCursor)}`,
    `/api/work-packages/${selected}/address-candidates?q=x&cursor=${String(page.nextCursor)}`,
    `/api/work-packages/${other}/address-candidates?cursor=${String(page.nextCursor)}`,
    `/api/work-packages/${selected}/address-candidates?cursor=${workPackageCursor}`,
    '/api/work-package-addresses/work-packages?limit=0',
    '/api/work-package-addresses/work-packages?limit=201',
    '/api/work-package-addresses/work-packages?q=a&q=b',
    '/api/work-package-addresses/work-packages?cursor=bad',
    `/api/work-package-addresses/work-packages?q=${'a'.repeat(201)}`,
    `/api/work-packages/${selected}/address-references?reference=010`,
    `/api/work-packages/${selected}/address-references?reference=010&revision=x&revision=y`,
  ])
    expect(await h.call('ada', 'GET', path)).toEqual({
      status: 400,
      body: { error: 'invalid_query' },
    });
  expect(
    (
      await h.call(
        'grace',
        'GET',
        `/api/work-package-addresses/work-packages?q=a&cursor=${workPackageCursor}`,
      )
    ).status,
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
      `/api/work-package-addresses/work-packages?q=${encodeURIComponent(q)}`,
    );
    expect(answer.status).toBe(200);
    expect(
      (answer.body as { workPackages: { abbreviation: string }[] }).workPackages.map(
        (workPackage) => workPackage.abbreviation,
      ),
    ).toEqual(expected === 'none' ? [] : [expected]);
  }
});
it('refuses duplicate numbers and missing endpoints without changing database state', async () => {
  const selected = await create('ada', 'Selected', 'P');
  work(selected, 'first');
  work(selected, 'second');
  h.sqlite.run("UPDATE work_item SET frozen_number='080' WHERE work_package_id=?", [selected]);
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
        `/api/work-packages/${selected}/address-references?reference=${reference}&revision=${page.addressRevision}`,
      ),
    ).toEqual({ status, body });
  expect(captureState()).toEqual(before);
});
it('changes revision for leafhood and catalogue binding order but keeps label-only edits', async () => {
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
        `/api/work-packages/${selected}/address-candidates?cursor=${String(first.nextCursor)}`,
      )
    ).status,
  ).toBe(409);
  const second = await candidates(selected);
  const { workPackage, steps } = await readFixturePackage(h, 'ada', selected);
  const ids = steps.map(({ id }) => id + '-binding').reverse();
  expect(ids).toHaveLength(2);
  expect(
    await h.call('ada', 'POST', '/api/organization/step-bindings/reorder', {
      scopeKind: 'project',
      scopeId: workPackage.projectId,
      ids,
    }),
  ).toMatchObject({ status: 204 });
  expect((await candidates(selected)).addressRevision).not.toBe(second.addressRevision);
});
it('fails missing abbreviation evidence visibly even outside the discovery match', async () => {
  const selected = await create('ada', 'Broken', 'BROKEN');
  h.sqlite.run('DELETE FROM work_package_abbreviation WHERE work_package_id=?', [selected]);
  expect(
    (await h.call('ada', 'GET', '/api/work-package-addresses/work-packages?q=unrelated')).status,
  ).toBe(500);
  expect(
    (await h.call('ada', 'GET', `/api/work-packages/${selected}/address-candidates`)).status,
  ).toBe(500);
});
it('viewer can discover a restricted work package and leaf steps belong to that work package', async () => {
  const selected = await create('ada', 'Restricted', 'P');
  const other = await create('ada', 'Other', 'Q');
  work(selected, 'leaf');
  h.sqlite.run('UPDATE work_package SET restricted=1 WHERE id=?', [selected]);
  h.sqlite.run("UPDATE organization_membership SET role='viewer' WHERE organization_id='org-a'");
  const page = await candidates(selected);
  const stepIds = (await readFixturePackage(h, 'ada', selected)).steps.map(({ id }) => id);
  const otherIds = (await readFixturePackage(h, 'ada', other)).steps.map(({ id }) => id);
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
    `/api/work-packages/${selected}/address-references?reference=${coded.reference.toLowerCase()}&revision=${page.addressRevision}`,
  );
  expect(resolved.status).toBe(200);
  expect((resolved.body as { endpoint: { stepId: string } }).endpoint.stepId).toBe(
    coded.endpoint.stepId,
  );
});
it('legacy authority keeps duplicate organization codes as separate explicit choices', async () => {
  const first = await create('ada', 'First', 'SAME');
  const second = await create('grace', 'Second', 'SAME');
  // Exercise preactivation discovery with persisted organization namespaces from two parents.
  h.sqlite.run('DROP TRIGGER organization_activation_no_revert');
  h.sqlite.run("UPDATE organization_activation SET state='pre_activation',activated_at=NULL");
  const answer = await h.call('ada', 'GET', '/api/work-package-addresses/work-packages?q=same');
  expect(answer.status).toBe(200);
  expect(
    (answer.body as { workPackages: { workPackageId: string }[] }).workPackages
      .map((workPackage) => workPackage.workPackageId)
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
      await h.call(
        'ada',
        'GET',
        `/api/work-packages/${selected}/address-candidates?cursor=${altered}`,
      ),
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

it.each(['a', '010', ''])(
  'rejects present JSON null discovery cursor for token "%s"',
  async (q) => {
    await create('ada', 'Alpha', 'ALPHA');
    expect(
      await h.call('ada', 'GET', `/api/work-package-addresses/work-packages?q=${q}&cursor=bnVsbA`),
    ).toEqual({ status: 400, body: { error: 'invalid_query' } });
  },
);
it('rejects present JSON null selected work package cursor', async () => {
  const selected = await create('ada', 'Alpha', 'ALPHA');
  expect(
    await h.call('ada', 'GET', `/api/work-packages/${selected}/address-candidates?cursor=bnVsbA`),
  ).toEqual({ status: 400, body: { error: 'invalid_query' } });
});
it.each(['current', 'stale'])(
  'rejects array cursor scope before %s revision checks',
  async (observation) => {
    const selected = await create('ada', 'Selected', 'P');
    work(selected, 'leaf');
    const page = await candidates(selected, 'limit=1');
    if (page.nextCursor === null) throw new Error('continuation missing');
    const cursor = decodeCursor(page.nextCursor) as Record<string, unknown> & { v: 1 };
    const revision = observation === 'current' ? page.addressRevision : 'old';
    const altered = encodeCursor({ ...cursor, scope: ['node'], stepId: 'anything', revision });
    expect(
      await h.call(
        'ada',
        'GET',
        `/api/work-packages/${selected}/address-candidates?cursor=${altered}`,
      ),
    ).toEqual({ status: 400, body: { error: 'invalid_query' } });
  },
);

it('fails malformed frozen placement evidence visibly during mounted candidate lookup', async () => {
  const selected = await create('ada', 'Selected', 'P');
  work(selected, 'leaf');
  h.sqlite.run("UPDATE work_item SET frozen_number='bad' WHERE id='leaf'");
  expect(await h.call('ada', 'GET', `/api/work-packages/${selected}/address-candidates`)).toEqual({
    status: 500,
    body: expect.anything(),
  });
});
