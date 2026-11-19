import { type CapacityLimitCrossed, refuseCapacityStatement } from '@wbs/domain';

import type { CapacityStore, TeamCapacity } from '../../ports/capacity-store';
import type { Clock } from '../../ports/clock';
import type { EditAdmission } from '../../ports/edit-admission';
import type { ResourceAccess } from '../../ports/organization-access';
import type { OrganizationLimitGauge } from '../../ports/organization-limits';
import type { Broadcaster } from '../../ports/work-package-event';
import type { WorkPackageStore } from '../../ports/work-package-store';
import type { ResourceCapacity, ResourceCapacityStore } from '../../ports/resource-capacity-store';

export interface CapacityServiceOptions {
  workPackages: Pick<WorkPackageStore,'findById'>;
  capacity: CapacityStore;
  /** How many units of each resource a work package's plan may use (`wbs-resources`). */
  resourceCapacity: ResourceCapacityStore;
  /**
   * The organization limits a resource capacity statement consults
   * (`wbs-organization-limits` L9), read in the batch's own transaction.
   * Absent from the public graph and from legacy fixture graphs; a raised
   * statement under scoped access without it throws rather than admitting
   * uncapped.
   */
  organizationLimits?: OrganizationLimitGauge;
  broadcast: Broadcaster;
  /**
   * Ordinary legacy edits use `LEGACY_EDIT_ADMISSION`
   * outside a batch that established wider authority. See {@link EditAdmission}.
   */
  admission: EditAdmission;
  /** The instant every write is dated from and the ids it mints — see {@link Clock}. */
  clock: Clock;
}

/** Why a capacity write did not happen. */
export type CapacityRefusal = 'not_found' | 'forbidden';

export type CapacityOutcome =
  { ok: true; value: TeamCapacity[] } | { ok: false; reason: CapacityRefusal };

/** What a resource capacity write answered: the work package's stated pairs, or why not. */
export type ResourceCapacityOutcome =
  | { ok: true; value: ResourceCapacity[] }
  | { ok: false; reason: CapacityRefusal | 'unknown_resource' }
  | ({ ok: false; reason: 'capacity_limit' } & CapacityLimitCrossed);

/**
 * How many of each team a work package may have at work at once.
 *
 * A service of its own rather than four methods on {@link DirectoryService},
 * because the fact is a **work package's** and not the directory's. That is not
 * bookkeeping: the directory's writes are open to every authenticated account —
 * Dany, 2026-08-06, "the list is global for all work packages, anyone can add one" —
 * and this one is not (see {@link CapacityService.set}).
 */
export class CapacityService {
  private readonly clock: Clock;

  constructor(private readonly opts: CapacityServiceOptions) {
    this.clock = opts.clock;
  }

  listFor(workPackageId: string): Promise<TeamCapacity[]> {
    return this.opts.capacity.listFor(workPackageId);
  }

  /**
   * Sets this work package's capacity for one team, or clears it to unstated on
   * `null`.
   *
   * **Gated by {@link CapacityServiceOptions.admission}**, unlike C2's `resizeTeam` was. The two are not
   * inconsistent: C2 wrote a row in the global directory, which every account may
   * edit, and this writes a number that moves one work package's dates — which is
   * exactly the class of write `WorkPackageService.update` and every work-item
   * mutation gate. A restricted work package's plan would otherwise be re-scheduled by
   * anybody who could read it.
   *
   * **Announced to the work package it names and to no other**, which is the whole of
   * the change from C2. C2's size write fanned out to every work package the team
   * labelled, and its JSDoc argued the fan-out was a stronger claim on a size
   * than on a rename because "a size moves every date in the plan". Both halves
   * still hold; the set of plans a capacity write moves is now one.
   *
   * The event is `capacity_changed` rather than `directory_changed` — the name
   * being true is the only thing that decides it, because fe-01 reads every
   * work package event as "read again" and never inspects the type. See
   * {@link WorkPackageEvent} and `capacity-per-work-package`'s design.md D6.
   *
   * **Not journalled, and therefore not undoable.** Not for C2's reason — the
   * directory not being journalled — but for `estimateMethod`'s and
   * `startDate`'s: those are work package facts with no undo either, and a capacity
   * touches no work item whose revision an undo entry could be pinned to.
   *
   * The number is validated at the controller, which is the only place a value
   * that is not a whole number of 1 to `MOST_PEOPLE_AT_ONCE` can enter. A 0 here
   * would be a pool of no slots and a plan of `Infinity` dates.
   *
   * Answers the work package's **whole** list rather than the one pair written, so a
   * client redraws from one response instead of merging a patch into a list it
   * read earlier — the shape the payload carries it in.
   */
  async set(
    workPackageId: string,
    actorId: string,
    serviceTeamId: string,
    size: number | null,
  ): Promise<CapacityOutcome> {
    const workPackage = await this.opts.workPackages.findById(workPackageId);
    if (workPackage === null) return { ok: false, reason: 'not_found' };
    if (!this.opts.admission.admits(workPackage, actorId))
      return { ok: false, reason: 'forbidden' };
    const stamp = this.clock.stampFor(actorId);
    const written = await this.opts.capacity.set(workPackageId, serviceTeamId, size, stamp);
    // The store read both ids inside its own transaction, so this is the team
    // having gone between the two reads above and that write — or an id nothing
    // ever held. Either way it is `not_found`, and the work package's own absence was
    // already answered above.
    if (!written.ok) return { ok: false, reason: 'not_found' };
    await this.opts.broadcast.publish(workPackageId, { type: 'capacity_changed' });
    return { ok: true, value: await this.opts.capacity.listFor(workPackageId) };
  }

