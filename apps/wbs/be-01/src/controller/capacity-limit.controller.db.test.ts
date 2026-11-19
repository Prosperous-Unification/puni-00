import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * The capacity cap (`wbs-organization-limits` slice 4, L2, L9, L11) on
 * `setResourceCapacity` and the plan import, over be-01's production
 * composition and real SQLite, so a refused batch or import rolls back exactly
 * as in production. A's cap is written as a row directly: the operator CLI is
 * slice 5. `ada` is A's admin; `grace` is B's.
 */
let h: OrganizationHarness;
let p: string;
let q: string;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['ada', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'admin', ['org-admin']);
  h.member('org-b', 'grace', 'admin', ['org-admin']);
  h.bind('ada', 'org-a');
  h.bind('grace', 'org-b');
});

afterEach(() => {
  h.close();
});

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/work-packages', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { workPackage: { id: string } }).workPackage.id;
}

/** Declares one divisible resource through the caller's directory, answering its id. */
async function declare(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/directory/commands', {
    commands: [{ kind: 'createResource', name, resourceKind: 'divisible', unitLabel: 'GB' }],
  });
  if (answer.status !== 200) throw new Error(`declare refused: ${JSON.stringify(answer)}`);
  const id = (answer.body as { results: { id?: string }[] }).results.at(0)?.id;
  if (id === undefined) throw new Error('the create minted no id');
  return id;
}

function capUnits(organizationId: string, maxCapacityUnitsPerResource: number): void {
  h.sqlite.run(
    `INSERT INTO organization_limits
       (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at)
     VALUES (?, 50, 200, ?, 1)
     ON CONFLICT (organization_id) DO UPDATE SET max_capacity_units_per_resource = excluded.max_capacity_units_per_resource`,
    [organizationId, maxCapacityUnitsPerResource],
  );
}

function batch(workPackageId: string, commands: unknown[], username = 'ada'): Promise<Answer> {
  return h.call(username, 'POST', `/api/work-packages/${workPackageId}/commands`, { commands });
}

const state = (resourceId: string, units: number | null) => ({
  kind: 'setResourceCapacity',
  resourceId,
  units,
});

/** What `workPackageId` states of `resourceId`, or null when unstated. */
function stated(workPackageId: string, resourceId: string): number | null {
  return (
    h.sqlite
      .query<{ units: number }, [string, string]>(
        'SELECT units FROM work_package_resource_capacity WHERE work_package_id = ? AND resource_id = ?',
      )
      .get(workPackageId, resourceId)?.units ?? null
  );
}

function workPackageCount(): number {
  const row = h.sqlite.query<{ n: number }, []>('SELECT count(*) AS n FROM work_package').get();
  if (row === null) throw new Error('work package count answered no row');
  return row.n;
}

const limitRefusal = (
  at: number,
  resourceId: string,
  cap: number,
  declared: number,
  asked: number,
) => ({
  status: 409,
  body: {
    at,
    kind: 'setResourceCapacity',
    error: 'capacity_limit',
    resourceId,
    cap,
    declared,
    asked,
  },
});

