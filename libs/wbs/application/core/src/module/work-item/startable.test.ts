import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import type { WorkItem } from '../../ports/work-item-store';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';

const OWNER = 'account-f';
const LEGACY = { kind: 'legacy' } as const;
const PLATFORM = 'team-platform';
const OPS = 'team-ops';

/**
 * A project with its starting steps Dev and QA over the memory source, and the
 * writes the scenarios need: rows, labels, progress, links and claims.
 */
async function seeded() {
  const source = openMemorySource();
  const graph = servicesOver(source.stores, {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  });
  await source.stores.users.create(
    { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: OWNER },
  );
  const created = await graph.projects.create('Startable', OWNER);
  const projectId = created.project.id;
  // The memory source keeps a project's steps apart from the step table its progress reads.
  for (const step of created.steps) {
    await source.stores.steps.add(
      { id: step.id, projectId, name: step.name, allowancePercent: 0, estimateUnit: 'workdays' },
      { at: 1, by: OWNER },
    );
  }
  const stepIds = (await source.stores.projects.stepsOf(projectId)).map(({ id }) => id);
  const dev = stepIds.at(0);
  const qa = stepIds.at(1);
  if (dev === undefined || qa === undefined) throw new Error('the project has no Dev and QA');
  await source.stores.directory.addTeam({ id: PLATFORM, name: 'Platform' }, { at: 1, by: OWNER });
  await source.stores.directory.addTeam({ id: OPS, name: 'Ops' }, { at: 1, by: OWNER });
  for (const id of ['claire', 'claire-worker', 'codex-fleet', 'ada']) {
    await source.stores.directory.addPerson({ id, name: `${id} name`, kind: 'agent' }, [], {
      at: 1,
      by: OWNER,
    });
  }
  const insert = async (row: Partial<WorkItem> & { id: string }, teamIds: string[] = []) => {
    await source.stores.workItems.insert(workItemRow({ projectId, ...row }), [], {
      at: 1,
      by: OWNER,
    });
    if (teamIds.length > 0)
      await source.stores.workItems.patch(row.id, { teamIds }, { at: 1, by: OWNER });
  };
  const claim = (
    id: string,
    workItemId: string,
    stepId: string | null,
    personId: string,
    at: number,
    parentClaimId: string | null = null,
  ) =>
    source.stores.claims.add(
      [{ id, workItemId, stepId, personId, runId: `run-${id}`, parentClaimId, accountId: OWNER }],
      [],
      { at, by: OWNER },
      [],
    );
  const link = (predecessorId: string, successorId: string) =>
    source.stores.dependencies.add(
      { id: `${predecessorId}->${successorId}`, projectId, predecessorId, successorId },
      { at: 1, by: OWNER },
    );
  const read = (teamId: string | null) =>
    graph.workItems.startableWithin(projectId, LEGACY, teamId);
  return { source, graph, projectId, dev, qa, insert, claim, link, read };
}

/** The read's answer, refusing the two refusals a scenario does not expect. */
function answered<T>(answer: T | { readonly kind: 'unknown_team' } | null): T {
  if (answer === null) throw new Error('the read answered not found');
  if (typeof answer === 'object' && 'kind' in answer) throw new Error('the read refused the team');
  return answer;
}

