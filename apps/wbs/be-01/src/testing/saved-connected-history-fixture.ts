import { readFileSync } from 'node:fs';

import {
  canonicalisePlanInputV9,
  readSavedConnectedScheduleEvidence,
  readSavedDependencyHistory,
  readSavedPlanInput,
} from '@wbs/domain';

/** Complete historical evidence with target dates matching the captured 2026-10-01 anchor. */
export function savedConnectedHistoryFixture(projectId: string) {
  const rewriteTarget = (value: unknown): unknown => {
    if (typeof value === 'string')
      return value === 'A' ? projectId : value.replaceAll('"A"', JSON.stringify(projectId));
    if (Array.isArray(value)) return value.map(rewriteTarget);
    if (typeof value === 'object' && value !== null)
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, rewriteTarget(entry)]),
      );
    return value;
  };
  // Boundary: fixture JSON enters the frozen historical readers below before use.
  const captured = rewriteTarget(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../../libs/wbs/domain/domain/src/saved-plan/fixtures/connected-history.txt',
          import.meta.url,
        ),
        'utf8',
      )
        .replaceAll('20727', '14808')
        .replaceAll('20728', '14809'),
    ),
  ) as { history: unknown; evidence: unknown };
  const planFixtureRows = readSavedPlanInput(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../../libs/wbs/domain/domain/src/saved-plan/fixtures/input-v8.txt',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
    8,
  );
  // The Slice 1 fixture is structural-only: original abstract ordinals do not match its dates.
  // This fixture explicitly uses 2026-10-01/02 ordinals throughout every stage/question byte.
  const history = readSavedDependencyHistory(captured.history);
  if (history.kind !== 'connected') throw new Error('fixture must be connected');
  const evidence = readSavedConnectedScheduleEvidence(captured.evidence);
  const designKey = 'a\u0000design';
  const testKey = 'a\u0000test';
  const input = canonicalisePlanInputV9(
    {
      ...planFixtureRows,
      project: { ...planFixtureRows.project, id: projectId, startDate: '2026-10-01' },
    },
    readSavedDependencyHistory(captured.history),
  );
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
  // Boundary: test-only mutable copy of the reader-validated fixture, for injected SQL faults.
  return JSON.parse(JSON.stringify({ input, schedule })) as {
    input: typeof input;
    schedule: typeof schedule;
  };
}
