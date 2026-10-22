import { type } from 'arktype';

import {
  readSavedCanonicalStage,
  readSavedConnectedScheduleEvidence,
  type SavedConnectedScheduleEvidence,
  type SavedPlacement,
} from './connected-schedule';
import { type SavedConnectedDependencyHistory } from './dependency-history';
import {
  detachHistory,
  type Historical,
  historicalSliceKey,
  requireHistory,
  SavedHistoryError,
  serializeHistory,
} from './history-json';

/** Connected schedule2 adds captured selection evidence; schedule1's writer remains unchanged. */
export const CONNECTED_SCHEDULE_BODY_VERSION = 2 as const;

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
const targetSlice = type({
  ...timingFields,
  workItemId: 'string',
  stepId: 'string | null',
  personId: 'string | null',
  boundBy:
    "'projectStart' | 'predecessor' | 'stepOrder' | 'notBefore' | 'person' | 'capacity' | 'elsewhere' | 'optimizer'",
  resourcePredecessorId: 'string | null',
  capacityPredecessorIds: 'string[]',
  capacityTeamId: 'string | null',
  width: 'number',
  effort: 'number',
  lateBy: 'number | null',
  'elsewhereHolder?': { '+': 'reject', projectId: 'string', workItemId: 'string' },
  'capacityResource?': { '+': 'reject', resourceId: 'string', units: 'number' },
});
const connectedBody = type({
  '[string]': 'unknown',
  version: '2',
  algorithmId: 'string',
  workItems: { '[string]': timing },
  slices: { '[string]': targetSlice },
  waitingForPerson: 'number',
  waitingForCapacity: 'number',
  'waitingElsewhere?': 'number',
  connection: 'unknown',
});

export type SavedConnectedScheduleBody = Historical<typeof connectedBody.infer> & {
  readonly connection: SavedConnectedScheduleEvidence;
};

