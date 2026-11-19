import { describe, expect, it, vi } from 'vitest';

import type { CreatedProjectWithWorkPackage } from '@/lib/wbs-api';

import { fakeWorkPackageApi } from './fake-work-package-api';
import { refusingApi } from './refusing-api';
import { planRead, workItemView } from './views';

describe('refusingApi contract boundary', () => {
  it('validates a directly stated tree rather than exempting every tree answer', async () => {
    const api = refusingApi({
      tree: () => Promise.resolve({ ...planRead(), seq: 'next' } as never),
    });

    await expect(api.tree('p1')).rejects.toThrow('fake_invalid_response');
  });

  it('does not normalize a null optional tree list as an absent compatibility field', async () => {
    const api = refusingApi({
      tree: () =>
        Promise.resolve(planRead({ workItems: [workItemView({ tagIds: null } as never)] })),
    });

    await expect(api.tree('p1')).rejects.toThrow('fake_invalid_response');
  });

  it('starts a direct marker mutation immediately with its normalized facade input', async () => {
    const received: unknown[] = [];
    const api = refusingApi({
      createCalendarMarker: (workPackageId, marker) => {
        received.push({ workPackageId, marker });
        return Promise.resolve({ id: 'marker-1', ...marker, color: '#123456' });
      },
    });

    const created = api.createCalendarMarker('p1', {
      date: '2026-09-07',
      name: 'Cut',
      color: undefined,
    });

    expect(received).toEqual([
      { workPackageId: 'p1', marker: { date: '2026-09-07', name: 'Cut' } },
    ]);
    await expect(created).resolves.toEqual({
      id: 'marker-1',
      date: '2026-09-07',
      name: 'Cut',
      color: '#123456',
    });
  });

  it('refuses a normalized-away required marker field before mutation', async () => {
    const renameCalendarMarker = vi.fn(() =>
      Promise.resolve({ id: 'marker-1', date: '2026-09-07', name: 'Cut', color: '#123456' }),
    );
    const api = refusingApi({ renameCalendarMarker });

    await expect(api.renameCalendarMarker('p1', 'marker-1', undefined as never)).rejects.toThrow(
      'fake_invalid_request',
    );
    expect(renameCalendarMarker).not.toHaveBeenCalled();
  });

  it('refuses a normalized-away required marker color before mutation', async () => {
    const recolorCalendarMarker = vi.fn(() =>
      Promise.resolve({ id: 'marker-1', date: '2026-09-07', name: 'Cut', color: '#123456' }),
    );
    const api = refusingApi({ recolorCalendarMarker });

    await expect(api.recolorCalendarMarker('p1', 'marker-1', undefined as never)).rejects.toThrow(
      'fake_invalid_request',
    );
    expect(recolorCalendarMarker).not.toHaveBeenCalled();
  });

  it('does not repair a missing required work-package-list facade field', async () => {
    const api = refusingApi({
      listWorkPackages: () =>
        Promise.resolve([
          {
            id: 'work-package-1',
            restricted: false,
            abbreviation: 'PLAN',
            lastOpenedAt: null,
            createdByName: 'Ada',
            startDate: null,
            createdAt: 1,
          },
        ] as never),
    });

    await expect(api.listWorkPackages()).rejects.toThrow('fake_invalid_response');
  });

  // Proof: `accountId` required on `listPeople` failed this, as it failed 111
  // cases of `plan-cards.test.tsx` on the h2puni gate (2026-10-19).
  it('passes a people fixture with and without the account binding through the client', async () => {
    const unbound = { id: 'p1', name: 'Kat', kind: 'person' as const, teamIds: [] };
    const bound = { ...unbound, id: 'p2', name: 'Claire', accountId: 'dany' };
    const api = refusingApi({ listPeople: () => Promise.resolve([unbound, bound]) });

    await expect(api.listPeople()).resolves.toEqual([unbound, bound]);
  });

  it('refuses a people answer whose account binding is not an id or null', async () => {
    const api = refusingApi({
      listPeople: () =>
        Promise.resolve([
          { id: 'p1', name: 'Kat', kind: 'person', teamIds: [], accountId: 4 },
        ] as never),
    });

    await expect(api.listPeople()).rejects.toThrow('fake_invalid_response');
  });

  it('does not repair a missing required created-work-package facade field', async () => {
    const api = refusingApi({
      createWorkPackage: () => Promise.resolve({ id: 'work-package-1', name: 'Plan' } as never),
    });

    await expect(api.createWorkPackage('project-a', 'Plan')).rejects.toThrow(
      'fake_invalid_response',
    );
  });

  it.each(['undo', 'redo'] as const)(
    'returns only the validated %s facade fields',
    async (method) => {
      const api = refusingApi({
        [method]: () =>
          Promise.resolve({ ok: true, done: 'rename', detail: null, unchecked: true } as never),
      });

      await expect(api[method]('p1')).resolves.toEqual({
        ok: true,
        done: 'rename',
        detail: null,
      });
    },
  );

  it('refuses a truthy non-boolean facade discriminator', async () => {
    const api = refusingApi({
      undo: () => Promise.resolve({ ok: 'yes', done: 'rename', detail: null } as never),
    });

    await expect(api.undo('p1')).rejects.toThrow('fake_invalid_response');
  });

  it('does not rewrite a malformed step-removal discriminant into in_use', async () => {
    const api = refusingApi({
      removeStep: () =>
        Promise.resolve({
          ok: false,
          reason: 'taken',
          inUse: {
            estimates: 0,
            actuals: 0,
            progress: 0,
            measures: 0,
            assignments: 0,
            assumedAssignees: [],
          },
        } as never),
    });

    await expect(api.removeStep('p1', 'step-dev', false)).rejects.toThrow('fake_invalid_response');
  });

  it('does not rewrite a malformed tag-write discriminant into taken', async () => {
    const api = refusingApi({
      renameTag: () =>
        Promise.resolve({ ok: false, reason: 'in_use', survivingName: 'Existing' } as never),
    });

    await expect(api.renameTag('tag-1', 'Changed')).rejects.toThrow('fake_invalid_response');
  });

  it('does not rewrite a malformed tag-removal discriminant into in_use', async () => {
    const api = refusingApi({
      removeTag: () =>
        Promise.resolve({
          ok: false,
          reason: 'taken',
          usage: { workPackages: [], members: [] },
        } as never),
    });

    await expect(api.removeTag('tag-1', false)).rejects.toThrow('fake_invalid_response');
  });

  it('builds a checked wrapper for every method stated by the complete fake', () => {
    const api = fakeWorkPackageApi();

    expect(() => {
      Object.values(api);
    }).not.toThrow();
  });

  it('refuses malformed dependency reach before the stateful fake mutates', async () => {
    const api = fakeWorkPackageApi();
    const before = (await api.tree('p1')).depReach;

    const outcome = await api.setDepReach('p1', 'quantum' as never).then(
      () => 'resolved',
      (cause: unknown) => (cause instanceof Error ? cause.message : cause),
    );
    const after = await api.tree('p1').then(
      (plan) => plan.depReach,
      (cause: unknown) => (cause instanceof Error ? cause.message : cause),
    );

    expect({ outcome, after }).toEqual({ outcome: 'fake_invalid_request', after: before });
  });

  it('refuses an empty work package id before dependency reach mutates', async () => {
    const api = fakeWorkPackageApi();
    const before = (await api.tree('p1')).depReach;

    await expect(api.setDepReach('', 'anchor-slice')).rejects.toThrow('fake_invalid_request');

    expect((await api.tree('p1')).depReach).toBe(before);
  });

  it('refuses a dot-segment work package id before a work item is created', async () => {
    const api = fakeWorkPackageApi();
    const before = (await api.tree('p1')).workItems.length;

    await expect(api.createWorkItem('.', { parentId: null })).rejects.toThrow(
      'fake_invalid_request',
    );

    expect((await api.tree('p1')).workItems).toHaveLength(before);
  });

  it('mutates from the normalized patch and leaves an undefined name absent', async () => {
    const api = fakeWorkPackageApi();
    const made = await api.createWorkItem('p1', { parentId: null, name: 'Original' });

    await expect(api.patchWorkItem(made.id, { name: undefined })).resolves.toBeUndefined();

    const plan = await api.tree('p1');
    expect(plan.workItems.find((row) => row.id === made.id)?.name).toBe('Original');
  });

  it('refuses a malformed work package command before the stated mutation runs', async () => {
    const setEstimate = vi.fn(() => Promise.resolve());
    const api = refusingApi({ setEstimate });

    await expect(
      api.setEstimate('work-1', 'step-1', {
        optimistic: 1,
        realistic: 2,
        pessimistic: 3,
        extra: true,
      } as never),
    ).rejects.toThrow('fake_invalid_request');
    expect(setEstimate).not.toHaveBeenCalled();
  });

  it('refuses a malformed directory command before the stated mutation runs', async () => {
    const addPerson = vi.fn(() =>
      Promise.resolve({ id: 'person-1', name: 'Ada', kind: 'person' as const, teamIds: [] }),
    );
    const api = refusingApi({ addPerson });

    await expect(api.addPerson('Ada', [7] as never)).rejects.toThrow('fake_invalid_request');
    expect(addPerson).not.toHaveBeenCalled();
  });

  // The real `createPerson` answer carries no memberships: `personEntity` in
  // `work-item.routes.ts` is `{ id, name, kind }` and the batch entity in
  // `work-item-shapes.ts` declares `'teamIds?'`. Production stopped requiring
  // the field in 732614df and this fake did not, so it rejected the one shape
  // be-01 actually sends. Proof: before that was fixed this case failed with
  // `fake_invalid_response`.
  it('accepts a created person with no memberships, the shape createPerson really answers', async () => {
    const addPerson = vi.fn(() =>
      Promise.resolve({ id: 'person-1', name: 'Ada', kind: 'person' as const }),
    );
    const api = refusingApi({ addPerson });

    await expect(api.addPerson('Ada', [])).resolves.toEqual({
      id: 'person-1',
      name: 'Ada',
      kind: 'person',
    });
    expect(addPerson).toHaveBeenCalledWith('Ada', []);
  });

  it('refuses malformed work package creation before the stated mutation runs', async () => {
    const createWorkPackage = vi.fn((projectId: string) =>
      Promise.resolve({
        projectId,
        id: 'work-package-1',
        name: 'Plan',
        restricted: false,
        abbreviation: 'PLAN',
      }),
    );
    const api = refusingApi({ createWorkPackage });

    await expect(api.createWorkPackage('project-a', 7 as never)).rejects.toThrow(
      'fake_invalid_request',
    );
    expect(createWorkPackage).not.toHaveBeenCalled();
  });

  it('refuses a malformed work package list before a screen can read it', async () => {
    const api = refusingApi({
      listWorkPackages: () =>
        Promise.resolve([
          {
            id: 'work-package-1',
            name: 'Plan',
            restricted: false,
            abbreviation: 'PLAN',
            lastOpenedAt: null,
            createdByName: 'Ada',
            startDate: null,
            createdAt: 'yesterday',
          },
        ] as never),
    });

    await expect(api.listWorkPackages()).rejects.toThrow('fake_invalid_response');
  });

  it('refuses a malformed created work-item id before a screen can read it', async () => {
    const api = refusingApi({ createWorkItem: () => Promise.resolve({ id: 7 } as never) });

    await expect(api.createWorkItem('p1', { parentId: null })).rejects.toThrow(
      'fake_invalid_response',
    );
  });

  it('passes only the normalized facade input to a stated work-item creation', async () => {
    const createWorkItem = vi.fn(() => Promise.resolve({ id: 'work-1' }));
    const api = refusingApi({ createWorkItem });

    await api.createWorkItem('p1', { parentId: null, name: undefined });

    expect(createWorkItem).toHaveBeenCalledWith('p1', { parentId: null });
  });

  it('keeps a stated delete options object present after its undefined strategy leaves the wire', async () => {
    const removeWorkItem = vi.fn(() => Promise.resolve());
    const api = refusingApi({ removeWorkItem });

    const removal = api.removeWorkItem('work-1', { strategy: undefined });

    expect(removeWorkItem).toHaveBeenCalledWith('work-1', { strategy: undefined });
    await expect(removal).resolves.toBeUndefined();
  });

  it('reconstructs a work-package-command facade answer from the validated reply', async () => {
    const api = refusingApi({
      createWorkItem: () => Promise.resolve({ id: 'work-1', unchecked: true } as never),
    });

    await expect(api.createWorkItem('p1', { parentId: null })).resolves.toEqual({ id: 'work-1' });
  });

  it('reconstructs a directory-command facade answer from the validated reply', async () => {
    const api = refusingApi({
      addTag: () => Promise.resolve({ id: 'tag-1', name: 'Risk', unchecked: true } as never),
    });

    await expect(api.addTag('Risk')).resolves.toEqual({ id: 'tag-1', name: 'Risk' });
  });

  it('refuses malformed modeled undo detail before a screen can branch on it', async () => {
    const api = refusingApi({
      undo: () => Promise.resolve({ ok: false, reason: 'stale_undo', detail: 7 } as never),
    });

    await expect(api.undo('p1')).rejects.toThrow('fake_invalid_response');
  });

  it('refuses malformed optimizer settings before the stated mutation runs', async () => {
    const setOptimizationSettings = vi.fn(() => Promise.resolve());
    const api = refusingApi(
      { setOptimizationSettings },
      { projectIdOf: (_id: string) => 'fixture-project' },
    );

    await expect(
      api.setOptimizationSettings('p1', { scheduleEngine: 'quantum' } as never),
    ).rejects.toThrow('fake_invalid_request');
    expect(setOptimizationSettings).not.toHaveBeenCalled();
  });

  it('refuses a malformed stated request before the answer can mutate', async () => {
    const addStep = vi.fn(() =>
      Promise.resolve({
        estimateUnit: 'workdays' as const,
        id: 'step-dev',
        name: 'Dev',
        allowancePercent: 0,
      }),
    );
    const api = refusingApi({ addStep });

    await expect(api.addStep('p1', 7 as never)).rejects.toThrow('fake_invalid_request');
    expect(addStep).not.toHaveBeenCalled();
  });

  it('refuses a malformed stated directory answer before a screen can read it', async () => {
    const api = refusingApi({
      listTeams: () => Promise.resolve([{ id: 'team-1', name: 'Delivery' }] as never),
    });

    await expect(api.listTeams()).rejects.toThrow('fake_invalid_response');
  });

  it('refuses a malformed modeled step refusal before a screen can branch on it', async () => {
    const api = refusingApi({
      removeStep: () =>
        Promise.resolve({ ok: false, reason: 'in_use', inUse: { estimates: 1 } } as never),
    });

    await expect(api.removeStep('p1', 'step-dev', false)).rejects.toThrow('fake_invalid_response');
  });
});

