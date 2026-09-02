import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { buildApp } from '../app';
import type { Step, WorkItem, WriteStamp } from '../repository';
import { ActualRepository } from '../repository/actual';
import { CommandJournalRepository } from '../repository/command-journal';
import { openDrizzle } from '../repository/db';
import { DependencyRepository } from '../repository/dependency';
import { DirectoryRepository } from '../repository/directory';
import { EstimateRepository } from '../repository/estimate';
import { runMigrations } from '../repository/migrate';
import { ProjectRepository } from '../repository/project';
import { StepRepository } from '../repository/step';
import { StepMeasureRepository } from '../repository/step-measure';
import { StepProgressRepository } from '../repository/step-progress';
import { UserRepository } from '../repository/user';
import { SubtreeRepository, WorkItemRepository } from '../repository/work-item';
import { AuthService } from '../service/auth.service';
import { DirectoryService } from '../service/directory.service';
import { ProjectService } from '../service/project.service';
import { StepService } from '../service/step.service';
import { WorkItemService } from '../service/work-item.service';
import { TEST_JWT_KEY } from '../testing/auth-fixture';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { inMemoryCapacity, testCapacityService } from '../testing/capacity-fixture';
import { personAdded } from '../testing/directory-fixture';
import { testHistoryService } from '../testing/history-fixture';
import { inMemoryPriorityBands, testPriorityBandService } from '../testing/priority-band-fixture';
import { testReplay } from '../testing/replay-fixture';
import { workItemRow } from '../testing/work-item-fixture';
import { testWrites } from '../testing/writes-fixture';

/**
 * The step routes, over real SQLite.
 *
 * Real for the same reason `undo.controller.test.ts` is: every status this file
 * asserts is decided by rows — the unique index behind a 409 `taken`, the
 * estimates behind a 409 `in_use` — and a fixture answering them would be a
 * second implementation of the rules under test.
 */
const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let app: ReturnType<typeof buildApp>;
let stepStore: StepRepository;
let estimates: EstimateRepository;
let actuals: ActualRepository;
let measures: StepMeasureRepository;
let progressStore: StepProgressRepository;
let directory: DirectoryRepository;
let workItems: WorkItemRepository;
let projects: ProjectRepository;
let seededBy: string;

const DAYS = { optimistic: 1, realistic: 2, pessimistic: 3 };

/**
 * The stamp the rows this file seeds straight into the repositories carry.
 *
 * The account exists only so they have one: `created_by` references `users(id)`
 * and this file is against real SQLite, while the plans below belong to accounts
 * `register` makes through the route and hands back nothing but a token. Nothing
 * here asserts on either field.
 */
const wrote = (): WriteStamp => ({ at: 1, by: seededBy });

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-step-http-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const db = openDrizzle(path);

  projects = new ProjectRepository(db);
  stepStore = new StepRepository(db);
  estimates = new EstimateRepository(db);
  actuals = new ActualRepository(db);
  measures = new StepMeasureRepository(db);
  progressStore = new StepProgressRepository(db);
  directory = new DirectoryRepository(db);
  workItems = new WorkItemRepository(db);

  seededBy = crypto.randomUUID();
  await new UserRepository(db).create(
    { id: seededBy, username: 'the-fixture', passwordHash: 'x', createdAt: 1 },
    { at: 1, by: seededBy },
  );

  app = buildApp({
    directory: new DirectoryService({ directory, broadcast: recordingBroadcaster() }),
    capacity: testCapacityService(),
    priorityBands: testPriorityBandService(),
    history: testHistoryService(),
    auth: new AuthService({ users: new UserRepository(db), jwtKey: TEST_JWT_KEY }),
    projects: new ProjectService({ projects }),
    steps: new StepService({ projects, steps: stepStore, broadcast: recordingBroadcaster() }),
    workItems: new WorkItemService({
      workItems,
      projects,
      estimates,
      actuals,
      measures,
      progress: progressStore,
      dependencies: new DependencyRepository(db),
      directory,
      capacity: inMemoryCapacity(),
      priorityBands: inMemoryPriorityBands(),
      subtrees: new SubtreeRepository(db),
      journal: new CommandJournalRepository(db),
      broadcast: recordingBroadcaster(),
    }),
    replay: testReplay().replay,
    probeDatabase: () => 'ok',
    internalAuthSecret: 'x'.repeat(32),
    writes: testWrites(),
    migrationsApplied: true,
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
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
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    }),
  );
}

