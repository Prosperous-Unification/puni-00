import { snapWorkdays, workdayOrdinalOf } from '@wbs/domain';

import type { ScheduleRead } from '../ports/scheduler';
import { displaySchedule } from './shared-people';

export interface FanoutWorkPackage {
  readonly workPackageId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly rankPosition: number;
  readonly startDate: string | null;
  readonly personIds: readonly string[];
  readonly inputHash: string | null;
  readonly incomingBasis: string | null;
  readonly settings: {
    readonly optimizationEnabled: boolean;
    readonly scheduleEngine: 'fast' | 'optimized';
    readonly scheduleObjective: 'pri' | 'time';
  };
  readonly outcome: ScheduleRead | { readonly kind: 'cycle' } | { readonly kind: 'calendar_range' };
}

export interface FanoutObservation {
  readonly mode: 'legacy' | 'isolated' | 'shared';
  readonly organizationId: string | null;
  /** Already in authoritative work-package-rank order; rankPosition is captured metadata, not re-sorted here. */
  readonly workPackages: readonly FanoutWorkPackage[];
}

export interface FanoutBooking {
  readonly personId: string;
  readonly workPackageId: string;
  readonly workItemId: string;
  readonly stepId: string | null;
  readonly start: number;
  readonly end: number;
}

export interface FanoutProjection {
  readonly availability:
    'available' | 'undated' | 'engine_unavailable' | 'cycle' | 'calendar_range';
  readonly bookings: readonly FanoutBooking[];
}

export interface FanoutComparison {
  readonly workPackageId: string;
  readonly before: FanoutProjection | null;
  readonly after: FanoutProjection | null;
  readonly bookingsChanged: boolean;
  readonly availabilityChanged: boolean;
}

export interface FanoutPair {
  readonly workPackageId: string;
  readonly causeWorkPackageId: string;
}

/** Compares explicit captured observations; transaction acquisition and event writes belong to later slices. */
export function compareSharedPeopleFanout(ask: {
  readonly before: FanoutObservation;
  readonly after: FanoutObservation;
  readonly directCauses: readonly string[];
}): {
  readonly projections: readonly FanoutComparison[];
  readonly recipients: readonly FanoutPair[];
} {
  // Proof: removing this mode guard emitted A→B in the isolated-mode negative.
  if (ask.before.mode !== 'shared' || ask.after.mode !== 'shared')
    return { projections: [], recipients: [] };
  if (ask.before.organizationId === null || ask.before.organizationId !== ask.after.organizationId)
    // Proof: returning an empty fan-out hid missing/mismatched shared organization in the identity negative.
    throw new Error('shared capture organization is missing or inconsistent');
  const organizationId = ask.before.organizationId;
  // Proof: removing these organization filters let foreign X receive A's event in the org negative.
  const oldWorkPackages = ask.before.workPackages.filter(
    (workPackage) => workPackage.organizationId === organizationId,
  );
  const newWorkPackages = ask.after.workPackages.filter(
    (workPackage) => workPackage.organizationId === organizationId,
  );
  const before = new Map(
    oldWorkPackages.map((workPackage) => [workPackage.workPackageId, workPackage]),
  );
  const after = new Map(
    newWorkPackages.map((workPackage) => [workPackage.workPackageId, workPackage]),
  );
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
  const projections = ids.map((workPackageId): FanoutComparison => {
    const oldWorkPackage = before.get(workPackageId);
    const newWorkPackage = after.get(workPackageId);
    const oldProjection =
      oldWorkPackage === undefined ? null : workPackageProjection(oldWorkPackage);
    const newProjection =
      newWorkPackage === undefined ? null : workPackageProjection(newWorkPackage);
    return {
      workPackageId,
      before: oldProjection,
      after: newProjection,
      bookingsChanged:
        JSON.stringify(oldProjection?.bookings) !== JSON.stringify(newProjection?.bookings),
      // Proof: suppressing this comparison for equal input hashes hid engine_unavailable→cycle.
      availabilityChanged: oldProjection?.availability !== newProjection?.availability,
    };
  });
  const changed = new Map(projections.map((comparison) => [comparison.workPackageId, comparison]));
  const recipients = new Map<string, FanoutPair>();
  for (const causeWorkPackageId of ask.directCauses) {
    const cause = changed.get(causeWorkPackageId);
    // Proof: replacing this refusal with continue hid an absent direct cause in the missing-cause negative.
    if (cause === undefined) throw new Error('direct cause absent from both captures');
    const outgoingChanged = cause.bookingsChanged || cause.availabilityChanged;
    const reachable = new Set([
      // Proof: omitting the old graph lost C when B's old bridge was removed.
      ...reachableFrom(oldWorkPackages, causeWorkPackageId),
      // Proof: unioning old/new person edges invented A→B→C in the mixed-edge negative.
      ...reachableFrom(newWorkPackages, causeWorkPackageId),
    ]);
    for (const workPackageId of reachable) {
      const recipient = changed.get(workPackageId);
      // Proof: removing the incoming-basis filter emitted A→B for unchanged B in the topology-only negative.
      // Proof: removing the surviving-recipient guard emitted A→deleted B in the deletion negative.
      if (
        after.has(workPackageId) &&
        (outgoingChanged ||
          before.get(workPackageId)?.incomingBasis !== after.get(workPackageId)?.incomingBasis ||
          recipient?.availabilityChanged)
      ) {
        // Proof: replacing this key with array append repeated Z→A and Z→B in the pair negative.
        recipients.set(`${workPackageId}\0${causeWorkPackageId}`, {
          workPackageId,
          causeWorkPackageId,
        });
      }
    }
  }
  // Proof: omitting pair ordering made B/Z precede B/A in the ordering negative.
  return {
    projections,
    recipients: [...recipients.values()].sort(
      (left, right) =>
        left.workPackageId.localeCompare(right.workPackageId) ||
        left.causeWorkPackageId.localeCompare(right.causeWorkPackageId),
    ),
  };
}

