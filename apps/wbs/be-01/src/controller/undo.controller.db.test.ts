import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CREATOR_ADMISSION } from '@wbs/core';
import { DirectoryService } from '@wbs/core/module/directory/directory.resource';
import { ProjectService } from '@wbs/core/module/project/project.resource';
import { AuthService } from '@wbs/core/service/auth.service';
import { TypedDependencyRepository } from '@wbs/store-sqlite/typed-dependency';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { buildApp } from '../app';
import { ActualRepository } from '../repository/actual';
import { CommandJournalRepository } from '../repository/command-journal';
import { openDrizzle } from '../repository/db';
import { DependencyRepository } from '../repository/dependency';
import { DirectoryRepository } from '../repository/directory';
import { EstimateRepository } from '../repository/estimate';
import { OPEN } from '../repository/gate';
import { runMigrations } from '../repository/migrate';
import { ProjectRepository } from '../repository/project';
import { StepRepository } from '../repository/step';
import { StepMeasureRepository } from '../repository/step-measure';
import { StepProgressRepository } from '../repository/step-progress';
import { UserRepository } from '../repository/user';
import { SubtreeRepository, WorkItemRepository } from '../repository/work-item';
import { bunPasswordHasher, joseTokenCodec } from '../runtime/bun-runtime';
import { fastScheduler } from '../service/optimizer-wiring';
import { StepService } from '../service/step.service';
import { WorkItemService } from '../service/work-item.service';
import { TEST_JWT_KEY } from '../testing/auth-fixture';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testCalendarMarkerService } from '../testing/calendar-marker-fixture';
import { inMemoryCapacity, testCapacityService } from '../testing/capacity-fixture';
import { testClock } from '../testing/clock-fixture';
import { sqliteDependencyGraph } from '../testing/dependency-graph-fixture';
import {
  refusingEmailVerification,
  refusingInvitations,
  refusingJoinRequests,
  refusingTestEmailDelivery,
} from '../testing/email-verification-fixture';
import { testHistoryService } from '../testing/history-fixture';
import { testLoginThrottle } from '../testing/login-throttle-fixture';
import { refusingOnboarding } from '../testing/onboarding-fixture';
import {
  legacyOrganizationAccess,
  refusingDomains,
  refusingMemberships,
} from '../testing/organization-access-fixture';
import { inMemoryPriorityBands, testPriorityBandService } from '../testing/priority-band-fixture';
import { testReplay } from '../testing/replay-fixture';
import { testSavedPlanService } from '../testing/saved-plan-fixture';
import { refusingSpaces } from '../testing/space-fixture';
import { testWrites } from '../testing/writes-fixture';

/**
 * The undo and redo routes, **over real SQLite**.
 *
 * Every other controller test here runs on the in-memory stores, which model
 * no revisions at all — so a `stale_undo` asserted against them would be
 * asserted against a counter that never moves, and would pass with the whole
 * precondition check deleted. The status codes are the point of this file and
 * they are all decided by the revision comparison, so it runs against the
 * database that actually does the comparing.
 */
const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let app: ReturnType<typeof buildApp>;
/**
 * The same journal the app writes through, kept so a test can read the stack
 * it left behind rather than infer it from what undo happens to answer.
 */
