import {
  cleanName,
  decideMeasureCreate,
  decideMeasurePatch,
  mayDefineMeasuresInOrganization,
  type MeasureDefinition,
  type MeasureDefinitionPatch,
  type MeasureDefinitionRefusal,
  type MeasureKind,
  type MeasureScale,
  nextMeasureOrder,
  refuseMeasureRemoval,
} from '@wbs/domain';

import type { Clock } from '../../ports/clock';
import type { DirectoryStore } from '../../ports/directory-store';
import type { ResourceAccess } from '../../ports/organization-access';

/**
 * Why a measure definition read or write was refused (`wbs-measure-budgets`
 * D1, D2), each a state rather than a fault:
 *
 * - the domain's {@link MeasureDefinitionRefusal}s and `measure_in_use`;
 * - `organization_required`: legacy access while no organization is marked
 *   legacy, so nothing owns a definition (`add-spaces`' answer, design D9);
 * - `not_found`: an id the organization does not hold, another
 *   organization's included, so a foreign definition is indistinguishable
 *   from an absent one;
 * - `name_required` and `nothing_to_change`, as for every directory write;
 * - `forbidden`: a scoped caller who is neither an admin nor a super-admin
 *   (design D70), answered before anything is read.
 */
export type MeasureRefusalReason =
  | MeasureDefinitionRefusal
  | 'measure_in_use'
  | 'forbidden'
  | 'organization_required'
  | 'not_found'
  | 'name_required'
  | 'nothing_to_change';

/** What a measure definition read or write answered. */
export type MeasureOutcome<T> =
  { ok: true; value: T } | { ok: false; reason: MeasureRefusalReason };

/**
 * A create as the command boundary normalized it: key, unit, kind, scale,
 * order and currency already have their shape; the flags default false, the
 * order to after every held definition, and the currency to none.
 */
export interface MeasureInput {
  key: string;
  name: string;
  unit: string;
  kind: MeasureKind;
  scale: MeasureScale;
  threePoint?: boolean;
  showByDefault?: boolean;
  schedulesWork?: boolean;
  order?: number;
  currency?: string | null;
}

export interface MeasureDefinitionsOptions {
  directory: DirectoryStore;
  clock: Clock;
  /**
   * Whether the service was built for public standalone writes, where no
   * batch's unit of work encloses a write; measure writes refuse there.
   */
  standalone: boolean;
}

/**
 * The organization's measure definitions through the caller's access
 * (`wbs-measure-budgets` D1, D2, D9): the active organization's under scoped
 * access, the legacy organization's under legacy access.
 *
 * Every write decides from the definitions it reads first, inside the batch's
 * unit of work, so the read and the write are one transaction; the store's
 * unique indexes are the backstop. Nothing is announced: no project row names
 * a definition yet, and the directory journals nothing, so a definition write
 * has no undo (design D11).
 */
export class MeasureDefinitions {
  constructor(private readonly opts: MeasureDefinitionsOptions) {}

  /**
   * The organization's definitions in list order.
   *
   * Proof: with {@link ownerOf} answering the legacy organization under
   * scoped access too, `lists each organization’s own definitions, seeded at
   * its creation` and four more cases of
   * `measure-organization.controller.db.test.ts` failed; watched 2026-10-23.
   */
  async listWithin(
    access: ResourceAccess,
  ): Promise<
    { ok: true; value: MeasureDefinition[] } | { ok: false; reason: 'organization_required' }
  > {
    const owner = await this.ownerOf(access);
    if (owner === null) return { ok: false, reason: 'organization_required' };
    return { ok: true, value: await this.opts.directory.listMeasures(owner) };
  }

  /** Defines a measure; see {@link decideMeasureCreate} for the refusals. */
  async addWithin(
    actorId: string,
    input: MeasureInput,
    access: ResourceAccess,
  ): Promise<MeasureOutcome<MeasureDefinition>> {
    this.refuseStandaloneWrite();
    // Proof: with this refusal skipped, `refuses a member every definition
    // write, an admin and a super-admin allowed` (measure-organization.controller.db.test.ts)
    // answered the member's createMeasure 200; watched 2026-10-24.
    if (!mayDefineMeasures(access)) return { ok: false, reason: 'forbidden' };
    const owner = await this.ownerOf(access);
    if (owner === null) return { ok: false, reason: 'organization_required' };
    const name = cleanName(input.name);
    if (name === null) return { ok: false, reason: 'name_required' };
    const held = await this.opts.directory.listMeasures(owner);
    const measure: MeasureDefinition = {
      id: this.opts.clock.newId(),
      key: input.key,
      name,
      unit: input.unit,
      kind: input.kind,
      scale: input.scale,
      threePoint: input.threePoint ?? false,
      showByDefault: input.showByDefault ?? false,
      schedulesWork: input.schedulesWork ?? false,
      derived: false,
      order: input.order ?? nextMeasureOrder(held),
      currency: input.currency ?? null,
    };
    // Proof: with this decision skipped, `requires a currency on money and
    // refuses one elsewhere` (measure-command.test.ts) stored a money
    // definition with no currency on the memory store, and the scheduling and
    // key refusals were left to the store's index twin alone; watched 2026-10-23.
    const refused = decideMeasureCreate(held, measure);
    if (refused !== null) return { ok: false, reason: refused };
    const added = await this.opts.directory.addMeasure(
      owner,
      measure,
      this.opts.clock.stampFor(actorId),
    );
    return added.ok ? { ok: true, value: added.measure } : added;
  }

