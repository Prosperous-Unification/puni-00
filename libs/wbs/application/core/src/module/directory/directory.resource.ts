import {
  cleanName,
  type LimitCrossed,
  mayBindAccountInOrganization,
  type OrganizationScope,
  PERSON_KINDS,
  type PersonKind,
  refuseLimit,
  type ResourceKind,
} from '@wbs/domain';

import type { Clock } from '../../ports/clock';
import type { DirectoryOutcome } from '../../ports/directory-outcome';
import type {
  DirectoryCatalog,
  DirectoryCatalogRows,
  DirectoryRemoved,
  DirectoryStore,
  DirectoryUsageRows,
  MachineCredentialReach,
  NamedCatalog,
  Person,
  PersonPatch,
  PersonWithTeams,
  Resource,
  ResourcePatch,
  ResourceUsageRows,
  ServiceTeam,
  TeamPatch,
  TeamWithServices,
  TouchedProjects,
} from '../../ports/directory-store';
import type {
  DirectoryWriteAddress,
  DirectoryWriteResolution,
} from '../../ports/fanout-capture-store';
import type { ResourceAccess } from '../../ports/organization-access';
import type { OrganizationLimitGauge } from '../../ports/organization-limits';
import type { Broadcaster } from '../../ports/project-event';
import type { ExternalSystem, Service, Tag, WorkItemType } from '../../ports/work-item-store';
import type { WriteStamp } from '../../ports/write-stamp';
import {
  type DirectoryUsage,
  directoryUsageOfPerson,
  directoryUsageOfResource,
  directoryUsageOfService,
  directoryUsageOfTag,
  directoryUsageOfTeam,
  directoryUsageOfWorkItemType,
  type ResourceUsageCounts,
} from '../../service/directory-usage';

export type { DirectoryOutcome, DirectoryRefusal } from '../../ports/directory-outcome';

/** How many fresh ids an opaque root name is tried under before a create gives up. */
const OPAQUE_NAME_ATTEMPTS = 3;

export interface DirectoryServiceOptions {
  directory: DirectoryStore;
  /** Explicit per-invocation access for public standalone writes; borrowed graphs omit it. */
  standaloneWrite?: <T>(
    address: DirectoryWriteAddress,
    refuse: (reason: Extract<DirectoryWriteResolution, { ok: false }>['reason']) => T,
    act: (borrowed: DirectoryService) => Promise<T>,
    accepted: (value: T) => boolean,
  ) => Promise<T>;
  /**
   * Required, like the step service's. A directory service built without one
   * would rename somebody assigned across three plans and tell none of them —
   * every other client would keep drawing the old name until somebody
   * reloaded.
   */
  broadcast: Broadcaster;
  /** The instant every write is dated from and the ids it mints — see {@link Clock}. */
  clock: Clock;
  /**
   * The organization limits an agent person's creation consults
   * (`wbs-organization-limits` L9). Absent from legacy fixture graphs and
   * the memory source; a scoped acquisition without it throws.
   */
  organizationLimits?: OrganizationLimitGauge;
}

/**
 * Whether a caller named one of the things a person can be.
 *
 * A narrowing function rather than an inline `includes`, for
 * `work-item.service.ts`' `holdsMetric` reason: the value arrives from a JSON
 * body, so it is genuinely `string` no matter what the route's schema says, and
 * checking it here — beside the write, once — is what keeps the closed set in
 * one place. A copy in the controller would be two lists that must agree.
 */
function holdsKind(kind: string): kind is PersonKind {
  return (PERSON_KINDS as readonly string[]).includes(kind);
}

/** A person patch naming nothing to change: `nothing_to_change`. */
function isEmptyPersonPatch(patch: PersonPatchInput): boolean {
  return (
    patch.name === undefined &&
    patch.teamIds === undefined &&
    patch.kind === undefined &&
    patch.accountId === undefined
  );
}

/**
 * {@link PersonPatch} as it arrives from outside, where `kind` is a `string`.
 *
 * The store's `kind` is a {@link PersonKind} because by then it has been
 * checked; the service's is not, for the reason `setMeasure`'s `metric`
 * parameter is a `string` — a narrower type here would force the controller to
 * cast, and a cast at the route makes `invalid_kind` unreachable through the
 * API that refusal exists for. {@link holdsKind} is what turns one into the
 * other.
 */
export type PersonPatchInput = Omit<PersonPatch, 'kind'> & { kind?: string };

/**
 * How a removal answered.
 *
 * `in_use` carries the **directory usage** rather than a count, because the
 * next request is the same one with `cascade`, and the person confirming has to
 * know what they are agreeing to.
 */
export type RemoveDirectoryOutcome =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'forbidden' }
  | { ok: false; reason: 'in_use'; usage: DirectoryUsage };

/**
 * How a scoped person patch answered: `in_use` when it would unbind or rebind
 * a person unrevoked machine credentials act through, with their count
 * (`wbs-machine-credentials` A12).
 */
export type PersonPatchOutcome =
  DirectoryOutcome<PersonWithTeams> | { ok: false; reason: 'in_use'; usage: DirectoryUsage };

/**
 * How a resource removal answered: `in_use` names the rows that lose a demand
 * and counts the demands, capacities and occupancies (`wbs-resources` R8).
 */
export type RemoveResourceOutcome =
  | { ok: true }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'in_use'; usage: DirectoryUsage; counts: ResourceUsageCounts };

/** What a resource create names; the kind is fixed here and never patched. */
export interface ResourceInput {
  name: string;
  kind: ResourceKind;
  unitLabel: string;
}

/**
 * One **named vocabulary** of the directory — a tag, a work item type, a
 * service — as its three writes see it.
 *
 * The three dimensions had the same three method bodies each, nine in all, and
 * the copies agreed: clean the name, refuse a blank one, mint an id, ask the
 * store, turn `taken` into a refusal carrying the name, announce to the
 * projects the store named. A fourth dimension is where that agreement stops
 * being a fact about the code and becomes something somebody has to keep true
 * in nine places — the argument `directory-page.tsx`'s `writesFor` table
 * already settled on the other tier.
 *
 * The store's own three answers differ in one thing only: the field the written
 * row arrives under (`tag`, `workItemType`, `service`). Each descriptor's
 * `rename` reads that field, which is why this is a descriptor rather than a
 * shared base class.
 *
 * **The store half of the same triple is not collapsed**, deliberately:
 * `repository/directory.ts` writes `addTag`/`addService`/`addWorkItemType` and
 * their three renames as near-copies too, but parameterising them means handing
 * drizzle a table whose shape a generic does not know — `.values()` and
 * `.returning()` would need a cast, and a cast is what the types are for.
 * `plan-commands.ts`'s five triples are left for W4-3's command registry, which
 * is where a per-kind descriptor already has to exist.
 */
interface NamedVocabulary<T> {
  /** What the dimension is called in a refusal nobody has worded. */
  add(row: { id: string; name: string }, stamp: WriteStamp): Promise<T>;
  rename(id: string, name: string, stamp: WriteStamp): Promise<NamedRenamed<T>>;
  /** The fast path's read, before the store's own count inside its transaction. */
  usageOf(id: string): Promise<DirectoryUsageRows>;
  remove(id: string, cascade: boolean, stamp: WriteStamp): Promise<DirectoryRemoved>;
  /** Those rows as the refusal reports them, for this dimension. */
  usageIn(rows: DirectoryUsageRows, id: string): DirectoryUsage;
}

/** What a rename of a named vocabulary answered, whatever it calls the row. */
type NamedRenamed<T> =
  | { ok: true; projectIds: readonly string[]; entity: T }
  | { ok: false; reason: 'taken' | 'not_found' };

/**
 * The global directory of teams and people.
 *
 * Global on purpose, and it is the decision worth arguing with: the same teams
 * and the same people work across projects, and a list per project would be
 * the same names typed again with typos between them. The cost is that anyone
 * on this deployment can see every team and person anyone has ever added — a
 * directory, not a secret. Dany asked for exactly this ("the list is global
 * for all projects, anyone can add one").
 *
 * Adding is idempotent by name so the "type it if it is not in the list"
 * picker cannot make two `Platform`s, and neither can two people typing it at
 * the same moment. So an `add` that answers the row already there writes
 * nothing, and the stamp it built goes unspent — which is the right way round:
 * the recorded author of `Platform` is whoever first typed it, not the second
 * person whose picker resolved to it.
 *
 * Every write here takes an `actorId` even though **none of them is gated by
 * it**: the directory is open to every authenticated account, by decision above,
 * and the actor is carried for the record rather than for permission. Who added
 * `Platform` is exactly the question the audit columns exist to answer, and the
 * directory is the case Dany asked for by name — see ADR 0012.
 */
