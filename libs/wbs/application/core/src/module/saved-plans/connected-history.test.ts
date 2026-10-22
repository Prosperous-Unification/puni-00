import * as domain from '@wbs/domain';
import { canonicalConnectedStageInput, scheduleResolved, sliceKey } from '@wbs/domain';
import {
  readSavedConnectedScheduleBody,
  readSavedPlanInput,
  serializeSavedConnectedScheduleBody,
} from '@wbs/domain';
import { expect, spyOn, test } from 'bun:test';

import type { ConnectedOptimizedCapturedAdapter } from '../../ports/scheduler';
import type { LivePlanRead } from '../../ports/shared-people-values';
import { deriveConnectedPlan } from '../../service/connected-plan';
import type { ConnectedPlanCapture } from '../../service/connected-plan-values';
import { deriveConnectedReadiness } from '../../service/connected-readiness';
import { connectedCapture, connectedReads } from '../../testing/connected-plan-fixture';
import { captureConnectedHistory } from './connected-history';

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

test('retains complete detached connected history and selected target timing', () => {
  const captured = live();
  const history = captureConnectedHistory(captured, 'B');
  expect(history.input.schemaVersion).toBe(9);
  expect(readSavedPlanInput(history.input, 9)).toEqual(history.input);
  expect(history.input.dependencyHistory.kind).toBe('connected');
  if (history.input.dependencyHistory.kind !== 'connected') throw new Error('connected expected');
  expect(history.input.dependencyHistory.projects.map((project) => project.projectId)).toEqual([
    'A',
    'B',
  ]);
  expect(history.input.dependencyHistory.relationships[0]?.predecessor.name).toBe('a');
  expect(history.schedule.present).toBe(true);
  if (!history.schedule.present) throw new Error('schedule expected');
  const body = history.schedule.body;
  expect(readSavedConnectedScheduleBody(body)).toEqual(body);
  expect(body.slices[sliceKey('b', 'build')].earliestStart).toBe(1);
  const placement = captured.projection.placement;
  if (placement.kind !== 'scheduled') throw new Error('placement expected');
  expect(body.connection.stages.map((stage) => stage.stageBytes)).toEqual(
    placement.stages.map((selection) => canonicalConnectedStageInput(selection.stage)),
  );
  const bytes = serializeSavedConnectedScheduleBody(body);
  placement.combined.slices.clear();
  expect(serializeSavedConnectedScheduleBody(body)).toBe(bytes);
});

test('retains explicit unavailable input state and schedule absence', () => {
  const a = connectedReads('A', null);
  const captured = live(connectedCapture(a));
  const history = captureConnectedHistory(captured, 'B');
  expect(history.schedule).toEqual({ present: false, absentReason: 'unavailable' });
  if (history.input.dependencyHistory.kind !== 'connected') throw new Error('connected expected');
  expect(history.input.dependencyHistory.placementState.kind).toBe('dependency_calendar_missing');
});

test('refuses missing component readiness instead of saving partial history', () => {
  const captured = live();
  const broken = { ...captured, readiness: { ...captured.readiness, statuses: new Map() } };
  expect(() => captureConnectedHistory(broken, 'B')).toThrow('missing connected history status');
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
  const prepared = captureConnectedHistory(captured, 'B');
  if (!prepared.schedule.present) throw new Error('expected schedule');
  const evidence = prepared.schedule.body.connection;
  expect(evidence.baseline.slices[sliceKey('a', 'build')].earliestStart).toBe(3);
  expect(evidence.composite.slices[sliceKey('a', 'build')].earliestStart).toBe(0);
  const [first, second] = evidence.stages;
  expect(first.selected).toBe('time');
  expect(first.variants?.time.state).toBe('ready');
  if (first.variants?.time.state !== 'ready' || second.variants?.time.state !== 'ready')
    throw new Error('ready expected');
  expect(first.variants.time.decision.chosen).toBe('optimized');
  expect(second.variants.time.decision.chosen).toBe('baseline');
  expect(first.stageBytes).toContain(JSON.stringify([sliceKey('a', 'build'), 3]));
  expect(second.stageBytes).toContain(JSON.stringify([sliceKey('a', 'build'), 0]));
  expect(first.observation?.inputHash).toBe('A');
  if (captured.projection.placement.kind !== 'scheduled') throw new Error('placement expected');
  const selection = captured.projection.placement.stages[0];
  const observation = selection.optimization;
  if (observation === null) throw new Error('observation expected');
  const candidate = observation.candidates.time;
  Reflect.set(observation.candidates, 'time', null);
  expect(() => captureConnectedHistory(captured, 'B')).toThrow(
    'missing connected history ready candidate',
  );
  Reflect.set(observation.candidates, 'time', candidate);
  Reflect.set(selection.decisions, 'time', null);
  expect(() => captureConnectedHistory(captured, 'B')).toThrow(
    'missing connected history ready decision',
  );
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
  const prepared = captureConnectedHistory(captured, 'B');
  if (!prepared.schedule.present) throw new Error('expected schedule');
  const stage = prepared.schedule.body.connection.stages[0];
  expect(stage.variants?.pri).toEqual({
    state: 'plan-infeasible',
    items: [{ ownerWorkItemId: 'a', boundWorkItemId: 'a', effectiveDeadlineOffset: 0 }],
  });
  expect(stage.variants?.time).toEqual({
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
        stageBytes: stage.stageBytes,
      },
      evidence: 'contradictory-bounds',
    },
  });
  expect(stage.selected).toBeNull();
});

