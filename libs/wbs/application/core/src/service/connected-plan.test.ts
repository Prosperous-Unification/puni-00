import type { CapturedWorkItem, IsoDate, PlanInputReads, Schedule } from '@wbs/domain';
import { canonicalConnectedStageInput, sliceKey } from '@wbs/domain';
import { scheduleResolved } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { deriveConnectedPlan } from './connected-plan';
import { resolveConnectedCalendar, translateConnectedCalendar } from './connected-plan-calendar';
import { restoreConnectedSchedule, selectConnectedWorkPackage } from './connected-plan-projection';
import type { ConnectedPlanCapture } from './connected-plan-values';
import { prepareCapturedScheduleParts } from './schedule-parts';

const work = (workPackageId: string, id: string): CapturedWorkItem => ({
  id,
  workPackageId,
  parentId: null,
  position: 0,
  name: id,
  notes: '',
  frozenNumber: null,
  startNoEarlierThan: null,
  startNoEarlierThanReason: null,
  deadline: null,
  readiness: null,
  hold: null,
  priority: null,
  serviceTeamId: null,
  serviceId: null,
  maxParallel: 1,
  revision: 1,
  teamIds: [],
  tagIds: [],
  serviceIds: [],
  typeIds: [],
  externalRefs: [],
});
const reads = (id: string, startDate: IsoDate | null = '2026-10-05'): PlanInputReads => ({
  workPackage: {
    id,
    name: id,
    projectId: 'captured-parent',
    restricted: false,
    estimateMethod: 'realistic',
    depReach: 'whole-item',
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'exact',
    startDate,
    scheduleEngine: 'fast',
    scheduleObjective: 'pri',
    optimizationEnabled: false,
    solutionRef: null,
    timezone: 'UTC',
    budgetFactor: 1,
  },
  steps: [
    {
      id: 'build',
      name: 'Build',
      code: null,
      position: 0,
      allowancePercent: 0,
      estimateUnit: 'workdays',
    },
  ],
  workItems: [work(id, id.toLowerCase())],
  estimates: [
    { workItemId: id.toLowerCase(), stepId: 'build', optimistic: 1, realistic: 1, pessimistic: 1 },
  ],
  actuals: [],
  progress: [],
  stepBlockages: [],
  stepParallels: [],
  measures: [],
  measureDefinitions: null,
  measureEstimates: [],
  budgets: [],
  dependencies: [],
  typedDependencies: [],
  assignments: [],
  capacity: new Map(),
  demands: [],
  resourceCapacities: [],
  resources: [],
  priorityBands: [],
  people: [],
  teams: [],
  services: [],
  tags: [],
  workItemTypes: [],
  externalSystems: [],
});
const capture = (a = reads('A'), b = reads('B')): ConnectedPlanCapture => ({
  kind: 'connected',
  organizationId: 'org',
  mode: 'isolated',
  workPackages: [
    { workPackageId: 'A', abbreviation: 'A', rank: 0, reads: a },
    { workPackageId: 'B', abbreviation: 'B', rank: 1, reads: b },
  ],
  relationships: [
    {
      id: 'ab',
      workPackageId: 'B',
      predecessor: { workPackageId: 'A', scope: 'whole', workItemId: 'a' },
      successor: { workPackageId: 'B', scope: 'whole', workItemId: 'b' },
      type: 'FS',
    },
  ],
});
const derive = (held: ConnectedPlanCapture, installed = false) =>
  deriveConnectedPlan(held, { supports: () => installed }, scheduleResolved);
const scheduled = (held: ConnectedPlanCapture) => {
  const projection = derive(held);
  if (projection.placement.kind !== 'scheduled') throw new Error(projection.placement.kind);
  return projection.placement;
};
const start = (plan: Schedule, id: string, step: string | null = 'build') => {
  const placed = plan.slices.get(sliceKey(id, step));
  if (placed === undefined) throw new Error(`missing slice ${id}`);
  return placed.earliestStart;
};