function workPackageProjection(workPackage: FanoutWorkPackage): FanoutProjection {
  if (workPackage.outcome.kind === 'cycle' || workPackage.outcome.kind === 'calendar_range')
    return { availability: workPackage.outcome.kind, bookings: [] };
  if (workPackage.outcome.kind === 'engine_unavailable')
    return { availability: 'engine_unavailable', bookings: [] };
  if (workPackage.startDate === null) return { availability: 'undated', bookings: [] };
  // Proof: substituting Fast for the selected ready schedule made the selected-bookings test lose B.
  const planned = displaySchedule(workPackage.settings, workPackage.outcome).planned;
  const anchor = workdayOrdinalOf(workPackage.startDate);
  const bookings: FanoutBooking[] = [];
  for (const slice of planned.slices.values()) {
    // Proof: removing zero-time exclusion created a zero-length A booking; removing the
    // unassigned check created a null-person B booking in the empty-slice negative.
    if (slice.personId === null || slice.earliestFinish <= slice.earliestStart) continue;
    bookings.push({
      personId: slice.personId,
      workPackageId: workPackage.workPackageId,
      workItemId: slice.workItemId,
      stepId: slice.stepId,
      start: anchor + snapWorkdays(slice.earliestStart),
      end: anchor + snapWorkdays(slice.earliestFinish),
    });
  }
  // Proof: removing canonical sorting made a reversed slice map report changed bookings.
  bookings.sort(
    (left, right) =>
      left.personId.localeCompare(right.personId) ||
      left.workPackageId.localeCompare(right.workPackageId) ||
      left.workItemId.localeCompare(right.workItemId) ||
      (left.stepId ?? '').localeCompare(right.stepId ?? '') ||
      left.start - right.start ||
      left.end - right.end,
  );
  return { availability: 'available', bookings };
}

