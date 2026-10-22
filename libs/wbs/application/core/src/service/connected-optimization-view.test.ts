import { canonicalConnectedStageInput, scheduleResolved, sliceKey } from '@wbs/domain';
import { expect, test } from 'bun:test';

import type { ConnectedOptimizedCapturedAdapter } from '../ports/scheduler';
import type { LivePlanRead } from '../ports/shared-people-values';
import { connectedReads } from '../testing/connected-plan-fixture';
import { deriveConnectedPlan } from './connected-plan';
import type { ConnectedPlanCapture } from './connected-plan-values';
import { deriveConnectedReadiness } from './connected-readiness';
import { projectConnectedTree } from './connected-tree';

type ConnectedRead = Extract<LivePlanRead, { kind: 'connected' }>;
const key = (id: string) => sliceKey(id, 'build');
function captured(
  state: 'ready' | 'boundary-infeasible' | 'pending' | 'floor' = 'ready',
): ConnectedRead {
  const projects = ['A', 'B', 'C'].map((projectId, rank) => {
    const reads = connectedReads(
      projectId,
      rank === 0 ? '2026-10-05' : rank === 1 ? '2026-10-06' : '2026-10-07',
    );
    const first = reads.workItems.at(0);
    if (first === undefined) throw new Error('missing fixture work');
    return {
      projectId,
      abbreviation: `P${projectId}`,
      rank,
      reads: {
        ...reads,
        project: {
          ...reads.project,
          optimizationEnabled: true,
          scheduleEngine: projectId === 'B' ? ('fast' as const) : ('optimized' as const),
          scheduleObjective: 'time' as const,
        },
        ...(projectId === 'A'
          ? {
              workItems: [
                { ...first, id: 'a' },
                { ...first, id: 'a2', position: 1 },
              ],
              estimates: [
                ...reads.estimates,
                { workItemId: 'a2', stepId: 'build', optimistic: 1, realistic: 1, pessimistic: 1 },
              ],
            }
          : {}),
      },
    };
  });
  const capture: ConnectedPlanCapture = {
    kind: 'connected',
    organizationId: 'org',
    mode: 'isolated',
    projects,
    relationships: [
      {
        id: 'ab',
        projectId: 'B',
        type: 'SS',
        predecessor: { projectId: 'A', scope: 'whole', workItemId: 'a' },
        successor: { projectId: 'B', scope: 'whole', workItemId: 'b' },
      },
      {
        id: 'bc',
        projectId: 'C',
        type: 'SS',
        predecessor: { projectId: 'B', scope: 'whole', workItemId: 'b' },
        successor: { projectId: 'C', scope: 'whole', workItemId: 'c' },
      },
    ],
  };
  const optimizer: ConnectedOptimizedCapturedAdapter = {
    readConnectedCaptured: ({ stage }) => {
      const question = {
        projectId: stage.projectId,
        inputHash: stage.projectId,
        questionHash: `q-${stage.projectId}`,
        objective: 'time' as const,
        contractVersion: 'test',
        budgetMs: 100,
        quantum: 48,
        wireVersion: 5,
        stageBytes: canonicalConnectedStageInput(stage),
      };
      const candidate =
        state === 'ready' || state === 'floor'
          ? {
              question,
              starts:
                state === 'floor'
                  ? new Map(
                      [...stage.starts]
                        .filter(([key]) =>
                          stage.input.slices.some(
                            (slice) =>
                              sliceKey(slice.workItemId, slice.stepId) === key &&
                              slice.workItemId.startsWith(stage.projectId.toLowerCase()),
                          ),
                        )
                        .map(([key, start]) => [key, start + 1]),
                    )
                  : stage.projectId === 'A'
                    ? new Map([
                        [key('a'), 0],
                        [key('a2'), 1],
                      ])
                    : new Map([
                        [key(stage.projectId.toLowerCase()), stage.projectId === 'B' ? 3 : 6],
                      ]),
            }
          : null;
      return {
        inputHash: stage.projectId,
        generation: null,
        contractVersion: 'test',
        budgetMs: 100,
        quantum: 48,
        wireVersion: 5,
        variants: {
          pri:
            state === 'ready' || state === 'floor'
              ? { state: 'ready', proof: state === 'floor' ? 'quantisation-floor' : 'proven' }
              : { state: 'idle' },
          time:
            state === 'ready' || state === 'floor'
              ? { state: 'ready', proof: state === 'floor' ? 'quantisation-floor' : 'proven' }
              : state === 'pending'
                ? { state }
                : {
                    state,
                    certificate: { kind: state, question, evidence: 'contradictory-bounds' },
                  },
        },
        candidates: {
          pri:
            candidate === null
              ? null
              : { ...candidate, question: { ...question, objective: 'pri' } },
          time: candidate,
        },
      };
    },
  };
  const projection = deriveConnectedPlan(
    capture,
    { supports: () => true },
    (input) =>
      scheduleResolved(
        input,
        new Map([
          [key('a'), 3],
          [key('a2'), 7],
          [key('b'), 5],
          [key('c'), 8],
        ]),
      ),
    optimizer,
  );
  return {
    kind: 'connected',
    projection,
    readiness: deriveConnectedReadiness(
      capture,
      projection.authored,
      new Map(projects.map(({ projectId }) => [projectId, []])),
    ),
    metadataByProject: new Map(
      projects.map(({ projectId, abbreviation, reads }) => [
        projectId,
        {
          project: { ...reads.project, abbreviation, revision: 1, createdAt: 0 },
          workItems: reads.workItems.map((row) => ({
            ...row,
            externalRefs: [],
            factStart: null,
            factEnd: null,
            createdAt: 0,
          })),
          steps: reads.steps.map((step) => ({ ...step, projectId })),
          attempts: [],
          blockages: [],
          seq: 1,
        },
      ]),
    ),
  };
}