  /** The work package's stated resource pairs, in resource-id order: its resource settings. */
  listResourceCapacitiesFor(workPackageId: string): Promise<ResourceCapacity[]> {
    return this.opts.resourceCapacity.listFor(workPackageId);
  }

  /**
   * Sets this work package's capacity for one resource, or clears it to unstated on
   * `null` — {@link CapacityService.set} exactly, for a resource (`wbs-resources`
   * R1): gated by the edit admission, announced as `capacity_changed` to this
   * work package alone, not journalled, answering the work package's whole list. A number
   * stated for a resource nothing on the plan demands is kept (remembered) and
   * applies again when a demand returns; only `null` takes it away. Units are
   * bounded at the boundary, from 0.
   *
   * Under scoped access a statement raising the work package's units of the
   * resource is refused `capacity_limit` when the organization's other
   * work packages' units plus the asked units exceed its cap
   * ({@link refuseCapacityWithin}); clearing, restating and lowering never
   * consult it (L9, L11).
   */
  async setForResource(
    workPackageId: string,
    actorId: string,
    resourceId: string,
    units: number | null,
    access: ResourceAccess,
  ): Promise<ResourceCapacityOutcome> {
    const workPackage = await this.opts.workPackages.findById(workPackageId);
    if (workPackage === null) return { ok: false, reason: 'not_found' };
    if (!this.opts.admission.admits(workPackage, actorId))
      return { ok: false, reason: 'forbidden' };
    // Proof, watched 2026-10-22 in capacity-limit.controller.db.test.ts: with
    // this check removed, `refuses a statement past the cap, naming the four
    // numbers and writing nothing` and five more statement cases applied
    // (6 pass, 6 fail).
    if (units !== null) {
      const crossed = await this.refuseCapacityWithin(access, workPackageId, resourceId, units);
      if (crossed !== null) return { ok: false, reason: 'capacity_limit', ...crossed };
    }
    const stamp = this.clock.stampFor(actorId);
    const written = await this.opts.resourceCapacity.set(workPackageId, resourceId, units, stamp);
    // Read inside the store's transaction: the work package went between the read above
    // and the write, or the resource is one nothing holds.
    if (!written.ok)
      return {
        ok: false,
        reason: written.reason === 'unknown_work_package' ? 'not_found' : 'unknown_resource',
      };
    await this.opts.broadcast.publish(workPackageId, { type: 'capacity_changed' });
    return { ok: true, value: await this.opts.resourceCapacity.listFor(workPackageId) };
  }

  /**
   * Whether stating `asked` units of `resourceId` in `workPackageId` would make
   * the organization's work packages state more of it than its cap allows
   * (`wbs-organization-limits` L2, L9), decided by
   * {@link refuseCapacityStatement}: null when they fit, when the statement
   * does not raise the work package's own, or under legacy access, which has no
   * organization to own a cap (the modeled optional case).
   *
   * The work package's own units and the others' sum are read through the stores
   * this graph was built over, which for a batch is its own `BEGIN IMMEDIATE`
   * under its write turn (L10), so they include a statement written earlier
   * in the same batch.
   *
   * Proof, each watched 2026-10-22 in capacity-limit.controller.db.test.ts:
   * with legacy access answered as a refusal, `states past any cap with no
   * organization to own one` was refused (11 pass, 1 fail); with the work package's
   * own units counted (another work package excepted in its place), `raises a
   * workPackage’s own statement within the cap, its own units not counted` and
   * three more were refused (8 pass, 4 fail).
   *
   * @throws when this graph was composed without organization limits.
   */
  private async refuseCapacityWithin(
    access: ResourceAccess,
    workPackageId: string,
    resourceId: string,
    asked: number,
  ): Promise<CapacityLimitCrossed | null> {
    if (access.kind === 'legacy') return null;
    const gauge = this.opts.organizationLimits;
    if (gauge === undefined)
      throw new Error(
        'a resource capacity was stated under scoped access without organization limits',
      );
    const held = (await this.opts.resourceCapacity.listFor(workPackageId)).find(
      (each) => each.resourceId === resourceId,
    );
    const reading = await gauge.readCapacityCap(
      access.scope.organizationId,
      resourceId,
      workPackageId,
    );
    return refuseCapacityStatement({
      resourceId,
      cap: reading.cap,
      declared: reading.current,
      held: held?.units ?? 0,
      asked,
    });
  }
}