export class DirectoryService {
  private readonly clock: Clock;

  constructor(private readonly opts: DirectoryServiceOptions) {
    this.clock = opts.clock;
  }

  /**
   * Adds one named row to a vocabulary, or refuses a name that is only
   * whitespace — an unnamed anything helps nobody find anything.
   *
   * `null` rather than a throw: a blank name is a modeled refusal the
   * controller answers as a 400.
   */
  private async addNamed<T>(
    vocabulary: NamedVocabulary<T>,
    actorId: string,
    name: string,
  ): Promise<T | null> {
    const clean = cleanName(name);
    if (clean === null) return null;
    return vocabulary.add({ id: this.clock.newId(), name: clean }, this.clock.stampFor(actorId));
  }

  /**
   * Renames one named row, keeping the name unique across the deployment.
   *
   * The name is cleaned **before** the row is read, because a row called
   * nothing would sit in every picker with no way to tell it from the next one.
   * A `taken` refusal carries the clean name rather than what was typed: be-01
   * trims, so a `‹space›Kat` typed against a held `Kat` collides with `Kat`.
   */
  private async renameNamed<T>(
    vocabulary: NamedVocabulary<T>,
    id: string,
    actorId: string,
    name: string,
  ): Promise<DirectoryOutcome<T>> {
    const clean = cleanName(name);
    if (clean === null) return { ok: false, reason: 'name_required' };
    const written = await vocabulary.rename(id, clean, this.clock.stampFor(actorId));
    if (!written.ok) {
      if (written.reason === 'taken') return { ok: false, reason: 'taken', name: clean };
      return { ok: false, reason: 'not_found' };
    }
    await this.announce(written.projectIds);
    return { ok: true, value: written.entity };
  }

  /**
   * Removes one named row, refusing an unconfirmed removal that would unlabel
   * anything.
   *
   * The unconfirmed read is only a **fast path**. What decides is the count
   * inside the store's own transaction, which is why a labelling written
   * between the two refuses rather than being deleted.
   *
   * The refusal turns on the projects alone for all three of these dimensions:
   * nobody belongs to a tag, a type or a service, so there are no members to
   * count — and for a service the teams that *own* it are deliberately not
   * counted either (design.md D7).
   */
  private async removeNamed<T>(
    vocabulary: NamedVocabulary<T>,
    id: string,
    actorId: string,
    cascade: boolean,
  ): Promise<RemoveDirectoryOutcome> {
    if (!cascade) {
      const seen = vocabulary.usageIn(await vocabulary.usageOf(id), id);
      if (seen.projects.length > 0) return { ok: false, reason: 'in_use', usage: seen };
    }
    const removed = await vocabulary.remove(id, cascade, this.clock.stampFor(actorId));
    if (!removed.ok) {
      if (removed.reason === 'not_found') return { ok: false, reason: 'not_found' };
      return { ok: false, reason: 'in_use', usage: vocabulary.usageIn(removed.usage, id) };
    }
    await this.announce(removed.removal.projectIds);
    return { ok: true };
  }

  /** The tag vocabulary — see {@link NamedVocabulary}. */
  private readonly tags: NamedVocabulary<Tag> = {
    add: (row, stamp) => this.opts.directory.addTag(row, stamp),
    rename: async (id, name, stamp) => {
      const written = await this.opts.directory.renameTag(id, name, stamp);
      return written.ok ? { ...written, entity: written.tag } : written;
    },
    usageOf: (id) => this.opts.directory.usageOfTag(id),
    remove: (id, cascade, stamp) => this.opts.directory.removeTag(id, cascade, stamp),
    usageIn: directoryUsageOfTag,
  };

  /** The work item type vocabulary — see {@link NamedVocabulary}. */
  private readonly workItemTypes: NamedVocabulary<WorkItemType> = {
    add: (row, stamp) => this.opts.directory.addWorkItemType(row, stamp),
    rename: async (id, name, stamp) => {
      const written = await this.opts.directory.renameWorkItemType(id, name, stamp);
      return written.ok ? { ...written, entity: written.workItemType } : written;
    },
    usageOf: (id) => this.opts.directory.usageOfWorkItemType(id),
    remove: (id, cascade, stamp) => this.opts.directory.removeWorkItemType(id, cascade, stamp),
    usageIn: directoryUsageOfWorkItemType,
  };

  /** The service vocabulary — see {@link NamedVocabulary}. */
  private readonly services: NamedVocabulary<Service> = {
    add: (row, stamp) => this.opts.directory.addService(row, stamp),
    rename: async (id, name, stamp) => {
      const written = await this.opts.directory.renameService(id, name, stamp);
      return written.ok ? { ...written, entity: written.service } : written;
    },
    usageOf: (id) => this.opts.directory.usageOfService(id),
    remove: (id, cascade, stamp) => this.opts.directory.removeService(id, cascade, stamp),
    usageIn: directoryUsageOfService,
  };

  /**
   * One catalog through the caller's access: the whole deployment's under
   * legacy access, only the organization's own, under its local names, under
   * scoped access. The directory list routes read through this.
   *
   * Proof: answering the legacy list under scoped access made `lists only the
   * organization's own entries under their local names` in
   * `directory-organization.controller.db.test.ts` list both organizations'
   * entries; watched 2026-09-27.
   */
  listWithin<C extends DirectoryCatalog>(
    catalog: C,
    access: ResourceAccess,
  ): Promise<DirectoryCatalogRows[C]> {
    if (access.kind === 'scoped') {
      return this.opts.directory.listInOrganization(catalog, access.scope.organizationId);
    }
    const legacy: { [K in DirectoryCatalog]: () => Promise<DirectoryCatalogRows[K]> } = {
      people: () => this.listPeople(),
      teams: () => this.listTeams(),
      services: () => this.listServices(),
      tags: () => this.listTags(),
      workItemTypes: () => this.listWorkItemTypes(),
      externalSystems: () => this.listExternalSystems(),
      resources: () => this.listResources(),
    };
    return legacy[catalog]();
  }

  /** Every resource in the global directory, by name. */
  listResources(): Promise<Resource[]> {
    return this.opts.directory.listResources();
  }

  /**
   * Resource writes run inside a command batch and nowhere else: no public
   * standalone route writes one, so a standalone-built service reaching here is
   * a composition fault, not a request.
   *
   * @throws when this service was built for standalone writes.
   */
  private refuseStandaloneResourceWrite(): void {
    if (this.opts.standaloneWrite !== undefined)
      throw new Error('resource writes run only inside a command batch');
  }

  /**
   * Adds a resource through the caller's access, refusing a name the directory
   * (legacy) or the organization (scoped) already holds as `taken` — never
   * answering the existing row, whose kind and unit may differ from the ones
   * asked for. Under scoped access the root takes an opaque name and the
   * organization's side row carries the display name, as a team's does.
   *
   * Proof: with the memory store answering an existing name's row instead of
   * refusing, `declares a host’s RAM, lists it, and refuses a second of one name
   * as taken` (resource-command.test.ts) failed on `ok: true`; watched 2026-10-20.
   */
  async addResourceWithin(
    actorId: string,
    input: ResourceInput,
    access: ResourceAccess,
  ): Promise<DirectoryOutcome<Resource>> {
    this.refuseStandaloneResourceWrite();
    const clean = cleanName(input.name);
    if (clean === null) return { ok: false, reason: 'name_required' };
    const stamp = this.clock.stampFor(actorId);
    const fields = { kind: input.kind, unitLabel: input.unitLabel };
    if (access.kind === 'legacy') {
      const added = await this.opts.directory.addResource(
        { id: this.clock.newId(), name: clean, ...fields },
        stamp,
      );
      return added.ok
        ? { ok: true, value: added.resource }
        : { ok: false, reason: 'taken', name: clean };
    }
    const organizationId = access.scope.organizationId;
    const held = await this.opts.directory.listInOrganization('resources', organizationId);
    if (held.some((entry) => entry.name === clean))
      return { ok: false, reason: 'taken', name: clean };
    for (let attempt = 0; attempt < OPAQUE_NAME_ATTEMPTS; attempt += 1) {
      const id = this.clock.newId();
      const added = await this.opts.directory.addResource({ id, name: id, ...fields }, stamp);
      if (!added.ok) continue;
      await this.opts.directory.mapInOrganization('resources', id, organizationId, clean);
      return { ok: true, value: { id, name: clean, ...fields } };
    }
    throw new Error(`no free opaque resource name after ${String(OPAQUE_NAME_ATTEMPTS)} ids`);
  }

