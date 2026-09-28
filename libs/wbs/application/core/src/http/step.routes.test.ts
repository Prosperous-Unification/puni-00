import { inMemoryStores } from '@wbs/store-memory/in-memory-source';
import { inMemoryProjects, projectRow } from '@wbs/store-memory/project-fixture';
import { inMemorySteps, stepRow } from '@wbs/store-memory/step-fixture';
import { expect, spyOn, test } from 'bun:test';

import type { EditAdmission } from '../ports/edit-admission';
import { DependencyGraphGuard } from '../service/dependency-graph';
import type { PlanCommand } from '../service/plan-command';
import { StepService } from '../service/step.service';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testClock } from '../testing/clock-fixture';
import { legacyOrganizationAccess } from '../testing/organization-access-fixture';
import { EMPTY } from './endpoint';
import { type RecoveryWriteBoundary, runRecoveryWrite } from './recovery-write';
import { stepRoutes } from './step.routes';

const principal = { id: 'owner', username: 'owner', scopes: ['read', 'write'] as const };
const request = {
  method: 'POST',
  url: new URL('https://app.example/steps'),
  headers: new Headers(),
};

test('publishes a dependent recovery only after its unit of work commits', async () => {
  const order: string[] = [];
  let held: RecoveryWriteBoundary['announcements'] | null = null;
  const boundary = {
    uow: {
      run: async (act: (scope: unknown) => Promise<{ value: { ok: boolean } }>) => {
        const decision = await act({
          stores: { projects: { admitEditInOrganization: () => Promise.resolve('recovery') } },
        });
        order.push('commit');
        return decision.value;
      },
    },
    batch: (_scope: unknown, broadcast: RecoveryWriteBoundary['announcements']) => {
      held = broadcast;
      return {};
    },
    announcements: {
      publish: () => {
        order.push('publish');
        return Promise.resolve();
      },
      latestSeq: () => Promise.resolve(-1),
    },
  } as unknown as RecoveryWriteBoundary;
  expect(
    await runRecoveryWrite<{ ok: true } | { ok: false; reason: 'not_found' | 'forbidden' }>(
      boundary,
      { kind: 'scoped', scope: { organizationId: 'org-a', userId: 'sam', role: 'super_admin' } },
      'project',
      'sam',
      { step: 'add' },
      async () => {
        const broadcast = held;
        if (broadcast === null) throw new Error('batch did not receive a broadcaster');
        await broadcast.publish('project', { type: 'step_removed', stepId: 'step' });
        order.push('write');
        return { ok: true };
      },
      (reason) => ({ ok: false, reason }),
    ),
  ).toEqual({ ok: true });
  expect(order).toEqual(['write', 'commit', 'publish']);
});

test('scoped step service cannot borrow a recovery grant for another project, actor, or settled unit', async () => {
  const projects = inMemoryProjects();
  await projects.createInOrganization(
    projectRow({ id: 'granted', restricted: true }),
    [],
    { at: 1, by: 'owner' },
    'org-a',
  );
  await projects.createInOrganization(
    projectRow({ id: 'other', restricted: true }),
    [],
    { at: 1, by: 'owner' },
    'org-a',
  );
  const stored = inMemorySteps([]);
  const access = {
    kind: 'scoped' as const,
    scope: { organizationId: 'org-a', userId: 'sam', role: 'super_admin' as const },
  };
  let retained: StepService | undefined;
  const boundary = {
    uow: {
      run: async (act: (scope: unknown) => Promise<{ value: { ok: boolean } }>) =>
        (
          await act({
            stores: { projects: { admitEditInOrganization: () => Promise.resolve('recovery') } },
          })
        ).value,
    },
    batch: (
      _scope: unknown,
      broadcast: RecoveryWriteBoundary['announcements'],
      admission: EditAdmission,
    ) => {
      const service = new StepService({
        projects,
        steps: stored,
        broadcast,
        clock: testClock,
        dependencyGraph: new DependencyGraphGuard({ ...inMemoryStores(), projects }),
        recoveryAdmission: admission,
      });
      retained = service;
      return { steps: service };
    },
    announcements: recordingBroadcaster(),
  } as unknown as RecoveryWriteBoundary;
  await runRecoveryWrite<{ ok: true } | { ok: false }>(
    boundary,
    access,
    'granted',
    'sam',
    { step: 'add' },
    async (services) => {
      expect(
        await services.steps.addWithin('other', 'sam', 'Wrong project', 0, undefined, access),
      ).toEqual({ ok: false, reason: 'forbidden' });
      expect(
        await services.steps.addWithin(
          'granted',
          'other-actor',
          'Wrong actor',
          0,
          undefined,
          access,
        ),
      ).toEqual({ ok: false, reason: 'forbidden' });
      return { ok: true as const };
    },
    () => ({ ok: false as const }),
  );
  if (retained === undefined) throw new Error('batch did not build a step service');
  expect(await retained.addWithin('granted', 'sam', 'Expired', 0, undefined, access)).toEqual({
    ok: false,
    reason: 'forbidden',
  });
  expect(await stored.listByProject('granted')).toEqual([]);
  expect(await stored.listByProject('other')).toEqual([]);
});

