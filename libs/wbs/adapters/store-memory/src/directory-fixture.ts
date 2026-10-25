import type {
  Assignment,
  DirectoryCatalog,
  DirectoryCatalogRows,
  DirectoryStore,
  DirectoryUsageRows,
  ExternalSystem,
  Person,
  PersonWithTeams,
  Service,
  ServiceTeam,
  Tag,
  WorkItemType,
} from '@wbs/core';

import {
  memoryMeasureDefinitions,
  type MemoryMeasureDefinitionTables,
  memoryMeasureDefinitionTables,
} from './measure-definition-fixture';
import { type MemoryResourceTables, memoryResourceTables } from './resource-fixture';

/** The empty usage, both halves present — what this fixture can honestly say. */
const NOTHING_POINTS_AT_IT: DirectoryUsageRows = {
  workItems: [],
  projects: [],
  assignments: [],
  steps: [],
  people: [],
  members: [],
  claims: [],
  pinnedCredentials: 0,
  machineCredentials: 0,
  capacityOf: new Map(),
};

/**
 * A DirectoryStore backed by Maps, for tests that do not need SQLite.
 *
 * It keeps the guarantees the real schema enforces, because a fixture laxer
 * than production lets a test pass against behaviour that does not exist:
 * names are unique, adding an existing name returns the existing row, and one
 * work item holds at most one assignee per step.
 */
/**
 * The store it is handed, with some of its methods answered by `overrides`.
 *
 * A `Proxy` rather than an object written out method by method:
 * `DirectoryRepository`'s methods live on its prototype, so `{ ...store }`
 * copies its connection and none of them — and the two hand-written copies this
 * replaces named 13 and 6 of the interface's 27 methods, which compiled nowhere
 * until 2026-09-02. A proxy also picks up the next method the interface grows.
 */
export function directoryWith(
  base: DirectoryStore,
  overrides: Partial<DirectoryStore>,
): DirectoryStore {
  return new Proxy(base, {
    get(target, key) {
      const override = overrides[key as keyof DirectoryStore];
      if (override !== undefined) return override;
      const held: unknown = Reflect.get(target, key);
      if (typeof held !== 'function') return held;
      // Bound to the store itself: an unbound prototype method called through
      // the proxy would run with `this` as the proxy and re-enter this trap.
      // The cast is the boundary a `Proxy` trap is: its key is a `string |
      // symbol` and what stands behind it is only knowable at runtime.
      return (held as (...args: readonly unknown[]) => unknown).bind(target);
    },
  });
}

export interface MemoryDirectoryTables {
  readonly teams: Map<string, ServiceTeam>;
  readonly tags: Map<string, Tag>;
  readonly services: Map<string, Service>;
  readonly workItemTypes: Map<string, WorkItemType>;
  readonly externalSystems: Map<string, ExternalSystem>;
  readonly people: Map<string, Person>;
  readonly memberships: Map<string, Set<string>>;
  readonly owned: Map<string, Set<string>>;
  readonly assignments: Map<string, Assignment>;
  /** Which organization owns each catalog entry, by entry id, as the side tables hold it. */
  readonly organizationOf: Map<string, string>;
  /** `person.account_id`: the account bound to act as each bound person, by person id. */
  readonly accountOf: Map<string, string>;
  /**
   * `organization_membership`, as far as binding needs it: the account ids
   * that are members of each organization, by organization id. An owned person
   * binds only to a member of its organization, as SQLite's `accountMayBind`.
   */
  readonly organizationMembers: Map<string, Set<string>>;
  /**
   * `external_identity.person_id`: the person each pinned credential may claim
   * as, keyed by {@link credentialKey}. Nothing in this package writes it; a
   * test that needs a pinned credential sets it, as `link-credential-cli.ts`
   * is SQLite's only writer.
   */
  readonly credentialPins: Map<string, string>;
  /** The resources and what plans state about them (`wbs-resources`). */
  readonly resources: MemoryResourceTables;
  /** The organizations and their measure definitions (`wbs-measure-budgets`). */
  readonly measureDefinitions: MemoryMeasureDefinitionTables;
}

