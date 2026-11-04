import { canonicalConnectedStageInput, scheduleResolved, sliceKey } from '@wbs/domain';
import { expect, test } from 'bun:test';

import type { ConnectedOptimizedCapturedAdapter } from '../../ports/scheduler';
import type { LivePlanRead } from '../../ports/shared-people-values';
import { deriveConnectedPlan } from '../../service/connected-plan';
import type { ConnectedPlanCapture } from '../../service/connected-plan-values';
import { deriveConnectedReadiness } from '../../service/connected-readiness';
import { connectedCapture, connectedReads } from '../../testing/connected-plan-fixture';
import { projectConnectedDocument } from './connected-document';

type ConnectedRead = Extract<LivePlanRead, { kind: 'connected' }>;
const live = (
  capture: ConnectedPlanCapture = connectedCapture(),
  optimizer: ConnectedOptimizedCapturedAdapter | null = null,
  scheduleFast: Parameters<typeof deriveConnectedPlan>[2] = scheduleResolved,
): ConnectedRead => {
  const projection = deriveConnectedPlan(
    capture,
    { supports: () => optimizer !== null },
    scheduleFast,
    optimizer,
  );
  return {
    kind: 'connected',
    projection,
    readiness: deriveConnectedReadiness(
      capture,
      projection.authored,
      new Map(capture.projects.map((member) => [member.projectId, []])),
    ),
    metadataByProject: new Map(
      capture.projects.map((member) => [
        member.projectId,
        {
          project: {
            ...member.reads.project,
            abbreviation: member.abbreviation,
            revision: 7,
            createdAt: 0,
          },
          steps: member.reads.steps.map((step) => ({ ...step, projectId: member.projectId })),
          workItems: member.reads.workItems.map((row) => ({
            ...row,
            externalRefs: row.externalRefs.map((reference) => ({
              ...reference,
              name: reference.id,
            })),
            factStart: null,
            factEnd: null,
            createdAt: 0,
          })),
          attempts: [],
          blockages: [],
          seq: 11,
        },
      ]),
    ),
  };
};

