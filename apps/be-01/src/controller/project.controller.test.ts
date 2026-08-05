import { describe, expect, it } from 'bun:test';

import { buildApp } from '../app';
import { ProjectService } from '../service/project.service';
import { WorkItemService } from '../service/work-item.service';
import { inMemoryUsers, testAuthService } from '../testing/auth-fixture';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { inMemoryEstimates } from '../testing/estimate-fixture';
import { inMemoryProjects } from '../testing/project-fixture';
import { testReplay } from '../testing/replay-fixture';
import { inMemoryWorkItems } from '../testing/work-item-fixture';

function buildWorkItemService(projectStore: ReturnType<typeof inMemoryProjects>) {
  const workItemStore = inMemoryWorkItems();
  return new WorkItemService({
    workItems: workItemStore,
    projects: projectStore,
    estimates: inMemoryEstimates(workItemStore),
    broadcast: recordingBroadcaster(),
  });
}

function buildHarness() {
  const auth = testAuthService(inMemoryUsers());
  const projectStore = inMemoryProjects();
  const projects = new ProjectService({ projects: projectStore });
  const app = buildApp({
    auth,
    projects,
    workItems: buildWorkItemService(projectStore),
    replay: testReplay().replay,
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
    const body = (await res.json()) as { token: string };
    return body.token;
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

  return { app, register, send };
}

const created = (name: string) => ({ method: 'POST', body: JSON.stringify({ name }) });

describe('projects', () => {
  it('creates a project owned by the caller, holding Dev and QA', async () => {
    const { register, send } = buildHarness();
    const token = await register('owner');

    const res = await send('/api/projects', token, created('Rewire the shed'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      project: { name: string; ownerId: string; restricted: boolean };
      roles: { name: string }[];
    };
    expect(body.project.name).toBe('Rewire the shed');
    expect(body.project.restricted).toBe(false);
    expect(body.roles.map((r) => r.name)).toEqual(['Dev', 'QA']);
  });

  it('lists every project regardless of who owns it', async () => {
    const { register, send } = buildHarness();
    const mine = await register('owner');
    const theirs = await register('stranger');
    await send('/api/projects', mine, created('Mine'));
    await send('/api/projects', theirs, created('Theirs'));

    const res = await send('/api/projects', mine);

    const body = (await res.json()) as { projects: { name: string }[] };
    expect(body.projects.map((p) => p.name).sort()).toEqual(['Mine', 'Theirs']);
  });

  it('lets a non-owner read a restricted project', async () => {
    const { register, send } = buildHarness();
    const owner = await register('owner');
    const stranger = await register('stranger');
    const create = await send('/api/projects', owner, created('Restricted'));
    const { project } = (await create.json()) as { project: { id: string } };
    await send(`/api/projects/${project.id}`, owner, {
      method: 'PATCH',
      body: JSON.stringify({ restricted: true }),
    });

    const res = await send(`/api/projects/${project.id}`, stranger);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { project: { name: string } };
    expect(body.project.name).toBe('Restricted');
  });

  // The check this proves is the whole of `restricted`. Without it the API
  // reads as if the flag works — the field round-trips, the UI shows a lock —
  // while any account can still write.
  it('refuses a non-owner editing a restricted project, and writes nothing', async () => {
    const { register, send } = buildHarness();
    const owner = await register('owner');
    const stranger = await register('stranger');
    const create = await send('/api/projects', owner, created('Restricted'));
    const { project } = (await create.json()) as { project: { id: string } };
    await send(`/api/projects/${project.id}`, owner, {
      method: 'PATCH',
      body: JSON.stringify({ restricted: true }),
    });

    const res = await send(`/api/projects/${project.id}`, stranger, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed by a stranger' }),
    });

    expect(res.status).toBe(403);
    const after = await send(`/api/projects/${project.id}`, stranger);
    const body = (await after.json()) as { project: { name: string } };
    expect(body.project.name).toBe('Restricted');
  });

  it('lets any account edit an unrestricted project', async () => {
    const { register, send } = buildHarness();
    const owner = await register('owner');
    const stranger = await register('stranger');
    const create = await send('/api/projects', owner, created('Open'));
    const { project } = (await create.json()) as { project: { id: string } };

    const res = await send(`/api/projects/${project.id}`, stranger, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed by a stranger' }),
    });

    expect(res.status).toBe(200);
  });

  it('refuses an unauthenticated caller', async () => {
    const { app } = buildHarness();
    const res = await app.handle(new Request('http://localhost/api/projects'));
    expect(res.status).toBe(401);
  });
});