describe('the startable read', () => {
  it("lists a team's allotment, its claimed leaf apart, and omits the unlabelled leaf", async () => {
    const { dev, qa, insert, claim, read } = await seeded();
    await insert({ id: 'free', position: 1 }, [PLATFORM]);
    await insert({ id: 'taken', position: 2 }, [PLATFORM]);
    await insert({ id: 'unlabelled', position: 3 });
    expect(await claim('c-dev', 'taken', dev, 'codex-fleet', 500)).toBe('written');
    expect(await claim('c-qa', 'taken', qa, 'claire-worker', 600)).toBe('written');

    const forPlatform = answered(await read(PLATFORM));
    expect(forPlatform.leaves.map(({ workItemId, stepIds }) => ({ workItemId, stepIds }))).toEqual([
      { workItemId: 'free', stepIds: [dev, qa] },
    ]);
    expect(forPlatform.leaves[0]?.teams).toEqual([
      { teamId: PLATFORM, name: 'Platform', fromId: 'free' },
    ]);
    expect(forPlatform.claimed).toEqual([
      {
        workItemId: 'taken',
        number: '020',
        numberIsFrozen: false,
        name: 'Rewire the shed',
        stepId: dev,
        claimId: 'c-dev',
        holder: { personId: 'codex-fleet', name: 'codex-fleet name' },
        assignee: null,
        runId: 'run-c-dev',
        parentClaimId: null,
        claimedAt: 500,
      },
      {
        workItemId: 'taken',
        number: '020',
        numberIsFrozen: false,
        name: 'Rewire the shed',
        stepId: qa,
        claimId: 'c-qa',
        holder: { personId: 'claire-worker', name: 'claire-worker name' },
        assignee: null,
        runId: 'run-c-qa',
        parentClaimId: null,
        claimedAt: 600,
      },
    ]);
  });

  it('lists every startable step with no team, unlabelled leaves included', async () => {
    const { dev, qa, insert, claim, read } = await seeded();
    await insert({ id: 'free', position: 1 }, [PLATFORM]);
    await insert({ id: 'taken', position: 2 }, [PLATFORM]);
    await insert({ id: 'unlabelled', position: 3 });
    await insert({ id: 'ops', position: 4 }, [OPS]);
    await claim('c-dev', 'taken', dev, 'codex-fleet', 500);

    const every = answered(await read(null));
    expect(every.leaves.map(({ workItemId, stepIds }) => ({ workItemId, stepIds }))).toEqual([
      { workItemId: 'free', stepIds: [dev, qa] },
      { workItemId: 'taken', stepIds: [qa] },
      { workItemId: 'unlabelled', stepIds: [dev, qa] },
      { workItemId: 'ops', stepIds: [dev, qa] },
    ]);
    expect(every.leaves.find(({ workItemId }) => workItemId === 'unlabelled')?.teams).toEqual([]);
    expect(every.claimed.map(({ claimId }) => claimId)).toEqual(['c-dev']);
    const forOps = answered(await read(OPS));
    expect(forOps.leaves.map(({ workItemId }) => workItemId)).toEqual(['ops']);
    expect(forOps.claimed).toEqual([]);
  });

  it('leaves a ready leaf behind an unfinished held predecessor out', async () => {
    const { graph, projectId, insert, link, read } = await seeded();
    await insert({ id: 'held', position: 1, hold: 'blocked' });
    await insert({ id: 'waiting', position: 2, readiness: 'ready' });
    await link('held', 'waiting');
    const tree = await graph.workItems.tree(projectId);
    if (tree === null || 'kind' in tree) throw new Error('the tree read did not answer');
    expect(tree.workItems.map(({ id, readiness, status }) => ({ id, readiness, status }))).toEqual([
      { id: 'held', readiness: null, status: 'blocked' },
      { id: 'waiting', readiness: 'ready', status: 'blocked_by_proxy' },
    ]);

    const every = answered(await read(null));
    expect(every.leaves.map(({ workItemId }) => workItemId)).toEqual([]);
  });

  it('names the unfinished predecessors of a startable leaf, and drops finished ones', async () => {
    const { source, dev, qa, insert, link, read } = await seeded();
    await insert({ id: 'running', position: 1 });
    await insert({ id: 'finished', position: 2 });
    await insert({ id: 'next', position: 3, readiness: 'ready' });
    await source.stores.progress.set(
      { workItemId: 'running', stepId: dev, state: 'in_progress', statedAt: 1 },
      { at: 1, by: OWNER },
    );
    for (const stepId of [dev, qa]) {
      await source.stores.progress.set(
        { workItemId: 'finished', stepId, state: 'done', statedAt: 1 },
        { at: 1, by: OWNER },
      );
    }
    await link('running', 'next');
    await link('finished', 'next');

    const every = answered(await read(null));
    expect(every.leaves.map(({ workItemId }) => workItemId)).toEqual(['running', 'next']);
    expect(every.leaves.find(({ workItemId }) => workItemId === 'next')).toMatchObject({
      unfinishedPredecessorIds: ['running'],
    });
    // A done step is not startable; the step nobody has spoken about is.
    expect(every.leaves.find(({ workItemId }) => workItemId === 'running')?.stepIds).toEqual([
      dev,
      qa,
    ]);
  });

  it('leaves a done step out and keeps the other', async () => {
    const { source, dev, qa, insert, read } = await seeded();
    await insert({ id: 'half', position: 1 });
    await source.stores.progress.set(
      { workItemId: 'half', stepId: dev, state: 'done', statedAt: 1 },
      { at: 1, by: OWNER },
    );
    await source.stores.progress.set(
      { workItemId: 'half', stepId: qa, state: 'in_progress', statedAt: 1 },
      { at: 1, by: OWNER },
    );
    expect(answered(await read(null)).leaves).toMatchObject([
      { workItemId: 'half', stepIds: [qa] },
    ]);
  });

  it("names the subtree holder and still lists the subtree's free steps", async () => {
    const { dev, qa, insert, claim, read } = await seeded();
    await insert({ id: '080', position: 1, frozenNumber: '080' }, [PLATFORM]);
    await insert({ id: '080.25', parentId: '080', position: 1, frozenNumber: '080.25' });
    await insert({ id: '090', position: 2 });
    expect(await claim('subtree', '080', null, 'claire', 700)).toBe('written');
    expect(await claim('delegated', '080.25', dev, 'claire-worker', 800, 'subtree')).toBe(
      'written',
    );

    const forPlatform = answered(await read(PLATFORM));
    expect(forPlatform.leaves).toEqual([
      {
        workItemId: '080.25',
        number: '080.25',
        numberIsFrozen: true,
        name: 'Rewire the shed',
        stepIds: [qa],
        fits: true,
        assignees: [],
        teams: [{ teamId: PLATFORM, name: 'Platform', fromId: '080' }],
        unfinishedPredecessorIds: [],
        subtreeClaim: {
          claimId: 'subtree',
          workItemId: '080',
          holder: { personId: 'claire', name: 'claire name' },
          runId: 'run-subtree',
          parentClaimId: null,
        },
      },
    ]);
    expect(forPlatform.claimed).toMatchObject([
      { workItemId: '080.25', stepId: dev, claimId: 'delegated', parentClaimId: 'subtree' },
    ]);
    const every = answered(await read(null));
    expect(every.leaves.find(({ workItemId }) => workItemId === '090')?.subtreeClaim).toBeNull();
    expect(every.subtreeClaims).toEqual([
      {
        workItemId: '080',
        number: '080',
        numberIsFrozen: true,
        name: 'Rewire the shed',
        claimId: 'subtree',
        holder: { personId: 'claire', name: 'claire name' },
        runId: 'run-subtree',
        parentClaimId: null,
        claimedAt: 700,
      },
    ]);
  });

  it('lists a silent subtree claim whose every leaf has stopped', async () => {
    const { insert, claim, read } = await seeded();
    await insert({ id: '080', position: 1, frozenNumber: '080' });
    await insert({ id: '080.25', parentId: '080', position: 1, hold: 'blocked' });
    expect(await claim('subtree', '080', null, 'claire', 700)).toBe('written');

    const every = answered(await read(null));
    expect(every.leaves).toEqual([]);
    expect(every.claimed).toEqual([]);
    expect(every.subtreeClaims).toMatchObject([
      { workItemId: '080', claimId: 'subtree', holder: { personId: 'claire' }, claimedAt: 700 },
    ]);
    // Apart from the team filter: the operator sees it whatever team is asked about.
    expect(answered(await read(PLATFORM)).subtreeClaims).toHaveLength(1);
  });

  it('shows a claimed step beside its assignee', async () => {
    const { source, dev, qa, insert, claim, read } = await seeded();
    await insert({ id: 'taken', position: 1 });
    expect(await source.stores.directory.assign('taken', dev, 'ada', { at: 1, by: OWNER })).toEqual(
      { ok: true },
    );
    await claim('c-dev', 'taken', dev, 'codex-fleet', 500);
    await claim('c-qa', 'taken', qa, 'claire-worker', 600);

    const every = answered(await read(null));
    expect(every.leaves).toEqual([]);
    expect(
      every.claimed.map(({ claimId, holder, assignee }) => ({ claimId, holder, assignee })),
    ).toEqual([
      {
        claimId: 'c-dev',
        holder: { personId: 'codex-fleet', name: 'codex-fleet name' },
        assignee: { personId: 'ada', name: 'ada name' },
      },
      {
        claimId: 'c-qa',
        holder: { personId: 'claire-worker', name: 'claire-worker name' },
        assignee: null,
      },
    ]);
  });

  it('answers the frozen number, never the derived path', async () => {
    const { insert, read } = await seeded();
    await insert({ id: 'root', position: 1, frozenNumber: '080' });
    await insert({ id: 'leaf', parentId: 'root', position: 1, frozenNumber: '080.25' });
    await insert({ id: 'loose', parentId: 'root', position: 2 });

    const every = answered(await read(null));
    expect(
      every.leaves.map(({ workItemId, number, numberIsFrozen }) => ({
        workItemId,
        number,
        numberIsFrozen,
      })),
    ).toEqual([
      { workItemId: 'leaf', number: '080.25', numberIsFrozen: true },
      { workItemId: 'loose', number: '080.1', numberIsFrozen: false },
    ]);
  });

  it('names the assignee of each startable step that has one', async () => {
    const { source, dev, insert, read } = await seeded();
    await insert({ id: 'assigned', position: 1 });
    expect(
      await source.stores.directory.assign('assigned', dev, 'ada', { at: 1, by: OWNER }),
    ).toEqual({ ok: true });
    expect(answered(await read(null)).leaves[0]?.assignees).toEqual([
      { stepId: dev, personId: 'ada', name: 'ada name' },
    ]);
  });

  it('refuses a team the directory does not hold, and an absent project', async () => {
    const { graph, read } = await seeded();
    expect(await read('team-nobody')).toEqual({ kind: 'unknown_team' });
    expect(await graph.workItems.startableWithin('missing', LEGACY, null)).toBeNull();
  });
});

