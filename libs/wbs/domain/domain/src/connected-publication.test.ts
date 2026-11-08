import { describe, expect, test } from 'bun:test';

import type { ScheduleInput } from './canonical-schedule-input';
import type { ConnectedOptimizationStage } from './connected-optimization-input';
import {
  ConnectedStageEvidenceError,
  guardConnectedPublication,
  replayConnectedStage,
} from './connected-publication';
import { resolveScheduleInput } from './resolved-schedule-input';
import {
  ScheduleInvalidOptimizedStartError,
  scheduleResolved,
  type Slice,
  sliceKey,
} from './schedule';
import type { RelationshipType, ScopedTypedDependency } from './typed-dependency';

const localKey = sliceKey('b', null);
const foreignKey = sliceKey('a', null);
const trailingKey = sliceKey('c', null);

function capturedStage(
  effort = 1,
  options: { person?: string | null; floor?: number; deadline?: number } = {},
): ConnectedOptimizationStage {
  const rows: ScheduleInput['rows'] = ['a', 'b', 'c'].map((id, position) => ({
    id,
    parentId: null,
    position,
    priority: id === 'b' ? 1 : null,
    frozenNumber: null,
  }));
  const slices: Slice[] = [
    { workItemId: 'a', stepId: null, days: 0.2, width: 1, personId: null, poolIds: [] },
    {
      workItemId: 'b',
      stepId: null,
      days: effort,
      width: 1,
      personId: options.person ?? null,
      poolIds: [],
    },
    { workItemId: 'c', stepId: null, days: 1, width: 1, personId: null, poolIds: [] },
  ];
  const input = resolveScheduleInput({
    rows,
    slices,
    edges: [
      { predecessorId: 'a', successorId: 'b' },
      { predecessorId: 'b', successorId: 'c' },
    ],
    notBefore: options.floor === undefined ? new Map() : new Map([['b', options.floor]]),
    deadlines: options.deadline === undefined ? new Map() : new Map([['b', options.deadline]]),
    poolSizes: new Map(),
    reach: 'whole-item',
    typed: [],
  });
  const connected = {
    ...input,
    order: {
      kind: 'connected' as const,
      projectIdByWorkItem: new Map([
        ['a', 'A'],
        ['b', 'B'],
        ['c', 'C'],
      ]),
      rankByProject: new Map([
        ['A', 0],
        ['B', 1],
        ['C', 2],
      ]),
    },
  };
  const plan = scheduleResolved(connected);
  return {
    kind: 'connected-stage',
    projectId: 'B',
    mode: 'shared',
    originOrdinal: 20000,
    projects: [
      { projectId: 'A', rank: 0, anchorOrdinal: 20000 },
      { projectId: 'B', rank: 1, anchorOrdinal: 20000 },
      { projectId: 'C', rank: 2, anchorOrdinal: 20000 },
    ],
    input: connected,
    relationships: [],
    starts: new Map([...plan.slices].map(([key, placed]) => [key, placed.earliestStart])),
    finishes: new Map([...plan.slices].map(([key, placed]) => [key, placed.earliestFinish])),
  };
}

const reference = (start = 0) => new Map([[localKey, start]]);

function capturePlacement(stage: ConnectedOptimizationStage): ConnectedOptimizationStage {
  const plan = scheduleResolved(stage.input);
  return {
    ...stage,
    starts: new Map([...plan.slices].map(([key, placed]) => [key, placed.earliestStart])),
    finishes: new Map([...plan.slices].map(([key, placed]) => [key, placed.earliestFinish])),
  };
}