/** Frozen connected body reader validates shape and captured evidence without running any engine. */
export function readSavedConnectedScheduleBody(raw: unknown): SavedConnectedScheduleBody {
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

/**
 * The v2 calendar contract is frozen here: UTC dates, weekend-to-Monday anchors,
 * Monday-based workday ordinals, and a 1e-9 integer snap before inclusive day projection.
 * This validates stored arithmetic only; it imports no current scheduler/calendar implementation.
 */
function readAnchorOrdinal(anchor: string): number {
  const at = new Date(`${anchor}T00:00:00Z`);
  requireHistory(
    /^\d{4}-\d{2}-\d{2}$/.test(anchor) &&
      Number.isFinite(at.getTime()) &&
      at.toISOString().slice(0, 10) === anchor,
    'target_calendar',
    '$.project.startDate',
  );
  const weekday = at.getUTCDay();
  const next = weekday === 6 ? 2 : weekday === 0 ? 1 : 0;
  const days = Math.floor(at.getTime() / 86400000) + next + 3;
  const weeks = Math.floor(days / 7);
  return weeks * 5 + days - weeks * 7;
}

/** Invert only whole historical workday ordinals; invalid or out-of-range dates are corruption. */
function dateOfOrdinal(ordinal: number, path: string): string {
  requireHistory(Number.isSafeInteger(ordinal), 'target_calendar', path);
  const weeks = Math.floor(ordinal / 5);
  const at = new Date((weeks * 7 + ordinal - weeks * 5 - 3) * 86400000);
  requireHistory(Number.isFinite(at.getTime()), 'target_calendar', path);
  const date = at.toISOString().slice(0, 10);
  requireHistory(/^\d{4}-\d{2}-\d{2}$/.test(date), 'target_calendar', path);
  return date;
}

const snapOffset = (offset: number): number =>
  Math.abs(offset - Math.round(offset)) < 1e-9 ? Math.round(offset) : offset;
const offsets = ['earliestStart', 'earliestFinish', 'latestStart', 'latestFinish'] as const;
const spanFacts = ['duration', 'estimated', 'float', 'critical'] as const;
const sliceFacts = [
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
] as const;

/** Verify a dated target span against the immutable common-axis timing, without deriving dates anew for display. */
function validateTargetSpan(
  projected: Historical<typeof timing.infer>,
  common: SavedPlacement['workItems'][string],
  shift: number,
  anchorOrdinal: number,
  path: string,
): void {
  for (const field of offsets)
    requireHistory(projected[field] === common[field] - shift, 'target_timing', `${path}.${field}`);
  for (const field of spanFacts)
    requireHistory(projected[field] === common[field], 'target_timing', `${path}.${field}`);
  const start = Math.floor(snapOffset(projected.earliestStart));
  const finish = Math.max(start, Math.ceil(snapOffset(projected.earliestFinish)) - 1);
  requireHistory(
    projected.startsOn === dateOfOrdinal(anchorOrdinal + start, `${path}.startsOn`),
    'target_calendar',
    `${path}.startsOn`,
  );
  requireHistory(
    projected.endsOn === dateOfOrdinal(anchorOrdinal + finish, `${path}.endsOn`),
    'target_calendar',
    `${path}.endsOn`,
  );
}

/**
 * Validate exact target membership, captured slice facts, affine offsets and frozen calendar projection.
 * Source maps are selected strictly by captured ownership; no live lookups or scheduler replay occur.
 */
export function validateSavedConnectedTarget(
  history: SavedConnectedDependencyHistory,
  body: SavedConnectedScheduleBody,
  capturedAnchor: string | null,
): void {
  const project = history.projects.find((member) => member.projectId === history.targetProjectId);
  requireHistory(project?.startDate === capturedAnchor, 'target_anchor', '$.project.startDate');
  const ownership = new Map(history.ownership);
  const common = body.connection.composite;
  const workItems = Object.entries(common.workItems).filter(
    ([id]) => ownership.get(id) === project.projectId,
  );
  const slices = Object.entries(common.slices).filter(
    ([, slice]) => ownership.get(slice.workItemId) === project.projectId,
  );
  const sameKeys = (expected: readonly string[], actual: readonly string[]) => {
    const keys = new Set(actual);
    return expected.length === actual.length && expected.every((key) => keys.has(key));
  };
  requireHistory(
    sameKeys(
      workItems.map(([id]) => id),
      Object.keys(body.workItems),
    ),
    'target_membership',
    '$.workItems',
  );
  requireHistory(
    sameKeys(
      slices.map(([key]) => key),
      Object.keys(body.slices),
    ),
    'target_membership',
    '$.slices',
  );
  const waiting = (floor: string) =>
    new Set(
      slices.filter(([, slice]) => slice.boundBy === floor).map(([, slice]) => slice.workItemId),
    ).size;
  requireHistory(
    body.waitingForPerson === waiting('person'),
    'target_waiting',
    '$.waitingForPerson',
  );
  requireHistory(
    body.waitingForCapacity === waiting('capacity'),
    'target_waiting',
    '$.waitingForCapacity',
  );
  requireHistory(
    common.waitingElsewhere === undefined
      ? body.waitingElsewhere === undefined
      : body.waitingElsewhere === waiting('elsewhere'),
    'target_waiting',
    '$.waitingElsewhere',
  );
  const hasPlacement = workItems.length > 0 || slices.length > 0;
  const anchorOrdinal = capturedAnchor === null ? null : readAnchorOrdinal(capturedAnchor);
  if (!hasPlacement) return;
  requireHistory(
    anchorOrdinal !== null && Number.isSafeInteger(body.connection.originOrdinal),
    'target_anchor',
    '$.connection.originOrdinal',
  );
  const originOrdinal = body.connection.originOrdinal;
  requireHistory(originOrdinal !== null, 'target_anchor', '$.connection.originOrdinal');
  const shift = anchorOrdinal - originOrdinal;
  for (const stage of body.connection.stages) {
    const packet = readSavedCanonicalStage(stage.format, stage.stageBytes);
    const member = packet.projects.find((entry) => entry.projectId === project.projectId);
    requireHistory(member?.anchorOrdinal === anchorOrdinal, 'target_anchor', '$.connection.stages');
  }
  for (const [id, span] of workItems)
    validateTargetSpan(body.workItems[id], span, shift, anchorOrdinal, `$.workItems.${id}`);
  for (const [key, slice] of slices) {
    const projected = body.slices[key];
    const path = `$.slices.${key}`;
    requireHistory(
      key === historicalSliceKey(projected.workItemId, projected.stepId),
      'target_identity',
      path,
    );
    for (const field of sliceFacts)
      requireHistory(
        serializeHistory(projected[field]) === serializeHistory(slice[field]),
        'target_slice',
        `${path}.${field}`,
      );
    for (const field of ['elsewhereHolder', 'capacityResource'] as const) {
      requireHistory(
        Object.hasOwn(projected, field) === Object.hasOwn(slice, field),
        'target_slice',
        `${path}.${field}`,
      );
      if (Object.hasOwn(slice, field))
        requireHistory(
          serializeHistory(projected[field]) === serializeHistory(slice[field]),
          'target_slice',
          `${path}.${field}`,
        );
    }
    validateTargetSpan(projected, slice, shift, anchorOrdinal, path);
  }
}
