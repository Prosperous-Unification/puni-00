import { readFileSync } from 'node:fs';

import {
  canonicalisePlanInputV9,
  readSavedDependencyHistory,
  readSavedPlanInput,
} from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { verifySavedPlanBodies } from './saved-plan-integrity';

const captured = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../domain/domain/src/saved-plan/fixtures/connected-history.txt',
      import.meta.url,
    ),
    'utf8',
  ),
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
const input = canonicalisePlanInputV9(
  { ...planFixtureRows, project: { ...planFixtureRows.project, id: 'A' } },
  readSavedDependencyHistory(captured.history),
);
const schedule = {
  version: 2,
  algorithmId: 'connected-selection-v1:retired',
  workItems: {},
  slices: {},
  waitingForPerson: 0,
  waitingForCapacity: 0,
  connection: captured.evidence,
};
const read = (inputBytes: string, scheduleBytes: string | null, projectId = 'A') =>
  verifySavedPlanBodies(
    'saved',
    projectId,
    { version: 9, bytes: inputBytes },
    scheduleBytes === null ? null : { version: 2, bytes: scheduleBytes },
  );

describe('new saved body integrity', () => {
  it('accepts detached complete connected bodies and retains the supplied bytes', () => {
    expect(read(JSON.stringify(input), JSON.stringify(schedule))).toBeNull();
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
        { version: 1, bytes: '{}' },
      ),
    ).toMatchObject({ reason: 'body_invalid', body: 'schedule' });
    const local = canonicalisePlanInputV9(planFixtureRows, { kind: 'local' });
    expect(
      verifySavedPlanBodies(
        'saved',
        'p1',
        { version: 9, bytes: JSON.stringify(local) },
        { version: 1, bytes: 'legacy bytes stay opaque' },
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