test('projects retained scope and target-only comparisons through the real connected tree producer', () => {
  const observation = captured();
  const a = projectConnectedTree(observation, 'A');
  const b = projectConnectedTree(observation, 'B');
  const c = projectConnectedTree(observation, 'C');
  expect(a.optimizationView).toMatchObject({
    enabled: true,
    engine: 'optimized',
    objective: 'time',
    displayed: 'time',
    generation: null,
    scope: {
      kind: 'connected-stage',
      projectId: 'A',
      mode: 'isolated',
      quantum: 48,
      wireVersion: 5,
    },
    finishDays: { fast: 8, pri: 2, time: 2 },
    sameOrderAsFast: { pri: true, time: true },
  });
  expect(b.optimizationView).toMatchObject({ displayed: 'fast', finishDays: { fast: 5, time: 3 } });
  expect(c.optimizationView).toMatchObject({ displayed: 'time', finishDays: { fast: 7, time: 5 } });
  expect(a.optimizationView?.scope.fixed.find((slice) => slice.projectId === 'C')).toEqual({
    projectId: 'C',
    projectName: 'C',
    projectAbbreviation: 'PC',
    workItemId: 'c',
    workItemName: 'c',
    stepId: 'build',
    stepName: 'Build',
    start: 8,
    finish: 9,
  });
  if (a.optimization === null) throw new Error('missing stage');
  expect(a.optimizationView?.scope.boundary).toEqual({
    format: 'wbs-connected-stage',
    version: 1,
    canonical: canonicalConnectedStageInput(a.optimization.stage),
  });
  if (c.placement.kind !== 'scheduled') throw new Error('missing placement');
  expect(c.placement.schedule.slices.get(key('c'))?.earliestStart).toBe(4);
  expect(JSON.parse(JSON.stringify(a.optimizationView))).toEqual(a.optimizationView);
});