let journal: CommandJournalRepository;
let workItems: WorkItemRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-undo-http-'));
  const db = openDrizzle(join(dir, 'test.db'));
  runMigrations(join(dir, 'test.db'), FOLDER);
  journal = new CommandJournalRepository(db, OPEN);

  const projects = new ProjectRepository(db, OPEN);
  workItems = new WorkItemRepository(db, OPEN);
  const estimates = new EstimateRepository(db, OPEN);
  const actuals = new ActualRepository(db, OPEN);
  const measures = new StepMeasureRepository(db, OPEN);
  const progressStore = new StepProgressRepository(db, OPEN);
  const dependencies = new DependencyRepository(db, OPEN);
  const directory = new DirectoryRepository(db, OPEN);

  // One graph for the routes and the batch: undo runs through the batch's
  // services, and a second graph would put its journal in a store this file
  // never reads.
  const writing = {
    directory: new DirectoryService({
      clock: testClock,
      directory,
      broadcast: recordingBroadcaster(),
    }),
    capacity: testCapacityService(),
    priorityBands: testPriorityBandService(),
    calendarMarkers: testCalendarMarkerService(),
    projects: new ProjectService({
      dependencyGraph: sqliteDependencyGraph(db, projects),
      clock: testClock,
      projects,
      broadcast: recordingBroadcaster(),
    }),
    steps: new StepService({
      dependencyGraph: sqliteDependencyGraph(db, projects),
      clock: testClock,
      projects,
      steps: new StepRepository(db, OPEN),
      broadcast: recordingBroadcaster(),
    }),
    workItems: new WorkItemService({
      admission: CREATOR_ADMISSION,
      scheduler: fastScheduler,
      clock: testClock,
      workItems,
      projects,
      estimates,
      actuals,
      measures,
      progress: progressStore,
      dependencies,
      typedDependencies: new TypedDependencyRepository(db, OPEN),
      directory,
      capacity: inMemoryCapacity(),
      priorityBands: inMemoryPriorityBands(),
      subtrees: new SubtreeRepository(db, OPEN),
      journal,
      broadcast: recordingBroadcaster(),
    }),
  };
  app = buildApp({
    organizations: legacyOrganizationAccess,
    memberships: refusingMemberships,
    domains: refusingDomains,
    emailVerification: refusingEmailVerification,
    invitations: refusingInvitations,
    joinRequests: refusingJoinRequests,
    spaces: refusingSpaces,
    emailDelivery: refusingTestEmailDelivery,
    onboarding: refusingOnboarding,
    loginThrottle: testLoginThrottle(),
    clock: testClock,
    appOrigin: 'http://localhost',
    savedPlans: testSavedPlanService(),
    history: testHistoryService(),
    auth: new AuthService({
      clock: testClock,
      users: new UserRepository(db, OPEN),
      tokens: joseTokenCodec(TEST_JWT_KEY),
      passwords: bunPasswordHasher,
    }),
    ...writing,
    replay: testReplay().replay,
    probeDatabase: () => 'ok',
    internalAuthSecret: 'x'.repeat(32),
    writes: testWrites(undefined, writing),
    migrationsApplied: true,
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function registerAccount(username: string): Promise<{ token: string; userId: string }> {
  const res = await app.handle(
    new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: 'correct-horse' }),
    }),
  );
  const account = (await res.json()) as { token: string; user: { id: string } };
  return { token: account.token, userId: account.user.id };
}

