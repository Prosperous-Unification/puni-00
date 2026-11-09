import type { AuthenticatedUser } from '@wbs/contracts';
import type { Permission } from '@wbs/domain';
import type { CapacityMode } from '@wbs/domain';

import type { AccessDecisions } from '../ports/access-decisions';
import type { Clock } from '../ports/clock';
import type { RefusedOrganizationAccess } from '../ports/organization-access';
import type { ResourceAccess } from '../ports/organization-access';
import type { CapacityModeSwitch } from '../ports/project-rank-store';
import { authorize } from './authorize';

export type CapacityModeRefusal =
  'organization_required' | 'forbidden' | 'insufficient_scope' | 'capacity_mode_unsupported';

/**
 * Whether `access` may switch its organization's capacity mode: a super-admin
 * acting in person, never through a delegation. The one rule both the read's
 * `canSwitch` and the switch's admission use, so they cannot disagree.
 *
 * Proof: 2026-10-11, the role widened to admins failed four cases of
 * `capacity-mode.controller.db.test.ts` (admin refusals, demotion, `tells only
 * a super-admin …`); the delegation clause dropped failed the delegated read
 * and switch in `delegation.controller.db.test.ts`.
 */
export function maySwitchCapacityMode(
  access: Extract<ResourceAccess, { kind: 'scoped' }>,
  delegated: boolean,
): boolean {
  return !delegated && roleMaySwitchCapacityMode(access.scope.role);
}

/**
 * The role half of {@link maySwitchCapacityMode}, which the write turn
 * re-checks on the writer (`authorizeModeSwitchIn`) with no delegation to see.
 */
export function roleMaySwitchCapacityMode(
  role: Extract<ResourceAccess, { kind: 'scoped' }>['scope']['role'],
): boolean {
  return role === 'super_admin';
}

export type CapacityModeOutcome<R extends CapacityModeRefusal = CapacityModeRefusal> =
  | { ok: true; sharedPeople: boolean; sharingAvailable: boolean; canSwitch: boolean }
  | { ok: false; refusal: R; readonly permission?: Permission }
  | { ok: false; authority: RefusedOrganizationAccess };

export interface CapacityModeResourceOptions {
  accessDecisions?: AccessDecisions;
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
 * Any current member reads it. Switching requires current
 * organization.manage_capacity_mode and an authenticated nondelegated account.
 * A mode this release cannot run is refused before anything is written, so a
 * route never stores a mode the swap and the restore would then refuse. Under
 * legacy access there is no organization, so both answer
 * `organization_required`.
 */
export class CapacityModeResource {
  constructor(private readonly opts: CapacityModeResourceOptions) {}

  /**
   * The mode, whether the release can share people, and whether this caller may switch: the
   * same current permission {@link switch} requires, and never through a delegation.
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
      canSwitch:
        !delegated &&
        (
          await authorize(
            this.opts.accessDecisions,
            access.principal,
            { kind: 'organization', organizationId: access.scope.organizationId },
            'organization.manage_capacity_mode',
          )
        ).ok,
    };
  }

  async switch(
    actor: AuthenticatedUser,
    access: ResourceAccess,
    sharedPeople: boolean,
    delegated: boolean,
  ): Promise<CapacityModeOutcome> {
    if (access.kind === 'legacy') return { ok: false, refusal: 'organization_required' };
    // An organization act that moves every project's dates is a person's,
    // never a delegation's, as member administration is.
    actor = structuredClone(actor);
    const actorId = actor.id;
    const decision = await authorize(
      this.opts.accessDecisions,
      access.principal,
      { kind: 'organization', organizationId: access.scope.organizationId },
      'organization.manage_capacity_mode',
    );
    // Proof: mode-public-grant fault failed 'refuses public capacity-mode authority before a broken' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
    if (delegated || !decision.ok)
      return delegated
        ? { ok: false, refusal: 'insufficient_scope' }
        : { ok: false, refusal: 'forbidden', permission: 'organization.manage_capacity_mode' };
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
      { kind: 'human', principal: actor, expectedAccess: access },
    );
    if (!switched.ok && 'authority' in switched) return switched;
    if (!switched.ok)
      return {
        ok: false,
        refusal: switched.reason,
        ...(switched.permission === undefined ? {} : { permission: switched.permission }),
      };
    return { ok: true, sharedPeople, sharingAvailable: this.sharingAvailable(), canSwitch: true };
  }

  private sharingAvailable(): boolean {
    return this.opts.supported.includes('shared');
  }
}