  /**
   * Renames a resource or changes its unit label through the caller's access,
   * announcing to every project whose demands or capacities name it. Under
   * scoped access only the organization's own resource is found, and the name
   * moves in the organization alone.
   */
  async patchResourceWithin(
    resourceId: string,
    actorId: string,
    patch: ResourcePatch,
    access: ResourceAccess,
  ): Promise<DirectoryOutcome<Resource>> {
    this.refuseStandaloneResourceWrite();
    if (patch.name === undefined && patch.unitLabel === undefined)
      return { ok: false, reason: 'nothing_to_change' };
    const clean = patch.name === undefined ? undefined : cleanName(patch.name);
    if (clean === null) return { ok: false, reason: 'name_required' };
    const stamp = this.clock.stampFor(actorId);
    if (access.kind === 'legacy') {
      const written = await this.opts.directory.patchResource(
        resourceId,
        {
          ...(clean === undefined ? {} : { name: clean }),
          ...(patch.unitLabel === undefined ? {} : { unitLabel: patch.unitLabel }),
        },
        stamp,
      );
      if (!written.ok)
        return written.reason === 'taken' && clean !== undefined
          ? { ok: false, reason: 'taken', name: clean }
          : { ok: false, reason: 'not_found' };
      await this.announce(written.projectIds);
      return { ok: true, value: written.resource };
    }
    const { scope } = access;
    if ((await this.ownEntry('resources', resourceId, scope)) === undefined)
      return { ok: false, reason: 'not_found' };
    await this.refuseForeignReach('resources', resourceId, scope);
    if (clean !== undefined) {
      const renamed = await this.renameLocal('resources', resourceId, clean, actorId, scope);
      if (!renamed.ok) return renamed;
    }
    if (patch.unitLabel !== undefined) {
      const written = await this.opts.directory.patchResource(
        resourceId,
        { unitLabel: patch.unitLabel },
        stamp,
      );
      if (!written.ok) return { ok: false, reason: 'not_found' };
      await this.refuseForeignProjects(written.projectIds, scope);
      await this.announce(written.projectIds);
    }
    const resource = await this.ownEntry('resources', resourceId, scope);
    if (resource === undefined) throw new Error(`resource "${resourceId}" vanished mid-patch`);
    return { ok: true, value: resource };
  }

  /**
   * Removes a resource through the caller's access, refusing an unconfirmed
   * removal while any demand, capacity or occupancy names it — `in_use` with
   * the rows and the counts. With `cascade` its demands and capacities go in the
   * same transaction. Under scoped access a foreign resource is `not_found` and
   * a foreign project naming it fails closed.
   *
   * The unconfirmed read is only a fast path; the store's own count inside its
   * transaction decides.
   *
   * Proof: with both in-use checks answering "unused" (this service's and the
   * memory store's), `refuses removing a demanded resource, naming 2 demands, 0
   * capacities, 0 occupancies` (resource-command.test.ts) deleted the resource
   * and both demands with it; watched 2026-10-20.
   */
  async removeResourceWithin(
    resourceId: string,
    actorId: string,
    cascade: boolean,
    access: ResourceAccess,
  ): Promise<RemoveResourceOutcome> {
    this.refuseStandaloneResourceWrite();
    const scope = access.kind === 'scoped' ? access.scope : null;
    if (scope !== null) {
      if ((await this.ownEntry('resources', resourceId, scope)) === undefined)
        return { ok: false, reason: 'not_found' };
      await this.refuseForeignReach('resources', resourceId, scope);
    }
    const shown = async (rows: ResourceUsageRows) =>
      directoryUsageOfResource(
        scope === null ? rows : { ...rows, rows: await this.localUsage(rows.rows, scope) },
      );
    if (!cascade) {
      const seen = await this.opts.directory.usageOfResource(resourceId);
      if (isResourceInUse(seen)) return { ok: false, reason: 'in_use', ...(await shown(seen)) };
    }
    const removed = await this.opts.directory.removeResource(
      resourceId,
      cascade,
      this.clock.stampFor(actorId),
    );
    if (!removed.ok) {
      if (removed.reason === 'not_found') return { ok: false, reason: 'not_found' };
      return { ok: false, reason: 'in_use', ...(await shown(removed.usage)) };
    }
    if (scope !== null) await this.refuseForeignProjects(removed.removal.projectIds, scope);
    await this.announce(removed.removal.projectIds);
    return { ok: true };
  }

  /** One organization's catalog, as {@link DirectoryStore.listInOrganization} reads it. */
  listInOrganization<C extends DirectoryCatalog>(
    catalog: C,
    organizationId: string,
  ): Promise<DirectoryCatalogRows[C]> {
    return this.opts.directory.listInOrganization(catalog, organizationId);
  }

  /** Every team **with the services it owns** — the map ships whole, design D4. */
  listTeams(): Promise<TeamWithServices[]> {
    return this.opts.directory.listTeams();
  }

  /** Null for a name that is only whitespace — an unnamed team helps nobody find anything. */
  async addTeam(actorId: string, name: string): Promise<ServiceTeam | null> {
    const clean = cleanName(name);
    if (clean === null) return null;
    // No size, because a team no longer has one: a new team is unstated on
    // every plan, and how many of them are at work at once is said per project
    // afterwards. The retired column is left at its default `NULL` by the
    // insert, which is what `capacity-per-project` D4 leaves it as.
    return this.opts.directory.addTeam(
      { id: this.clock.newId(), name: clean },
      this.clock.stampFor(actorId),
    );
  }

  /**
   * Renames a team, replaces the services it owns, or both at once.
   *
   * Any signed-in account may, as any may create one today: there is no admin
   * concept here, and inventing one for a rename would be a different change.
   *
   * A patch naming neither is refused rather than answered as a no-op —
   * {@link DirectoryService.patchPerson}'s rule, and the same reasoning: nothing
   * sends one deliberately, so it is a client bug, and a 200 would leave nothing
   * on the wire to notice it by.
   *
   * **Only a rename is announced.** Editing the ownership map changes no row any
   * project renders: the map labels no work item, is not inherited, and the
   * scheduler never reads it (spec — "editing it SHALL move no date in any
   * plan"). An event here would send every open plan to reread a tree that is
   * exactly as it was, and would make "the map moves no date" a claim about
   * luck rather than about the code.
   */
  async patchTeam(
    teamId: string,
    actorId: string,
    patch: TeamPatch,
  ): Promise<DirectoryOutcome<TeamWithServices>> {
    if (patch.name === undefined && patch.serviceIds === undefined) {
      return { ok: false, reason: 'nothing_to_change' };
    }
    const clean = patch.name === undefined ? undefined : cleanName(patch.name);
    // Before the row is read: a team called nothing would sit in every picker
    // with no way to tell it from the next one.
    if (clean === null) return { ok: false, reason: 'name_required' };
    // One stamp for a rename and an ownership map the store writes in one
    // transaction: they are one act, and the two halves cannot be dated apart.
    const written = await this.opts.directory.patchTeam(
      teamId,
      {
        ...(clean === undefined ? {} : { name: clean }),
        ...(patch.serviceIds === undefined ? {} : { serviceIds: patch.serviceIds }),
      },
      this.clock.stampFor(actorId),
    );
    if (!written.ok) {
      // `clean` is defined on this branch — `taken` is the name index refusing,
      // and a patch that named no name cannot have reached it.
      if (written.reason === 'taken' && clean !== undefined) {
        return { ok: false, reason: 'taken', name: clean };
      }
      return {
        ok: false,
        reason: written.reason === 'unknown_service' ? 'unknown_service' : 'not_found',
      };
    }
    if (clean !== undefined) await this.announce(written.projectIds);
    return { ok: true, value: written.team };
  }

  listTags(): Promise<Tag[]> {
    return this.opts.directory.listTags();
  }

  /**
   * Adds a tag, or refuses a name that is only whitespace.
   *
   * `addTeam`'s shape, and the same absence for a different reason: a team's
   * `size` is a retired column left at its default, while a tag has no such
   * column to leave — it never had a pool to be unstated about.
   */
  async addTag(actorId: string, name: string): Promise<Tag | null> {
    return this.addNamed(this.tags, actorId, name);
  }

  /** Renames a tag, keeping the name unique across the deployment — `renameTeam`'s rules. */
  async renameTag(tagId: string, actorId: string, name: string): Promise<DirectoryOutcome<Tag>> {
    return this.renameNamed(this.tags, tagId, actorId, name);
  }

  /**
   * Removes a tag, refusing an unconfirmed removal that would unlabel anything.
   *
   * `removeTeam`'s shape with **one clause fewer**: there are no members to
   * count, because nobody belongs to a tag. So the refusal turns on the
   * projects alone, and a tag nothing carries is removed on the first press.
   *
   * The unconfirmed read is still only a fast path. What decides is the count
   * inside the store's own transaction, which is why a labelling written
   * between the two refuses rather than being deleted.
   */
  async removeTag(
    tagId: string,
    actorId: string,
    cascade: boolean,
  ): Promise<RemoveDirectoryOutcome> {
    return this.removeNamed(this.tags, tagId, actorId, cascade);
  }