describe('explicit project facade boundaries', () => {
  it('forwards the explicit creation parent before validating its stated response', async () => {
    const createWorkPackage = vi.fn((projectId: string, name: string) =>
      Promise.resolve({ id: 'p-new', projectId, name, restricted: false, abbreviation: 'PLAN' }),
    );
    const api = refusingApi({ createWorkPackage });
    await expect(api.createWorkPackage('project-a', 'Plan')).resolves.toEqual({
      id: 'p-new',
      projectId: 'project-a',
      name: 'Plan',
      restricted: false,
      abbreviation: 'PLAN',
    });
    expect(createWorkPackage).toHaveBeenCalledWith('project-a', 'Plan');
  });
  it('does not repair a missing required parent in the creation response', async () => {
    const createWorkPackage = vi.fn(() =>
      Promise.resolve({
        id: 'p-new',
        name: 'Plan',
        restricted: false,
        abbreviation: 'PLAN',
      } as never),
    );
    const api = refusingApi({ createWorkPackage });
    await expect(api.createWorkPackage('project-a', 'Plan')).rejects.toThrow(
      'fake_invalid_response',
    );
    expect(createWorkPackage).toHaveBeenCalledTimes(1);
  });
  it('validates actual project summary fields instead of forwarding an unchecked list', async () => {
    const api = refusingApi({
      listProjects: () =>
        Promise.resolve([{ id: 'project-a', name: 'A', createdAt: 'yesterday' }] as never),
    });
    await expect(api.listProjects()).rejects.toThrow('fake_invalid_response');
  });
});

