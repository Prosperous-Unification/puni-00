import type { CommittedWorkPackageEvent } from '../ports/committed-fanout';
import type { EventLogStore } from '../ports/event-log-store';
import type { CapturedFanout } from '../ports/fanout-capture-store';
import { type WorkPackageEvent, subscriptionFor } from '../ports/work-package-event';
import { compareDependencyFanout, compareSharedPeopleFanout } from './shared-people-fanout';

export type { CommittedFanoutDelivery, CommittedWorkPackageEvent } from '../ports/committed-fanout';

/** Records one sorted recipient/cause pair per whole committed unit of work. */
export async function recordCommittedFanout(
  eventLog: EventLogStore,
  before: CapturedFanout,
  after: CapturedFanout,
  now: () => number,
  addressedCauses: readonly string[] = [],
): Promise<readonly CommittedWorkPackageEvent[]> {
  const ids = new Set([...before.localFacts.keys(), ...after.localFacts.keys()]);
  // Proof: truncating changed causes to the batch target lost the second cause
  // in the mounted directory-only three-work-package deletion.
  const directCauses = new Set(
    [...ids].filter(
      (workPackageId) =>
        before.localFacts.get(workPackageId) !== after.localFacts.get(workPackageId),
    ),
  );
  // Proof: omitting changed connection endpoints lost (C,A) when B dropped
  // its A-facing assignment but A's own local scheduling facts stayed equal.
  for (const workPackageId of changedConnectionEndpoints(before, after))
    directCauses.add(workPackageId);
  for (const workPackageId of addressedCauses) directCauses.add(workPackageId);
  const sharedIds = new Set([
    ...before.observation.workPackages.map(({ workPackageId }) => workPackageId),
    ...after.observation.workPackages.map(({ workPackageId }) => workPackageId),
  ]);
  // Proof: replacing this refusal with continue resolves the missing complete-inventory cause negative.
  for (const workPackageId of addressedCauses)
    if (
      !sharedIds.has(workPackageId) &&
      !before.dependency?.workPackages.has(workPackageId) &&
      !after.dependency?.workPackages.has(workPackageId)
    )
      throw new Error('direct cause absent from both captures');
  const { recipients } = compareSharedPeopleFanout({
    before: before.observation,
    after: after.observation,
    directCauses: [...directCauses].filter((workPackageId) => sharedIds.has(workPackageId)),
  });
  const events: CommittedWorkPackageEvent[] = [];
  // Proof: injecting a recipient when comparison returned none made the
  // mounted idempotent membership-add test record a forbidden event row.
  const pairs = new Map(
    [
      ...recipients,
      ...compareDependencyFanout(before.dependency, after.dependency, addressedCauses),
    ].map((pair) => [`${pair.workPackageId}\0${pair.causeWorkPackageId}`, pair]),
  );
  for (const { workPackageId, causeWorkPackageId } of [...pairs.values()].sort(
    (left, right) =>
      left.workPackageId.localeCompare(right.workPackageId) ||
      left.causeWorkPackageId.localeCompare(right.causeWorkPackageId),
  )) {
    const event: WorkPackageEvent = {
      type: 'elsewhere_changed',
      workPackageId,
      causeWorkPackageId,
    };
    const recorded = await eventLog.recordEvent(subscriptionFor(workPackageId), event, now());
    events.push({ workPackageId, event, recorded });
  }
  return events;
}

function changedConnectionEndpoints(before: CapturedFanout, after: CapturedFanout): Set<string> {
  const oldConnections = sharedConnections(before);
  const newConnections = sharedConnections(after);
  const changed = new Set<string>();
  for (const [key, endpoints] of oldConnections)
    if (!newConnections.has(key)) for (const workPackageId of endpoints) changed.add(workPackageId);
  for (const [key, endpoints] of newConnections)
    if (!oldConnections.has(key)) for (const workPackageId of endpoints) changed.add(workPackageId);
  return changed;
}

function sharedConnections(captured: CapturedFanout): Map<string, readonly [string, string]> {
  const { observation } = captured;
  const connections = new Map<string, readonly [string, string]>();
  if (observation.mode !== 'shared') return connections;
  const workPackages = observation.workPackages.filter(
    (workPackage) =>
      workPackage.organizationId === observation.organizationId && workPackage.startDate !== null,
  );
  for (const [index, higher] of workPackages.entries())
    for (const lower of workPackages.slice(index + 1))
      if (higher.personIds.some((personId) => lower.personIds.includes(personId)))
        connections.set(`${higher.workPackageId}\0${lower.workPackageId}`, [
          higher.workPackageId,
          lower.workPackageId,
        ]);
  return connections;
}
