import { influencersOf, type RunningBookings } from '../module/work-item/elsewhere-chain';
import type { DirectoryStore } from '../ports/directory-store';
import type { Broadcaster, ProjectEvent } from '../ports/project-event';
import type { ProjectRankStore } from '../ports/project-rank-store';
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
 * influences, which re-reads, re-solves and misses a sequence-keyed memo. A
 * rename moves no booking and publishes nothing; a fresh process fans out once
 * per project, harmlessly. Blue and green each keep their own signatures.
 *
 * Under `isolated` it reads nothing beyond the mode, and a project whose
 * bookings are unknowable here (an engine not installed) always fans out.
 */
export class ElsewhereFanOut implements Broadcaster {
  /** The bookings signature each project last fanned out for, one per project. */
  private readonly published = new Map<string, string>();

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
    const bookings = await this.opts.bookingsOf(projectId);
    if (bookings === null) return;
    const signature = bookings instanceof Map ? signatureOf(bookings) : null;
    // Proof: this comparison removed made `publishes nothing below for a
    // rename, and tells it of a longer booking`
    // (`shared-people.controller.db.test.ts`) record one `elsewhere_changed`
    // for the rename; watched 2026-09-29.
    if (signature !== null && this.published.get(projectId) === signature) return;
    if (signature !== null) this.published.set(projectId, signature);
    const peopleOf = await this.peopleOf(sharing.order);
    const below = sharing.order.slice(sharing.order.indexOf(projectId) + 1);
    for (const each of below) {
      if (!influencersOf(each, sharing.order, peopleOf).includes(projectId)) continue;
      await this.opts.inner.publish(each, {
        type: 'elsewhere_changed',
        projectId: each,
        causeProjectId: projectId,
      });
    }
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
 * `ranks`, announcing each move it makes through {@link ElsewhereFanOut.rankMoved}.
 * The production composition ranks through this; a move that refuses
 * announces nothing.
 *
 * Proof: the announcement dropped made `tells the projects of a shared
 * organization that the rank moved` (`shared-people.controller.db.test.ts`)
 * receive no `elsewhere_changed`; watched 2026-09-29.
 */
export function announcingRankMoves(
  ranks: ProjectRankStore,
  fanOut: Pick<ElsewhereFanOut, 'rankMoved'>,
): ProjectRankStore {
  return {
    orderIn: (organizationId) => ranks.orderIn(organizationId),
    async moveAfter(organizationId, projectId, afterProjectId, stamp) {
      const moved = await ranks.moveAfter(organizationId, projectId, afterProjectId, stamp);
      if (moved.ok) await fanOut.rankMoved(projectId);
      return moved;
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
