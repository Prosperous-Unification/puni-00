import { type } from 'arktype';

import { detachHistory, requireHistory, SavedHistoryError } from './history-json';
const timingFields = {
  '[string]': 'unknown',
  duration: 'number',
  estimated: 'boolean',
  earliestStart: 'number',
  earliestFinish: 'number',
  latestStart: 'number',
  latestFinish: 'number',
  float: 'number',
  critical: 'boolean',
  startsOn: 'string | null',
  endsOn: 'string | null',
} as const;
const timing = type(timingFields);
const slice = type({
  ...timingFields,
  workItemId: 'string',
  stepId: 'string | null',
  personId: 'string | null',
  resourcePredecessorId: 'string | null',
  capacityPredecessorIds: 'string[]',
  capacityTeamId: 'string | null',
  width: 'number',
  effort: 'number',
  'lateBy?': 'number | null',
  'capacityResource?': { '+': 'reject', resourceId: 'string', units: 'number' },
  boundBy:
    "'projectStart' | 'predecessor' | 'stepOrder' | 'notBefore' | 'person' | 'capacity' | 'elsewhere' | 'optimizer'",
  'elsewhereHolder?': { '+': 'reject', projectId: 'string', workItemId: 'string' },
});
const plain1 = type({
  '[string]': 'unknown',
  version: '1',
  algorithmId: 'string',
  workItems: { '[string]': timing },
  slices: { '[string]': slice },
  waitingForPerson: 'number',
  waitingForCapacity: 'number',
  'waitingElsewhere?': 'number',
});
/** Frozen plain1 owned fields; unknown engine additions survive, while its package-holder spelling stays fixed. */
export function readLegacyPlainSchedule1(raw: unknown) {
  requireHistory(
    typeof raw === 'object' && raw !== null && !('connection' in raw),
    'shape',
    '$.connection',
  );
  const parsed = plain1(detachHistory(raw));
  if (parsed instanceof type.errors) throw new SavedHistoryError('shape', '$', { cause: parsed });
  return detachHistory(parsed);
}