function weightedStage(type: RelationshipType): ConnectedOptimizationStage {
  const initial = capturedStage();
  const slices: Slice[] = ['a', 'b', 'c'].flatMap((workItemId) => [
    { workItemId, stepId: 'first', days: 0, width: 1, personId: null, poolIds: [] },
    {
      workItemId,
      stepId: 'second',
      days: workItemId === 'a' ? 3 : 1,
      width: 1,
      personId: null,
      poolIds: [],
    },
  ]);
  const resolved = resolveScheduleInput({
    rows: initial.input.rows,
    slices,
    edges: [],
    notBefore: new Map([['a', 1]]),
    deadlines: new Map(),
    poolSizes: new Map(),
    reach: 'whole-item',
    typed: [],
  });
  const links: ScopedTypedDependency[] = [
    {
      id: 'incoming',
      type,
      predecessor: { scope: 'node', projectId: 'A', workItemId: 'a', stepId: 'second' },
      successor: { scope: 'node', projectId: 'B', workItemId: 'b', stepId: 'second' },
    },
    {
      id: 'outgoing',
      type,
      predecessor: { scope: 'node', projectId: 'B', workItemId: 'b', stepId: 'second' },
      successor: { scope: 'node', projectId: 'C', workItemId: 'c', stepId: 'second' },
    },
  ];
  const edges = [
    ...resolved.graph.edges,
    ...links.map((link) => ({
      predecessor: { leafId: link.predecessor.workItemId, at: 1 },
      successor: { leafId: link.successor.workItemId, at: 1 },
      type,
      provenance: 'authored' as const,
      relationshipId: link.id,
    })),
  ];
  return capturePlacement({
    ...initial,
    input: { ...resolved, graph: { ...resolved.graph, edges }, order: initial.input.order },
    relationships: links,
  });
}