describe('required project fake preflight', () => {
  it.each([undefined, null, '', 7])(
    'rejects malformed destination %s before the stated create callback',
    async (parent) => {
      const create = vi.fn();
      const api = refusingApi({ createWorkPackage: create });
      await expect(api.createWorkPackage(parent as never, 'Plan')).rejects.toThrow(
        'fake_invalid_request',
      );
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('requires explicit parent context before manufacturing a step response', async () => {
    const read = vi.fn(() => Promise.resolve([]));
    const api = refusingApi({ steps: read });
    await expect(api.steps('p1')).rejects.toThrow('fake_missing_project_context');
    expect(read).not.toHaveBeenCalled();
  });
});

const combinedCreation: CreatedProjectWithWorkPackage = {
  project: {
    id: 'project-created',
    organizationId: 'org-a',
    spaceId: null,
    spacePosition: null,
    name: 'New mission',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: 'creator-a',
    workPackageCount: 1,
  },
  workPackage: {
    id: 'package-created',
    projectId: 'project-created',
    name: 'First delivery',
    abbreviation: 'FIRST',
    restricted: false,
    estimateMethod: 'pert',
    depReach: 'whole-item',
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'ceil',
    startDate: null,
    solutionRef: null,
    revision: 0,
    createdAt: 1,
    optimizationEnabled: false,
    scheduleEngine: 'fast',
    scheduleObjective: 'pri',
    budgetFactor: 1,
  },
  steps: [],
};

describe('combined creation fake boundary', () => {
  it('keeps an unstated combined operation refusing', async () => {
    await expect(
      refusingApi({}).createProjectWithWorkPackage('New mission', 'First delivery'),
    ).rejects.toThrow('api.createProjectWithWorkPackage is not one this test answers');
  });

  it('runs one stated creation with the exact normalized names and complete reply', async () => {
    const create = vi.fn(() => Promise.resolve(combinedCreation));
    const api = refusingApi({ createProjectWithWorkPackage: create });
    await expect(
      api.createProjectWithWorkPackage('New mission', 'First delivery'),
    ).resolves.toEqual(combinedCreation);
    expect(create).toHaveBeenCalledExactlyOnceWith('New mission', 'First delivery');
  });

  it('rejects a malformed required name before the stated writer runs', async () => {
    const create = vi.fn(() => Promise.resolve(combinedCreation));
    const api = refusingApi({ createProjectWithWorkPackage: create });
    await expect(
      api.createProjectWithWorkPackage('New mission', undefined as never),
    ).rejects.toThrow('fake_invalid_request');
    expect(create).not.toHaveBeenCalled();
  });

  it.each(['empty', 'partial', 'foreign parent'])(
    'refuses a stated %s combined response without manufacturing its missing fields',
    async (fault) => {
      const reply = structuredClone(combinedCreation);
      if (fault === 'empty') {
        Reflect.deleteProperty(reply, 'workPackage');
        Reflect.deleteProperty(reply, 'steps');
      }
      if (fault === 'partial') Reflect.deleteProperty(reply, 'steps');
      if (fault === 'foreign parent') reply.workPackage.projectId = 'foreign-parent';
      const api = refusingApi({ createProjectWithWorkPackage: () => Promise.resolve(reply) });
      await expect(
        api.createProjectWithWorkPackage('New mission', 'First delivery'),
      ).rejects.toThrow('fake_invalid_response');
    },
  );
});