/** The {@link MemoryDirectoryTables.credentialPins} key of one `(issuer, subject)`. */
export function credentialKey(issuer: string, subject: string): string {
  return JSON.stringify([issuer, subject]);
}

export function memoryDirectoryTables(): MemoryDirectoryTables {
  return {
    teams: new Map(),
    tags: new Map(),
    services: new Map(),
    workItemTypes: new Map(),
    externalSystems: new Map([
      ['sys-jira-issue', { id: 'sys-jira-issue', name: 'jira-issue' }],
      ['sys-github-pr', { id: 'sys-github-pr', name: 'github-pr' }],
      ['sys-github-issue', { id: 'sys-github-issue', name: 'github-issue' }],
      ['sys-confluence-page', { id: 'sys-confluence-page', name: 'confluence-page' }],
      ['sys-slack-message', { id: 'sys-slack-message', name: 'slack-message' }],
    ]),
    people: new Map(),
    memberships: new Map(),
    owned: new Map(),
    assignments: new Map(),
    organizationOf: new Map(),
    accountOf: new Map(),
    organizationMembers: new Map(),
    credentialPins: new Map(),
    resources: memoryResourceTables(),
    measureDefinitions: memoryMeasureDefinitionTables(),
  };
}

/**
 * `accounts` are the account ids `patchPerson.accountId` may bind to; a
 * directory built without them refuses every binding by throwing, because it
 * cannot tell an unknown account from a known one.
 */
