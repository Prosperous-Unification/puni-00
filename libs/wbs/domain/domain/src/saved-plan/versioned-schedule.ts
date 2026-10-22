import { type } from 'arktype';

import {
  readSavedConnectedScheduleEvidence,
  type SavedConnectedScheduleEvidence,
} from './connected-schedule';
import { detachHistory, requireHistory, SavedHistoryError } from './history-json';

/** Connected schedule2 adds captured selection evidence; schedule1's writer remains unchanged. */
export const CONNECTED_SCHEDULE_BODY_VERSION = 2 as const;

const timing = type({
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
});
const connectedBody = type({
  '[string]': 'unknown',
  version: '2',
  algorithmId: 'string',
  workItems: { '[string]': timing },
  slices: { '[string]': timing },
  waitingForPerson: 'number',
  waitingForCapacity: 'number',
  connection: 'unknown',
});

/** Frozen connected body reader validates shape and captured evidence without running any engine. */
export function readSavedConnectedScheduleBody(raw: unknown): {
  readonly connection: SavedConnectedScheduleEvidence;
} {
  requireHistory(
    typeof raw === 'object' && raw !== null && 'connection' in raw,
    'shape',
    '$.connection',
  );
  const parsed = connectedBody(detachHistory(raw));
  if (parsed instanceof type.errors) throw new SavedHistoryError('shape', '$', { cause: parsed });
  return detachHistory({
    ...parsed,
    connection: readSavedConnectedScheduleEvidence(parsed.connection),
  });
}