test('authored connected links belong only to the exported successor and keep stable remote identity', () => {
  const captured = live();
  const incoming = projectConnectedDocument(captured, 'B');
  expect(incoming.typedDependencies).toEqual([
    {
      id: 'ab',
      type: 'FS',
      predecessor: {
        kind: 'external',
        scope: 'whole',
        projectId: 'A',
        workItemId: 'a',
        display: { projectName: 'A', abbreviation: 'A', workItemName: 'a', address: 'A.010' },
      },
      successor: { kind: 'internal', scope: 'whole', workItem: 'b' },
    },
  ]);
  expect(projectConnectedDocument(captured, 'A').typedDependencies).toEqual([]);
  expect(incoming.connected.relationships).toEqual([...captured.projection.capture.relationships]);
  expect(JSON.parse(JSON.stringify(incoming))).toEqual(incoming);
});
test('scheduled evidence keeps exact component placement and retained stage boundaries', () => {
  const captured = live();
  const evidence = projectConnectedDocument(captured, 'B').connected;
  expect(
    evidence.projects.map((member) => [member.projectId, member.revision, member.seq]),
  ).toEqual([
    ['A', 7, 11],
    ['B', 7, 11],
  ]);
  if (evidence.placement.kind !== 'scheduled' || captured.projection.placement.kind !== 'scheduled')
    throw new Error('expected scheduled');
  expect(evidence.placement.selected).toEqual([
    { projectId: 'A', workItemId: 'a', stepId: 'build', start: 0, finish: 1 },
    { projectId: 'B', workItemId: 'b', stepId: 'build', start: 1, finish: 2 },
  ]);
  expect(evidence.placement.baseline).toEqual(evidence.placement.selected);
  expect(evidence.placement.stages.map((stage) => stage.boundary.canonical)).toEqual(
    captured.projection.placement.stages.map((selection) =>
      canonicalConnectedStageInput(selection.stage),
    ),
  );
  expect(evidence.placement.stages.map((stage) => [stage.optimization, stage.chosen])).toEqual([
    [null, null],
    [null, null],
  ]);
});
test('remote uncoded steps retain own UUID and row address with step label', () => {
  for (const scope of ['node', 'descendant-step'] as const) {
    const a = connectedReads('A');
    const capture = connectedCapture(
      scope === 'node'
        ? a
        : {
            ...a,
            workItems: [
              { ...a.workItems[0], id: 'parent' },
              { ...a.workItems[0], parentId: 'parent' },
            ],
          },
    );
    const captured = live({
      ...capture,
      relationships: capture.relationships.map((relationship) => ({
        ...relationship,
        type: 'FF',
        predecessor: {
          projectId: 'A',
          scope,
          workItemId: scope === 'node' ? 'a' : 'parent',
          stepId: 'build',
        },
      })),
    });
    expect(projectConnectedDocument(captured, 'B').typedDependencies[0]?.predecessor).toEqual({
      kind: 'external',
      scope,
      projectId: 'A',
      workItemId: scope === 'node' ? 'a' : 'parent',
      stepId: 'build',
      display: {
        projectName: 'A',
        abbreviation: 'A',
        workItemName: scope === 'node' ? 'a' : 'a',
        address: 'A.010',
        stepName: 'Build',
      },
    });
  }
});
test('unavailable evidence preserves exact calendar and engine refusals', () => {
  const capture = connectedCapture(connectedReads('A', null));
  const captured = live(capture);
  expect(JSON.stringify(projectConnectedDocument(captured, 'B').connected.placement)).toBe(
    JSON.stringify(captured.projection.placement),
  );
  for (const placement of [
    { kind: 'engine_unavailable', engine: 'optimized', projects: ['A'], reason: 'adapter_missing' },
    {
      kind: 'engine_unavailable',
      engine: 'optimized',
      projects: ['B'],
      reason: 'connected_optimization_not_supported',
    },
    { kind: 'unavailable', reason: 'cycle' },
    { kind: 'unavailable', reason: 'calendar_range' },
  ] as const) {
    expect(
      JSON.stringify(
        projectConnectedDocument(
          { ...captured, projection: { ...captured.projection, placement } },
          'B',
        ).connected.placement,
      ),
    ).toBe(JSON.stringify(placement));
  }
});
test('unavailable document evidence is detached from later capture mutation', () => {
  const captured = live(connectedCapture(connectedReads('A', null)));
  const placement = captured.projection.placement;
  if (placement.kind !== 'dependency_calendar_missing')
    throw new Error('expected calendar refusal');
  const exported = projectConnectedDocument(captured, 'B');
  const retained = structuredClone(exported);
  const project = placement.projects.at(0);
  if (project === undefined) throw new Error('expected missing-calendar project');
  Reflect.set(project, 'name', 'Later remote');
  Reflect.set(project, 'projectId', 'replacement-project');
  Reflect.set(placement.projects, 'length', 0);
  expect(exported).toEqual(retained);
  expect(exported.connected.placement).toEqual({
    kind: 'dependency_calendar_missing',
    projects: [{ projectId: 'A', name: 'A', abbreviation: 'A' }],
  });
});

test('export rejects a stored relationship whose owner differs from its successor', () => {
  const captured = live();
  const relationships = captured.projection.capture.relationships.map((relationship) => ({
    ...relationship,
    projectId: 'A',
  }));
  expect(() =>
    projectConnectedDocument(
      {
        ...captured,
        projection: {
          ...captured.projection,
          capture: { ...captured.projection.capture, relationships },
        },
      },
      'B',
    ),
  ).toThrow('relationship owner');
});

