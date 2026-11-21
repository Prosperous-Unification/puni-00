import { type } from 'arktype';

import { detachHistory, requireHistory, SavedHistoryError } from './history-json';
import { readLegacyPlainSchedule1 } from './legacy-plain-schedule1';
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
    "'workPackageStart' | 'predecessor' | 'stepOrder' | 'notBefore' | 'person' | 'capacity' | 'elsewhere' | 'optimizer'",
  'elsewhereHolder?': { '+': 'reject', workPackageId: 'string', workItemId: 'string' },
});
const plain3 = type({
  '[string]': 'unknown',
  version: '3',
  algorithmId: 'string',
  workItems: { '[string]': timing },
  slices: { '[string]': slice },
  waitingForPerson: 'number',
  waitingForCapacity: 'number',
  'waitingElsewhere?': 'number',
});
/**
 * Decode plain1 into current3 only after checking its original owned vocabulary.
 * Timings, dates, algorithm and unknown engine fields are copied unchanged; source bytes are never rewritten.
 * Connected2/4 use their separate captured-evidence reader, never this plain branch.
 */
export function readSavedPlainScheduleBody(raw: unknown, version: number) {
  requireHistory(version === 1 || version === 3, 'schedule_version', '$.version');
  requireHistory(
    typeof raw === 'object' && raw !== null && 'version' in raw && raw.version === version,
    'schedule_version',
    '$.version',
  );
  if (version === 1) {
    const legacy = readLegacyPlainSchedule1(raw);
    return readCurrentPlainSchedule3({
      ...legacy,
      version: 3,
      slices: Object.fromEntries(
        Object.entries(legacy.slices).map(([key, slice]) => {
          const { boundBy, elsewhereHolder, ...timing } = slice;
          return [
            key,
            {
              ...timing,
              boundBy: boundBy === 'projectStart' ? 'workPackageStart' : boundBy,
              ...(elsewhereHolder === undefined
                ? {}
                : {
                    elsewhereHolder: {
                      workPackageId: elsewhereHolder.projectId,
                      workItemId: elsewhereHolder.workItemId,
                    },
                  }),
            },
          ];
        }),
      ),
    });
  }
  return readCurrentPlainSchedule3(raw);
}
/** Current3 keeps open engine facts but rejects mixed legacy floor/holder names and connected envelopes. */
function readCurrentPlainSchedule3(raw: unknown) {
  requireHistory(
    typeof raw === 'object' && raw !== null && !('connection' in raw),
    'shape',
    '$.connection',
  );
  const parsed = plain3(detachHistory(raw));
  if (parsed instanceof type.errors) throw new SavedHistoryError('shape', '$', { cause: parsed });
  return detachHistory(parsed);
}