export function inMemoryDirectory(
  readProject?: (projectId: string) => Promise<readonly { id: string }[]>,
  tables: MemoryDirectoryTables = memoryDirectoryTables(),
  accounts?: Pick<ReadonlyMap<string, unknown>, 'has'>,
): DirectoryStore {
  const {
    teams,
    tags,
    services,
    workItemTypes,
    externalSystems,
    people,
    memberships,
    owned,
    assignments,
    organizationOf,
    accountOf,
    organizationMembers,
    credentialPins,
    resources: resourceTables,
  } = tables;
  /** The {@link credentialKey}s of the credentials pinned to one person. */
  const pinsOf = (personId: string) =>
    [...credentialPins].filter(([, pinned]) => pinned === personId).map(([pair]) => pair);
  /** The ownership map, by team — `memberships`' shape, one dimension over. */
  const key = (workItemId: string, stepId: string) => `${workItemId}::${stepId}`;
  /**
   * Every stamp this store was handed, in call order, so a service test can
   * assert who wrote and when without a database to read audit columns from.
   */

  const store: DirectoryStore = {
    ...memoryMeasureDefinitions(tables.measureDefinitions),
    // Organization-local writes exist only over SQLite, where the ownership
    // side tables and their freeze live; the in-memory directory models the
    // mapping for reads alone.
    mapInOrganization() {
      return Promise.reject(new Error('the in-memory directory has no organization-local writes'));
    },
    renameInOrganization() {
      return Promise.reject(new Error('the in-memory directory has no organization-local writes'));
    },
    foreignReferencesTo() {
      return Promise.reject(new Error('the in-memory directory has no project ownership'));
    },
    projectsOutside() {
      return Promise.reject(new Error('the in-memory directory has no project ownership'));
    },
    async listInOrganization(catalog, organizationId) {
      const inOrganization = (id: string) => organizationOf.get(id) === organizationId;
      const refuseForeign = (ids: readonly string[]) => {
        if (!ids.every(inOrganization)) {
          throw new Error(`a directory link of organization "${organizationId}" is foreign`);
        }
      };
      const readers: {
        [K in DirectoryCatalog]: () => Promise<DirectoryCatalogRows[K]>;
      } = {
        people: async () => {
          const people = (await store.listPeople()).filter((each) => inOrganization(each.id));
          for (const each of people) refuseForeign(each.teamIds);
          return people;
        },
        teams: async () => {
          const held = (await store.listTeams()).filter((each) => inOrganization(each.id));
          for (const each of held) refuseForeign(each.serviceIds);
          return held;
        },
        services: async () =>
          (await store.listServices()).filter((each) => inOrganization(each.id)),
        tags: async () => (await store.listTags()).filter((each) => inOrganization(each.id)),
        workItemTypes: async () =>
          (await store.listWorkItemTypes()).filter((each) => inOrganization(each.id)),
        externalSystems: async () =>
          (await store.listExternalSystems()).filter((each) => inOrganization(each.id)),
        resources: async () =>
          (await store.listResources()).filter((each) => inOrganization(each.id)),
      };
      return readers[catalog]();
    },
    listResources: () =>
      Promise.resolve(
        [...resourceTables.resources.values()].sort((a, b) => a.name.localeCompare(b.name)),
      ),
    // Refused by name, as the repository is at its unique index: a resource
    // create is not idempotent, because the row holding the name may carry
    // another kind and unit.
    addResource(toAdd, _stamp) {
      const held = [...resourceTables.resources.values()].some((each) => each.name === toAdd.name);
      if (held) return Promise.resolve({ ok: false, reason: 'taken' });
      resourceTables.resources.set(toAdd.id, { ...toAdd });
      return Promise.resolve({ ok: true, resource: { ...toAdd } });
    },
    // The projects a demand sits in are not known to these Maps, which hold no
    // work items; the bound source answers them (`memory-stores.ts`).
    patchResource(resourceId, patch, _stamp) {
      const found = resourceTables.resources.get(resourceId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      const held =
        patch.name !== undefined &&
        [...resourceTables.resources.values()].some(
          (each) => each.name === patch.name && each.id !== resourceId,
        );
      if (held) return Promise.resolve({ ok: false, reason: 'taken' });
      const patched = { ...found, ...patch };
      resourceTables.resources.set(resourceId, patched);
      const projectIds = [
        ...new Set(
          [...resourceTables.capacities.values()]
            .filter((each) => each.resourceId === resourceId)
            .map((each) => each.projectId),
        ),
      ].sort();
      return Promise.resolve({ ok: true, resource: { ...patched }, projectIds });
    },
    // The memory twin holds no provider instance (compute providers are
    // SQLite's alone), so every id is unknown and only clearing succeeds.
    setResourceProvider(resourceId, providerId, _organizationId, _stamp) {
      if (!resourceTables.resources.has(resourceId))
        return Promise.resolve({ ok: false, reason: 'not_found' });
      if (providerId !== null) return Promise.resolve({ ok: false, reason: 'unknown_provider' });
      const projectIds = [
        ...new Set(
          [...resourceTables.capacities.values()]
            .filter((each) => each.resourceId === resourceId)
            .map((each) => each.projectId),
        ),
      ].sort();
      return Promise.resolve({ ok: true, projectIds });
    },
    directoryCapacitiesOf(resourceIds) {
      return Promise.resolve(
        [...new Set(resourceIds)]
          .flatMap((resourceId) => {
            const units = resourceTables.directoryCapacities.get(resourceId);
            return units === undefined ? [] : [{ resourceId, units }];
          })
          .sort((left, right) => (left.resourceId < right.resourceId ? -1 : 1)),
      );
    },
    // SQLite's twin: the resource's organization is its ownership row, and the
    // audit row SQLite appends is kept in `directoryCapacityAudit`. The
    // projects a demand sits in are the bound source's (`memory-stores.ts`).
    setDirectoryCapacity(resourceId, units, act) {
      if (!resourceTables.resources.has(resourceId))
        return Promise.resolve({ ok: false, reason: 'not_found' });
      const organizationId = organizationOf.get(resourceId);
      if (organizationId === undefined)
        return Promise.resolve({ ok: false, reason: 'organization_required' });
      const before = resourceTables.directoryCapacities.get(resourceId) ?? null;
      if (units === null) resourceTables.directoryCapacities.delete(resourceId);
      else resourceTables.directoryCapacities.set(resourceId, units);
      resourceTables.directoryCapacityAudit.push({
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        resourceId,
        before,
        after: units,
      });
      const projectIds = [
        ...new Set(
          [...resourceTables.capacities.values()]
            .filter((each) => each.resourceId === resourceId)
            .map((each) => each.projectId),
        ),
      ].sort();
      return Promise.resolve({ ok: true, before, after: units, organizationId, projectIds });
    },
    // The counts are the tables' own; the rows naming a demand's project are
    // not, for `usageOfTag`'s reason, and the bound source answers them.
    usageOfResource: (resourceId) => Promise.resolve(resourceUsageOf(resourceTables, resourceId)),
    removeResource(resourceId, cascade, _stamp) {
      if (!resourceTables.resources.has(resourceId))
        return Promise.resolve({ ok: false, reason: 'not_found' });
      const usage = resourceUsageOf(resourceTables, resourceId);
      // Proof: with the directory capacity left out of this test, the memory
      // twin of `refuses removing a resource with a stated directory capacity,
      // counting it` (directory-capacity-command.test.ts) removed it; watched 2026-10-25.
      if (
        !cascade &&
        (usage.demands.length > 0 ||
          usage.capacities.length > 0 ||
          usage.directoryCapacity !== null)
      )
        return Promise.resolve({ ok: false, reason: 'in_use', usage });
      resourceTables.directoryCapacities.delete(resourceId);
      for (const [key, each] of resourceTables.demands)
        if (each.resourceId === resourceId) resourceTables.demands.delete(key);
      for (const [key, each] of resourceTables.capacities)
        if (each.resourceId === resourceId) resourceTables.capacities.delete(key);
      resourceTables.resources.delete(resourceId);
      return Promise.resolve({
        ok: true,
        removal: {
          workItemIds: [...new Set(usage.demands.map((each) => each.workItemId))],
          projectIds: [...new Set(usage.capacities.map((each) => each.projectId))].sort(),
        },
      });
    },
    listTeams: () =>
      Promise.resolve(
        [...teams.values()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((each) => ({ ...each, serviceIds: [...(owned.get(each.id) ?? [])].sort() })),
      ),
    listTags: () =>
      Promise.resolve([...tags.values()].sort((a, b) => a.name.localeCompare(b.name))),
    // Idempotent by name, as the repository is at its unique index. The
    // dimension has no cascade here and cannot: an in-memory store models no
    // foreign keys, which is exactly why the tag write path's own tests run
    // against real SQLite instead of this.
    addTag(toAdd, _stamp) {
      const already = [...tags.values()].find((each) => each.name === toAdd.name);
      if (already !== undefined) return Promise.resolve(already);
      tags.set(toAdd.id, toAdd);
      return Promise.resolve(toAdd);
    },
    renameTag(tagId, name, _stamp) {
      const found = tags.get(tagId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      // The unique index, modelled, for `renameTeam`'s reason: a fixture that
      // let two `regulatory` tags exist would let a caller's `taken` branch pass
      // untested.
      const held = [...tags.values()].some((each) => each.name === name && each.id !== tagId);
      if (held) return Promise.resolve({ ok: false, reason: 'taken' });
      const renamed = { id: tagId, name };
      tags.set(tagId, renamed);
      return Promise.resolve({ ok: true, tag: renamed, projectIds: [] });
    },
    // The usage and the removal are **not** modelled here beyond the shape.
    // This store has no work items and no foreign keys, so the counting that
    // decides a removal and the cascade that performs it cannot exist in it —
    // which is exactly why the tag directory's own tests run against real
    // SQLite. A fixture answering "nothing points at it" would let a caller's
    // `in_use` branch pass untested, so it answers the empty usage and says so.
    usageOfTag: () =>
      Promise.resolve({
        workItems: [],
        projects: [],
        assignments: [],
        steps: [],
        people: [],
        claims: [],
        members: [],
        pinnedCredentials: 0,
        machineCredentials: 0,
        capacityOf: new Map<string, number>(),
      }),
    // Seeded, as the migration seeds the real table: `systemOfUrl` can answer
    // these names, so a fake that answered an empty list would let a ref write
    // fail here for a reason the real store does not have.
    listExternalSystems: () =>
      Promise.resolve([...externalSystems.values()].sort((a, b) => a.name.localeCompare(b.name))),
    addExternalSystem(toAdd, _stamp) {
      const already = [...externalSystems.values()].find((each) => each.name === toAdd.name);
      if (already !== undefined) return Promise.resolve(already);
      externalSystems.set(toAdd.id, toAdd);
      return Promise.resolve(toAdd);
    },
    removeTag(tagId, _cascade, _stamp) {
      const found = tags.get(tagId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      tags.delete(tagId);
      return Promise.resolve({ ok: true, removal: { workItemIds: [], projectIds: [] } });
    },
    listWorkItemTypes: () =>
      Promise.resolve([...workItemTypes.values()].sort((a, b) => a.name.localeCompare(b.name))),
    // `addTag`'s shape and its caveat: idempotent by name as the repository is at
    // its unique index, with no cascade, because an in-memory store models no
    // foreign keys. The type write path's own tests run against real SQLite.
    addWorkItemType(toAdd, _stamp) {
      const already = [...workItemTypes.values()].find((each) => each.name === toAdd.name);
      if (already !== undefined) return Promise.resolve(already);
      workItemTypes.set(toAdd.id, toAdd);
      return Promise.resolve(toAdd);
    },
    renameWorkItemType(typeId, name, _stamp) {
      const found = workItemTypes.get(typeId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      // The unique index, modelled, for `renameTag`'s reason: a fixture that let
      // two `Bug` types exist would let a caller's `taken` branch pass untested.
      const held = [...workItemTypes.values()].some(
        (each) => each.name === name && each.id !== typeId,
      );
      if (held) return Promise.resolve({ ok: false, reason: 'taken' });
      const renamed = { id: typeId, name };
      workItemTypes.set(typeId, renamed);
      return Promise.resolve({ ok: true, workItemType: renamed, projectIds: [] });
    },
    // Not modelled beyond the shape, for `usageOfTag`'s reason exactly: no work
    // items and no foreign keys here, so the counting that decides a removal
    // cannot exist in this store.
    usageOfWorkItemType: () =>
      Promise.resolve({
        workItems: [],
        projects: [],
        assignments: [],
        steps: [],
        people: [],
        claims: [],
        members: [],
        pinnedCredentials: 0,
        machineCredentials: 0,
        capacityOf: new Map<string, number>(),
      }),
    removeWorkItemType(typeId, _cascade, _stamp) {
      const found = workItemTypes.get(typeId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      workItemTypes.delete(typeId);
      return Promise.resolve({ ok: true, removal: { workItemIds: [], projectIds: [] } });
    },
    listServices: () =>
      Promise.resolve([...services.values()].sort((a, b) => a.name.localeCompare(b.name))),
    // Idempotent by name, as the repository is at its unique index — `addTag`'s
    // rule and its reason.
    addService(toAdd, _stamp) {
      const already = [...services.values()].find((each) => each.name === toAdd.name);
      if (already !== undefined) return Promise.resolve(already);
      services.set(toAdd.id, toAdd);
      return Promise.resolve(toAdd);
    },
    renameService(serviceId, name, _stamp) {
      const found = services.get(serviceId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      const held = [...services.values()].some(
        (each) => each.name === name && each.id !== serviceId,
      );
      if (held) return Promise.resolve({ ok: false, reason: 'taken' });
      const renamed = { id: serviceId, name };
      services.set(serviceId, renamed);
      return Promise.resolve({ ok: true, service: renamed, projectIds: [] });
    },
    // Not modelled beyond the shape, for `usageOfTag`'s reason: this store holds
    // no work items and no foreign keys, so neither the count that decides a
    // removal nor the `ON DELETE SET NULL` that performs it can exist in it.
    // Every behavioural claim about removing a service is asserted against real
    // SQLite in `service/directory.service.test.ts`.
    usageOfService: () => Promise.resolve(NOTHING_POINTS_AT_IT),
    removeService(serviceId, _cascade, _stamp) {
      if (!services.has(serviceId)) return Promise.resolve({ ok: false, reason: 'not_found' });
      services.delete(serviceId);
      return Promise.resolve({ ok: true, removal: { workItemIds: [], projectIds: [] } });
    },
    addTeam(team, _stamp) {
      const already = [...teams.values()].find((each) => each.name === team.name);
      if (already !== undefined) return Promise.resolve(already);
      teams.set(team.id, team);
      return Promise.resolve(team);
    },
    patchTeam(teamId, patch, _stamp) {
      const found = teams.get(teamId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      // The unique index, modelled: a fixture that let two `Platform`s exist
      // would let a caller's `taken` branch pass untested.
      const held =
        patch.name !== undefined &&
        [...teams.values()].some((each) => each.name === patch.name && each.id !== teamId);
      if (held) return Promise.resolve({ ok: false, reason: 'taken' });
      // The foreign key, modelled, for the same reason: a fixture that accepted
      // an ownership row about a service nothing holds would let a caller's
      // `unknown_service` branch — and the 404 above it — pass untested. This is
      // the strictness `unknown_team` already has one dimension over.
      if (patch.serviceIds !== undefined) {
        const unknown = patch.serviceIds.some((each) => !services.has(each));
        if (unknown) return Promise.resolve({ ok: false, reason: 'unknown_service' });
      }
      const renamed = patch.name === undefined ? found : { ...found, name: patch.name };
      teams.set(teamId, renamed);
      // Whole-set replacement, exactly as the repository writes it: absent
      // leaves the map alone, empty clears it.
      if (patch.serviceIds !== undefined) owned.set(teamId, new Set(patch.serviceIds));
      // No project here to touch: these Maps hold no work items, so the
      // fixture can only ever honestly report the empty set.
      return Promise.resolve({
        ok: true,
        team: { ...renamed, serviceIds: [...(owned.get(teamId) ?? [])].sort() },
        projectIds: [],
      });
    },
    listPeople: () =>
      Promise.resolve(
        [...people.values()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((each): PersonWithTeams => ({
            ...each,
            teamIds: [...(memberships.get(each.id) ?? [])],
            accountId: accountOf.get(each.id) ?? null,
          })),
      ),
    addPerson(toAdd, teamIds, _stamp) {
      // The teams are checked before anything is written, as production checks
      // them inside the create's own transaction: `person_team` has a foreign
      // key, so a fixture that wrote a dead membership would be laxer than the
      // schema it stands for.
      if (teamIds.some((each) => !teams.has(each))) {
        return Promise.resolve({ ok: false, reason: 'unknown_team' });
      }
      // The column's `DEFAULT 'person'` applied here rather than left off, because
      // the fixture stands for the table: SQLite cannot hold a person without a
      // kind, so a fixture that stored `toAdd` unchanged would hand every reader
      // above it a row shape the database never produces.
      const stored: Person = { ...toAdd, kind: toAdd.kind ?? 'person' };
      const already = [...people.values()].find((each) => each.name === toAdd.name);
      const kept = already ?? stored;
      if (already === undefined) people.set(stored.id, stored);
      if (teamIds.length > 0) {
        memberships.set(kept.id, new Set([...(memberships.get(kept.id) ?? []), ...teamIds]));
      }
      return Promise.resolve({ ok: true, person: kept });
    },
    patchPerson(personId, patch, _stamp) {
      const found = people.get(personId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      const wanted = patch.teamIds === undefined ? null : [...new Set(patch.teamIds)];
      // Validated before either write, as production is: a fixture that wrote
      // the name first would let a half-applied patch pass here and fail there.
      if (wanted?.some((each) => !teams.has(each)) === true) {
        return Promise.resolve({ ok: false, reason: 'unknown_team' });
      }
      if (typeof patch.accountId === 'string') {
        const owner = organizationOf.get(personId);
        // An owned person binds to a member of its organization; an unowned one
        // to any account, which only a directory built with accounts can tell.
        // Proof: the membership read replaced with `true` made the conformance
        // case `directory.patchPerson:owned-binding` bind the non-member
        // (watched 2026-10-20).
        if (owner !== undefined) {
          if (organizationMembers.get(owner)?.has(patch.accountId) !== true)
            return Promise.resolve({ ok: false, reason: 'unknown_account' });
        } else {
          if (accounts === undefined)
            return Promise.reject(new Error('this in-memory directory was built without accounts'));
          if (!accounts.has(patch.accountId))
            return Promise.resolve({ ok: false, reason: 'unknown_account' });
        }
      }
      if (patch.name !== undefined) {
        const held = [...people.values()].some(
          (each) => each.name === patch.name && each.id !== personId,
        );
        if (held) return Promise.resolve({ ok: false, reason: 'taken' });
        people.set(personId, { ...found, name: patch.name });
      }
      // After the rename and off the row as it stands, so a patch carrying both
      // does not lose one: `found` is the row from before the line above.
      if (patch.kind !== undefined) {
        const current = people.get(personId) ?? found;
        people.set(personId, { ...current, kind: patch.kind });
      }
      if (wanted !== null) memberships.set(personId, new Set(wanted));
      if (patch.accountId === null) accountOf.delete(personId);
      if (typeof patch.accountId === 'string') accountOf.set(personId, patch.accountId);
      const patched = people.get(personId);
      if (patched === undefined) throw new Error(`person vanished mid-patch: ${personId}`);
      return Promise.resolve({
        ok: true,
        person: {
          ...patched,
          teamIds: [...(memberships.get(personId) ?? [])],
          accountId: accountOf.get(personId) ?? null,
        },
        projectIds: [],
      });
    },
    boundAccountOf(personId) {
      if (!people.has(personId))
        return Promise.reject(new Error(`no person "${personId}" to read the binding of`));
      return Promise.resolve(accountOf.get(personId) ?? null);
    },
    credentialPinOf(issuer, subject) {
      return Promise.resolve(credentialPins.get(credentialKey(issuer, subject)) ?? null);
    },
    // The four removal methods model only what an array can: a person or team
    // this fixture holds, and the rows it holds about them. **Nothing here
    // models the usage a refusal names** — that needs a project, its tree and
    // the numbers derived from it, none of which exist in these Maps. A fixture
    // answering them would be a second implementation of the rule under test,
    // so every behavioural claim about a removal is asserted against real
    // SQLite in `service/directory.service.test.ts`, the same call
    // `step-fixture.ts` makes for the same reason. That is also why every
    // removal here but `removePerson` names `cascade` and never reads it: with
    // no usage to find, there is nothing for it to decide about. A person's
    // pinned credentials are the exception, because the pins are this
    // fixture's own rows and name no project.
    // The pins are this fixture's own rows, so it counts them as SQLite does.
    usageOfPerson: (personId) =>
      Promise.resolve({ ...NOTHING_POINTS_AT_IT, pinnedCredentials: pinsOf(personId).length }),
    usageOfTeam: (teamId) =>
      Promise.resolve({
        ...NOTHING_POINTS_AT_IT,
        members: [...people.values()].filter((each) => memberships.get(each.id)?.has(teamId)),
      }),
    removePerson(personId, cascade, _stamp) {
      if (!people.has(personId)) return Promise.resolve({ ok: false, reason: 'not_found' });
      const pinned = pinsOf(personId);
      // Proof: with this refusal removed, the memory certification's
      // `directory.removePerson:pinned-credential` case removed the person
      // unconfirmed; with the revoking loop below removed, the pin outlived its
      // person (both watched 2026-10-20).
      if (!cascade && pinned.length > 0)
        return Promise.resolve({
          ok: false,
          reason: 'in_use',
          usage: { ...NOTHING_POINTS_AT_IT, pinnedCredentials: pinned.length },
        });
      // Revoked with the person, as SQLite deletes the `external_identity` rows.
      for (const each of pinned) credentialPins.delete(each);
      const held = [...assignments.values()].filter((each) => each.personId === personId);
      for (const each of held) assignments.delete(key(each.workItemId, each.stepId));
      memberships.delete(personId);
      // The binding is a column of the removed row.
      accountOf.delete(personId);
      people.delete(personId);
      return Promise.resolve({
        ok: true,
        removal: { workItemIds: held.map((each) => each.workItemId), projectIds: [] },
      });
    },
    removeTeam(teamId, _cascade, _stamp) {
      if (!teams.has(teamId)) return Promise.resolve({ ok: false, reason: 'not_found' });
      for (const held of memberships.values()) held.delete(teamId);
      teams.delete(teamId);
      return Promise.resolve({ ok: true, removal: { workItemIds: [], projectIds: [] } });
    },
    // Proof: removing the project filter made `names only the people assigned
    // in the requested project` receive grace alongside the requested ada.
    async assignmentsInProject(projectId) {
      if (readProject === undefined)
        throw new Error('project assignment reads require a work-item store');
      const wanted = new Set((await readProject(projectId)).map((row) => row.id));
      const assigned = [...assignments.values()].filter((each) => wanted.has(each.workItemId));
      const named = [...new Set(assigned.map((each) => each.personId))].map((id) => {
        const found = people.get(id);
        if (found === undefined) throw new Error(`assignment names absent person ${id}`);
        return { id, name: found.name };
      });
      return {
        assignments: assigned,
        people: named.sort((left, right) => left.name.localeCompare(right.name)),
      };
    },
    namesOf(catalog, ids) {
      const held = catalog === 'people' ? people : teams;
      return Promise.resolve(
        [...new Set(ids)].flatMap((id) => {
          const found = held.get(id);
          return found === undefined ? [] : [{ id, name: found.name }];
        }),
      );
    },
    assignmentsFor(workItemId) {
      return Promise.resolve(
        [...assignments.values()].filter((each) => each.workItemId === workItemId),
      );
    },
    assignmentsOf(workItemIds) {
      const wanted = new Set(workItemIds);
      return Promise.resolve([...assignments.values()].filter((a) => wanted.has(a.workItemId)));
    },
    assign(workItemId, stepId, personId, _stamp) {
      // The person is checked here because production checks it inside the
      // write's own transaction: a fixture that wrote an assignment naming
      // nobody would let a caller's `unknown_person` branch pass untested.
      if (personId !== null && !people.has(personId)) {
        return Promise.resolve({ ok: false, reason: 'unknown_person' });
      }
      if (personId === null) assignments.delete(key(workItemId, stepId));
      else assignments.set(key(workItemId, stepId), { workItemId, stepId, personId });
      return Promise.resolve({ ok: true });
    },
  };
  return store;
}

/** What names one resource in the memory tables; occupancies are 0 until claims hold units. */
function resourceUsageOf(tables: MemoryResourceTables, resourceId: string) {
  return {
    rows: NOTHING_POINTS_AT_IT,
    demands: [...tables.demands.values()]
      .filter((each) => each.resourceId === resourceId)
      .sort((left, right) => left.workItemId.localeCompare(right.workItemId)),
    capacities: [...tables.capacities.values()]
      .filter((each) => each.resourceId === resourceId)
      .map(({ projectId, units }) => ({ projectId, units }))
      .sort((left, right) => left.projectId.localeCompare(right.projectId)),
    occupancies: 0,
    // The memory twin holds no provider instance (`compute-providers` P3).
    providerId: null,
    directoryCapacity: tables.directoryCapacities.get(resourceId) ?? null,
  };
}
