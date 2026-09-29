import { influencersOf, type RunningBookings } from '../module/work-item/elsewhere-chain';
import type { DirectoryStore } from '../ports/directory-store';
import type { Broadcaster, ProjectEvent } from '../ports/project-event';
import type { ProjectRankStore, SharedPeopleStore } from '../ports/project-rank-store';
import type { ProjectStore } from '../ports/project-store';
import type { EngineUnavailable } from '../ports/scheduler';
import { changesScheduleInput } from './optimizer-trigger-broadcaster';

export interface ElsewhereFanOutOptions {
  /** Where every event, and every `elsewhere_changed` this publishes, goes. */
  readonly inner: Broadcaster;
  readonly projects: Pick<ProjectStore, 'sharingOf'>;
  readonly directory: Pick<DirectoryStore, 'assignmentsInProject'>;
  /** `WorkItemService.displayedBookings`: a project's bookings as its plan displays them. */
  readonly bookingsOf: (projectId: string) => Promise<RunningBookings | EngineUnavailable | null>;
}

/**
 * Tells the projects below a shared project that its bookings moved (spec
 * `shared-people-mode`, "Booking changes fan out down the rank"; ADR 0034).
 *
 * A {@link Broadcaster} decorator: every event reaches `inner` first, and
 * after one that can change a schedule's input the cause's displayed bookings
 * are compared with the ones this process last fanned out for it. When they
 * moved, `elsewhere_changed` goes through `inner` to every project the cause
 * influences or influenced last time, which re-reads, re-solves and misses a
 * sequence-keyed memo. A rename moves no booking and publishes nothing; a
 * fresh process tells every project below once, harmlessly. Blue and green
 * each keep their own records.
 *
 * A deleted project publishes nothing and is not heard here. No production
 * path deletes a project today (`beginOptimizationDrain` has no caller outside
 * its tests); the first one must tell the organization's other projects.
 *
 * Under `isolated` it reads nothing beyond the mode, and a project whose
 * bookings are unknowable here (an engine not installed) always fans out.
 */
export class ElsewhereFanOut implements Broadcaster {
  /**
   * Per project, the bookings signature it last fanned out for and the
   * projects it influenced then.
   */
  private readonly published = new Map<string, { signature: string; influenced: Set<string> }>();

  constructor(private readonly opts: ElsewhereFanOutOptions) {}

  async publish(projectId: string, event: ProjectEvent): Promise<void> {
    await this.opts.inner.publish(projectId, event);
    if (changesScheduleInput(event)) await this.bookingsMayHaveMoved(projectId);
  }

  latestSeq(projectId: string): Promise<number> {
    return this.opts.inner.latestSeq(projectId);
  }

  /**
   * Fans out from `projectId` when its displayed bookings moved: after a
   * committed edit (through {@link publish}) and after a stored optimized
   * result, which changes what the project displays without an edit.
   */
  async bookingsMayHaveMoved(projectId: string): Promise<void> {
    const sharing = await this.opts.projects.sharingOf(projectId);
    if (sharing.mode === 'isolated') return;
    const peopleOf = await this.peopleOf(sharing.order);
    // A project that has just started sharing a person, by its own edit, joins
    // the record of each project above it now, so a later change there that
    // releases it still tells it.
    // Proof: this registration removed made `tells a project the one above
    // stopped sharing with, and its load is fresh`
    // (`shared-people.controller.db.test.ts`) record only the fresh process's
    // `elsewhere_changed` for Billing, not the release (1 of 2); watched
    // 2026-09-29.
    for (const above of influencersOf(projectId, sharing.order, peopleOf)) {
      this.published.get(above)?.influenced.add(projectId);
    }
    const bookings = await this.opts.bookingsOf(projectId);
    if (bookings === null) return;
    const signature = bookings instanceof Map ? signatureOf(bookings) : null;
    const held = this.published.get(projectId);
    // Proof: this comparison removed made `publishes nothing below for a
    // rename, and tells it of a longer booking`
    // (`shared-people.controller.db.test.ts`) record one `elsewhere_changed`
    // for the rename; watched 2026-09-29.
    if (signature !== null && held?.signature === signature) return;
    const below = sharing.order.slice(sharing.order.indexOf(projectId) + 1);
    const influenced = new Set(
      below.filter((each) => influencersOf(each, sharing.order, peopleOf).includes(projectId)),
    );
    // Told: whom it influences now, and whom it influenced when it last fanned
    // out — a project it has just stopped sharing a person with (a reassign,
    // an unassign, a deleted row) moves too, though it is no longer in reach.
    // With no record, as in a fresh process, whom it released is unknown, so
    // every project below is told.
    // Proof: only the current set told made `tells a project the one above
    // stopped sharing with, and its load is fresh`
    // (`shared-people.controller.db.test.ts`) record no `elsewhere_changed`
    // for Billing (0 of 1); watched 2026-09-29.
    for (const each of below) {
      const reached = held === undefined || held.influenced.has(each) || influenced.has(each);
      if (!reached) continue;
      await this.opts.inner.publish(each, {
        type: 'elsewhere_changed',
        projectId: each,
        causeProjectId: projectId,
      });
    }
    // Recorded after every project was told: a publish that throws leaves the
    // old record, and the next change fans out again.
    if (signature !== null) this.published.set(projectId, { signature, influenced });
  }