describe('connected detached Fast placement', () => {
  it('uses one real placement for A.design B.build A.test', () => {
    const a = reads('A');
    const held = capture({
      ...a,
      steps: ['design', 'test'].map((id, position) => ({ ...a.steps[0], id, position })),
      estimates: ['design', 'test'].map((stepId) => ({
        workItemId: 'a',
        stepId,
        optimistic: 1,
        realistic: 1,
        pessimistic: 1,
      })),
    });
    const first = held.relationships[0];
    const projection = scheduled({
      ...held,
      relationships: [
        {
          ...first,
          predecessor: { workPackageId: 'A', scope: 'node', workItemId: 'a', stepId: 'design' },
        },
        {
          id: 'ba',
          workPackageId: 'A',
          type: 'FS',
          predecessor: { workPackageId: 'B', scope: 'whole', workItemId: 'b' },
          successor: { workPackageId: 'A', scope: 'node', workItemId: 'a', stepId: 'test' },
        },
      ],
    });
    expect([
      start(projection.combined, 'a', 'design'),
      start(projection.combined, 'b'),
      start(projection.combined, 'a', 'test'),
    ]).toEqual([0, 1, 2]);
  });
  it('retains own Wednesday floor and work packages back to each own anchor', () => {
    const projection = scheduled(capture(reads('A'), reads('B', '2026-10-07')));
    expect(start(projection.combined, 'b')).toBe(2);
    expect(start(projection.byWorkPackage.get('B')!, 'b')).toBe(0);
    expect(projection.originOrdinal).not.toBeNull();
  });
  it('retains graph and capture when a required calendar is missing', () => {
    const held = capture(reads('A'), reads('B', null));
    const projection = derive(held);
    expect(projection.capture).toBe(held);
    expect(projection.authored.graph.edges).toHaveLength(1);
    expect(projection.placement).toEqual({
      kind: 'dependency_calendar_missing',
      workPackages: [{ workPackageId: 'B', abbreviation: 'B', name: 'B' }],
    });
  });
  it('inspects the nontarget required optimized member before calendar refusal', () => {
    const b = reads('B', null);
    const held = capture(reads('A'), {
      ...b,
      workPackage: { ...b.workPackage, optimizationEnabled: true, scheduleEngine: 'optimized' },
    });
    expect(derive(held).placement).toEqual({
      kind: 'engine_unavailable',
      engine: 'optimized',
      workPackages: ['B'],
      reason: 'adapter_missing',
    });
    expect(derive(held, true).placement).toEqual({
      kind: 'engine_unavailable',
      engine: 'optimized',
      workPackages: ['B'],
      reason: 'connected_optimization_not_supported',
    });
  });
  it('ignores stored optimized preference when disabled and allows real Fast comparison', () => {
    const b = reads('B');
    expect(
      scheduled(
        capture(reads('A'), {
          ...b,
          workPackage: { ...b.workPackage, scheduleEngine: 'optimized' },
        }),
      ).engine,
    ).toBe('fast');
    expect(
      scheduled(
        capture(reads('A'), { ...b, workPackage: { ...b.workPackage, optimizationEnabled: true } }),
      ).engine,
    ).toBe('fast');
  });
  it('retains authored held endpoints but schedules no held work and needs no empty anchor', () => {
    const held = (id: string) => {
      const local = reads(id, null);
      return {
        ...local,
        workItems: local.workItems.map((row) => ({ ...row, hold: 'on_hold' as const })),
      };
    };
    const projection = derive(capture(held('A'), held('B')));
    expect(projection.authored.graph.nodes).toHaveLength(2);
    expect(projection.placement.kind).toBe('scheduled');
    if (projection.placement.kind !== 'scheduled') throw new Error('missing empty schedule');
    expect(projection.placement.originOrdinal).toBeNull();
    expect(projection.placement.combined.slices.size).toBe(0);
  });
  it('selects either target without placement or calendar changes and refuses absent target', () => {
    const projection = derive(capture());
    expect(selectConnectedWorkPackage(projection, 'A').kind).toBe('scheduled');
    expect(selectConnectedWorkPackage(projection, 'B').kind).toBe('scheduled');
    expect(() => selectConnectedWorkPackage(projection, 'C')).toThrow('C');
  });
  it('allows a lower ranked remote prerequisite before a high priority successor', () => {
    const held = capture();
    const first = held.relationships[0];
    const projection = scheduled({
      ...held,
      relationships: [
        {
          ...first,
          workPackageId: 'A',
          predecessor: first.successor,
          successor: first.predecessor,
        },
      ],
    });
    expect(start(projection.combined, 'b')).toBe(0);
    expect(start(projection.combined, 'a')).toBe(1);
  });
  it('shares people only in shared mode and restores actual person identity and own waiting counts', () => {
    const assigned = (id: string) => ({
      ...reads(id),
      assignments: [{ workItemId: id.toLowerCase(), stepId: 'build', personId: 'same' }],
    });
    const held = { ...capture(assigned('A'), assigned('B')), relationships: [] };
    const shared = scheduled({ ...held, mode: 'shared' });
    const isolated = scheduled({ ...held, mode: 'isolated' });
    expect(start(shared.combined, 'b')).toBe(1);
    expect(start(isolated.combined, 'b')).toBe(0);
    expect(shared.byWorkPackage.get('A')!.waitingForPerson).toBe(0);
    expect(shared.byWorkPackage.get('B')!.waitingForPerson).toBe(1);
    expect(shared.byWorkPackage.get('B')!.slices.get(sliceKey('b', 'build'))!.personId).toBe(
      'same',
    );
    expect(shared.identities.workPackageIdByWorkItem.get('a')).toBe('A');
  });
  it('uses own rounding, units, allowance, team capacity and width before injective namespacing', () => {
    const a = reads('A');
    const b = reads('B');
    const sized = (local: PlanInputReads, units: number) => ({
      ...local,
      workItems: local.workItems.map((row) => ({ ...row, teamIds: ['same'], maxParallel: 4 })),
      capacity: new Map([['same', units]]),
      estimates: local.estimates.map((estimate) => ({
        ...estimate,
        optimistic: 2.1,
        realistic: 2.1,
        pessimistic: 2.1,
      })),
    });
    const projection = scheduled({
      ...capture(
        { ...sized(a, 1), workPackage: { ...a.workPackage, estimateRounding: 'ceil' } },
        sized(b, 2),
      ),
      relationships: [],
    });
    expect(projection.combined.slices.get(sliceKey('a', 'build'))!.duration).toBe(3);
    expect(projection.combined.slices.get(sliceKey('b', 'build'))!.duration).toBe(1.05);
    expect(start(projection.combined, 'a')).toBe(0);
    expect(start(projection.combined, 'b')).toBe(0);
  });
  it('keeps identical resource catalog IDs work package local and restores binding identities', () => {
    const demanding = (id: string, units: number) => {
      const local = reads(id);
      const ownId = id.toLowerCase();
      return {
        ...local,
        workItems: [work(id, ownId), { ...work(id, ownId + '2'), position: 1 }],
        estimates: [ownId, ownId + '2'].map((workItemId) => ({
          workItemId,
          stepId: 'build',
          optimistic: 1,
          realistic: 1,
          pessimistic: 1,
        })),
        demands: [ownId, ownId + '2'].map((workItemId) => ({
          workItemId,
          resourceId: 'same',
          units: 1,
        })),
        resourceCapacities: [{ resourceId: 'same', units }],
      };
    };
    const projection = scheduled({
      ...capture(demanding('A', 1), demanding('B', 2)),
      relationships: [],
    });
    expect(start(projection.combined, 'a2')).toBe(1);
    expect(start(projection.combined, 'b2')).toBe(0);
    expect(
      projection.combined.slices.get(sliceKey('a2', 'build'))!.capacityResource?.resourceId,
    ).toBe('same');
    expect(projection.byWorkPackage.get('A')!.waitingForCapacity).toBe(1);
    expect(projection.byWorkPackage.get('B')!.waitingForCapacity).toBe(0);
  });
  it('retains fractional effort and translates a weekend manual floor and deadline under own anchor', () => {
    const a = reads('A');
    const b = reads('B', '2026-10-07');
    const projection = scheduled(
      capture(
        {
          ...a,
          estimates: a.estimates.map((estimate) => ({
            ...estimate,
            optimistic: 0.25,
            realistic: 0.25,
            pessimistic: 0.25,
          })),
        },
        {
          ...b,
          workItems: b.workItems.map((row) => ({
            ...row,
            startNoEarlierThan: '2026-10-10' as const,
            deadline: '2026-10-11' as const,
          })),
        },
      ),
    );
    expect(projection.combined.slices.get(sliceKey('a', 'build'))!.duration).toBe(0.25);
    expect(start(projection.combined, 'b')).toBe(5);
    expect(start(projection.byWorkPackage.get('B')!, 'b')).toBe(3);
    expect(projection.byWorkPackage.get('B')!.slices.get(sliceKey('b', 'build'))!.lateBy).toBe(1);
  });
  it('uses the earliest anchor independent of work package rank and capture order', () => {
    const held = capture(reads('A', '2026-10-07'), reads('B'));
    const forward = scheduled(held);
    const reversed = scheduled({ ...held, workPackages: [...held.workPackages].reverse() });
    expect(start(forward.combined, 'a')).toBe(2);
    expect(start(forward.combined, 'b')).toBe(3);
    expect([...forward.combined.slices]).toEqual([...reversed.combined.slices]);
    expect(start(forward.byWorkPackage.get('B')!, 'b')).toBe(3);
  });
  it('reduces partial held parent selectors without losing authored pairs', () => {
    const a = reads('A');
    const projection = derive(
      capture({
        ...a,
        workItems: [
          work('A', 'parent'),
          { ...work('A', 'a'), parentId: 'parent' },
          { ...work('A', 'held'), parentId: 'parent', position: 1, hold: 'on_hold' },
        ],
        estimates: [
          ...a.estimates,
          { workItemId: 'held', stepId: 'build', optimistic: 8, realistic: 8, pessimistic: 8 },
        ],
      }),
    );
    expect(projection.placement.kind).toBe('scheduled');
    if (projection.placement.kind !== 'scheduled') throw new Error('missing placement');
    expect(projection.placement.combined.workItems.has('held')).toBe(false);
    expect(start(projection.placement.combined, 'b')).toBe(1);
  });
  it('keeps unknown, zero and stepless nodes as real zero duration boundaries', () => {
    const a = reads('A');
    const b = reads('B');
    const projection = scheduled(
      capture({ ...a, estimates: [] }, { ...b, steps: [], estimates: [] }),
    );
    expect(projection.combined.slices.get(sliceKey('a', 'build'))!.estimated).toBe(false);
    expect(start(projection.combined, 'b', null)).toBe(0);
    expect(
      scheduled(
        capture({
          ...a,
          estimates: a.estimates.map((estimate) => ({
            ...estimate,
            optimistic: 0,
            realistic: 0,
            pessimistic: 0,
          })),
        }),
      ).combined.slices.get(sliceKey('a', 'build'))!.estimated,
    ).toBe(true);
  });
  it('requires an active shared-person peer anchor even without its external endpoint', () => {
    const held = capture(reads('A'), reads('B', null));
    expect(derive({ ...held, mode: 'shared', relationships: [] }).placement.kind).toBe(
      'dependency_calendar_missing',
    );
  });
  it('refuses wrong relationship ownership and mismatched local captured evidence', () => {
    const held = capture();
    expect(() =>
      derive({ ...held, relationships: [{ ...held.relationships[0], workPackageId: 'A' }] }),
    ).toThrow('owner');
    const a = reads('A');
    expect(() =>
      derive(
        capture({
          ...a,
          typedDependencies: [
            {
              id: 'local',
              type: 'FS',
              predecessor: { scope: 'whole', workItemId: 'a' },
              successor: { scope: 'whole', workItemId: 'a' },
            },
          ],
        }),
      ),
    ).toThrow('disagree');
  });
  it('refuses foreign work package rows, absent endpoint work package and cross owned endpoint identity', () => {
    const a = reads('A');
    const held = capture();
    expect(() => derive(capture({ ...a, workItems: [work('B', 'a')] }))).toThrow('foreign');
    expect(() =>
      derive({
        ...held,
        relationships: [
          {
            ...held.relationships[0],
            predecessor: { workPackageId: 'C', scope: 'whole', workItemId: 'a' },
          },
        ],
      }),
    ).toThrow('uncaptured');
    expect(() =>
      derive({
        ...held,
        relationships: [
          {
            ...held.relationships[0],
            predecessor: { workPackageId: 'B', scope: 'whole', workItemId: 'a' },
            successor: { workPackageId: 'A', scope: 'whole', workItemId: 'a' },
            workPackageId: 'A',
          },
        ],
      }),
    ).toThrow('no work item');
  });

  it('applies each work package minute conversion, estimate method and allowance exactly once', () => {
    const a = reads('A');
    const b = reads('B');
    const placed = scheduled({
      ...capture(
        {
          ...a,
          workPackage: { ...a.workPackage, estimateMethod: 'pert' },
          steps: a.steps.map((step) => ({
            ...step,
            estimateUnit: 'minutes',
            allowancePercent: 100,
          })),
          estimates: [
            { workItemId: 'a', stepId: 'build', optimistic: 60, realistic: 120, pessimistic: 180 },
          ],
        },
        {
          ...b,
          workPackage: { ...b.workPackage, estimateMethod: 'pessimistic' },
          estimates: [
            { workItemId: 'b', stepId: 'build', optimistic: 1, realistic: 2, pessimistic: 3 },
          ],
        },
      ),
      relationships: [],
    });
    expect(placed.combined.slices.get(sliceKey('a', 'build'))!.effort).toBe(0.5);
    expect(placed.combined.slices.get(sliceKey('b', 'build'))!.effort).toBe(3);
  });
  it('preserves signed fractional numeric calendar constraints without date round trips', () => {
    const input = prepareCapturedScheduleParts(reads('A')).input;
    const translated = translateConnectedCalendar(
      {
        ...input,
        notBefore: new Map([
          ['a', 0.25],
          ['parent', -1.75],
        ]),
        deadlines: new Map([['a', 2.75]]),
      },
      2,
    );
    expect([...translated.notBefore]).toEqual([
      ['a', 2.25],
      ['parent', 0.25],
    ]);
    expect([...translated.deadlines]).toEqual([['a', 4.75]]);
  });
  it('refuses corrupted work package identity and nonfinite rank, and throws unknown scheduling failures', () => {
    const held = capture();
    expect(() =>
      derive({
        ...held,
        workPackages: [{ ...held.workPackages[0], rank: NaN }, held.workPackages[1]],
      }),
    ).toThrow('invalid');
    const a = reads('A');
    expect(() => derive(capture({ ...a, workPackage: { ...a.workPackage, id: 'wrong' } }))).toThrow(
      'invalid',
    );
    expect(() =>
      deriveConnectedPlan(held, { supports: () => false }, () => {
        throw new Error('unexpected trusted failure');
      }),
    ).toThrow('unexpected trusted failure');
  });
  it('models real node cycles without hiding graph evidence', () => {
    const held = capture();
    const relationship = held.relationships[0];
    const projection = derive({
      ...held,
      relationships: [
        ...held.relationships,
        {
          ...relationship,
          id: 'reverse',
          workPackageId: 'A',
          predecessor: relationship.successor,
          successor: relationship.predecessor,
        },
      ],
    });
    expect(projection.placement).toEqual({ kind: 'unavailable', reason: 'cycle' });
    expect(projection.authored.graph.edges).toHaveLength(2);
  });
  it('expands partly held parent relationships to surviving leaves only', () => {
    const a = reads('A');
    const held = capture({
      ...a,
      workItems: [
        work('A', 'parent'),
        { ...work('A', 'a'), parentId: 'parent' },
        { ...work('A', 'held'), parentId: 'parent', position: 1, hold: 'on_hold' },
      ],
      estimates: [
        ...a.estimates,
        { workItemId: 'held', stepId: 'build', optimistic: 8, realistic: 8, pessimistic: 8 },
      ],
    });
    const projection = derive({
      ...held,
      relationships: [
        {
          ...held.relationships[0],
          predecessor: { workPackageId: 'A', scope: 'whole', workItemId: 'parent' },
        },
      ],
    });
    expect(projection.authored.graph.edges).toHaveLength(2);
    if (projection.placement.kind !== 'scheduled') throw new Error('missing placement');
    expect(start(projection.placement.combined, 'b')).toBe(1);
    expect(projection.placement.combined.workItems.has('held')).toBe(false);
  });
  it('keeps own steps and local reach before resolving remote FS SS FF selectors', () => {
    const a = reads('A');
    const b = reads('B');
    const held = capture(
      {
        ...a,
        workItems: [work('A', 'a'), { ...work('A', 'a2'), position: 1, priority: 100 }],
        dependencies: [{ predecessorId: 'a', successorId: 'a2' }],
        estimates: [
          ...a.estimates,
          { workItemId: 'a2', stepId: 'build', optimistic: 2, realistic: 2, pessimistic: 2 },
        ],
      },
      b,
    );
    const plan = scheduled(held);
    expect(start(plan.combined, 'a2')).toBe(1);
    expect(start(plan.combined, 'b')).toBe(1);
    for (const type of ['SS', 'FF'] as const) {
      const placed = scheduled({
        ...capture(),
        relationships: [{ ...capture().relationships[0], type }],
      });
      expect(start(placed.combined, 'b')).toBe(0);
    }
  });
  it('validates rank before an engine refusal and target membership before any unavailable return', () => {
    const b = reads('B');
    const held = capture(reads('A'), {
      ...b,
      workPackage: { ...b.workPackage, optimizationEnabled: true, scheduleEngine: 'optimized' },
    });
    expect(() =>
      derive({
        ...held,
        workPackages: [{ ...held.workPackages[0], rank: NaN }, held.workPackages[1]],
      }),
    ).toThrow('invalid captured work package A');
    const projection = derive(held);
    expect(() => selectConnectedWorkPackage(projection, 'C')).toThrow(
      'work package C is not captured',
    );
  });

  it('resolves every work package local dependency under its own reach and step order', () => {
    const local = (id: string, depReach: 'whole-item' | 'anchor-slice') => {
      const source = reads(id);
      const ownId = id.toLowerCase();
      return {
        ...source,
        workPackage: { ...source.workPackage, depReach },
        steps: ['build', 'test'].map((stepId, position) => ({
          ...source.steps[0],
          id: stepId,
          position,
        })),
        workItems: [work(id, ownId), { ...work(id, ownId + '2'), position: 1 }],
        estimates: [ownId, ownId + '2'].flatMap((workItemId) =>
          ['build', 'test'].map((stepId) => ({
            workItemId,
            stepId,
            optimistic: 1,
            realistic: 1,
            pessimistic: 1,
          })),
        ),
        dependencies: [{ predecessorId: ownId, successorId: ownId + '2' }],
      };
    };
    const projection = scheduled({
      ...capture(local('A', 'whole-item'), local('B', 'anchor-slice')),
      relationships: [],
    });
    expect(start(projection.combined, 'a2')).toBe(2);
    expect(start(projection.combined, 'b2')).toBe(1);
    expect(start(projection.combined, 'b2', 'test')).toBe(2);
  });

  it('refuses absent prepared calendars and broken reverse identities on real placements', () => {
    const held = capture();
    expect(() => resolveConnectedCalendar(held, new Map())).toThrow(
      'missing prepared work package A',
    );
    const assigned = (id: string) => ({
      ...reads(id),
      assignments: [{ workItemId: id.toLowerCase(), stepId: 'build', personId: 'same' }],
    });
    const placement = scheduled({ ...capture(assigned('A'), assigned('B')), mode: 'shared' });
    expect(() =>
      restoreConnectedSchedule(placement.combined, {
        ...placement.identities,
        personByKey: new Map(),
      }),
    ).toThrow('missing reverse identity same');
  });
});