describe('connected publication guard', () => {
  test.each(['FS', 'SS', 'FF'] as const)(
    'replays incoming and outgoing %s through later-step endpoints',
    (type) => {
      const stage = weightedStage(type);
      const first = sliceKey('b', 'first');
      const second = sliceKey('b', 'second');
      const starts = new Map([
        [first, stage.starts.get(first) ?? NaN],
        [second, stage.starts.get(second) ?? NaN],
      ]);
      const accepted = guardConnectedPublication(stage, starts, 'makespan', starts);
      expect(accepted.schedule.slices.size).toBe(6);
      expect(accepted.schedule.slices.get(second)?.earliestStart).toBe(stage.starts.get(second));
      const early = new Map(starts);
      early.set(second, 0.1);
      expect(() => guardConnectedPublication(stage, early, 'makespan', starts)).toThrow(
        ScheduleInvalidOptimizedStartError,
      );
      const late = new Map(starts);
      late.set(second, (stage.starts.get(second) ?? 0) + 2);
      expect(() => guardConnectedPublication(stage, late, 'makespan', starts)).toThrow(
        ScheduleInvalidOptimizedStartError,
      );
    },
  );
  test('enforces every supplied expanded parent relationship pair', () => {
    const initial = capturedStage();
    const rows: ScheduleInput['rows'] = [
      { id: 'pa', parentId: null, position: 0, priority: null, frozenNumber: null },
      { id: 'a1', parentId: 'pa', position: 0, priority: null, frozenNumber: null },
      { id: 'a2', parentId: 'pa', position: 1, priority: null, frozenNumber: null },
      { id: 'pb', parentId: null, position: 1, priority: null, frozenNumber: null },
      { id: 'b1', parentId: 'pb', position: 0, priority: null, frozenNumber: null },
      { id: 'b2', parentId: 'pb', position: 1, priority: null, frozenNumber: null },
    ];
    const slices: Slice[] = ['a1', 'a2', 'b1', 'b2'].map((workItemId) => ({
      workItemId,
      stepId: null,
      days: workItemId === 'a2' ? 2 : 1,
      width: 1,
      personId: null,
      poolIds: [],
    }));
    const input = resolveScheduleInput({
      rows,
      slices,
      edges: [],
      notBefore: new Map(),
      deadlines: new Map(),
      poolSizes: new Map(),
      reach: 'whole-item',
      typed: [
        {
          id: 'expanded',
          type: 'FS',
          predecessor: { scope: 'whole', workItemId: 'pa' },
          successor: { scope: 'whole', workItemId: 'pb' },
        },
      ],
    });
    const stage = capturePlacement({
      ...initial,
      projectId: 'B',
      projects: initial.projects.filter((project) => project.projectId !== 'C'),
      input: {
        ...input,
        order: {
          kind: 'connected',
          projectIdByWorkItem: new Map(
            rows.map((row) => [row.id, row.id.startsWith('a') || row.id === 'pa' ? 'A' : 'B']),
          ),
          rankByProject: new Map([
            ['A', 0],
            ['B', 1],
          ]),
        },
      },
      relationships: [
        {
          id: 'expanded',
          type: 'FS',
          predecessor: { scope: 'whole', projectId: 'A', workItemId: 'pa' },
          successor: { scope: 'whole', projectId: 'B', workItemId: 'pb' },
        },
      ],
    });
    expect(stage.input.graph.edges.filter((edge) => edge.provenance === 'authored')).toHaveLength(
      4,
    );
    const b1 = sliceKey('b1', null);
    const b2 = sliceKey('b2', null);
    expect(stage.starts.get(b1)).toBe(2);
    const reference = new Map([
      [b1, 2],
      [b2, 2],
    ]);
    expect(guardConnectedPublication(stage, reference, 'makespan', reference).chosen).toBe(
      'optimized',
    );
    expect(() =>
      guardConnectedPublication(
        stage,
        new Map([
          [b1, 1],
          [b2, 2],
        ]),
        'makespan',
        reference,
      ),
    ).toThrow(ScheduleInvalidOptimizedStartError);
  });
  test.each(['person', 'team', 'resource', 'elsewhere'] as const)(
    'replays %s contention and rejects a conflicting local pin',
    (constraint) => {
      const initial = capturedStage();
      const slices = initial.input.slices.map((slice) => {
        if (slice.workItemId === 'c') return slice;
        if (constraint === 'person') return { ...slice, personId: 'shared' };
        if (constraint === 'team') return { ...slice, poolIds: ['team'] };
        if (constraint === 'resource') {
          return { ...slice, demands: [{ resourceId: 'machine', units: 1 }] };
        }
        return slice.workItemId === 'b' ? { ...slice, personId: 'booked' } : slice;
      });
      const stage = capturePlacement({
        ...initial,
        input: {
          ...initial.input,
          slices,
          graph: { ...initial.input.graph, edges: [] },
          poolSizes: constraint === 'team' ? new Map([['team', 1]]) : new Map(),
          resourceCapacities: constraint === 'resource' ? new Map([['machine', 1]]) : new Map(),
          elsewhere:
            constraint === 'elsewhere'
              ? new Map([
                  ['booked', [{ start: 0, end: 1, projectId: 'outside', workItemId: 'held' }]],
                ])
              : new Map(),
        },
      });
      expect(stage.starts.get(localKey)).toBe(constraint === 'elsewhere' ? 1 : 0.2);
      expect(replayConnectedStage(stage).slices.get(localKey)?.earliestStart).toBe(
        stage.starts.get(localKey),
      );
      expect(() => guardConnectedPublication(stage, reference(0), 'makespan', reference())).toThrow(
        ScheduleInvalidOptimizedStartError,
      );
    },
  );

  test('keeps isolated encoded people independent', () => {
    const initial = capturedStage();
    const slices = initial.input.slices.map((slice) =>
      slice.workItemId === 'a'
        ? { ...slice, personId: 'A:person' }
        : slice.workItemId === 'b'
          ? { ...slice, personId: 'B:person' }
          : slice,
    );
    const stage = capturePlacement({
      ...initial,
      mode: 'isolated',
      input: { ...initial.input, slices, graph: { ...initial.input.graph, edges: [] } },
    });
    expect(stage.starts.get(localKey)).toBe(0);
    expect(guardConnectedPublication(stage, reference(0), 'makespan', reference()).chosen).toBe(
      'optimized',
    );
  });
  test.each(['team', 'resource'] as const)(
    'enforces project-local %s contention in a complete replay',
    (constraint) => {
      const initial = capturedStage();
      const order = initial.input.order;
      if (order.kind !== 'connected') throw new Error('fixture requires connected order');
      const slices = initial.input.slices.map((slice) =>
        slice.workItemId === 'a'
          ? slice
          : constraint === 'team'
            ? { ...slice, poolIds: ['local-team'] }
            : { ...slice, demands: [{ resourceId: 'local-machine', units: 1 }] },
      );
      const stage = capturePlacement({
        ...initial,
        projects: initial.projects.filter((project) => project.projectId !== 'C'),
        input: {
          ...initial.input,
          slices,
          graph: { ...initial.input.graph, edges: [] },
          poolSizes: constraint === 'team' ? new Map([['local-team', 1]]) : new Map(),
          resourceCapacities:
            constraint === 'resource' ? new Map([['local-machine', 1]]) : new Map(),
          order: {
            ...order,
            projectIdByWorkItem: new Map([
              ['a', 'A'],
              ['b', 'B'],
              ['c', 'B'],
            ]),
            rankByProject: new Map([
              ['A', 0],
              ['B', 1],
            ]),
          },
        },
      });
      const starts = new Map([
        [localKey, stage.starts.get(localKey) ?? NaN],
        [trailingKey, stage.starts.get(trailingKey) ?? NaN],
      ]);
      expect(stage.starts.get(trailingKey)).toBe(1);
      expect(replayConnectedStage(stage).slices.get(trailingKey)?.earliestStart).toBe(1);
      expect(() =>
        guardConnectedPublication(
          stage,
          new Map([
            [localKey, 0],
            [trailingKey, 0],
          ]),
          'makespan',
          starts,
        ),
      ).toThrow(ScheduleInvalidOptimizedStartError);
    },
  );
  test('replays exact fractional A → B → C baseline and publishes complete local candidate', () => {
    // A Q48 request may classify this fractional boundary as infeasible;
    // real replay alone makes no integer solver-feasibility claim.
    const stage = capturedStage();
    expect(stage.finishes.get(foreignKey)).toBe(0.2);
    expect(stage.starts.get(localKey)).toBe(0.2);
    expect(stage.starts.get(trailingKey)).toBe(1.2);
    const baseline = replayConnectedStage(stage);
    expect(baseline.slices.get(trailingKey)?.earliestStart).toBe(1.2);
    const decision = guardConnectedPublication(stage, reference(0.2), 'makespan', reference(0));
    expect(decision.scope).toEqual({ kind: 'connected-stage', projectId: 'B' });
    expect(decision.chosen).toBe('optimized');
    expect(decision.schedule.slices.size).toBe(3);
    expect(decision.values.makespan).toBe(1.2);
    expect(decision.values.movement).toBe(0.2);
    expect(decision.schedule.slices.get(foreignKey)?.earliestFinish).toBe(0.2);
    expect(decision.schedule.slices.get(trailingKey)?.earliestStart).toBe(1.2);
  });

  test('uses an earlier accepted replacement as the later rank stage baseline', () => {
    const original = capturedStage();
    const firstPins = new Map(original.starts);
    firstPins.set(localKey, 1);
    firstPins.set(trailingKey, 2.5);
    const firstPlan = scheduleResolved(original.input, firstPins);
    const firstStage = {
      ...original,
      starts: firstPins,
      finishes: new Map([...firstPlan.slices].map(([key, placed]) => [key, placed.earliestFinish])),
    };
    const firstChoice = guardConnectedPublication(
      firstStage,
      reference(0.2),
      'makespan',
      reference(1),
    );
    expect(firstChoice.chosen).toBe('optimized');
    expect(firstChoice.schedule.slices.get(localKey)?.earliestStart).toBe(0.2);
    const secondStage = {
      ...firstStage,
      projectId: 'C',
      starts: new Map(
        [...firstChoice.schedule.slices].map(([key, placed]) => [key, placed.earliestStart]),
      ),
      finishes: new Map(
        [...firstChoice.schedule.slices].map(([key, placed]) => [key, placed.earliestFinish]),
      ),
    };
    const secondChoice = guardConnectedPublication(
      secondStage,
      new Map([[trailingKey, 1.2]]),
      'makespan',
      new Map([[trailingKey, 2.5]]),
    );
    expect(secondChoice.baseline.slices.get(localKey)?.earliestStart).toBe(0.2);
    expect(secondChoice.baseline.slices.get(trailingKey)?.earliestStart).toBe(2.5);
    expect(secondChoice.schedule.slices.get(trailingKey)?.earliestStart).toBe(1.2);
    expect(secondChoice.schedule.slices.get(trailingKey)?.latestStart).toBe(
      scheduleResolved(
        secondStage.input,
        new Map([...secondStage.starts, [trailingKey, 1.2]]),
      ).slices.get(trailingKey)?.latestStart,
    );
  });

  test('refuses forged captured finish as trusted stage evidence', () => {
    const stage = capturedStage();
    const finishes = new Map(stage.finishes);
    finishes.set(foreignKey, 0.20000000000000004);
    expect(() => replayConnectedStage({ ...stage, finishes })).toThrow(ConnectedStageEvidenceError);
  });
  test('refuses a captured start reconciled by the real scheduler', () => {
    const stage = capturedStage();
    const starts = new Map(stage.starts);
    starts.set(trailingKey, 1.2000000000000002);
    expect(() => replayConnectedStage({ ...stage, starts })).toThrow(ConnectedStageEvidenceError);
  });

  test('keeps cumulative fractional finish for a width-three multi-step local tile', () => {
    const original = capturedStage();
    const slices: Slice[] = [
      { workItemId: 'a', stepId: null, days: 0.1, width: 1, personId: null, poolIds: [] },
      { workItemId: 'b', stepId: 'first', days: 0.1, width: 3, personId: null, poolIds: [] },
      { workItemId: 'b', stepId: 'second', days: 0.1, width: 3, personId: null, poolIds: [] },
      { workItemId: 'c', stepId: null, days: 1, width: 1, personId: null, poolIds: [] },
    ];
    const resolved = resolveScheduleInput({
      rows: original.input.rows,
      slices,
      edges: [
        { predecessorId: 'a', successorId: 'b' },
        { predecessorId: 'b', successorId: 'c' },
      ],
      notBefore: new Map([['b', 0.1]]),
      deadlines: new Map(),
      poolSizes: new Map(),
      reach: 'whole-item',
      typed: [],
    });
    const stage = capturePlacement({
      ...original,
      input: { ...resolved, order: original.input.order },
    });
    const first = sliceKey('b', 'first');
    const second = sliceKey('b', 'second');
    const secondStart = stage.starts.get(second);
    const secondFinish = stage.finishes.get(second);
    expect(secondStart).toBe(0.13333333333333333);
    expect(secondFinish).toBe(0.16666666666666669);
    expect((secondStart ?? 0) + 0.1 / 3).not.toBe(secondFinish);
    expect(replayConnectedStage(stage).slices.get(second)?.earliestFinish).toBe(secondFinish);
    const decision = guardConnectedPublication(
      stage,
      new Map([
        [first, stage.starts.get(first) ?? NaN],
        [second, secondStart ?? NaN],
      ]),
      'makespan',
      new Map([
        [first, 0],
        [second, 0],
      ]),
    );
    expect(decision.schedule.slices.get(second)?.earliestFinish).toBe(secondFinish);
    expect(decision.schedule.slices.get(second)?.effort).toBe(0.1);
    expect(decision.schedule.slices.get(second)?.width).toBe(3);
    expect(decision.schedule.slices.get(second)?.duration).toBe(0.1 / 3);
    expect(decision.schedule.slices.get(second)?.estimated).toBe(true);
  });

  test.each([
    ['missing', new Map<string, number>()],
    [
      'surplus',
      new Map([
        [localKey, 0.2],
        ['extra', 1],
      ]),
    ],
    [
      'foreign',
      new Map([
        [localKey, 0.2],
        [foreignKey, 0],
      ]),
    ],
    ['negative', reference(-1)],
    ['NaN', reference(NaN)],
    ['Infinity', reference(Infinity)],
  ])('refuses %s candidate keys or values', (_, starts) => {
    expect(() =>
      guardConnectedPublication(capturedStage(), starts, 'makespan', reference()),
    ).toThrow(ScheduleInvalidOptimizedStartError);
  });

  test.each([
    ['missing', new Map<string, number>()],
    [
      'surplus',
      new Map([
        [localKey, 0],
        ['extra', 0],
      ]),
    ],
    ['NaN', reference(NaN)],
    ['Infinity', reference(Infinity)],
    ['negative', reference(-1)],
  ])('refuses %s reference as trusted question evidence', (_, movementReference) => {
    expect(() =>
      guardConnectedPublication(capturedStage(), reference(0.2), 'makespan', movementReference),
    ).toThrow(ConnectedStageEvidenceError);
  });

  test('refuses local movement that changes the pinned foreign successor', () => {
    const stage = capturedStage();
    const starts = reference(1);
    expect(() => guardConnectedPublication(stage, starts, 'makespan', reference())).toThrow(
      ScheduleInvalidOptimizedStartError,
    );
    expect(starts.get(localKey)).toBe(1);
    expect(stage.starts.get(trailingKey)).toBe(1.2);
  });

  test('refuses sub-drift foreign start reconciliation exactly', () => {
    const original = capturedStage();
    const capturedPins = new Map(original.starts);
    capturedPins.set(trailingKey, 1.200000002);
    const captured = scheduleResolved(original.input, capturedPins);
    const stage = {
      ...original,
      starts: capturedPins,
      finishes: new Map([...captured.slices].map(([key, placed]) => [key, placed.earliestFinish])),
    };
    expect(replayConnectedStage(stage).slices.get(trailingKey)?.earliestStart).toBe(1.200000002);
    const starts = reference(0.2000000015);
    const replay = scheduleResolved(stage.input, new Map([...stage.starts, ...starts]));
    expect(replay.slices.get(trailingKey)?.earliestStart).not.toBe(stage.starts.get(trailingKey));
    expect(() => guardConnectedPublication(stage, starts, 'makespan', reference())).toThrow(
      'foreign start changed',
    );
  });

  test('applies a fractional local floor through replay', () => {
    const stage = capturedStage(1, { floor: 0.6 });
    expect(stage.starts.get(localKey)).toBe(0.6);
    expect(() => guardConnectedPublication(stage, reference(0.2), 'makespan', reference())).toThrow(
      ScheduleInvalidOptimizedStartError,
    );
  });
  test('folds a fractional project floor onto the local leaf', () => {
    const initial = capturedStage();
    const order = initial.input.order;
    if (order.kind !== 'connected') throw new Error('fixture requires connected order');
    const rows = [
      ...initial.input.rows.map((row) =>
        row.id === 'b' ? { ...row, parentId: 'project-b' } : row,
      ),
      { id: 'project-b', parentId: null, position: 3, priority: null, frozenNumber: null },
    ];
    const stage = capturePlacement({
      ...initial,
      input: {
        ...initial.input,
        rows,
        notBefore: new Map([
          ['project-b', 0.4],
          ['b', 0.2],
        ]),
        order: {
          ...order,
          projectIdByWorkItem: new Map([...order.projectIdByWorkItem, ['project-b', 'B']]),
        },
      },
    });
    expect(stage.starts.get(localKey)).toBe(0.4);
    expect(() => guardConnectedPublication(stage, reference(0.2), 'makespan', reference())).toThrow(
      ScheduleInvalidOptimizedStartError,
    );
  });

  test('scores a local regression despite a much longer fixed foreign task', () => {
    const initial = capturedStage();
    const slices = initial.input.slices.map((slice) =>
      slice.workItemId === 'c' ? { ...slice, days: 100 } : slice,
    );
    const stage = capturePlacement({
      ...initial,
      input: { ...initial.input, slices, graph: { ...initial.input.graph, edges: [] } },
    });
    const decision = guardConnectedPublication(stage, reference(3), 'makespan', reference(0.4));
    expect(decision.baselineValues.makespan).toBe(1);
    expect(decision.optimizedValues.makespan).toBe(4);
    expect(decision.chosen).toBe('baseline');
    expect(decision.values.movement).toBe(Math.abs((stage.starts.get(localKey) ?? 0) - 0.4));
    expect(decision.schedule.slices.get(trailingKey)?.earliestFinish).toBe(100);
  });

  test('derives PRI weights from local leaves and gives an unprioritized leaf zero weight', () => {
    const initial = capturedStage();
    const rows = initial.input.rows.map((row) => ({
      ...row,
      priority: row.id === 'a' ? 99 : row.id === 'b' ? 9 : null,
    }));
    const input = {
      ...initial.input,
      rows,
      order: {
        kind: 'connected' as const,
        projectIdByWorkItem: new Map([
          ['a', 'A'],
          ['b', 'B'],
          ['c', 'B'],
        ]),
        rankByProject: new Map([
          ['A', 0],
          ['B', 1],
        ]),
      },
    };
    const stage = capturePlacement({
      ...initial,
      input,
      projects: initial.projects.filter((project) => project.projectId !== 'C'),
    });
    const starts = new Map([
      [localKey, stage.starts.get(localKey) ?? NaN],
      [trailingKey, stage.starts.get(trailingKey) ?? NaN],
    ]);
    const decision = guardConnectedPublication(
      stage,
      starts,
      'priority',
      new Map([
        [localKey, 0],
        [trailingKey, 0],
      ]),
    );
    expect(decision.chosen).toBe('optimized');
    expect(decision.values.priority).toBe(1.2);
    expect(decision.values.makespan).toBe(2.2);
    expect(decision.values.movement).toBe(1.4);
  });
  test('uses an inherited local priority in the dense PRI score', () => {
    const initial = capturedStage();
    const order = initial.input.order;
    if (order.kind !== 'connected') throw new Error('fixture requires connected order');
    const rows = [
      ...initial.input.rows.map((row) =>
        row.id === 'c'
          ? { ...row, parentId: 'parent-c' }
          : row.id === 'a'
            ? { ...row, priority: 99 }
            : { ...row, priority: row.id === 'b' ? 9 : null },
      ),
      { id: 'parent-c', parentId: null, position: 3, priority: 1, frozenNumber: null },
    ];
    const stage = capturePlacement({
      ...initial,
      projects: initial.projects.filter((project) => project.projectId !== 'C'),
      input: {
        ...initial.input,
        rows,
        order: {
          ...order,
          projectIdByWorkItem: new Map([
            ['a', 'A'],
            ['b', 'B'],
            ['c', 'B'],
            ['parent-c', 'B'],
          ]),
          rankByProject: new Map([
            ['A', 0],
            ['B', 1],
          ]),
        },
      },
    });
    const starts = new Map([
      [localKey, stage.starts.get(localKey) ?? NaN],
      [trailingKey, stage.starts.get(trailingKey) ?? NaN],
    ]);
    const score = guardConnectedPublication(stage, starts, 'priority', starts).values;
    expect(score.priority).toBe(5.6000000000000005);
  });

  test('refuses a nonfinite scoped score from individually finite movement origins', () => {
    const stage = weightedStage('FS');
    const first = sliceKey('b', 'first');
    const second = sliceKey('b', 'second');
    const starts = new Map([
      [first, stage.starts.get(first) ?? NaN],
      [second, stage.starts.get(second) ?? NaN],
    ]);
    const reference = new Map([
      [first, Number.MAX_VALUE],
      [second, Number.MAX_VALUE],
    ]);
    expect(() => guardConnectedPublication(stage, starts, 'makespan', reference)).toThrow(
      ConnectedStageEvidenceError,
    );
  });

  test('rejects malformed captured key set before candidate validation', () => {
    const stage = capturedStage();
    expect(() =>
      guardConnectedPublication(
        { ...stage, starts: new Map([[localKey, 0.2]]) },
        reference(NaN),
        'makespan',
        reference(),
      ),
    ).toThrow(ConnectedStageEvidenceError);
  });
  test('refuses an invalid trusted baseline pin and an empty local stage', () => {
    const stage = capturedStage();
    expect(() =>
      replayConnectedStage({
        ...stage,
        starts: new Map([...stage.starts, [localKey, -1]]),
      }),
    ).toThrow(ConnectedStageEvidenceError);
    const order = stage.input.order;
    if (order.kind !== 'connected') throw new Error('fixture requires connected order');
    const ownership = new Map(order.projectIdByWorkItem);
    ownership.set('b', 'A');
    expect(() =>
      replayConnectedStage({
        ...stage,
        input: { ...stage.input, order: { ...order, projectIdByWorkItem: ownership } },
      }),
    ).toThrow(ConnectedStageEvidenceError);
  });
  test('refuses a structurally invalid trusted stage before real replay', () => {
    const stage = capturedStage();
    expect(() => replayConnectedStage({ ...stage, mode: 'invalid' as 'shared' })).toThrow(
      ConnectedStageEvidenceError,
    );
  });

  test('preserves stage and candidate maps after success and failure', () => {
    const stage = capturedStage();
    const beforeStarts = [...stage.starts];
    const beforeFinishes = [...stage.finishes];
    const candidate = reference(0.2);
    const beforeCandidate = [...candidate];
    guardConnectedPublication(stage, candidate, 'makespan', reference());
    expect(() => guardConnectedPublication(stage, reference(-1), 'makespan', reference())).toThrow(
      ScheduleInvalidOptimizedStartError,
    );
    expect([...stage.starts]).toEqual(beforeStarts);
    expect([...stage.finishes]).toEqual(beforeFinishes);
    expect([...candidate]).toEqual(beforeCandidate);
  });

  test('rejects candidate after a local deadline but accepts the same late baseline capture', () => {
    const initial = capturedStage(1, { deadline: 0 });
    const independent = capturePlacement({
      ...initial,
      input: { ...initial.input, graph: { ...initial.input.graph, edges: [] } },
    });
    const lateStarts = new Map(independent.starts);
    lateStarts.set(localKey, 2);
    const latePlan = scheduleResolved(independent.input, lateStarts);
    const lateStage = {
      ...independent,
      starts: lateStarts,
      finishes: new Map([...latePlan.slices].map(([key, placed]) => [key, placed.earliestFinish])),
    };
    expect(replayConnectedStage(lateStage).slices.get(localKey)?.lateBy).not.toBeNull();
    expect(() =>
      guardConnectedPublication(lateStage, reference(1), 'makespan', reference()),
    ).toThrow(ScheduleInvalidOptimizedStartError);
    expect(guardConnectedPublication(lateStage, reference(0), 'makespan', reference()).chosen).toBe(
      'optimized',
    );
  });

  test('checks separated zero milestones individually and ignores a fixed foreign late deadline', () => {
    const initial = capturedStage();
    const first = sliceKey('b', 'first');
    const second = sliceKey('b', 'second');
    const slices: Slice[] = [
      { workItemId: 'a', stepId: null, days: 1, width: 1, personId: null, poolIds: [] },
      { workItemId: 'b', stepId: 'first', days: 0, width: 1, personId: null, poolIds: [] },
      { workItemId: 'b', stepId: 'second', days: 0, width: 1, personId: null, poolIds: [] },
      { workItemId: 'c', stepId: null, days: 1, width: 1, personId: null, poolIds: [] },
    ];
    const resolved = resolveScheduleInput({
      rows: initial.input.rows,
      slices,
      edges: [],
      notBefore: new Map(),
      deadlines: new Map([
        ['a', -1],
        ['b', 1],
      ]),
      poolSizes: new Map(),
      reach: 'whole-item',
      typed: [],
    });
    const stage = capturePlacement({
      ...initial,
      input: { ...resolved, order: initial.input.order },
    });
    const local = new Map([
      [first, 0],
      [second, 0],
    ]);
    expect(guardConnectedPublication(stage, local, 'makespan', local).chosen).toBe('optimized');
    const separated = new Map([
      [first, 0],
      [second, 2],
    ]);
    expect(() => guardConnectedPublication(stage, separated, 'makespan', local)).toThrow(
      ScheduleInvalidOptimizedStartError,
    );
  });

  test('folds an inherited fractional local deadline without rounding it', () => {
    const initial = capturedStage(0.2);
    const rows = [
      ...initial.input.rows.map((row) => (row.id === 'b' ? { ...row, parentId: 'parent-b' } : row)),
      { id: 'parent-b', parentId: null, position: 3, priority: null, frozenNumber: null },
    ];
    const order = initial.input.order;
    if (order.kind !== 'connected') throw new Error('fixture requires connected order');
    const stage = capturePlacement({
      ...initial,
      input: {
        ...initial.input,
        rows,
        graph: { ...initial.input.graph, edges: [] },
        deadlines: new Map([['parent-b', 0.5]]),
        order: {
          ...order,
          projectIdByWorkItem: new Map([...order.projectIdByWorkItem, ['parent-b', 'B']]),
        },
      },
    });
    expect(guardConnectedPublication(stage, reference(0), 'makespan', reference()).chosen).toBe(
      'optimized',
    );
    expect(() => guardConnectedPublication(stage, reference(1), 'makespan', reference())).toThrow(
      'effective deadline 0.5',
    );
  });

  test('does not treat a zero step inside positive work as a separate milestone', () => {
    const initial = capturedStage();
    const first = sliceKey('b', 'build');
    const second = sliceKey('b', 'done');
    const slices: Slice[] = [
      { workItemId: 'a', stepId: null, days: 0.2, width: 1, personId: null, poolIds: [] },
      { workItemId: 'b', stepId: 'build', days: 1, width: 1, personId: null, poolIds: [] },
      { workItemId: 'b', stepId: 'done', days: 0, width: 1, personId: null, poolIds: [] },
      { workItemId: 'c', stepId: null, days: 1, width: 1, personId: null, poolIds: [] },
    ];
    const resolved = resolveScheduleInput({
      rows: initial.input.rows,
      slices,
      edges: [],
      notBefore: new Map(),
      deadlines: new Map([['b', 1]]),
      poolSizes: new Map(),
      reach: 'whole-item',
      typed: [],
    });
    const stage = capturePlacement({
      ...initial,
      input: { ...resolved, order: initial.input.order },
    });
    const candidate = new Map([
      [first, 0],
      [second, 2],
    ]);
    expect(guardConnectedPublication(stage, candidate, 'makespan', candidate).chosen).toBe(
      'baseline',
    );
  });
});
