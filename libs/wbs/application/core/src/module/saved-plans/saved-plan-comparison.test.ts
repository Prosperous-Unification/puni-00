import {
  canonicalisePlanInputV9,
  diffPlans,
  planDiffIsEmpty,
  type PlanScheduleValue,
  type PlanSide,
  readSavedConnectedScheduleBody,
  readSavedConnectedScheduleEvidence,
  readSavedDependencyHistory,
  type SavedConnectedScheduleBody,
  validateSavedConnectedHistory,
} from '@wbs/domain';
import {
  connectedHistoryFixture,
  connectedPlanFixtureRows,
} from '@wbs/domain/connected-history-fixture';
import { describe, expect, it } from 'bun:test';

import { summarizeSavedComparisonSide } from './saved-plan-comparison';

type Mutable<T> = T extends object ? { -readonly [Key in keyof T]: Mutable<T[Key]> } : T;
function clone<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}
function readBody(side: PlanSide): Mutable<SavedConnectedScheduleBody> {
  if (!side.schedule.present) throw new Error('present fixture required');
  return clone(readSavedConnectedScheduleBody(side.schedule.body));
}
function readInput(side: PlanSide) {
  if (side.input.schemaVersion !== 9 || side.input.dependencyHistory.kind !== 'connected')
    throw new Error('connected fixture required');
  return { ...clone(side.input), dependencyHistory: clone(side.input.dependencyHistory) };
}

function connectedSide(): PlanSide {
  const fixture = connectedHistoryFixture();
  const evidence = clone(readSavedConnectedScheduleEvidence(fixture.evidence));
  const baseline = clone(evidence.composite);
  // B selects a later placement, so A's fixed B interval differs from the final composite.
  const later = clone(evidence.composite);
  for (const span of [later.workItems['b'], later.slices['b\u0000build']]) {
    span.earliestStart += 2;
    span.earliestFinish += 2;
    span.latestStart += 2;
    span.latestFinish += 2;
  }
  const second = evidence.stages[1];
  const first = evidence.stages[0];
  const ready = first.variants?.time;
  if (ready?.state !== 'ready') throw new Error('ready fixture required');
  // Test boundary: build a complete captured second-stage selection using the frozen reader below.
  evidence.composite = later;
  evidence.stages[1] = {
    ...second,
    engine: 'optimized',
    selected: 'pri',
    observation: first.observation,
    variants: {
      pri: {
        ...ready,
        candidate: {
          question: {
            ...ready.candidate.question,
            projectId: 'B',
            objective: 'pri',
            stageBytes: second.stageBytes,
          },
          starts: [['b\u0000build', 3]],
        },
        decision: {
          ...ready.decision,
          scope: { kind: 'connected-stage', projectId: 'B' },
          baseline,
          schedule: later,
        },
      },
      time: { state: 'idle' },
    },
  };
  fixture.history.projects[1].engine = 'optimized';
  fixture.history.projects[1].enabled = true;
  const history = readSavedDependencyHistory(fixture.history);
  if (history.kind !== 'connected') throw new Error('connected fixture required');
  const connection = readSavedConnectedScheduleEvidence(evidence);
  validateSavedConnectedHistory(history, connection);
  return {
    input: canonicalisePlanInputV9(connectedPlanFixtureRows(history), history),
    schedule: {
      present: true,
      algorithmId: 'retired-connected-algorithm',
      body: {
        version: 2,
        algorithmId: 'retired-connected-algorithm',
        workItems: {},
        slices: {},
        waitingForPerson: 0,
        waitingForCapacity: 0,
        connection,
      },
    },
  };
}

function provenance(side = connectedSide()) {
  const summary = summarizeSavedComparisonSide(side, { kind: 'saved', savedPlanId: 'snapshot' });
  if (summary.provenance.kind !== 'connected') throw new Error('connected summary required');
  return summary.provenance;
}

