import { readFileSync } from 'node:fs';

import {
  canonicalisePlanInputV9,
  readSavedConnectedScheduleBody,
  readSavedConnectedScheduleEvidence,
  readSavedDependencyHistory,
  readSavedPlanInput,
} from '@wbs/domain';
import { connectedPlanFixtureRows } from '@wbs/domain/connected-history-fixture';
import { describe, expect, it } from 'bun:test';

import { verifySavedPlanBodies } from './saved-plan-integrity';

const captured = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../domain/domain/src/saved-plan/fixtures/connected-history.txt',
      import.meta.url,
    ),
    'utf8',
  )
    .replaceAll('20727', '14808')
    .replaceAll('20728', '14809'),
) as { history: unknown; evidence: unknown };
const planFixtureRows = readSavedPlanInput(
  JSON.parse(
    readFileSync(
      new URL('../../../../../domain/domain/src/saved-plan/fixtures/input-v8.txt', import.meta.url),
      'utf8',
    ),
  ),
  8,
);
// The Slice 1 fixture is structural-only: original abstract ordinals do not match its dates.
// This core fixture explicitly uses 2026-10-01/02 ordinals throughout every stage/question byte.
const history = readSavedDependencyHistory(captured.history);
if (history.kind !== 'connected') throw new Error('fixture must be connected');
const evidence = readSavedConnectedScheduleEvidence(captured.evidence);
const designKey = 'a\u0000design';
const testKey = 'a\u0000test';
const buildKey = 'b\u0000build';
const input = canonicalisePlanInputV9(connectedPlanFixtureRows(history), history);
const schedule = {
  version: 2,
  algorithmId: 'connected-selection-v1:retired',
  workItems: {
    a: { ...evidence.composite.workItems['a'], startsOn: '2026-10-01', endsOn: '2026-10-07' },
  },
  slices: {
    [designKey]: {
      ...evidence.composite.slices[designKey],
      startsOn: '2026-10-02',
      endsOn: '2026-10-02',
    },
    [testKey]: {
      ...evidence.composite.slices[testKey],
      startsOn: '2026-10-07',
      endsOn: '2026-10-07',
    },
  },
  waitingForPerson: 0,
  waitingForCapacity: 0,
  connection: evidence,
};
const read = (inputBytes: string, scheduleBytes: string | null, projectId = 'A') =>
  verifySavedPlanBodies(
    'saved',
    projectId,
    { version: 9, bytes: inputBytes },
    scheduleBytes === null
      ? { present: false, absentReason: 'unavailable' }
      : { present: true, version: 2, bytes: scheduleBytes, algorithmId: schedule.algorithmId },
  );