  listWorkItemTypes(): Promise<WorkItemType[]> {
    return this.opts.directory.listWorkItemTypes();
  }

  /**
   * Adds a work item type, or refuses a name that is only whitespace —
   * {@link addTag}'s shape, and the same absence for the same reason: a type has
   * no pool to be unstated about.
   */
  async addWorkItemType(actorId: string, name: string): Promise<WorkItemType | null> {
    return this.addNamed(this.workItemTypes, actorId, name);
  }

  /**
   * Renames a work item type, keeping the name unique across the deployment —
   * {@link renameTag}'s rules.
   */
  async renameWorkItemType(
    typeId: string,
    actorId: string,
    name: string,
  ): Promise<DirectoryOutcome<WorkItemType>> {
    return this.renameNamed(this.workItemTypes, typeId, actorId, name);
  }

  /**
   * Removes a work item type, refusing an unconfirmed removal that would unlabel
   * anything — {@link removeTag}'s shape, one dimension over, including having
   * no members to count because nobody belongs to a type.
   *
   * The unconfirmed read is still only a fast path. What decides is the count
   * inside the store's own transaction, which is why a labelling written between
   * the two refuses rather than being deleted.
   */
  async removeWorkItemType(
    typeId: string,
    actorId: string,
    cascade: boolean,
  ): Promise<RemoveDirectoryOutcome> {
    return this.removeNamed(this.workItemTypes, typeId, actorId, cascade);
  }

  listExternalSystems(): Promise<ExternalSystem[]> {
    return this.opts.directory.listExternalSystems();
  }

  /** Adds or resolves an archival external-system name in the global vocabulary. */
  async addExternalSystem(actorId: string, name: string): Promise<ExternalSystem | null> {
    const clean = cleanName(name);
    if (clean === null) return null;
    return this.opts.directory.addExternalSystem(
      { id: this.clock.newId(), name: clean },
      this.clock.stampFor(actorId),
    );
  }

  listServices(): Promise<Service[]> {
    return this.opts.directory.listServices();
  }

  /**
   * Adds a service, or refuses a name that is only whitespace.
   *
   * {@link addTag}'s shape, and the same absence for a third reason: a service
   * has no `size` to leave at a default because it never had a pool. Who has the
   * people is the team, and the two are independent dimensions (Dany,
   * 2026-08-20: _"Let service and teams be independent."_).
   */
  async addService(actorId: string, name: string): Promise<Service | null> {
    return this.addNamed(this.services, actorId, name);
  }

  /** Renames a service, keeping the name unique across the deployment — {@link renameTag}'s rules. */
  async renameService(
    serviceId: string,
    actorId: string,
    name: string,
  ): Promise<DirectoryOutcome<Service>> {
    return this.renameNamed(this.services, serviceId, actorId, name);
  }

  /**
   * Removes a service, refusing an unconfirmed removal that would unlabel
   * anything — {@link removeTag}'s shape, one dimension over.
   *
   * No members to count, for the tag's reason: nobody belongs to a service. The
   * teams that **own** it are not counted either, and that is the sharper
   * absence — `team_service` rows go with the removal, but an ownership claim
   * about a service that no longer exists is not a loss anybody has to weigh
   * (design.md D7). So the refusal turns on the work items alone.
   *
   * What is announced is `directory_changed` and never `capacity_changed`: no
   * date moves, so a client re-reads the tree and the schedule it re-reads is
   * the one it already had.
   */
  async removeService(
    serviceId: string,
    actorId: string,
    cascade: boolean,
  ): Promise<RemoveDirectoryOutcome> {
    return this.removeNamed(this.services, serviceId, actorId, cascade);
  }

  listPeople(): Promise<PersonWithTeams[]> {
    return this.opts.directory.listPeople();
  }

  /**
   * Adds a person, optionally joining them to teams.
   *
   * No teams means a **free agent**, which is the absence of memberships
   * rather than membership of a "Free agents" row: a real row could be
   * renamed, deleted, or given work of its own, and the default would then
   * mean whatever somebody last did to it.
   *
   * `kind` is optional for the ordinary create route and explicit for archival
   * import. An omitted value keeps the store's backwards-compatible `person`
   * default; an imported agent is written as an agent in the same act as its
   * memberships.
   */
  async addPerson(
    actorId: string,
    name: string,
    teamIds: readonly string[],
    kind?: PersonKind,
  ): Promise<DirectoryOutcome<Person>> {
    const clean = cleanName(name);
    if (clean === null) return { ok: false, reason: 'name_required' };
    // One stamp for the person and the memberships alike: they are one create in
    // one transaction, as the comment below says, so they are one instant too.
    const written = await this.opts.directory.addPerson(
      { id: this.clock.newId(), name: clean, ...(kind === undefined ? {} : { kind }) },
      teamIds,
      this.clock.stampFor(actorId),
    );
    // The whole create, or none of it: a person made without the membership
    // that was asked for is a row somebody would have to notice was wrong.
    if (!written.ok) return { ok: false, reason: written.reason };
    return { ok: true, value: written.person };
  }

  /**
   * Renames a person, marks them a person or an agent, replaces their
   * memberships, or any of those at once.
   *
   * A patch naming none of them is refused rather than answered as a no-op:
   * nothing on this deployment sends one deliberately, so it is a client bug,
   * and a 200 would leave nothing on the wire to notice it by.
   *
   * The halves are one transaction in the store — see
   * {@link DirectoryStore.patchPerson} — so a refused patch leaves the rename
   * beside it unapplied.
   *
   * **`kind` is checked before the row is read, and refused rather than
   * ignored.** A kind outside the set is a request that is wrong, not a
   * directory that lacks something, so it is 400 and not the 404 an unknown
   * team gets. Dropping it silently would answer 200 to a caller that believes
   * it has just marked somebody an agent.
   *
   * **`accountId` is `forbidden` here**: binding an account to a person is an
   * organization admin's act (`wbs-team-claims` D5), and legacy access has no
   * organization, so nobody holds the role it needs. See
   * {@link patchPersonWithin}.
   */
  async patchPerson(
    personId: string,
    actorId: string,
    patch: PersonPatchInput,
  ): Promise<DirectoryOutcome<PersonWithTeams>> {
    if (isEmptyPersonPatch(patch)) return { ok: false, reason: 'nothing_to_change' };
    // Proof: skipping this made `refuses a binding under legacy access` in
    // `directory.resource.test.ts` answer ok while dropping `accountId` unwritten
    // (watched 2026-10-19).
    if (patch.accountId !== undefined) return { ok: false, reason: 'forbidden' };
    if (patch.kind !== undefined && !holdsKind(patch.kind)) {
      return { ok: false, reason: 'invalid_kind' };
    }
    const clean = patch.name === undefined ? undefined : cleanName(patch.name);
    if (clean === null) return { ok: false, reason: 'name_required' };
    const written = await this.opts.directory.patchPerson(
      personId,
      {
        ...(clean === undefined ? {} : { name: clean }),
        ...(patch.teamIds === undefined ? {} : { teamIds: patch.teamIds }),
        ...(patch.kind === undefined ? {} : { kind: patch.kind }),
      },
      this.clock.stampFor(actorId),
    );
    if (!written.ok) {
      // Only a binding or kind change of a person with machine credentials is
      // refused in use, and legacy access precedes every credential.
      if (written.reason === 'in_use')
        throw new Error(`person "${personId}" legacy patch was refused in use`);
      // `clean` is defined on this branch — `taken` is the name index refusing,
      // and a patch that named no name cannot have reached it.
      if (written.reason === 'taken' && clean !== undefined) {
        return { ok: false, reason: 'taken', name: clean };
      }
      return {
        ok: false,
        reason: written.reason === 'unknown_team' ? 'unknown_team' : 'not_found',
      };
    }
    // Only a rename is announced. A membership edit changes no row any project
    // renders — the assumed assignee is derived from assignments, not from who
    // belongs to which team — so an event would send every open plan to reread
    // a tree that is exactly as it was.
    //
    // `kind` is silent for the same reason and not a weaker one: nothing in a
    // plan's tree draws it. It reaches the directory payload (5.4) and the card
    // that edits it (7.1), and both read the directory rather than a plan. The
    // day a badge appears beside an assignee in the tree, this becomes a rename
    // and gets announced with one.
    if (clean !== undefined) await this.announce(written.projectIds);
    return { ok: true, value: written.person };
  }

