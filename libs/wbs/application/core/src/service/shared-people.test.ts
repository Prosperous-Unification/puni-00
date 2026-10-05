import { schedule, sliceKey } from '@wbs/domain';
import { describe, expect, it, spyOn } from 'bun:test';

import type { PlanInputReads } from '../ports/saved-plan-capture-store';
import type { Scheduler } from '../ports/scheduler';
import { readSharedPeople, selectInfluencers } from './shared-people';

function plan(
  id: string,
  people: readonly string[],
  startDate: PlanInputReads['project']['startDate'] = '2026-10-05',
): PlanInputReads {
  return {
    project: {
      id,
      name: id,
      ownerId: 'owner',
      restricted: false,
      estimateMethod: 'pert',
      depReach: 'whole-item',
      pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
      estimateRounding: 'exact',
      startDate,
      scheduleEngine: 'fast',
      scheduleObjective: 'pri',
      optimizationEnabled: false,
      solutionRef: null,
    },
    steps: people.map((_, index) => ({
      id: `s${String(index)}`,
      code: null,
      name: `s${String(index)}`,
      position: index,
      allowancePercent: 0,
    })),
    workItems: [
      {
        id,
        projectId: id,
        parentId: null,
        position: 10,
        name: id,
        notes: '',
        frozenNumber: null,
        startNoEarlierThan: id === 'C' ? '2026-10-07' : null,
        startNoEarlierThanReason: null,
        deadline: null,
        readiness: null,
        hold: null,
        priority: null,
        serviceTeamId: null,
        serviceId: null,
        maxParallel: 1,
        revision: 0,
        teamIds: [],
        tagIds: [],
        serviceIds: [],
        typeIds: [],
        externalRefs: [],
      },
    ],
    estimates: people.map((_, index) => ({
      workItemId: id,
      stepId: `s${String(index)}`,
      optimistic: 1,
      realistic: 1,
      pessimistic: 1,
    })),
    assignments: people.map((personId, index) => ({
      workItemId: id,
      stepId: `s${String(index)}`,
      personId,
    })),
    dependencies: [],
    typedDependencies: [],
    actuals: [],
    progress: [],
    measures: [],
    capacity: new Map(),
    priorityBands: [],
    people: people.map((id) => ({ id, name: id, teamIds: [] })),
    teams: [],
    services: [],
    tags: [],
    workItemTypes: [],
    externalSystems: [],
  };
}

const scheduler: Scheduler = {
  supports: (engine) => engine === 'fast',
  read: (ask) => {
    if (ask.enabled && ask.engine === 'optimized')
      return { kind: 'engine_unavailable', error: 'engine_unavailable', engine: 'optimized' };
    const input = ask.input;
    return {
      kind: 'scheduled',
      optimization: null,
      fast: schedule(
        input.rows,
        input.edges,
        input.slices,
        input.notBefore,
        input.poolSizes,
        input.reach,
        input.deadlines,
        input.typed,
        undefined,
        input.elsewhere,
      ),
    };
  },
};