test('combined step patch refuses a modeled allowance failure after rename and discards its event', async () => {
  const step = stepRow({ id: 'step', projectId: 'project', name: 'Review' });
  const commits: boolean[] = [];
  const published: string[] = [];
  let allowanceRefusal = 'forbidden';
  const boundary = {
    uow: {
      run: async (act: (scope: unknown) => Promise<{ commit: boolean; value: unknown }>) => {
        const decision = await act({
          stores: { projects: { admitEditInOrganization: () => Promise.resolve('recovery') } },
        });
        commits.push(decision.commit);
        return decision.value;
      },
    },
    batch: (_scope: unknown, broadcast: RecoveryWriteBoundary['announcements']) => ({
      steps: {
        renameWithin: async () => {
          await broadcast.publish('project', { type: 'step_renamed', step });
          return { ok: true, value: step };
        },
        findWithin: () => Promise.resolve({ ok: true, value: step }),
      },
      workItems: {
        setStepAllowance: () => Promise.resolve({ ok: false, reason: allowanceRefusal }),
      },
    }),
    announcements: {
      publish: (projectId: string) => {
        published.push(projectId);
        return Promise.resolve();
      },
      latestSeq: () => Promise.resolve(-1),
    },
  } as unknown as RecoveryWriteBoundary;
  const [, rename] = stepRoutes(
    {
      addWithin: () => Promise.reject(new Error('unexpected add')),
      removeWithin: () => Promise.reject(new Error('unexpected remove')),
      renameWithin: () => Promise.reject(new Error('public rename')),
      findWithin: () => Promise.reject(new Error('public lookup')),
    },
    {
      runWithin: () => Promise.reject(new Error('command batch')),
      runDirectoryWithin: () => Promise.reject(new Error('directory batch')),
    },
    {
      resolve: () =>
        Promise.resolve({
          ok: true,
          access: {
            kind: 'scoped',
            scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin' },
          },
        }),
    },
    boundary,
  );
  expect(
    await rename.handle({
      params: { id: 'project', stepId: 'step' },
      query: undefined,
      body: { name: 'Renamed', allowancePercent: 10 },
      principal,
      request,
    }),
  ).toEqual({ ok: false, status: 403, body: { error: 'forbidden' } });
  expect(commits).toEqual([false]);
  expect(published).toEqual([]);
  allowanceRefusal = 'unmodelled';
  expect(
    rename.handle({
      params: { id: 'project', stepId: 'step' },
      query: undefined,
      body: { name: 'Renamed', allowancePercent: 10 },
      principal,
      request,
    }),
  ).rejects.toThrow('setStepAllowance refused with an unmodelled reason: unmodelled');
  expect(published).toEqual([]);
});

test('combined step patch refuses a missing unit of work boundary', async () => {
  const {
    endpoints: [, rename],
  } = await fixture();
  expect(
    rename.handle({
      params: { id: 'project', stepId: 'step' },
      query: undefined,
      body: { name: 'Renamed', allowancePercent: 10 },
      principal,
      request,
    }),
  ).rejects.toThrow('combined step write has no recovery boundary');
});

async function fixture(restricted = false) {
  const projects = inMemoryProjects();
  await projects.create(projectRow({ id: 'project', restricted }), [], { at: 1, by: principal.id });
  const stored = inMemorySteps([
    stepRow({ id: 'step', projectId: 'project', name: 'Design' }),
    stepRow({ id: 'other', projectId: 'project', name: 'QA', position: 20 }),
    stepRow({ id: 'foreign', projectId: 'elsewhere', name: 'Foreign' }),
  ]);
  const addWrite = spyOn(stored, 'add');
  const broadcast = recordingBroadcaster();
  const service = new StepService({
    dependencyGraph: new DependencyGraphGuard({ ...inMemoryStores(), projects: projects }),
    clock: testClock,
    projects,
    steps: stored,
    broadcast,
  });
  const commandsRun: unknown[] = [];
  const commands = {
    runWithin: (projectId: string, actorId: string, batch: readonly PlanCommand[]) => {
      commandsRun.push({ projectId, actorId, batch });
      return Promise.resolve({ ok: true as const, results: [], undoable: true, redoable: false });
    },
    runDirectoryWithin: () => Promise.reject(new Error('a step route ran a directory batch')),
  };
  return {
    projects,
    stored,
    addWrite,
    broadcast,
    service,
    commandsRun,
    endpoints: stepRoutes(service, commands, legacyOrganizationAccess),
  };
}