  /** Changes a definition; see {@link decideMeasurePatch} for the refusals. */
  async patchWithin(
    measureId: string,
    actorId: string,
    patch: MeasureDefinitionPatch,
    access: ResourceAccess,
  ): Promise<MeasureOutcome<MeasureDefinition>> {
    this.refuseStandaloneWrite();
    // Proof: with this refusal skipped, `refuses a member every definition
    // write, an admin and a super-admin allowed` (measure-organization.controller.db.test.ts)
    // answered the member's patchMeasure 200; watched 2026-10-24.
    if (!mayDefineMeasures(access)) return { ok: false, reason: 'forbidden' };
    if (Object.values(patch).every((value) => value === undefined))
      return { ok: false, reason: 'nothing_to_change' };
    const owner = await this.ownerOf(access);
    if (owner === null) return { ok: false, reason: 'organization_required' };
    const name = patch.name === undefined ? undefined : cleanName(patch.name);
    if (name === null) return { ok: false, reason: 'name_required' };
    const held = await this.opts.directory.listMeasures(owner);
    const target = held.find((each) => each.id === measureId);
    if (target === undefined) return { ok: false, reason: 'not_found' };
    const decided = decideMeasurePatch(held, target, {
      ...patch,
      ...(name === undefined ? {} : { name }),
    });
    // Proof: answering the target unchanged here made `refuses a patch that
    // would move the key, the shape or the scheduling measure`
    // (measure-command.test.ts) answer ok; watched 2026-10-23.
    if (!decided.ok) return decided;
    const written = await this.opts.directory.patchMeasure(
      owner,
      decided.next,
      this.opts.clock.stampFor(actorId),
    );
    return written.ok ? { ok: true, value: written.measure } : written;
  }

  /** Removes a definition the organization defined; see {@link refuseMeasureRemoval}. */
  async removeWithin(
    measureId: string,
    actorId: string,
    access: ResourceAccess,
  ): Promise<MeasureOutcome<null>> {
    this.refuseStandaloneWrite();
    // Proof: with this refusal skipped, `refuses a member every definition
    // write, an admin and a super-admin allowed` (measure-organization.controller.db.test.ts)
    // answered the member's deleteMeasure of tokens 409 measure_in_use instead
    // of 403; watched 2026-10-24.
    if (!mayDefineMeasures(access)) return { ok: false, reason: 'forbidden' };
    const owner = await this.ownerOf(access);
    if (owner === null) return { ok: false, reason: 'organization_required' };
    const target = (await this.opts.directory.listMeasures(owner)).find(
      (each) => each.id === measureId,
    );
    if (target === undefined) return { ok: false, reason: 'not_found' };
    // Proof: with this refusal skipped, `refuses removing a seeded definition`
    // (measure-command.test.ts) removed `tokens`; watched 2026-10-23.
    const refused = refuseMeasureRemoval(
      target,
      await this.opts.directory.usageOfMeasure(owner, measureId),
    );
    if (refused !== null) return { ok: false, reason: refused };
    const removed = await this.opts.directory.removeMeasure(
      owner,
      measureId,
      this.opts.clock.stampFor(actorId),
    );
    return removed.ok ? { ok: true, value: null } : removed;
  }

  /** The organization owning the caller's definitions, or null when legacy access finds none. */
  private async ownerOf(access: ResourceAccess): Promise<string | null> {
    if (access.kind === 'scoped') return access.scope.organizationId;
    return this.opts.directory.legacyOrganizationId();
  }

  /**
   * Measure writes run inside a command batch and nowhere else, like resource
   * writes: a standalone-built service reaching here is a composition fault.
   *
   * @throws when this service was built for standalone writes.
   */
  private refuseStandaloneWrite(): void {
    if (this.opts.standalone) throw new Error('measure writes run only inside a command batch');
  }
}

/**
 * Whether `access` may write measure definitions (design D70): under scoped
 * access an admin or a super-admin; legacy access carries no role, and every
 * legacy caller already writes the whole directory, so it may.
 */
function mayDefineMeasures(access: ResourceAccess): boolean {
  return access.kind === 'legacy' || mayDefineMeasuresInOrganization(access.scope.role);
}