test.each([
  { state: 'pending' },
  { state: 'retrying' },
  { state: 'failed', reason: 'timeout' },
  { state: 'corrupt', message: 'captured invalid cache' },
] as const)('keeps scheduled placement and observation when variant is $state', (variant) => {
  const capture = connectedCapture();
  const configured = {
    ...capture,
    projects: capture.projects.map((member) => ({
      ...member,
      reads: {
        ...member.reads,
        project: {
          ...member.reads.project,
          optimizationEnabled: true,
          scheduleEngine: 'optimized' as const,
        },
      },
    })),
  };
  const observed = live(configured, {
    readConnectedCaptured: () => ({
      inputHash: 'captured-hash',
      generation: 7,
      contractVersion: 'test',
      budgetMs: 100,
      quantum: 48,
      wireVersion: 5,
      variants: { pri: variant, time: { state: 'idle' } },
      candidates: { pri: null, time: null },
    }),
  });
  const prepared = captureConnectedHistory(observed, 'B');
  if (!prepared.schedule.present) throw new Error('expected retained placement');
  expect(prepared.schedule.body.slices[sliceKey('b', 'build')].earliestStart).toBe(1);
  const stage = prepared.schedule.body.connection.stages[0];
  expect(stage.observation).toEqual({
    inputHash: 'captured-hash',
    contractVersion: 'test',
    budgetMs: 100,
    quantum: 48,
    wireVersion: 5,
  });
  expect(stage.variants?.pri).toEqual(variant);
  expect(stage.selected).toBeNull();
});

test('keeps empty connected members idle without inventing a stage or origin', () => {
  const empty = (id: string) => ({ ...connectedReads(id, null), workItems: [], estimates: [] });
  const capture = { ...connectedCapture(empty('A'), empty('B')), relationships: [] };
  const prepared = captureConnectedHistory(live(capture), 'B');
  if (!prepared.schedule.present) throw new Error('empty schedule expected');
  expect(prepared.schedule.body.connection.stages).toEqual([]);
  expect(prepared.schedule.body.connection.idleProjects).toEqual(['A', 'B']);
  expect(prepared.schedule.body.connection.originOrdinal).toBeNull();
  expect(prepared.schedule.body.slices).toEqual({});
});

test('calendar representability failure changes input state and schedule absence together', () => {
  const captured = live();
  const builder = spyOn(domain, 'buildConnectedScheduleBody').mockImplementation(() => {
    throw new domain.CalendarRangeError('2026-10-05', 1e20);
  });
  try {
    const prepared = captureConnectedHistory(captured, 'B');
    expect(prepared.schedule).toEqual({ present: false, absentReason: 'infeasible' });
    if (prepared.input.dependencyHistory.kind !== 'connected') throw new Error('history expected');
    expect(prepared.input.dependencyHistory.placementState).toEqual({
      kind: 'unavailable',
      reason: 'calendar_range',
    });
  } finally {
    builder.mockRestore();
  }
});

test('conversion never schedules replays or admits after capture', () => {
  const captured = live();
  const capabilities = [
    'scheduleResolved',
    'guardConnectedPublication',
    'replayConnectedStage',
  ] as const;
  const poisoned = capabilities.map((name) =>
    spyOn(domain, name).mockImplementation(() => {
      throw new Error('forbidden after capture');
    }),
  );
  try {
    expect(captureConnectedHistory(captured, 'B').schedule.present).toBe(true);
  } finally {
    for (const capability of poisoned) capability.mockRestore();
  }
});