describe('new saved body integrity', () => {
  it('accepts detached complete connected bodies and retains the supplied bytes', () => {
    expect(read(JSON.stringify(input), JSON.stringify(schedule))).toBeNull();
  });
  it('refuses missing frozen target slice identity and scheduling fields', () => {
    for (const field of [
      'workItemId',
      'stepId',
      'personId',
      'boundBy',
      'resourcePredecessorId',
      'capacityPredecessorIds',
      'capacityTeamId',
      'width',
      'effort',
      'lateBy',
    ]) {
      const incomplete = Object.fromEntries(
        Object.entries(schedule.slices[designKey]).filter(([key]) => key !== field),
      );
      expect(() =>
        readSavedConnectedScheduleBody({
          ...schedule,
          slices: { ...schedule.slices, [designKey]: incomplete },
        }),
      ).toThrow('shape');
      expect(
        read(
          JSON.stringify(input),
          JSON.stringify({ ...schedule, slices: { ...schedule.slices, [designKey]: incomplete } }),
        ),
      ).toMatchObject({ reason: 'body_invalid', body: 'schedule' });
    }
  });
  it('refuses missing, foreign or mismatched target placement membership', () => {
    for (const invalid of [
      { ...schedule, workItems: {}, slices: {} },
      { ...schedule, workItems: {} },
      { ...schedule, slices: {} },
      { ...schedule, workItems: { ...schedule.workItems, b: schedule.workItems.a } },
      {
        ...schedule,
        slices: {
          ...schedule.slices,
          [buildKey]: {
            ...evidence.composite.slices[buildKey],
            startsOn: '2026-10-02',
            endsOn: '2026-10-05',
          },
        },
      },
      {
        ...schedule,
        slices: {
          ...schedule.slices,
          [designKey]: { ...schedule.slices[designKey], workItemId: 'b' },
        },
      },
      {
        ...schedule,
        slices: {
          ...schedule.slices,
          [designKey]: { ...schedule.slices[designKey], stepId: 'test' },
        },
      },
    ])
      expect(read(JSON.stringify(input), JSON.stringify(invalid))).toMatchObject({
        reason: 'body_invalid',
        body: 'schedule',
      });
  });
  it('refuses altered selected offsets, spans and dates with an intact captured composite', () => {
    for (const alteration of [
      { earliestStart: 1001 },
      { earliestFinish: 1002 },
      { latestStart: 1001 },
      { latestFinish: 1002 },
      { duration: 1001 },
      { startsOn: '2049-06-09' },
      { endsOn: '2026-10-05' },
    ])
      expect(
        read(
          JSON.stringify(input),
          JSON.stringify({
            ...schedule,
            slices: {
              ...schedule.slices,
              [designKey]: { ...schedule.slices[designKey], ...alteration },
            },
          }),
        ),
      ).toMatchObject({ reason: 'body_invalid', body: 'schedule' });
    expect(
      read(
        JSON.stringify(input),
        JSON.stringify({
          ...schedule,
          workItems: { a: { ...schedule.workItems.a, earliestStart: 1000 } },
        }),
      ),
    ).toMatchObject({ reason: 'body_invalid', body: 'schedule' });
  });
  it('validates the captured target anchor rather than using another project calendar', () => {
    const betaHistory = { ...history, targetProjectId: 'B' };
    const betaInput = canonicalisePlanInputV9(connectedPlanFixtureRows(betaHistory), betaHistory);
    const projected = {
      ...evidence.composite.slices[buildKey],
      earliestStart: 0,
      earliestFinish: 2,
      latestStart: 0,
      latestFinish: 2,
      startsOn: '2026-10-02',
      endsOn: '2026-10-05',
    };
    const beta = {
      ...schedule,
      connection: { ...evidence, targetProjectId: 'B' },
      workItems: {
        b: {
          ...evidence.composite.workItems['b'],
          earliestStart: 0,
          earliestFinish: 2,
          latestStart: 0,
          latestFinish: 2,
          startsOn: '2026-10-02',
          endsOn: '2026-10-05',
        },
      },
      slices: { [buildKey]: projected },
    };
    expect(read(JSON.stringify(betaInput), JSON.stringify(beta), 'B')).toBeNull();
    expect(
      read(
        JSON.stringify(betaInput),
        JSON.stringify({ ...beta, slices: { [buildKey]: { ...projected, earliestStart: 1 } } }),
        'B',
      ),
    ).toMatchObject({ reason: 'body_invalid', body: 'schedule' });
    expect(
      read(
        JSON.stringify({
          ...betaInput,
          project: { ...betaInput.project, startDate: '2026-10-01' },
        }),
        JSON.stringify(beta),
        'B',
      ),
    ).toMatchObject({ reason: 'body_invalid' });
  });

  it('refuses a captured stage anchor that contradicts its stored target date', () => {
    const altered = JSON.parse(JSON.stringify(schedule)) as typeof schedule;
    const rewrite = (bytes: string) =>
      bytes.replaceAll('"anchorOrdinal":14808', '"anchorOrdinal":14809');
    const stages = altered.connection.stages.map((stage) => ({
      ...stage,
      stageBytes: rewrite(stage.stageBytes),
      variants:
        stage.variants === null
          ? null
          : Object.fromEntries(
              Object.entries(stage.variants).map(([objective, variant]) => [
                objective,
                variant.state === 'ready'
                  ? {
                      ...variant,
                      candidate: {
                        ...variant.candidate,
                        question: {
                          ...variant.candidate.question,
                          stageBytes: rewrite(variant.candidate.question.stageBytes),
                        },
                      },
                    }
                  : variant,
              ]),
            ),
    }));
    expect(
      read(
        JSON.stringify(input),
        JSON.stringify({ ...schedule, connection: { ...evidence, stages } }),
      ),
    ).toMatchObject({ reason: 'body_invalid', body: 'schedule', code: 'target_anchor' });
  });

  it('accepts a genuinely empty connected component without inventing an anchor or stage', () => {
    const emptyHistory = readSavedDependencyHistory({
      ...history,
      projects: history.projects.map((project) => ({ ...project, startDate: null, workItems: [] })),
      relationships: [],
      ownership: [],
      readiness: [],
      graph: { nodes: [], edges: [] },
    });
    if (emptyHistory.kind !== 'connected') throw new Error('fixture must be connected');
    const emptyInput = canonicalisePlanInputV9(
      connectedPlanFixtureRows(emptyHistory),
      emptyHistory,
    );
    const empty = { workItems: {}, slices: {}, waitingForPerson: 0, waitingForCapacity: 0 };
    const emptyBody = {
      ...schedule,
      ...empty,
      connection: {
        ...evidence,
        originOrdinal: null,
        baseline: empty,
        composite: empty,
        stages: [],
        idleProjects: ['A', 'B'],
      },
    };
    expect(read(JSON.stringify(emptyInput), JSON.stringify(emptyBody))).toBeNull();
    expect(
      read(JSON.stringify(emptyInput), JSON.stringify({ ...emptyBody, waitingForPerson: 1 })),
    ).toMatchObject({ reason: 'body_invalid', body: 'schedule' });
  });

  it('refuses impossible target calendar text and invented waiting facts', () => {
    const malformed = {
      ...input,
      project: { ...input.project, startDate: '2026-02-31' },
      dependencyHistory: {
        ...history,
        projects: history.projects.map((project) =>
          project.projectId === 'A' ? { ...project, startDate: '2026-02-31' } : project,
        ),
      },
    };
    expect(read(JSON.stringify(malformed), JSON.stringify(schedule))).toMatchObject({
      reason: 'body_invalid',
      body: 'schedule',
      code: 'target_calendar',
    });
    for (const altered of [
      { waitingForPerson: 1 },
      { waitingForCapacity: 1 },
      { waitingElsewhere: 0 },
    ])
      expect(
        read(JSON.stringify(input), JSON.stringify({ ...schedule, ...altered })),
      ).toMatchObject({ reason: 'body_invalid', body: 'schedule', code: 'target_waiting' });
  });

  it('reports correctly hashed malformed new JSON as typed body_invalid', () => {
    for (const bytes of ['{', JSON.stringify({ ...input, dependencyHistory: undefined })]) {
      expect(read(bytes, JSON.stringify(schedule))).toMatchObject({
        reason: 'body_invalid',
        savedPlanId: 'saved',
        body: 'input',
      });
    }
  });
  it('refuses mismatched targets, missing connection and local input with connected schedule', () => {
    expect(read(JSON.stringify(input), JSON.stringify(schedule), 'foreign')).toMatchObject({
      reason: 'body_invalid',
      body: 'input',
      code: 'target',
    });
    expect(
      read(JSON.stringify(input), JSON.stringify({ ...schedule, connection: undefined })),
    ).toMatchObject({ reason: 'body_invalid', body: 'schedule' });
    const local = canonicalisePlanInputV9(planFixtureRows, { kind: 'local' });
    expect(read(JSON.stringify(local), JSON.stringify(schedule), 'p1')).toMatchObject({
      reason: 'body_invalid',
      body: 'schedule',
      code: 'local_schedule',
    });
  });
  it('requires absent schedules for unavailable connected context and preserves local schedule1 reads', () => {
    const history = readSavedDependencyHistory(captured.history);
    if (history.kind !== 'connected') throw new Error('fixture must be connected');
    const unavailable = {
      ...input,
      dependencyHistory: { ...history, placementState: { kind: 'unavailable', reason: 'cycle' } },
    };
    expect(
      verifySavedPlanBodies(
        'saved',
        'A',
        { version: 9, bytes: JSON.stringify(unavailable) },
        { present: true, version: 1, bytes: '{}', algorithmId: 'legacy' },
      ),
    ).toMatchObject({ reason: 'body_invalid', body: 'schedule' });
    const local = canonicalisePlanInputV9(planFixtureRows, { kind: 'local' });
    expect(
      verifySavedPlanBodies(
        'saved',
        'p1',
        { version: 9, bytes: JSON.stringify(local) },
        { present: true, version: 1, bytes: 'legacy bytes stay opaque', algorithmId: 'legacy' },
      ),
    ).toBeNull();
  });

  it('refuses missing selected evidence and malformed timings without replaying schedules', () => {
    expect(read(JSON.stringify(input), null)).toMatchObject({
      reason: 'body_invalid',
      code: 'placement_state',
    });
    expect(
      read(JSON.stringify(input), JSON.stringify({ ...schedule, waitingForPerson: '0' })),
    ).toMatchObject({ reason: 'body_invalid', body: 'schedule' });
  });
});