  /**
   * After `projectId` moved in its organization's rank: under `shared`, every
   * other project of the organization may have gained or lost an influencer,
   * so each is told, naming the moved project as the cause.
   */
  async rankMoved(projectId: string): Promise<void> {
    const sharing = await this.opts.projects.sharingOf(projectId);
    if (sharing.mode === 'isolated') return;
    for (const each of sharing.order) {
      if (each === projectId) continue;
      await this.opts.inner.publish(each, {
        type: 'elsewhere_changed',
        projectId: each,
        causeProjectId: projectId,
      });
    }
  }

  /**
   * After the organization switched between isolated and shared people:
   * every one of `projectIds`, its projects, may now be scheduled around
   * other bookings or none, so each is told, naming no cause.
   */
  async modeSwitched(projectIds: readonly string[]): Promise<void> {
    for (const each of projectIds) {
      await this.opts.inner.publish(each, {
        type: 'elsewhere_changed',
        projectId: each,
        causeProjectId: null,
      });
    }
  }

  private async peopleOf(order: readonly string[]): Promise<Map<string, ReadonlySet<string>>> {
    const people = new Map<string, ReadonlySet<string>>();
    for (const id of order) {
      const { assignments } = await this.opts.directory.assignmentsInProject(id);
      people.set(id, new Set(assignments.map((each) => each.personId)));
    }
    return people;
  }
}

/**
 * `ranks`, announcing each move it makes through {@link ElsewhereFanOut.rankMoved}
 * and each switch of the organization's mode through
 * {@link ElsewhereFanOut.modeSwitched}. The production composition ranks and
 * switches through this; a move that refuses, or a switch to the mode an
 * organization already has, announces nothing.
 *
 * Proof: the announcement dropped made `tells the projects of a shared
 * organization that the rank moved` (`shared-people.controller.db.test.ts`)
 * receive no `elsewhere_changed`; watched 2026-09-29.
 */
export function announcingSharingChanges(
  ranks: ProjectRankStore & SharedPeopleStore,
  fanOut: Pick<ElsewhereFanOut, 'rankMoved' | 'modeSwitched'>,
): ProjectRankStore & SharedPeopleStore {
  return {
    orderIn: (organizationId) => ranks.orderIn(organizationId),
    async moveAfter(organizationId, projectId, afterProjectId, stamp) {
      const moved = await ranks.moveAfter(organizationId, projectId, afterProjectId, stamp);
      if (moved.ok) await fanOut.rankMoved(projectId);
      return moved;
    },
    sharedPeopleIn: (organizationId) => ranks.sharedPeopleIn(organizationId),
    // Proof: the announcement dropped made `tells every project when the
    // organization switches, and nothing for no switch`
    // (`shared-people-mode.controller.db.test.ts`) record no
    // `elsewhere_changed`; watched 2026-09-29.
    async setSharedPeople(organizationId, shared, stamp, auditId) {
      const set = await ranks.setSharedPeople(organizationId, shared, stamp, auditId);
      if (set.changed) {
        const order = await ranks.orderIn(organizationId);
        await fanOut.modeSwitched(order.map((each) => each.projectId));
      }
      return set;
    },
  };
}

/** One text per set of bookings: persons in byte order, each's bookings by start. */
function signatureOf(bookings: RunningBookings): string {
  return JSON.stringify(
    [...bookings]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([person, held]) => [
        person,
        [...held]
          .sort((a, b) => a.start - b.start || a.end - b.end)
          .map(({ start, end, workItemId }) => [start, end, workItemId]),
      ]),
  );
}