function reachableFrom(
  workPackages: readonly FanoutWorkPackage[],
  causeWorkPackageId: string,
): readonly string[] {
  const causeIndex = workPackages.findIndex(
    (workPackage) => workPackage.workPackageId === causeWorkPackageId,
  );
  if (causeIndex < 0) return [];
  const reachable = new Set<string>([causeWorkPackageId]);
  for (let index = causeIndex + 1; index < workPackages.length; index++) {
    const candidate = workPackages[index];
    // Proof: admitting an undated candidate emitted A→B in the undated-bridge negative.
    if (candidate.startDate === null) continue;
    for (let earlier = causeIndex; earlier < index; earlier++) {
      const predecessor = workPackages[earlier];
      // Proof: permitting an undated predecessor emitted A→B in the undated-cause negative.
      if (predecessor.startDate === null || !reachable.has(predecessor.workPackageId)) continue;
      if (candidate.personIds.some((personId) => predecessor.personIds.includes(personId))) {
        reachable.add(candidate.workPackageId);
        break;
      }
    }
  }
  reachable.delete(causeWorkPackageId);
  return [...reachable];
}

/** Detached external/person topology and semantic/label facts, captured on the owning writer. */
export interface DependencyFanout {
  readonly organizationId: string;
  /** Every owned work package survives topology detachment; `not_incident` explicitly means no connected component facts apply. */
  readonly workPackages: ReadonlyMap<string, string>;
  readonly connections: readonly {
    /** Stable authored relationship identity or person/endpoint bridge identity, excluding audit stamps. */
    readonly key: string;
    readonly predecessorWorkPackageId: string;
    readonly successorWorkPackageId: string;
  }[];
}

/** Invalidates surviving members of each old/new component independently. */
export function compareDependencyFanout(
  before: DependencyFanout | null,
  after: DependencyFanout | null,
  addressedCauses: readonly string[],
): readonly FanoutPair[] {
  // Proof: without this check, `refuses mismatched dependency capture organizations before recording events` resolved instead of refusing.
  if (before !== null && after !== null && before.organizationId !== after.organizationId)
    throw new Error('dependency capture organizations are inconsistent');
  const causes = new Set(addressedCauses);
  const ids = new Set([
    ...(before?.workPackages.keys() ?? []),
    ...(after?.workPackages.keys() ?? []),
  ]);
  for (const workPackageId of ids)
    if (before?.workPackages.get(workPackageId) !== after?.workPackages.get(workPackageId))
      causes.add(workPackageId);
  const keyOf = (edge: DependencyFanout['connections'][number]) => edge.key;
  const oldEdges = new Map(before?.connections.map((edge) => [keyOf(edge), edge]));
  const newEdges = new Map(after?.connections.map((edge) => [keyOf(edge), edge]));
  for (const [key, edge] of [...oldEdges, ...newEdges])
    if (oldEdges.has(key) !== newEdges.has(key)) {
      causes.add(edge.predecessorWorkPackageId);
      causes.add(edge.successorWorkPackageId);
    }
  const recipients = new Map<string, FanoutPair>();
  for (const causeWorkPackageId of causes)
    for (const graph of [before, after]) {
      if (!graph?.workPackages.has(causeWorkPackageId)) continue;
      const reachable = new Set([causeWorkPackageId]);
      const pending = [causeWorkPackageId];
      // Proof: replacing this frontier with [causeWorkPackageId] lost the transitive tail in the mounted rename event assertion.
      for (const current of pending)
        // Proof: traversing the union of old/new edges invented A/C recipient pairs in `does not invent a dependency path by mixing old and new topology edges`.
        for (const edge of graph.connections) {
          const neighbor =
            edge.predecessorWorkPackageId === current
              ? edge.successorWorkPackageId
              : edge.successorWorkPackageId === current
                ? edge.predecessorWorkPackageId
                : null;
          if (neighbor !== null && !reachable.has(neighbor)) {
            reachable.add(neighbor);
            pending.push(neighbor);
          }
        }
      for (const workPackageId of reachable)
        if (workPackageId !== causeWorkPackageId && after?.workPackages.has(workPackageId))
          recipients.set(`${workPackageId}\0${causeWorkPackageId}`, {
            workPackageId,
            causeWorkPackageId,
          });
    }
  return [...recipients.values()];
}
