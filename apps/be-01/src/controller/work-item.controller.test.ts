import { describe, expect, it } from 'bun:test';

import { buildApp } from '../app';
import { ProjectService } from '../service/project.service';
import { WorkItemService } from '../service/work-item.service';
import { inMemoryUsers, testAuthService } from '../testing/auth-fixture';
import { inMemoryProjects } from '../testing/project-fixture';
import { inMemoryWorkItems } from '../testing/work-item-fixture';

function buildHarness() {
  const projectStore = inMemoryProjects();
  const workItemStore = inMemoryWorkItems();
  const app = buildApp({
    auth: testAuthService(inMemoryUsers()),
    projects: new ProjectService({ projects: projectStore }),
    workItems: new WorkItemService({ workItems: workItemStore, projects: projectStore }),
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

  it('refuses an unauthenticated caller', async () => {
    const { send, projectId } = await setup();
    const res = await send(`/api/projects/${projectId}/work-items`, 'not-a-token');
    expect(res.status).toBe(401);
  });
});