test('typed step bindings preserve the service value, actor and trimmed name', async () => {
  const {
    endpoints: [add, rename],
    stored,
    addWrite,
    broadcast,
  } = await fixture();
  const added = await add.handle({
    params: { id: 'project' },
    query: undefined,
    body: { name: '  Build  ' },
    principal,
    request,
  });
  expect(added.ok).toBe(true);
  if (!added.ok) throw new Error('add fixture refused');
  expect(added.status).toBe(200);
  expect(added.body.step.name).toBe('Build');
  const found = await stored.findById(added.body.step.id);
  if (found === null) throw new Error('added step not stored');
  expect(added.body.step).toEqual(found);
  expect(addWrite).toHaveBeenLastCalledWith(
    expect.objectContaining({ name: 'Build' }),
    expect.objectContaining({ by: 'owner' }),
  );
  const renamed = await rename.handle({
    params: { id: 'project', stepId: 'step' },
    query: undefined,
    body: { name: '  Review  ' },
    principal,
    request,
  });
  expect(renamed).toEqual({
    ok: true,
    status: 200,
    body: {
      step: {
        id: 'step',
        projectId: 'project',
        name: 'Review',
        position: 10,
        code: 'design',
        allowancePercent: 0,
      },
    },
  });
  expect(broadcast.published.map((entry) => entry.event.type)).toEqual([
    'step_added',
    'step_renamed',
  ]);
});

test('typed name bindings preserve every modeled service refusal without a status fallback', async () => {
  const {
    endpoints: [add, rename],
  } = await fixture(true);
  for (const [id, name, actor, status, error] of [
    ['project', ' ', principal, 422, 'name_required'],
    ['missing', 'New', principal, 404, 'not_found'],
    ['project', 'New', { ...principal, id: 'stranger' }, 403, 'forbidden'],
    ['project', 'QA', principal, 409, 'taken'],
  ] as const) {
    const addReply: unknown = await add.handle({
      params: { id },
      query: undefined,
      body: { name },
      principal: actor,
      request,
    });
    expect(addReply).toEqual({ ok: false, status, body: { error } });
    const renameReply: unknown = await rename.handle({
      params: { id, stepId: 'step' },
      query: undefined,
      body: { name },
      principal: actor,
      request,
    });
    expect(renameReply).toEqual({ ok: false, status, body: { error } });
  }
  expect(
    await rename.handle({
      params: { id: 'project', stepId: 'foreign' },
      query: undefined,
      body: { name: 'New' },
      principal,
      request,
    }),
  ).toEqual({ ok: false, status: 404, body: { error: 'not_found' } });
});

test('typed removal carries every usage field and only literal true confirms cascade', async () => {
  const { projects, stored, broadcast } = await fixture();
  const service = new StepService({
    dependencyGraph: new DependencyGraphGuard({ ...inMemoryStores(), projects: projects }),
    clock: testClock,
    projects,
    broadcast,
    steps: {
      ...stored,
      usageOf: () =>
        Promise.resolve({
          estimates: 1,
          actuals: 2,
          progress: 3,
          measures: 4,
          assignments: [{ workItemId: 'work', stepId: 'step', personId: 'ada' }],
          workItemIds: ['work'],
        }),
    },
  });
  const remove = stepRoutes(
    service,
    {
      runWithin: () => Promise.reject(new Error('a removal ran a command batch')),
      runDirectoryWithin: () => Promise.reject(new Error('a removal ran a directory batch')),
    },
    legacyOrganizationAccess,
  )[2];
  for (const cascade of [undefined, '1', 'TRUE', 'false']) {
    const removeReply: unknown = await remove.handle({
      params: { id: 'project', stepId: 'step' },
      query: { cascade },
      body: undefined,
      principal,
      request,
    });
    expect(removeReply).toEqual({
      ok: false,
      status: 409,
      body: {
        error: 'in_use',
        inUse: {
          estimates: 1,
          actuals: 2,
          progress: 3,
          measures: 4,
          assignments: 1,
          assumedAssignees: [{ workItemId: 'work', assumedNow: 'ada', assumedAfter: null }],
        },
      },
    });
    expect(await stored.findById('step')).not.toBeNull();
  }
  expect(
    await remove.handle({
      params: { id: 'project', stepId: 'step' },
      query: { cascade: 'true' },
      body: undefined,
      principal,
      request,
    }),
  ).toEqual({ ok: true, status: 204, body: EMPTY });
  expect(await stored.findById('step')).toBeNull();
  expect(broadcast.published.map((entry) => entry.event.type)).toEqual(['step_removed']);
});