describe('the capacity cap, activated', () => {
  let ram: string;

  beforeEach(async () => {
    h.activate();
    p = await create('ada', 'P');
    q = await create('ada', 'Q');
    ram = await declare('ada', 'h2puni ram');
    capUnits('org-a', 64);
  });

  it('refuses a statement past the cap, naming the four numbers and writing nothing', async () => {
    expect((await batch(p, [state(ram, 48)])).status).toBe(200);

    expect(await batch(q, [state(ram, 32)])).toEqual(limitRefusal(0, ram, 64, 48, 32));
    expect(stated(q, ram)).toBeNull();
    expect((await batch(q, [state(ram, 16)])).status).toBe(200);
    expect(stated(q, ram)).toBe(16);
  });

  it('raises a work package’s own statement within the cap, its own units not counted', async () => {
    expect((await batch(p, [state(ram, 48)])).status).toBe(200);

    expect((await batch(p, [state(ram, 48)])).status).toBe(200);
    expect((await batch(p, [state(ram, 64)])).status).toBe(200);
    expect(await batch(p, [state(ram, 65)])).toEqual(limitRefusal(0, ram, 64, 0, 65));
    expect(stated(p, ram)).toBe(64);
  });

  it('applies lowering and restating under a cap lowered below them', async () => {
    expect((await batch(p, [state(ram, 48)])).status).toBe(200);
    capUnits('org-a', 32);

    expect((await batch(p, [state(ram, 48)])).status).toBe(200);
    expect((await batch(p, [state(ram, 40)])).status).toBe(200);
    expect(await batch(p, [state(ram, 49)])).toEqual(limitRefusal(0, ram, 32, 0, 49));
    expect(stated(p, ram)).toBe(40);
  });

  it('keeps every statement above a lowered cap, and clears without consulting it', async () => {
    expect((await batch(p, [state(ram, 40)])).status).toBe(200);
    expect((await batch(q, [state(ram, 24)])).status).toBe(200);
    capUnits('org-a', 10);

    expect([stated(p, ram), stated(q, ram)]).toEqual([40, 24]);
    expect(await batch(q, [state(ram, 25)])).toEqual(limitRefusal(0, ram, 10, 40, 25));
    expect((await batch(p, [state(ram, null)])).status).toBe(200);
    expect(stated(p, ram)).toBeNull();
    expect((await batch(q, [state(ram, 0)])).status).toBe(200);
  });

  it('journals no statement, so no undo or redo can put one back past the cap', async () => {
    expect((await batch(p, [state(ram, 48)])).status).toBe(200);
    expect((await batch(p, [state(ram, null)])).status).toBe(200);
    expect((await batch(q, [state(ram, 64)])).status).toBe(200);

    expect(await h.call('ada', 'POST', `/api/work-packages/${p}/undo`)).toMatchObject({
      status: 409,
      body: { error: 'nothing_to_undo' },
    });
    expect(stated(p, ram)).toBeNull();
  });

  it('sums each resource on its own', async () => {
    const worktrees = await declare('ada', 'worktrees');
    expect((await batch(p, [state(ram, 64)])).status).toBe(200);

    expect((await batch(q, [state(worktrees, 10)])).status).toBe(200);
    expect(await batch(q, [state(ram, 1)])).toEqual(limitRefusal(0, ram, 64, 64, 1));
  });

  it('counts a statement earlier in the same batch, writing neither', async () => {
    const worktrees = await declare('ada', 'worktrees');
    expect((await batch(q, [state(ram, 30)])).status).toBe(200);

    expect(await batch(p, [state(worktrees, 5), state(ram, 30), state(ram, 40)])).toEqual(
      limitRefusal(2, ram, 64, 30, 40),
    );
    expect([stated(p, ram), stated(p, worktrees)]).toEqual([null, null]);
  });

  it('never counts another organization’s work packages', async () => {
    capUnits('org-b', 64);
    const bRam = await declare('grace', 'h2puni ram');
    const b = await create('grace', 'B');
    expect((await batch(b, [state(bRam, 64)], 'grace')).status).toBe(200);

    expect((await batch(p, [state(ram, 64)])).status).toBe(200);
  });

  /** A plan document stating `units` of one resource named `h2puni ram`. */
  async function documentStating(units: number) {
    const exported = await h.call('ada', 'GET', `/api/work-packages/${p}/export?format=json`);
    if (exported.status !== 200) throw new Error(`export refused: ${JSON.stringify(exported)}`);
    const document = exported.body as Record<string, unknown>;
    return {
      ...document,
      directory: {
        ...(document['directory'] as Record<string, unknown>),
        resources: [{ id: 'file-ram', name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' }],
      },
      resourceCapacities: [{ resourceId: 'file-ram', units }],
    };
  }

  it('refuses an import stating past the cap, writing nothing', async () => {
    const document = await documentStating(70);
    const workPackages = workPackageCount();

    expect(await h.call('ada', 'POST', '/api/work-packages/import', document)).toEqual({
      status: 409,
      body: { error: 'capacity_limit', resourceId: ram, cap: 64, declared: 0, asked: 70 },
    });
    expect(workPackageCount()).toBe(workPackages);
  });

  it('refuses an import that would state past the cap beside another work package, the export’s source among them', async () => {
    expect((await batch(p, [state(ram, 64)])).status).toBe(200);
    const exported = await h.call('ada', 'GET', `/api/work-packages/${p}/export?format=json`);
    const workPackages = workPackageCount();

    // The import creates its work package; the one exported keeps its 64.
    expect(await h.call('ada', 'POST', '/api/work-packages/import', exported.body)).toEqual({
      status: 409,
      body: { error: 'capacity_limit', resourceId: ram, cap: 64, declared: 64, asked: 64 },
    });
    expect(workPackageCount()).toBe(workPackages);
    expect((await batch(p, [state(ram, null)])).status).toBe(200);
    expect((await h.call('ada', 'POST', '/api/work-packages/import', exported.body)).status).toBe(
      201,
    );
  });

  it('imports a capacity that reaches the cap exactly', async () => {
    expect((await batch(q, [state(ram, 16)])).status).toBe(200);

    const imported = await h.call(
      'ada',
      'POST',
      '/api/work-packages/import',
      await documentStating(48),
    );
    expect(imported.status).toBe(201);
    const { workPackageId } = imported.body as { workPackageId: string };
    expect(stated(workPackageId, ram)).toBe(48);
  });
});

describe('the capacity cap under legacy access', () => {
  it('states past any cap with no organization to own one', async () => {
    p = await create('ada', 'P');
    q = await create('ada', 'Q');
    const ram = await declare('ada', 'h2puni ram');
    capUnits('org-a', 0);

    expect((await batch(p, [state(ram, 48)])).status).toBe(200);
    expect((await batch(q, [state(ram, 48)])).status).toBe(200);
  });
});
