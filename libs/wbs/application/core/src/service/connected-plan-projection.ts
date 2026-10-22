import type { ConnectedGraph, Schedule, Scheduled, ScheduledSlice } from '@wbs/domain';
import type { ConnectedEngineUnavailable, DependencyCalendarMissing } from '@wbs/domain';

import type { ConnectedPlanCapture } from './connected-plan-values';

export type { DependencyCalendarMissing } from '@wbs/domain';
/** Reverse mapping for encoded capacity/person keys; slice ownership explains foreign blockers. */
export interface ConnectedIdentities {
  readonly personByKey: ReadonlyMap<string, string>;
  readonly teamByKey: ReadonlyMap<string, string>;
  readonly resourceByKey: ReadonlyMap<string, string>;
  readonly projectIdByWorkItem: ReadonlyMap<string, string>;
}
export type ConnectedPlacement =
  | DependencyCalendarMissing
  | { readonly kind: 'unavailable'; readonly reason: 'cycle' | 'calendar_range' }
  | ConnectedEngineUnavailable
  | {
      readonly kind: 'scheduled';
      readonly engine: 'fast';
      readonly originOrdinal: number | null;
      readonly combined: Schedule;
      readonly byProject: ReadonlyMap<string, Schedule>;
      readonly identities: ConnectedIdentities;
    };
/** Detached graph evidence remains inspectable even when selected placement is unavailable. */
export interface ConnectedPlanProjection {
  readonly kind: 'connected';
  readonly capture: ConnectedPlanCapture;
  readonly authored: ConnectedGraph;
  readonly placement: ConnectedPlacement;
}
const translateSpan = <T extends Scheduled>(span: T, shift: number): T => ({
  ...span,
  earliestStart: span.earliestStart - shift,
  earliestFinish: span.earliestFinish - shift,
  latestStart: span.latestStart - shift,
  latestFinish: span.latestFinish - shift,
});
const resolveIdentity = (keys: ReadonlyMap<string, string>, key: string): string => {
  const id = keys.get(key);
  // Proof: removing reverse refusal failed `refuses absent prepared calendars and broken reverse identities` (accepted undefined person).
  if (id === undefined) throw new Error(`missing reverse identity ${key}`);
  return id;
};
/** Restore public identities while retaining stable cross-project slice keys for blockers. */
export function restoreConnectedSchedule(
  combined: Schedule,
  identities: ConnectedIdentities,
): Schedule {
  return {
    ...combined,
    slices: new Map(
      [...combined.slices].map(([key, slice]) => [
        key,
        {
          ...slice,
          personId:
            slice.personId === null
              ? null
              : resolveIdentity(identities.personByKey, slice.personId),
          capacityTeamId:
            slice.capacityTeamId === null
              ? null
              : resolveIdentity(identities.teamByKey, slice.capacityTeamId),
          ...(slice.capacityResource === undefined
            ? {}
            : {
                capacityResource: {
                  ...slice.capacityResource,
                  resourceId: resolveIdentity(
                    identities.resourceByKey,
                    slice.capacityResource.resourceId,
                  ),
                },
              }),
        },
      ]),
    ),
  };
}
/** Each member receives its own affine offsets and waiting counts. eventsVisited measures the component computation. */
export function projectConnectedSchedule(
  combined: Schedule,
  projectId: string,
  shift: number,
  ownership: ReadonlyMap<string, string>,
): Schedule {
  const slices = new Map<string, ScheduledSlice>();
  for (const [key, slice] of combined.slices)
    if (ownership.get(slice.workItemId) === projectId) slices.set(key, translateSpan(slice, shift));
  const waiting = (bound: ScheduledSlice['boundBy']) =>
    new Set(
      [...slices.values()]
        .filter((slice) => slice.boundBy === bound)
        .map((slice) => slice.workItemId),
    ).size;
  return {
    slices,
    workItems: new Map(
      [...combined.workItems]
        .filter(([id]) => ownership.get(id) === projectId)
        .map(([id, span]) => [id, translateSpan(span, shift)]),
    ),
    waitingForPerson: waiting('person'),
    waitingForCapacity: waiting('capacity'),
    eventsVisited: combined.eventsVisited,
    ...(combined.waitingElsewhere === undefined ? {} : { waitingElsewhere: waiting('elsewhere') }),
  };
}
/** Select an actual captured member without another placement pass. */
export function selectConnectedProject(
  projection: ConnectedPlanProjection,
  projectId: string,
):
  | Exclude<ConnectedPlacement, { kind: 'scheduled' }>
  | { readonly kind: 'scheduled'; readonly schedule: Schedule } {
  // Proof: bypassing membership failed `validates rank before an engine refusal and target membership before any unavailable return` (returned engine refusal).
  if (!projection.capture.projects.some((member) => member.projectId === projectId))
    throw new Error(`project ${projectId} is not captured`);
  if (projection.placement.kind !== 'scheduled') return projection.placement;
  const schedule = projection.placement.byProject.get(projectId);
  if (schedule === undefined) throw new Error(`missing project schedule ${projectId}`);
  return { kind: 'scheduled', schedule };
}
