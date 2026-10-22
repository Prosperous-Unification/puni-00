import {
  canonicalConnectedStageInput,
  resolveScheduleInput,
  scheduleResolved,
  sliceKey,
} from '@wbs/domain';
import { expect, test } from 'bun:test';

import type { ConnectedOptimizedCapturedAdapter, ConnectedOptimizedRead } from '../ports/scheduler';
import {
  buildConnectedOptimizationStage,
  type PreparedConnectedOptimization,
  selectConnectedOptimizations,
} from './connected-optimization';

const key = (id: string) => sliceKey(id, null);
function prepared(): PreparedConnectedOptimization {
  const resolved = resolveScheduleInput({
    rows: ['a', 'b', 'c'].map((id, position) => ({
      id,
      position,
      parentId: null,
      priority: null,
      frozenNumber: null,
    })),
    slices: ['a', 'b', 'c'].map((workItemId) => ({
      workItemId,
      stepId: null,
      days: 1,
      width: 1,
      personId: null,
      poolIds: [],
    })),
    edges: [],
    typed: [],
    reach: 'whole-item',
    notBefore: new Map(),
    deadlines: new Map(),
    poolSizes: new Map(),
  });
  return {
    mode: 'isolated',
    originOrdinal: 20000,
    relationships: [],
    projects: ['C', 'B', 'A'].map((projectId) => ({
      projectId,
      rank: projectId === 'C' ? 1 : 0,
      anchorOrdinal: 20000,
      engine: 'optimized',
      objective: 'time',
      enabled: true,
    })),
    input: {
      ...resolved,
      order: {
        kind: 'connected',
        projectIdByWorkItem: new Map([
          ['a', 'A'],
          ['b', 'B'],
          ['c', 'C'],
        ]),
        rankByProject: new Map([
          ['A', 0],
          ['B', 0],
          ['C', 1],
        ]),
      },
    },
  };
}
function baseline(component = prepared()) {
  return scheduleResolved(
    component.input,
    new Map([
      [key('a'), 3],
      [key('b'), 4],
      [key('c'), 5],
    ]),
  );
}
function ready(
  stage: Parameters<ConnectedOptimizedCapturedAdapter['readConnectedCaptured']>[0]['stage'],
): ConnectedOptimizedRead {
  const question = {
    projectId: stage.projectId,
    inputHash: stage.projectId,
    questionHash: `question-${stage.projectId}`,
    objective: 'time' as const,
    contractVersion: 'test',
    budgetMs: 100,
    quantum: 48,
    wireVersion: 5,
    stageBytes: canonicalConnectedStageInput(stage),
  };
  return {
    inputHash: stage.projectId,
    generation: 1,
    contractVersion: 'test',
    budgetMs: 100,
    quantum: 48,
    wireVersion: 5,
    variants: { pri: { state: 'idle' }, time: { state: 'ready', proof: 'proven' } },
    candidates: {
      pri: null,
      time: { question, starts: new Map([[key(stage.projectId.toLowerCase()), 0]]) },
    },
  };
}
test('visits rank then bytewise ID once, fixing earlier choices in later immutable stages', () => {
  const component = prepared();
  const seen: string[] = [];
  const selected = selectConnectedOptimizations(component, baseline(component), {
    readConnectedCaptured: ({ stage }) => {
      seen.push(stage.projectId);
      return ready(stage);
    },
  });
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error('expected selection');
  expect(seen).toEqual(['A', 'B', 'C']);
  expect(selected.stages).toHaveLength(3);
  expect(selected.stages[0]?.stage.starts.get(key('b'))).toBe(4);
  expect(selected.stages[1]?.stage.starts.get(key('a'))).toBe(0);
  expect([...selected.placement.slices.values()].map((slice) => slice.earliestStart)).toEqual([
    0, 0, 0,
  ]);
});
test('stage detaches input maps and validates the real captured placement', () => {
  const source = prepared();
  const floors = new Map<string, number>();
  const component = { ...source, input: { ...source.input, notBefore: floors } };
  const plan = baseline(component);
  const stage = buildConnectedOptimizationStage(component, plan, 'A');
  expect(stage.kind).toBe('connected-stage');
  if (stage.kind !== 'connected-stage') throw new Error('expected stage');
  floors.set('a', 20);
  expect(stage.input.notBefore.has('a')).toBe(false);
  const slices = new Map(plan.slices);
  const a = slices.get(key('a'));
  if (a === undefined) throw new Error('missing a');
  slices.set(key('a'), { ...a, earliestFinish: 100 });
  expect(() => buildConnectedOptimizationStage(prepared(), { ...plan, slices }, 'A')).toThrow();
});
test('missing connected capability refuses required engine even beside Fast projects', () => {
  const component = prepared();
  expect(selectConnectedOptimizations(component, baseline(component), null).kind).toBe(
    'engine_unavailable',
  );
});
test('Fast and disabled members keep their placement; enabled Fast still observes variants', () => {
  const component = prepared();
  const configured = {
    ...component,
    projects: component.projects.map((project) => ({
      ...project,
      engine: 'fast' as const,
      enabled: project.projectId !== 'C',
    })),
  };
  const seen: string[] = [];
  const selected = selectConnectedOptimizations(configured, baseline(component), {
    readConnectedCaptured: ({ stage }) => {
      seen.push(stage.projectId);
      return ready(stage);
    },
  });
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error('expected selection');
  expect(seen).toEqual(['A', 'B']);
  expect(selected.placement).toBe(selected.baseline);
});
test.each(['pending', 'idle', 'retrying', 'corrupt', 'failed'] as const)(
  '%s retains current placement visibly',
  (state) => {
    const component = prepared();
    const selected = selectConnectedOptimizations(component, baseline(component), {
      readConnectedCaptured: ({ stage }) => ({
        ...ready(stage),
        candidates: { pri: null, time: null },
        variants: {
          pri: { state: 'idle' },
          time:
            state === 'corrupt'
              ? { state, message: 'bad' }
              : state === 'failed'
                ? { state, reason: 'timeout' }
                : { state },
        },
      }),
    });
    expect(selected.kind).toBe('selected');
    if (selected.kind !== 'selected') throw new Error('expected selection');
    expect(selected.placement).toBe(selected.baseline);
    expect(selected.stages[0]?.optimization?.variants.time.state).toBe(state);
  },
);
test('rejects a stale question without replacing the current composite', () => {
  const component = prepared();
  const selected = selectConnectedOptimizations(component, baseline(component), {
    readConnectedCaptured: ({ stage }) => {
      const observation = ready(stage);
      const candidate = observation.candidates.time;
      if (candidate === null) throw new Error('missing candidate');
      return {
        ...observation,
        candidates: {
          pri: null,
          time: { ...candidate, question: { ...candidate.question, stageBytes: 'stale' } },
        },
      };
    },
  });
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error('expected selection');
  expect(selected.placement).toBe(selected.baseline);
  expect(
    selected.stages.every((stage) => stage.optimization?.variants.time.state === 'corrupt'),
  ).toBe(true);
});
test('boundary infeasible preserves a valid real composite and captured certificate scope', () => {
  const component = prepared();
  const selected = selectConnectedOptimizations(component, baseline(component), {
    readConnectedCaptured: ({ stage }) => {
      const observation = ready(stage);
      const candidate = observation.candidates.time;
      if (candidate === null) throw new Error('missing question');
      return {
        ...observation,
        candidates: { pri: null, time: null },
        variants: {
          pri: { state: 'idle' },
          time: {
            state: 'boundary-infeasible',
            certificate: {
              kind: 'boundary-infeasible',
              question: candidate.question,
              evidence: 'initial-model-infeasible',
            },
          },
        },
      };
    },
  });
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error('expected selection');
  expect(selected.placement).toBe(selected.baseline);
  expect(selected.stages[0]?.optimization?.variants.time.state).toBe('boundary-infeasible');
});
test('a ready nonselected objective remains comparison evidence without moving the project', () => {
  const component = prepared();
  const configured = {
    ...component,
    projects: component.projects.map((project) => ({ ...project, objective: 'pri' as const })),
  };
  const selected = selectConnectedOptimizations(configured, baseline(component), {
    readConnectedCaptured: ({ stage }) => ready(stage),
  });
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error('expected selection');
  expect(selected.placement).toBe(selected.baseline);
  expect(selected.stages[0]?.decisions.time?.scope).toEqual({
    kind: 'connected-stage',
    projectId: 'A',
  });
  expect(selected.stages[0]?.decisions.time?.baselineValues.makespan).toBe(4);
});
test('foreign candidate keys are corrupt and leave the entire current composite intact', () => {
  const component = prepared();
  const selected = selectConnectedOptimizations(component, baseline(component), {
    readConnectedCaptured: ({ stage }) => {
      const observation = ready(stage);
      const candidate = observation.candidates.time;
      if (candidate === null) throw new Error('missing candidate');
      return {
        ...observation,
        candidates: {
          pri: null,
          time: {
            ...candidate,
            starts: new Map([
              [key('a'), 0],
              [key('b'), 0],
              [key('c'), 0],
            ]),
          },
        },
      };
    },
  });
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error('expected selection');
  expect(selected.placement).toBe(selected.baseline);
  expect(
    selected.stages.every((stage) => stage.optimization?.variants.time.state === 'corrupt'),
  ).toBe(true);
});
test('empty local members produce idle metadata without invoking the adapter', () => {
  const component = prepared();
  const empty = {
    ...component,
    projects: [
      ...component.projects,
      {
        projectId: 'D',
        rank: 2,
        anchorOrdinal: null,
        engine: 'optimized' as const,
        objective: 'time' as const,
        enabled: true,
      },
    ],
    input: {
      ...component.input,
      order: {
        kind: 'connected' as const,
        projectIdByWorkItem: new Map([
          ['a', 'A'],
          ['b', 'B'],
          ['c', 'C'],
        ]),
        rankByProject: new Map([
          ['A', 0],
          ['B', 0],
          ['C', 1],
          ['D', 2],
        ]),
      },
    },
  };
  const seen: string[] = [];
  const selected = selectConnectedOptimizations(empty, baseline(empty), {
    readConnectedCaptured: ({ stage }) => {
      seen.push(stage.projectId);
      return ready(stage);
    },
  });
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error('expected selection');
  expect(selected.idleProjects).toEqual(['D']);
  expect(seen).toEqual(['A', 'B', 'C']);
});
test.each([
  'projectId',
  'objective',
  'inputHash',
  'contractVersion',
  'budgetMs',
  'quantum',
  'wireVersion',
  'questionHash',
] as const)('refuses a mismatched %s before considering a ready candidate', (field) => {
  const component = prepared();
  const selected = selectConnectedOptimizations(component, baseline(component), {
    readConnectedCaptured: ({ stage }) => {
      const observation = ready(stage);
      const candidate = observation.candidates.time;
      if (candidate === null) throw new Error('missing candidate');
      const question = {
        ...candidate.question,
        [field]: typeof candidate.question[field] === 'number' ? -1 : '',
      };
      return { ...observation, candidates: { pri: null, time: { ...candidate, question } } };
    },
  });
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error('expected selection');
  expect(selected.placement).toBe(selected.baseline);
  expect(
    selected.stages.every((stage) => stage.optimization?.variants.time.state === 'corrupt'),
  ).toBe(true);
});
test('whole-component replay rejects a local start violating its fixed foreign predecessor', () => {
  const component = prepared();
  const resolved = resolveScheduleInput({
    rows: component.input.rows,
    slices: component.input.slices,
    edges: [{ predecessorId: 'a', successorId: 'b' }],
    typed: [],
    reach: 'whole-item',
    notBefore: new Map(),
    deadlines: new Map(),
    poolSizes: new Map(),
  });
  const constrained = {
    ...component,
    input: {
      ...resolved,
      order: {
        kind: 'connected' as const,
        projectIdByWorkItem: new Map([
          ['a', 'A'],
          ['b', 'B'],
          ['c', 'C'],
        ]),
        rankByProject: new Map([
          ['A', 0],
          ['B', 2],
          ['C', 1],
        ]),
      },
    },
    projects: component.projects.map((project) => ({
      ...project,
      rank: project.projectId === 'B' ? 2 : project.rank,
      enabled: project.projectId === 'B',
    })),
  };
  const selected = selectConnectedOptimizations(constrained, baseline(constrained), {
    readConnectedCaptured: ({ stage }) => ready(stage),
  });
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error('expected selection');
  expect(selected.placement).toBe(selected.baseline);
  expect(
    selected.stages.find((stage) => stage.stage.projectId === 'B')?.optimization?.variants.time
      .state,
  ).toBe('corrupt');
});
test('a stale boundary certificate is corrupt rather than a terminal current question', () => {
  const component = prepared();
  const selected = selectConnectedOptimizations(component, baseline(component), {
    readConnectedCaptured: ({ stage }) => {
      const observation = ready(stage);
      const candidate = observation.candidates.time;
      if (candidate === null) throw new Error('missing question');
      return {
        ...observation,
        candidates: { pri: null, time: null },
        variants: {
          pri: { state: 'idle' },
          time: {
            state: 'boundary-infeasible',
            certificate: {
              kind: 'boundary-infeasible',
              question: { ...candidate.question, stageBytes: 'old-boundary' },
              evidence: 'initial-model-infeasible',
            },
          },
        },
      };
    },
  });
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error('expected selection');
  expect(
    selected.stages.every((stage) => stage.optimization?.variants.time.state === 'corrupt'),
  ).toBe(true);
});
test('an entirely empty component needs neither calendar origin nor optimizer capability', () => {
  const source = prepared();
  const empty = {
    ...source,
    originOrdinal: null,
    projects: source.projects.map((project) => ({ ...project, anchorOrdinal: null })),
    input: {
      ...source.input,
      rows: [],
      slices: [],
      graph: { nodes: [], edges: [] },
      order: {
        kind: 'connected' as const,
        projectIdByWorkItem: new Map<string, string>(),
        rankByProject: new Map([
          ['A', 0],
          ['B', 0],
          ['C', 1],
        ]),
      },
    },
  };
  const selected = selectConnectedOptimizations(empty, scheduleResolved(empty.input), null);
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error('expected empty selection');
  expect(selected.stages).toEqual([]);
  expect(selected.idleProjects).toEqual(['A', 'B', 'C']);
});
test('unknown stage ownership refuses before being mistaken for an idle project', () => {
  const component = prepared();
  expect(() => buildConnectedOptimizationStage(component, baseline(component), 'unknown')).toThrow(
    'uncaptured optimization project unknown',
  );
});
test('an active stage refuses an absent calendar origin', () => {
  const component = prepared();
  expect(() =>
    buildConnectedOptimizationStage(
      { ...component, originOrdinal: null },
      baseline(component),
      'A',
    ),
  ).toThrow('active connected optimization has no calendar origin');
});
function emptyComponent(): PreparedConnectedOptimization {
  const source = prepared();
  return {
    ...source,
    originOrdinal: null,
    projects: source.projects.map((project) => ({ ...project, anchorOrdinal: null })),
    input: {
      ...source.input,
      rows: [],
      slices: [],
      graph: { nodes: [], edges: [] },
      order: {
        kind: 'connected',
        projectIdByWorkItem: new Map(),
        rankByProject: new Map([
          ['A', 0],
          ['B', 0],
          ['C', 1],
        ]),
      },
    },
  };
}
test.each(['builder', 'selector'] as const)(
  'empty components refuse stale surplus placement in %s',
  (entry) => {
    const empty = emptyComponent();
    const stale = baseline();
    const read =
      entry === 'builder'
        ? () => buildConnectedOptimizationStage(empty, stale, 'A')
        : () => selectConnectedOptimizations(empty, stale, null);
    expect(read).toThrow('placement keys');
  },
);
test.each([undefined, 'unknown'])(
  'unmapped active ownership %s refuses before treating every project as idle',
  (owner) => {
    const component = prepared();
    const ownership = new Map([
      ['b', 'B'],
      ['c', 'C'],
    ]);
    if (owner !== undefined) ownership.set('a', owner);
    const malformed = {
      ...component,
      input: {
        ...component.input,
        order: {
          kind: 'connected' as const,
          projectIdByWorkItem: ownership,
          rankByProject: new Map([
            ['A', 0],
            ['B', 0],
            ['C', 1],
          ]),
        },
      },
    };
    expect(() => buildConnectedOptimizationStage(malformed, baseline(component), 'A')).toThrow(
      'ownership',
    );
    expect(() => selectConnectedOptimizations(malformed, baseline(component), null)).toThrow(
      'ownership',
    );
  },
);
test('an idle member still validates real foreign placement evidence', () => {
  const component = prepared();
  const extra = {
    projectId: 'D',
    rank: 2,
    anchorOrdinal: null,
    engine: 'fast' as const,
    objective: 'time' as const,
    enabled: false,
  };
  const extended = {
    ...component,
    projects: [...component.projects, extra],
    input: {
      ...component.input,
      order: {
        kind: 'connected' as const,
        projectIdByWorkItem: new Map([
          ['a', 'A'],
          ['b', 'B'],
          ['c', 'C'],
        ]),
        rankByProject: new Map([
          ['A', 0],
          ['B', 0],
          ['C', 1],
          ['D', 2],
        ]),
      },
    },
  };
  const stale = baseline(component);
  const slices = new Map(stale.slices);
  const a = slices.get(key('a'));
  if (a === undefined) throw new Error('missing a');
  slices.set(key('a'), { ...a, earliestFinish: 100 });
  expect(() => buildConnectedOptimizationStage(extended, { ...stale, slices }, 'D')).toThrow();
});
test.each(['builder', 'selector'] as const)(
  'empty components refuse stale work-item projections in %s even when slice keys are empty',
  (entry) => {
    const empty = emptyComponent();
    const stale = { ...baseline(), slices: new Map() };
    const read =
      entry === 'builder'
        ? () => buildConnectedOptimizationStage(empty, stale, 'A')
        : () => selectConnectedOptimizations(empty, stale, null);
    expect(read).toThrow('placement keys');
  },
);
test('empty components validate their resolved graph without fabricating a calendar origin', () => {
  const empty = emptyComponent();
  const placement = scheduleResolved(empty.input);
  const malformed = { ...empty, input: { ...empty.input, graph: prepared().input.graph } };
  expect(() => buildConnectedOptimizationStage(malformed, placement, 'A')).toThrow(
    'resolved graph node',
  );
});
test.each(['duplicate-project', 'missing-rank', 'nonfinite-rank'] as const)(
  'empty components refuse invalid membership %s',
  (fault) => {
    const empty = emptyComponent();
    const first = empty.projects.at(0);
    if (first === undefined || empty.input.order.kind !== 'connected')
      throw new Error('invalid empty fixture');
    const ranks = new Map(empty.input.order.rankByProject);
    if (fault === 'missing-rank') ranks.delete(first.projectId);
    const projects =
      fault === 'duplicate-project'
        ? [...empty.projects, first]
        : fault === 'nonfinite-rank'
          ? empty.projects.map((project) => ({ ...project, rank: NaN }))
          : empty.projects;
    const malformed = {
      ...empty,
      projects,
      input: { ...empty.input, order: { ...empty.input.order, rankByProject: ranks } },
    };
    const placement = scheduleResolved(empty.input);
    expect(() => buildConnectedOptimizationStage(malformed, placement, 'A')).toThrow('membership');
    expect(() => selectConnectedOptimizations(malformed, placement, null)).toThrow('membership');
  },
);