async function newProject(token: string): Promise<{ id: string; devId: string; qaId: string }> {
  const res = await send('/api/projects', token, {
    method: 'POST',
    body: JSON.stringify({ name: 'Rewire the shed' }),
  });
  const body = (await res.json()) as {
    project: { id: string };
    steps: { id: string; name: string }[];
  };
  const dev = body.steps.find((each) => each.name === 'Dev');
  const qa = body.steps.find((each) => each.name === 'QA');
  if (dev === undefined || qa === undefined) throw new Error('a project without its seed steps');
  return { id: body.project.id, devId: dev.id, qaId: qa.id };
}

const addStep = (projectId: string, token: string, name: string): Promise<Response> =>
  send(`/api/projects/${projectId}/steps`, token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

/** One plan batch of a single command — the one way a plan is written to. */
const planCommand = (
  projectId: string,
  token: string,
  step: Record<string, unknown>,
): Promise<Response> =>
  send(`/api/projects/${projectId}/commands`, token, {
    method: 'POST',
    body: JSON.stringify({ commands: [step] }),
  });

/** A top-level work item by name, through the command that creates them; throws on a refusal. */
async function newWorkItem(projectId: string, token: string, name: string): Promise<string> {
  const res = await planCommand(projectId, token, {
    kind: 'createWorkItem',
    parentId: null,
    afterId: null,
    name,
  });
  const body = (await res.json()) as { results?: { id?: string }[] };
  const id = body.results?.at(0)?.id;
  if (res.status !== 200 || id === undefined) {
    throw new Error(`the create was refused: ${String(res.status)} ${JSON.stringify(body)}`);
  }
  return id;
}

describe('the steps routes are the only spelling', () => {
  it("serves a project's steps", async () => {
    const token = await register('owner');
    const project = await newProject(token);

    expect((await addStep(project.id, token, 'Design')).status).toBe(200);

    // The list is the project read's — a second GET would be a second read of
    // one fact, which is why `stepController` mounts none (see its JSDoc). What
    // this asserts is that the list comes back under `steps` and names what the
    // steps route just wrote.
    const read = await send(`/api/projects/${project.id}`, token);
    const body = (await read.json()) as { steps: { name: string }[] };
    expect(body.steps.map((step) => step.name)).toEqual(['Dev', 'QA', 'Design']);
  });

  it('refuses the old roles route as unknown', async () => {
    const token = await register('owner');
    const project = await newProject(token);

    /*
      Every verb, because a shim that kept one of them would be the compatibility
      layer `steps-not-phases` design D3 decided against: the three callers ship
      together, so an accepted `roles` request is a second parse path nobody asks
      for and a second spelling of one resource on the wire.

      Proof: `.post('/:id/roles', …)` left mounted beside `/:id/steps` in
      `step.controller.ts`, forwarding to the same handler. This failed on
      `expect(received).toBe(expected) … Expected: 404  Received: 200`, and the
      other two verbs stayed green — which is the point of asserting all three.
      Watched 2026-08-29.
    */
    const post = await send(`/api/projects/${project.id}/roles`, token, {
      method: 'POST',
      body: JSON.stringify({ name: 'Design' }),
    });
    expect(post.status).toBe(404);

    const patch = await send(`/api/projects/${project.id}/roles/${project.qaId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Review' }),
    });
    expect(patch.status).toBe(404);

    const remove = await send(`/api/projects/${project.id}/roles/${project.qaId}`, token, {
      method: 'DELETE',
    });
    expect(remove.status).toBe(404);

    // And nothing was written by any of them.
    expect(await stepStore.listByProject(project.id)).toHaveLength(2);
  });
});

describe('POST /api/projects/:id/steps', () => {
  it('adds a step and answers with it', async () => {
    const token = await register('owner');
    const project = await newProject(token);

    const res = await addStep(project.id, token, 'Design');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { step: Step };
    expect(body.step.name).toBe('Design');
    expect(body.step.projectId).toBe(project.id);
    expect(await stepStore.findById(body.step.id)).toEqual(body.step);
    expect(await stepStore.listByProject(project.id)).toHaveLength(3);
  });

  it('answers 409 taken for a name the project already holds', async () => {
    const token = await register('owner');
    const project = await newProject(token);

    const res = await addStep(project.id, token, 'QA');

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'taken' });
  });

  it('answers 422 for a name of spaces, 404 for a project that is not there, 401 unauthenticated', async () => {
    const token = await register('owner');
    const project = await newProject(token);

    expect((await addStep(project.id, token, '   ')).status).toBe(422);
    expect((await addStep(crypto.randomUUID(), token, 'Design')).status).toBe(404);
    expect((await addStep(project.id, 'not-a-token', 'Design')).status).toBe(401);
  });

  it('answers 403 on a restricted project the caller does not own', async () => {
    const owner = await register('owner');
    const stranger = await register('stranger');
    const project = await newProject(owner);
    await send(`/api/projects/${project.id}`, owner, {
      method: 'PATCH',
      body: JSON.stringify({ restricted: true }),
    });

    const res = await addStep(project.id, stranger, 'Design');

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });
});

describe('PATCH /api/projects/:id/steps/:stepId', () => {
  it('renames a step', async () => {
    const token = await register('owner');
    const project = await newProject(token);

    const res = await send(`/api/projects/${project.id}/steps/${project.qaId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Review' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      step: { id: project.qaId, projectId: project.id, name: 'Review', position: 20 },
    });
  });

  it('answers 409 taken, and 404 for a step of another project', async () => {
    const token = await register('owner');
    const project = await newProject(token);
    const other = await newProject(token);

    const taken = await send(`/api/projects/${project.id}/steps/${project.qaId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Dev' }),
    });
    expect(taken.status).toBe(409);

    const elsewhere = await send(`/api/projects/${project.id}/steps/${other.qaId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Review' }),
    });
    expect(elsewhere.status).toBe(404);
  });
});

describe('DELETE /api/projects/:id/steps/:stepId', () => {
  const item = (projectId: string, id: string, position: number): WorkItem =>
    workItemRow({ id, projectId, position, name: 'Strip' });

  it('removes a step nothing points at, answering 204', async () => {
    const token = await register('owner');
    const project = await newProject(token);

    const res = await send(`/api/projects/${project.id}/steps/${project.qaId}`, token, {
      method: 'DELETE',
    });

    expect(res.status).toBe(204);
    expect(await stepStore.findById(project.qaId)).toBeNull();
  });

  it('refuses with 409 and the counts, then removes on the cascade', async () => {
    const token = await register('owner');
    const project = await newProject(token);
    await workItems.insert(item(project.id, 'strip', 10), [], wrote());
    await estimates.set({ workItemId: 'strip', stepId: project.qaId, ...DAYS }, wrote());
    const ada = await personAdded(
      directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [], wrote()),
    );
    await directory.assign('strip', project.qaId, ada.id, wrote());

    const refused = await send(`/api/projects/${project.id}/steps/${project.qaId}`, token, {
      method: 'DELETE',
    });

    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({
      error: 'in_use',
      inUse: {
        estimates: 1,
        actuals: 0,
        progress: 0,
        measures: 0,
        assignments: 1,
        assumedAssignees: [{ workItemId: 'strip', assumedNow: ada.id, assumedAfter: null }],
      },
    });
    expect(await stepStore.findById(project.qaId)).not.toBeNull();

    const confirmed = await send(
      `/api/projects/${project.id}/steps/${project.qaId}?cascade=true`,
      token,
      { method: 'DELETE' },
    );

    expect(confirmed.status).toBe(204);
    expect(await stepStore.findById(project.qaId)).toBeNull();
    expect(await estimates.listByProject(project.id)).toEqual([]);
    // The project moved once for the removal, on top of the seed's zero.
    const after = await projects.findById(project.id);
    expect(after?.revision).toBe(1);
  });

  it('answers 404 for a step that is not there and 403 on a project the caller may not write to', async () => {
    const owner = await register('owner');
    const stranger = await register('stranger');
    const project = await newProject(owner);
    await send(`/api/projects/${project.id}`, owner, {
      method: 'PATCH',
      body: JSON.stringify({ restricted: true }),
    });

    const missing = await send(
      `/api/projects/${project.id}/steps/${crypto.randomUUID()}?cascade=true`,
      owner,
      { method: 'DELETE' },
    );
    expect(missing.status).toBe(404);

    const theirs = await send(
      `/api/projects/${project.id}/steps/${project.qaId}?cascade=true`,
      stranger,
      { method: 'DELETE' },
    );
    expect(theirs.status).toBe(403);
    expect(await stepStore.findById(project.qaId)).not.toBeNull();
  });

  it('appends nothing to the account’s undo stack', async () => {
    const token = await register('owner');
    const project = await newProject(token);
    const strip = await newWorkItem(project.id, token, 'Strip');
    await planCommand(project.id, token, {
      kind: 'patchWorkItem',
      workItemId: strip,
      patch: { name: 'Strip the paint' },
    });

    await addStep(project.id, token, 'Design');
    await send(`/api/projects/${project.id}/steps/${project.qaId}`, token, { method: 'DELETE' });

    // The step changes are not on the stack, so the key still reaches the
    // rename — as the project's start date behaves, and for the same reason:
    // there is no compensating command for a step that took estimates with it.
    const undone = await send(`/api/projects/${project.id}/undo`, token, { method: 'POST' });
    expect(undone.status).toBe(200);
    expect(((await undone.json()) as { done: string }).done).toContain('rename');
  });

  it('leaves an undo whose step has gone refusing as stale, not writing', async () => {
    const token = await register('owner');
    const project = await newProject(token);
    const strip = await newWorkItem(project.id, token, 'Strip');
    await planCommand(project.id, token, {
      kind: 'setEstimate',
      workItemId: strip,
      stepId: project.qaId,
      days: { optimistic: 1, realistic: 2, pessimistic: 3 },
    });
    // Cleared, so the entry on top of the stack is one whose *inverse writes*:
    // undoing it puts the trio back. That is the entry that would reach for a
    // step that is not there.
    await planCommand(project.id, token, {
      kind: 'clearEstimate',
      workItemId: strip,
      stepId: project.qaId,
    });

    await send(`/api/projects/${project.id}/steps/${project.qaId}?cascade=true`, token, {
      method: 'DELETE',
    });

    // The removal moved the work item's revision, so the entry's precondition
    // no longer holds. Without that bump this undo would try to write a trio
    // for a step that is not there — a foreign key error, a 500, on a key
    // somebody pressed to be safe.
    const undone = await send(`/api/projects/${project.id}/undo`, token, { method: 'POST' });
    expect(undone.status).toBe(409);
    expect(await undone.json()).toMatchObject({ error: 'stale_undo' });
    expect(await estimates.listByProject(project.id)).toEqual([]);
  });

  it('refuses an estimate and an assignee for a step that has gone, rather than 500ing', async () => {
    const token = await register('owner');
    const project = await newProject(token);
    const strip = await newWorkItem(project.id, token, 'Strip');
    const ada = await personAdded(
      directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [], wrote()),
    );
    await send(`/api/projects/${project.id}/steps/${project.qaId}`, token, { method: 'DELETE' });

    // A tab that was open when somebody else removed the step. Both of these
    // used to reach the foreign key and answer 500 — the request is about a
    // step that is not in the project, which is the caller's world being out
    // of date rather than this process being broken.
    const estimated = await planCommand(project.id, token, {
      kind: 'setEstimate',
      workItemId: strip,
      stepId: project.qaId,
      days: DAYS,
    });
    expect(estimated.status).toBe(404);
    expect(await estimated.json()).toEqual({ error: 'unknown_step', at: 0, kind: 'setEstimate' });

    const assigned = await planCommand(project.id, token, {
      kind: 'setAssignee',
      workItemId: strip,
      stepId: project.qaId,
      personId: ada.id,
    });
    expect(assigned.status).toBe(404);
    expect(await assigned.json()).toEqual({ error: 'unknown_step', at: 0, kind: 'setAssignee' });
  });

  it('takes estimates for a step added after the project was made', async () => {
    const token = await register('owner');
    const project = await newProject(token);
    const added = await addStep(project.id, token, 'Design');
    const design = (await added.json()) as { step: { id: string } };
    const strip = await newWorkItem(project.id, token, 'Strip');

    const estimated = await planCommand(project.id, token, {
      kind: 'setEstimate',
      workItemId: strip,
      stepId: design.step.id,
      days: { optimistic: 1, realistic: 2, pessimistic: 3 },
    });

    expect(estimated.status).toBe(200);
    const tree = await send(`/api/projects/${project.id}/work-items`, token);
    const body = (await tree.json()) as {
      workItems: { estimates: Record<string, unknown> }[];
    };
    // `STARTING_STEPS` is the seed and not the set: the third step holds
    // estimates the tree reports beside the two the project was made with.
    expect(body.workItems[0]?.estimates).toHaveProperty(design.step.id);
  });

  it('takes the cascade only when it is asked for by name', async () => {
    const token = await register('owner');
    const project = await newProject(token);
    await workItems.insert(item(project.id, 'strip', 10), [], wrote());
    await estimates.set({ workItemId: 'strip', stepId: project.qaId, ...DAYS }, wrote());

    // Anything other than `true` is not a confirmation. A truthy-looking value
    // taken as consent is how a step goes with its estimates on a request
    // nobody meant as the second one.
    const res = await send(`/api/projects/${project.id}/steps/${project.qaId}?cascade=1`, token, {
      method: 'DELETE',
    });

    expect(res.status).toBe(409);
    expect(await stepStore.findById(project.qaId)).not.toBeNull();
  });
});
