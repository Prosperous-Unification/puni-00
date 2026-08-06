import { describe, expect, it } from 'bun:test';

import { buildApp } from '../app';
import { ProjectService } from '../service/project.service';
import { WorkItemService } from '../service/work-item.service';
import { inMemoryUsers, testAuthService } from '../testing/auth-fixture';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { inMemoryDependencies } from '../testing/dependency-fixture';
import { inMemoryEstimates } from '../testing/estimate-fixture';
import { inMemoryProjects } from '../testing/project-fixture';
import { testReplay } from '../testing/replay-fixture';
import { inMemoryWorkItems } from '../testing/work-item-fixture';

function buildHarness() {
  const projectStore = inMemoryProjects();
  const workItemStore = inMemoryWorkItems();
  const app = buildApp({
    auth: testAuthService(inMemoryUsers()),
    projects: new ProjectService({ projects: projectStore }),
    workItems: new WorkItemService({
      workItems: workItemStore,
      projects: projectStore,
      estimates: inMemoryEstimates(workItemStore),
      dependencies: inMemoryDependencies(),
      broadcast: recordingBroadcaster(),
    }),
    replay: testReplay().replay,
    probeDatabase: () => 'ok',
    internalAuthSecret: 'x'.repeat(32),
    migrationsApplied: true,
  });

  async function register(username: string): Promise<string> {
    const res = await app.handle(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: 'correct-horse' }),
      }),
    );
    return ((await res.json()) as { token: string }).token;
  }

  function send(
    path: string,
    token: string,
    init: { method?: string; body?: string } = {},
  ): Promise<Response> {
    return app.handle(
      new Request(`http://localhost${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', 'x-wbs-token': token },
      }),
    );
  }

  return { register, send };
}

async function setup() {
  const { register, send } = buildHarness();
  const token = await register('owner');
  const created = await send('/api/projects', token, {
    method: 'POST',
    body: JSON.stringify({ name: 'Rewire the shed' }),
  });
  const { project } = (await created.json()) as { project: { id: string } };
  return { token, send, projectId: project.id };
}

describe('work item routes', () => {
  it('creates a work item and reads it back numbered', async () => {
    const { token, send, projectId } = await setup();

    const created = await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId: null, afterId: null, name: 'Strip' }),
    });
    expect(created.status).toBe(200);

    const tree = await send(`/api/projects/${projectId}/work-items`, token);
    const body = (await tree.json()) as { workItems: { number: string; name: string }[] };
    expect(body.workItems.map((w) => [w.number, w.name])).toEqual([['010', 'Strip']]);
  });

  it('reports the sequence the tree was read at', async () => {
    // The client subscribes after this read, so without a sequence it has no
    // baseline to resume from and an edit landing between the two is lost.
    const { token, send, projectId } = await setup();

    const fresh = await send(`/api/projects/${projectId}/work-items`, token);
    expect(((await fresh.json()) as { seq: number }).seq).toBe(-1);

    await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId: null, afterId: null, name: 'Strip' }),
    });
    await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId: null, afterId: null, name: 'Sand' }),
    });

    const after = await send(`/api/projects/${projectId}/work-items`, token);
    expect(((await after.json()) as { seq: number }).seq).toBe(1);
  });

  it('refuses an earliest start that is not a calendar day', async () => {
    // The column is text, so a stored non-day would throw on every later read
    // of the project. A 400 on one request is the cheap end of that.
    const { token, send, projectId } = await setup();
    const created = await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId: null, afterId: null, name: 'Strip' }),
    });
    const { id } = (await created.json()) as { id: string };

    for (const bad of ['next tuesday', '2026-02-31', '06/08/2026', 7]) {
      const res = await send(`/api/work-items/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ startNoEarlierThan: bad }),
      });
      expect([res.status, JSON.stringify(bad)]).toEqual([400, JSON.stringify(bad)]);
    }
  });

  it('takes an earliest start and gives it back, and clears it', async () => {
    const { token, send, projectId } = await setup();
    const created = await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId: null, afterId: null, name: 'Strip' }),
    });
    const { id } = (await created.json()) as { id: string };

    const set = await send(`/api/work-items/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ startNoEarlierThan: '2026-08-12' }),
    });
    expect(set.status).toBe(200);
    expect((await set.json()) as { startNoEarlierThan: string }).toMatchObject({
      startNoEarlierThan: '2026-08-12',
    });

    const cleared = await send(`/api/work-items/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ startNoEarlierThan: null }),
    });
    expect((await cleared.json()) as { startNoEarlierThan: string | null }).toMatchObject({
      startNoEarlierThan: null,
    });
  });

  it('refuses a client that tries to choose the number', async () => {
    // Numbers are the system's to decide. Accepting one silently would let a
    // client write a label that the next derivation overwrites without warning.
    const { token, send, projectId } = await setup();

    const res = await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId: null, afterId: null, name: 'Strip', number: '999' }),
    });

    expect(res.status).toBe(400);
    const tree = await send(`/api/projects/${projectId}/work-items`, token);
    expect(((await tree.json()) as { workItems: unknown[] }).workItems).toEqual([]);
  });

  it('refuses deleting a parent without a strategy', async () => {
    const { token, send, projectId } = await setup();
    const parent = await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId: null, afterId: null, name: 'Strip' }),
    });
    const parentId = ((await parent.json()) as { id: string }).id;
    await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId, afterId: null, name: 'Sockets' }),
    });

    const res = await send(`/api/work-items/${parentId}`, token, { method: 'DELETE' });

    expect(res.status).toBe(400);
    const tree = await send(`/api/projects/${projectId}/work-items`, token);
    expect(((await tree.json()) as { workItems: unknown[] }).workItems).toHaveLength(2);
  });

  it('renames through PATCH', async () => {
    const { token, send, projectId } = await setup();
    const created = await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId: null, afterId: null, name: 'Strip' }),
    });
    const id = ((await created.json()) as { id: string }).id;

    const res = await send(`/api/work-items/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Strip the old wiring' }),
    });

    expect(res.status).toBe(200);
    const tree = await send(`/api/projects/${projectId}/work-items`, token);
    const body = (await tree.json()) as { workItems: { name: string }[] };
    expect(body.workItems[0]?.name).toBe('Strip the old wiring');
  });

  it('refuses an out-of-order estimate at be-01, with no front end involved', async () => {
    // Called directly, so fe-01's copy of the schema is not in the path. This is
    // what proves the two tiers are independently guarded rather than be-01
    // trusting a client that shares its validation library.
    const { token, send, projectId } = await setup();
    const created = await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId: null, afterId: null, name: 'Strip' }),
    });
    const id = ((await created.json()) as { id: string }).id;

    const res = await send(`/api/work-items/${id}/estimates/role-dev`, token, {
      method: 'PUT',
      body: JSON.stringify({ optimistic: 1, realistic: 5, pessimistic: 3 }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({ error: 'invalid_estimate' });
  });

  it('accepts an ordered estimate and rolls it into the parent', async () => {
    const { token, send, projectId } = await setup();
    const parent = await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId: null, afterId: null, name: 'Strip' }),
    });
    const parentId = ((await parent.json()) as { id: string }).id;
    const child = await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId, afterId: null, name: 'Sockets' }),
    });
    const childId = ((await child.json()) as { id: string }).id;

    const res = await send(`/api/work-items/${childId}/estimates/role-dev`, token, {
      method: 'PUT',
      body: JSON.stringify({ optimistic: 1, realistic: 2, pessimistic: 3 }),
    });

    expect(res.status).toBe(200);
    const tree = await send(`/api/projects/${projectId}/work-items`, token);
    const body = (await tree.json()) as {
      workItems: { name: string; rolledUp: boolean; estimates: Record<string, unknown> }[];
    };
    const strip = body.workItems.find((w) => w.name === 'Strip');
    expect(strip?.rolledUp).toBe(true);
    expect(strip?.estimates['role-dev']).toEqual({
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
    } as never);
  });

  it('refuses an unauthenticated caller', async () => {
    const { send, projectId } = await setup();
    const res = await send(`/api/projects/${projectId}/work-items`, 'not-a-token');
    expect(res.status).toBe(401);
  });
});

describe('dependency routes', () => {
  const add = async (
    send: (p: string, t: string, i?: { method?: string; body?: string }) => Promise<Response>,
    token: string,
    projectId: string,
    name: string,
  ) => {
    const res = await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId: null, afterId: null, name }),
    });
    return ((await res.json()) as { id: string }).id;
  };

  it('records a dependency and reports it with the tree', async () => {
    const { token, send, projectId } = await setup();
    const strip = await add(send, token, projectId, 'Strip');
    const sand = await add(send, token, projectId, 'Sand');

    const res = await send(`/api/work-items/${sand}/dependencies`, token, {
      method: 'POST',
      body: JSON.stringify({ predecessorId: strip }),
    });

    expect(res.status).toBe(200);
    const tree = await send(`/api/projects/${projectId}/work-items`, token);
    const body = (await tree.json()) as { workItems: { id: string; dependsOn: string[] }[] };
    expect(body.workItems.find((w) => w.id === sand)?.dependsOn).toEqual([strip]);
  });

  it('answers 409 for a cycle and writes nothing', async () => {
    const { token, send, projectId } = await setup();
    const strip = await add(send, token, projectId, 'Strip');
    const sand = await add(send, token, projectId, 'Sand');
    await send(`/api/work-items/${sand}/dependencies`, token, {
      method: 'POST',
      body: JSON.stringify({ predecessorId: strip }),
    });

    const res = await send(`/api/work-items/${strip}/dependencies`, token, {
      method: 'POST',
      body: JSON.stringify({ predecessorId: sand }),
    });

    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string }).toEqual({ error: 'cycle' });
    const tree = await send(`/api/projects/${projectId}/work-items`, token);
    const body = (await tree.json()) as { workItems: { id: string; dependsOn: string[] }[] };
    expect(body.workItems.find((w) => w.id === strip)?.dependsOn).toEqual([]);
  });

  it('answers 409 for an edge onto an ancestor', async () => {
    const { token, send, projectId } = await setup();
    const parent = await add(send, token, projectId, 'Phase');
    const child = await send(`/api/projects/${projectId}/work-items`, token, {
      method: 'POST',
      body: JSON.stringify({ parentId: parent, afterId: null, name: 'Task' }),
    });
    const childId = ((await child.json()) as { id: string }).id;

    const res = await send(`/api/work-items/${childId}/dependencies`, token, {
      method: 'POST',
      body: JSON.stringify({ predecessorId: parent }),
    });

    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string }).toEqual({ error: 'ancestor' });
  });

  it('answers 400 when no predecessor is named', async () => {
    // Elysia strips unknown properties before the handler, so a typo\'d field
    // name arrives as an absent one. The route parses its own body for that
    // reason, and this is the test that keeps it doing so.
    const { token, send, projectId } = await setup();
    const strip = await add(send, token, projectId, 'Strip');

    const res = await send(`/api/work-items/${strip}/dependencies`, token, {
      method: 'POST',
      body: JSON.stringify({ predecesorId: strip }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({ error: 'predecessor_required' });
  });

  it('removes a dependency', async () => {
    const { token, send, projectId } = await setup();
    const strip = await add(send, token, projectId, 'Strip');
    const sand = await add(send, token, projectId, 'Sand');
    await send(`/api/work-items/${sand}/dependencies`, token, {
      method: 'POST',
      body: JSON.stringify({ predecessorId: strip }),
    });

    const res = await send(`/api/work-items/${sand}/dependencies/${strip}`, token, {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const tree = await send(`/api/projects/${projectId}/work-items`, token);
    const body = (await tree.json()) as { workItems: { id: string; dependsOn: string[] }[] };
    expect(body.workItems.find((w) => w.id === sand)?.dependsOn).toEqual([]);
  });

  it('reports a schedule with the tree', async () => {
    const { token, send, projectId } = await setup();
    const strip = await add(send, token, projectId, 'Strip');

    const tree = await send(`/api/projects/${projectId}/work-items`, token);
    const body = (await tree.json()) as {
      workItems: { id: string; schedule: { earliestStart: number; estimated: boolean } }[];
    };

    expect(body.workItems.find((w) => w.id === strip)?.schedule).toMatchObject({
      earliestStart: 0,
      estimated: false,
    });
  });
});