describe('readSharedPeople', () => {
  it('keeps the transitive Ana booking before B gives Ben to C', () => {
    const chain = readSharedPeople(
      [plan('A', ['ana']), plan('B', ['ana', 'ben']), plan('C', ['ben'])],
      'C',
      scheduler,
    );
    expect(chain.kind).toBe('scheduled');
    if (chain.kind !== 'scheduled') throw new Error('expected schedule');
    expect(chain.influencers.map((each) => each.projectId)).toEqual(['A', 'B']);
    expect(chain.scheduled.kind).toBe('scheduled');
    if (chain.scheduled.kind !== 'scheduled') throw new Error('expected target');
    expect(chain.scheduled.fast.slices.get(sliceKey('C', 's0'))?.earliestStart).toBe(3);
  });

  it('stops at an undated bridge and gives an undated target no bookings', () => {
    const chain = readSharedPeople(
      [plan('A', ['ana']), plan('B', ['ana', 'ben'], null), plan('C', ['ben'])],
      'C',
      scheduler,
    );
    expect(chain.kind).toBe('scheduled');
    if (chain.kind !== 'scheduled') throw new Error('expected schedule');
    expect(chain.influencers).toEqual([]);
    expect(chain.input.elsewhere?.size ?? 0).toBe(0);
    const undated = readSharedPeople(
      [plan('A', ['ana']), plan('U', ['ana'], null)],
      'U',
      scheduler,
    );
    expect(undated.kind).toBe('scheduled');
    if (undated.kind !== 'scheduled') throw new Error('expected schedule');
    expect(undated.influencers).toEqual([]);
    expect(undated.input.elsewhere?.size ?? 0).toBe(0);
  });

  it('keeps fractional bookings across different anchors and leaves touching time free', () => {
    const authored = plan('A', ['ana']);
    const fractional = {
      ...authored,
      estimates: authored.estimates.map((each) => ({
        ...each,
        optimistic: 1.5,
        realistic: 1.5,
        pessimistic: 1.5,
      })),
    };
    const shifted = readSharedPeople(
      [plan('unrelated', ['cy']), fractional, plan('B', ['ana'], '2026-10-06')],
      'B',
      scheduler,
    );
    if (shifted.kind !== 'scheduled' || shifted.scheduled.kind !== 'scheduled')
      throw new Error('expected shifted target');
    expect(shifted.influencers.map((each) => each.projectId)).toEqual(['A']);
    expect(shifted.input.elsewhere?.get('ana')).toEqual([
      { start: -1, end: 0.5, projectId: 'A', workItemId: 'A' },
    ]);
    expect(shifted.scheduled.fast.slices.get(sliceKey('B', 's0'))?.earliestStart).toBe(0.5);
    const touching = readSharedPeople(
      [plan('A', ['ana']), plan('B', ['ana'], '2026-10-06')],
      'B',
      scheduler,
    );
    if (touching.kind !== 'scheduled' || touching.scheduled.kind !== 'scheduled')
      throw new Error('expected touching target');
    expect(touching.scheduled.fast.slices.get(sliceKey('B', 's0'))?.earliestStart).toBe(0);
  });

  it('does not traverse from an earlier influencer down to unrelated later projects', () => {
    const chain = readSharedPeople(
      [
        plan('A', ['ana', 'ben']),
        plan('unrelated', ['ben']),
        plan('B', ['ana']),
        plan('target', ['ana']),
      ],
      'target',
      scheduler,
    );
    if (chain.kind !== 'scheduled') throw new Error('expected target');
    expect(chain.influencers.map((each) => each.projectId)).toEqual(['A', 'B']);
  });

  it('records cyclic and calendar-range influencers without supplying bookings', () => {
    const cyclic = {
      ...plan('A', ['ana']),
      dependencies: [{ predecessorId: 'A', successorId: 'A' }],
    };
    const ranged = {
      ...plan('A', ['ana'], '9999-12-31'),
      estimates: [
        {
          workItemId: 'A',
          stepId: 's0',
          optimistic: 80_000_000,
          realistic: 80_000_000,
          pessimistic: 80_000_000,
        },
      ],
    };
    for (const [first, reason] of [
      [cyclic, 'cycle'],
      [ranged, 'calendar_range'],
    ] as const) {
      const chain = readSharedPeople([first, plan('B', ['ana'])], 'B', scheduler);
      if (chain.kind !== 'scheduled' || chain.scheduled.kind !== 'scheduled')
        throw new Error('expected target');
      expect(chain.influencers).toEqual([
        { projectId: 'A', name: 'A', engine: 'fast', unavailable: reason },
      ]);
      expect(chain.input.elsewhere?.size ?? 0).toBe(0);
      expect(chain.scheduled.fast.slices.get(sliceKey('B', 's0'))?.earliestStart).toBe(0);
    }
  });

  for (const held of [false, true]) {
    it(`rejects an unassigned out-of-range influencer item with ${held ? 'no' : 'some'} assigned slices`, () => {
      const authored = plan('A', ['ana']);
      const assigned = authored.workItems.at(0);
      if (assigned === undefined) throw new Error('fixture has no work item');
      const ranged: PlanInputReads = {
        ...authored,
        workItems: [
          { ...assigned, hold: held ? 'on_hold' : null },
          { ...assigned, id: 'unassigned', name: 'unassigned', position: 20 },
        ],
        estimates: [
          ...authored.estimates,
          {
            workItemId: 'unassigned',
            stepId: 's0',
            optimistic: 80_000_000,
            realistic: 80_000_000,
            pessimistic: 80_000_000,
          },
        ],
      };
      let assignedSlices = -1;
      const chain = readSharedPeople([ranged, plan('B', ['ana'])], 'B', {
        ...scheduler,
        read: (ask) => {
          const scheduled = scheduler.read(ask);
          if (ask.projectId === 'A' && scheduled.kind === 'scheduled')
            assignedSlices = [...scheduled.fast.slices.values()].filter(
              (slice) => slice.personId !== null,
            ).length;
          return scheduled;
        },
      });
      if (chain.kind !== 'scheduled' || chain.scheduled.kind !== 'scheduled')
        throw new Error('expected target');
      expect(assignedSlices).toBe(held ? 0 : 1);
      expect(chain.influencers).toEqual([
        { projectId: 'A', name: 'A', engine: 'fast', unavailable: 'calendar_range' },
      ]);
      expect(chain.input.elsewhere?.size ?? 0).toBe(0);
      expect(chain.scheduled.fast.slices.get(sliceKey('B', 's0'))?.earliestStart).toBe(0);
    });
  }

  it('rejects an out-of-range target with no assigned slices', () => {
    const authored = plan('A', ['ana']);
    const ranged = {
      ...authored,
      assignments: [],
      estimates: authored.estimates.map((each) => ({
        ...each,
        optimistic: 80_000_000,
        realistic: 80_000_000,
        pessimistic: 80_000_000,
      })),
    };
    expect(readSharedPeople([ranged], 'A', scheduler)).toMatchObject({
      kind: 'unavailable',
      reason: 'calendar_range',
      influencers: [],
    });
  });

  it('refuses an optimized capability that returns no optimization state', () => {
    const authored = plan('A', ['ana']);
    const first = {
      ...authored,
      project: {
        ...authored.project,
        scheduleEngine: 'optimized' as const,
        optimizationEnabled: true,
      },
    };
    expect(() =>
      readSharedPeople([first, plan('B', ['ana'])], 'B', {
        supports: () => true,
        read: (ask) => scheduler.read({ ...ask, engine: 'fast', enabled: false }),
      }),
    ).toThrow('optimized chain returned no optimization state');
  });

  it('throws when the trusted rank list contains a missing project', () => {
    const broken = [plan('A', ['ana']), plan('B', ['ana'])];
    spyOn(broken, 'at').mockImplementation((index) =>
      index === 0 ? undefined : plan('B', ['ana']),
    );
    expect(() => selectInfluencers(broken, 'B')).toThrow('rank index has no captured project');
  });

  it('supplies no booking for an assigned slice holding no time', () => {
    const authored = plan('A', ['ana']);
    const empty = {
      ...authored,
      estimates: authored.estimates.map((each) => ({
        ...each,
        optimistic: 0,
        realistic: 0,
        pessimistic: 0,
      })),
    };
    const chain = readSharedPeople([empty, plan('B', ['ana'])], 'B', scheduler);
    if (chain.kind !== 'scheduled' || chain.scheduled.kind !== 'scheduled')
      throw new Error('expected target');
    expect(chain.input.elsewhere?.size ?? 0).toBe(0);
    expect(chain.scheduled.fast.slices.get(sliceKey('B', 's0'))?.earliestStart).toBe(0);
  });

  it('refuses a ready optimized variant whose schedule is missing', () => {
    const authored = plan('A', ['ana']);
    const first = {
      ...authored,
      project: {
        ...authored.project,
        scheduleEngine: 'optimized' as const,
        optimizationEnabled: true,
      },
    };
    expect(() =>
      readSharedPeople([first, plan('B', ['ana'])], 'B', {
        supports: () => true,
        read: (ask) => {
          const fast = scheduler.read({ ...ask, engine: 'fast', enabled: false });
          if (fast.kind !== 'scheduled') throw new Error('expected Fast fixture');
          return {
            ...fast,
            optimization: {
              inputHash: 'captured',
              generation: null,
              contractVersion: '15+0.2.0',
              budgetMs: 1000,
              variants: { pri: { state: 'ready', proof: 'proven' }, time: { state: 'idle' } },
              schedules: { pri: null, time: null },
            },
          };
        },
      }),
    ).toThrow('ready chain schedule is absent');
  });

  it('throws unexpected scheduling failures', () => {
    expect(() =>
      readSharedPeople([plan('A', ['ana']), plan('B', ['ana'])], 'B', {
        supports: () => true,
        read: () => {
          throw new Error('unexpected scheduler fault');
        },
      }),
    ).toThrow('unexpected scheduler fault');
  });

  it('refuses an unavailable required influencer by identity', () => {
    const first = plan('A', ['ana']);
    const chain = readSharedPeople(
      [
        {
          ...first,
          project: { ...first.project, scheduleEngine: 'optimized', optimizationEnabled: true },
        },
        plan('B', ['ana']),
      ],
      'B',
      scheduler,
    );
    expect(chain).toMatchObject({
      kind: 'engine_unavailable',
      error: 'engine_unavailable',
      engine: 'optimized',
      projectId: 'A',
      name: 'A',
    });
  });
});