it.each(['A', 'B'])(
  'selects actual mixed-engine stages before projection and keeps earlier boundaries detached: %s',
  (selectedWorkPackage) => {
    const a = reads('A');
    const b = reads('B');
    const held = {
      ...capture(
        {
          ...a,
          workPackage: {
            ...a.workPackage,
            optimizationEnabled: true,
            scheduleEngine: selectedWorkPackage === 'A' ? 'optimized' : 'fast',
            scheduleObjective: 'time' as const,
          },
        },
        {
          ...b,
          workPackage: {
            ...b.workPackage,
            optimizationEnabled: true,
            scheduleEngine: selectedWorkPackage === 'B' ? 'optimized' : 'fast',
            scheduleObjective: 'time' as const,
          },
        },
      ),
      relationships: [],
    };
    const seen: string[] = [];
    const deriveSelected = () =>
      deriveConnectedPlan(
        held,
        { supports: () => false },
        (input) =>
          scheduleResolved(
            input,
            new Map([
              [sliceKey('a', 'build'), 3],
              [sliceKey('b', 'build'), 4],
            ]),
          ),
        {
          readConnectedCaptured: ({ stage }) => {
            seen.push(stage.workPackageId);
            const question = {
              workPackageId: stage.workPackageId,
              inputHash: stage.workPackageId,
              questionHash: stage.workPackageId,
              objective: 'time' as const,
              contractVersion: 'test',
              budgetMs: 100,
              quantum: 48,
              wireVersion: 5,
              stageBytes: canonicalConnectedStageInput(stage),
            };
            return {
              inputHash: stage.workPackageId,
              generation: 1,
              contractVersion: 'test',
              budgetMs: 100,
              quantum: 48,
              wireVersion: 5,
              variants: { pri: { state: 'idle' }, time: { state: 'ready', proof: 'proven' } },
              candidates: {
                pri: null,
                time: {
                  question,
                  starts: new Map([[sliceKey(stage.workPackageId.toLowerCase(), 'build'), 0]]),
                },
              },
            };
          },
        },
      );
    const projection = deriveSelected();
    expect(projection.placement.kind).toBe('scheduled');
    if (projection.placement.kind !== 'scheduled') throw Error('expected scheduled');
    expect(seen).toEqual(['A', 'B']);
    expect(start(projection.placement.combined, 'a')).toBe(selectedWorkPackage === 'A' ? 0 : 3);
    expect(start(projection.placement.combined, 'b')).toBe(selectedWorkPackage === 'B' ? 0 : 4);
    expect(start(projection.placement.baseline, 'a')).toBe(3);
    expect(projection.placement.stages[0]?.stage.starts.get(sliceKey('b', 'build'))).toBe(4);
    expect(projection.placement.stages[1]?.stage.starts.get(sliceKey('a', 'build'))).toBe(
      selectedWorkPackage === 'A' ? 0 : 3,
    );
    expect(projection.placement.stages[1]?.optimization?.variants.time.state).toBe('ready');
    const again = deriveSelected();
    if (again.placement.kind !== 'scheduled') throw Error('expected scheduled');
    expect(
      again.placement.stages.map((selection) => canonicalConnectedStageInput(selection.stage)),
    ).toEqual(
      projection.placement.stages.map((selection) => canonicalConnectedStageInput(selection.stage)),
    );
  },
);

