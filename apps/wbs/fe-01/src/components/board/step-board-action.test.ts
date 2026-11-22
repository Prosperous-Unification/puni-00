import { describe, expect, it, vi } from 'vitest';

import type { PlanRefresh, RefreshResource } from '@/lib/plan-refresh';
import { createChannel } from '@/modules/channel';
import {
  createDeliveredPlan,
  type DeliveredPlanStore,
} from '@/modules/plan-feed/delivered-plan-store';
import { createBusy } from '@/modules/plan-writer/busy-store';
import { createPlanWriter } from '@/modules/plan-writer/plan-writer.feature';
import { planRead, workItemView } from '@/testing/views';

import { type StepBoardCard, workPackageStepBoard } from './step-board';
import { type BoardColumn, createStepBoardAction } from './step-board-action';

function owner(): PlanRefresh {
  const unused = (): never => {
    throw new Error('writer may compare owner identity only');
  };
  return {
    initialize: unused,
    invalidate: unused,
    getSnapshot: unused,
    subscribe: unused,
    dispose: unused,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('deferred promise not initialized');
  };
  const promise = new Promise<T>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

function deliver(plan: DeliveredPlanStore, progress: Record<string, 'in_progress' | 'done'> = {}) {
  plan.deliver({
    tree: {
      generation: 1,
      value: planRead({
        workItems: [workItemView({ id: 'leaf', number: '010', name: 'Build', progress })],
        steps: [
          {
            code: 'dev',
            estimateUnit: 'workdays',
            id: 'dev',
            name: 'Development',
            allowancePercent: 0,
          },
          { code: 'qa', estimateUnit: 'workdays', id: 'qa', name: 'QA', allowancePercent: 0 },
        ],
      }),
    },
    steps: null,
    directory: null,
    markers: null,
    claims: null,
    staleResources: [],
    treeFailure: null,
  });
}

function replaceTree(
  plan: DeliveredPlanStore,
  rows: ReturnType<typeof workItemView>[],
  stepIds: readonly string[] = ['dev', 'qa'],
): void {
  plan.deliver({
    tree: {
      generation: 2,
      value: planRead({
        workItems: rows,
        steps: stepIds.map((id) => ({
          code: id,
          estimateUnit: 'workdays',
          id,
          name: id,
          allowancePercent: 0,
        })),
      }),
    },
    steps: null,
    directory: null,
    markers: null,
    claims: null,
    staleResources: [],
    treeFailure: null,
  });
}

function markTreeUnusable(plan: DeliveredPlanStore, kind: 'stale' | 'failed'): void {
  plan.deliver({
    tree: null,
    steps: null,
    directory: null,
    markers: null,
    claims: null,
    staleResources: kind === 'stale' ? ['tree'] : [],
    treeFailure: kind === 'failed' ? { cause: new Error('read failed') } : null,
  });
}

function card(plan: DeliveredPlanStore, column: 'unknown' | 'inProgress' | 'done'): StepBoardCard {
  const tree = plan.snapshot().tree;
  if (tree === null) throw new Error('test needs a delivered tree');
  const found = workPackageStepBoard(tree.value).columns[column].find(
    (node) => node.stepId === 'dev',
  );
  if (found === undefined) throw new Error('test needs the Dev card');
  return found;
}

function fixture() {
  const plan = createDeliveredPlan();
  let isCurrent = true;
  const refreshOwner = owner();
  const rereads: (readonly RefreshResource[])[] = [];
  let request: Promise<void> = Promise.resolve();
  let covering: Promise<boolean> = Promise.resolve(true);
  const calls: unknown[][] = [];
  const commandsIssued = createChannel<undefined>();
  const refusals = createChannel<{ sentence: string }>();
  const busy = createBusy();
  const writer = createPlanWriter({
    readRefreshOwner: () => (isCurrent ? refreshOwner : null),
    rereadResources: (resources) => {
      rereads.push(resources);
      return covering;
    },
    busy,
    commandsIssued,
    refusals,
  });
  const commands = {
    setProgress: (workItemId: string, stepId: string, state: 'in_progress' | 'done') => {
      calls.push(['setProgress', workItemId, stepId, state]);
      return request;
    },
    clearProgress: (workItemId: string, stepId: string) => {
      calls.push(['clearProgress', workItemId, stepId]);
      return request;
    },
  };
  const actionHost = { plan, isCurrent: () => isCurrent, writer, commands, busy };
  const action = createStepBoardAction(actionHost);
  return {
    plan,
    action,
    calls,
    rereads,
    commandsIssued,
    refusals,
    writer,
    busy,
    retire: () => {
      isCurrent = false;
    },
    holdRequest: (pending: Promise<void>) => {
      request = pending;
    },
    holdCovering: (pending: Promise<boolean>) => {
      covering = pending;
    },
  };
}

const moveCases: {
  from: Record<string, 'in_progress' | 'done'>;
  source: BoardColumn;
  target: BoardColumn;
  command: string[];
}[] = [
  {
    from: {},
    source: 'unknown' as const,
    target: 'inProgress' as const,
    command: ['setProgress', 'leaf', 'dev', 'in_progress'],
  },
  {
    from: {},
    source: 'unknown' as const,
    target: 'done' as const,
    command: ['setProgress', 'leaf', 'dev', 'done'],
  },
  {
    from: { dev: 'done' as const },
    source: 'done' as const,
    target: 'inProgress' as const,
    command: ['setProgress', 'leaf', 'dev', 'in_progress'],
  },
  {
    from: { dev: 'done' as const },
    source: 'done' as const,
    target: 'unknown' as const,
    command: ['clearProgress', 'leaf', 'dev'],
  },
];

describe('the selected runtime Board action', () => {
  it.each(moveCases)(
    'writes only one exact step command for $source to $target',
    async ({ from, source, target, command }) => {
      const at = fixture();
      deliver(at.plan, from);
      at.action.capture(card(at.plan, source), source);

      expect(await at.action.move(target)).toBe('landed');

      expect(at.calls).toEqual([command]);
      expect(at.rereads).toEqual([['tree']]);
      const latest = at.plan.snapshot().tree;
      if (latest === null) throw new Error('tree disappeared');
      expect(workPackageStepBoard(latest.value).columns[source]).toHaveLength(
        source === 'unknown' ? 2 : 1,
      );
    },
  );

  it('keeps admission pending through both request and covering reread', async () => {
    const at = fixture();
    deliver(at.plan);
    const request = deferred<undefined>();
    const covering = deferred<boolean>();
    at.holdRequest(request.promise);
    at.holdCovering(covering.promise);
    at.action.capture(card(at.plan, 'unknown'), 'unknown');

    const move = at.action.move('done');
    expect(at.action.snapshot().kind).toBe('pending');
    expect(at.calls).toEqual([['setProgress', 'leaf', 'dev', 'done']]);
    expect(at.rereads).toEqual([]);
    request.resolve(undefined);
    await vi.waitFor(() => {
      expect(at.rereads).toEqual([['tree']]);
    });
    expect(at.action.snapshot().kind).toBe('pending');
    covering.resolve(true);
    expect(await move).toBe('landed');
    expect(at.action.snapshot().kind).toBe('idle');
  });

  it('sends no command for a same-column target or a cancelled gesture', async () => {
    const at = fixture();
    deliver(at.plan);
    at.action.capture(card(at.plan, 'unknown'), 'unknown');
    expect(await at.action.move('unknown')).toBe('not-sent');
    at.action.capture(card(at.plan, 'unknown'), 'unknown');
    at.action.cancel();
    expect(await at.action.move('done')).toBe('not-sent');
    expect(at.calls).toEqual([]);
    expect(at.rereads).toEqual([]);
  });

  it.each(['stale', 'failed'] as const)('sends no command when the tree is %s', async (kind) => {
    const at = fixture();
    deliver(at.plan);
    at.action.capture(card(at.plan, 'unknown'), 'unknown');
    markTreeUnusable(at.plan, kind);
    expect(await at.action.move('done')).toBe('not-sent');
    expect(at.calls).toEqual([]);
    expect(at.action.snapshot().kind).toBe('rejected');
  });

  it('sends no command for a withdrawn runtime', async () => {
    const at = fixture();
    deliver(at.plan);
    at.action.capture(card(at.plan, 'unknown'), 'unknown');
    let notifications = 0;
    const states: string[] = [];
    at.commandsIssued.subscribe(() => {
      notifications += 1;
    });
    at.action.subscribe(() => {
      states.push(at.action.snapshot().kind);
    });
    at.retire();
    const outcome = await at.action.move('done');
    expect(at.calls).toEqual([]);
    expect(notifications).toBe(0);
    expect(states).toEqual(['rejected']);
    expect(outcome).toBe('not-sent');
  });

  it('refuses a typed captured card before the current runtime has a first tree', async () => {
    const earlier = fixture();
    deliver(earlier.plan);
    const at = fixture();
    expect(at.plan.snapshot().tree).toBeNull();
    at.action.capture(card(earlier.plan, 'unknown'), 'unknown');
    let notifications = 0;
    const states: string[] = [];
    at.commandsIssued.subscribe(() => {
      notifications += 1;
    });
    at.action.subscribe(() => {
      states.push(at.action.snapshot().kind);
    });
    const settled = await Promise.allSettled([at.action.move('done')]);
    expect(at.calls).toEqual([]);
    expect(notifications).toBe(0);
    expect(settled).toEqual([{ status: 'fulfilled', value: 'not-sent' }]);
    expect(states).toEqual(['rejected']);
    expect(at.action.snapshot()).toEqual({
      kind: 'rejected',
      message: 'The plan needs a fresh tree read before this step can move.',
    });
  });

  it.each([
    { name: 'deleted row', rows: [] as ReturnType<typeof workItemView>[], steps: ['dev', 'qa'] },
    {
      name: 'recreated row',
      rows: [workItemView({ id: 'replacement', name: 'Build' })],
      steps: ['dev', 'qa'],
    },
    { name: 'deleted step', rows: [workItemView({ id: 'leaf', name: 'Build' })], steps: ['qa'] },
    {
      name: 'parent conversion',
      rows: [
        workItemView({ id: 'leaf', name: 'Build' }),
        workItemView({ id: 'child', parentId: 'leaf' }),
      ],
      steps: ['dev', 'qa'],
    },
  ])('sends no command when the captured pair becomes $name', async ({ rows, steps }) => {
    const at = fixture();
    deliver(at.plan);
    at.action.capture(card(at.plan, 'unknown'), 'unknown');
    replaceTree(at.plan, rows, steps);
    expect(await at.action.move('done')).toBe('not-sent');
    expect(at.calls).toEqual([]);
  });

  it('rejects a peer progress change but accepts a rename with the same pair', async () => {
    const at = fixture();
    deliver(at.plan);
    at.action.capture(card(at.plan, 'unknown'), 'unknown');
    replaceTree(at.plan, [
      workItemView({ id: 'leaf', name: 'Renamed', progress: { dev: 'done' } }),
    ]);
    expect(await at.action.move('inProgress')).toBe('not-sent');
    expect(at.calls).toEqual([]);

    replaceTree(at.plan, [workItemView({ id: 'leaf', name: 'Renamed', progress: {} })]);
    at.action.capture(card(at.plan, 'unknown'), 'unknown');
    replaceTree(at.plan, [workItemView({ id: 'leaf', name: 'Renamed again', progress: {} })]);
    expect(await at.action.move('done')).toBe('landed');
    expect(at.calls).toEqual([['setProgress', 'leaf', 'dev', 'done']]);
  });

  it('rejects a second target while its own request is pending', async () => {
    const at = fixture();
    deliver(at.plan);
    const request = deferred<undefined>();
    at.holdRequest(request.promise);
    at.action.capture(card(at.plan, 'unknown'), 'unknown');
    const first = at.action.move('done');
    at.action.capture(card(at.plan, 'unknown'), 'unknown');
    expect(at.action.snapshot().kind).toBe('pending');
    at.action.cancel();
    expect(at.action.snapshot().kind).toBe('pending');
    const second = at.action.move('inProgress');
    const callsBeforeSettlement = [...at.calls];
    request.resolve(undefined);
    expect(callsBeforeSettlement).toEqual([['setProgress', 'leaf', 'dev', 'done']]);
    expect(await second).toBe('not-sent');
    expect(await first).toBe('landed');
  });

  it('keeps its own admission after a real overlapping Plan writer lowers shared busy', async () => {
    const at = fixture();
    deliver(at.plan);
    const request = deferred<undefined>();
    at.holdRequest(request.promise);
    at.action.capture(card(at.plan, 'unknown'), 'unknown');
    const boardMove = at.action.move('done');
    expect(at.busy.snapshot()).toBe(true);
    expect(at.calls).toEqual([['setProgress', 'leaf', 'dev', 'done']]);

    const planWrite = at.writer.run(async (write) => {
      await write.perform(['tree'], () => Promise.resolve());
    });
    expect(await planWrite).toBe('landed');
    expect(at.busy.snapshot()).toBe(false);
    expect(at.action.snapshot().kind).toBe('pending');
    const duplicate = at.action.move('inProgress');
    const callsBeforeBoardSettlement = [...at.calls];
    request.resolve(undefined);
    expect(callsBeforeBoardSettlement).toEqual([['setProgress', 'leaf', 'dev', 'done']]);
    expect(await duplicate).toBe('not-sent');
    expect(await boardMove).toBe('landed');
  });

  it('rechecks a withdrawn runtime after commandsIssued and before request dispatch', async () => {
    const at = fixture();
    deliver(at.plan);
    at.action.capture(card(at.plan, 'unknown'), 'unknown');
    at.commandsIssued.subscribe(() => {
      at.retire();
    });
    const outcome = await at.action.move('done');
    expect(at.calls).toEqual([]);
    expect(outcome).toBe('not-sent');
  });

  it('rechecks peer progress delivered by commandsIssued before request dispatch', async () => {
    const at = fixture();
    deliver(at.plan);
    at.action.capture(card(at.plan, 'unknown'), 'unknown');
    at.commandsIssued.subscribe(() => {
      replaceTree(at.plan, [
        workItemView({ id: 'leaf', name: 'Build', progress: { dev: 'done' } }),
      ]);
    });
    const outcome = await at.action.move('inProgress');
    expect(at.calls).toEqual([]);
    expect(outcome).toBe('not-sent');
  });
});