  /**
   * Removes a person, refusing the first time when an assignment holds them.
   *
   * The refusal carries the **directory usage** rather than a bare conflict:
   * the assignments are rows somebody typed, and the assumed assignees are
   * readings that would move under them. A person nobody has been assigned is
   * removed without a second call — there is nothing to warn about, and asking
   * anyway teaches people to confirm without reading. Their own memberships go
   * with them and force nothing: they name nobody else.
   *
   * `cascade` is the caller saying it has seen that usage, and it is the only
   * thing carried across the two requests. **The count that decides is the one
   * inside the delete's transaction** — the read below is a fast path that
   * answers most refusals without opening one, and an assignment written after
   * it is refused by the transaction rather than deleted by it.
   *
   * Proof, watched 2026-08-09: with the transaction's own count replaced by
   * this fast path's, `refuses a removal when an assignment lands after the
   * count` deletes the person and the assignment the caller was never shown.
   */
  async removePerson(
    personId: string,
    actorId: string,
    cascade: boolean,
  ): Promise<RemoveDirectoryOutcome> {
    if (!cascade) {
      const seen = directoryUsageOfPerson(
        await this.opts.directory.usageOfPerson(personId),
        personId,
      );
      if (seen.projects.length > 0 || seen.pinnedCredentials > 0)
        return { ok: false, reason: 'in_use', usage: seen };
    }
    // Legacy access exists only before activation, when no machine
    // credential can have been created, so it reaches none.
    const removed = await this.opts.directory.removePerson(
      personId,
      cascade,
      this.clock.stampFor(actorId),
      { kind: 'none' },
    );
    if (!removed.ok) {
      if (removed.reason === 'not_found' || removed.reason === 'forbidden')
        return { ok: false, reason: removed.reason };
      // The transaction's own usage, not the fast path's: it is the only one
      // that was still true at the moment the deletes would have run.
      return {
        ok: false,
        reason: 'in_use',
        usage: directoryUsageOfPerson(removed.usage, personId),
      };
    }
    await this.announce(removed.removal.projectIds);
    return { ok: true };
  }

  /**
   * Removes a team, refusing the first time when a work item carries it **or a
   * person belongs to it**.
   *
   * The memberships count here where a person's own do not, because they name
   * somebody else: a confirmation showing an empty impact list while two
   * people were about to be taken out of a team is a confirmation of nothing.
   *
   * **The only removal here that names an actor**, because it is the only one
   * that leaves rows behind and changes them: a cascading removal nulls
   * `work_item.serviceTeamId` on every work item the team labelled, and that is
   * an update with a column to stamp. Its four siblings delete and nothing more,
   * and a deleted row has no author to record — see
   * {@link DirectoryStore.removeTeam}.
   */
  async removeTeam(
    teamId: string,
    actorId: string,
    cascade: boolean,
  ): Promise<RemoveDirectoryOutcome> {
    if (!cascade) {
      const seen = directoryUsageOfTeam(await this.opts.directory.usageOfTeam(teamId), teamId);
      if (seen.projects.length > 0 || seen.members.length > 0) {
        return { ok: false, reason: 'in_use', usage: seen };
      }
    }
    // After the unconfirmed refusal, which writes nothing: the act is the
    // removal, and a request that only reported what would be lost is not one.
    const removed = await this.opts.directory.removeTeam(
      teamId,
      cascade,
      this.clock.stampFor(actorId),
    );
    if (!removed.ok) {
      if (removed.reason === 'not_found') return { ok: false, reason: 'not_found' };
      return { ok: false, reason: 'in_use', usage: directoryUsageOfTeam(removed.usage, teamId) };
    }
    await this.announce(removed.removal.projectIds);
    return { ok: true };
  }

  /**
   * Adds a tag, type, service or team through the caller's access. Under
   * scoped access the entry is the organization's: idempotent by its
   * organization-local name, otherwise a root with an opaque name (its own
   * id) mapped to the organization under the display name. Another
   * organization's entry of the same name is never found, and never blocks.
   *
   * Proof: answering the legacy add under scoped access made `creates the
   * same names in two organizations, each finding only its own` in
   * `directory-command-organization.controller.db.test.ts` answer 404
   * `unknown_team`: the legacy add left the batch's new team unmapped;
   * watched 2026-09-27.
   */
  async addWithin(
    catalog: 'tags' | 'workItemTypes' | 'services' | 'teams' | 'externalSystems',
    actorId: string,
    name: string,
    access: ResourceAccess,
  ): Promise<{ id: string; name: string } | null> {
    if (this.opts.standaloneWrite !== undefined)
      return this.opts.standaloneWrite(
        { kind: 'add', catalog, access },
        (reason) => {
          throw new Error(`standalone directory add unexpectedly refused: ${reason}`);
        },
        (borrowed) => borrowed.addWithin(catalog, actorId, name, access),
        (value) => value !== null,
      );
    if (access.kind === 'legacy') {
      const legacy = {
        tags: () => this.addTag(actorId, name),
        workItemTypes: () => this.addWorkItemType(actorId, name),
        services: () => this.addService(actorId, name),
        teams: () => this.addTeam(actorId, name),
        externalSystems: () => this.addExternalSystem(actorId, name),
      };
      return legacy[catalog]();
    }
    const clean = cleanName(name);
    if (clean === null) return null;
    const organizationId = access.scope.organizationId;
    const existing = (await this.opts.directory.listInOrganization(catalog, organizationId)).find(
      (entry) => entry.name === clean,
    );
    if (existing !== undefined) return { id: existing.id, name: existing.name };
    const stamp = this.clock.stampFor(actorId);
    const roots = {
      tags: (row: { id: string; name: string }) => this.opts.directory.addTag(row, stamp),
      workItemTypes: (row: { id: string; name: string }) =>
        this.opts.directory.addWorkItemType(row, stamp),
      services: (row: { id: string; name: string }) => this.opts.directory.addService(row, stamp),
      teams: (row: { id: string; name: string }) => this.opts.directory.addTeam(row, stamp),
      externalSystems: (row: { id: string; name: string }) =>
        this.opts.directory.addExternalSystem(row, stamp),
    };
    const id = await this.addOpaqueRoot((row) => roots[catalog](row));
    await this.opts.directory.mapInOrganization(catalog, id, organizationId, clean);
    return { id, name: clean };
  }

  /**
   * Inserts a root under an opaque name, its own id, and answers that id.
   * The roots' global name index is idempotent by name, so an id another root
   * already carries as its name comes back as that root; a fresh id is tried,
   * a bounded number of times.
   *
   * @throws when every attempt collides, which random ids make a broken clock.
   */
  private async addOpaqueRoot(
    add: (row: { id: string; name: string }) => Promise<{ id: string }>,
  ): Promise<string> {
    for (let attempt = 0; attempt < OPAQUE_NAME_ATTEMPTS; attempt += 1) {
      const id = this.clock.newId();
      // Proof: accepting the answered row whatever its id made `retries an
      // opaque root name another root holds, then gives up` in
      // `directory.resource.test.ts` answer `id-1`, the colliding id, instead
      // of `id-2`; watched 2026-09-27.
      if ((await add({ id, name: id })).id === id) return id;
    }
    throw new Error(`no free opaque directory name after ${String(OPAQUE_NAME_ATTEMPTS)} ids`);
  }

  /**
   * Renames a tag, type or service through the caller's access. Under scoped
   * access only the organization-local display name moves, only for an entry
   * the organization owns: a foreign entry is `not_found` exactly as an
   * absent one.
   */
  async renameWithin(
    catalog: 'tags' | 'workItemTypes' | 'services',
    id: string,
    actorId: string,
    name: string,
    access: ResourceAccess,
  ): Promise<DirectoryOutcome<{ id: string; name: string }>> {
    if (this.opts.standaloneWrite !== undefined)
      return this.opts.standaloneWrite(
        { kind: 'rename', catalog, resourceId: id, access },
        (reason) => ({ ok: false, reason }),
        (borrowed) => borrowed.renameWithin(catalog, id, actorId, name, access),
        (value) => value.ok,
      );
    if (access.kind === 'legacy') {
      const legacy = {
        tags: () => this.renameTag(id, actorId, name),
        workItemTypes: () => this.renameWorkItemType(id, actorId, name),
        services: () => this.renameService(id, actorId, name),
      };
      return legacy[catalog]();
    }
    const clean = cleanName(name);
    if (clean === null) return { ok: false, reason: 'name_required' };
    const renamed = await this.renameLocal(catalog, id, clean, actorId, access.scope);
    if (!renamed.ok) return renamed;
    return { ok: true, value: { id, name: clean } };
  }

