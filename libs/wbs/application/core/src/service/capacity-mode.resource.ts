import type { CapacityMode } from '@wbs/domain';

import type { Clock } from '../ports/clock';
import type { ResourceAccess } from '../ports/organization-access';
import type { CapacityModeSwitch } from '../ports/project-rank-store';

export type CapacityModeRefusal =
  'organization_required' | 'forbidden' | 'capacity_mode_unsupported';

export type CapacityModeOutcome<R extends CapacityModeRefusal = CapacityModeRefusal> =
  | { ok: true; sharedPeople: boolean; sharingAvailable: boolean; canSwitch: boolean }
  | { ok: false; refusal: R };

export interface CapacityModeResourceOptions {
  /** In production, the owner that audits each switch and tells every project. */
  modes: CapacityModeSwitch;
  clock: Pick<Clock, 'stampFor' | 'newId'>;
  /** The modes this release can run; `SUPPORTED_CAPACITY_MODES` in production. */
  supported: readonly CapacityMode[];
}

/**
 * An organization's capacity mode (`share-people-across-projects`, spec
 * `shared-people-mode`, ADR 0034): whether its projects are scheduled around
 * each other's bookings. Isolated by default.
 *
 * Any current member reads it. Only a super-admin switches it, because a
 * switch moves every project's dates; an admin, who can rank projects, cannot.
 * A mode this release cannot run is refused before anything is written, so a
 * route never stores a mode the swap and the restore would then refuse. Under
 * legacy access there is no organization, so both answer
 * `organization_required`.
 */
export class CapacityModeResource {
  constructor(private readonly opts: CapacityModeResourceOptions) {}

  /**
   * The mode, whether the release can share people, and whether this caller may switch: the
   * same super-admin rule {@link switch} refuses on, and never through a delegation.
   */
  async read(
    access: ResourceAccess,
    delegated: boolean,
  ): Promise<CapacityModeOutcome<'organization_required'>> {
    if (access.kind === 'legacy') return { ok: false, refusal: 'organization_required' };
    const mode = await this.opts.modes.capacityModeIn(access.scope.organizationId);
    return {
      ok: true,
      sharedPeople: mode === 'shared',
      sharingAvailable: this.sharingAvailable(),
      // Proof: the role clause widened to every in-person member failed `tells
      // only a super-admin acting in person that they may switch`
      // (`capacity-mode.controller.db.test.ts`); dropping the delegation clause
      // failed the delegated read in `delegation.controller.db.test.ts`;
      // watched 2026-10-11.
      canSwitch: !delegated && access.scope.role === 'super_admin',
    };
  }

  async switch(
    actorId: string,
    access: ResourceAccess,
    sharedPeople: boolean,
  ): Promise<CapacityModeOutcome> {
    if (access.kind === 'legacy') return { ok: false, refusal: 'organization_required' };
    // Proof: this check widened to admins made `refuses an admin the switch,
    // keeping the organization isolated` (`capacity-mode.controller.db.test.ts`)
    // fail; watched 2026-10-11.
    if (access.scope.role !== 'super_admin') return { ok: false, refusal: 'forbidden' };
    const mode: CapacityMode = sharedPeople ? 'shared' : 'isolated';
    // Proof: this check removed made `refuses shared people this release cannot
    // run` (`capacity-mode.controller.db.test.ts`) fail; watched 2026-10-11.
    if (!this.opts.supported.includes(mode))
      return { ok: false, refusal: 'capacity_mode_unsupported' };
    const switched = await this.opts.modes.switchCapacityMode(
      access.scope.organizationId,
      mode,
      this.opts.clock.stampFor(actorId),
      this.opts.clock.newId(),
    );
    if (!switched.ok) return { ok: false, refusal: switched.reason };
    return { ok: true, sharedPeople, sharingAvailable: this.sharingAvailable(), canSwitch: true };
  }

  private sharingAvailable(): boolean {
    return this.opts.supported.includes('shared');
  }
}