describe('historical comparison side projection', () => {
  it('retains captured context and exact stage boundaries when the diff is empty', () => {
    const side = connectedSide();
    expect(planDiffIsEmpty(diffPlans(side, side))).toBe(true);
    const captured = provenance(side);
    expect(captured).toMatchObject({
      kind: 'connected',
      targetProjectId: 'A',
      mode: 'isolated',
      placementState: { kind: 'scheduled' },
      idleProjects: [],
    });
    expect(captured.projects).toEqual([
      { projectId: 'A', name: 'Alpha', abbreviation: 'A' },
      { projectId: 'B', name: 'Beta', abbreviation: 'B' },
    ]);
    expect(captured.stages[0]).toMatchObject({
      projectId: 'A',
      name: 'Alpha',
      abbreviation: 'A',
      engine: 'optimized',
      objective: 'time',
      selected: 'time',
      observation: { inputHash: 'input', budgetMs: 100 },
      variants: {
        pri: { state: 'pending' },
        time: { state: 'ready', questionHash: 'question', chosen: 'optimized', proof: 'proven' },
      },
    });
    expect(captured.stages[0]?.boundary.fixed).toEqual([
      {
        projectId: 'B',
        workItemId: 'b',
        stepId: 'build',
        projectName: 'Beta',
        projectAbbreviation: 'B',
        workItemName: 'b',
        stepName: 'Build',
        start: 1,
        finish: 3,
      },
    ]);
    // B observed A after A's selection; A's original boundary and B's later one are distinct.
    expect(captured.stages[1]?.boundary.fixed).toEqual([
      {
        projectId: 'A',
        workItemId: 'a',
        stepId: 'design',
        projectName: 'Alpha',
        projectAbbreviation: 'A',
        workItemName: 'a',
        stepName: 'Design',
        start: 1,
        finish: 2,
      },
      {
        projectId: 'A',
        workItemId: 'a',
        stepId: 'test',
        projectName: 'Alpha',
        projectAbbreviation: 'A',
        workItemName: 'a',
        stepName: 'Test',
        start: 4,
        finish: 5,
      },
    ]);
    if (!side.schedule.present) throw new Error('present fixture required');
    expect(captured.stages[0]?.boundary).toMatchObject({
      kind: 'connected-stage',
      projectId: 'A',
      format: 'connected-stage-v1',
      originOrdinal: 20727,
    });
    expect(captured.stages[0]?.boundary.canonical).toBe(
      readBody(side).connection.stages[0]?.stageBytes,
    );
  });

  it('marks legacy input unknown while explicit input9 local stays local', () => {
    const side = connectedSide();
    const { dependencyHistory: omitted, ...local } = side.input as Extract<
      PlanSide['input'],
      { schemaVersion: 9 }
    >;
    expect(omitted.kind).toBe('connected');
    const legacy: PlanSide = {
      input: { ...local, schemaVersion: 8 },
      schedule: { present: false, absentReason: 'pending' },
    };
    expect(summarizeSavedComparisonSide(legacy, { kind: 'current' })).toEqual({
      source: { kind: 'current' },
      schedule: { present: false, absentReason: 'pending' },
      provenance: { kind: 'legacy-unknown' },
    });
    expect(
      summarizeSavedComparisonSide(
        { ...legacy, input: { ...local, schemaVersion: 9, dependencyHistory: { kind: 'local' } } },
        { kind: 'saved', savedPlanId: 'local' },
      ).provenance,
    ).toEqual({ kind: 'local' });
  });

  it('retains unavailable scope and absence without manufacturing stages', () => {
    const side = connectedSide();
    if (side.input.schemaVersion !== 9 || side.input.dependencyHistory.kind !== 'connected')
      throw new Error('connected fixture required');
    const unavailable: PlanSide = {
      input: {
        ...side.input,
        dependencyHistory: {
          ...side.input.dependencyHistory,
          placementState: { kind: 'unavailable', reason: 'cycle' },
        },
      },
      schedule: { present: false, absentReason: 'infeasible' },
    };
    const summary = summarizeSavedComparisonSide(unavailable, { kind: 'current' });
    expect(summary.schedule).toEqual({ present: false, absentReason: 'infeasible' });
    expect(summary.provenance).toMatchObject({
      kind: 'connected',
      placementState: { kind: 'unavailable', reason: 'cycle' },
      stages: [],
      idleProjects: [],
    });
  });

  it('preserves boundary and plan terminal outcomes distinctly without losing a present schedule', () => {
    const side = connectedSide();
    if (!side.schedule.present) throw new Error('present fixture required');
    const body = readBody(side);
    const stage = body.connection.stages[0];
    if (stage.variants === null) throw new Error('variants fixture required');
    stage.selected = null;
    stage.variants.pri = {
      state: 'plan-infeasible',
      items: [{ ownerWorkItemId: 'a', boundWorkItemId: 'a', effectiveDeadlineOffset: 0 }],
    };
    stage.variants.time = {
      state: 'boundary-infeasible',
      certificate: {
        kind: 'boundary-infeasible',
        question: (stage.variants.time as Extract<typeof stage.variants.time, { state: 'ready' }>)
          .candidate.question,
        evidence: 'contradictory-bounds',
      },
    };
    const summary = summarizeSavedComparisonSide(
      { ...side, schedule: { ...side.schedule, body: body as unknown as PlanScheduleValue } },
      { kind: 'saved', savedPlanId: 'terminal' },
    );
    expect(summary.schedule).toEqual({ present: true, algorithmId: 'retired-connected-algorithm' });
    expect(summary.provenance).toMatchObject({
      stages: [
        {
          selected: null,
          variants: {
            pri: { state: 'plan-infeasible' },
            time: {
              state: 'boundary-infeasible',
              questionHash: 'question',
              evidence: 'contradictory-bounds',
            },
          },
        },
        {},
      ],
    });
  });

  it('detaches summaries from caller changes and never needs live capabilities', () => {
    const original = connectedSide();
    const mutable = readInput(original);
    const side: PlanSide = { ...original, input: mutable };
    const source = { kind: 'saved', savedPlanId: 'snapshot' } as const;
    const summary = summarizeSavedComparisonSide(side, source);
    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary.provenance)).toBe(true);
    expect(summarizeSavedComparisonSide(side, source)).toEqual(summary);
    mutable.dependencyHistory.projects[1].name = 'Live rename';
    mutable.dependencyHistory.placementState = { kind: 'unavailable', reason: 'cycle' };
    expect(summary.provenance).toMatchObject({
      projects: [{ name: 'Alpha' }, { name: 'Beta' }],
      placementState: { kind: 'scheduled' },
    });
    // The pure signature has no store, scheduler, settings or directory capability to call.
    expect(JSON.stringify(summary)).not.toContain('generation');
  });

  it.each([
    'pending',
    'retrying',
    'idle',
    'failed',
    'corrupt',
    'baseline',
    'quantisation-floor',
  ] as const)('preserves %s without inferring readiness or changing selection', (state) => {
    const side = connectedSide();
    if (!side.schedule.present) throw new Error('present fixture required');
    const body = readBody(side);
    const stage = body.connection.stages[0];
    if (stage.variants === null) throw new Error('variants fixture required');
    if (stage.variants.time.state !== 'ready') throw new Error('ready fixture required');
    if (state === 'baseline') stage.variants.time.decision.chosen = 'baseline';
    else if (state === 'quantisation-floor') stage.variants.time.proof = state;
    else {
      stage.selected = null;
      stage.variants.time =
        state === 'failed'
          ? { state, reason: 'timeout' }
          : state === 'corrupt'
            ? { state, message: 'Captured invalid optimizer output' }
            : { state };
    }
    if (state === 'baseline' && stage.variants.time.state === 'ready') {
      stage.variants.time.decision.schedule = stage.variants.time.decision.baseline;
      stage.variants.time.decision.values = stage.variants.time.decision.baselineValues;
    }
    const captured = provenance({
      ...side,
      schedule: { ...side.schedule, body: body as unknown as PlanScheduleValue },
    });
    expect(captured.stages[0]?.variants?.time).toMatchObject(
      state === 'baseline'
        ? { state: 'ready', chosen: 'baseline' }
        : state === 'quantisation-floor'
          ? { state: 'ready', proof: state }
          : { state },
    );
  });

  it('retains captured idle project labels without manufacturing an idle stage', () => {
    const side = connectedSide();
    if (!side.schedule.present) throw new Error('present fixture required');
    const body = readBody(side);
    const input = readInput(side);
    input.dependencyHistory.projects.push({
      ...input.dependencyHistory.projects[1],
      projectId: 'idle',
      name: 'Empty member',
      abbreviation: 'IDLE',
      steps: [],
      workItems: [],
    });
    body.connection.idleProjects = ['idle'];
    const captured = provenance({
      input,
      schedule: { ...side.schedule, body: body as unknown as PlanScheduleValue },
    });
    expect(captured.idleProjects).toEqual([
      { projectId: 'idle', name: 'Empty member', abbreviation: 'IDLE' },
    ]);
    expect(captured.stages).toHaveLength(2);
  });

  it.each(['project', 'row', 'step'] as const)(
    'refuses missing captured %s labels rather than inventing them',
    (missing) => {
      const side = connectedSide();
      const input = readInput(side);
      if (missing === 'project')
        input.dependencyHistory.projects = input.dependencyHistory.projects.filter(
          (project) => project.projectId !== 'B',
        );
      if (missing === 'row') input.dependencyHistory.projects[1].workItems = [];
      if (missing === 'step') input.dependencyHistory.projects[1].steps = [];
      expect(() => summarizeSavedComparisonSide({ ...side, input }, { kind: 'current' })).toThrow(
        /captured .* label/,
      );
    },
  );
});