  private async renameLocal(
    catalog: NamedCatalog,
    id: string,
    clean: string,
    actorId: string,
    scope: OrganizationScope,
  ): Promise<
    { ok: true } | { ok: false; reason: 'not_found' } | { ok: false; reason: 'taken'; name: string }
  > {
    if ((await this.ownEntry(catalog, id, scope)) === undefined) {
      return { ok: false, reason: 'not_found' };
    }
    await this.refuseForeignReach(catalog, id, scope);
    const written = await this.opts.directory.renameInOrganization(
      catalog,
      id,
      scope.organizationId,
      clean,
      this.clock.stampFor(actorId),
    );
    if (!written.ok) {
      return written.reason === 'taken'
        ? { ok: false, reason: 'taken', name: clean }
        : { ok: false, reason: 'not_found' };
    }
    await this.announce(written.projectIds);
    return { ok: true };
  }

  /**
   * Refuses to touch an entry anything outside the organization reaches: a
   * foreign project's row, assignment or capacity, or a foreign person's,
   * team's or service's link. Every scoped write of an existing entry checks
   * it first, since renaming, relinking or removing the entry would otherwise
   * change what the other organization sees.
   *
   * Proof: skipping this check made `fails closed on an entry another
   * organization reaches, whatever the write` in
   * `directory-command-organization.controller.db.test.ts` answer 200 to a
   * cascade removing A's team, dropping B's person's membership; watched
   * 2026-09-27.
   *
   * @throws when any such reference exists: corrupt trusted state.
   */
  private async refuseForeignReach(
    catalog: NamedCatalog,
    id: string,
    scope: OrganizationScope,
  ): Promise<void> {
    const reached = await this.opts.directory.foreignReferencesTo(
      catalog,
      id,
      scope.organizationId,
    );
    if (reached.length > 0) {
      throw new Error(
        `${catalog} entry "${id}" of organization "${scope.organizationId}" is reached from outside it: ${reached.join(', ')}`,
      );
    }
  }

  /** The organization's own entry of `catalog` with `id`, or undefined alike for a foreign and an absent one. */
  private async ownEntry<C extends NamedCatalog>(
    catalog: C,
    id: string,
    scope: OrganizationScope,
  ): Promise<DirectoryCatalogRows[C][number] | undefined> {
    const entries: readonly DirectoryCatalogRows[C][number][] =
      await this.opts.directory.listInOrganization(catalog, scope.organizationId);
    const owned = entries.find((entry) => entry.id === id);
    // Proof: bypassing this targeted missing-root inspection answered a present
    // ownerless person as not_found instead of throwing in the standalone test.
    if (owned === undefined) await this.opts.directory.inspectMissingOwnership?.(catalog, id);
    return owned;
  }

  /** Whether the organization owns every one of `ids` in `catalog`. */
  private async ownsAll(
    catalog: NamedCatalog,
    ids: readonly string[],
    scope: OrganizationScope,
  ): Promise<boolean> {
    if (ids.length === 0) return true;
    const owned = new Set(
      (await this.opts.directory.listInOrganization(catalog, scope.organizationId)).map(
        (entry) => entry.id,
      ),
    );
    return ids.every((id) => owned.has(id));
  }

  /**
   * {@link patchTeam} through the caller's access. Under scoped access the
   * team and every service it is to own must be the organization's, the name
   * moves only in the organization, and the answer carries the local name.
   *
   * Proof: skipping the service ownership check made `refuses a foreign
   * service or team link exactly as an absent one` in
   * `directory-command-organization.controller.db.test.ts` answer 500 instead
   * of 404 `unknown_service`, after linking A's team to B's service; skipping
   * the team ownership check made `answers a foreign entry exactly as an
   * absent one, changing nothing` answer 500 instead of 404 for B's team;
   * watched 2026-09-27.
   */
  async patchTeamWithin(
    teamId: string,
    actorId: string,
    patch: TeamPatch,
    access: ResourceAccess,
  ): Promise<DirectoryOutcome<TeamWithServices>> {
    if (this.opts.standaloneWrite !== undefined)
      return this.opts.standaloneWrite(
        { kind: 'patch-team', teamId, serviceIds: patch.serviceIds, access },
        (reason) => ({ ok: false, reason }),
        (borrowed) => borrowed.patchTeamWithin(teamId, actorId, patch, access),
        (value) => value.ok,
      );
    if (access.kind === 'legacy') return this.patchTeam(teamId, actorId, patch);
    if (patch.name === undefined && patch.serviceIds === undefined) {
      return { ok: false, reason: 'nothing_to_change' };
    }
    const clean = patch.name === undefined ? undefined : cleanName(patch.name);
    if (clean === null) return { ok: false, reason: 'name_required' };
    const { scope } = access;
    if ((await this.ownEntry('teams', teamId, scope)) === undefined) {
      return { ok: false, reason: 'not_found' };
    }
    await this.refuseForeignReach('teams', teamId, scope);
    if (
      patch.serviceIds !== undefined &&
      !(await this.ownsAll('services', patch.serviceIds, scope))
    ) {
      return { ok: false, reason: 'unknown_service' };
    }
    if (clean !== undefined) {
      const renamed = await this.renameLocal('teams', teamId, clean, actorId, scope);
      if (!renamed.ok) return renamed;
    }
    if (patch.serviceIds !== undefined) {
      const written = await this.opts.directory.patchTeam(
        teamId,
        { serviceIds: patch.serviceIds },
        this.clock.stampFor(actorId),
      );
      // Proof: a service removed after preflight but before this raw owner
      // returned a generic error instead of unknown_service in the mounted race.
      if (!written.ok) {
        if (written.reason === 'taken')
          throw new Error(`team "${teamId}" patch unexpectedly reported a taken name`);
        return { ok: false, reason: written.reason };
      }
    }
    const team = await this.ownEntry('teams', teamId, scope);
    if (team === undefined) throw new Error(`team "${teamId}" vanished mid-patch`);
    return { ok: true, value: team };
  }

  /**
   * Whether `added` more agent persons would cross the organization's cap,
   * read through the caller's access (`wbs-organization-limits` L9): null
   * when they fit, the cap and count when they do not. Legacy access has no
   * organization to own a cap, so nothing is capped and nothing is read; that
   * is the modeled optional case, not a default.
   *
   * Callers hold the write's transaction: the import asks once for every agent
   * it would create before creating any.
   *
   * Proof: with legacy access answered as a cap of 0, `admits a promotion and
   * an import with no organization to own a cap`
   * (agent-person-limit.controller.db.test.ts) was refused; watched 2026-10-22.
   *
   * @throws when this graph was composed without organization limits.
   */
  refuseAgentPersonsWithin(access: ResourceAccess, added: number): Promise<LimitCrossed | null> {
    if (access.kind === 'legacy') return Promise.resolve(null);
    return this.refuseAgentPersons(access.scope, added);
  }

  /**
   * {@link refuseAgentPersonsWithin} under scoped access: the count is read
   * through the gauge of the stores this graph was built over, which is the
   * batch's own transaction under its write turn (L10).
   *
   * Proof, each watched 2026-10-22 in agent-person-limit-race.db.test.ts:
   * with the gauge answering the count it read first for every later batch
   * (a count read outside the batch's turn), `lands exactly one, the other
   * refused naming the winner in its count` landed both, 9 agents of 8; with
   * the admitted catalog of a bound source built without the gauge, every
   * activated case of agent-person-limit.controller.db.test.ts threw this
   * method's composition error (3 pass, 9 fail).
   *
   * @throws when this graph was composed without organization limits.
   */
  private async refuseAgentPersons(
    scope: OrganizationScope,
    added: number,
  ): Promise<LimitCrossed | null> {
    const gauge = this.opts.organizationLimits;
    if (gauge === undefined)
      throw new Error('an agent person was added under scoped access without organization limits');
    const reading = await gauge.readAgentPersonCap(scope.organizationId);
    return refuseLimit({ cap: reading.cap, current: reading.current, added });
  }

