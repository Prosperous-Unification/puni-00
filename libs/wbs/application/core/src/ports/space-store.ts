import type { WriteStamp } from './write-stamp';

/**
 * An organizational unit containing ordered projects and linked people/teams
 * (ADR 0063). A project belongs to one space or none; deleting a space detaches it.
 *
 * `revision` counts every write to the space or its membership, so a reader
 * holding an older revision knows its rows are stale.
 */
export interface Space {
  id: string;
  organizationId: string;
  name: string;
  revision: number;
  /** The author, from the `created_by` audit column. */
  createdBy: string;
  createdAt: number;
}

/** One project's place in one space. */
export interface SpaceMember {
  projectId: string;
  position: number;
}

/** Detached header and memberships from one committed observation, or the caller's staged loan. */
export interface SpaceContents {
  readonly space: Space;
  readonly projects: readonly SpaceMember[];
  readonly personIds: readonly string[];
  readonly serviceTeamIds: readonly string[];
}

/**
 * A space write's decision.
 *
 * `not_found` covers an absent space and another organization's space alike,
 * so the caller cannot learn a foreign space exists. `name_taken` means the
 * organization already holds a space of that name, and nothing was written.
 */
export type SpaceWritten =
  { ok: true; space: Space } | { ok: false; reason: 'not_found' | 'name_taken' };

/**
 * A membership write's decision: the member's position, or why nothing was
 * written. `not_found` covers the space, a work package the organization does not
 * own, and an `afterProjectId` that is not a member.
 */
export type MembershipWritten =
  | { ok: true; position: number }
  | { ok: false; reason: 'not_found' | 'already_in_space' }
  | { ok: false; reason: 'project_in_other_space'; spaceId: string };

/**
 * An organization's spaces and their membership (`add-spaces`, design D2).
 *
 * **Every method is scoped by `organizationId` in its query**, which is what
 * makes a foreign space answer `not_found` a property of the read rather than
 * of a caller remembering to compare. The store knows nothing of access, roles
 * or which work packages a caller may open; those belong to the resource, which
 * filters members through the work package routes' own predicate.
 *
 * Refusals are typed answers, never thrown constraint errors. A thrown error
 * is a fault: an unknown organization, or storage failing.
 */
export interface SpaceStore {
  /**
   * The organization marked legacy, which owns every named space under legacy
   * access (design memo §2, spec `space-authorization`); null when none
   * exists, which the resource answers `409 organization_required`.
   */
  legacyOrganizationId(): Promise<string | null>;
  /** The organization's spaces, ordered by `(name, id)`. */
  listIn(organizationId: string): Promise<Space[]>;
  findIn(organizationId: string, spaceId: string): Promise<Space | null>;
  /** Header and all membership kinds from the same snapshot; null conceals absent or foreign spaces. */
  readContents(organizationId: string, spaceId: string): Promise<SpaceContents | null>;
  /** Stores a new space at revision 0 authored by `stamp.by`. */
  create(
    space: Pick<Space, 'id' | 'organizationId' | 'name'>,
    stamp: WriteStamp,
  ): Promise<SpaceWritten>;
  rename(
    organizationId: string,
    spaceId: string,
    name: string,
    stamp: WriteStamp,
  ): Promise<SpaceWritten>;
  /** Deletes the space and its membership; no work package changes. False when absent. */
  remove(organizationId: string, spaceId: string, stamp: WriteStamp): Promise<boolean>;
  /**
   * The members in display order: `position`, ties by `projectId` (ADR 0016's
   * rule, so two reads of unchanged rows agree). Null when the space is absent.
   */
  membersOf(organizationId: string, spaceId: string): Promise<SpaceMember[] | null>;
  /**
   * Every space's members in the organization, in {@link membersOf}'s order,
   * in one read: the space list counts them without one read per space. A
   * space with no member is absent from the map.
   */
  membersIn(organizationId: string): Promise<Map<string, SpaceMember[]>>;
  /**
   * Adds a work package the organization owns after `afterProjectId`, or first on
   * null, by `placeAfter`; a respace rewrites the group in the same write.
   */
  addProject(
    organizationId: string,
    spaceId: string,
    projectId: string,
    afterProjectId: string | null,
    stamp: WriteStamp,
  ): Promise<MembershipWritten>;
  /** False when the space or the member is absent. */
  removeProject(
    organizationId: string,
    spaceId: string,
    projectId: string,
    stamp: WriteStamp,
  ): Promise<boolean>;
  /** Moves a member after `afterProjectId`, or first on null. */
  moveProject(
    organizationId: string,
    spaceId: string,
    projectId: string,
    afterProjectId: string | null,
    stamp: WriteStamp,
  ): Promise<MembershipWritten>;
  peopleOf(organizationId: string, spaceId: string): Promise<readonly string[] | null>;
  teamsOf(organizationId: string, spaceId: string): Promise<readonly string[] | null>;
  addPerson(
    organizationId: string,
    spaceId: string,
    personId: string,
    stamp: WriteStamp,
  ): Promise<boolean>;
  removePerson(
    organizationId: string,
    spaceId: string,
    personId: string,
    stamp: WriteStamp,
  ): Promise<boolean>;
  addTeam(
    organizationId: string,
    spaceId: string,
    serviceTeamId: string,
    stamp: WriteStamp,
  ): Promise<boolean>;
  removeTeam(
    organizationId: string,
    spaceId: string,
    serviceTeamId: string,
    stamp: WriteStamp,
  ): Promise<boolean>;
}

/** Keeps every asynchronous space operation within its Source or borrowed loan, including continuations. */
export function guardSpaceStore(store: SpaceStore, assertOpen: () => void): SpaceStore;
export function guardSpaceStore(
  store: SpaceStore | undefined,
  assertOpen: () => void,
): SpaceStore | undefined;
export function guardSpaceStore(
  store: SpaceStore | undefined,
  assertOpen: () => void,
): SpaceStore | undefined {
  if (store === undefined) return undefined;
  return new Proxy(store, {
    get(target, key, receiver) {
      const operation: unknown = Reflect.get(target, key, receiver);
      if (typeof operation !== 'function') return operation;
      // SpaceStore's protocol contains only Promise operations; preserve their repository receiver at this dynamic boundary.
      return async (...args: unknown[]): Promise<unknown> => {
        // Proof: omitting entry allowed a closed actual Memory Source to store a membership before rejecting (space-membership-fault-entry-v1).
        assertOpen();
        const value: unknown = await Reflect.apply(operation, target, args);
        // Proof: omitting continuation returned captured contents after actual Source closure (space-membership-fault-continuation-v1).
        assertOpen();
        return value;
      };
    },
  });
}