test('positions require complete matching baseline and selected ownership', () => {
  const captured = live();
  if (captured.projection.placement.kind !== 'scheduled') throw new Error('expected schedule');
  const placement = captured.projection.placement;
  const missing = {
    ...placement.combined,
    slices: new Map([...placement.combined.slices].slice(1)),
  };
  expect(() =>
    projectConnectedDocument(
      {
        ...captured,
        projection: { ...captured.projection, placement: { ...placement, combined: missing } },
      },
      'B',
    ),
  ).toThrow('position set');
  const broken = {
    ...placement,
    identities: {
      ...placement.identities,
      projectIdByWorkItem: new Map([
        ['a', 'B'],
        ['b', 'B'],
      ]),
    },
  };
  expect(() =>
    projectConnectedDocument(
      { ...captured, projection: { ...captured.projection, placement: broken } },
      'B',
    ),
  ).toThrow('position ownership');
});

test('optimized evidence preserves selected movement, earlier boundary and a baseline decision', () => {
  const capture = connectedCapture();
  const configured = {
    ...capture,
    relationships: [],
    projects: capture.projects.map((member) => ({
      ...member,
      reads: {
        ...member.reads,
        project: {
          ...member.reads.project,
          optimizationEnabled: true,
          scheduleEngine: 'optimized' as const,
          scheduleObjective: 'time' as const,
        },
      },
    })),
  };
  const captured = live(
    configured,
    {
      readConnectedCaptured: ({ stage }) => {
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
          generation: 7,
          contractVersion: 'test',
          budgetMs: 100,
          quantum: 48,
          wireVersion: 5,
          variants: { pri: { state: 'idle' }, time: { state: 'ready', proof: 'proven' } },
          candidates: {
            pri: null,
            time: {
              question,
              starts: new Map([
                [sliceKey(stage.projectId.toLowerCase(), 'build'), stage.projectId === 'A' ? 0 : 5],
              ]),
            },
          },
        };
      },
    },
    (input) =>
      scheduleResolved(
        input,
        new Map([
          [sliceKey('a', 'build'), 3],
          [sliceKey('b', 'build'), 4],
        ]),
      ),
  );
  const evidence = projectConnectedDocument(captured, 'B').connected;
  if (evidence.placement.kind !== 'scheduled') throw new Error('expected scheduled');
  expect(evidence.placement.baseline.map((position) => position.start)).toEqual([3, 4]);
  expect(evidence.placement.selected.map((position) => position.start)).toEqual([0, 4]);
  const first = evidence.placement.stages[0];
  const second = evidence.placement.stages[1];
  expect(first.chosen?.chosen).toBe('optimized');
  expect(second.chosen?.chosen).toBe('baseline');
  expect(first.chosen?.scope).toEqual({ kind: 'connected-stage', projectId: 'A' });
  expect(first.optimization?.candidates.time?.starts).toEqual([
    { sliceId: sliceKey('a', 'build'), start: 0 },
  ]);
  expect(first.optimization?.candidates.time?.question.stageBytes).toBe(first.boundary.canonical);
  expect(first.boundary.canonical).toContain(JSON.stringify([sliceKey('a', 'build'), 3]));
  expect(second.boundary.canonical).toContain(JSON.stringify([sliceKey('a', 'build'), 0]));
  expect(first.boundary.canonical).not.toBe(second.boundary.canonical);
});
test('terminal boundary certificate stays distinct from authored plan infeasibility', () => {
  const capture = connectedCapture();
  const configured = {
    ...capture,
    projects: capture.projects.map((member) => ({
      ...member,
      reads: { ...member.reads, project: { ...member.reads.project, optimizationEnabled: true } },
    })),
  };
  const captured = live(configured, {
    readConnectedCaptured: ({ stage }) => {
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
        generation: null,
        contractVersion: 'test',
        budgetMs: 100,
        quantum: 48,
        wireVersion: 5,
        variants: {
          pri: {
            state: 'plan-infeasible',
            items: [
              {
                ownerWorkItemId: stage.projectId.toLowerCase(),
                boundWorkItemId: stage.projectId.toLowerCase(),
                effectiveDeadlineOffset: 0,
              },
            ],
          },
          time: {
            state: 'boundary-infeasible',
            certificate: {
              kind: 'boundary-infeasible',
              question,
              evidence: 'contradictory-bounds',
            },
          },
        },
        candidates: { pri: null, time: null },
      };
    },
  });
  const evidence = projectConnectedDocument(captured, 'B').connected;
  if (evidence.placement.kind !== 'scheduled') throw new Error('expected scheduled');
  const stage = evidence.placement.stages[0];
  expect(stage.optimization?.variants.pri).toEqual({
    state: 'plan-infeasible',
    items: [{ ownerWorkItemId: 'a', boundWorkItemId: 'a', effectiveDeadlineOffset: 0 }],
  });
  expect(stage.optimization?.variants.time).toEqual({
    state: 'boundary-infeasible',
    certificate: {
      kind: 'boundary-infeasible',
      question: {
        projectId: 'A',
        inputHash: 'A',
        questionHash: 'question-A',
        objective: 'time',
        contractVersion: 'test',
        budgetMs: 100,
        quantum: 48,
        wireVersion: 5,
        stageBytes: stage.boundary.canonical,
      },
      evidence: 'contradictory-bounds',
    },
  });
  expect(stage.chosen).toBeNull();
  const retained = structuredClone(evidence);
  const placement = captured.projection.placement;
  if (placement.kind !== 'scheduled') throw new Error('expected retained schedule');
  const optimization = placement.stages.at(0)?.optimization;
  if (optimization === undefined || optimization === null)
    throw new Error('expected optimizer evidence');
  const pri = optimization.variants.pri;
  const time = optimization.variants.time;
  if (pri.state !== 'plan-infeasible' || time.state !== 'boundary-infeasible')
    throw new Error('expected terminal evidence');
  const bound = pri.items.at(0);
  if (bound === undefined) throw new Error('expected terminal bound');
  Reflect.set(bound, 'effectiveDeadlineOffset', 999);
  Reflect.set(time.certificate.question, 'stageBytes', 'later boundary');
  Reflect.set(time.certificate, 'evidence', 'later evidence');
  expect(evidence).toEqual(retained);
});