  /**
   * {@link addPerson} through the caller's access. Under scoped access every
   * team must be the organization's; an existing person of that local name
   * joins them, as the legacy add does, and keeps its own kind, as the plan
   * import's does; a new one gets an opaque root.
   *
   * `kind` is a `string` for {@link PersonPatchInput}'s reason: `createPerson`
   * carries it from a JSON body as `personKind`, and a kind outside
   * {@link PERSON_KINDS} is `invalid_kind` before anything is read. A new
   * agent passes the same cap `patchPerson` does, inside the batch's turn.
   */
  async addPersonWithin(
    actorId: string,
    name: string,
    teamIds: readonly string[],
    access: ResourceAccess,
    kind?: string,
  ): Promise<DirectoryOutcome<Person>> {
    // Proof: with this check removed, `refuses a kind outside the set, writing
    // nothing` (agent-person-limit.controller.db.test.ts) answered 500 from the
    // person table's CHECK constraint instead of 400; watched 2026-10-23.
    if (kind !== undefined && !holdsKind(kind)) return { ok: false, reason: 'invalid_kind' };
    if (this.opts.standaloneWrite !== undefined)
      return this.opts.standaloneWrite(
        { kind: 'add-person', teamIds, access },
        (reason) => ({ ok: false, reason }),
        (borrowed) => borrowed.addPersonWithin(actorId, name, teamIds, access, kind),
        (value) => value.ok,
      );
    if (access.kind === 'legacy') return this.addPerson(actorId, name, teamIds, kind);
    const clean = cleanName(name);
    if (clean === null) return { ok: false, reason: 'name_required' };
    const { scope } = access;
    // Proof: skipping this check made `refuses a foreign service or team link
    // exactly as an absent one` in
    // `directory-command-organization.controller.db.test.ts` answer 200,
    // creating a person in B's team; watched 2026-09-27.
    if (!(await this.ownsAll('teams', teamIds, scope))) {
      return { ok: false, reason: 'unknown_team' };
    }
    const stamp = this.clock.stampFor(actorId);
    const existing = (
      await this.opts.directory.listInOrganization('people', scope.organizationId)
    ).find((person) => person.name === clean);
    if (existing !== undefined) {
      await this.refuseForeignReach('people', existing.id, scope);
      const joined = [...new Set([...existing.teamIds, ...teamIds])];
      if (joined.length > existing.teamIds.length) {
        const written = await this.opts.directory.patchPerson(
          existing.id,
          { teamIds: joined },
          stamp,
        );
        if (!written.ok) {
          if (written.reason === 'taken')
            throw new Error(`person "${existing.id}" link patch reported a taken name`);
          if (written.reason === 'in_use')
            throw new Error(`person "${existing.id}" link patch was refused in use`);
          // Proof: throwing here made the queued existing-person add test lose unknown_team.
          return { ok: false, reason: written.reason };
        }
      }
      return { ok: true, value: { id: existing.id, name: existing.name, kind: existing.kind } };
    }
    // Proof: with this check removed, `refuses adding an agent at the cap,
    // creating and mapping nothing` (directory.resource.test.ts) created and
    // mapped the agent; watched 2026-10-22. With it bypassed again,
    // `refuses the fifth agent created directly…` and `refuses a batch
    // creating two agents…` (agent-person-limit.controller.db.test.ts) were
    // applied through createPerson (18 pass, 2 fail); watched 2026-10-23.
    if (kind === 'agent') {
      const crossed = await this.refuseAgentPersons(scope, 1);
      if (crossed !== null) return { ok: false, reason: 'agent_person_limit', ...crossed };
    }
    let addedKind: Person['kind'] | undefined;
    // The root alone first: on a collision the legacy add answers the existing
    // person, and memberships added in the same call would land on it.
    // Proof: adding the teams in this call made `retries a colliding opaque
    // person name without touching the person it collided with` in
    // `directory.resource.test.ts` join the colliding person to the team;
    // watched 2026-09-27.
    const id = await this.addOpaqueRoot(async (row) => {
      const added = await this.opts.directory.addPerson(
        kind === undefined ? row : { ...row, kind },
        [],
        stamp,
      );
      if (!added.ok) throw new Error(`person refused teams already checked: ${added.reason}`);
      addedKind = added.person.kind;
      return added.person;
    });
    if (addedKind === undefined) throw new Error(`person "${id}" was added without a kind`);
    await this.opts.directory.mapInOrganization('people', id, scope.organizationId, clean);
    if (teamIds.length > 0) {
      const joined = await this.opts.directory.patchPerson(id, { teamIds }, stamp);
      // A team can disappear between service preflight and this later raw owner.
      if (!joined.ok) {
        if (joined.reason === 'taken')
          throw new Error(`person "${id}" link patch reported a taken name`);
        if (joined.reason === 'in_use')
          throw new Error(`person "${id}" link patch was refused in use`);
        // Proof: throwing here made the queued new-person link test lose unknown_team.
        return { ok: false, reason: joined.reason };
      }
    }
    return { ok: true, value: { id, name: clean, kind: addedKind } };
  }

  /**
   * {@link patchPerson} through the caller's access. Under scoped access the
   * person and every team must be the organization's, the name moves only in
   * the organization, and the answer carries the local name.
   *
   * `accountId` binds the person to the account that may act as them, or
   * unbinds them with null (`wbs-team-claims` D5). Only an admin or a
   * super-admin of the active organization may send it; anyone else is
   * `forbidden` before anything is read. The store refuses an account that is
   * not a member of the person's organization as `unknown_account`.
   */
  async patchPersonWithin(
    personId: string,
    actorId: string,
    patch: PersonPatchInput,
    access: ResourceAccess,
  ): Promise<PersonPatchOutcome> {
    if (this.opts.standaloneWrite !== undefined)
      return this.opts.standaloneWrite(
        { kind: 'patch-person', personId, teamIds: patch.teamIds, access },
        (reason) => ({ ok: false, reason }),
        (borrowed) => borrowed.patchPersonWithin(personId, actorId, patch, access),
        (value) => value.ok,
      );
    if (access.kind === 'legacy') return this.patchPerson(personId, actorId, patch);
    if (isEmptyPersonPatch(patch)) return { ok: false, reason: 'nothing_to_change' };
    const { scope } = access;
    // Proof: skipping this made `refuses a member binding a person to an
    // account` in `person-account.controller.db.test.ts` answer 200 with the
    // binding written (watched 2026-10-19).
    if (patch.accountId !== undefined && !mayBindAccountInOrganization(scope.role)) {
      return { ok: false, reason: 'forbidden' };
    }
    if (patch.kind !== undefined && !holdsKind(patch.kind)) {
      return { ok: false, reason: 'invalid_kind' };
    }
    const clean = patch.name === undefined ? undefined : cleanName(patch.name);
    if (clean === null) return { ok: false, reason: 'name_required' };
    // Proof: skipping this check made `answers a foreign entry exactly as an
    // absent one, changing nothing` in
    // `directory-command-organization.controller.db.test.ts` answer 500
    // instead of 404 for B's person; watched 2026-09-27.
    const held = await this.ownEntry('people', personId, scope);
    if (held === undefined) {
      return { ok: false, reason: 'not_found' };
    }
    await this.refuseForeignReach('people', personId, scope);
    // Proof: skipping this check made `refuses a foreign service or team link
    // exactly as an absent one` in
    // `directory-command-organization.controller.db.test.ts` answer 500
    // instead of 404 `unknown_team`, after putting A's person in B's team;
    // watched 2026-09-27.
    if (patch.teamIds !== undefined && !(await this.ownsAll('teams', patch.teamIds, scope))) {
      return { ok: false, reason: 'unknown_team' };
    }
    // Only a person becoming an agent acquires one; an agent staying one, a
    // demotion, a rename or a re-team never consults the cap (L9).
    // Proof, each watched 2026-10-22 in agent-person-limit.controller.db.test.ts:
    // with `held.kind !== 'agent'` dropped, `renames an agent and re-teams it
    // at the cap, restating its kind` was refused (11 pass, 1 fail); with the
    // whole check removed, `refuses the ninth agent by patchPerson…`, `refuses
    // a batch adding two agents where one is free…` and `keeps every agent
    // above a lowered cap…` were applied (9 pass, 3 fail).
    if (patch.kind === 'agent' && held.kind !== 'agent') {
      const crossed = await this.refuseAgentPersons(scope, 1);
      if (crossed !== null) return { ok: false, reason: 'agent_person_limit', ...crossed };
    }
    if (clean !== undefined) {
      const renamed = await this.renameLocal('people', personId, clean, actorId, scope);
      if (!renamed.ok) return renamed;
    }
    if (patch.teamIds !== undefined || patch.kind !== undefined || patch.accountId !== undefined) {
      const written = await this.opts.directory.patchPerson(
        personId,
        {
          ...(patch.teamIds === undefined ? {} : { teamIds: patch.teamIds }),
          ...(patch.kind === undefined ? {} : { kind: patch.kind }),
          ...(patch.accountId === undefined ? {} : { accountId: patch.accountId }),
        },
        this.clock.stampFor(actorId),
      );
      if (!written.ok) {
        if (written.reason === 'taken')
          throw new Error(`person "${personId}" patch unexpectedly reported a taken name`);
        if (written.reason === 'in_use')
          return {
            ok: false,
            reason: 'in_use',
            usage: {
              projects: [],
              members: [],
              pinnedCredentials: 0,
              machineCredentials: written.machineCredentials,
            },
          };
        // Proof: throwing here made the queued person patch test lose unknown_team.
        return { ok: false, reason: written.reason };
      }
    }
    const person = await this.ownEntry('people', personId, scope);
    if (person === undefined) throw new Error(`person "${personId}" vanished mid-patch`);
    return { ok: true, value: person };
  }