test.each(['pending', 'boundary-infeasible'] as const)(
  '%s retains dates and supplies no fabricated candidate comparison',
  (state) => {
    const observation = captured(state);
    const tree = projectConnectedTree(observation, 'A');
    expect(tree.optimizationView).toMatchObject({
      displayed: 'fast',
      variants: { time: { state } },
      finishDays: { fast: 8 },
      sameOrderAsFast: {},
    });
    expect(tree.optimizationView?.finishDays).not.toHaveProperty('time');
    if (tree.placement.kind !== 'scheduled') throw new Error('missing placement');
    expect(tree.placement.schedule.slices.get(key('a'))?.earliestStart).toBe(3);
  },
);

test.each(['project', 'row', 'step'] as const)(
  'refuses missing captured foreign %s labels through the tree producer',
  (fault) => {
    const observation = captured();
    const metadata = new Map(observation.metadataByProject);
    const c = metadata.get('C');
    if (c === undefined) throw new Error('missing metadata');
    const changed = structuredClone(c);
    const label =
      fault === 'project'
        ? changed.project
        : fault === 'row'
          ? changed.workItems.at(0)
          : changed.steps.at(0);
    if (label === undefined) throw new Error('missing fixture label');
    Reflect.set(label, 'name', null);
    metadata.set('C', changed);
    expect(() =>
      projectConnectedTree({ ...observation, metadataByProject: metadata }, 'A'),
    ).toThrow();
  },
);

test('quantisation floor compares the published baseline without fabricating an improved finish', () => {
  const tree = projectConnectedTree(captured('floor'), 'A');
  expect(tree.optimizationView).toMatchObject({
    displayed: 'time',
    variants: { time: { state: 'ready', proof: 'quantisation-floor' } },
    finishDays: { fast: 8, time: 8 },
    sameOrderAsFast: { time: true },
  });
});

test('disabled and idle members have no generated optimization identity', () => {
  const observation = captured();
  if (observation.projection.placement.kind !== 'scheduled')
    throw new Error('missing fixture placement');
  const placement = observation.projection.placement;
  const disabled = {
    ...observation,
    projection: {
      ...observation.projection,
      placement: {
        ...placement,
        stages: placement.stages.map((selection) =>
          selection.stage.projectId === 'A'
            ? {
                ...selection,
                optimization: null,
                chosen: null,
                decisions: { pri: null, time: null },
              }
            : selection,
        ),
      },
    },
  };
  expect(projectConnectedTree(disabled, 'A').optimizationView).toBeNull();
  const idle = {
    ...observation,
    projection: {
      ...observation.projection,
      placement: {
        ...placement,
        stages: placement.stages.filter((selection) => selection.stage.projectId !== 'A'),
        idleProjects: ['A'],
      },
    },
  };
  expect(projectConnectedTree(idle, 'A').optimizationView).toBeNull();
  const missing = {
    ...idle,
    projection: {
      ...idle.projection,
      placement: { ...idle.projection.placement, idleProjects: [] },
    },
  };
  expect(() => projectConnectedTree(missing, 'A')).toThrow(
    'missing connected optimization stage A',
  );
});

test('unavailable placement has no optimization view and preserves inspectable relationships', () => {
  const observation = captured();
  const unavailable = {
    ...observation,
    projection: {
      ...observation.projection,
      placement: { kind: 'unavailable' as const, reason: 'calendar_range' as const },
    },
  };
  const tree = projectConnectedTree(unavailable, 'A');
  expect(tree.optimizationView).toBeNull();
  expect(tree.dependencies).toHaveLength(1);
});

test('refuses absent captured labels and returns detached variant evidence', () => {
  const observation = captured('boundary-infeasible');
  const view = projectConnectedTree(observation, 'A').optimizationView;
  if (view === null) throw new Error('missing optimization view');
  Reflect.set(view.variants.time, 'state', 'pending');
  expect(projectConnectedTree(observation, 'A').optimizationView?.variants.time.state).toBe(
    'boundary-infeasible',
  );
  const c = observation.metadataByProject.get('C');
  if (c === undefined) throw new Error('missing metadata');
  Reflect.deleteProperty(c.project, 'name');
  expect(() => projectConnectedTree(observation, 'A')).toThrow(
    'missing connected optimization project name C',
  );
});
