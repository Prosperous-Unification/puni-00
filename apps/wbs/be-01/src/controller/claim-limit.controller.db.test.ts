import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * The concurrent-claim cap (`wbs-organization-limits` slice 3, L9) over be-01's
 * production composition and real SQLite, so a refused batch, undo or redo
 * rolls back exactly as in production. A's cap is written as a row directly:
 * the operator CLI is slice 5. `ada` and `bea` are A's admins and claim as
 * any of A's persons (the D5 bypass), so identity never stands in the way
 * here; two accounts keep two undo stacks.
 */
let h: OrganizationHarness;
let projectId: string;
let steps: string[];

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['ada', 'bea']) {
    await h.register(username);
  }
  h.organization('org-a');
  for (const username of ['ada', 'bea']) {
    h.member('org-a', username, 'admin');
    h.bind(username, 'org-a');
  }
});

afterEach(() => {
  h.close();
});

/** Activates the store and opens A's project with every person the cases claim as. */
async function activated(): Promise<void> {
  h.activate();
  await openProject();
}

async function openProject(): Promise<void> {
  const created = await h.call('ada', 'POST', '/api/projects', { name: 'Claims' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  projectId = (created.body as { project: { id: string } }).project.id;
  steps = h.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id = ? ORDER BY id')
    .all(projectId)
    .map(({ id }) => id);
  for (const id of ['claire', 'codex', 'worker']) {
    h.sqlite.run('INSERT INTO person (id, name, kind) VALUES (?, ?, ?)', [
      id,
      `root-${id}`,
      'agent',
    ]);
    h.sqlite.run(
      'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
      [id, 'org-a', id],
    );
  }
}

function capClaims(maxConcurrentClaims: number): void {
  h.sqlite.run(
    `INSERT INTO organization_limits
       (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at)
     VALUES ('org-a', 50, ?, 10000, 1)
     ON CONFLICT (organization_id) DO UPDATE SET max_concurrent_claims = excluded.max_concurrent_claims`,
    [maxConcurrentClaims],
  );
}

function batch(commands: unknown[], username = 'ada'): Promise<Answer> {
  return h.call(username, 'POST', `/api/projects/${projectId}/commands`, { commands });
}

/** `count` root leaves, answered by id in order. */
async function leaves(count: number): Promise<string[]> {
  const created = await batch(
    Array.from({ length: count }, (_, n) => ({
      kind: 'createWorkItem',
      parentId: null,
      name: `Leaf ${String(n)}`,
    })),
  );
  if (created.status !== 200) throw new Error(`leaves refused: ${JSON.stringify(created)}`);
  return (created.body as { results: { id: string }[] }).results.map(({ id }) => id);
}

const claim = (workItemId: string, personId: string, more: Record<string, unknown> = {}) => ({
  kind: 'claimWorkItem',
  workItemId,
  personId,
  ...more,
});
const release = (workItemId: string, personId: string) => ({
  kind: 'releaseWorkItem',
  workItemId,
  personId,
});

/** A's bound claims: distinct work item, person and run triples (L5). */
function boundClaims(): number {
  const row = h.sqlite
    .query<{ n: number }, []>(
      'SELECT count(*) AS n FROM (SELECT DISTINCT work_item_id, person_id, run_id FROM claim)',
    )
    .get();
  if (row === null) throw new Error('bound claim count answered no row');
  return row.n;
}

function claimRows(): number {
  const row = h.sqlite.query<{ n: number }, []>('SELECT count(*) AS n FROM claim').get();
  if (row === null) throw new Error('claim count answered no row');
  return row.n;
}

const limitRefusal = (at: number, cap: number, current: number) => ({
  status: 409,
  body: { at, kind: 'claimWorkItem', error: 'claim_limit', cap, current },
});

describe('the concurrent-claim cap, activated', () => {
  beforeEach(activated);

  it('refuses the forty-first bound claim, naming the numbers and writing nothing', async () => {
    capClaims(40);
    const ids = await leaves(41);
    const forty = ids.slice(0, 40).map((id) => claim(id, 'codex', { runId: 'r1' }));
    expect((await batch(forty)).status).toBe(200);
    expect(boundClaims()).toBe(40);
    const rows = claimRows();

    expect(await batch([claim(ids[40] ?? '', 'claire', { runId: 'r9' })])).toEqual(
      limitRefusal(0, 40, 40),
    );
    expect(claimRows()).toBe(rows);
  });

  it('answers the plan’s reasons before the cap', async () => {
    capClaims(1);
    const [held] = await leaves(1);
    expect((await batch([claim(held, 'codex', { steps: [steps[0]] })])).status).toBe(200);

    expect(await batch([claim(held, 'claire', { steps: [steps[0]] })])).toMatchObject({
      status: 409,
      body: { at: 0, kind: 'claimWorkItem', error: 'already_claimed' },
    });
  });

  it('refuses inside another’s subtree first, and the cap once that holder releases', async () => {
    const tree = await batch([
      { kind: 'createWorkItem', ref: 'root', parentId: null, name: 'Root' },
      { kind: 'createWorkItem', parentRef: 'root', parentId: null, name: 'Inside' },
      { kind: 'createWorkItem', parentId: null, name: 'X' },
      { kind: 'createWorkItem', parentId: null, name: 'Y' },
    ]);
    if (tree.status !== 200) throw new Error(`tree refused: ${JSON.stringify(tree)}`);
    const [root, inside, x, y] = (tree.body as { results: { id: string }[] }).results.map(
      ({ id }) => id,
    );
    expect(
      (await batch([claim(root, 'codex'), claim(x, 'worker'), claim(y, 'worker')])).status,
    ).toBe(200);
    // Lowered below usage (L11): three held, a cap of two.
    capClaims(2);
    const inner = claim(inside, 'claire');

    expect(await batch([inner])).toMatchObject({
      status: 409,
      body: { error: 'inside_subtree_claim' },
    });
    expect((await batch([release(root, 'codex')])).status).toBe(200);
    expect(await batch([inner])).toEqual(limitRefusal(0, 2, 2));
  });

  it('claims a second step of a held leaf at the cap, and repeats a held claim', async () => {
    capClaims(1);
    const [leaf] = await leaves(1);
    const dev = claim(leaf, 'claire', { runId: 'r1', steps: [steps[0]] });
    expect((await batch([dev])).status).toBe(200);

    expect((await batch([claim(leaf, 'claire', { runId: 'r1', steps: [steps[1]] })])).status).toBe(
      200,
    );
    expect(claimRows()).toBe(2);
    expect(boundClaims()).toBe(1);
    expect(await batch([dev])).toMatchObject({
      status: 200,
      body: { results: [{ alreadyHeld: true }] },
    });
    // Another run of the same person on the same leaf is another bound claim.
    expect(await batch([claim(leaf, 'claire', { runId: 'r2', steps: [steps[1]] })])).toMatchObject({
      status: 409,
      body: { error: 'already_claimed' },
    });
  });

  it('counts two claims of one batch against each other, writing neither', async () => {
    capClaims(2);
    const [a, b, c] = await leaves(3);
    expect((await batch([claim(a, 'codex')])).status).toBe(200);

    expect(await batch([claim(b, 'claire'), claim(c, 'worker')])).toEqual(limitRefusal(1, 2, 2));
    expect(boundClaims()).toBe(1);
  });

  it('frees a place on release', async () => {
    capClaims(1);
    const [a, b] = await leaves(2);
    expect((await batch([claim(a, 'codex')])).status).toBe(200);
    expect(await batch([claim(b, 'claire')])).toEqual(limitRefusal(0, 1, 1));

    expect((await batch([release(a, 'codex'), claim(b, 'claire')])).status).toBe(200);
    expect(boundClaims()).toBe(1);
  });

  it('keeps every claim above a lowered cap, refusing only new ones until releases bring it under', async () => {
    const ids = await leaves(4);
    const [a, b, c, d] = ids;
    expect((await batch([claim(a, 'codex'), claim(b, 'codex'), claim(c, 'codex')])).status).toBe(
      200,
    );
    capClaims(1);

    expect(boundClaims()).toBe(3);
    expect(await batch([claim(d, 'claire')])).toEqual(limitRefusal(0, 1, 3));
    expect((await batch([release(a, 'codex'), release(b, 'codex')])).status).toBe(200);
    expect(await batch([claim(d, 'claire')])).toEqual(limitRefusal(0, 1, 1));
    expect((await batch([release(c, 'codex'), claim(d, 'claire')])).status).toBe(200);
  });

  it('hands a claim down to a first child at the cap', async () => {
    capClaims(1);
    const [leaf] = await leaves(1);
    expect((await batch([claim(leaf, 'claire', { steps: [steps[0]] })])).status).toBe(200);

    expect((await batch([{ kind: 'createWorkItem', parentId: leaf, name: 'Half' }])).status).toBe(
      200,
    );
    expect(boundClaims()).toBe(1);
  });

  it('refuses a redo of a claim once another took the last place', async () => {
    capClaims(1);
    const [a, b] = await leaves(2);
    expect((await batch([claim(a, 'claire')])).status).toBe(200);
    expect((await h.call('ada', 'POST', `/api/projects/${projectId}/undo`)).status).toBe(200);
    expect((await batch([claim(b, 'codex')], 'bea')).status).toBe(200);
    const rows = claimRows();

    const redone = await h.call('ada', 'POST', `/api/projects/${projectId}/redo`);
    expect(redone).toMatchObject({ status: 409, body: { error: 'stale_undo' } });
    expect((redone.body as { detail: string }).detail).toBe('claim_limit: cap 1, current 1.');
    expect(claimRows()).toBe(rows);
  });

  it('refuses an undo of a release once another took the freed place', async () => {
    capClaims(1);
    const [a, b] = await leaves(2);
    expect((await batch([claim(a, 'codex')])).status).toBe(200);
    expect((await batch([release(a, 'codex')])).status).toBe(200);
    expect((await batch([claim(b, 'claire')], 'bea')).status).toBe(200);

    const undone = await h.call('ada', 'POST', `/api/projects/${projectId}/undo`);
    expect(undone).toMatchObject({ status: 409, body: { error: 'stale_undo' } });
    expect((undone.body as { detail: string }).detail).toBe('claim_limit: cap 1, current 1.');
    expect(
      h.sqlite
        .query<{ n: number }, [string]>('SELECT count(*) AS n FROM claim WHERE work_item_id = ?')
        .get(a)?.n,
    ).toBe(0);
  });

  it('undoes a release while a place is free', async () => {
    capClaims(1);
    const [a] = await leaves(1);
    expect((await batch([claim(a, 'codex')])).status).toBe(200);
    expect((await batch([release(a, 'codex')])).status).toBe(200);

    expect((await h.call('ada', 'POST', `/api/projects/${projectId}/undo`)).status).toBe(200);
    expect(boundClaims()).toBe(1);
  });
});

describe('the concurrent-claim cap under legacy access', () => {
  it('claims past any cap with no organization to own one', async () => {
    await openProject();
    // Legacy access has no organization role to bypass the binding (D5).
    h.sqlite.run('UPDATE person SET account_id = ?', [h.userId('ada')]);
    capClaims(0);
    const [a, b] = await leaves(2);

    expect((await batch([claim(a, 'codex'), claim(b, 'claire')])).status).toBe(200);
    expect(boundClaims()).toBe(2);
  });
});
