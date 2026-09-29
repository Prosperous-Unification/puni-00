import type { Clock } from '../ports/clock';
import type { ResourceAccess } from '../ports/organization-access';
import type { SharedPeopleStore } from '../ports/project-rank-store';

export type SharedPeopleRefusal = 'organization_required' | 'forbidden';

export type SharedPeopleOutcome<R extends SharedPeopleRefusal = SharedPeopleRefusal> =
  { ok: true; sharedPeople: boolean } | { ok: false; refusal: R };

export interface SharedPeopleResourceOptions {
  /** In production, the store the fan-out announces every switch through. */
  sharedPeople: SharedPeopleStore;
  clock: Pick<Clock, 'stampFor' | 'newId'>;
}

/**
 * An organization's capacity mode (`share-people-across-projects`, spec
 * `shared-people-mode`, ADR 0034): whether its projects are scheduled around
 * each other's bookings. Isolated by default.
 *
 * Any current member reads it. Only a super-admin switches it, because a
 * switch moves every project's dates; an admin, who can rank projects, cannot.
 * Every switch is audited, and switching back restores each project's
 * isolated dates, because bookings are derived and never stored. Under legacy
 * access there is no organization, so both answer `organization_required`.
 */
export class SharedPeopleResource {
  constructor(private readonly opts: SharedPeopleResourceOptions) {}

  async read(access: ResourceAccess): Promise<SharedPeopleOutcome<'organization_required'>> {
    if (access.kind === 'legacy') return { ok: false, refusal: 'organization_required' };
    return {
      ok: true,
      sharedPeople: await this.opts.sharedPeople.sharedPeopleIn(access.scope.organizationId),
    };
  }

  /**
   * Proof: the role check widened to admins made `refuses an admin the
   * switch, keeping the organization isolated`
   * (`shared-people-mode.controller.db.test.ts`) answer 200; watched
   * 2026-09-29.
   */
  async switch(
    actorId: string,
    access: ResourceAccess,
    shared: boolean,
  ): Promise<SharedPeopleOutcome> {
    if (access.kind === 'legacy') return { ok: false, refusal: 'organization_required' };
    if (access.scope.role !== 'super_admin') return { ok: false, refusal: 'forbidden' };
    await this.opts.sharedPeople.setSharedPeople(
      access.scope.organizationId,
      shared,
      this.opts.clock.stampFor(actorId),
      this.opts.clock.newId(),
    );
    return { ok: true, sharedPeople: shared };
  }
}