async function register(username: string): Promise<string> {
  return (await registerAccount(username)).token;
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

async function newProject(token: string, name = 'Rewire the shed'): Promise<string> {
  const created = await send('/api/projects', token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return ((await created.json()) as { project: { id: string } }).project.id;
}

/**
 * One plan command, as a batch of one on `POST /api/projects/:id/commands` —
 * the one way to write to a plan, and the writes every stack below is built
 * from.
 */
function command(projectId: string, token: string, step: object): Promise<Response> {
  return send(`/api/projects/${projectId}/commands`, token, {
    method: 'POST',
    body: JSON.stringify({ commands: [step] }),
  });
}

async function addRoot(token: string, projectId: string, name: string): Promise<string> {
  const created = await command(projectId, token, {
    kind: 'createWorkItem',
    parentId: null,
    afterId: null,
    name,
  });
  if (created.status !== 200) throw new Error(`createWorkItem answered ${String(created.status)}`);
  const { results } = (await created.json()) as { results: { id?: string }[] };
  const id = results[0]?.id;
  if (id === undefined) throw new Error('createWorkItem minted no id');
  return id;
}

function patchItem(
  token: string,
  projectId: string,
  workItemId: string,
  patch: object,
): Promise<Response> {
  return command(projectId, token, { kind: 'patchWorkItem', workItemId, patch });
}

describe('POST /api/projects/:id/undo', () => {
  it('turns an anonymous request away before it reaches the stack', async () => {
    const token = await register('owner');
    const projectId = await newProject(token);

    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/undo`, { method: 'POST' }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('answers 404 for a project that does not exist', async () => {
    const token = await register('owner');

    const res = await send(`/api/projects/${crypto.randomUUID()}/undo`, token, { method: 'POST' });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('answers 403 to somebody who may read the project but not write to it', async () => {
    const owner = await register('owner');
    const stranger = await register('stranger');
    const projectId = await newProject(owner);
    await send(`/api/projects/${projectId}`, owner, {
      method: 'PATCH',
      body: JSON.stringify({ restricted: true }),
    });

    const res = await send(`/api/projects/${projectId}/undo`, stranger, { method: 'POST' });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('answers 409 nothing_to_undo on an untouched project', async () => {
    const token = await register('owner');
    const projectId = await newProject(token);

    const res = await send(`/api/projects/${projectId}/undo`, token, { method: 'POST' });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'nothing_to_undo', detail: null });
  });

  it('answers what it undid, so the screen can say it', async () => {
    const token = await register('owner');
    const projectId = await newProject(token);
    const strip = await addRoot(token, projectId, 'Strip');
    await patchItem(token, projectId, strip, { name: 'Strip out' });

    const res = await send(`/api/projects/${projectId}/undo`, token, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ done: 'rename “Strip out”', detail: null });
  });

  it('answers 409 stale_undo naming what moved, and undoes nothing', async () => {
    const owner = await register('owner');
    const stranger = await register('stranger');
    const projectId = await newProject(owner);
    const strip = await addRoot(owner, projectId, 'Strip');
    await patchItem(owner, projectId, strip, { name: 'Mine' });
    await patchItem(stranger, projectId, strip, { name: 'Theirs' });

    const res = await send(`/api/projects/${projectId}/undo`, owner, { method: 'POST' });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe('stale_undo');
    expect(body.detail).toContain('Theirs');

    const tree = await send(`/api/projects/${projectId}/work-items`, owner);
    const names = ((await tree.json()) as { workItems: { name: string }[] }).workItems.map(
      (each) => each.name,
    );
    expect(names).toEqual(['Theirs']);
  });
});

describe('POST /api/projects/:id/redo', () => {
  it('answers 409 nothing_to_undo until something has been undone', async () => {
    const token = await register('owner');
    const projectId = await newProject(token);
    await addRoot(token, projectId, 'Strip');

    const res = await send(`/api/projects/${projectId}/redo`, token, { method: 'POST' });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'nothing_to_undo', detail: null });
  });

  it('puts back what the undo took away', async () => {
    const token = await register('owner');
    const projectId = await newProject(token);
    const strip = await addRoot(token, projectId, 'Strip');
    await patchItem(token, projectId, strip, { name: 'Strip out' });
    await send(`/api/projects/${projectId}/undo`, token, { method: 'POST' });

    const res = await send(`/api/projects/${projectId}/redo`, token, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ done: 'rename “Strip out”', detail: null });
  });
});

describe('first-child assignment hand-down over SQLite', () => {
  it('refuses redo when another account changes the parent assignment after undo', async () => {
    const owner = await register('owner');
    const stranger = await register('stranger');
    const projectId = await newProject(owner);
    const parentId = await addRoot(owner, projectId, 'Parent');
    const created = await send('/api/directory/commands', owner, {
      method: 'POST',
      body: JSON.stringify({
        commands: [
          { kind: 'createPerson', name: 'Ann', teamIds: [] },
          { kind: 'createPerson', name: 'Bea', teamIds: [] },
        ],
      }),
    });
    expect(created.status).toBe(200);
    const people = (await created.json()) as { results: { id: string }[] };
    const annId = people.results.at(0)?.id;
    const beaId = people.results.at(1)?.id;
    if (annId === undefined || beaId === undefined) throw new Error('people absent');
    const tree = (await (await send(`/api/projects/${projectId}/work-items`, owner)).json()) as {
      steps: { id: string; name: string }[];
    };
    const devId = tree.steps.find((step) => step.name === 'Dev')?.id;
    if (devId === undefined) throw new Error('Dev step absent');
    expect(
      (
        await command(projectId, owner, {
          kind: 'setAssignee',
          workItemId: parentId,
          stepId: devId,
          personId: annId,
        })
      ).status,
    ).toBe(200);
    const child = await command(projectId, owner, {
      kind: 'createWorkItem',
      parentId,
      afterId: null,
      name: 'Child',
    });
    expect(child.status).toBe(200);
    const childId = ((await child.json()) as { results: { id: string }[] }).results.at(0)?.id;
    if (childId === undefined) throw new Error('child absent');
    expect((await send(`/api/projects/${projectId}/undo`, owner, { method: 'POST' })).status).toBe(
      200,
    );
    expect(
      (
        await command(projectId, stranger, {
          kind: 'setAssignee',
          workItemId: parentId,
          stepId: devId,
          personId: beaId,
        })
      ).status,
    ).toBe(200);

    // Proof: omitting parent assignment owners from the create journal's redo
    // preconditions answered 200 here and removed Bea's competing assignment.
    const redo = await send(`/api/projects/${projectId}/redo`, owner, { method: 'POST' });
    expect(redo.status).toBe(409);
    expect((await redo.json()) as { error: string }).toMatchObject({ error: 'stale_undo' });
    const after = (await (await send(`/api/projects/${projectId}/work-items`, owner)).json()) as {
      workItems: { id: string; assignees: Record<string, string> }[];
    };
    expect(after.workItems.find((row) => row.id === parentId)?.assignees[devId]).toBe(beaId);
    expect(after.workItems.some((row) => row.id === childId)).toBe(false);
  });

  it('undoes onto the original node and clears the parent again on redo', async () => {
    const { token } = await registerAccount('owner');
    const projectId = await newProject(token);
    const parentId = await addRoot(token, projectId, 'Parent');
    const person = await send('/api/directory/commands', token, {
      method: 'POST',
      body: JSON.stringify({ commands: [{ kind: 'createPerson', name: 'Ann', teamIds: [] }] }),
    });
    expect(person.status).toBe(200);
    const personId = ((await person.json()) as { results: { id: string }[] }).results.at(0)?.id;
    if (personId === undefined) throw new Error('person create minted no id');
    const before = (await (await send(`/api/projects/${projectId}/work-items`, token)).json()) as {
      steps: { id: string; name: string }[];
      stepNodes: { id: string; workItemId: string; stepId: string }[];
    };
    const devId = before.steps.find((step) => step.name === 'Dev')?.id;
    if (devId === undefined) throw new Error('Dev step absent');
    expect(
      (
        await command(projectId, token, {
          kind: 'setAssignee',
          workItemId: parentId,
          stepId: devId,
          personId,
        })
      ).status,
    ).toBe(200);
    const afterAssigned = await workItems.findById(parentId);
    if (afterAssigned === null) throw new Error('parent absent after assignment');
    const originalNodeId = before.stepNodes.find(
      (node) => node.workItemId === parentId && node.stepId === devId,
    )?.id;
    const created = await command(projectId, token, {
      kind: 'createWorkItem',
      parentId,
      afterId: null,
      name: 'Child',
    });
    expect(created.status).toBe(200);
    const childId = ((await created.json()) as { results: { id: string }[] }).results.at(0)?.id;
    if (childId === undefined) throw new Error('child create minted no id');
    const read = async () =>
      (await (await send(`/api/projects/${projectId}/work-items`, token)).json()) as {
        stepNodes: { id: string; workItemId: string; stepId: string }[];
        workItems: { id: string; assignees: Record<string, string> }[];
      };
    expect((await read()).workItems.find((row) => row.id === childId)?.assignees[devId]).toBe(
      personId,
    );
    const afterCreate = await workItems.findById(parentId);
    if (afterCreate === null) throw new Error('parent absent after create');
    // Creating the child touches the parent once; clearing its assignment touches it again.
    expect(afterCreate.revision).toBe(afterAssigned.revision + 2);
    expect((await send(`/api/projects/${projectId}/undo`, token, { method: 'POST' })).status).toBe(
      200,
    );
    const undone = await read();
    expect(
      undone.stepNodes.find((node) => node.workItemId === parentId && node.stepId === devId)?.id,
    ).toBe(originalNodeId);
    expect(undone.workItems.find((row) => row.id === parentId)?.assignees[devId]).toBe(personId);
    const afterUndo = await workItems.findById(parentId);
    expect(afterUndo?.revision).toBe(afterCreate.revision + 1);
    expect((await send(`/api/projects/${projectId}/redo`, token, { method: 'POST' })).status).toBe(
      200,
    );
    const redone = await read();
    expect(redone.workItems.find((row) => row.id === childId)?.assignees[devId]).toBe(personId);
    expect(redone.workItems.find((row) => row.id === parentId)?.assignees[devId]).toBeUndefined();
    const afterRedo = await workItems.findById(parentId);
    expect(afterRedo?.revision).toBe(afterCreate.revision + 2);
  });
});

describe('what the tree read says about the stack', () => {
  it('carries undoable and redoable for the account reading it', async () => {
    const owner = await register('owner');
    const stranger = await register('stranger');
    const projectId = await newProject(owner);
    await addRoot(owner, projectId, 'Strip');

    const mine = await send(`/api/projects/${projectId}/work-items`, owner);
    expect(await mine.json()).toMatchObject({ undoable: true, redoable: false });

    // Somebody who has changed nothing here has nothing to undo, however much
    // anybody else has done. The stack is per account.
    const theirs = await send(`/api/projects/${projectId}/work-items`, stranger);
    expect(await theirs.json()).toMatchObject({ undoable: false, redoable: false });
  });

  it('reports something to redo once something has been undone', async () => {
    const token = await register('owner');
    const projectId = await newProject(token);
    await addRoot(token, projectId, 'Strip');
    await send(`/api/projects/${projectId}/undo`, token, { method: 'POST' });

    const tree = await send(`/api/projects/${projectId}/work-items`, token);

    expect(await tree.json()).toMatchObject({ undoable: false, redoable: true });
  });
});

/**
 * What the front end's Name cell sends, arriving here as one `patchWorkItem`.
 *
 * The fe-01 test that proves the cell sends one `patch` proves one HTTP call
 * and stops there — codex round 1, finding 3. Whether one command is one entry
 * on the undo stack, and whether one press of Cmd+Z brings both fields back
 * together, is decided by this service, this journal and this route, so it is
 * asked of them.
 */
describe('patchWorkItem with a name and its notes at once', () => {
  it('writes one journal entry, and one undo puts both fields back', async () => {
    const { token, userId } = await registerAccount('owner');
    const projectId = await newProject(token);
    const strip = await addRoot(token, projectId, 'Strip');
    await patchItem(token, projectId, strip, { notes: 'measure twice' });
    // The stack as the composite edit finds it: the row's creation and the
    // note written under it, both this account's.
    expect((await journal.entriesFor(projectId, userId)).map((each) => each.kind)).toEqual([
      'create',
      'patch',
    ]);

    // Both fields, one gesture, one command — what `commitNameCell` sends when
    // somebody rewrites a line and the note under it before leaving the cell.
    const patched = await patchItem(token, projectId, strip, {
      name: 'Strip the wiring',
      notes: 'measure twice, cut once',
    });
    expect(patched.status).toBe(200);

    // Proof: the same edit sent as two commands instead — `{ name }`, then
    // `{ notes }` — this failed here on a fourth entry (`Expected - 0 /
    // Received + 1`, the extra `"patch"`), and with this assertion taken out
    // it failed further down on `Expected: "Strip" / Received: "Strip the
    // wiring"`: one undo, one field, one Cmd+Z short. Watched, 2026-08-08.
    expect((await journal.entriesFor(projectId, userId)).map((each) => each.kind)).toEqual([
      'create',
      'patch',
      'patch',
    ]);

    const undone = await send(`/api/projects/${projectId}/undo`, token, { method: 'POST' });
    expect(undone.status).toBe(200);

    // Proof: `revertTo`'s `if (patch.notes !== undefined) out.notes =
    // before.notes` deleted in `work-item.service.ts`, this failed on
    // `Expected: "measure twice" / Received: "measure twice, cut once"` — an
    // undo that put the name back and left the note where nobody asked for it.
    // Watched, 2026-08-08.
    const tree = await send(`/api/projects/${projectId}/work-items`, token);
    const rows = ((await tree.json()) as { workItems: { name: string; notes: string }[] })
      .workItems;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Strip');
    expect(rows[0]?.notes).toBe('measure twice');
  });
});
