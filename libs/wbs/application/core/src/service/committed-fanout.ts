import type { EventLogStore } from '../ports/event-log-store';
import type { CapturedFanout } from '../ports/fanout-capture-store';
import { type ProjectEvent, subscriptionFor } from '../ports/project-event';
import type { RecordedEvent } from '../ports/recorded-event';
import { compareSharedPeopleFanout } from './shared-people-fanout';

/** The exact row inserted by a committed command, never a request to publish another row. */
export interface CommittedProjectEvent {
  readonly projectId: string;
  readonly event: ProjectEvent;
  readonly recorded: RecordedEvent;
}

/** Delivery occurs after the writer releases its turn. */
export interface CommittedFanoutDelivery {
  now(): number;
  deliverCommitted(events: readonly CommittedProjectEvent[]): Promise<void>;
}

/** Records one sorted recipient/cause pair per whole committed unit of work. */
export async function recordCommittedFanout(
  eventLog: EventLogStore,
  before: CapturedFanout,
  after: CapturedFanout,
  now: () => number,
  addressedCauses: readonly string[] = [],
): Promise<readonly CommittedProjectEvent[]> {
  const ids = new Set([...before.localFacts.keys(), ...after.localFacts.keys()]);
  // Proof: truncating changed causes to the batch target lost the second cause
  // in the mounted directory-only three-project deletion.
  const directCauses = new Set(
    [...ids].filter(
      (projectId) => before.localFacts.get(projectId) !== after.localFacts.get(projectId),
    ),
  );
  // Proof: omitting changed connection endpoints lost (C,A) when B dropped
  // its A-facing assignment but A's own local scheduling facts stayed equal.
  for (const projectId of changedConnectionEndpoints(before, after)) directCauses.add(projectId);
  for (const projectId of addressedCauses) directCauses.add(projectId);
  const { recipients } = compareSharedPeopleFanout({
    before: before.observation,
    after: after.observation,
    directCauses: [...directCauses],
  });
  const events: CommittedProjectEvent[] = [];
  // Proof: injecting a recipient when comparison returned none made the
  // mounted idempotent membership-add test record a forbidden event row.
  for (const { projectId, causeProjectId } of recipients) {
    const event: ProjectEvent = { type: 'elsewhere_changed', projectId, causeProjectId };
    const recorded = await eventLog.recordEvent(subscriptionFor(projectId), event, now());
    events.push({ projectId, event, recorded });
  }
  return events;
}

function changedConnectionEndpoints(before: CapturedFanout, after: CapturedFanout): Set<string> {
  const oldConnections = sharedConnections(before);
  const newConnections = sharedConnections(after);
  const changed = new Set<string>();
  for (const [key, endpoints] of oldConnections)
    if (!newConnections.has(key)) for (const projectId of endpoints) changed.add(projectId);
  for (const [key, endpoints] of newConnections)
    if (!oldConnections.has(key)) for (const projectId of endpoints) changed.add(projectId);
  return changed;
}

function sharedConnections(captured: CapturedFanout): Map<string, readonly [string, string]> {
  const { observation } = captured;
  const connections = new Map<string, readonly [string, string]>();
  if (observation.mode !== 'shared') return connections;
  const projects = observation.projects.filter(
    (project) =>
      project.organizationId === observation.organizationId && project.startDate !== null,
  );
  for (const [index, higher] of projects.entries())
    for (const lower of projects.slice(index + 1))
      if (higher.personIds.some((personId) => lower.personIds.includes(personId)))
        connections.set(`${higher.projectId}\0${lower.projectId}`, [
          higher.projectId,
          lower.projectId,
        ]);
  return connections;
}