  /**
   * Removes an entry through the caller's access. Under scoped access a
   * foreign entry is `not_found` exactly as an absent one, the usage a refusal
   * shows carries organization-local names, and a project outside the
   * organization naming the entry fails closed before anything is removed or
   * shown.
   *
   * @throws when a foreign project names the entry: corrupt trusted state.
   */
  async removeWithin(
    catalog: Exclude<NamedCatalog, 'resources'>,
    id: string,
    actorId: string,
    cascade: boolean,
    access: ResourceAccess,
  ): Promise<RemoveDirectoryOutcome> {
    if (this.opts.standaloneWrite !== undefined)
      return this.opts.standaloneWrite(
        { kind: 'remove', catalog, resourceId: id, access },
        () => ({ ok: false, reason: 'not_found' }),
        (borrowed) => borrowed.removeWithin(catalog, id, actorId, cascade, access),
        (value) => value.ok,
      );
    const removals = {
      people: {
        usageOf: (entry: string) => this.opts.directory.usageOfPerson(entry),
        remove: (entry: string, stamp: WriteStamp) =>
          this.opts.directory.removePerson(
            entry,
            cascade,
            stamp,
            access.kind === 'legacy' ? { kind: 'none' } : machineCredentialReachOf(access.scope),
          ),
        usageIn: directoryUsageOfPerson,
        legacy: () => this.removePerson(id, actorId, cascade),
      },
      teams: {
        usageOf: (entry: string) => this.opts.directory.usageOfTeam(entry),
        remove: (entry: string, stamp: WriteStamp) =>
          this.opts.directory.removeTeam(entry, cascade, stamp),
        usageIn: directoryUsageOfTeam,
        legacy: () => this.removeTeam(id, actorId, cascade),
      },
      tags: {
        ...this.tags,
        remove: (entry: string, stamp: WriteStamp) => this.tags.remove(entry, cascade, stamp),
        legacy: () => this.removeTag(id, actorId, cascade),
      },
      workItemTypes: {
        ...this.workItemTypes,
        remove: (entry: string, stamp: WriteStamp) =>
          this.workItemTypes.remove(entry, cascade, stamp),
        legacy: () => this.removeWorkItemType(id, actorId, cascade),
      },
      services: {
        ...this.services,
        remove: (entry: string, stamp: WriteStamp) => this.services.remove(entry, cascade, stamp),
        legacy: () => this.removeService(id, actorId, cascade),
      },
    };
    const removal = removals[catalog];
    if (access.kind === 'legacy') return removal.legacy();
    const { scope } = access;
    // Proof: skipping this check made `answers a foreign entry exactly as an
    // absent one, changing nothing` in
    // `directory-command-organization.controller.db.test.ts` answer 200,
    // deleting B's tag; watched 2026-09-27.
    if ((await this.ownEntry(catalog, id, scope)) === undefined) {
      return { ok: false, reason: 'not_found' };
    }
    await this.refuseForeignReach(catalog, id, scope);
    const shown = async (rows: DirectoryUsageRows): Promise<DirectoryUsage> =>
      removal.usageIn(await this.localUsage(rows, scope), id);
    if (!cascade) {
      const seen = await shown(await removal.usageOf(id));
      if (seen.projects.length > 0 || seen.members.length > 0 || seen.pinnedCredentials > 0) {
        return { ok: false, reason: 'in_use', usage: seen };
      }
    }
    const removed = await removal.remove(id, this.clock.stampFor(actorId));
    if (!removed.ok) {
      if (removed.reason === 'not_found') return { ok: false, reason: 'not_found' };
      if (removed.reason === 'forbidden') return { ok: false, reason: 'forbidden' };
      return { ok: false, reason: 'in_use', usage: await shown(removed.usage) };
    }
    // Proof: skipping this check made `fails closed on a directory entry a
    // foreign project names` in
    // `directory-command-organization.controller.db.test.ts` answer 200 to the
    // cascade, untagging B's row; watched 2026-09-27.
    await this.refuseForeignProjects(removed.removal.projectIds, scope);
    await this.announce(removed.removal.projectIds);
    return { ok: true };
  }

  /**
   * Usage rows as the organization sees them: every project its own, every
   * person under the organization-local name.
   *
   * @throws when a project or person in them is not the organization's.
   */
  private async localUsage(
    rows: DirectoryUsageRows,
    scope: OrganizationScope,
  ): Promise<DirectoryUsageRows> {
    await this.refuseForeignProjects(
      rows.projects.map((each) => each.id),
      scope,
    );
    const names = new Map(
      (await this.opts.directory.listInOrganization('people', scope.organizationId)).map(
        (person) => [person.id, person.name] as const,
      ),
    );
    const local = <P extends { id: string; name: string }>(person: P): P => {
      const name = names.get(person.id);
      if (name === undefined) {
        throw new Error(
          `person "${person.id}" in a usage is not organization "${scope.organizationId}"'s`,
        );
      }
      return { ...person, name };
    };
    // Proof: returning the rows unmapped made `shows removal usage under
    // organization-local names only` in
    // `directory-command-organization.controller.db.test.ts` show
    // `root-pe-a` as the assumed assignee; watched 2026-09-27.
    return { ...rows, people: rows.people.map(local), members: rows.members.map(local) };
  }

  /**
   * Proof: skipping this check in {@link localUsage} made `fails closed on a
   * directory entry a foreign project names` in
   * `directory-command-organization.controller.db.test.ts` answer 409 with
   * B's project in the usage instead of 500; watched 2026-09-27.
   *
   * @throws when any of `projectIds` is not the organization's.
   */
  private async refuseForeignProjects(
    projectIds: readonly string[],
    scope: OrganizationScope,
  ): Promise<void> {
    const outside = await this.opts.directory.projectsOutside(projectIds, scope.organizationId);
    if (outside.length > 0) {
      throw new Error(
        `a directory entry of organization "${scope.organizationId}" is named by a foreign project`,
      );
    }
  }

  /**
   * Tells every project the write touched, **after** its transaction has
   * committed.
   *
   * One event per project rather than one global one, because a project's
   * sequence is what a reconnecting client resumes from: an event outside every
   * sequence has nowhere to be replayed from and no client would ever see it
   * twice. A write touching no project announces nothing — there is nothing
   * anywhere to reread.
   *
   * After the commit, and that is the whole of it: an event published first
   * would send every listener back to read the state it was told had changed
   * and find the old one. It is `role-crud`'s timing, chosen for `role-crud`'s
   * reason — `recordEvent` opens a transaction of its own, so it cannot be
   * nested inside the write's.
   *
   * **That reason was true of a directory route and false of a directory
   * command**, and this comment asserted it either way until 2026-09-02. In a
   * batch, `PlanCommandRunner` holds one outer transaction over the whole run
   * (ADR 0007), so every publish here *was* nested inside it — as a savepoint, so
   * a command refused at step nine rolled back the recorded events for pushes
   * that had already left. And this loop ran inside the process-wide write lock,
   * one push per project in sequence, each retried for about a minute by
   * `PushClient` before it gives up.
   *
   * Inside a batch the broadcaster injected here is that batch's
   * {@link AnnouncementCollector}: these publishes are collected and leave
   * after the commit *and* after the turn, or are dropped with the rollback. Nothing about this method changed — what changed is what it
   * publishes into.
   *
   * Proof: with either publish moved ahead of its write, `records the event
   * after the write, never before it` fails — the directory read from inside
   * `publish` still held `Kat`; watched 2026-08-09.
   */
  private async announce(projectIds: TouchedProjects): Promise<void> {
    for (const projectId of projectIds) {
      await this.opts.broadcast.publish(projectId, { type: 'directory_changed' });
    }
  }
}

/** Whether anything still names a resource: a demand, a stated capacity or an occupancy. */
function isResourceInUse(rows: ResourceUsageRows): boolean {
  return rows.demands.length > 0 || rows.capacities.length > 0 || rows.occupancies > 0;
}

/**
 * The machine credentials a person removal through `scope` may revoke
 * (`wbs-machine-credentials` A24): none through a delegation or a machine
 * credential, every person's for an admin or super-admin, and for anyone else
 * only a person bound to their own account. The store applies it inside the
 * removal's transaction.
 */
export function machineCredentialReachOf(scope: OrganizationScope): MachineCredentialReach {
  if (scope.delegated === true) return { kind: 'none' };
  if (scope.role === 'admin' || scope.role === 'super_admin') return { kind: 'every' };
  return { kind: 'own', accountId: scope.userId };
}
