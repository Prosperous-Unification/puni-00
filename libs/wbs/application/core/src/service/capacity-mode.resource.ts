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
   * @throws when trusted scope and principal identity disagree before any fact read.
   */
  async read(
    access: ResourceAccess,
    delegated: boolean,
  ): Promise<CapacityModeOutcome<'organization_required'>> {
    if (access.kind === 'legacy') return { ok: false, refusal: 'organization_required' };
    // Proof: mode-read-access-snapshot: retaining caller scoped-evidence aliases across an await.
    // retains direct mode read scoped evidence before its awaited dependency
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    // Proof: mode-read-access-auth-deep: shallow scope copying retains nested authentication aliases.
    // retains mode read scoped authentication before its awaited fact read
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    access = structuredClone(access);
    // Proof: mode-read-identity: omitting authenticated principal identity equality.
    // rejects direct mode read principal mismatch before grant and fact reads
    // throws before facts for a missing direct mode read grant principal
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    if (access.scope.userId !== access.principal.id)
      throw new Error('capacity-mode resource principal differs from its member');
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

  /** Retains complete actor and scoped evidence; incoherent identities throw before authorization. */
  async switch(
    actor: AuthenticatedUser,
    access: ResourceAccess,
    sharedPeople: boolean,
    delegated: boolean,
  ): Promise<CapacityModeOutcome> {
    if (access.kind === 'legacy') return { ok: false, refusal: 'organization_required' };
    // An organization act that moves every project's dates is a person's,
    // never a delegation's, as member administration is.
    // Proof: mode-switch-actor-snapshot: retaining complete actor aliases across the grant await.
    // retains direct mode switch actor id before awaited grant evaluation
    // retains direct mode switch actor authentication before awaited grant evaluation
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    // Proof: mode-switch-actor-auth-deep: shallow actor copying retains verifier metadata aliases.
    // retains direct mode switch actor authentication before awaited grant evaluation
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    actor = structuredClone(actor);
    const actorId = actor.id;
    // Proof: mode-switch-access-snapshot: retaining caller scoped-evidence aliases across an await.
    // retains direct mode switch scoped evidence before its awaited dependency
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    // Proof: mode-switch-access-auth-deep: shallow scope copying retains nested authentication aliases.
    // retains direct mode switch access authentication before awaited grant evaluation
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    access = structuredClone(access);
    // Proof: mode-switch-scope-identity: omitting actor/member identity equality.
    // rejects direct mode switch scope mismatch before grant and fact reads
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    // Proof: mode-switch-principal-identity: omitting authenticated principal identity equality.
    // rejects direct mode switch principal mismatch before grant and fact reads
    // throws before facts for a missing direct mode switch grant principal
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    if (access.scope.userId !== actorId || access.principal.id !== actorId)
      throw new Error('capacity-mode resource authority differs from its actor');
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