test('producer refuses missing and nonfinite captured provenance', () => {
  for (const fault of ['missing sequence', 'nonfinite revision'] as const) {
    const captured = live();
    const member = captured.metadataByProject.get('A');
    if (member === undefined) throw new Error('expected member');
    if (fault === 'missing sequence') Reflect.deleteProperty(member, 'seq');
    else Reflect.set(member.project, 'revision', Infinity);
    expect(() => projectConnectedDocument(captured, 'B')).toThrow(
      'invalid connected document evidence',
    );
  }
});

test('producer refuses foreign stage metadata and comparison scope', () => {
  const captured = live();
  const placement = captured.projection.placement;
  if (placement.kind !== 'scheduled') throw new Error('expected scheduled');
  const stages = placement.stages.map((selection, at) =>
    at === 0 ? { ...selection, engine: 'optimized' as const } : selection,
  );
  expect(() =>
    projectConnectedDocument(
      { ...captured, projection: { ...captured.projection, placement: { ...placement, stages } } },
      'B',
    ),
  ).toThrow('stage metadata');
  const values = { makespan: 2, priority: 2, movement: 0 };
  const chosen = {
    scope: { kind: 'connected-stage' as const, projectId: 'foreign' },
    chosen: 'baseline' as const,
    schedule: placement.baseline,
    baseline: placement.baseline,
    values,
    optimizedValues: values,
    baselineValues: values,
  };
  const scoped = placement.stages.map((selection, at) =>
    at === 0 ? { ...selection, chosen } : selection,
  );
  expect(() =>
    projectConnectedDocument(
      {
        ...captured,
        projection: { ...captured.projection, placement: { ...placement, stages: scoped } },
      },
      'B',
    ),
  ).toThrow('comparison scope');
});