const RAM = 'resource-ram';

/**
 * {@link seeded} with `h2puni ram` declared, its capacity stated when `capacity`
 * is a number, and helpers to state demands and hold units by claim.
 */
async function withRam(capacity: number | null) {
  const seed = await seeded();
  const { source, projectId } = seed;
  const stamp = { at: 1, by: OWNER };
  const added = await source.stores.directory.addResource(
    { id: RAM, name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' },
    stamp,
  );
  if (!added.ok) throw new Error('the resource was refused');
  if (capacity !== null)
    expect(await source.stores.resourceCapacity.set(projectId, RAM, capacity, stamp)).toEqual({
      ok: true,
    });
  const demand = async (workItemId: string, units: number) => {
    expect(await source.stores.demands.set(workItemId, RAM, units, stamp)).toBe('written');
  };
  const hold = (id: string, workItemId: string, stepId: string, units: number) =>
    source.stores.claims.add(
      [
        {
          id,
          workItemId,
          stepId,
          personId: 'claire',
          runId: null,
          parentClaimId: null,
          accountId: OWNER,
        },
      ],
      [],
      stamp,
      [{ claimId: id, resourceId: RAM, units }],
    );
  return { ...seed, demand, hold };
}

describe('resource fit in the startable read', () => {
  it('lists a leaf whose demand exceeds the free units apart, with its shortfall', async () => {
    const { dev, qa, insert, demand, hold, read } = await withRam(8);
    await insert({ id: 'busy', position: 1 });
    await insert({ id: 'a', position: 2 });
    await insert({ id: 'b', position: 3 });
    await demand('busy', 4);
    await demand('a', 4);
    await demand('b', 8);
    expect(await hold('c-busy', 'busy', dev, 4)).toBe('written');

    const work = answered(await read(null));
    expect(work.resources).toEqual([
      {
        resourceId: RAM,
        name: 'h2puni ram',
        unitLabel: 'GB',
        kind: 'divisible',
        capacity: 8,
        occupied: 4,
        free: 4,
      },
    ]);
    expect(work.occupancyScope).toBe('project');
    expect(
      work.leaves.map(({ workItemId, fits, stepIds }) => ({ workItemId, fits, stepIds })),
    ).toEqual([
      { workItemId: 'busy', fits: true, stepIds: [qa] },
      { workItemId: 'a', fits: true, stepIds: [dev, qa] },
    ]);
    expect(
      work.doesNotFit.map(({ workItemId, fits, stepIds, exhausted }) => ({
        workItemId,
        fits,
        stepIds,
        exhausted,
      })),
    ).toEqual([
      {
        workItemId: 'b',
        fits: false,
        stepIds: [dev, qa],
        exhausted: {
          resourceId: RAM,
          name: 'h2puni ram',
          unitLabel: 'GB',
          asked: 8,
          free: 4,
          shortfall: 4,
        },
      },
    ]);
  });

  it('never excludes on an unstated capacity, and lists no resource for it', async () => {
    const { insert, demand, read } = await withRam(null);
    await insert({ id: 'a', position: 1 });
    await demand('a', 64);
    const work = answered(await read(null));
    expect(work.leaves.map(({ workItemId }) => workItemId)).toEqual(['a']);
    expect(work.doesNotFit).toEqual([]);
    expect(work.resources).toEqual([]);
  });

  it('excludes any demand on a stated capacity of 0', async () => {
    const { insert, demand, read } = await withRam(0);
    await insert({ id: 'a', position: 1 });
    await insert({ id: 'undemanding', position: 2 });
    await demand('a', 1);
    const work = answered(await read(null));
    expect(work.leaves.map(({ workItemId }) => workItemId)).toEqual(['undemanding']);
    expect(work.doesNotFit.map(({ workItemId, exhausted }) => ({ workItemId, exhausted }))).toEqual(
      [
        {
          workItemId: 'a',
          exhausted: {
            resourceId: RAM,
            name: 'h2puni ram',
            unitLabel: 'GB',
            asked: 1,
            free: 0,
            shortfall: 1,
          },
        },
      ],
    );
    expect(
      work.resources.map(({ capacity, occupied, free }) => ({ capacity, occupied, free })),
    ).toEqual([{ capacity: 0, occupied: 0, free: 0 }]);
  });

  it('fits a held leaf whose demand was raised past the free units', async () => {
    const { dev, qa, insert, demand, hold, read } = await withRam(4);
    await insert({ id: 'held', position: 1 });
    await demand('held', 4);
    expect(await hold('c-held', 'held', dev, 4)).toBe('written');
    await demand('held', 8);
    const work = answered(await read(null));
    expect(work.leaves.map(({ workItemId, stepIds }) => ({ workItemId, stepIds }))).toEqual([
      { workItemId: 'held', stepIds: [qa] },
    ]);
    expect(work.doesNotFit).toEqual([]);
    expect(work.resources.map(({ occupied, free }) => ({ occupied, free }))).toEqual([
      { occupied: 4, free: 0 },
    ]);
  });

  it('keeps the team filter on the leaves that do not fit', async () => {
    const { insert, demand, read } = await withRam(2);
    await insert({ id: 'platform', position: 1 }, [PLATFORM]);
    await insert({ id: 'ops', position: 2 }, [OPS]);
    await demand('platform', 4);
    await demand('ops', 4);
    const work = answered(await read(PLATFORM));
    expect(work.leaves).toEqual([]);
    expect(work.doesNotFit.map(({ workItemId }) => workItemId)).toEqual(['platform']);
  });
});