test('typed removal preserves project refusals and unknown repository failures reject', async () => {
  const {
    endpoints: [add, , remove],
    projects,
  } = await fixture(true);
  for (const [id, actor, status, error] of [
    ['missing', principal, 404, 'not_found'],
    ['project', { ...principal, id: 'stranger' }, 403, 'forbidden'],
  ] as const) {
    const removeReply: unknown = await remove.handle({
      params: { id, stepId: 'step' },
      query: {},
      body: undefined,
      principal: actor,
      request,
    });
    expect(removeReply).toEqual({ ok: false, status, body: { error } });
  }
  const outage = new Error('project store unavailable');
  const lookup = spyOn(projects, 'findById').mockRejectedValue(outage);
  try {
    const added = await add
      .handle({
        params: { id: 'project' },
        query: undefined,
        body: { name: 'Valid' },
        principal,
        request,
      })
      .catch((cause: unknown) => cause);
    expect(added).toBe(outage);
    const removed = await remove
      .handle({
        params: { id: 'project', stepId: 'step' },
        query: {},
        body: undefined,
        principal,
        request,
      })
      .catch((cause: unknown) => cause);
    expect(removed).toBe(outage);
  } finally {
    lookup.mockRestore();
  }
});

test('adds a step with the allowance it names, and refuses one with three decimals', async () => {
  const {
    endpoints: [add],
    stored,
  } = await fixture();
  const added = await add.handle({
    params: { id: 'project' },
    query: undefined,
    body: { name: 'Review', allowancePercent: 12.5 },
    principal,
    request,
  });
  if (!added.ok) throw new Error('add refused');
  expect(added.body.step.allowancePercent).toBe(12.5);
  expect((await stored.findById(added.body.step.id))?.allowancePercent).toBe(12.5);

  const defaulted = await add.handle({
    params: { id: 'project' },
    query: undefined,
    body: { name: 'Ship' },
    principal,
    request,
  });
  if (!defaulted.ok) throw new Error('add refused');
  expect(defaulted.body.step.allowancePercent).toBe(0);

  const before = stored.rows.length;
  // Proof: see the route's comment — without the refusal this stored the step.
  expect(
    await add.handle({
      params: { id: 'project' },
      query: undefined,
      body: { name: 'Precise', allowancePercent: 12.345 },
      principal,
      request,
    }),
  ).toEqual({ ok: false, status: 422, body: { error: 'invalid_allowance' } });
  expect(stored.rows).toHaveLength(before);
});

test('a patched allowance runs as the one journalled setStepAllowance command', async () => {
  const {
    endpoints: [, patch],
    commandsRun,
  } = await fixture();
  const reply = await patch.handle({
    params: { id: 'project', stepId: 'step' },
    query: undefined,
    body: { allowancePercent: 30 },
    principal,
    request,
  });
  expect(reply.ok).toBe(true);
  expect(commandsRun).toEqual([
    {
      projectId: 'project',
      actorId: 'owner',
      batch: [{ kind: 'setStepAllowance', stepId: 'step', allowancePercent: 30 }],
    },
  ]);

  for (const allowancePercent of [-1, 1000.01, 0.001]) {
    expect(
      await patch.handle({
        params: { id: 'project', stepId: 'step' },
        query: undefined,
        body: { allowancePercent },
        principal,
        request,
      }),
    ).toEqual({ ok: false, status: 422, body: { error: 'invalid_allowance' } });
  }
  expect(
    await patch.handle({
      params: { id: 'project', stepId: 'step' },
      query: undefined,
      body: {},
      principal,
      request,
    }),
  ).toEqual({ ok: false, status: 422, body: { error: 'invalid_body' } });
  expect(commandsRun).toHaveLength(1);
});