it('ranks real stages by ID ties, observes enabled Fast, skips disabled and empty members', () => {
  const a = reads('A');
  const b = reads('B');
  const c = reads('C');
  const d = reads('D');
  const held: ConnectedPlanCapture = {
    ...capture(),
    relationships: [],
    workPackages: [
      {
        workPackageId: 'D',
        abbreviation: 'D',
        rank: 0,
        reads: {
          ...d,
          estimates: [],
          steps: [],
          workItems: [],
          workPackage: { ...d.workPackage, optimizationEnabled: true, scheduleEngine: 'optimized' },
        },
      },
      { workPackageId: 'C', abbreviation: 'C', rank: 0, reads: c },
      {
        workPackageId: 'B',
        abbreviation: 'B',
        rank: 0,
        reads: { ...b, workPackage: { ...b.workPackage, optimizationEnabled: true } },
      },
      {
        workPackageId: 'A',
        abbreviation: 'A',
        rank: 0,
        reads: { ...a, workPackage: { ...a.workPackage, optimizationEnabled: true } },
      },
    ],
  };
  const seen: string[] = [];
  const projection = deriveConnectedPlan(held, { supports: () => false }, scheduleResolved, {
    readConnectedCaptured: ({ stage }) => {
      seen.push(stage.workPackageId);
      return {
        inputHash: 'idle',
        generation: null,
        contractVersion: 'test',
        budgetMs: 100,
        quantum: 48,
        wireVersion: 5,
        variants: { pri: { state: 'idle' }, time: { state: 'pending' } },
        candidates: { pri: null, time: null },
      };
    },
  });
  if (projection.placement.kind !== 'scheduled') throw Error('expected scheduled');
  expect(seen).toEqual(['A', 'B']);
  expect(projection.placement.stages.map((selection) => selection.stage.workPackageId)).toEqual([
    'A',
    'B',
    'C',
  ]);
  expect(projection.placement.idleWorkPackages).toEqual(['D']);
  expect(projection.placement.stages[0]?.optimization?.variants.time.state).toBe('pending');
  expect(projection.placement.stages[2]?.optimization).toBeNull();
});
