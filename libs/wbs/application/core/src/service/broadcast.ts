import type { Broadcaster, ProjectEvent } from '../ports/project-event';

// Compatibility exports: the event contracts moved to the neutral port and keep
// their `@wbs/core/service/broadcast` names while importers name the port.
export type { Broadcaster, ProjectEvent } from '../ports/project-event';
export { subscriptionFor } from '../ports/project-event';

/** One announcement waiting for its batch to commit and let go of the lock. */
export interface HeldAnnouncement {
  projectId: string;
  event: ProjectEvent;
}

/**
 * One batch's announcements, held until it has committed and let go of its turn.
 *
 * **Per batch and handed over explicitly** (D24). What stood here before was a
 * wrapper with an `AsyncLocalStorage` queue: a publish joined the batch whose
 * async context it was made in. That is a correct answer to "whose event is
 * this" and an ambient one, and it needs a runtime that has `AsyncLocalStorage`
 * — which a browser does not. The batch's services are built over this object
 * instead, so the question is answered by the graph a caller was given rather
 * than by where its call stack came from, and the same code runs either side.
 *
 * The rule this exists for is `PlanCommandRunner`'s: the turn covers the unit of
 * work and nothing after it, because a push to gw-01 is a network call and a
 * turn held across it lets one slow gateway stall every write in the process.
 * Three services broke that rule by publishing from inside `applyAll`, and
 * under ADR 0007 those event-log inserts were savepoints inside the batch's
 * transaction: a command refused at step nine rolled back the recorded events
 * for pushes that had already left.
 *
 * Held events are deduplicated when they carry nothing but a `type`, which is
 * what makes forty `directory_changed` for one tag rename into one per project.
 */
export class AnnouncementCollector implements Broadcaster {
  private readonly held: HeldAnnouncement[] = [];

  constructor(private readonly inner: Broadcaster) {}

  publish(projectId: string, event: ProjectEvent): Promise<void> {
    // Only an event that carries nothing but its type can be deduplicated: two
    // `directory_changed` for one project say the same thing, and two
    // `step_renamed` do not.
    const saysOnlyItsType = Object.keys(event).length === 1;
    if (
      saysOnlyItsType &&
      this.held.some((each) => each.projectId === projectId && each.event.type === event.type)
    ) {
      return Promise.resolve();
    }
    this.held.push({ projectId, event });
    return Promise.resolve();
  }

  latestSeq(projectId: string): Promise<number> {
    return this.inner.latestSeq(projectId);
  }

  /** What this batch has announced so far, in the order it announced it. */
  get pending(): readonly HeldAnnouncement[] {
    return this.held;
  }

  /**
   * Publishes what the batch collected, in order.
   *
   * Called after the commit and after the turn is released — never inside
   * `UnitOfWork.run`, which is the half of the rule this class exists for.
   */
  async send(): Promise<void> {
    for (const each of this.held) await this.inner.publish(each.projectId, each.event);
  }
}
